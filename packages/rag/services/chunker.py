import re
from typing import Any

SECTION_HEADERS = [
    "abstract", "introduction", "background", "related work",
    "methodology", "methods", "approach", "experiments",
    "results", "discussion", "conclusion", "conclusions",
    "future work", "acknowledgements", "acknowledgments", "references",
]


def split_text(
    full_text: str,
    paper_id: str,
    pages: list[dict[str, Any]],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[dict[str, Any]]:
    """
    Split paper text into chunks. Each chunk carries paper_id, chunk_index,
    and an accurate page number derived from the exact character offset in `full_text`.
    """
    if not full_text:
        return []

    # Page offsets must be computed exactly against the string we chunk.
    # full_text is assumed to be the concatenation of page texts joined by "\n"
    # (one newline between pages). +1 accounts for that delimiter.
    page_offsets: list[tuple[int, int]] = []
    offset = 0
    for page in pages:
        page_offsets.append((offset, page["page"]))
        offset += len(page["text"]) + 1  # +1 for the "\n" join separator

    def page_for(char_offset: int) -> int:
        page_num = pages[0]["page"] if pages else 1
        for (start_off, pnum) in page_offsets:
            if char_offset >= start_off:
                page_num = pnum
            else:
                break
        return page_num

    chunks: list[dict[str, Any]] = []
    start = 0
    idx = 0
    text_len = len(full_text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk_text = full_text[start:end]
        chunks.append({
            "paper_id": paper_id,
            "chunk_index": idx,
            "text": chunk_text,
            "page": page_for(start),
            "char_offset": start,
        })
        idx += 1
        if end == text_len:
            break
        start = end - chunk_overlap

    return chunks


def detect_sections(full_text: str) -> list[dict[str, Any]]:
    """Detect section headers in the paper text."""
    lines = full_text.split("\n")
    sections = []
    current_section = None
    current_content: list[str] = []

    for line in lines:
        stripped = line.strip().lower()
        matched = None
        for header in SECTION_HEADERS:
            pattern = rf"^(\d+\.?\s+)?{re.escape(header)}[\s:]*$"
            if re.match(pattern, stripped):
                matched = header
                break

        if matched:
            if current_section:
                sections.append({
                    "name": current_section,
                    "content": "\n".join(current_content).strip(),
                    "start_page": 1,
                })
            current_section = matched.capitalize()
            current_content = []
        elif current_section:
            current_content.append(line)
        # else: lines before the first section (title/authors) are dropped

    if current_section:
        sections.append({
            "name": current_section,
            "content": "\n".join(current_content).strip(),
            "start_page": 1,
        })

    return sections
