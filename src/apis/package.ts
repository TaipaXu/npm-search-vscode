import request, { type RequestResponse } from '../request';

interface Params {
    key: string | undefined;
    currentPage: number;
    perPage: number;
}

export interface NpmSearchResponse {
    objects: NpmSearchItem[];
}

export interface NpmSearchItem {
    package: NpmPackage;
}

export interface NpmPackage {
    date?: {
        rel?: string;
    };
    description?: string;
    name: string;
    version?: string;
}

export const search = async (params: Params): Promise<RequestResponse<NpmSearchResponse>> => {
    return request<NpmSearchResponse>({
        url: 'search',
        method: 'GET',
        headers: {
            'x-spiferack': 1,
        },
        params: {
            q: params.key,
            page: params.currentPage,
            perPage: params.perPage,
        },
    });
};

export const getPackagePage = async (packageName: string): Promise<RequestResponse<string>> => {
    return request<string>({
        url: `package/${packageName}`,
        method: 'GET',
        headers: {
            Accept: 'text/html',
        },
        responseType: 'text',
    });
};
