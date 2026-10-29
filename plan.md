# PaperPilot RTDB Bandwidth — Business Impact & Implementation Plan

**Status:** Planning (no code changes yet)  
**Context:** Capstone / thesis demo — stay on **Firebase free tier** as much as possible  
**Tech stack constraint:** Keep current stack (Firebase RTDB Auth, Cloudinary, Vercel API, Render ML, web + mobile)  
**Source of truth for the incident:** [`FIREBASE_RTDB_DOWNLOADS_INVESTIGATION.md`](./FIREBASE_RTDB_DOWNLOADS_INVESTIGATION.md)

---

## 1. Executive summary

Firebase RTDB “Downloads” hit **~157 GB** against a **10 GB/month** free network cap. The database itself only stores **~477 MB**. This is **read amplification**, not a DDoS and not “too many users.”

**Goal for thesis:** make Firebase usage stay comfortably under free limits (downloads + storage), without changing the product’s core tech choices.

**Recommended strategy (hybrid — your Cloudinary idea + must-do API fixes):**

1. **Immediate (P0):** Stop full-tree RTDB reads in list endpoints + reduce dashboard polling.  
2. **Structural (P1):** Move heavy JSON (`parsed_data`, full scan payloads) **out of RTDB into Cloudinary `raw` JSON**, keep only slim metadata + CDN URLs in Firebase.  
3. **Quota reset (P2):** Fresh Firebase project **or** wipe heavy nodes on `paperpilotv6` **after** P0/P1 land — otherwise the new free quota burns again.

Your Cloudinary JSON idea is **directionally correct and thesis-friendly**. Alone it is **not enough** — if list endpoints still pull fat trees (or polling stays aggressive while old fat data remains), downloads stay high.

---

## 2. Business / thesis impact

### 2.1 What broke

| Impact area | Effect |
|---|---|
| **Availability** | RTDB network disabled / rate-limited once monthly download CAP is exceeded → auth-adjacent flows, manuscripts, scans, OTP state become flaky or fail. |
| **Demo reliability** | Capstone defenses / adviser demos can fail mid-session if quota is exhausted. |
| **Cost risk** | Upgrading Firebase Blaze “just to survive” without fixing amplification turns a thesis into recurring spend. |
| **Credibility** | If asked “why Firebase died,” the honest answer is architecture (fat blobs + polling), not external attack. |
| **Data integrity** | No evidence of malicious wipe; risk is **egress**, not corruption. |

### 2.2 What is *not* the problem

- Not a classic public DDoS on open RTDB rules.  
- Not Storage quota (storage ~477 MB &lt; 1 GB limit).  
- Not “Firebase is wrong for theses” — **mis-modeled payload placement** is the issue.

### 2.3 Success criteria (thesis-grade)

| Metric | Target after fix |
|---|---|
| RTDB monthly downloads | **&lt; 2 GB/month** under normal demo use (comfortably under 10 GB) |
| RTDB stored size | **&lt; 50–100 MB** for demo accounts (metadata-only) |
| `GET /manuscripts` RTDB cost | **&lt; ~50 KB per call** per user (not tens of MB) |
| Dashboard open 1 hour | Does **not** consume multi‑GB |
| Core UX | Upload → scan → view issues/trace still works on web + mobile |
| Stack | Still Firebase + Cloudinary + existing API/ML |

---

## 3. My take on your Cloudinary JSON idea

### 3.1 The idea (as I understand it)

Instead of writing full scan results / `parsed_data` into RTDB:

1. Build the heavy result as **JSON**.  
2. Upload that JSON to **Cloudinary** (`resource_type=raw`), named/keyed by the same UUID / public_id family as the uploaded document.  
3. Store in Firebase only: `cloudinary_url` / `public_id`, score summary, status, ids, timestamps.

### 3.2 Verdict: **Yes — do this for heavy blobs**

This matches how you already treat **source documents** (PDF/DOCX on Cloudinary, URL in RTDB). Extending that pattern to **result artifacts** is consistent and keeps Firebase “index-shaped.”

**Pros for a thesis free-tier setup**

- Firebase downloads stop scaling with document parse size.  
- Cloudinary free/allowance is usually better suited to **object blobs** than RTDB network.  
- Same mental model: document + sidecar JSON(s) on CDN.  
- Easy to explain in the paper: “metadata in RTDB, artifacts in object storage.”

**Cons / caveats**

