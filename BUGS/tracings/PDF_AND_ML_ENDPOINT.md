# Tracing — PDF scan impact & separate ML endpoint decision

**Status:** Investigation only — **no fix / no new endpoint applied**  
**Date:** 2026-10-29  
**Parent:** [`INVESTIGATION.md`](./INVESTIGATION.md)  
**Questions answered here:**

1. Does using **PDF** change scanning in a way that affects Tracing?  
2. Should we add **another machine-learning** piece for Tracing?  
3. If we need backend work, should it be a **separate file + separate endpoint** (not merged into `/v1/analyze`)?

---

## Executive answer

| Question | Verdict |
|---|---|
| Does PDF scanning affect Tracing? | **Yes — strongly.** Same content as PDF vs DOCX produces different page counts, different issue locations, and PDF alone supplies `bbox`. Tracing accuracy is downstream of whatever the scan wrote. |
| Should we add another ML model for Tracing? | **Not as an LLM “guess the highlight” model.** Locations must stay engine-owned. An optional **separate geometry/sidecar service** can make sense later; a second Gemini-style tracer does not. |
| Separate file + endpoint vs merge into analyze? | **If** you add backend work for highlight payloads, **prefer a separate module + endpoint** (or a clearly versioned result sidecar). **Do not** fold guessy ML into `/v1/analyze` scoring. Prefer fixing DOCX/PDF page alignment first; an endpoint is optional packaging, not the root fix. |

---

## 1. How PDF scanning feeds Tracing

### 1.1 Pipeline (PDF)

```text
Manuscript/mechanics bytes (.pdf)
    → validate_document (%PDF- magic)
    → _parse_pdf (PyMuPDF/fitz): fixed pages, line bboxes in PDF points
    → _document_units: one unit per merged text row, bbox kept
    → run_compliance_scan → locations {page, line, excerpt, bbox, page_width, page_height}
    → (optional) Gemini enrichment: wording/severity ONLY — no new page/line/bbox
    → mapComplianceScanToResult → normalizeIssueLocation (bbox → 0–1 fractions)
    → Issue Tracing UI → pdf.js canvas + resolvePdfMarkY(line vs bbox)
```

### 1.2 Confirmed: PDF vs DOCX scan of the *same guide* diverge

Harness (repo fixtures, not a user one-off):

| | `apa_format_mechanics_guide.pdf` | `apa_format_mechanics_guide.docx` |
|---|---|---|
| `pagination_fidelity` | `fixed_source_pages` | `word_rendered_breaks_when_present_else_estimated` |
| Scan `page_count` | **3** | **5** |
| Units with `bbox` | **70 / 70** | **0 / 89** |
| Issue locations with `bbox` | **128 / 128** | **0 / 5** |
| Pagination note fidelity | `pdf_source` | `estimated` (+ “upload a PDF…” advice) |

So: **choosing PDF at scan time changes the location payload Tracing consumes.** It is not only a preview renderer difference.

### 1.3 Product catch

Client manuscript upload is **DOCX-only**. PDF’s better geometry exists in the API/ML parser and in preview code, but the main scan UX rarely produces PDF locations for papers. Mechanics guides *can* be PDF; manuscripts usually cannot.

---

## 2. PDF-specific Tracing risks (yes, PDF can still mis-highlight)

PDF is **better**, not perfect. Scanning quality still affects Tracing.

### P-PDF-1 — Two different line counters (**structural**)

| Side | How lines are built |
|---|---|
| **Scanner** | PyMuPDF `get_text("dict")` → `_merge_pdf_rows` (overlap heuristics) → `line_index` |
| **Preview** | pdf.js `getTextContent()` → viewport Y → `clusterLineYs` |

`resolvePdfMarkY` **prefers scanner `line` over bbox** when they disagree (by design, so adjacent lines stay distinct). If pdf.js clusters fewer/more rows than PyMuPDF merged, **line N paints the wrong band** even though the PDF page count matches.

