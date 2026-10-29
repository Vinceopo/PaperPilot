# Tracing — Solution Implementation

**Branch:** `TracingFixed`  
**Date:** 2026-10-30  
**Status:** Implemented (no new ML `/v1/trace` endpoint — deferred per investigation)  
**Related:** [`INVESTIGATION.md`](./INVESTIGATION.md), [`PDF_AND_ML_ENDPOINT.md`](./PDF_AND_ML_ENDPOINT.md)

---

## Short problem

Issue Tracing often jumped to the **wrong page/line** (especially on DOCX) because:

1. Manuscript upload was **DOCX-only**, so users rarely got PDF’s fixed pages + bboxes.  
2. DOCX scans without Word `lastRenderedPageBreak` **estimate** pages; preview sheet count often disagrees.  
3. Preview code sometimes **invented** a sheet (proportional remap / clamp-to-last).  
4. Web issue lists did not always normalize `page_index` the same way as mobile.  
5. PDF paint preferred a clamped last preview row when pdf.js had fewer lines than the scanner.

---

## Short solution

Applied investigation fixes **S1 + S4 + S5** (+ PDF paint hardening). Did **not** add an LLM tracer or merge into `/v1/analyze`.

| Fix | What changed |
|---|---|
| **S1 — PDF manuscripts** | Web + mobile accept `.pdf` and `.docx` for manuscripts (API already supported PDF). |
| **S4 — Honest + safer locate** | Approximate banner when `pagination.fidelity` is estimated; DOCX page resolve uses exact index → excerpt only (no proportional invent); mobile WebView matched. |
| **S5 — Mapper parity** | Web `normalizeDetectedIssues` calls `normalizeIssueLocation` like mobile. |
| **PDF paint** | If scanner line is past preview row count and a bbox exists, use bbox instead of clamping to the last row. |

---

## Why this fixes it

- **PDF manuscripts** feed Tracing fixed pages + bboxes — the precision path the product docs already described.  
- **Stopping proportional/clamp invent** avoids painting “page 9” onto the wrong preview sheet when counts disagree.  
- **Excerpt fallback** still recovers when text matches.  
- **Approximate banner** sets correct expectations for estimated DOCX instead of silent wrong jumps.  
- **Normalized locations** keep page/line/bbox consistent on web cards and click-to-jump.  
- **PDF past-end → bbox** fixes pdf.js vs PyMuPDF line-cluster mismatch without needing a second ML service.

---

## Files touched

### Web
- `web/src/lib/uploadLimits.js` — manuscript PDF+DOCX  
- `web/src/lib/documentPreviewLocate.js` — `resolvePdfMarkY`, `resolveDocxPageIndex`, `isApproximateTracing`  
- `web/src/lib/documentPreviewLocate.test.js` — coverage for new behavior  
- `web/src/components/cockpit/DocumentPagePreview.jsx` — use shared `resolveDocxPageIndex`  
- `web/src/components/cockpit/IssuesDetectedPanel.jsx` — normalize locations  
- `web/src/components/cockpit/IssueTracingSection.jsx` — approximate banner  
- `web/src/components/cockpit/ReferenceTracingView.jsx` — approximate banner  
- `web/src/components/cockpit/ManuscriptPanel.jsx` — copy / accept UX  

### Mobile
- `mobile/src/lib/uploadLimits.js` — manuscript PDF+DOCX  
- `mobile/src/screens/UploadScreen.js` — copy  
- `mobile/src/screens/DocumentReferenceScreen.js` — approximate note  
- `mobile/src/components/cockpit/traceViewerHtml.js` — DOCX page resolve + PDF past-end bbox  

### Docs
- This file + prior investigation notes under `BUGS/tracings/`

---

## Explicitly not done (by design)

- No new `POST /v1/trace` / Gemini location model (would invent coordinates; scores stay engine-owned).  
- No LibreOffice/DOCX→PDF server conversion.  
- No full shared page-model rewrite between scanner and preview (larger follow-up).

---

## Verification run

```text
Node harness (documentPreviewLocate + normalizeIssueLocation): ALL PASSED
  (after fixing Number(null) bbox false-positive)
API unittest test_issue_dedup_locations: 3 OK
```

Manual QA checklist:

1. Upload a **PDF** manuscript → scan → Issue Tracing: pages/bboxes align; no approximate amber banner (`pdf_source`).  
2. Upload a **DOCX** without rendered breaks → amber “Approximate locations” banner; click issues with excerpts still jump via text search; no silent jump to last page for out-of-range page numbers without excerpt.  
3. Web + mobile manuscript pickers accept `.pdf` and `.docx`.  
4. Pagination issues still use header/footer chip (not body line 1).

---

## Commit message shape (used on branch)

```
TracingFixed: stop wrong page jumps in Issue Tracing

Problem: DOCX estimated pages + clamp/proportional remap + DOCX-only
uploads made click-to-highlight land on the wrong sheet; PDF line clamps
ignored useful bboxes.

Solution: allow PDF manuscripts; normalize web locations; safer DOCX page
resolve + approximate fidelity banner; prefer PDF bbox when line is past
preview rows.

Why: Tracing paints scanner coordinates — better geometry in, less invented
preview mapping, honest UX when pages are estimated.
```
