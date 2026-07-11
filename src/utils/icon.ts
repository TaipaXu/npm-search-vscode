import * as vscode from 'vscode';
import type { NpmPackage } from '../apis/package';

interface TreeIcon {
    iconPath: vscode.ThemeIcon;
    resourceUri: vscode.Uri;
}

const hasTypeScriptKeyword = (keywords: NpmPackage['keywords']): boolean =>
    keywords?.some((keyword) => keyword.trim().toLowerCase() === 'typescript') ?? false;

// ThemeIcon.File uses the active VS Code file icon theme. A representative file
// name lets the theme resolve the language icon without bundling separate assets.
const getPackageTreeIcon = (packageInfo: NpmPackage): TreeIcon => {
    const isTypeScript =
        packageInfo.name.toLowerCase().startsWith('@types/') ||
        hasTypeScriptKeyword(packageInfo.keywords);
    const fileName = isTypeScript ? 'package.ts' : 'package.js';

    return {
        iconPath: vscode.ThemeIcon.File,
        resourceUri: vscode.Uri.from({
            scheme: 'npm-search-language',
            path: `/icons/${fileName}`,
        }),
    };
};

export default getPackageTreeIcon;
