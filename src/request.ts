import axios, { AxiosRequestConfig, AxiosInstance } from 'axios';

const config: AxiosRequestConfig = {
    baseURL: 'https://www.npmjs.com/',
    timeout: 10000,
    headers: {
        'Accept': 'application/json',
    },
};

const service: AxiosInstance = axios.create(config);

export default service;
