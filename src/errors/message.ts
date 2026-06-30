export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
        return error.toString();
    }

    return 'Unknown error.';
};
