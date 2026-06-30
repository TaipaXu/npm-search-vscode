export class NoInputError extends Error {
    constructor() {
        super('Please input something.');

        this.name = 'NoInputError';
    }
}

export class FirstPageError extends Error {
    constructor() {
        super('This is the first page.');

        this.name = 'FirstPageError';
    }
}
