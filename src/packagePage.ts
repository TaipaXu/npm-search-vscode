import { randomBytes } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import * as vscode from 'vscode';
import type { DownloadPoint, PackageMetadata, PackageVersion, Person } from './apis/package';

export interface PackagePageData {
    latest: PackageVersion;
}

const toDisplayString = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return value.toString();
    }

    return JSON.stringify(value) ?? '';
};

const escapeHtml = (value: unknown): string =>
    toDisplayString(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const toScriptString = (value: string): string =>
    JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');

const normalizeUrl = (value: string | undefined): string | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value
        .trim()
        .replace(/^git\+/, '')
        .replace(/^git:\/\//, 'https://');

    try {
        const url = new URL(normalized);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};

const formatNumber = (value: number | undefined): string | undefined =>
    value === undefined ? undefined : new Intl.NumberFormat(vscode.env.language).format(value);

const formatBytes = (value: number | undefined): string | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const units = ['B', 'kB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDate = (value: string | undefined): string | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString(vscode.env.language);
};

const getPersonText = (person: Person | string | undefined): string => {
    if (typeof person === 'string') {
        return person;
    }

    return person?.name ?? person?.username ?? '';
};

const getLicenseText = (license: PackageVersion['license']): string => {
    if (typeof license === 'string') {
        return license;
    }

    return license?.type ?? '';
};

const getRepositoryUrl = (repository: PackageVersion['repository']): string | undefined => {
    if (typeof repository === 'string') {
        return normalizeUrl(repository);
    }

    return normalizeUrl(repository?.url);
};

const getBugsUrl = (bugs: PackageVersion['bugs']): string | undefined => {
    if (typeof bugs === 'string') {
        return normalizeUrl(bugs);
    }

    return normalizeUrl(bugs?.url);
};

const allowedLinkProtocols = ['http', 'https', 'mailto'];
const allowedLinkProtocolSet = new Set(allowedLinkProtocols);

const markdown = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: true,
    typographer: false,
});

markdown.validateLink = (url): boolean => {
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('//')) {
        return false;
    }

    const protocol = /^([a-z][a-z\d+.-]*):/i.exec(trimmedUrl)?.[1].toLowerCase();
    return protocol === undefined || allowedLinkProtocolSet.has(protocol);
};

const renderMarkdown = (source: string): string =>
    sanitizeHtml(markdown.render(source), {
        allowedTags: [
            'a',
            'blockquote',
            'br',
            'code',
            'del',
            'em',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'hr',
            'img',
            'li',
            'ol',
            'p',
            'pre',
            'strong',
            'table',
            'tbody',
            'td',
            'th',
            'thead',
            'tr',
            'ul',
        ],
        allowedAttributes: {
            a: ['href', 'title', 'rel'],
            code: ['class'],
            img: ['src', 'alt', 'title', 'loading'],
            ol: ['start'],
        },
        allowedClasses: {
            code: [/^language-[\w-]+$/],
        },
        allowedSchemes: allowedLinkProtocols,
        allowedSchemesByTag: {
            img: ['https'],
        },
        allowProtocolRelative: false,
        disallowedTagsMode: 'discard',
        enforceHtmlBoundary: true,
        parseStyleAttributes: false,
        transformTags: {
            a: (_tagName, attributes) => ({
                tagName: 'a',
                attribs: { ...attributes, rel: 'noopener noreferrer' },
            }),
            img: (_tagName, attributes) => ({
                tagName: 'img',
                attribs: { ...attributes, loading: 'lazy' },
            }),
        },
    });

const renderFact = (label: string, value: string | undefined): string => {
    if (value === undefined || value === '') {
        return '';
    }

    return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
};

const renderLink = (label: string, url: string | undefined): string => {
    if (url === undefined) {
        return '';
    }

    return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
};

