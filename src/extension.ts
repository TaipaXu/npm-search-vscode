import * as vscode from 'vscode';
import { getPackagePage as RGetPackagePage } from './apis/package';
import { ExplorerTree } from './explorerTree';
import { getErrorMessage } from './errors/message';

const getPackagePageUri = (packageName: string): vscode.Uri =>
    vscode.Uri.parse(`https://www.npmjs.com/package/${packageName}`);

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
                    enableScripts: false,
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
                panel.webview.html = response.data;
            } catch (error) {
                void vscode.window.showWarningMessage(getErrorMessage(error));
            }
        }),
        vscode.commands.registerCommand('npm-search.openInBrowser', (item: vscode.TreeItem) => {
            const eventArguments = item.command?.arguments;
            const packageName = eventArguments?.[0];

            if (typeof packageName === 'string') {
                void openPackageInSimpleBrowser(packageName);
            }
        }),
    );
};

export const deactivate = (): void => {};
