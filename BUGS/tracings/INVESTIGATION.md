# Tracing Feature — Investigation Report

**Status:** Investigation complete — fixes landed on branch `TracingFixed` (see [`SOLUTION_IMPLEMENTATION.md`](./SOLUTION_IMPLEMENTATION.md))  
**Date:** 2026-10-29 (impl 2026-10-30)  
**Scope:** Issue Tracing / Reference Tracing (web + mobile), location model, file-type/signature effects, ML role, business dependencies  
**Constraint:** Example user uploads are treated as non-representative; findings are grounded in code paths + reproducible harnesses, not one sample file.

---

## Executive summary

Tracing is **not** primarily an ML highlight system. Locations come from the **deterministic compliance scanner**. The UI then tries to scroll/highlight the original PDF/DOCX (or a text fallback).

The strongest **confirmed** failure mode for real manuscripts is:

> **DOCX page/line coordinates from the scanner diverge from what `docx-preview` (web) / WebView (mobile) paint**, especially when Word’s `w:lastRenderedPageBreak` markers are missing. Issues then jump to the wrong page/line, collapse onto wrong highlights, or fall back to fuzzy excerpt search.

PDF tracing is designed to be more precise (fixed pages + bbox), but **manuscript upload is currently DOCX-only** on web/mobile — so most users never get the precision path.

Adding “another ML tracing” would **not** fix this by itself: Gemini is explicitly forbidden from inventing `page` / `line` / `bbox`.

**Follow-up (PDF + separate endpoint):** see [`PDF_AND_ML_ENDPOINT.md`](./PDF_AND_ML_ENDPOINT.md). Confirmed: scanning as PDF vs DOCX of the *same* document changes `page_count`, issue locations, and bbox availability — Tracing is downstream of the scan. If new backend paint logic is needed later, prefer a **separate module + `/v1/trace`-style endpoint**, not merging an LLM into `/v1/analyze`.

---

## 1. What “Tracing” is in this codebase

| Surface | Role |
|---|---|
| **Issue tracing & XAI** (`IssueTracingSection.jsx`) | Full results: click finding → preview scroll + highlight + explanation |
| **Reference tracing** (`ReferenceTracingView.jsx`, mobile `DocumentReferenceScreen`) | Dedicated document + issue list flow |
| **Preview engine (web)** (`DocumentPagePreview.jsx`) | PDF via `pdfjs-dist`; DOCX via `docx-preview`; text pages fallback |
| **Preview engine (mobile)** (`TraceDocumentViewer.js` + `traceViewerHtml.js`) | WebView renderer for original file, or text `buildDocumentPages` |
| **Location pipeline** | Parse → `_document_units` → compliance issues → `mapComplianceScanToResult` / `normalizeIssueLocation` → `normalizeDetectedIssues` → highlight helpers (`documentPreviewLocate.js`) |

Flow (simplified):

```text
Upload DOCX (manuscript) / PDF|DOCX (mechanics)
        │
        ▼
validate_document (extension + magic bytes)
        │
        ▼
parse_document → pages (PDF) or paragraphs (DOCX)
        │
        ▼
run_compliance_scan → issues[].locations {page, line, section, excerpt?, bbox?}
        │
        ▼
mapComplianceScanToResult → formatChecks (1-based page/line)
        │
        ▼
User clicks issue → DocumentPagePreview / TraceDocumentViewer
        │
        ├─ PDF: page canvas + resolvePdfMarkY(line vs bbox)
        ├─ DOCX: docx-preview sections + excerpt/line estimate
        └─ Fallback: extracted text pages
```

---

## 2. Possible problems (ranked)

### P1 — DOCX scanner pages ≠ preview pages (**CONFIRMED**)

**Mechanism**

- PDF metadata: `pagination_fidelity: fixed_source_pages`.
- DOCX metadata: `pagination_fidelity: word_rendered_breaks_when_present_else_estimated`.
- When `rendered_page_breaks == 0`, `_document_units` invents pages from a **lines-per-page estimate** (`_docx_page_capacity` / `_rebalance_docx_pages`).
- Compliance itself documents this (`pagination` note): *"Upload a PDF, or open/save the DOCX in Word, for exact page breaks."*
- Web preview independently tries to recover soft breaks via `paginateOversizedDocxSection` / `resolveDocxPageIndex` because *"Revised DOCX files often lose Word's lastRenderedPageBreak markers"*.

