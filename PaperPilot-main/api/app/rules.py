"""Deterministic checks Gemini must not invent (completeness, length, structure)."""

REQUIRED_HEADINGS = (
    "abstract",
    "introduction",
    "methodology",
    "results",
    "conclusion",
    "references",
)


def evaluate_manuscript(title: str, abstract: str, text: str) -> dict:
    blob = f"{title}\n{abstract}\n{text}".lower()
    flags: list[str] = []
    score = 100

    if len(title.strip()) < 8:
        flags.append("Title is too short.")
        score -= 15

    if len(abstract.strip()) < 80:
        flags.append("Abstract is missing or too short (need ~80+ characters).")
        score -= 20

    missing = [h for h in REQUIRED_HEADINGS if h not in blob]
    if missing:
        flags.append("Missing likely sections: " + ", ".join(missing))
        score -= min(40, 8 * len(missing))

    words = len(text.split())
    if words < 200:
        flags.append("Body text is very short for a full manuscript.")
        score -= 15

    score = max(0, min(100, score))
    return {"score": score, "flags": flags, "passed": score >= 60}
