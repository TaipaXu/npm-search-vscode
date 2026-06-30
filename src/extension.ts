import * as vscode from 'vscode';
import { getPackagePage as RGetPackagePage } from './apis/package';
import { ExplorerTree } from './explorerTree';
import { getErrorMessage } from './errors/message';

const getPackagePageUri = (packageName: string): vscode.Uri =>
    vscode.Uri.parse(`https://www.npmjs.com/package/${packageName}`);

const getPackageNameFromTreeItem = (item: vscode.TreeItem): string | undefined => {
    const packageName = item.command?.arguments?.[0];
    return typeof packageName === 'string' ? packageName : undefined;
};

const openPackageInSimpleBrowser = async (packageName: string): Promise<void> => {
    const uri = getPackagePageUri(packageName);

    try {
        await vscode.commands.executeCommand('simpleBrowser.api.open', uri, {
            viewColumn: vscode.ViewColumn.One,
        });
    } catch {
        try {
            await vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
        } catch {
            await vscode.env.openExternal(uri);
        }
    }
};

const openPackageInSystemBrowser = async (packageName: string): Promise<void> => {
    await vscode.env.openExternal(getPackagePageUri(packageName));
};

export const activate = (context: vscode.ExtensionContext): void => {
    const explorerTree = new ExplorerTree();

    let webviewPanel: vscode.WebviewPanel | undefined;
    let packagePageController: AbortController | undefined;
    const getWebviewPanel = (): vscode.WebviewPanel => {
        if (webviewPanel === undefined) {
            webviewPanel = vscode.window.createWebviewPanel(
                'npm-search',
                'npm search',
                vscode.ViewColumn.One,
                {
                    enableScripts: false,
                },
            );
            webviewPanel.onDidDispose(() => {
                packagePageController?.abort();
                packagePageController = undefined;
                webviewPanel = undefined;
            });
        }

        return webviewPanel;
    };

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('taipaxu.npmSearch', explorerTree),
        vscode.commands.registerCommand('npm-search.search', async () => {
            let searchStr: string | undefined = await vscode.window.showInputBox({
                prompt: 'Search Packages',
            });
            if (searchStr !== undefined && (searchStr = searchStr.trim()).length > 0) {
                explorerTree.search(searchStr);
            }
        }),
        vscode.commands.registerCommand('npm-search.previousPage', () => {
            try {
                explorerTree.previousPage();
            } catch (error) {
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        }),
        vscode.commands.registerCommand('npm-search.nextPage', () => {
            try {
                explorerTree.nextPage();
            } catch (error) {
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        }),
        vscode.commands.registerCommand('npm-search.refresh', () => {
            try {
                explorerTree.refresh();
            } catch (error) {
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        }),
        vscode.commands.registerCommand('npm-search.select', async (packageName: string) => {
            packagePageController?.abort();
            const controller = new AbortController();
            packagePageController = controller;
            const panel = getWebviewPanel();

            panel.title = packageName;
            try {
                const response = await RGetPackagePage(packageName, {
                    signal: controller.signal,
                });
                if (controller.signal.aborted) {
                    return;
                }

                panel.webview.html = response.data;
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                void vscode.window.showWarningMessage(getErrorMessage(error));
            } finally {
                if (packagePageController === controller) {
                    packagePageController = undefined;
                }
            }
        }),
        vscode.commands.registerCommand('npm-search.openInBrowser', (item: vscode.TreeItem) => {
            const packageName = getPackageNameFromTreeItem(item);

            if (packageName !== undefined) {
                void openPackageInSimpleBrowser(packageName);
            }
        }),
        vscode.commands.registerCommand(
            'npm-search.openInSystemBrowser',
            (item: vscode.TreeItem) => {
                const packageName = getPackageNameFromTreeItem(item);

                if (packageName !== undefined) {
                    void openPackageInSystemBrowser(packageName);
                }
            },
        ),
    );
};

export const deactivate = (): void => {};
