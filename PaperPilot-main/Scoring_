# Scoring Explained (Simple Math)

How PaperPilot turns a scanned paper into **Right %**, **Wrong %**, **category scores**, and the **overall /100** number. Web and PDF reports use the same math; the PDF often shows more decimals (e.g. `29` vs `29.46`).

---

## Big picture

```mermaid
flowchart TD
  A[Upload paper + pick mechanics] --> B[Parse into formatting units]
  B --> C[Run checks per category]
  C --> D[Fonts]
  C --> E[Margins]
  C --> F[Indentation]
  C --> G[Spacing]
  C --> H[Alignment]

  D --> I[Per-category pass rate]
  E --> I
  F --> I
  G --> I
  H --> I

  I --> J[Overall score = average of measured categories]
  B --> K[All units counted]
  K --> L[Right % = passed ÷ total]
  K --> M[Wrong % = failed ÷ total]
  C --> N[Issue list → Errors / Warnings / Checks]
```

Two scoring views sit side by side:

| View | Question it answers |
|------|---------------------|
| **Right / Wrong %** | Of every tiny measurement, how many passed? |
| **Overall /100** | If each category is graded equally, what’s the average grade? |

They can differ a lot when one category has few units (e.g. Margins) and another has thousands (e.g. Fonts).

---

## Formulas

### Unit pass / fail (Right & Wrong)

```text
total_units   = all measured formatting units
passed_units  = units with no fail in scope
failed_units  = total_units − passed_units

right_pct = passed_units / total_units × 100
wrong_pct = 100 − right_pct
```

### Category score (Fonts, Margins, …)

For each category:

```text
category_score = (checked − failed) / checked × 100
```

Displayed as e.g. Fonts **13.5%**, Margins **96.3%**.  
Bands: **Good ≥80** · **Needs review 50–79** · **Critical &lt;50**.

### Overall score

```text
overall_score = average(scores of categories that were actually measured)
```

Only categories with `checked > 0` are included. Unmeasured categories do not drag the average.

### Scan summary (Errors / Warnings / Checks)

Separate from unit math: count of **rule-level findings** (severity tickets), not the 9,000+ micro-units.

---

## Worked example (sample scan)

Numbers from a real APA format-only scan:

| Metric | Value |
|--------|------:|
| Measured units | 9,342 |
| Failed units | 7,631 |
| Passed units | 1,711 |
| Right | 18.3% |
| Wrong | 81.7% |
| Overall | 29.46 → **29 / 100** |

### Right / Wrong

```mermaid
pie title Unit outcomes (9,342 total)
  "Right (passed) 18.3%" : 1711
  "Wrong (failed) 81.7%" : 7631
```

```text
passed = 9342 − 7631 = 1711
right  = 1711 / 9342 × 100 ≈ 18.3%
wrong  = 7631 / 9342 × 100 ≈ 81.7%
```

### Category scores → overall

```mermaid
flowchart LR
  subgraph Categories["Category scores (equal weight)"]
    F["Fonts 13.47%"]
    M["Margins 96.3%"]
    I["Indentation 12.07%"]
    S["Spacing 3.32%"]
    A["Alignment 22.13%"]
  end

  Categories --> AVG["Sum ÷ 5 = 29.46"]
  AVG --> OUT["Overall ≈ 29 / 100 CRITICAL"]
```

```text
(13.47 + 96.3 + 12.07 + 3.32 + 22.13) ÷ 5 = 29.46
```

| Category | Score | Issues (approx.) | Band |
|----------|------:|-----------------:|------|
| Fonts | 13.5% | 2,987 | Critical |
| Margins | 96.3% | 24 | Good |
| Indentation | 12.1% | 1,697 | Critical |
| Spacing | 3.3% | 1,778 | Critical |
| Alignment | 22.1% | 1,165 | Critical |

### Why isn’t overall ≈ 18.3%?

```mermaid
flowchart TB
  subgraph UnitView["Unit view — every spot counts once"]
    U1["Thousands of font/spacing fails"] --> U2["Pull Right % down to ~18%"]
  end

  subgraph CatView["Category view — each category counts once"]
    C1["Margins nearly perfect ~96%"] --> C2["Lifts average to ~29"]
    C3["Four weak categories"] --> C2
  end

  UnitView --> Note["Same paper, two lenses"]
  CatView --> Note
```

- **Right %** = democratic: one unit, one vote → Fonts/Spacing dominate the %.
- **Overall** = cabinet average: Margins get the same vote as Fonts, so a strong Margins score raises the /100 number even when most units failed.

---

## How to read a report

1. **Right / Wrong** — volume of compliance across the whole document.
2. **Overall /100** — balanced grade across measured categories (drives “CRITICAL / Needs review / Good”).
3. **Category bars** — where to fix first (lowest score + high issue count).
4. **Errors / Warnings / Checks** — high-level ticket summary, not the unit count.

**Practical order for the sample:** Spacing → Fonts → Indentation → Alignment; Margins can wait.

---

## Same numbers on web vs PDF

| Surface | Example |
|---------|---------|
| Web | Overall **29**/100, Fonts **13.5%**, Right **18.3%** |
| PDF | Overall **29.46**/100, Fonts **13.47%**, same Right/Wrong |

Rounding only; not a different formula.

---

## Related docs

- Client overview: [`HOW_IT_WORKS_CLIENT.md`](./HOW_IT_WORKS_CLIENT.md)
- Developer formulas & pipeline: [`HOW_IT_WORKS_DEV.md`](./HOW_IT_WORKS_DEV.md)
- Product plan: [`PLAN.md`](./PLAN.md)
