# How PaperPilot checks a paper

This explains the three helpers behind a scan in everyday language: the **rule checker**, the **machine learning helpers**, and **Gemini**.

---

## The short version

Think of PaperPilot like a teacher grading format:

1. **Rule checker** — opens a checklist (your Format Mechanics) and marks each item right or wrong. This is the main worker. It decides the score.
2. **Machine learning helpers** — small assistants that help with citations and with reading a style guide. They do **not** decide the score.
3. **Gemini** — a writing assistant that makes the “why” and “how to fix” easier to read. It may slightly change how serious an issue looks, but it does **not** invent new mistakes and does **not** change the score.

---

## 1. Rule checker (rule-based engine)

**What it is:** A fixed checklist that compares your manuscript to the Format Mechanics you confirmed (fonts, margins, spacing, indentation, alignment, page numbers, captions, citations, and so on).

**What it does:**

- Looks at many small parts of the document (called “units”)
- For each part, asks: “Does this match the format?”
- Marks it **pass** or **fail**
- Groups failures into the issues you see on Scan Results

**What you get from it:**

- The list of issues
- Where they appear (page and line)
- The Right / Incorrect percentages
- The score bars (Fonts, Margins, etc.)
- The overall score out of 100

**Important:** The score always comes from this checklist math. Nothing else changes the numbers.

---

## 2. Machine learning helpers

**What they are:** Small trained models that help with two jobs — not with scoring the whole paper.

**What they do:**

- **When you upload a format / style guide** — they help fill Format Mechanics fields so you do less typing by hand.
- **When checking citations** — they can flag citation problems with extra confidence, on top of the normal citation rules.

**What they do *not* do:**

- They do not set the overall score
- They do not decide Right / Incorrect %
- They do not replace the rule checklist

There is also a **machine learning service** (a separate background worker). For big files it runs the **same** checklist as above so the scan can show progress. If that worker is busy or offline, the main app runs the same checklist itself.

---

## 3. Gemini

**What it is:** Google’s AI used as a helper **after** the checklist finds issues.

**What it does:**

- Rewrites explanations so they are clearer (“Why”)
- Suggests clearer fixes (“Fix”)
- May move how serious an issue looks by **one step** only (for example from moderate to minor)

**What it does *not* do:**

- Add brand-new issues that the rules never found
- Change how many units passed or failed
- Change Right / Incorrect % or the overall score

If Gemini is turned off or unavailable, you still get a full scan — just with the original rule wording.

---

## What happens when you press Analyse

1. You upload a manuscript and pick (or confirm) Format Mechanics.
2. PaperPilot opens the document.
3. The **rule checker** walks through every format check and marks pass / fail.
4. **Machine learning helpers** may help a bit with citations (and earlier, with reading a style guide).
5. **Gemini** (if available) polishes the wording of the issues it already found.
6. PaperPilot adds up the pass / fail units into your score and percentages.
7. You see Scan Results, and you can download the report.

---

## Easy picture

| Helper | Job | Changes the score? |
|--------|-----|--------------------|
| Rule checker | Finds format problems and measures pass / fail | **Yes** — this is the score |
| Machine learning helpers | Help with style guides and citations | **No** |
| Gemini | Makes issue explanations easier to read | **No** (may only tweak how serious a label looks) |

---

## One sentence to remember

**Rules find and score the problems; machine learning helps a little on the side; Gemini explains the problems more clearly.**
