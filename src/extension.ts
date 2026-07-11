import * as vscode from 'vscode';
import {
    getPackageDownloads,
    getPackageHistory,
    getPackagePage as RGetPackagePage,
    getPackageReadme,
} from './apis/package';
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
    let activePackageName: string | undefined;
    const sectionControllers = new Map<string, AbortController>();

    const abortPackagePageRequests = (): void => {
        packagePageController?.abort();
        packagePageController = undefined;
        for (const controller of sectionControllers.values()) {
            controller.abort();
        }
        sectionControllers.clear();
    };

    const loadPackagePageSection = async (
        panel: vscode.WebviewPanel,
        message: unknown,
    ): Promise<void> => {
        if (
            typeof message !== 'object' ||
            message === null ||
            !('type' in message) ||
            !('packageName' in message)
        ) {
            return;
        }

        const { packageName, type } = message as { packageName?: unknown; type?: unknown };
        if (
            typeof packageName !== 'string' ||
            packageName !== activePackageName ||
            (type !== 'load-readme' && type !== 'load-history' && type !== 'load-downloads')
        ) {
            return;
        }

        const section = type.slice('load-'.length);
        sectionControllers.get(section)?.abort();
        const controller = new AbortController();
        sectionControllers.set(section, controller);

        try {
            const html =
                type === 'load-readme'
                    ? await getPackageReadme(packageName, { signal: controller.signal })
                    : type === 'load-history'
                      ? await getPackageHistory(packageName, { signal: controller.signal })
                      : await getPackageDownloads(packageName, { signal: controller.signal });

            if (!controller.signal.aborted && packageName === activePackageName) {
                await panel.webview.postMessage({
                    type: 'package-section',
                    packageName,
                    section,
                    html,
                });
            }
        } catch (error) {
            if (!controller.signal.aborted && packageName === activePackageName) {
                await panel.webview.postMessage({
                    type: 'package-section-error',
                    packageName,
                    section,
                    error: getErrorMessage(error),
                });
            }
        } finally {
            if (sectionControllers.get(section) === controller) {
                sectionControllers.delete(section);
            }
        }
    };

    const getWebviewPanel = (): vscode.WebviewPanel => {
        if (webviewPanel === undefined) {
            webviewPanel = vscode.window.createWebviewPanel(
                'npm-search',
                'npm search',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                },
            );
            const panel = webviewPanel;
            panel.webview.onDidReceiveMessage((message) => {
                void loadPackagePageSection(panel, message);
            });
            webviewPanel.onDidDispose(() => {
                abortPackagePageRequests();
                activePackageName = undefined;
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
            abortPackagePageRequests();
            const controller = new AbortController();
            packagePageController = controller;
            activePackageName = packageName;
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
