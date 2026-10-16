# Why Moderate has the most issues

The pills in your screenshot are **counts of findings**, not a ranking of which label is more serious.

| Pill | Findings |
| --- | ---: |
| Minor | 1,897 |
| Moderate | 3,237 |
| Critical | 372 |

Critical is the most serious label and the smallest count. Moderate is the largest count because those checks run on the most lines. Minor is second because its checks run less often than alignment and spacing, but more often than the critical checks on this manuscript.

Each pill adds **one** for every place a rule failed (a line, a paragraph, a page, or a citation). A long thesis can produce thousands of findings even when only a few rule types are involved.

## Basis for each severity

Severity is chosen by **what failed**, then kept as the scan walks the document. It is not chosen by how many times the failure appears.

A later wording pass may move a finding **one step** (minor to moderate, or moderate to critical) when the measurement supports it. A minor finding is not jumped straight to critical.

### Critical

A mismatch that changes the required look of the page in a way that is hard to miss.

- Font family is not the one in the format mechanics (counted once per line).
- Font size is not the size required for that role, such as body, Heading 1, or Heading 2 (counted once per line). A size within 0.75 pt still passes.
- Paper size does not match (counted once per page).
- A margin is off by **more than 0.45 inches** after tolerance.

### Moderate

A real mismatch that should be fixed, but it is a layout or style choice rather than the wrong typeface or page size.

- Line spacing does not match (counted once per prose paragraph).
- Alignment does not match (counted once per body line longer than 40 characters).
- A required page number is missing, or it sits in the wrong place (counted once per page).
- An in-text citation marker does not follow the uploaded style (counted once per mismatched citation).
- Page orientation does not match (counted once per page).
- A margin is off by **more than 0.2 inches and up to 0.45 inches** after tolerance.

Alignment and line spacing are the reason this pill is the largest. They are checked across almost the whole body of the manuscript, so one wrong setting becomes a finding on every affected line or paragraph.

### Minor

A smaller or local mismatch.

- First-line indent does not match (counted once per paragraph start, not once per line).
- Font color is not black when the mechanics require black (counted once per line).
- A page number appears on the first page of a chapter when the mechanics say to hide it.
- A table or figure caption does not follow the naming rule.
- A margin is off by **0.2 inches or less** after tolerance.

Indentation is the usual reason minor is second. It only marks the start of a paragraph, so it produces fewer findings than alignment, which marks long body lines, but more findings than the critical checks when most of the text is already the right font and size.

## How a margin is labeled

Margins are the only check that picks severity from the size of the error. Other checks use a fixed label.

1. Differences of **0.15 inches or less** are ignored. They are treated as rounding, not an issue.
2. The leftover gap is then labeled:
   - **0.2 inches or less:** minor
   - **more than 0.2 and up to 0.45 inches:** moderate
   - **more than 0.45 inches:** critical

On a PDF, only a margin that is **too small** fails. Extra space past the required margin is allowed. On a Word file, the margin must match the required value in either direction.

## What this scan is saying

3,237 moderate findings means layout rules (most often alignment and spacing, plus page numbers and citations) failed in many places. 1,897 minor findings means smaller rules, most often indentation, failed in fewer places. 372 critical findings means wrong font, wrong size, wrong paper, or a large margin gap showed up much less often than those layout checks.

Fixing the moderate rules usually drops the count the fastest, because one paragraph setting is being reported once for every line or paragraph that uses it.