**Confirmed helper behavior:** coarse bbox near row 1 + issue `line: 4` → Y of row 4 wins. Past-end line numbers clamp to the last measured preview row.

### P-PDF-2 — Bbox needs correct `page_width` / `page_height`

`normalizeBbox` divides PDF points by `page_width` / `page_height` (default 612×792 Letter). Wrong or missing page size skews the overlay. Scanner usually attaches sizes on PDF locations (confirmed on fixture sample).

### P-PDF-3 — Scan content type still matters

| PDF kind | Effect on scan → Trace |
|---|---|
| Text PDF (normal export) | Best case: fixed pages + bbox |
| Scanned/image-only PDF | Few/no text lines → weak/missing locations; preview has little to pin |
| Rotated / multi-column / complex tables | Merge/cluster heuristics diverge; highlights drift |
| Password PDF | Rejected at parse (`needs_pass`) — no scan, no trace |

### P-PDF-4 — Same paper, two formats ⇒ two different Trace maps

Exporting DOCX→PDF then scanning the PDF will:

- Change `page_count` and which line is “line 3”
- Attach bboxes
- Change which units fail (DOCX estimate vs PDF truth)

Tracing will look “fixed” or “different” because **the scan itself changed**, not because the UI learned a new trick.

### P-PDF-5 — In-process vs Render ML analyze

Gateway may run in-process compliance or proxy `POST /v1/analyze` on the ML service. Both use the same compliance/location ideas; Tracing does not get a separate ML coordinate channel today. Requeue path even defaults filename to `document.pdf` when missing — cosmetic for type detection which uses validated bytes, but shows PDF-centric assumptions in ops code.

---

## 3. Should we add another machine learning for Tracing?

### 3.1 What exists today in `machinelearning/`

| Piece | Role vs Tracing |
|---|---|
| `documents.py` / `compliance.py` | **Source of truth** for locations (deterministic) |
| `enrichment.py` / Gemini | Wording + severity; **strips/forbids** inventing page/line/bbox |
| `citation_ml.py` | Citation assist — not highlight geometry |
| `POST /v1/analyze` | Single analyze job → issues + scores + locations |

There is **no** `/v1/trace` endpoint.

### 3.2 Recommendation: do **not** add an LLM “tracing model”

Reasons:

1. Wrong failure mode — DOCX/PDF drift is layout math, not language understanding.  
2. Gemini is already banned from location fields; a new model that outputs page/bbox would fight the engine and poison scores/UX.  
3. Non-determinism — same issue could jump differently across runs.  
4. Cost/latency — another model call per scan or per click.  
5. Doesn’t fix preview mismatch — inventing “page 5” still fails if preview has 3 sections.

### 3.3 What *could* justify a **separate** backend capability (not classic “ML”)

Call it a **geometry / highlight sidecar**, even if it lives under `machinelearning/`:

| Approach | ML? | Purpose |
|---|---|---|
| A. Persist scanner line geometry (PDF points / DOCX paragraph anchors) into scan JSON | No | Give UI exact paint targets without re-deriving |
| B. Server-side PDF render + map issue → PNG overlay coords | Weak / none | Same geometry as scanner |
| C. DOCX→PDF convert then scan+trace on PDF | Ops, not ML | Buys fixed pages + bbox |
| D. Vision model “find this excerpt on page image” | Yes (heavy) | Last resort for scanned PDFs; expensive, flaky |

**Prefer A–C before D.**

---

## 4. Separate file + separate endpoint (your preference)

You said you **don’t want to merge** Tracing into the existing analyze brain if something new is needed — you’d rather **another file** and **another endpoint**.

### 4.1 Investigation stance: that packaging preference is **sound**

