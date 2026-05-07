import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { marked } from "marked";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const tempDir = path.join(distDir, ".build");
const outputEpub = path.join(distDir, "notes.epub");
const outputPdf = path.join(distDir, "notes.pdf");
const outputHtml = path.join(distDir, "notes.html");
const metadataFile = path.join(tempDir, "metadata.yaml");
const combinedMarkdownFile = path.join(tempDir, "notes.md");
const pdfHtmlFile = path.join(tempDir, "notes-for-pdf.html");
const epubCssFile = path.join(tempDir, "epub.css");

const ignoredDirs = new Set([".git", ".github", ".claude", "node_modules", "dist", "tools"]);
const preferredFrontMatter = [
  "README.md",
];

const bookTitle = ".NET + Fullstack Engineering Notes";

marked.setOptions({
  gfm: true,
  breaks: false,
});

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

async function fileExists(targetPath) {
  try {
    await readFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePandocPath() {
  const candidates = [
    "pandoc",
    "C:\\Program Files\\Pandoc\\pandoc.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Pandoc", "pandoc.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { cwd: rootDir, windowsHide: true });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Pandoc is not installed or not available in PATH.");
}

async function collectMarkdownFiles(currentDir = rootDir, relativeDir = "") {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const files = [];

  for (const entry of sorted) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...(await collectMarkdownFiles(fullPath, relativePath)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push({
        fullPath,
        relativePath,
      });
    }
  }

  return files;
}

function sortBookFiles(files) {
  const preferredOrder = new Map(
    preferredFrontMatter.map((item, index) => [normalizeSlashes(item), index]),
  );

  return [...files].sort((a, b) => {
    const aRel = normalizeSlashes(a.relativePath);
    const bRel = normalizeSlashes(b.relativePath);
    const aPreferred = preferredOrder.has(aRel);
    const bPreferred = preferredOrder.has(bRel);

    if (aPreferred && bPreferred) {
      return preferredOrder.get(aRel) - preferredOrder.get(bRel);
    }

    if (aPreferred) {
      return -1;
    }

    if (bPreferred) {
      return 1;
    }

    return aRel.localeCompare(bRel, "en");
  });
}

async function extractTitle(filePath, fallbackTitle) {
  const content = await readFile(filePath, "utf8");
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallbackTitle;
}

async function buildCombinedMarkdown(files) {
  const sections = [];

  sections.push(`# ${bookTitle}`);
  sections.push("");
  sections.push("> Merged from the Markdown notes in this repository.");
  sections.push("");
  sections.push("## Contents");
  sections.push("");

  for (const file of files) {
    const title = await extractTitle(file.fullPath, path.basename(file.relativePath, ".md"));
    sections.push(`- ${title}`);
  }

  for (const file of files) {
    const content = await readFile(file.fullPath, "utf8");
    sections.push("");
    sections.push("\\newpage");
    sections.push("");
    sections.push(content.trim());
    sections.push("");
  }

  return sections.join("\n");
}

function buildMetadata() {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `title: "${bookTitle}"`,
    'author: "Rio"',
    `date: "${date}"`,
    'lang: "en-US"',
    'rights: "All rights reserved."',
  ].join("\n");
}

function buildEpubCss() {
  return `
body {
  font-family: "Georgia", serif;
  line-height: 1.62;
  color: #222;
}

h1, h2, h3, h4 {
  line-height: 1.3;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.9em;
  line-height: 1.45;
  font-size: 0.88em;
}

code {
  font-family: "Cascadia Code", "Fira Code", "Consolas", "Menlo", monospace;
}

p code, li code, td code, th code, blockquote code {
  background: #f0f0f0;
  border-radius: 4px;
  padding: 0.08em 0.24em;
}

blockquote {
  color: #444;
  border-left: 0.28em solid #c9c9c9;
  padding-left: 0.9em;
  margin-left: 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.94em;
}

th, td {
  border: 1px solid #d8d8d8;
  padding: 0.45em 0.55em;
  vertical-align: top;
}

th {
  background: #f4f4f4;
}
`;
}

