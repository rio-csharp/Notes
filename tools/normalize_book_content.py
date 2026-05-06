from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IGNORE = {".git", ".github", "node_modules", "dist", "tools"}

DELETE_FILES = {
    "03-aspnet-core/12-aspnet-core-review-questions.md",
    "05-entity-framework-core/09-ef-core-review-questions.md",
    "08-security/09-security-review-questions.md",
    "11-react/09-react-review-questions.md",
    "13-architecture/10-architecture-review-questions.md",
    "24-learning-practice/04-knowledge-check-sets.md",
    "24-learning-practice/05-fullstack-knowledge-check-bank.md",
}

DELETE_TOP_LEVEL = {
    "04-dotnet-react-fullstack-knowledge-map.md",
    "06-30-day-study-plan.md",
    "07-coverage-map.md",
}

DELETE_SECTION_TITLES = {
    "## Knowledge Checks",
    "## Common Mistakes",
}


def iter_markdown_files() -> list[Path]:
    files = []
    for path in sorted(ROOT.rglob("*.md")):
        if any(part in IGNORE for part in path.parts):
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


def strip_chinese_notes(lines: list[str]) -> list[str]:
    result = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == "Chinese notes:":
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


def contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def strip_question_lines(lines: list[str]) -> list[str]:
    result = []
    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()
        if re.match(r"^#+\s+.*review questions", lower):
            continue
        if lower.startswith("follow-up: "):
            continue
        if re.match(r"^\d+\.\s+(what|why|how|when|where|which)\b", lower):
            continue
        if re.match(r"^-\s+(what|why|how|when|where|which)\b", lower):
            continue
        if lower in {"short answer:", "answer:", "detailed explanation:", "expected reasoning:", "questions:", "full knowledge check:"}:
            continue
        result.append(line)
    return result


def strip_cjk_lines(lines: list[str]) -> list[str]:
    return [line for line in lines if not contains_cjk(line)]


def normalize_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    lines = strip_chinese_notes(lines)
    lines = strip_cjk_lines(lines)

    i = 0
    while i < len(lines):
        if lines[i].strip() in DELETE_SECTION_TITLES:
            lines, i = remove_section(lines, i)
            continue
        i += 1

    lines = strip_question_lines(lines)
    text = "\n".join(lines).strip() + "\n"

    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    path.write_text(text, encoding="utf-8")


def main() -> None:
    for relative in sorted(DELETE_FILES | DELETE_TOP_LEVEL):
        target = ROOT / relative
        if target.exists():
            target.unlink()

    for path in iter_markdown_files():
        normalize_file(path)


if __name__ == "__main__":
    main()
