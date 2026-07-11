import * as vscode from 'vscode';
import { search as RSearch } from './apis/package';
import type { NpmPackage } from './apis/package';
import { NoInputError, FirstPageError } from './errors/explorer';
import { getErrorMessage } from './errors/message';
import getPackageTreeIcon from './utils/icon';

const FIRST_PAGE = 0;

const getPackageDateText = (date: NpmPackage['date']): string => {
    if (typeof date === 'string') {
        const parsed = new Date(date);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
    }

    return date?.rel ?? '';
};

export class ExplorerTree implements vscode.TreeDataProvider<vscode.TreeItem> {
    private onDidChangeTreeDataEvent = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> =
        this.onDidChangeTreeDataEvent.event;
    private queryKey: string | undefined;
    private currentPage = FIRST_PAGE;
    private perPage = 20;

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
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
                const description: string = packageInfo.description ?? '';
                const version: string = packageInfo.version ?? '';
                const lastUpdateTime: string = getPackageDateText(packageInfo.date);
                const nodeDescription = [version, lastUpdateTime].filter(Boolean).join(' - ');

                const node: vscode.TreeItem = new vscode.TreeItem(
                    packageName,
                    vscode.TreeItemCollapsibleState.None,
                );
                node.description = nodeDescription === '' ? undefined : `    ${nodeDescription}`;
                node.tooltip = description;
                const treeIcon = getPackageTreeIcon(packageInfo);
                node.iconPath = treeIcon.iconPath;
                node.resourceUri = treeIcon.resourceUri;
                node.command = {
                    command: 'npm-search.select',
                    title: 'Select',
                    arguments: [packageName],
                };
                nodes.push(node);
            }
        } catch (error) {
            void vscode.window.showWarningMessage(getErrorMessage(error));
        }

        return nodes;
    }

    public search(queryKey: string): void {
        this.queryKey = queryKey;
        this.currentPage = FIRST_PAGE;
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public previousPage(): void {
        this.checkQueryKey();
        if (this.currentPage > FIRST_PAGE) {
            this.currentPage--;
            this.onDidChangeTreeDataEvent.fire(undefined);
        } else {
            throw new FirstPageError();
        }
    }

    public nextPage(): void {
        this.checkQueryKey();
        this.currentPage++;
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public refresh(): void {
        this.checkQueryKey();
        this.currentPage = 0;
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    private checkQueryKey(): void {
        if (this.queryKey === undefined) {
            throw new NoInputError();
        }
    }
}