**Confirmation (repo fixtures, not a user’s one-off file)**

| File | explicit breaks | rendered breaks | scan `page_count` | fixture `pages_target` |
|---|---:|---:|---:|---:|
| `01_compliant_apa.docx` | 4 | **0** | **9** | 5 |
| `02_wrong_font.docx` | 4 | **0** | **9** | 5 |
| `03_tight_margins_single_space.docx` | 4 | 0 | 5 | 5 |
| `04_mixed_ok_and_bad.docx` | 4 | **0** | **9** | 5 |

When the scanner labels an issue “Page 8” but `docx-preview` only emits ~5 sections (or a different split), tracing must:

1. Prefer exact section index (wrong if counts disagree), else  
2. Excerpt search, else  
3. Proportional remap (`resolveDocxPageIndex`) — all best-effort.

**User-visible symptom:** click issue → wrong page, wrong line, highlight on chapter title / empty region, or “jumps around” across documents with different Word save history.

### P2 — DOCX locations have **no bbox** (**CONFIRMED**)

On DOCX units, `bbox` is set to `None` in `_document_units`. Fixture scan sample: `with_bbox=0` across issue locations.

Tracing for DOCX therefore depends on:

- `page` + `line`
- `excerpt` / finding text DOM search
- visual line estimates (`visualLineTarget`, `resolveDocxHighlight`)

PDF issues can carry point bboxes → normalized fractions → canvas overlays.

### P3 — Product path mismatch: manuscripts are DOCX-only (**CONFIRMED**)

| Kind | Accepted types (client) |
|---|---|
| Mechanics guides | `.pdf`, `.docx` |
| Manuscripts (scan target) | **`.docx` only** (`MANUSCRIPT_ACCEPTED_EXTENSIONS`) |

Docs (`HOW_IT_WORKS_CLIENT.md`, `PLAN.md`) say **PDF is the precision target** for highlights. Production manuscript upload never offers that path → most tracing traffic hits the approximate DOCX path.

API still accepts PDF manuscripts if something uploads them; UI gates do not.

### P4 — Dual indexing (`page` 1-based + `page_index` 0-based) (**LATENT / PARTIALLY MITIGATED**)

`_unit_location` stores both:

- `page` / `line` = 0-based index **+ 1**
- `page_index` / `line_index` = original 0-based (when bbox present)

`normalizeIssueLocation` prefers `page` when present → **no double +1** on the happy path (harness confirmed).

**Residual risk:** web `IssuesDetectedPanel.normalizeDetectedIssues` reads `loc.page` **without** calling `normalizeIssueLocation`. Mobile **does** normalize. If any code path feeds raw `page_index`-only locations into the web panel (bypassing `mapComplianceScanToResult`), cards lose page pins and tracing cannot scroll.

Happy path via `mapComplianceScanToResult` normalizes first — so this is a **contract fragility**, not the primary DOCX drift bug.

### P5 — Pagination / margins special cases (**WORKING AS DESIGNED, still easy to misread**)

- Pagination issues strip `line` / `excerpt` / `bbox` and paint a header/footer chip (`shouldUsePaginationEdge`).
- Tests assert body excerpts must **not** steal pagination highlights.
- Misconfiguration of `page_region` / recommendation wording can still put the chip on the wrong edge.

### P6 — Preview URL / signature failures (**ORTHOGONAL, CONFIRMED AS A CLASS**)

- Presigned **PUT** URLs (`X-Amz-Signature`) are rejected for preview (`isPresignedUploadUrl`) to avoid `SignatureDoesNotMatch` on GET.
- If `cloudinaryUrl` / S3 public URL is missing or wrong, UI falls back to text preview or empty state — tracing looks “broken” without being a locate-math bug.

### P7 — File type / encoding / magic signatures (**NOT the primary highlight bug**)

Signatures **do** gate upload:

