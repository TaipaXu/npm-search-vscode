import * as vscode from 'vscode';
import { ExplorerTree } from './explorerTree';
import { getPackagePage as RGetPackagePage } from './apis/package';
import { getErrorMessage } from './errors/message';

export const activate = (context: vscode.ExtensionContext): void => {
    const explorerTree = new ExplorerTree();

    let webviewPanel: vscode.WebviewPanel | undefined;
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
            webviewPanel.onDidDispose(() => {
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
            const panel = getWebviewPanel();

            panel.title = packageName;
            try {
                const response = await RGetPackagePage(packageName);
                const { data } = response;
                const style: string = `<style>
                    header,
                    footer {
                        display: none;
                    }
                </style>`;
                const script: string = `
                    <script>
                        window.addEventListener('message', (event) => {
                            if (event.data.type === 'init') {
                                window.scroll(0, 0);
                            }
                        });
                    </script>`;
                const html: string =
                    style +
                    script +
                    data.replaceAll('src="/npm-avatar', 'src="https://www.npmjs.com/npm-avatar');
                panel.webview.html = html;
                void panel.webview.postMessage({
                    type: 'init',
                });
            } catch (error) {
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        }),
        vscode.commands.registerCommand('npm-search.openInBrowser', (item: vscode.TreeItem) => {
            const eventArguments = item.command?.arguments;
            const packageName = eventArguments?.[0];

            if (typeof packageName === 'string') {
                void vscode.env.openExternal(
                    vscode.Uri.parse(`https://www.npmjs.com/package/${packageName}`),
                );
            }
        }),
    );
};

export const deactivate = (): void => {};
