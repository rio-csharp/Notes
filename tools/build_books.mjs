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
const combinedMarkdownForPdfFile = path.join(tempDir, "notes-for-pdf.md");
const pdfHtmlFile = path.join(tempDir, "notes-for-pdf.html");
const epubCssFile = path.join(tempDir, "epub.css");

const ignoredDirs = new Set([".git", ".github", ".claude", "node_modules", "dist", "tools"]);
const preferredFrontMatter = ["README.md"];

const bookTitle = ".NET + Fullstack Engineering Notes";

// Map folder prefixes to display names. Parts appear in TOC as major grouping headers.
function partLabel(folderName) {
  if (folderName === "." || folderName === "README.md") return "Introduction";
  const partMap = {
    "01-dotnet-platform": "Part I — .NET Platform",
    "02-csharp": "Part II — C#",
    "03-aspnet-core": "Part III — ASP.NET Core",
    "04-dependency-injection": "Part IV — Dependency Injection",
    "05-database-sql": "Part V — Database & SQL",
    "06-entity-framework-core": "Part VI — Entity Framework Core",
    "07-web-api-design": "Part VII — Web API Design",
    "08-security": "Part VIII — Security",
    "09-frontend-foundation": "Part IX — Frontend Foundation",
    "10-javascript-typescript": "Part X — JavaScript & TypeScript",
    "11-react": "Part XI — React",
    "12-frontend-architecture": "Part XII — Frontend Architecture",
    "13-architecture": "Part XIII — Software Architecture",
    "14-design-patterns": "Part XIV — Design Patterns",
    "15-data-structures-algorithms": "Part XV — Data Structures & Algorithms",
    "16-common-technologies": "Part XVI — Common Technologies",
    "17-performance-scalability": "Part XVII — Performance & Scalability",
    "18-system-design": "Part XVIII — System Design",
    "19-devops-cloud": "Part XIX — DevOps & Cloud",
    "20-testing-quality": "Part XX — Testing & Quality",
    "21-production-troubleshooting": "Part XXI — Production Troubleshooting",
    "22-business-scenarios": "Part XXII — Business Scenarios",
    "23-architecture-decision-making": "Part XXIII — Architecture Decision Making",
    "24-learning-practice": "Part XXIV — Learning & Practice",
    "25-code-quality-maintainability": "Part XXV — Code Quality & Maintainability",
  };
  return partMap[folderName] ?? folderName;
}

marked.setOptions({ gfm: true, breaks: false });

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
      files.push({ fullPath, relativePath });
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
    if (aPreferred && bPreferred) return preferredOrder.get(aRel) - preferredOrder.get(bRel);
    if (aPreferred) return -1;
    if (bPreferred) return 1;
    return aRel.localeCompare(bRel, "en");
  });
}

async function extractTitle(filePath, fallbackTitle) {
  const content = await readFile(filePath, "utf8");
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallbackTitle;
}

async function readFileForBook(file) {
  let content = await readFile(file.fullPath, "utf8");
  const marker = "<!-- END_BOOK -->";
  const idx = content.indexOf(marker);
  if (idx !== -1) content = content.slice(0, idx).trimEnd();
  return content;
}

// Group sorted flat files by their top-level folder for hierarchical TOC.
function groupFilesByPart(files) {
  const groups = [];
  for (const f of files) {
    const rel = normalizeSlashes(f.relativePath);
    const folder = rel.split("/")[0];
    if (groups.length === 0 || groups[groups.length - 1].folder !== folder) {
      groups.push({ folder, files: [] });
    }
    groups[groups.length - 1].files.push(f);
  }
  return groups;
}

// Demote markdown headings by two levels so PDF bookmarks are properly nested:
//   h1 = book title, h2 = part, h3 = chapter, h4+ = chapter sections.
function demoteHeadingsTwoLevels(markdown) {
  return markdown
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,6})\s/);
      if (!m) return line;
      const level = m[1].length;
      if (level >= 5) return line;
      return "#".repeat(level + 2) + line.slice(level);
    })
    .join("\n");
}

// Build the combined markdown file that Pandoc consumes (flat TOC, no heading demotion).
async function buildCombinedMarkdown(files) {
  const sections = [];
  sections.push(`# ${bookTitle}`);
  sections.push("");
  sections.push("> Merged from the Markdown notes in this repository.");
  sections.push("");
  sections.push("## Contents");
  sections.push("");

  const groups = groupFilesByPart(files);
  for (const group of groups) {
    sections.push(`### ${partLabel(group.folder)}`);
    for (const file of group.files) {
      const title = await extractTitle(file.fullPath, path.basename(file.relativePath, ".md"));
      sections.push(`- ${title}`);
    }
    sections.push("");
  }

  for (const group of groups) {
    sections.push(`## ${partLabel(group.folder)}`);
    sections.push("");
    for (const file of group.files) {
      const content = await readFileForBook(file);
      sections.push("");
      sections.push("\\newpage");
      sections.push("");
      sections.push(content.trim());
      sections.push("");
    }
  }

  return sections.join("\n");
}