| Check | Behavior |
|---|---|
| Extension not `.pdf`/`.docx` | Reject |
| `.pdf` without `%PDF-` (after leading whitespace) | Reject |
| `.docx` without `PK\x03\x04` ZIP + OOXML parts | Reject |
| Client mirrors magic checks (`uploadLimits.js`) | Reject before upload |

**Confirmed:** renamed PDF↔DOCX bytes fail validation. That prevents parse/scan; it does **not** explain wrong highlights on a successfully scanned valid DOCX.

Encoding (UTF-8 vs legacy) can affect excerpt matching if text extraction and DOM text diverge, but page-index drift dominates.

### P8 — “Maybe it’s ML / we need another tracing?” (**UNLIKELY AS ROOT CAUSE**)

Hybrid stack:

- **Deterministic** layout/format checks produce locations.
- **Gemini** (optional) only rewrites severity/explanation/recommendation. Prompt: *“Do not output location, bbox, page, line, or role fields.”*
- Citation / mechanics ML helpers are separate assists; they do not drive PDF/DOCX highlight geometry.

So:

- Broken highlights are almost never “the model hallucinated a page.”
- A second ML tracer would at best **guess** coordinates the preview still cannot paint consistently for DOCX without rendered breaks.
- Better investments: align DOCX page model with Word/PDF, improve preview pagination, or allow PDF manuscripts for precise tracing.

---

## 3. File-type / encoding / signature matrix

| Stage | PDF | DOCX |
|---|---|---|
| Client manuscript accept | No (UI) | Yes |
| Client mechanics accept | Yes | Yes |
| Magic bytes | `%PDF-` | ZIP `PK\x03\x04` + `[Content_Types].xml` + `word/document.xml` |
| Parse geometry | Fixed pages, line bboxes | Paragraphs/runs; pages from Word breaks or **estimate** |
| Issue `bbox` | Often present | Typically **absent** |
| Preview | pdf.js canvas marks | docx-preview sections + DOM/excerpt |
| Highlight precision (docs + code intent) | High | Approximate / fragile |
| Soft-break recovery in UI | N/A (native pages) | `paginateOversizedDocxSection`, `resolveDocxPageIndex` |

---

## 4. Possible solutions (investigation options only — do not apply yet)

Ordered by leverage / risk. **None of these were implemented in this pass.**

### S1 — Prefer PDF manuscripts for tracing precision (product)

- Allow `.pdf` manuscripts (or export-to-PDF before scan).
- Aligns with existing pagination note and client docs (“PDF is precision target”).
- **Impact:** upload UX, mobile picker, plan limits, storage, parse path already exists server-side.

### S2 — Require / encourage Word “rendered page breaks” for DOCX

- Instruct users to open/save in Word so `w:lastRenderedPageBreak` exists.
- Or server-side LibreOffice/Word conversion that injects rendered breaks / PDF intermediate.
- **Impact:** ops dependency; privacy; scan latency; still need preview parity.

### S3 — Unify page model between scanner and preview

- Feed the same page-break decisions into both compliance units and a preview metadata sidecar (page → character/paragraph offsets).
- Or render preview from the same estimated page slices the scanner used (text-faithful, less “Word-looking”).
- **Impact:** large; touches `compliance.py`, `DocumentPagePreview`, mobile WebView, score page labels.

### S4 — Strengthen DOCX locate without new ML

- Persist richer anchors: paragraph_index, run offsets, normalized excerpt + nearby context.
- Improve `resolveDocxPageIndex` / excerpt needles; avoid proportional remap when confidence low; show “approximate location” badge when `pagination.fidelity === estimated`.
- **Impact:** UX honesty; fewer silent wrong jumps; still not pixel-perfect.

### S5 — Harden mapper contracts (web/mobile parity)

- Make web `normalizeDetectedIssues` call `normalizeIssueLocation` like mobile.
- Never ship locations with only `page_index` into UI lists.
- **Impact:** small, low risk; prevents latent off-by-path bugs; does not fix DOCX drift.

### S6 — Do **not** add a parallel ML “tracing model” as the first fix

- Would invent coordinates Gemini is currently banned from inventing.
- Unless paired with a verified geometry source (PDF boxes / shared layout engine), ML tracing adds cost and new failure modes.