| Caveat | Mitigation |
|---|---|
| Cloudinary unsigned presets can make JSON **world-readable** if URLs leak | Prefer **authenticated/private** raw assets, or signed download URLs (you already have `signed_download_url` patterns server-side). For thesis, private + server fetch is enough. |
| Naming collisions if only `same filename` | Prefer **deterministic public_id** from ids you already own: `paperpilot/{uid}/{manuscript_id}/{version_id}/parsed.json` and `.../scan_{scan_id}.json` — not original filename alone. |
| ML/API still need `parsed_data` during analysis | Server fetches JSON from Cloudinary **once per scan job**, not on every dashboard poll. |
| Listing manuscripts must never fetch those JSONs | RTDB list paths stay slim forever. |
| Cloudinary quota/bandwidth also has limits | Still far better than RTDB 10 GB download CAP for this pattern; keep JSON gzip’d if needed. |

### 3.3 Suggested artifact layout (keeps stack)

```text
Cloudinary (raw):
  paperpilot/{uid}/{manuscriptId}/{versionId}/source          # existing upload
  paperpilot/{uid}/{manuscriptId}/{versionId}/parsed.json     # parsed_data + extracted_text
  paperpilot/{uid}/{manuscriptId}/{versionId}/scans/{scanId}.json  # full issues payload

Firebase RTDB (slim only):
  /paperpilot/manuscript_versions/{uid}/{mid}/{vid}
      id, version_number, pending, source_filename, file_type,
      cloudinary_url, parsed_json_url, created_at, mechanics_id
      # NO parsed_data, NO extracted_text

  /paperpilot/compliance_scans/{uid}/{scanId}
      id, status, scores, manuscript_id, version_id, created_at,
      result_json_url, issue_count
      # NO giant issues[] tree (or keep a tiny preview of N issues max)
```

**Naming recommendation:** use **UUIDs / existing ids**, not the human filename, as the stable key. You can still set `original_filename` metadata on Cloudinary for display.

### 3.4 What Cloudinary alone does *not* fix

Even after blobs move out, you must still fix:

1. **`list_manuscripts()` full-tree `.get()`** — today it would still be bad if any fat fields remain; after slim-only, it becomes cheap.  
2. **30s dashboard polling** — with slim rows it’s OK-ish; with any leftover fat data it’s deadly. For free tier, prefer focus/manual refresh.  
3. **Existing ~247 fat version nodes already in RTDB** — they keep burning quota until migrated or deleted.  
4. **Quota already exhausted this month** — code fix ≠ instant new 10 GB unless you reset project/wait/wipe + wait for billing cycle.

---

## 4. Alternative / complementary options (stack unchanged)

Ranked for **thesis + free Firebase**:

| Option | Effort | Impact | Recommendation |
|---|---|---|---|
| **A. Slim list reads** (field-level / index nodes; never load `parsed_data` for lists) | Low | Immediate stop-bleed | **Must do (P0)** |
| **B. Cloudinary JSON sidecars** for parsed + scan results | Medium | Structural fix | **Must do (P1)** — your idea |
| **C. Reduce polling** (focus/manual or 5–15 min) | Low | Prevents re-burn | **Must do (P0)** for free tier |
| **D. Cap history** (keep last N versions / scans per manuscript) | Low | Limits blast radius | Strongly recommended for thesis |
| **E. Fresh Firebase project** after A–C | Low–Med | Clean free quota | Best reset path for demo |
| **F. Wipe fat fields in place** on `paperpilotv6` | Med | Reclaim storage + stop re-reads | OK if you don’t want a new project |
| **G. Pay Blaze / raise CAP** | — | Buys time only | **Avoid** until A–C done; unnecessary for thesis if fixed |
| **H. Leave heavy data in RTDB but “only read when opening a result”** | Low | Partial | Helpful bridge, **not** sufficient long-term |
| **I. Client-side cache of manuscript list** (SWR-style; don’t refetch if fresh) | Low | Cuts repeat downloads | Nice P0.5 |

**Not recommended for this thesis:** migrating off Firebase to Postgres/Supabase/etc. That changes the stack and the paper’s architecture story for little thesis benefit if A–F work.

---

## 5. Target architecture (after fix)

```text
[Web / Mobile]
    |  auth (Firebase Auth)
    |  list endpoints (slim JSON)
    v
[Vercel API + firebase-admin]
    |  RTDB: metadata, subscriptions, OTP, indexes  (small)
    |  Cloudinary: source docs + parsed.json + scan.json (large)
    v
[Render ML]
    pulls parsed/source via API or signed URL when analyzing
```

