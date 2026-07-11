import * as vscode from 'vscode';

export class NoInputError extends Error {
    constructor() {
        super(vscode.l10n.t('Please enter a search term.'));

        this.name = 'NoInputError';
    }
}

export class FirstPageError extends Error {
    constructor() {
        super(vscode.l10n.t('This is the first page.'));

        this.name = 'FirstPageError';
    }
}