const renderRecordList = (title: string, values: Record<string, string> | undefined): string => {
    const entries = Object.entries(values ?? {});
    if (entries.length === 0) {
        return '';
    }

    return `<section class="side-section">
        <h3>${escapeHtml(title)} <span>${entries.length}</span></h3>
        <ul class="compact-list">
            ${entries
                .slice(0, 24)
                .map(
                    ([name, version]) =>
                        `<li><code>${escapeHtml(name)}</code><span>${escapeHtml(version)}</span></li>`,
                )
                .join('')}
        </ul>
        ${entries.length > 24 ? `<p class="muted">${escapeHtml(vscode.l10n.t('+{0} more', entries.length - 24))}</p>` : ''}
    </section>`;
};

const renderTags = (title: string, values: string[]): string => {
    const tags = values.filter(Boolean).slice(0, 30);
    if (tags.length === 0) {
        return '';
    }

    return `<section class="side-section">
        <h3>${escapeHtml(title)}</h3>
        <div class="tag-list">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    </section>`;
};

export const renderPackageReadme = (readme: string): string =>
    readme.trim() === ''
        ? `<p class="empty-readme">${escapeHtml(vscode.l10n.t('No README found.'))}</p>`
        : renderMarkdown(readme);

export const renderPackageDownloads = (
    weeklyDownloads: DownloadPoint | undefined,
    monthlyDownloads: DownloadPoint | undefined,
): string =>
    [
        renderFact(vscode.l10n.t('Weekly Downloads'), formatNumber(weeklyDownloads?.downloads)),
        renderFact(vscode.l10n.t('Monthly Downloads'), formatNumber(monthlyDownloads?.downloads)),
    ].join('') ||
    `<p class="muted">${escapeHtml(vscode.l10n.t('Download counts are unavailable.'))}</p>`;

export const renderPackageHistory = (metadata: PackageMetadata, latestVersion: string): string => {
    const versions = Object.keys(metadata.versions ?? {}).sort((left, right) => {
        const leftTime = new Date(metadata.time?.[left] ?? 0).getTime();
        const rightTime = new Date(metadata.time?.[right] ?? 0).getTime();
        return rightTime - leftTime;
    });
    const maintainers = (metadata.maintainers ?? []).map(getPersonText).filter(Boolean);
    const visibleVersions = versions.slice(0, 100);

    return `${renderFact(vscode.l10n.t('Published'), formatDate(metadata.time?.[latestVersion]))}
        ${renderFact(vscode.l10n.t('Modified'), formatDate(metadata.time?.modified))}
        ${renderRecordList(vscode.l10n.t('Distribution Tags'), metadata['dist-tags'])}
        ${
            versions.length === 0
                ? `<p class="muted">${escapeHtml(vscode.l10n.t('No version history found.'))}</p>`
                : `<section class="side-section">
                    <h3>${escapeHtml(vscode.l10n.t('Versions'))} <span>${versions.length}</span></h3>
                    <ul class="compact-list version-list">
                        ${visibleVersions
                            .map(
                                (version) =>
                                    `<li><code>${escapeHtml(version)}</code><span>${escapeHtml(formatDate(metadata.time?.[version]) ?? '')}</span></li>`,
                            )
                            .join('')}
                    </ul>
                    ${versions.length > visibleVersions.length ? `<p class="muted">${escapeHtml(vscode.l10n.t('Showing the latest {0} versions.', visibleVersions.length))}</p>` : ''}
                </section>`
        }
        ${renderTags(vscode.l10n.t('Maintainers'), maintainers)}`;
};

