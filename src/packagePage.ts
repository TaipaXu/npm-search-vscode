import type { DownloadPoint, PackageMetadata, PackageVersion, Person } from './apis/package';

export interface PackagePageData {
    latest: PackageVersion;
    metadata: PackageMetadata;
    monthlyDownloads?: DownloadPoint;
    readme: string;
    weeklyDownloads?: DownloadPoint;
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
    value === undefined ? undefined : new Intl.NumberFormat().format(value);

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
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
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

const renderInlineMarkdown = (value: string): string =>
    escapeHtml(value)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>');

const renderMarkdown = (markdown: string): string => {
    const html: string[] = [];
    const paragraph: string[] = [];
    const listItems: string[] = [];
    let codeLines: string[] = [];
    let inCodeFence = false;

    const closeParagraph = (): void => {
        if (paragraph.length > 0) {
            html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
            paragraph.length = 0;
        }
    };

    const closeList = (): void => {
        if (listItems.length > 0) {
            html.push(`<ul>${listItems.join('')}</ul>`);
            listItems.length = 0;
        }
    };

    for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
        if (/^\s*```/.test(line)) {
            closeParagraph();
            closeList();
            if (inCodeFence) {
                html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
            }
            inCodeFence = !inCodeFence;
            continue;
        }

        if (inCodeFence) {
            codeLines.push(line);
            continue;
        }

        if (line.trim() === '') {
            closeParagraph();
            closeList();
            continue;
        }

        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) {
            closeParagraph();
            closeList();
            const level = Math.min(heading[1].length + 1, 6);
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            continue;
        }

        const item = /^\s*[-*+]\s+(.+)$/.exec(line);
        if (item) {
            closeParagraph();
            listItems.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
            continue;
        }

        paragraph.push(line.trim());
    }

    closeParagraph();
    closeList();
    if (codeLines.length > 0) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    return html.join('\n');
};

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
        ${entries.length > 24 ? `<p class="muted">+${entries.length - 24} more</p>` : ''}
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

export const renderPackagePage = ({
    latest,
    metadata,
    monthlyDownloads,
    readme,
    weeklyDownloads,
}: PackagePageData): string => {
    const packageUrl = normalizeUrl(`https://www.npmjs.com/package/${latest.name}`);
    const homepageUrl = normalizeUrl(latest.homepage ?? metadata.homepage);
    const repositoryUrl = getRepositoryUrl(latest.repository ?? metadata.repository);
    const bugsUrl = getBugsUrl(latest.bugs ?? metadata.bugs);
    const tarballUrl = normalizeUrl(latest.dist?.tarball);
    const maintainers = (latest.maintainers ?? metadata.maintainers ?? [])
        .map(getPersonText)
        .filter(Boolean);
    const keywords = latest.keywords ?? metadata.keywords ?? [];
    const modifiedAt = metadata.time?.modified;
    const publishedAt = metadata.time?.[latest.version] ?? modifiedAt;

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline';">
    <style>
        :root {
            color-scheme: light dark;
            --background: var(--vscode-editor-background);
            --foreground: var(--vscode-editor-foreground);
            --muted: var(--vscode-descriptionForeground);
            --border: var(--vscode-panel-border);
            --link: var(--vscode-textLink-foreground);
            --code-background: var(--vscode-textCodeBlock-background);
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
        .description, .muted, .empty-readme { color: var(--muted); }
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
        @media (max-width: 840px) {
            body { padding: 20px; }
            .content { grid-template-columns: 1fr; }
            .sidebar { border-left: 0; padding-left: 0; }
        }
    </style>
    <title>${escapeHtml(latest.name)}</title>
</head>
<body>
    <main class="shell">
        <header class="package-header">
            <h1>${escapeHtml(latest.name)}</h1>
            <p class="description">${escapeHtml(latest.description ?? metadata.description ?? '')}</p>
            <code class="install">${escapeHtml(`npm install ${latest.name}`)}</code>
            ${latest.deprecated ? `<p class="deprecated">${escapeHtml(latest.deprecated)}</p>` : ''}
        </header>
        <div class="content">
            <article class="readme">
                <h2>Readme</h2>
                ${readme.trim() === '' ? '<p class="empty-readme">No README found.</p>' : renderMarkdown(readme)}
            </article>
            <aside class="sidebar">
                <section class="side-section">
                    ${renderFact('Weekly Downloads', formatNumber(weeklyDownloads?.downloads))}
                    ${renderFact('Monthly Downloads', formatNumber(monthlyDownloads?.downloads))}
                    ${renderFact('Version', latest.version)}
                    ${renderFact('License', getLicenseText(latest.license ?? metadata.license))}
                    ${renderFact('Unpacked Size', formatBytes(latest.dist?.unpackedSize))}
                    ${renderFact('Total Files', formatNumber(latest.dist?.fileCount))}
                    ${renderFact('Published', formatDate(publishedAt))}
                    ${renderFact('Modified', formatDate(modifiedAt))}
                    ${renderFact('Author', getPersonText(latest.author ?? metadata.author))}
                </section>
                <section class="side-section">
                    <h3>Links</h3>
                    <div class="link-list">
                        ${renderLink('npm package page', packageUrl)}
                        ${renderLink('Homepage', homepageUrl)}
                        ${renderLink('Repository', repositoryUrl)}
                        ${renderLink('Issues', bugsUrl)}
                        ${renderLink('Tarball', tarballUrl)}
                    </div>
                </section>
                ${renderRecordList('Dist Tags', metadata['dist-tags'])}
                ${renderRecordList('Dependencies', latest.dependencies)}
                ${renderRecordList('Peer Dependencies', latest.peerDependencies)}
                ${renderRecordList('Optional Dependencies', latest.optionalDependencies)}
                ${renderRecordList('Dev Dependencies', latest.devDependencies)}
                ${renderRecordList('Engines', latest.engines)}
                ${renderTags('Keywords', keywords)}
                ${renderTags('Maintainers', maintainers)}
            </aside>
        </div>
    </main>
</body>
</html>`;
};
