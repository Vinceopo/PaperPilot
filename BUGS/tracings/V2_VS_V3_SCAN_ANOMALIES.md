# v2 vs v3 Scan Anomalies — Investigation Report

**Status:** Root causes identified; fixes applied locally and prepared for Render redeploy  
**Date:** 2026-11-03  
**Repos:** `jdabsgotthesauce/paperpilot-ml` (`v2` branch history) + monorepo `PaperPilot-main/machinelearning`  
**Constraint:** Compared commit history (true pre-merge v2 vs accidental v3 merge), not a single user PDF.

---

## Executive summary (3 sentences)

The accidental merge of `v3` (`8c1ba36`) into `v2` did **not** only add Citations — it rewrote scoring and large parts of compliance (especially pagination), so non-citation categories drifted even when Citations looked like the only “new feature.” Citations were detected as issues but **never entered the score breakdown / overall average**, so results could not “adjust on citation” the way product UI implies. Separately, v3 replaced the full pagination checker (title/chapter/style/sequence) with a position-only checker while the mechanics UI still collects those fields — that mismatch is the main non-citation anomaly signal.

---

## 1. Commit history (what “v2” and “v3” mean)

| Ref | SHA | Meaning |
|---|---|---|
| True pre-merge **v2** | `258d562` | Pagination / heading / word-spacing / landscape mechanics — the “~98%” baseline |
| Accidental **v3** tip | `8c1ba36` | Large local ML rewrite pushed as “citation + scoring” |
| Merge into v2 | `72a1b9f` | PR #1 merged v3 into v2 |
| Hotfix | `680f69a` | Optional `page`/`line` on issue locations (result 500 → gateway 502) |

```text
680f69a  Merge PR #2 (optional locations)
72a1b9f  Merge PR #1 (v3 into v2)   ← accidental product regression point
8c1ba36  v3 commit
258d562  true v2 baseline
57af185  initial ML service
```

Diff size `258d562...8c1ba36`: **+2429 / −586** across 18 files — far beyond a Citations-only change.

---

## 2. Problem analysis (comparables)

### A. Citations feature vs scoreboard (product mismatch)

| Surface | Pre-merge v2 | Post-merge v3 (before this fix) |
|---|---|---|
| Citation detection | Majority-vote style mismatch + ML | Per-marker family flags (better) |
| Score breakdown categories | Fonts…Pagination only | Same — **Citations omitted** |
| Overall /100 | Global unit pass rate | Mean of measured breakdown categories — still **no Citations** |
| Issue list UI | Can show Citations cards | Yes |
| Severity mix | Includes citation occurrences | Yes (can look like “other” categories shifted) |

**Effect:** Users add / configure Citations and see citation cards, but Right%/Overall and Score Breakdown do not move for Citations. That reads as a mismatch / anomaly even when detection is correct.

### B. Scoring formula change (all categories)

| Metric | True v2 | v3 |
|---|---|---|
| `right_pct` | `passed_units / all_units` | Same idea via `passed_pct`, but |
| `overall_score` | Effectively tied to global pass rate (no separate mean) | **Unweighted mean of category scores** |
| Empty categories | Implicitly 100 / ignored loosely | `not_evaluated` / `not_applicable` via `CategoryStats.applicable` |

**Effect:** Same manuscript can show a very different /100 after the merge even with identical unit failures — Pagination with few units weighs the same as Fonts with thousands.

### C. Pagination gutting (largest non-citation anomaly)

| | True v2 | Accidental v3 |
|---|---|---|
| `_check_pagination` | ~177 lines | ~56 lines |
| Title page hide/show | Yes | No |
| Chapter first page | Yes | No |
| Style (roman/arabic) | Yes | Explicitly skipped |
| Sequence / restart | Yes | Explicitly skipped |
| Position only | Plus the above | **Only this** |
| Mechanics UI fields | Still collected | Still collected |

Docstring in v3 literally said missing/style/sequence/chapter/title “are not issues.” That contradicts the Format Mechanics form and the v2 behavior users trusted.

### D. Citation does **not** bleed into Fonts/Margins units

Citation locations correctly use `section: "Citations"`. They do not call `stats.observe` on Fonts/Margins (before this fix). So non-citation **unit** score drift comes from compliance rewrites (fonts, title-page heuristics, pagination, document units), not from citation “contamination.”

### E. Smaller citation regression

v3 ML alias map dropped `CHICAGO` from the APA family aliases (v2 had it). Deterministic families still treated Chicago as author-year, but the classifier path could false-flag Chicago-like predictions against APA.

---

## 3. Fixes applied (this session)

1. **Restore full v2 pagination checker** (+ `_section_starts`) while keeping page-level locations (`line=None`) so tracing does not pin body line 1.  
2. **Add `Citations` to `BREAKDOWN_ORDER`** and observe marker-line units in `_check_citations` so Score Breakdown + overall include Citations when a style is set.  
3. **Restore Chicago/Harvard/Turabian alias sets** for the citation ML path.  
4. **Tests** updated for Citations category + restored pagination fixture defaults (`chapter_first_page` bottom-center again).  
5. Health build stamp: `2026-11-03-v2-pagination-citations-score`.

Touched trees: monorepo `machinelearning/` + `api/` (gateway scoring twin) and forthcoming `paperpilot-ml` PR for Render.

---

## 4. Deploy impact

| Layer | Needs redeploy? | Why |
|---|---|---|
| **Render (`paperpilot-ml`)** | **YES — manual** | Pagination + Citations scoring live in the analyze service |
| **Vercel (gateway)** | Recommended | `api/app/scoring.py` + `api/app/compliance.py` twins; progress harden already live |
| Firebase / clients | No schema break | Extra breakdown row (`Citations`) is additive |

After Render redeploy, `/health` should show:

`build: 2026-11-03-v2-pagination-citations-score`

---

## 5. Questions for when you return

1. On your “~98% v2” runs, was Pagination actually configured (title page / chapter first / roman prelims), or mostly Fonts/Margins?  
2. Should **Overall /100** stay as the equal mean of categories (v3 design), or move back toward v2’s global unit pass-rate as the headline number?  
3. For Citations, is **per-marker flagging** (v3) what you want, or the older **majority-vote** document rule (true v2)?  
4. Any sample manuscript (PDF/DOCX) + mechanics JSON from a “bad v3” vs “good v2” run we can freeze as a regression fixture?  
5. Confirm Render is tracking branch **`v2`** (post-merge) so the next PR lands where you redeploy.

---

## 6. Related

- Prior 502 investigation: progress 200 + result 500 from required `page`/`line` → fixed in PR #2.  
- Tracing investigation: [`INVESTIGATION.md`](./INVESTIGATION.md).  
- PDF/DOCX endpoint notes: [`PDF_AND_ML_ENDPOINT.md`](./PDF_AND_ML_ENDPOINT.md).