**Rule of thumb:**  
If a field is **&gt; ~2–5 KB** and not needed for every list/poll → **it does not belong in RTDB.**

---

## 6. Implementation plan

### Phase 0 — Stop the bleeding (1–2 days) — **do before any quota reset**

**Goal:** Even with current fat data, stop multi‑GB/hour burns.

| Task | Owner area | Notes |
|---|---|---|
| 0.1 Change `list_manuscripts` to never `.get()` full version trees | `api/app/compliance_db.py` | Read only `version_number`, `pending`, `id` (per-field or maintain `version_index`) |
| 0.2 Audit every `.get()` on `manuscript_versions` / `mechanics` / `compliance_scans` | API | Classify: list vs detail vs scan-job |
| 0.3 Dashboard refresh: remove 30s interval **or** raise to ≥5–15 min + refresh on focus only | `web/src/App.jsx`, `mobile/.../AppDataContext.js` | Thesis default: **focus + manual** |
| 0.4 Add client short-TTL cache for manuscripts/mechanics lists | web/mobile | Avoid duplicate parallel loads |
| 0.5 Feature-flag / env: `RTDB_SLIM_MODE=1` | API | Safer rollout |

**Exit criteria:** With one heavy account tab open for 1 hour, RTDB downloads stay in **MB**, not **GB**.

---

### Phase 1 — Cloudinary JSON sidecars (2–4 days)

**Goal:** New writes never put multi‑MB JSON into RTDB.

| Task | Detail |
|---|---|
| 1.1 Define JSON schemas | `parsed.json` = `{ parsed_data, extracted_text, meta }`; `scan.json` = full scan result |
| 1.2 Server upload helper | API uploads `raw` JSON to Cloudinary with deterministic `public_id` |
| 1.3 Version create path | After parse: upload `parsed.json` → store `parsed_json_url` only |
| 1.4 Scan finalize path | After ML: upload `scan.json` → store summary + `result_json_url` |
| 1.5 Read paths | `get_version_full` / scan detail / trace viewer: fetch JSON from Cloudinary (server) or signed URL |
| 1.6 Security | Prefer authenticated/private raw; reuse signed download helper |
| 1.7 Mechanics (optional) | If mechanics `parsed_data` grows, same pattern; today it’s smaller — can defer |

**Exit criteria:** New scans/versions add **&lt; 2 KB** RTDB growth per version (URL + metadata).

---

### Phase 2 — History policy + migration / reset (1–2 days)

Pick **one** thesis path (see clarifying questions below):

#### Path R1 — Fresh Firebase project (cleanest free quota)

1. Create new Firebase project (Auth + RTDB).  
2. Deploy same rules.  
3. Point API/web/mobile env to new project.  
4. Do **not** migrate old fat nodes — recreate demo accounts.  
5. Keep old project read-only as archive if needed for the paper’s figures.

#### Path R2 — Same project, surgical wipe

1. After Phase 0–1: delete or null-out `parsed_data` / `extracted_text` / fat `issues` on old nodes.  
2. Optionally upload Cloudinary sidecars for versions you still need for demo.  
3. Wait for monthly download counter reset **or** accept disabled network until cycle rolls.

#### Path R3 — Fresh start data policy (recommended with either R1/R2)

For thesis demos:

- Keep **latest 1–3 versions** per manuscript.  
- Keep **latest scan** (or last 3) per version.  
- Auto-prune older nodes (simple cron or on-write trim).

**Exit criteria:** RTDB total size **&lt; 100 MB**; monthly downloads trending flat under light use.

---

### Phase 3 — Hardening for free tier (optional, 1 day)

| Task | Why |
|---|---|
| Cap `parsed.json` size / refuse absurd docs | Protects Cloudinary + ML |
| Progress polling: only small scan fields | Already partly done via summary fields — keep it strict |
| Monitoring checklist | Weekly glance at `network/monthly_sent` vs 10 GB |
| Rotate Admin SDK keys | Current local JSON keys fail JWT signature |
| Document in thesis “Limitations” | Free-tier architecture decisions |

---

## 7. Suggested sequencing (practical)

```text
Week A:
  Day 1–2  Phase 0 (slim reads + polling)     ← unlocks demo again
  Day 3–5  Phase 1 (Cloudinary JSON writes)

Week B:
  Day 1    Choose R1/R2 reset path
  Day 2    Migrate or wipe + point envs
  Day 3    End-to-end demo script + quota check
```

**Do not** reset Firebase first and redeploy the **old** list/poll code — you will re-exhaust the new free CAP quickly.

