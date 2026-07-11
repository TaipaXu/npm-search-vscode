import { gunzipSync } from 'node:zlib';
import { TtlLruCache } from '../cache';
import {
    renderPackageDownloads,
    renderPackageHistory,
    renderPackagePage,
    renderPackageReadme,
} from '../packagePage';
import request, { type RequestResponse } from '../request';

const REGISTRY_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const REGISTRY_PACKAGE_URL = 'https://registry.npmjs.org/';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point';

const LATEST_CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const README_CACHE_TTL_MS = 30 * 60 * 1000;
const DOWNLOAD_CACHE_TTL_MS = 5 * 60 * 1000;

interface Params {
    key: string | undefined;
    currentPage: number;
    perPage: number;
}

interface RequestOptions {
    signal?: AbortSignal;
}

export interface NpmSearchResponse {
    objects: NpmSearchItem[];
    total?: number;
}

export interface NpmSearchItem {
    package: NpmPackage;
}

export interface NpmPackage {
    date?: string | { rel?: string };
    description?: string;
    name: string;
    version?: string;
}

export interface Person {
    email?: string;
    name?: string;
    username?: string;
}

export interface Repository {
    directory?: string;
    type?: string;
    url?: string;
}

export interface PackageVersion {
    author?: Person | string;
    bugs?: { url?: string } | string;
    dependencies?: Record<string, string>;
    deprecated?: string;
    description?: string;
    devDependencies?: Record<string, string>;
    dist?: {
        fileCount?: number;
        tarball?: string;
        unpackedSize?: number;
    };
    engines?: Record<string, string>;
    homepage?: string;
    keywords?: string[];
    license?: string | { type?: string; url?: string };
    maintainers?: Person[];
    name: string;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    readme?: string;
    repository?: Repository | string;
    version: string;
}

export interface PackageMetadata {
    author?: Person | string;
    bugs?: { url?: string } | string;
    description?: string;
    'dist-tags'?: Record<string, string>;
    homepage?: string;
    keywords?: string[];
    license?: string | { type?: string; url?: string };
    maintainers?: Person[];
    name: string;
    readme?: string;
    repository?: Repository | string;
    time?: Record<string, string>;
    versions?: Record<string, PackageVersion>;
}

export interface DownloadPoint {
    downloads?: number;
    end?: string;
    package?: string;
    start?: string;
}

const latestCache = new TtlLruCache<string, RequestResponse<PackageVersion>>(
    100,
    LATEST_CACHE_TTL_MS,
);
// Full packuments can be several megabytes, so keep this cache deliberately small.
const metadataCache = new TtlLruCache<string, RequestResponse<PackageMetadata>>(
    12,
    METADATA_CACHE_TTL_MS,
);
const readmeCache = new TtlLruCache<string, string>(50, README_CACHE_TTL_MS);
const downloadCache = new TtlLruCache<string, DownloadPoint>(100, DOWNLOAD_CACHE_TTL_MS);

const getPackageMetadataUrl = (packageName: string): string =>
    `${REGISTRY_PACKAGE_URL}${encodeURIComponent(packageName)}`;

const getLatestPackageUrl = (packageName: string): string =>
    `${getPackageMetadataUrl(packageName)}/latest`;

const getDownloadsUrl = (period: 'last-month' | 'last-week', packageName: string): string =>
    `${DOWNLOADS_URL}/${period}/${encodeURIComponent(packageName)}`;

const parseTarString = (buffer: Buffer, start: number, length: number): string => {
    const value = buffer.subarray(start, start + length).toString('utf8');
    const endIndex = value.indexOf('\u0000');
    return (endIndex === -1 ? value : value.slice(0, endIndex)).trim();
};

const parseTarSize = (header: Buffer): number => {
    const size = Number.parseInt(parseTarString(header, 124, 12), 8);
    return Number.isFinite(size) ? size : 0;
};

const isZeroBlock = (header: Buffer): boolean => header.every((byte) => byte === 0);

