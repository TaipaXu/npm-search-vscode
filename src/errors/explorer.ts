export class NoInputError extends Error {
    constructor() {
        super();

        this.name = 'NoInputError';
        this.message = 'Please input something.';
    }
};

export class FirstPageError extends Error {
    constructor() {
        super();

        this.name = 'FirstPageError';
        this.message = 'This is the first page.';
    }
};
