# Book Editing Standard

## Purpose

This repository is being shaped into a professional English technical book rather than a study notebook, interview guide, or question bank. Every chapter revision should be checked against this standard before it is considered stable.

## Non-Negotiable Goals

Each chapter must be:

- technically correct;
- sufficiently complete for its scope;
- appropriately deep for a professional engineering audience;
- structurally coherent as a book chapter;
- concrete enough to teach real implementation and engineering judgment, not only abstract concepts;
- written in professional English;
- free of Chinese content unless explicitly required for a special appendix;
- free of interview-style or training-note scaffolding.

## Chapter Quality Bar

Before a chapter is called stable, it should satisfy all of the following.

### 1. Scope Clarity

- The chapter has a clear topic boundary.
- The reader can tell why the chapter exists and what it covers.
- Topics that belong to other chapters are mentioned briefly only when necessary, then deferred.
- The chapter does not feel like several unrelated mini-chapters glued together.

### 2. Coverage Completeness

- The important concepts for the chapter's scope are present.
- The chapter covers both conceptual foundations and practical engineering implications.
- Missing material is identified explicitly and added before the chapter is considered stable.
- Examples do not replace core explanation; they support it.
- If the old chapter contained meaningful concrete examples, implementation patterns, representative code, or operational scenarios, those should not be removed merely to make the prose shorter.
- A chapter is incomplete if it explains principles but no longer shows how those principles appear in real code, real APIs, real database queries, real UI structures, or real production workflows when such examples are central to the topic.

### 3. Depth And Professional Value

- Explanations go beyond definitions.
- The chapter explains why a concept matters, where it breaks down, and what trade-offs it introduces.
- Operational consequences, performance implications, and design consequences are included where they materially matter.
- The material is useful for real software engineering work, not only for passing interviews.
- Practical implementation detail is part of depth. A chapter should not become so abstract that a reader understands the idea but cannot recognize or apply it in actual engineering work.

### 4. Technical Accuracy

- Claims are precise enough for experienced readers.
- Simplifications are allowed only if they do not create a misleading mental model.
- When a simplification is used, the text should acknowledge the nuance if that nuance matters.
- Statements about runtime behavior, framework behavior, and architectural guidance must be checked carefully.

### 5. Book Structure

- The chapter reads like a continuous chapter, not a list of disconnected notes.
- There should be a logical progression from fundamentals to applied guidance.
- Repetition should be minimized.
- Dedicated recap files are allowed at folder level.
- Per-file summary sections are not required unless they materially improve flow.
- Book-like structure does not mean aggressively minimizing all concrete material. Rich, well-placed examples are compatible with good book structure and are often necessary for technical clarity.

### 6. Style And Tone

- The tone is professional, calm, and book-like.
- The prose should teach clearly without sounding like a lecture script or tutoring notes.
- Avoid explicit note labels such as:
  - `Key point:`
  - `Important:`
  - `Practical explanation:`
  - `Engineering perspective:`
  - `Why this matters:`
  - `Why risky:`
  - `Decision rule:`
  - `Rule:`
- Avoid explicit Q&A headings such as:
  - `What is ...`
  - `Why ...`
  - `How ...`
  - `When ...`
  - `Should ...`
  - `Can ...`
- Avoid direct interview framing, such as "common interview question" or "better answer."

### 7. Content Integration

- Review questions must be absorbed into normal exposition.
- Common mistakes must be integrated into the relevant knowledge sections instead of isolated as a training appendix.
- If a point has no natural home, add a normal subsection for it.
- Practice tasks should generally be removed unless the book later gains a deliberate exercises part.

### 8. Examples

- Examples must clarify the concept, not just fill space.
- Example code should be technically plausible and aligned with the surrounding explanation.
- Examples should illustrate trade-offs, not only idealized happy paths.
- Examples should not repeat the same idea excessively across files.
- Each chapter should retain enough concrete examples that the reader can see how the concept appears in real practice.
- When editing, prefer keeping a smaller number of high-value, representative examples rather than deleting implementation detail wholesale.
- High-value examples include:
  - representative code paths;
  - realistic API contracts;
  - database schema or query examples;
  - frontend markup, CSS, or rendering patterns;
  - production-safe authentication, authorization, or deployment flows;
  - failure, misuse, or edge-case examples that reveal trade-offs.
- If a concrete example is removed, its practical teaching value should be preserved elsewhere in the chapter unless the example was redundant or low-value.

### 8A. Concrete Material Preservation

- Rewriting must preserve knowledge density, not only conceptual cleanliness.
- A reduction in line count is acceptable only if the chapter still retains the important concrete material needed to teach the subject well.
- Removing scaffolding is good; removing too many concrete implementation details is not.
- A technically strong chapter usually includes both:
  - conceptual explanation;
  - concrete illustrations that a practitioner could recognize in real work.
- If a chapter becomes noticeably more abstract after editing, that is a review failure unless the abstraction is offset by equally strong concrete examples elsewhere in the same chapter.

### 9. Redundancy Control

- Repeated explanations should be consolidated.
- If a concept has a dedicated chapter, other chapters should only provide the minimum context needed.
- Repetition is acceptable only when it improves comprehension and each occurrence serves a distinct purpose.
- Redundancy control must not be used as a reason to strip away valuable examples, framework-specific implementation patterns, or representative code that carries unique teaching value.

### 10. Chapter Placement

- Each concept should live in the most natural chapter.
- If something is currently explained in the wrong chapter, it should be moved or reduced.
- Cross-references in prose are acceptable, but the main explanation should live in one primary place.

## Required Chapter Review Pass

Each chapter should go through this sequence:

1. Structural pass
   - Remove Q&A tails, review-question sections, Chinese notes, training scaffolding, and notebook artifacts.
2. Editorial review pass
   - Identify coverage gaps, shallow sections, redundancy, misplaced material, weak explanations, and places where concrete implementation detail has become too thin.
3. Rewrite pass
   - Fix the identified problems, not only the formatting.
4. Final verification pass
   - Check for Chinese residue, Q&A headings, note-style labels, chapter-flow issues, and whether the chapter still contains enough concrete examples and implementation detail for its topic.

## Required Review Output Format

When reviewing a chapter, findings should be stated explicitly and prioritized. The review should focus first on:

- missing knowledge;
- inaccurate or potentially misleading explanations;
- weak depth;
- loss of important concrete examples or implementation guidance;
- structural overlap or misplacement;
- unnecessary redundancy.

Only after the findings are addressed should the chapter be considered stable.

## Stability Rule

A chapter is not considered stable merely because:

- it is in English;
- it has no review questions;
- it has a recap file;
- it sounds cleaner than before.

A chapter is stable only when it has passed both:

- structural cleanup;
- substantive editorial review.
- concrete-material preservation review.

## Working Rule For Future Updates

Before editing any chapter:

1. Read this file.
2. Review the chapter against this standard.
3. State the findings.
4. Then revise the chapter.

During revision, explicitly protect:

- core concepts;
- representative concrete examples;
- high-value implementation patterns;
- practical engineering trade-offs;
- enough detail that the chapter remains useful to someone building real software.

If speed and quality conflict, quality wins.
