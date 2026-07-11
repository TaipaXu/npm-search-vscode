export class NoInputError extends Error {
    constructor() {
        super('Please enter a search term.');

        this.name = 'NoInputError';
    }
}

export class FirstPageError extends Error {
    constructor() {
        super('This is the first page.');

        this.name = 'FirstPageError';
    }
}