const getReadmeScore = (path: string): number | undefined => {
    const normalizedPath = path.replace(/^package\//, '');
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.at(-1)?.toLowerCase();
    if (fileName === undefined || !/^readme(?:\.(?:md|markdown|txt|rst))?$/.test(fileName)) {
        return undefined;
    }

    return segments.length * 10 + (/\.(?:md|markdown)$/.test(fileName) ? 0 : 1);
};

const extractReadmeFromTgz = (archive: ArrayBuffer): string | undefined => {
    const buffer = gunzipSync(Buffer.from(archive));
    const candidates: Array<{ content: string; score: number }> = [];
    let offset = 0;

    while (offset + 512 <= buffer.length) {
        const header = buffer.subarray(offset, offset + 512);
        if (isZeroBlock(header)) {
            break;
        }

        const path = [parseTarString(header, 345, 155), parseTarString(header, 0, 100)]
            .filter(Boolean)
            .join('/');
        const size = parseTarSize(header);
        const contentStart = offset + 512;
        const contentEnd = contentStart + size;
        const score = getReadmeScore(path);

        if (score !== undefined && contentEnd <= buffer.length) {
            candidates.push({
                content: buffer.subarray(contentStart, contentEnd).toString('utf8'),
                score,
            });
        }

        offset = contentStart + Math.ceil(size / 512) * 512;
    }

    return candidates.sort((left, right) => left.score - right.score)[0]?.content.trim();
};

const isAbortError = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError';

const getLatestPackage = async (
    packageName: string,
    signal?: AbortSignal,
): Promise<RequestResponse<PackageVersion>> => {
    const cached = latestCache.get(packageName);
    if (cached !== undefined) {
        return cached;
    }

    const response = await request<PackageVersion>({
        url: getLatestPackageUrl(packageName),
        method: 'GET',
        signal,
    });
    latestCache.set(packageName, response);
    return response;
};

const getPackageMetadata = async (
    packageName: string,
    signal?: AbortSignal,
): Promise<RequestResponse<PackageMetadata>> => {
    const cached = metadataCache.get(packageName);
    if (cached !== undefined) {
        return cached;
    }

    const response = await request<PackageMetadata>({
        url: getPackageMetadataUrl(packageName),
        method: 'GET',
        signal,
    });
    metadataCache.set(packageName, response);
    return response;
};

const getDownloads = async (
    period: 'last-month' | 'last-week',
    packageName: string,
    signal?: AbortSignal,
): Promise<DownloadPoint | undefined> => {
    const cacheKey = `${period}:${packageName}`;
    const cached = downloadCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const response = await request<DownloadPoint>({
            url: getDownloadsUrl(period, packageName),
            method: 'GET',
            signal,
        });
        downloadCache.set(cacheKey, response.data);
        return response.data;
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return undefined;
    }
};

const getTarballReadme = async (
    tarballUrl: string | undefined,
    signal?: AbortSignal,
): Promise<string> => {
    if (tarballUrl === undefined) {
        return '';
    }

    try {
        const response = await request<ArrayBuffer>({
            url: tarballUrl,
            method: 'GET',
            responseType: 'arrayBuffer',
            signal,
        });
        return extractReadmeFromTgz(response.data) ?? '';
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return '';
    }
};

export const search = async (params: Params): Promise<RequestResponse<NpmSearchResponse>> => {
    return request<NpmSearchResponse>({
        url: REGISTRY_SEARCH_URL,
        method: 'GET',
        params: {
            text: params.key,
            from: params.currentPage * params.perPage,
            size: params.perPage,
        },
    });
};

export const getPackagePage = async (
    packageName: string,
    options: RequestOptions = {},
): Promise<RequestResponse<string>> => {
    const response = await getLatestPackage(packageName, options.signal);

    return {
        ...response,
        data: renderPackagePage({ latest: response.data }),
    };
};

export const getPackageReadme = async (
    packageName: string,
    options: RequestOptions = {},
): Promise<string> => {
    const latestResponse = await getLatestPackage(packageName, options.signal);
    const latest = latestResponse.data;
    const cacheKey = `${packageName}@${latest.version}`;
    const cached = readmeCache.get(cacheKey);
    if (cached !== undefined) {
        return renderPackageReadme(cached);
    }

    const readme =
        latest.readme?.trim() || (await getTarballReadme(latest.dist?.tarball, options.signal));
    readmeCache.set(cacheKey, readme);
    return renderPackageReadme(readme);
};

export const getPackageHistory = async (
    packageName: string,
    options: RequestOptions = {},
): Promise<string> => {
    const response = await getPackageMetadata(packageName, options.signal);
    const latestVersion = response.data['dist-tags']?.latest ?? '';
    return renderPackageHistory(response.data, latestVersion);
};

export const getPackageDownloads = async (
    packageName: string,
    options: RequestOptions = {},
): Promise<string> => {
    const [weeklyDownloads, monthlyDownloads] = await Promise.all([
        getDownloads('last-week', packageName, options.signal),
        getDownloads('last-month', packageName, options.signal),
    ]);
    return renderPackageDownloads(weeklyDownloads, monthlyDownloads);
};

export const clearPackageCaches = (): void => {
    latestCache.clear();
    metadataCache.clear();
    readmeCache.clear();
    downloadCache.clear();
};
