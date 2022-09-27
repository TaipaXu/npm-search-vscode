import * as vscode from 'vscode';
import { ExplorerTree } from './explorerTree';
import { getPackagePage as RGetPackagePage } from './apis/package';

export const activate = (context: vscode.ExtensionContext): void => {
    const explorerTree: ExplorerTree = new ExplorerTree();
    vscode.window.registerTreeDataProvider('taipaxu.npmSearch', explorerTree);

    let webviewPanel: vscode.WebviewPanel | undefined;
    const checkWebviewPanel = (): void => {
        if (webviewPanel === undefined) {
            webviewPanel = vscode.window.createWebviewPanel(
                'npm-search',
                'npm search',
                vscode.ViewColumn.One,
                {
                    enableScripts: true
                }
            );
            webviewPanel.onDidDispose(() => {
                webviewPanel = undefined;
            });
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('npm-search.search', async () => {
            let searchStr: string | undefined = await vscode.window.showInputBox({
                prompt: 'Search Packages'
            });
            if (searchStr !== undefined && (searchStr = searchStr.trim()).length > 0) {
                explorerTree.search(searchStr);
            }
        }),
        vscode.commands.registerCommand('npm-search.previousPage', async () => {
            try {
                await explorerTree.previousPage();
            } catch (error) {
                vscode.window.showWarningMessage(error.message);
            }
        }),
        vscode.commands.registerCommand('npm-search.nextPage', async () => {
            try {
                await explorerTree.nextPage();
            } catch (error) {
                vscode.window.showWarningMessage(error.message);
            }
        }),
        vscode.commands.registerCommand('npm-search.refresh', async () => {
            try {
                await explorerTree.refresh();
            } catch (error) {
                vscode.window.showWarningMessage(error.message);
            }
        }),
        vscode.commands.registerCommand('npm-search.select', async (packageName: string) => {
            checkWebviewPanel();

            webviewPanel!.title = packageName;
            try {
                const response = await RGetPackagePage(packageName);
                const { data } = response;
                const style: string = `<style>
                    header,
                    footer {
                        display: none;
                    }
                </style>`;
                const html: string = style + data.replaceAll('src="/npm-avatar', 'src="https://www.npmjs.com/npm-avatar');
                webviewPanel!.webview.html = html;
            } catch (error) {

            }
        }),
        vscode.commands.registerCommand('npm-search.openInBrowser', (item: vscode.TreeItem) => {
            const eventArguments: any[] = item.command!.arguments as any[];
            const packageName = eventArguments[0];
            vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${packageName}`));
        }),
    );
};

export const deactivate = (): void => { };
