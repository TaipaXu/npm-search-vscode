import { AxiosPromise } from 'axios';
import request from '../request';

interface Params {
    key: string | undefined,
    currentPage: number,
    perPage: number,
};

export const search = (params: Params): AxiosPromise<any> => {
    return request({
        url: `search`,
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

export const getPackagePage = (packageName: string): AxiosPromise<any> => {
    return request({
        url: `package/${packageName}`,
        method: 'GET',
    });
};