---

## 5. Business impact & dependency map

Tweaking tracing/location semantics ripples through:

| Dependency | How it links |
|---|---|
| **Scan results header / category cards** | `ScanResultsScreen` uses `normalizeDetectedIssues` occurrence counts for “issues found” and ring % |
| **scoreFormat / scoring display** | Prefers Issue Tracing occurrence counts over raw failed units |
| **XAI copy** | Same section; location-specific why/fix; pagination page-number rewriting |
| **Summary modal → View Document** | Opens reference tracing with same `formatChecks` |
| **Mobile scan result / document trace** | Parallel `normalizeDetectedIssues` + `TraceDocumentViewer` |
| **Persisted library / RTDB / S3 artifacts** | Stored scans carry `locations`; remapping formulas must stay backward compatible |
| **Compliance scoring** | Page estimates also affect which units live on which page → category totals, not only UI highlight |
| **Gemini enrichment** | Consumes location samples for wording; must keep location fields locked |
| **Upload limits / plan gates** | Changing manuscript types (S1) touches Free/Premium/Pro size + accept lists |
| **Storage URLs** | Preview depends on public S3/Cloudinary-style GET URLs, not PUT signatures |

**Business risk if we “tweak casually”:**

- Scores and highlight pages disagree even more.
- Old saved scans highlight differently after a mapper change.
- Users lose trust (“it says page 8 but jumps to page 2”).
- DOCX-only academic workflows cannot be “fixed” by PDF-only assumptions without a product decision.

---

## 6. Code map (primary files)

| Area | Paths |
|---|---|
| Web issue tracing UI | `PaperPilot-main/web/src/components/cockpit/IssueTracingSection.jsx` |
| Web reference tracing | `…/ReferenceTracingView.jsx` |
| Preview + DOCX soft-break recovery | `…/DocumentPagePreview.jsx` |
| Locate math | `…/lib/documentPreviewLocate.js` (+ `.test.js`) |
| Issue list flattening | `…/IssuesDetectedPanel.jsx` (`normalizeDetectedIssues`) |
| API → UI location normalize | `…/lib/scanMapper.js` |
| Mobile mirrors | `mobile/src/components/cockpit/TraceDocumentViewer.js`, `IssuesDetectedPanel.js`, `DocumentReferenceScreen.js` |
| Signatures / accept lists | `web|mobile/src/lib/uploadLimits.js`, `api/app/documents.py` `validate_document` |
| Page estimation | `api/app/compliance.py` `_document_units`, `_docx_page_capacity`, pagination notes |
| Gemini (no location invent) | `api/app/gemini_client.py` |
| Product docs | `machinelearning/docs/HOW_IT_WORKS_*.md`, `PLAN.md` |

---

## 7. Tests & confirmation runs (executed this investigation)

> Per diagnosis discipline: problems below are only labeled **CONFIRMED** when a command was run.

### 7.1 API location unit tests — PASS

```bash
cd PaperPilot-main/api
PYTHONPATH=. python -m unittest discover -s tests -p 'test_issue_dedup*.py' -v
```

Result: **3 OK** (`_location` omits unknown page; dedup keeps distinct page/line; heading failures not collapsed).

### 7.2 Signature validation — PASS (behaves as designed)

```text
ok.pdf  %PDF-…     → pdf
bad.pdf ZIP bytes  → ERR extension/signature mismatch
x.docx  %PDF-…     → ERR not a ZIP container
x.doc   ZIP bytes  → ERR only .pdf/.docx
```

### 7.3 DOCX page estimation vs fixture targets — **RED for tracing fidelity**

```bash
# Harness (this investigation): parse ml-fixtures + _document_units / run_compliance_scan
```

Result: multiple APA fixtures with `rendered_breaks=0` report **scan page_count 9** vs **pages_target 5**.  
This is the red-capable signal for P1 (scanner↔preview page disagreement class).

### 7.4 DOCX locations lack bbox — CONFIRMED

Sample compliance output on fixtures: location samples had `bbox` absent; PDF pipeline tests expect bbox present for PDF units.

