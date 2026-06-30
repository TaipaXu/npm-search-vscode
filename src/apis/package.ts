import { gunzipSync } from 'node:zlib';
import { renderPackagePage } from '../packagePage';
import request, { type RequestResponse } from '../request';

const REGISTRY_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const REGISTRY_PACKAGE_URL = 'https://registry.npmjs.org/';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point';

interface Params {
    key: string | undefined;
    currentPage: number;
    perPage: number;
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

const getPackageMetadataUrl = (packageName: string): string =>
    `${REGISTRY_PACKAGE_URL}${encodeURIComponent(packageName)}`;

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

const getLatestVersion = (metadata: PackageMetadata): PackageVersion => {
    const latestTag = metadata['dist-tags']?.latest;
    const latest = latestTag === undefined ? undefined : metadata.versions?.[latestTag];
    if (latest !== undefined) {
        return latest;
    }

    const latestPublishedVersion = Object.entries(metadata.time ?? {})
        .filter(([version]) => version !== 'created' && version !== 'modified')
        .sort((left, right) => new Date(right[1]).getTime() - new Date(left[1]).getTime())
        .find(([version]) => metadata.versions?.[version] !== undefined)?.[0];
    const fallback = latestPublishedVersion
        ? metadata.versions?.[latestPublishedVersion]
        : Object.values(metadata.versions ?? {}).at(-1);

    if (fallback === undefined) {
        throw new Error(`Unable to find package version for ${metadata.name}.`);
    }

    return fallback;
};

const getDownloads = async (
    period: 'last-month' | 'last-week',
    packageName: string,
): Promise<DownloadPoint | undefined> => {
    try {
        const response = await request<DownloadPoint>({
            url: getDownloadsUrl(period, packageName),
            method: 'GET',
        });
        return response.data;
    } catch {
        return undefined;
    }
};

const getTarballReadme = async (tarballUrl: string | undefined): Promise<string> => {
    if (tarballUrl === undefined) {
        return '';
    }

    try {
        const response = await request<ArrayBuffer>({
            url: tarballUrl,
            method: 'GET',
            responseType: 'arrayBuffer',
        });
        return extractReadmeFromTgz(response.data) ?? '';
    } catch {
        return '';
    }
};

const getReadme = async (metadata: PackageMetadata, latest: PackageVersion): Promise<string> => {
    const registryReadme = metadata.readme?.trim() || latest.readme?.trim();
    return registryReadme || getTarballReadme(latest.dist?.tarball);
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

export const getPackagePage = async (packageName: string): Promise<RequestResponse<string>> => {
    const response = await request<PackageMetadata>({
        url: getPackageMetadataUrl(packageName),
        method: 'GET',
    });
    const metadata = response.data;
    const latest = getLatestVersion(metadata);
    const [readme, weeklyDownloads, monthlyDownloads] = await Promise.all([
        getReadme(metadata, latest),
        getDownloads('last-week', packageName),
        getDownloads('last-month', packageName),
    ]);

    return {
        ...response,
        data: renderPackagePage({
            latest,
            metadata,
            monthlyDownloads,
            readme,
            weeklyDownloads,
        }),
    };
};
