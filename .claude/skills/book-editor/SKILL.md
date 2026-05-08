---
name: book-editor
description: Edit and review technical book chapters in the D:/Notes repository. This skill defines a rigorous multi-pass editing workflow: read all chapters in a folder, cross-reference every technical claim against official documentation using WebFetch, fix inaccuracies, add missing knowledge, deepen shallow explanations, and verify changes. Use this skill whenever the user asks to "edit", "review", "refine", "完善", "审查", "补充", "对照文档", "继续下一部分", or improve any chapter or folder under D:/Notes. Use it even when the user says "check this chapter" without explicitly saying "edit" — they are asking for editing.
---

# Book Editor — D:/Notes Technical Book

This skill encodes the editorial workflow used to shape the D:/Notes repository into a professional English technical book targeting working .NET/C#/web engineers. It is the single source of truth for editing standards and workflow. There is no separate editing-plan or standard file — this skill replaces both.

## The editorial philosophy

This is NOT a study notebook, interview guide, or outline dump. The target book is **broad** (covers its subject responsibly), **deep** (teaches engineering judgment), **concrete** (recognizable in real production work), and **structured** (reads as a coherent book).

The original content is a starting point, not a finished manuscript. Do not treat existing text as authoritative — it may contain inaccuracies, gaps, shallow explanations, or outdated information.

## Core quality dimensions

1. **Technical accuracy** (highest priority) — Claims must be verified. Simplifications allowed only if they don't create misleading mental models. All content (existing AND new) must be cross-referenced against official documentation.
2. **Depth & mechanism** — Explain WHY something matters, WHERE it breaks down, WHAT trade-offs it introduces. Not just what API to call — how the mechanism works.
3. **Breadth within scope** — Cover both conceptual foundations and practical engineering implications. If a topic has design, runtime, performance, operational, and API-surface dimensions, touch each.
4. **Concrete teaching** — Rich, realistic code examples. Show configuration paths (project files, env vars, DI registration). Include verification steps where applicable.
5. **Scope & structure** — Each concept has one primary home. Chapters read as continuous narrative with logical progression.
6. **Professional voice** — Calm, book-like, teaches clearly. No training-scaffolding labels or Q&A headings. English only.

## Review priorities (in exact order)

1. Missing knowledge — important concepts/features/behaviors not covered
2. Inaccuracies — statements contradicting official docs or runtime reality
3. Weak depth — concepts named but not explained at mechanism level
4. Insufficient breadth — only covers easiest/most abstract parts
5. Lost concrete examples
6. Missing code examples
7. Missing config/verification paths
8. Structural misplacement
9. Unnecessary redundancy

## Multi-pass editing workflow

### Pass 1: Read and understand
- Glob the target folder to see all files
- Read ALL files in parallel to understand full scope
- Identify key technical topics in each chapter

### Pass 2: Cross-reference against official documentation (NEVER SKIP)
- For each key topic, WebFetch official documentation
- Documentation sources by domain:
  - .NET runtime/platform → `learn.microsoft.com/en-us/dotnet/core/`
  - C# language → `learn.microsoft.com/en-us/dotnet/csharp/`
  - ASP.NET Core → `learn.microsoft.com/en-us/aspnet/core/`
  - EF Core → `learn.microsoft.com/en-us/ef/core/`
  - SQL Server → `learn.microsoft.com/en-us/sql/`
  - General .NET/standards → `learn.microsoft.com/en-us/dotnet/standard/`
- Compare ALL existing content against official docs, not just new additions
- Identify: factual errors, missing features, shallow explanations, outdated version references, missing trade-offs
- If WebFetch returns 404, try alternative URLs or report honestly that the page couldn't be fetched
- Do NOT assume content is correct just because it "looks right"

### Pass 3: Edit
- Fix inaccuracies first, then add missing knowledge, then deepen, then broaden
- Use TaskCreate to track progress across edits
- Edit existing files; avoid creating new ones
- Default to no comments — only add one when the WHY is non-obvious

### Pass 4: Verify
- Re-read edited sections for coherence
- Ensure no prohibited labels or Q&A headings
- Confirm code examples are realistic
- Verify cross-references between chapters are still valid

## Style rules

**Prohibited labels:** `Key point:` `Important:` `Practical explanation:` `Engineering perspective:` `Why this matters:` `Why risky:` `Decision rule:` `Rule:`

**Prohibited Q&A headings:** `What is ...` `Why ...` `How ...` `When ...` `Should ...` `Can ...`

**Also avoid:** `Short answer:` / `Answer:` / `Detailed explanation:` / numbered question lines / `Follow-up:` / "Knowledge Checks" / "Common Mistakes" / "In this chapter we will..." preambles

## Transparency and accountability

- State findings explicitly at the start: "Found 3 inaccuracies and 5 missing topics"
- If you haven't verified something against official docs, say so — never imply verification that didn't happen
- If a WebFetch fails (404, timeout, wrong page), report it and try alternatives
- Report all changes in a summary table when work is complete
- The table should include: chapter file, change type (fix/addition), what was changed, and why it matters

## Chapter completion checklist

A chapter is complete only when ALL of these are true:
- [ ] All technical claims cross-referenced against official documentation
- [ ] No version-outdated content (current: .NET 10 / C# 14, May 2026)
- [ ] Mechanism-level depth present for all key concepts
- [ ] At least one realistic code example per major concept
- [ ] Configuration/verification paths shown where applicable
- [ ] No prohibited labels, Q&A headings, or training artifacts
- [ ] Cross-references to other chapters are accurate
- [ ] Reads as continuous narrative, not disconnected notes

## One folder at a time

Focus on one folder per editing session. Quality over speed. A partially-verified chapter is worse than an honestly-unreviewed one — it creates a false sense of completeness.

## Operational rules

- Always Read files before Editing
- Fetch official docs for every key topic — never skip this step
- When version information matters, check the latest docs first
- Keep updates between edits brief — one sentence is usually enough
- Typical reply cadence: state what you found, what you're fixing, then do it

## Updating this skill

When new patterns or lessons emerge from editing sessions, update this file. This skill is our accumulated editorial experience.