| Prefer | Avoid |
|---|---|
| New module e.g. `machinelearning/app/tracing.py` (or `highlights.py`) | Stuffing highlight ML into `compliance.py` / Gemini enrichment |
| New route e.g. `POST /v1/trace` or `POST /v1/analyze/{id}/highlights` | Changing `/v1/analyze` response schema in a breaking, score-coupled way |
| Gateway mirror e.g. `POST /scans/{id}/trace` that only enriches paint data | Letting clients call Render with ML keys |
| Input = existing issue locations + document; output = paint hints | Re-scoring or inventing new compliance issues in the trace call |

### 4.2 Suggested contract (design only — not implemented)

```text
POST /v1/trace
Auth: ML-Service-Key (gateway only)

Request:
  document_url | document_base64
  filename
  issues: [ { issue_type, locations: [{page, line, excerpt, bbox?}] } ]  # from analyze — frozen

Response:
  highlights: [
    {
      issue_type,
      location_key,
      page,                 # may refine for preview alignment
      paint: { kind: "bbox"|"line"|"edge", ... normalized coords },
      confidence: 0..1,
      fidelity: "pdf_source"|"estimated"|"approximate",
      note?: string
    }
  ]
```

Rules:

- **Must not** change `overall_score`, issue types, or pass/fail.  
- **Must not** invent new compliance findings.  
- May only add/refine **paint** metadata for UI.  
- If confidence low → UI shows “approximate” instead of lying.

### 4.3 When you should **not** build that endpoint yet

If the chosen fix is:

- Allow PDF manuscripts, or  
- DOCX→PDF before analyze, or  
- Fix client `docx-preview` page alignment using existing fields  

…then Tracing improves **without** a new service. Endpoint is packaging for a *new* geometry step, not a mandatory architecture.

### 4.4 Dependency blast radius of a new endpoint

| Layer | Touch |
|---|---|
| `machinelearning/app/main.py` | Register route |
| New `tracing.py` / schemas | Logic + response models |
| `api/app/ml_service_client.py` | Client method |
| Gateway route + auth | User-facing proxy |
| Web/mobile Issue Tracing | Optional second fetch after scan |
| Cost/ops | Extra Render CPU; caching by scan_id |
| **Must stay untouched** | Scoring formulas, Gemini location lock, historical score meaning |

---

## 5. Decision matrix (product)

| Goal | Best investigation direction | New ML endpoint? |
|---|---|---|
| Fix wrong jumps on DOCX manuscripts | Page-model alignment / rendered breaks / PDF path for manuscripts | Usually **no** |
| Make PDF highlights pixel-tight | Align PyMuPDF line index with pdf.js clusters; trust bbox more when line clusters disagree | Optional small helper, not LLM |
| Support scanned image PDFs | OCR pipeline first; vision locate last | Only after OCR exists |
| Keep analyze scores stable while iterating UX | Sidecar `/v1/trace` with paint-only output | **Yes (separate file+route)** if you need server paint |

---

## 6. Confirmation runs (this addendum)

```text
# PDF vs DOCX same guide — location shape
units_with_bbox PDF=70/70 DOCX=0/89
page_count PDF=3 DOCX=5
locs_with_bbox PDF=128 DOCX=0

# PDF line Y order (PyMuPDF)
y_monotonic_increasing=True (top→bottom in PDF points)

# Frontend helpers
normalizeIssueLocation keeps PDF point bbox → fractions
resolvePdfMarkY: line wins over conflicting bbox
past-end line clamps to last preview row
```

API location unit tests (`test_issue_dedup_locations`) remain green from parent investigation.

---

## 7. Bottom line for your three asks

1. **PDF scanning does affect Tracing** — it changes pages, lines, bbox presence, and therefore what the UI can paint. PDF is the stronger path; it still has line-cluster / image-PDF failure modes.  
2. **Don’t add another LLM tracer** to “merge into” analyze. Keep locations engine-owned.  
3. **If** you need new backend paint logic, **do** put it in a **new file + new endpoint** (sidecar), gateway-proxied, score-neutral — after (or instead of) fixing DOCX/PDF alignment at the source.

No code or endpoint was added in this investigation pass.