### 7.5 Frontend locate helpers — PASS (logic unit assertions)

`npm test` / vitest not wired (no `test` script; `node_modules/vite` missing in this workspace). Ran equivalent Node ESM harness importing:

- `documentPreviewLocate.js`
- `scanMapper.js` `normalizeIssueLocation`

Results: line-vs-bbox preference, pagination stripping, DOCX multi-line disambiguation, and “prefer `page` over `page_index+1`” all **passed**.  
Also confirmed web `normalizeDetectedIssues` would drop page if only `page_index` were present.

### 7.6 Full `test_compliance_pipeline.py` — NOT RUN TO COMPLETION HERE

Blocked by missing `boto3` in the ambient Python env when importing `compliance_db` / S3 modules. Narrower unittest modules that avoid that import **did** run.

### 7.7 What we deliberately did **not** claim

- Did not treat any single user upload as the oracle.
- Did not run a browser e2e click-to-highlight against a live preview (no guaranteed local web server + deps in this pass).
- Did not apply fixes.

---

## 8. Answers to the investigation questions

| # | Question | Answer |
|---|---|---|
| 1 | Possible problem? | Primary: DOCX estimated pages / soft breaks → scanner page/line ≠ preview. Secondary: no DOCX bbox; manuscript PDF gated off; URL/preview failures; web/mobile normalize asymmetry. |
| 2 | Depends on PDF vs DOCX / encoding / signatures? | **Yes heavily on PDF vs DOCX.** Signatures only gate invalid files. Encoding can affect excerpt match; page model mismatch dominates. |
| 3 | Possible solutions? | PDF manuscripts; Word rendered breaks / convert; shared page model; better anchors + honesty UI; mapper parity. Avoid “add ML tracing” as first move. |
| 4 | Business impact / dependencies? | Scores, category rings, XAI, summary→trace, mobile trace, persisted scans, Gemini wording samples, upload accept lists, storage URLs. |
| 5 | Codebase scan vs example files? | Architecture + fixtures used; user examples treated as non-representative. |
| 6 | Confirm with tests? | Location unit tests green; signature checks green; **page-count drift harness red**; locate helper harness green. |
| 7 | Fixes? | **None applied.** |
| 8 | ML / more tracings? | Locations are deterministic; Gemini must not invent them. Extra ML tracing without a shared geometry source is unlikely to fix DOCX drift. |
| 9 | Does PDF scanning affect Tracing? | **Yes.** Same guide as PDF vs DOCX → different page counts, all PDF locs had bbox, DOCX had none. See [`PDF_AND_ML_ENDPOINT.md`](./PDF_AND_ML_ENDPOINT.md). |
| 10 | Separate ML file + endpoint? | Prefer score-neutral sidecar (`tracing.py` + `/v1/trace`) **if** server paint is needed; do **not** merge LLM locate into `/v1/analyze`. Fix page alignment / PDF manuscript path first when possible. |

---

## 9. Recommended next step (still investigation / product)

Before coding a fix, pick one product hypothesis to validate with a **browser click-to-highlight loop** on multiple DOCX files (with and without `lastRenderedPageBreak`):

1. **Hypothesis A:** Wrong jump correlates with `pagination.fidelity === "estimated"` and `scan.page_count ≠ preview section count`.  
2. **Hypothesis B:** Files with rendered breaks trace correctly.  
3. **Hypothesis C:** Same manuscript exported to PDF traces correctly end-to-end.

If A/B/C hold, prioritize S1–S3; keep S5 as a small safety patch; defer S6.

---

## 10. Appendix — key code references

- DOCX soft-break recovery comment: `DocumentPagePreview.jsx` (`paginateOversizedDocxSection`, `resolveDocxPageIndex`)
- Estimated pagination user note: `compliance.py` (~lines 795–802)
- Manuscript DOCX-only: `web/src/lib/uploadLimits.js` `MANUSCRIPT_ACCEPTED_EXTENSIONS`
- Gemini location lock: `gemini_client.py` enrichment prompt
- Client FAQ: `machinelearning/docs/HOW_IT_WORKS_CLIENT.md` (“PDF … most precise”; DOCX approximate)
