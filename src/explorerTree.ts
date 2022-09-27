import * as vscode from 'vscode';
import { search as RSearch } from './apis/package';
import { NoInputError, FirstPageError } from './errors/explorer';

const FIRST_PAGE: number = 0;

export class ExplorerTree implements vscode.TreeDataProvider<vscode.TreeItem> {
    private onDidChangeTreeDataEvent: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    public readonly onDidChangeTreeData: vscode.Event<any> = this.onDidChangeTreeDataEvent.event;
    private queryKey: string | undefined;
    private currentPage: number = FIRST_PAGE;
    private perPage: number = 20;

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (this.queryKey === undefined) {
            return [];
        }

        const nodes: vscode.TreeItem[] = [];
        try {
            const response = await RSearch({
                key: this.queryKey,
                currentPage: this.currentPage,
                perPage: this.perPage,
            });

            const { data } = response;
            const items = data.objects;
            for (const item of items) {
                const packageInfo = item.package;
                const packageName: string = packageInfo.name;
                const description: string = packageInfo.description;
                const version: string = packageInfo.version;
                const lastUpdaetTime: string = packageInfo.date.rel;

                const node: vscode.TreeItem = new vscode.TreeItem(packageName, vscode.TreeItemCollapsibleState.None);
                node.description = `    ${version} - ${lastUpdaetTime}`;
                node.tooltip = description;
                node.command = {
                    command: 'npm-search.select',
                    title: 'Select',
                    arguments: [packageName],
                };
                nodes.push(node);
            }
        } catch (error) {

        }

        return nodes;
    }

    public async search(queryKey: string): Promise<void> {
        this.queryKey = queryKey;
        this.currentPage = FIRST_PAGE;
        this.onDidChangeTreeDataEvent.fire(null);
    }

    public async previousPage(): Promise<void> {
        this.checkQueryKey();
        if (this.currentPage > FIRST_PAGE) {
            this.currentPage--;
            this.onDidChangeTreeDataEvent.fire(null);
        } else {
            throw new FirstPageError();
        }

    }

    public async nextPage(): Promise<void> {
        this.checkQueryKey();
        this.currentPage++;
        this.onDidChangeTreeDataEvent.fire(null);
    }

    public async refresh(): Promise<void> {
        this.checkQueryKey();
        this.currentPage = 0;
        this.onDidChangeTreeDataEvent.fire(null);
    }

    private checkQueryKey(): void {
        if (this.queryKey === undefined) {
            throw new NoInputError();
        }
    }
};