export const renderPackagePage = ({ latest }: PackagePageData): string => {
    const nonce = randomBytes(16).toString('base64');
    const packageUrl = normalizeUrl(`https://www.npmjs.com/package/${latest.name}`);
    const homepageUrl = normalizeUrl(latest.homepage);
    const repositoryUrl = getRepositoryUrl(latest.repository);
    const bugsUrl = getBugsUrl(latest.bugs);
    const tarballUrl = normalizeUrl(latest.dist?.tarball);
    const maintainers = (latest.maintainers ?? []).map(getPersonText).filter(Boolean);
    const keywords = latest.keywords ?? [];

    return `<!doctype html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
        :root {
            color-scheme: light dark;
            --background: var(--vscode-editor-background);
            --foreground: var(--vscode-editor-foreground);
            --muted: var(--vscode-descriptionForeground);
            --border: var(--vscode-panel-border);
            --link: var(--vscode-textLink-foreground);
            --code-background: var(--vscode-textCodeBlock-background);
            --button-background: var(--vscode-button-background);
            --button-foreground: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --warning-background: var(--vscode-inputValidation-warningBackground);
            --warning-border: var(--vscode-inputValidation-warningBorder);
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 28px;
            background: var(--background);
            color: var(--foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: 1.55;
        }
        a { color: var(--link); text-decoration: none; }
        a:hover { text-decoration: underline; }
        button {
            padding: 7px 12px;
            border: 0;
            border-radius: 3px;
            color: var(--button-foreground);
            background: var(--button-background);
            cursor: pointer;
            font: inherit;
        }
        button:hover { background: var(--button-hover); }
        button:disabled { cursor: default; opacity: .65; }
        code, pre {
            background: var(--code-background);
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
        }
        code { padding: 2px 5px; }
        pre { overflow: auto; padding: 14px; white-space: pre-wrap; }
        .shell { max-width: 1180px; margin: 0 auto; }
        .package-header { padding-bottom: 22px; border-bottom: 1px solid var(--border); }
        h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
        h2 { margin: 0 0 16px; font-size: 22px; letter-spacing: 0; }
        h3 { margin: 0 0 10px; font-size: 14px; letter-spacing: 0; text-transform: uppercase; }
        h3 span { color: var(--muted); font-weight: 400; text-transform: none; }
        .description, .muted, .empty-readme, .deferred-copy { color: var(--muted); }
        .install {
            display: inline-block;
            margin-top: 16px;
            padding: 10px 12px;
            border: 1px solid var(--border);
            border-radius: 6px;
        }
        .deprecated {
            margin: 16px 0 0;
            padding: 12px;
            border: 1px solid var(--warning-border);
            border-radius: 6px;
            background: var(--warning-background);
        }
        .content {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 300px;
            gap: 32px;
            align-items: start;
            margin-top: 28px;
        }
        .readme { min-width: 0; }
        .readme h2, .readme h3, .readme h4, .readme h5, .readme h6 {
            margin-top: 24px;
            margin-bottom: 10px;
            text-transform: none;
        }
        .readme p, .readme ul { margin: 0 0 14px; }
        .deferred { padding: 18px; border: 1px dashed var(--border); border-radius: 6px; }
        .deferred-copy { margin: 0 0 12px; }
        .load-error { color: var(--vscode-errorForeground); }
        .sidebar { min-width: 0; border-left: 1px solid var(--border); padding-left: 24px; }
        .side-section { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
        .fact { margin-bottom: 12px; }
        .fact span, .compact-list span { display: block; color: var(--muted); font-size: 12px; }
        .fact strong, .compact-list code { display: block; margin-top: 3px; overflow-wrap: anywhere; }
        .link-list { display: grid; gap: 8px; }
        .tag-list { display: flex; flex-wrap: wrap; gap: 7px; }
        .tag-list span {
            padding: 3px 8px;
            border: 1px solid var(--border);
            border-radius: 999px;
            color: var(--muted);
        }
        .compact-list { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
        .version-list { max-height: 420px; overflow: auto; }
        @media (max-width: 840px) {
            body { padding: 20px; }
            .content { grid-template-columns: 1fr; }
            .sidebar { border-left: 0; padding-left: 0; }
        }
    </style>
    <title>${escapeHtml(latest.name)}</title>
</head>
<body>
    <main class="shell" data-package-name="${escapeHtml(latest.name)}">
        <header class="package-header">
            <h1>${escapeHtml(latest.name)}</h1>
            <p class="description">${escapeHtml(latest.description ?? '')}</p>
            <code class="install">${escapeHtml(`npm install ${latest.name}`)}</code>
            ${latest.deprecated ? `<p class="deprecated">${escapeHtml(latest.deprecated)}</p>` : ''}
        </header>
        <div class="content">
            <article class="readme">
                <h2>README</h2>
                <div id="readme-content" class="deferred">
                    <p class="deferred-copy">${escapeHtml(vscode.l10n.t('Loading README…'))}</p>
                    <button id="load-readme" type="button" hidden>${escapeHtml(vscode.l10n.t('Retry README'))}</button>
                </div>
            </article>
            <aside class="sidebar">
                <section id="downloads-content" class="side-section">
                    <p class="muted">${escapeHtml(vscode.l10n.t('Loading download counts…'))}</p>
                </section>
                <section class="side-section">
                    ${renderFact(vscode.l10n.t('Version'), latest.version)}
                    ${renderFact(vscode.l10n.t('License'), getLicenseText(latest.license))}
                    ${renderFact(vscode.l10n.t('Unpacked Size'), formatBytes(latest.dist?.unpackedSize))}
                    ${renderFact(vscode.l10n.t('Total Files'), formatNumber(latest.dist?.fileCount))}
                    ${renderFact(vscode.l10n.t('Author'), getPersonText(latest.author))}
                </section>
                <section class="side-section">
                    <h3>${escapeHtml(vscode.l10n.t('Links'))}</h3>
                    <div class="link-list">
                        ${renderLink(vscode.l10n.t('npm package page'), packageUrl)}
                        ${renderLink(vscode.l10n.t('Homepage'), homepageUrl)}
                        ${renderLink(vscode.l10n.t('Repository'), repositoryUrl)}
                        ${renderLink(vscode.l10n.t('Issues'), bugsUrl)}
                        ${renderLink(vscode.l10n.t('Tarball'), tarballUrl)}
                    </div>
                </section>
                ${renderRecordList(vscode.l10n.t('Dependencies'), latest.dependencies)}
                ${renderRecordList(vscode.l10n.t('Peer Dependencies'), latest.peerDependencies)}
                ${renderRecordList(vscode.l10n.t('Optional Dependencies'), latest.optionalDependencies)}
                ${renderRecordList(vscode.l10n.t('Dev Dependencies'), latest.devDependencies)}
                ${renderRecordList(vscode.l10n.t('Engines'), latest.engines)}
                ${renderTags(vscode.l10n.t('Keywords'), keywords)}
                ${renderTags(vscode.l10n.t('Maintainers'), maintainers)}
                <div id="history-content" class="deferred">
                    <p class="deferred-copy">${escapeHtml(vscode.l10n.t('Distribution tags, publish dates, and historical versions are loaded on demand.'))}</p>
                    <button id="load-history" type="button">${escapeHtml(vscode.l10n.t('Load version history'))}</button>
                </div>
            </aside>
        </div>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const packageName = document.querySelector('[data-package-name]').dataset.packageName;
        const loadingText = ${toScriptString(vscode.l10n.t('Loading…'))};

        const requestSection = (section) => {
            const button = document.getElementById('load-' + section);
            if (button) {
                button.hidden = true;
                button.disabled = true;
                button.dataset.originalText = button.textContent;
                button.textContent = loadingText;
            }
            vscode.postMessage({ type: 'load-' + section, packageName });
        };

        document.getElementById('load-readme').addEventListener('click', () => requestSection('readme'));
        document.getElementById('load-history').addEventListener('click', () => requestSection('history'));

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message?.type === 'init') {
                window.scroll(0, 0);
                return;
            }

            if (!message || message.packageName !== packageName) {
                return;
            }

            const target = document.getElementById(message.section + '-content');
            if (!target) {
                return;
            }

            if (message.type === 'package-section') {
                target.classList.remove('deferred');
                target.innerHTML = message.html;
                return;
            }

            if (message.type === 'package-section-error') {
                const button = document.getElementById('load-' + message.section);
                target.querySelector('.load-error')?.remove();
                const error = document.createElement('p');
                error.className = 'load-error';
                error.textContent = message.error;
                target.prepend(error);
                if (button) {
                    button.hidden = false;
                    button.disabled = false;
                    button.textContent = button.dataset.originalText;
                }
            }
        });

        requestSection('readme');
        vscode.postMessage({ type: 'load-downloads', packageName });
    </script>
</body>
</html>`;
};
