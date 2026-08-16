import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXCLUDED_DIRECTORIES = new Set([
    '.git',
    '.github',
    'android',
    'node_modules',
    'tests',
    'tools',
]);
const EXCLUDED_FILES = new Set(['.gitignore', 'package.json', 'package-lock.json']);
const TEXT_EXTENSIONS = new Set([
    '.css', '.html', '.htm', '.js', '.json', '.mjs', '.svg', '.txt', '.webmanifest', '.xml',
]);

function toPosix(value) {
    return value.split(path.sep).join('/');
}

function isExternalReference(value) {
    return !value ||
        value.startsWith('#') ||
        value.startsWith('//') ||
        /^(?:[a-z][a-z\d+.-]*:)/i.test(value);
}

export function versionLocalReference(value, sourceFile, deployedFiles, version) {
    const trimmed = value.trim();
    if (isExternalReference(trimmed)) return value;

    const hashAt = trimmed.indexOf('#');
    const hash = hashAt >= 0 ? trimmed.slice(hashAt) : '';
    const withoutHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
    const queryAt = withoutHash.indexOf('?');
    const pathname = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
    const query = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';
    if (!pathname) return value;

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(pathname);
    } catch {
        return value;
    }
    const baseDirectory = path.posix.dirname(sourceFile);
    const resolved = path.posix.normalize(
        decodedPath.startsWith('/')
            ? decodedPath.slice(1)
            : path.posix.join(baseDirectory, decodedPath)
    );
    if (resolved.startsWith('../') || !deployedFiles.has(resolved)) return value;

    const params = new URLSearchParams(query);
    params.set('v', version);
    return pathname + '?' + params.toString() + hash;
}

function versionSrcset(value, sourceFile, deployedFiles, version) {
    return value.split(',').map(candidate => {
        const parts = candidate.trim().split(/\s+/);
        parts[0] = versionLocalReference(parts[0], sourceFile, deployedFiles, version);
        return parts.join(' ');
    }).join(', ');
}

export function versionTextReferences(text, sourceFile, deployedFiles, version) {
    // This also covers future HTML attributes and JavaScript string paths.
    // A string changes only when it resolves to a real deployed file.
    let output = text.replace(
        /(["'])([^"'\r\n]+)(\1)/g,
        (match, quote, value) => quote +
            versionLocalReference(value, sourceFile, deployedFiles, version) + quote
    );
    output = output.replace(
        /(\bsrcset\s*=\s*)(["'])([^"']*)(\2)/gi,
        (match, prefix, quote, value) =>
            prefix + quote + versionSrcset(value, sourceFile, deployedFiles, version) + quote
    );
    output = output.replace(
        /(url\(\s*)(["']?)([^"')]+)(\2)(\s*\))/gi,
        (match, prefix, quote, value, closingQuote, suffix) =>
            prefix + quote + versionLocalReference(value, sourceFile, deployedFiles, version) + closingQuote + suffix
    );
    return output;
}

async function collectFiles(sourceRoot, relativeDirectory, destinationName, files) {
    const absoluteDirectory = path.join(sourceRoot, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
        const relativePath = path.join(relativeDirectory, entry.name);
        const topLevelName = relativePath.split(path.sep)[0];
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRECTORIES.has(topLevelName) || topLevelName === destinationName) continue;
            await collectFiles(sourceRoot, relativePath, destinationName, files);
        } else if (entry.isFile() && !EXCLUDED_FILES.has(toPosix(relativePath))) {
            files.push(relativePath);
        }
    }
}

export async function buildSite(sourceDirectory, destinationDirectory, version) {
    if (!version || !/^[a-zA-Z0-9._-]+$/.test(version)) {
        throw new Error('Build version must contain only letters, numbers, dots, underscores, or hyphens.');
    }
    const sourceRoot = path.resolve(sourceDirectory);
    const destinationRoot = path.resolve(destinationDirectory);
    if (destinationRoot === sourceRoot || !destinationRoot.startsWith(sourceRoot + path.sep)) {
        throw new Error('The build directory must be a child of the source directory.');
    }

    const destinationName = path.relative(sourceRoot, destinationRoot).split(path.sep)[0];
    await rm(destinationRoot, { recursive: true, force: true });
    const files = [];
    await collectFiles(sourceRoot, '', destinationName, files);
    const deployedFiles = new Set(files.map(toPosix));

    for (const relativePath of files) {
        const sourcePath = path.join(sourceRoot, relativePath);
        const destinationPath = path.join(destinationRoot, relativePath);
        await mkdir(path.dirname(destinationPath), { recursive: true });
        const extension = path.extname(relativePath).toLowerCase();
        if (TEXT_EXTENSIONS.has(extension)) {
            const text = await readFile(sourcePath, 'utf8');
            const versioned = versionTextReferences(text, toPosix(relativePath), deployedFiles, version);
            await writeFile(destinationPath, versioned, 'utf8');
        } else {
            await copyFile(sourcePath, destinationPath);
        }
    }
    return { fileCount: files.length, version };
}

export function resolveBuildVersion(explicitVersion, environment = process.env) {
    return explicitVersion ||
        environment.CF_PAGES_COMMIT_SHA ||
        environment.GITHUB_SHA ||
        'local-build';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [, , sourceDirectory = '.', destinationDirectory = '_site', explicitVersion] = process.argv;
    const version = resolveBuildVersion(explicitVersion);
    const result = await buildSite(sourceDirectory, destinationDirectory, version);
    console.log(`Built ${result.fileCount} files with cache version ${result.version}.`);
}
