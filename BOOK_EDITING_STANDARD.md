# Book Editing Standard

## Purpose

This repository is being shaped into a professional English technical book — not a study notebook, interview guide, question bank, or outline dump.

The target book is **broad** (covers its subject responsibly), **deep** (teaches engineering judgment), **concrete** (recognizable in real work), and **structured** (reads as a coherent book, not accumulated notes). This standard protects all four qualities simultaneously.

**Important:** The original content is a starting point, not a finished manuscript. Chapters may contain inaccuracies, gaps, shallow explanations, or outdated information. Editing is not only about cleaning up style — it includes verifying correctness, filling knowledge gaps, deepening shallow sections, and rewriting entirely when needed. Do not treat the existing text as authoritative.

---

## Core Quality Dimensions

Every chapter must satisfy all six dimensions before it is considered stable.

### 1. Scope & Structure

- The chapter has a clear topic boundary; the reader understands why it exists and what it covers.
- Concepts live in their most natural chapter. Cross-references are fine, but the main explanation belongs in one primary place.
- The chapter reads as a continuous narrative with logical progression, not disconnected notes.
- Repeated explanations are consolidated. Redundancy is acceptable only when it serves a distinct purpose.
- Topics belonging elsewhere are mentioned briefly only when necessary, then deferred.

### 2. Depth & Mechanism

- Explanations go beyond definitions. The chapter explains **why** a concept matters, **where** it breaks down, and **what trade-offs** it introduces.
- For language, runtime, framework, and infrastructure topics, explain **how** the mechanism works — not only what API to call. The reader should build a mental model deep enough for reasoning, not only memorization.
- Operational consequences, performance implications, and design trade-offs are included where they materially matter.
- Simplified models are allowed only if they do not create misleading intuition. When a simplification is used, acknowledge the nuance if it matters.
- Examples of mechanism-level depth: why `await` becomes a state machine, why `IQueryable<T>` differs from `IEnumerable<T>`, why boxing allocates, why bounded channels create backpressure.
- **If existing content is too shallow** — only naming concepts without explaining them, or providing definitions without engineering context — rewrite it. A shallow paragraph that merely exists is worse than a missing one because it creates an illusion of coverage.

### 3. Breadth Within Scope

- The chapter covers the major dimensions a serious reader would expect — conceptual foundations **and** practical engineering implications.
- Breadth does not mean mentioning everything superficially. It means the chapter does not teach a distorted picture by covering only the easiest or most abstract parts.
- If a topic has meaningful design, runtime, performance, operational, and API-surface dimensions, touch each at least briefly.
- A chapter should not feel complete if it teaches only syntax, only theory, or only one framework-facing usage pattern.

### 4. Concrete Teaching

- Examples clarify the concept; they do not replace core explanation but support it.
- Rich, realistic code examples are a requirement, not optional. A strong chapter includes multiple substantial examples showing the concept in realistic usage — not only isolated toy snippets.
- High-value examples include: representative code paths, API contracts, database schemas, frontend markup/CSS, auth flows, and failure or edge-case examples that reveal trade-offs.
- When a concept is commonly configured (project files, runtime config, environment variables, DI registration, hosting setup), show at least one representative configuration path.
- When a concept is commonly misunderstood because readers cannot tell whether it is active, include a realistic verification or inspection step (command-line check, logging, diagnostics, runtime API).
- Rewriting must preserve knowledge density. Reducing line count is acceptable only when concrete teaching material is retained. Removing scaffolding is good; stripping away implementation detail is not.
- If a chapter becomes noticeably more abstract after editing, that is a review failure.

### 5. Technical Accuracy

- Claims are precise enough for experienced readers.
- Simplifications are allowed only if they do not create a misleading mental model.
- Statements about runtime behavior, framework behavior, and architectural guidance must be checked carefully.
- Examples should illustrate trade-offs, not only idealized happy paths.

### 6. Professional Voice

- The tone is professional, calm, and book-like. The prose teaches clearly without sounding like lecture scripts or tutoring notes.
- The chapter is written in English. No Chinese content unless explicitly required for a special appendix.
- Review questions, common mistakes, and practice tasks must be absorbed into normal exposition — never isolated as training appendices.
- No interview framing (e.g., "common interview question," "better answer").

---

## Style Rules (Quick Reference)

**Prohibited note labels:**
`Key point:` `Important:` `Practical explanation:` `Engineering perspective:` `Why this matters:` `Why risky:` `Decision rule:` `Rule:`

**Prohibited Q&A headings:**
`What is ...` `Why ...` `How ...` `When ...` `Should ...` `Can ...`

**Also avoid:**
- `Short answer:` / `Answer:` / `Detailed explanation:` / `Expected reasoning:` / `Questions:` / `Full knowledge check:`
- Numbered or bulleted question lines starting with what/why/how/when/where/which
- `Follow-up:` lines
- Dedicated "Knowledge Checks" or "Common Mistakes" sections

---

## Review Workflow

Every chapter goes through four passes:

| Pass | Focus |
|------|-------|
| **1. Structural** | Remove Q&A tails, review-question sections, Chinese content, training scaffolding, notebook artifacts, and prohibited labels/headings. |
| **2. Editorial** | Identify coverage gaps, shallow sections, missing concrete examples, missing config/verification paths, weak mechanism explanation, misplaced material, unnecessary redundancy, and — critically — **inaccurate or outdated claims**. State findings explicitly and prioritize them. Verify technical correctness against current documentation and real-world behavior. |
| **3. Rewrite** | Fix the identified problems — not only formatting. This may involve rewriting entire sections when the existing content is inaccurate, too shallow, or incomplete. Protect core concepts, breadth, representative examples, mechanism-level explanation, and activation/verification paths. |
| **4. Verification** | Check for residual Chinese, prohibited labels, chapter-flow issues, and whether the chapter still has enough depth, concrete examples, and implementation detail after cleanup. |

**Review priorities** (in order): missing knowledge → inaccuracies → weak depth → insufficient breadth → lost concrete examples → missing code examples → missing config/verification paths → structural misplacement → unnecessary redundancy.

---

## Stability Rule

A chapter is **not** stable merely because it is in English, has no review questions, has a recap file, sounds cleaner, or has a few examples.

A chapter is stable only after passing: structural cleanup, substantive editorial review, concrete-material preservation review, depth review, and example-density review.

---

## Editing Process

Before editing any chapter:
1. Read this standard.
2. Review the chapter against all six dimensions.
3. State the findings explicitly.
4. Revise the chapter.

During revision, explicitly protect: core concepts, breadth, representative concrete examples, mechanism-level explanation, and activation/configuration/verification paths.

If speed and quality conflict, quality wins.
