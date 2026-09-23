# ML fixtures — format compliance smoke tests

DOCX/PDF only (what PaperPilot accepts). Manuscripts are ~5 pages each.

## Format mechanics (upload once)

- `mechanics/apa_format_mechanics_guide.docx` (recommended)
- `mechanics/apa_format_mechanics_guide.pdf`

Upload under **Format Mechanics → Upload**, review extracted Format Fields, then save.

Labeled rules include paper, margins, font, spacing, indentation, alignment, pagination, tables, figures, and APA citations.

## Manuscripts (~5 pages)

| File | Expect |
|------|--------|
| `docs/01_compliant_apa.docx` | Mostly pass |
| `docs/02_wrong_font.docx` | Font failures (Arial) |
| `docs/03_tight_margins_single_space.docx` | Margins + spacing failures |
| `docs/04_mixed_ok_and_bad.docx` | Alignment / indentation issues |

## Steps

1. Upload the mechanics guide → review fields → save.
2. Upload one manuscript.
3. Analyze with that mechanics profile.
4. Check summary modal, full results, and reference tracing.