---

## 8. Testing plan (before calling it fixed)

1. Seed / use one manuscript with a large PDF (multi‑MB `parsed.json`).  
2. Open dashboard for 30+ minutes.  
3. Watch Firebase console → RTDB Usage → Downloads (should barely move).  
4. Open one scan result / trace — Cloudinary fetch once; RTDB only metadata.  
5. Repeat on mobile.  
6. Confirm ML scan still finalizes and scores match.  
7. Confirm free-tier: storage &lt; 1 GB, downloads ≪ 10 GB after a day of demo traffic.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cloudinary free limits hit instead | Gzip JSON; prune history; private assets; monitor Cloudinary usage |
| Broken old clients expecting embedded `parsed_data` | API compatibility shim: if `parsed_json_url` present, hydrate; else legacy field |
| Signed URL expiry mid-trace | Refresh URL on demand via API |
| Thesis deadline pressure | Ship Phase 0 first — restores demos even before Cloudinary migration |
| Accidental reintroduction of fat `.get()` | Code review checklist + one integration test that fails if list endpoints touch banned fields |

---

## 10. Clarifying questions (please answer)

Reply with choices / short notes so we can lock the plan before implementation:

1. **Firebase reset path**  
   - [ ] **R1** New Firebase project (clean free quota, re-create demo users)  
   - [ ] **R2** Keep `paperpilotv6`, wipe/trim fat nodes after code fix  
   - [ ] **R3** Wait for natural monthly reset only  
   - [ ] Recommend for me  

2. **What moves to Cloudinary JSON?**  
   - [ ] `parsed_data` + `extracted_text` only (minimum)  
   - [ ] Also full scan `issues` / result payloads  
   - [ ] Also mechanics parsed blobs  
   - [ ] All heavy blobs (recommended)

3. **History for the thesis demo**  
   - [ ] Keep all history (migrate what we can)  
   - [ ] Keep latest N versions/scans only (recommend N=1–3)  
   - [ ] Fresh demo data only after reset  

4. **Dashboard polling**  
   - [ ] Remove 30s auto-refresh (focus/manual only) — safest for free tier  
   - [ ] Slow to 5–15 minutes  
   - [ ] Keep ~30s only after rows are proven slim  

5. **Cloudinary visibility**  
   - [ ] Private/authenticated raw + signed URLs (safer)  
   - [ ] Unsigned preset OK for thesis speed (URLs effectively secret-by-obscurity)

6. **Scope of “migrate”**  
   - [ ] Fix forward only (new writes slim; old fat nodes deleted)  
   - [ ] Backfill Cloudinary JSON for existing versions you still need  

7. **Demo accounts**  
   - How many adviser/demo users must keep working after reset?  
   - Any data that *must* survive for the manuscript/paper screenshots?

8. **Success bar**  
   - Is “survives a 2-hour live defense with 2–3 concurrent users” the bar, or do you also need multi-day class testing?

---

## 11. Recommendation if you want a default now

Until you answer, the **thesis-default package** I suggest is:

1. **Phase 0** slim reads + **focus/manual refresh** (no 30s poll).  
2. **Phase 1** Cloudinary `parsed.json` + `scan.json` with UUID-based `public_id`s; RTDB metadata only.  
3. **Phase 2 Path R1** — new Firebase project for a clean free quota, **fresh demo data**, no migration of the old 247 fat versions.  
4. History cap: **latest 3 versions / latest scan** per manuscript going forward.  
5. Private/signed Cloudinary raw if easy; unsigned only if time-boxed.

That resolves the incident properly, keeps the stack, and matches “Firebase as free as possible” for capstone use.

---

## 12. Out of scope (for now)

- Rewriting ML pipeline architecture  
- Leaving Firebase for another primary DB  
- Paying for Blaze as the primary solution  
- Implementing fixes in this planning document (implementation starts after you confirm questions in §10)

---

## 13. Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-10-20 | Incident classified as self-inflicted amplification | See investigation MD |
| 2026-10-21 | Reset path **R1** — new Firebase project | User: 1A |
| 2026-10-21 | Cloudinary JSON for **all** heavy blobs | User: 2C |
| 2026-10-21 | Fresh demo data only (no fat migration) | User: 3A |
| 2026-10-21 | Remove 30s polling (focus/manual) | User: 4A |
| 2026-10-21 | Code mitigations landed | See `docs/report/SEVER_ISSUE_001.md` — Firebase cutover still needs user |
