# Results assist + extract guards (ASAP)

Grounding sample: custom mechanics from `docs/acm_template.docx` + report `paperpilot-report-gg-v1.0.pdf`.  
Publisher-agnostic — no ACM/IEEE hardcoding. Gemini assist never changes the numeric score.

## What was wrong with the ACM report sample

- Overall **~50%** looked like a thin Format Fields average (Alignment 0% + Citations 100%), not a full publisher-template grade.
- Alignment finding (“should be left”) conflicted with the DOCX **Para** style (`jc=both` → justify). Narrative “flush left” (formulas / style notes) likely won over embodied body style.
- Citation noise: venue strings such as **IEEE 802.11** / sample bibliography “IEEE …” could be treated as `citation_style` even when the guide never named APA/MLA/IEEE as a citation system.
- Custom upload had harvestable visual/image assist items, but **results + PDF stayed silent** — no assist section, no explicit none/unavailable.
- Copy implied a stronger “template match” than the product actually scores.

## What we changed

1. **Surface assist on results + PDF for custom uploads**
   - When mechanics have `assist_items`, scan always emits `assist_findings` (real notes, `looks_ok`/`unclear`, or `unavailable`) — never an empty silent list.
   - Web/mobile results show an **AI assist findings** block (or an explicit empty/unavailable message when expected).
   - PDF report includes the same section. Assist never affects scoring math.

2. **UI / report copy**
   - Overall score is labeled as **based on filled Format Fields only — not a full publisher-template match** (results UI + PDF footer).

3. **Extract guards for template-as-guide**
   - `citation_style` stays blank unless the guide **explicitly** names APA/MLA/IEEE (venue names like IEEE 802.11 do not count).
   - For DOCX templates, **embodied body Para/justify** wins over a narrative “left” guess when they conflict (`apply_template_extract_guards` on extract).

## Custom vs built-in assist

| Mechanics | Score | Assist on results / PDF |
|-----------|-------|-------------------------|
| **Built-in / lightly edited profiles** (no `assist_items`) | Rule checker only | No assist section required |
| **Custom uploaded guide** (extract → `assist_items` for visual/image/unknown rules) | Rule checker only | Always surface findings or explicit none/unavailable |

Gemini may help **fill Format Fields** on extract and produce **non-scoring** assist notes on scan. It does **not** invent new scored rule types and does **not** change Right/Wrong % or the overall score.