function buildPdfCss() {
  return `
@page {
  size: A4;
  margin: 18mm 14mm 18mm 14mm;
}

body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: #202124;
  line-height: 1.62;
  margin: 0;
  font-size: 14px;
}

main {
  max-width: 100%;
}

h1, h2, h3, h4 {
  line-height: 1.28;
  page-break-after: avoid;
  break-after: avoid-page;
}

h1 {
  font-size: 28px;
  margin: 0 0 16px;
}

h2 {
  font-size: 22px;
  margin-top: 28px;
}

h3 {
  font-size: 18px;
  margin-top: 22px;
}

p, li, td, th, blockquote {
  font-size: 14px;
}

ul, ol {
  padding-left: 24px;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 12px 14px;
  line-height: 1.5;
  font-size: 12px;
  page-break-inside: avoid;
  break-inside: avoid-page;
}

code {
  font-family: "Cascadia Code", "Fira Code", "Consolas", "Menlo", monospace;
}

p code, li code, td code, th code, blockquote code {
  background: #eef1f4;
  border-radius: 4px;
  padding: 1px 4px;
}

blockquote {
  margin: 16px 0;
  padding: 4px 14px;
  border-left: 4px solid #c7c7c7;
  color: #444;
  background: #fafafa;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
}

th, td {
  border: 1px solid #d8d8d8;
  padding: 8px 10px;
  vertical-align: top;
}

th {
  background: #f3f4f6;
}

.title-page {
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  page-break-after: always;
}

.title-page .subtitle,
.title-page .meta {
  color: #5f6368;
}

.source-path {
  color: #5f6368;
  font-size: 12px;
  margin-bottom: 16px;
}

.chapter {
  page-break-before: always;
}
`;
}

function buildPdfHtml(files, renderedSections) {
  const tocItems = files
    .map((file, index) => {
      const title = renderedSections[index].title;
      return `<li>${escapeHtml(title)}</li>`;
    })
    .join("\n");

  const chapters = renderedSections
    .map(({ html }) => {
      return `
      <section class="chapter">
        ${html}
      </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(bookTitle)}</title>
    <style>${buildPdfCss()}</style>
  </head>
  <body>
    <main>
      <section class="title-page">
        <h1>${escapeHtml(bookTitle)}</h1>
        <p class="subtitle">Merged from the Markdown notes in this repository.</p>
        <p class="meta">Generated with Pandoc and Playwright.</p>
      </section>
      <section>
        <h2>Contents</h2>
        <ol>${tocItems}</ol>
      </section>
      ${chapters}
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderSectionsForPdf(files) {
  const sections = [];

  for (const file of files) {
    const markdown = (await readFile(file.fullPath, "utf8")).trim();
    const title = await extractTitle(file.fullPath, path.basename(file.relativePath, ".md"));
    const html = marked.parse(markdown);
    sections.push({
      title,
      relativePath: file.relativePath,
      html,
    });
  }

  return sections;
}

async function buildEpub(pandocPath) {
  await execFileAsync(
    pandocPath,
    [
      combinedMarkdownFile,
      "--from",
      "gfm",
      "--to",
      "epub3",
      "--metadata-file",
      metadataFile,
      "--css",
      epubCssFile,
      "--toc",
      "--toc-depth=3",
      "--standalone",
      "--output",
      outputEpub,
    ],
    { cwd: rootDir, windowsHide: true },
  );
}

async function buildHtml(pandocPath) {
  await execFileAsync(
    pandocPath,
    [
      combinedMarkdownFile,
      "--from",
      "gfm",
      "--to",
      "html5",
      "--metadata-file",
      metadataFile,
      "--toc",
      "--toc-depth=3",
      "--standalone",
      "--output",
      outputHtml,
    ],
    { cwd: rootDir, windowsHide: true },
  );
}

async function buildPdf() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${normalizeSlashes(pdfHtmlFile)}`, {
      waitUntil: "networkidle",
    });
    await page.pdf({
      path: outputPdf,
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const pandocPath = await resolvePandocPath();
  const markdownFiles = sortBookFiles(await collectMarkdownFiles());

  if (markdownFiles.length === 0) {
    throw new Error("No Markdown files found.");
  }

  await mkdir(distDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  const combinedMarkdown = await buildCombinedMarkdown(markdownFiles);
  const renderedSections = await renderSectionsForPdf(markdownFiles);

  await writeFile(metadataFile, buildMetadata(), "utf8");
  await writeFile(combinedMarkdownFile, combinedMarkdown, "utf8");
  await writeFile(epubCssFile, buildEpubCss(), "utf8");
  await writeFile(pdfHtmlFile, buildPdfHtml(markdownFiles, renderedSections), "utf8");

  await buildEpub(pandocPath);
  await buildHtml(pandocPath);
  await buildPdf();

  console.log(`Created: ${outputEpub}`);
  console.log(`Created: ${outputPdf}`);
  console.log(`Created: ${outputHtml}`);
  console.log(`Chapters: ${markdownFiles.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
