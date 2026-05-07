from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORE = {".git", ".github", ".claude", "node_modules", "dist", "tools"}
SKIP_FILES = {"README.md", "BOOK_EDITING_STANDARD.md"}

DELETE_FILES: set[str] = set()

DELETE_TOP_LEVEL: set[str] = set()

DELETE_SECTION_TITLES: set[str] = {
    "## Knowledge Checks",
    "## Common Mistakes",
    "## Practice Problems",
    "## Practice Tasks",
    "## Practice Scenarios",
}

PROHIBITED_LABELS: list[str] = [
    "Key point:",
    "Important:",
    "Practical explanation:",
    "Engineering perspective:",
    "Why this matters:",
    "Why risky:",
    "Decision rule:",
    "Rule:",
    "Short answer:",
    "Answer:",
    "Detailed explanation:",
    "Expected reasoning:",
    "Questions:",
    "Full knowledge check:",
    "Follow-up:",
    "Common mistake:",
    "Common misconception:",
    "Security principle:",
    "Security rule:",
    "Learning note:",
    "Trade-off:",
    "Why it works:",
    "Why positive numbers matter:",
]


def iter_markdown_files() -> list[Path]:
    files = []
    for path in sorted(ROOT.rglob("*.md")):
        if any(part in IGNORE for part in path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        files.append(path)
    return files


def remove_section(lines: list[str], start_index: int) -> tuple[list[str], int]:
    level_match = re.match(r"^(#+)\s+", lines[start_index])
    if not level_match:
        return [], start_index + 1
    level = len(level_match.group(1))
    end = start_index + 1
    while end < len(lines):
        match = re.match(r"^(#+)\s+", lines[end])
        if match and len(match.group(1)) <= level:
            break
        end += 1
    return lines[:start_index] + lines[end:], start_index


def contains_cjk(text: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in text)


def has_prohibited_label(line: str) -> bool:
    stripped = line.strip()
    for label in PROHIBITED_LABELS:
        if stripped.startswith(label):
            return True
    return False


# Auxiliary verbs that appear in English questions.
_aux = r"(is|are|was|were|do|does|did|should|can|could|would|will|shall|am|has|have|may|might|must)"


def is_qa_heading(line: str) -> bool:
    stripped = line.strip()
    # Modal headings: "Should We Use X", "Can Y Be Done" -- always Q&A style
    if re.match(r"^(#+)\s+(should|can)\s+", stripped, re.IGNORECASE):
        return True
    # Question-word headings: require auxiliary verb to distinguish
    # "How Branching Works" (descriptive) vs "How Does Branching Work" (Q&A)
    match = re.match(rf"^(#+)\s+(what|why|how|when|where|which)\s+{_aux}\b", stripped, re.IGNORECASE)
    return match is not None


def is_numbered_question(line: str) -> bool:
    stripped = line.strip().lower()
    return bool(re.match(rf"^\d+\.\s+(what|why|how|when|where|which)\s+{_aux}\b", stripped)) and "?" in stripped


def is_bullet_question(line: str) -> bool:
    stripped = line.strip().lower()
    return bool(re.match(rf"^-\s+(what|why|how|when|where|which)\s+{_aux}\b", stripped)) and "?" in stripped


def strip_chinese_notes(lines: list[str]) -> list[str]:
    """Remove blocks starting with 'Chinese notes:' followed by bullet items."""
    result = []
    i = 0
    while i < len(lines):
        if lines[i].strip().lower() == "chinese notes:":
            i += 1
            while i < len(lines):
                stripped = lines[i].strip()
                if stripped.startswith("- "):
                    i += 1
                    continue
                if stripped == "":
                    i += 1
                    break
                break
            continue
        result.append(lines[i])
        i += 1
    return result


def strip_cjk_lines(lines: list[str]) -> list[str]:
    return [line for line in lines if not contains_cjk(line)]


def strip_prohibited_labels(lines: list[str]) -> list[str]:
    return [line for line in lines if not has_prohibited_label(line)]


def strip_qa_headings(lines: list[str]) -> list[str]:
    return [line for line in lines if not is_qa_heading(line)]


def strip_question_lines(lines: list[str]) -> list[str]:
    return [
        line
        for line in lines
        if not is_numbered_question(line) and not is_bullet_question(line)
    ]


def normalize_file(path: Path) -> int:
    """Normalize a single file. Returns number of issues fixed."""
    issues = 0
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    original_len = len(lines)

    lines = strip_chinese_notes(lines)
    lines = strip_cjk_lines(lines)
    issues += original_len - len(lines)

    removed_sections = 0
    i = 0
    while i < len(lines):
        if lines[i].strip() in DELETE_SECTION_TITLES:
            lines, i = remove_section(lines, i)
            removed_sections += 1
            continue
        i += 1
    issues += removed_sections

    pre_label_len = len(lines)
    lines = strip_prohibited_labels(lines)
    issues += pre_label_len - len(lines)

    pre_qa_len = len(lines)
    lines = strip_qa_headings(lines)
    issues += pre_qa_len - len(lines)

    pre_question_len = len(lines)
    lines = strip_question_lines(lines)
    issues += pre_question_len - len(lines)

    text = "\n".join(lines).strip() + "\n"
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    if text != path.read_text(encoding="utf-8"):
        path.write_text(text, encoding="utf-8")

    return issues


def main() -> None:
    for relative in sorted(DELETE_FILES | DELETE_TOP_LEVEL):
        target = ROOT / relative
        if target.exists():
            target.unlink()
            print(f"  deleted: {relative}")

    files = iter_markdown_files()
    total_issues = 0
    files_changed = 0

    for path in files:
        issues = normalize_file(path)
        if issues > 0:
            rel = path.relative_to(ROOT)
            print(f"  fixed {issues:3d} issues in {rel}")
            total_issues += issues
            files_changed += 1

    print(f"\nNormalized {files_changed} of {len(files)} files ({total_issues} issues fixed).")


if __name__ == "__main__":
    main()
