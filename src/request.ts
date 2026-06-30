export type ResponseType = 'arrayBuffer' | 'json' | 'text';

export interface RequestConfig {
    url: string;
    method?: string;
    headers?: Record<string, string | number | boolean>;
    params?: Record<string, string | number | boolean | null | undefined>;
    responseType?: ResponseType;
}

export interface RequestResponse<T = unknown> {
    data: T;
    headers: Headers;
    status: number;
}

const BASE_URL = 'https://www.npmjs.com/';
const TIMEOUT = 10000;

const buildUrl = (
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
): string => {
    const url = new URL(path, BASE_URL);

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }
    }

    return url.toString();
};

const buildHeaders = (headers?: Record<string, string | number | boolean>): Headers => {
    const result = new Headers({
        Accept: 'application/json',
    });

    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            result.set(key, String(value));
        }
    }

    return result;
};

const detectResponseType = (response: Response): ResponseType => {
    const contentType = response.headers.get('content-type');
    return contentType?.includes('application/json') ? 'json' : 'text';
};

const request = async <T = unknown>(config: RequestConfig): Promise<RequestResponse<T>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT);

    try {
        const response = await fetch(buildUrl(config.url, config.params), {
            method: config.method ?? 'GET',
            headers: buildHeaders(config.headers),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const responseType = config.responseType ?? detectResponseType(response);
        const data =
            responseType === 'json'
                ? await response.json()
                : responseType === 'arrayBuffer'
                  ? await response.arrayBuffer()
                  : await response.text();

        return {
            data: data as T,
            headers: response.headers,
            status: response.status,
        };
    } finally {
        clearTimeout(timeoutId);
    }
};

export default request;