// Build the combined markdown for PDF: headings demoted so Chromium produces
// hierarchical PDF bookmarks (h1=book title, h2=part, h3=chapter, h4+=content).
async function buildCombinedMarkdownForPdf(files) {
  const sections = [];
  sections.push(`# ${bookTitle}`);
  sections.push("");

  const groups = groupFilesByPart(files);
  for (const group of groups) {
    sections.push(`## ${partLabel(group.folder)}`);
    sections.push("");
    for (const file of group.files) {
      const content = await readFileForBook(file);
      // Demote each chapter's headings: # -> ##, ## -> ###, ### -> ####
      const demoted = demoteHeadingsTwoLevels(content);
      sections.push(demoted.trim());
      sections.push("");
      sections.push("\\newpage");
      sections.push("");
    }
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
body { font-family: "Georgia", serif; line-height: 1.62; color: #222; }
h1, h2, h3, h4 { line-height: 1.3; }
pre { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 0.9em; line-height: 1.45; font-size: 0.88em; }
code { font-family: "Cascadia Code", "Fira Code", "Consolas", "Menlo", monospace; }
p code, li code, td code, th code, blockquote code { background: #f0f0f0; border-radius: 4px; padding: 0.08em 0.24em; }
blockquote { color: #444; border-left: 0.28em solid #c9c9c9; padding-left: 0.9em; margin-left: 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.94em; }
th, td { border: 1px solid #d8d8d8; padding: 0.45em 0.55em; vertical-align: top; }
th { background: #f4f4f4; }
  `.trim();
}

function buildPdfCss() {
  return `
@page { size: A4; margin: 18mm 14mm 18mm 14mm; }
body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #202124; line-height: 1.62; margin: 0; font-size: 14px; }
main { max-width: 100%; }

h1, h2, h3, h4 { line-height: 1.28; page-break-after: avoid; break-after: avoid-page; }
h1 { font-size: 28px; margin: 0 0 16px; }
h2 { font-size: 22px; margin-top: 28px; }
h3 { font-size: 18px; margin-top: 22px; }
p, li, td, th, blockquote { font-size: 14px; }
ul, ol { padding-left: 24px; }

pre { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px 14px; line-height: 1.5; font-size: 12px; page-break-inside: avoid; break-inside: avoid-page; }
code { font-family: "Cascadia Code", "Fira Code", "Consolas", "Menlo", monospace; }
p code, li code, td code, th code, blockquote code { background: #eef1f4; border-radius: 4px; padding: 1px 4px; }

blockquote { margin: 16px 0; padding: 4px 14px; border-left: 4px solid #c7c7c7; color: #444; background: #fafafa; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
th, td { border: 1px solid #d8d8d8; padding: 8px 10px; vertical-align: top; }
th { background: #f3f4f6; }

/* ── title page ── */
.title-page { min-height: 80vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
.title-page .subtitle, .title-page .meta { color: #5f6368; }

/* ── hierarchical TOC ── */
.toc { page-break-after: always; }
.toc h2 { font-size: 24px; margin-bottom: 18px; }
.toc-part { margin: 18px 0 8px; font-size: 14px; font-weight: 700; color: #333; }
.toc-list { list-style: none; padding-left: 0; margin: 0 0 0 0; }
.toc-list li { padding: 3px 0 3px 16px; font-size: 13px; border-left: 2px solid #e0e0e0; margin-left: 4px; }
.toc-list li a { color: #1a73e8; text-decoration: none; }
.toc-list li a::after { content: ""; }

.source-path { color: #5f6368; font-size: 12px; margin-bottom: 16px; }
.chapter { page-break-before: always; }
.part-heading { font-size: 20px; margin: 0; padding: 10px 0; color: #5f6368; font-weight: 600; page-break-before: always; }
  `.trim();
}

// Emit the PDF HTML page. Hierarchical TOC with clickable links, grouped by part.
function buildPdfHtml(files, renderedSections) {
  // Build index: relativePath -> section index
  const sectionByPath = new Map();
  renderedSections.forEach((s, i) => sectionByPath.set(normalizeSlashes(s.relativePath), i));

  const groups = groupFilesByPart(files);
  const tocParts = groups.map((group) => {
    const items = group.files.map((f) => {
      const idx = sectionByPath.get(normalizeSlashes(f.relativePath));
      const title = renderedSections[idx]?.title ?? path.basename(f.relativePath, ".md");
      return `<li><a href="#ch-${idx}">${escapeHtml(title)}</a></li>`;
    }).join("\n");
    return `<div class="toc-part">${escapeHtml(partLabel(group.folder))}</div><ol class="toc-list">${items}</ol>`;
  }).join("\n");

  // Build chapter sections with part h2 headings injected between groups.
  // This gives Chromium a 3-level bookmark hierarchy: Book(h1) → Part(h2) → Chapter(h3).
  const chapterBlocks = [];
  let sectionIndex = 0;
  for (const group of groups) {
    chapterBlocks.push(`<h2 class="part-heading" id="part-${sectionIndex}">${escapeHtml(partLabel(group.folder))}</h2>`);
    for (let i = 0; i < group.files.length; i++) {
      const s = renderedSections[sectionIndex];
      chapterBlocks.push(`<section class="chapter" id="ch-${sectionIndex}">${s.html}</section>`);
      sectionIndex++;
    }
  }
  const chapters = chapterBlocks.join("\n");

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
      <section class="toc">
        <h2>Contents</h2>
        ${tocParts}
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
    const markdown = await readFile(file.fullPath, "utf8");
    const title = await extractTitle(file.fullPath, path.basename(file.relativePath, ".md"));
    // Demote headings so PDF bookmarks are hierarchical:
    //   h1 = book title  (title page only)
    //   h2 = part label   (inserted before each group)
    //   h3 = chapter title (demoted from #)
    //   h4+ = chapter sections
    const demoted = demoteHeadingsTwoLevels(markdown);
    sections.push({ title, relativePath: normalizeSlashes(file.relativePath), html: marked.parse(demoted) });
  }
  return sections;
}

async function buildEpub(pandocPath) {
  await execFileAsync(pandocPath, [
    combinedMarkdownFile, "--from", "gfm", "--to", "epub3",
    "--metadata-file", metadataFile, "--css", epubCssFile,
    "--toc", "--toc-depth=3", "--standalone",
    "--output", outputEpub,
  ], { cwd: rootDir, windowsHide: true });
}

async function buildHtml(pandocPath) {
  await execFileAsync(pandocPath, [
    combinedMarkdownFile, "--from", "gfm", "--to", "html5",
    "--metadata-file", metadataFile,
    "--toc", "--toc-depth=3", "--standalone",
    "--output", outputHtml,
  ], { cwd: rootDir, windowsHide: true });
}

async function buildPdf() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${normalizeSlashes(pdfHtmlFile)}`, { waitUntil: "networkidle" });

    // Use CDP Page.printToPDF with generateDocumentOutline so Chromium produces
    // proper PDF bookmarks from h1/h2/h3 headings. Playwright's page.pdf()
    // wrapper does not expose this parameter.
    const client = await page.context().newCDPSession(page);
    const { data } = await client.send("Page.printToPDF", {
      paperWidth: 8.27,    // A4 width  in inches
      paperHeight: 11.69,  // A4 height in inches
      printBackground: true,
      marginTop: 0.472,    // 12mm in inches
      marginRight: 0.394,  // 10mm in inches
      marginBottom: 0.472, // 12mm in inches
      marginLeft: 0.394,   // 10mm in inches
      generateDocumentOutline: true,
    });
    await writeFile(outputPdf, Buffer.from(data, "base64"));
  } finally {
    await browser.close();
  }
}

async function main() {
  const pandocPath = await resolvePandocPath();
  const markdownFiles = sortBookFiles(await collectMarkdownFiles());
  if (markdownFiles.length === 0) throw new Error("No Markdown files found.");

  await mkdir(distDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  // EPUB / stand-alone HTML use the flat-markdown path (Pandoc generates TOC itself).
  const combinedMarkdown = await buildCombinedMarkdown(markdownFiles);
  await writeFile(combinedMarkdownFile, combinedMarkdown, "utf8");
  await writeFile(metadataFile, buildMetadata(), "utf8");
  await writeFile(epubCssFile, buildEpubCss(), "utf8");

  await buildEpub(pandocPath);
  await buildHtml(pandocPath);

  // PDF goes through a dedicated HTML path for hierarchical TOC + heading demotion.
  const combinedMarkdownForPdf = await buildCombinedMarkdownForPdf(markdownFiles);
  await writeFile(combinedMarkdownForPdfFile, combinedMarkdownForPdf, "utf8");

  const renderedSections = await renderSectionsForPdf(markdownFiles);
  await writeFile(pdfHtmlFile, buildPdfHtml(markdownFiles, renderedSections), "utf8");
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
