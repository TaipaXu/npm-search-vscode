import * as vscode from 'vscode';
import { search as RSearch } from './apis/package';
import type { NpmPackage } from './apis/package';
import { NoInputError, FirstPageError } from './errors/explorer';
import { getErrorMessage } from './errors/message';
import getPackageTreeIcon from './utils/icon';

const FIRST_PAGE = 0;
const HAS_QUERY_CONTEXT = 'npmSearch.hasQuery';
const HAS_PREVIOUS_PAGE_CONTEXT = 'npmSearch.hasPreviousPage';
const HAS_NEXT_PAGE_CONTEXT = 'npmSearch.hasNextPage';
const IS_LOADING_CONTEXT = 'npmSearch.isLoading';

const getPackageDateText = (date: NpmPackage['date']): string => {
    if (typeof date === 'string') {
        const parsed = new Date(date);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(vscode.env.language);
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
    private hasNextPage = false;
    private isLoading = false;
    private requestVersion = 0;

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(): Promise<vscode.TreeItem[]> {
        if (this.queryKey === undefined) {
            return [];
        }

        const queryKey = this.queryKey;
        const currentPage = this.currentPage;
        const requestVersion = this.requestVersion;
        const nodes: vscode.TreeItem[] = [];
        this.isLoading = true;
        this.updatePaginationContext();

        try {
            const response = await RSearch({
                key: queryKey,
                currentPage,
                perPage: this.perPage,
            });

            const { data } = response;
            const items = data.objects;

            if (requestVersion !== this.requestVersion) {
                return [];
            }

            this.hasNextPage =
                typeof data.total === 'number'
                    ? (currentPage + 1) * this.perPage < data.total
                    : items.length === this.perPage;

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
                    title: vscode.l10n.t('Select'),
                    arguments: [packageName],
                };
                nodes.push(node);
            }
        } catch (error) {
            if (requestVersion === this.requestVersion) {
                this.hasNextPage = false;
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        } finally {
            if (requestVersion === this.requestVersion) {
                this.isLoading = false;
                this.updatePaginationContext();
            }
        }

        return nodes;
    }

    public search(queryKey: string): void {
        this.queryKey = queryKey;
        this.currentPage = FIRST_PAGE;
        this.startLoading();
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public previousPage(): void {
        this.checkQueryKey();
        if (this.isLoading) {
            return;
        }

        if (this.currentPage > FIRST_PAGE) {
            this.currentPage--;
            this.startLoading();
            this.onDidChangeTreeDataEvent.fire(undefined);
        } else {
            throw new FirstPageError();
        }
    }

    public nextPage(): void {
        this.checkQueryKey();
        if (this.isLoading || !this.hasNextPage) {
            return;
        }

        this.currentPage++;
        this.startLoading();
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public refresh(): void {
        this.checkQueryKey();
        this.currentPage = 0;
        this.startLoading();
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    private startLoading(): void {
        this.requestVersion++;
        this.hasNextPage = false;
        this.isLoading = true;
        this.updatePaginationContext();
    }

    private updatePaginationContext(): void {
        void vscode.commands.executeCommand(
            'setContext',
            HAS_QUERY_CONTEXT,
            this.queryKey !== undefined,
        );
        void vscode.commands.executeCommand(
            'setContext',
            HAS_PREVIOUS_PAGE_CONTEXT,
            this.queryKey !== undefined && this.currentPage > FIRST_PAGE,
        );
        void vscode.commands.executeCommand(
            'setContext',
            HAS_NEXT_PAGE_CONTEXT,
            this.queryKey !== undefined && this.hasNextPage,
        );
        void vscode.commands.executeCommand('setContext', IS_LOADING_CONTEXT, this.isLoading);
    }

    private checkQueryKey(): void {
        if (this.queryKey === undefined) {
            throw new NoInputError();
        }
    }
}
