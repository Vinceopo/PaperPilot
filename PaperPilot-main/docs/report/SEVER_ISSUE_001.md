# SEVER_ISSUE_001 — Firebase RTDB Download Amplification

**Severity:** Critical (free-tier network CAP / demo outage)  
**Status:** Code mitigations implemented; **Firebase project cutover still requires you**  
**Date:** 2026-10-21  
**Related:** [`FIREBASE_RTDB_DOWNLOADS_INVESTIGATION.md`](../../../FIREBASE_RTDB_DOWNLOADS_INVESTIGATION.md), [`plan.md`](../../../plan.md)

---

## 1. Problem (confirmed)

| Metric | Value |
|---|---|
| RTDB monthly downloads | ~157 GB |
| Free download CAP | **10 GB/month** |
| Data stored | ~477 MB |
| Cause | Self-inflicted read amplification (not DDoS) |

**Root causes:**

1. Multi‑MB `parsed_data` / scan `issues` stored inside Firebase RTDB nodes.  
2. `list_manuscripts()` downloaded **entire version trees** just to compute counts.  
3. Web + mobile dashboard refreshed every **30 seconds**, re-triggering those reads.

---

## 2. Decisions locked with you

| Decision | Choice |
|---|---|
| Firebase reset | **New Firebase project** (fresh free quota) |
| Heavy blobs | **All** → Cloudinary JSON (`parsed`, scans, mechanics) |
| Old data | **Fresh demo only** (no migration of fat nodes) |
| Dashboard poll | **Removed** (focus / app-active refresh only) |

---

## 3. What was implemented in code (while you slept)

### 3.1 New module

| File | Why |
|---|---|
| [`api/app/cloudinary_artifacts.py`](../../api/app/cloudinary_artifacts.py) | Signed upload/download of JSON sidecars (`raw`) with deterministic `public_id`s |

**public_id layout:**

```text
paperpilot/{uid}/mechanics/{mechanicsId}
paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/parsed
paperpilot/{uid}/manuscripts/{mid}/versions/{vid}/scans/{scanId}
```

When `CLOUDINARY_CLOUD_NAME` + `API_KEY` + `API_SECRET` are set → artifacts mode **on**.  
When unset (unit tests) → legacy RTDB embedding remains so tests stay offline-friendly.

### 3.2 API / RTDB ([`api/app/compliance_db.py`](../../api/app/compliance_db.py))

| Touch | Why |
|---|---|
| `list_manuscripts` | Field-level version metas only (`id` / `pending` / `version_number`) — **never** full `parsed_data` trees |
| `_release_unscanned_versions` / `create_version` counters | Same slim metas (stops accidental fat downloads) |
| `list_versions` | Field-level list rows only |
| `create_mechanics` / `create_version` | Upload JSON sidecar; RTDB stores URL + metadata (no fat blobs when Cloudinary configured) |
| `get_mechanics` / `get_version` / `get_version_full` | Hydrate from Cloudinary URL when present; legacy RTDB fields still work |
| `finalize_scan_from_ml` / `persist_scan` | Full issues/sections → `result_json_url`; RTDB keeps scores/status |
| `_write_section_checks` | Section **scores only** (no `issues[]` arrays in RTDB) |
| `get_scan` | Merges Cloudinary `scan.json` into API response (clients keep same shape) |
| `_prune_old_committed_versions` | Keeps latest **3** committed versions per manuscript after commit |

### 3.3 Clients

| File | Why |
|---|---|
| [`web/src/App.jsx`](../../web/src/App.jsx) | Removed 30s `setInterval` dashboard refresh; keep focus/visibility refresh |
| [`mobile/src/context/AppDataContext.js`](../../mobile/src/context/AppDataContext.js) | Removed 30s interval; keep AppState `active` refresh |

### 3.4 Config notes

| File | Why |
|---|---|
| [`api/.env.example`](../../api/.env.example) | Documents Cloudinary artifact behavior + new Firebase URL cutover |

### 3.5 Firebase cutover (2026-10-21)

| Item | Status |
|---|---|
| New project `paperpilot-cb289` | Created by you |
| RTDB rules deployed | **Done** (via Admin REST; CLI could not see project yet) |
| Local `api/.env` + `web/.env` + `mobile/app.json` | Pointed at `paperpilot-cb289` |
| Admin JSON | `paperpilot-cb289-firebase-adminsdk.json` (local; do not commit) |
| Vercel production envs | **Still needed** — set `FIREBASE_CREDENTIALS` (base64) + `FIREBASE_DATABASE_URL` + web `VITE_FIREBASE_*` |
| Mobile Firebase config | Updated to `paperpilot-cb289` in `mobile/app.json` |
| Mobile RTDB (not Firestore) | `mobile/src/firebase.js` + `saveUserProfile` now use Realtime Database like web |
| Google OAuth web client id (mobile) | Still needs a **new** Web client under `paperpilot-cb289` (old `269305680269-…` will not work). Email/password works without it. |
| Demo users | Re-register on the new project |

Old `paperpilotv6` left unused (not wiped).

---

## 4. Feature impact matrix

| Feature | Affected? | Notes |
|---|---|---|
| Login / OTP / profiles | No logic change | Still small RTDB rows; new project = new users |
| Subscriptions / PayMongo | No logic change | Same |
| Manuscript list | Yes (safer) | Same API response; cheaper RTDB reads |
| Upload version + scan | Yes | Needs Cloudinary credentials for sidecar writes |
| Issues / Trace / open scan | Yes (hydration) | Same client API; server loads `scan.json` once |
| Format mechanics | Yes | Sidecar for parsed text; list stays rules metadata |
| Cross-device live sync | UX change | No 30s poll — refresh on focus/resume |
| Version history depth | Capped | Latest 3 committed versions kept |

---

## 5. Deploy / cutover checklist (do when awake)

### A. Create new Firebase project

1. Firebase Console → Add project (e.g. `paperpilotv7` or `paperpilot-thesis`).  
2. Enable **Authentication** (Email/Password + Google if you use it).  
3. Create **Realtime Database** (recommend `asia-southeast1`).  
4. Deploy rules from [`database.rules.json`](../../database.rules.json):  
   `firebase deploy --only database --project <NEW_PROJECT_ID>`  
5. Project Settings → Service accounts → Generate new private key.  
6. Put base64 of that JSON into Vercel `FIREBASE_CREDENTIALS`.  
7. Set `FIREBASE_DATABASE_URL` to the new RTDB URL.  
8. Update web `VITE_FIREBASE_*` and mobile `app.json` `extra.firebase` to the new project.  
9. Register fresh demo accounts; run one upload→scan→open-result path.  
10. Leave `paperpilotv6` alone as archive (do not migrate fat nodes).

### B. Confirm Cloudinary

Ensure production API has:

- `CLOUDINARY_CLOUD_NAME`  
- `CLOUDINARY_API_KEY`  
- `CLOUDINARY_API_SECRET`  
- Upload preset still works for **source documents** (unchanged)

Without API key/secret, server cannot write JSON sidecars and will keep embedding in RTDB (bad for CAP).

### C. Deploy order

1. Deploy **API** with Cloudinary env set.  
2. Deploy **web** (polling removed).  
3. Ship **mobile** build when ready.  
4. Point envs at **new Firebase** only after API+web are live.

---

## 6. Automated test note

Ran: `pytest tests/test_compliance_pipeline.py tests/test_scoring_consistency.py`

- **59 passed**  
- **1 failed** (`LayoutAndPageTests::test_heading_font_issues_use_heading_label_and_specific_size`) — asserts issue type `font_size_heading1` vs current `font_size`. **Unrelated to RTDB/Cloudinary changes** (pre-existing scoring label expectation).

---

## 7. Manual test cases (to expose bugs)

Do these on a **non-production / new Firebase** project first.

### 7.1 Bandwidth / list safety

| # | Steps | Expected |
|---|---|---|
| T1 | Sign in, open dashboard, leave tab visible **10+ minutes** | Firebase RTDB Downloads barely move (KB–MB, not GB) |
| T2 | With several manuscripts/versions, open dashboard | Manuscript list loads; network to RTDB is small |
| T3 | Switch away and back to the tab | Dashboard refreshes once (focus), not every 30s |

### 7.2 Mechanics

| # | Steps | Expected |
|---|---|---|
| T4 | Upload / extract format mechanics | Saved; Cloudinary has `.../mechanics/{id}` raw JSON |
| T5 | List “Use a Saved Format” | Names/rules show; RTDB mechanics node has **no** giant `parsed_data` |
| T6 | Rename mechanics | Still works; conflict on duplicate name still errors |

### 7.3 Upload + scan happy path

| # | Steps | Expected |
|---|---|---|
| T7 | Upload manuscript (PDF/DOCX) with Cloudinary source | Version row in RTDB has `parsed_json_url`, **no** embedded `parsed_data` |
| T8 | Run scan to completion | Scan row has scores + `result_json_url`; issues appear in UI |
| T9 | Open Issues panel + Trace a location | Highlights work; document preview loads |
| T10 | Refresh page and reopen same scan | Full issues still load (Cloudinary hydration) |

### 7.4 Limits / history

| # | Steps | Expected |
|---|---|---|
| T11 | Create 4+ successful scanned versions on one manuscript | Only latest **3** committed versions remain |
| T12 | Hit free scan limit | Upgrade message still correct |
| T13 | Fail/cancel a scan (ML error) | Status `failed`; no scan credit charged; no stuck `running` forever |

### 7.5 Auth / billing (regression)

| # | Steps | Expected |
|---|---|---|
| T14 | Register + email OTP | Works on new Firebase |
| T15 | Login + Google (if enabled) | Works |
| T16 | Subscription page / PayMongo test checkout | Still creates/updates slim subscription row |

### 7.6 Mobile parity

| # | Steps | Expected |
|---|---|---|
| T17 | Mobile: sign in, upload, scan, open result | Same as web |
| T18 | Mobile: background app 5+ minutes, resume | One refresh on active; no 30s storm |
| T19 | Scan on mobile, open web later (focus web) | Appears after focus refresh |

### 7.7 Failure injection (important)

| # | Steps | Expected |
|---|---|---|
| T20 | Temporarily break Cloudinary secret, try upload version | API errors clearly; **does not** silently write multi‑MB into RTDB |
| T21 | Delete `result_json_url` asset manually, open scan | Graceful empty/partial issues — no 500 loop |
| T22 | Very large PDF parse | Upload may fail at size guard; RTDB stays small |

---

## 8. Questions for you when you wake

Reply with letters / short answers:

1. **New project id name** — any preference (`paperpilotv7`, `paperpilot-thesis`, other)?  
2. **Should I help run Firebase CLI cutover with you** (login + deploy rules) in the next session? **Y/N**  
3. **Vercel production** — deploy API+web as soon as Cloudinary envs confirmed? **Y/N**  
4. **Old `paperpilotv6`** — leave as archive only, or also disable (freeze) it in console?  
5. **Mobile release** — Expo OTA / store build this week, or web-first only for defense?

---

## 9. Residual risks

| Risk | Mitigation |
|---|---|
| Deploy code **without** Cloudinary API secret | Sidecars won’t write; fat RTDB returns — **verify envs** |
| Stay on capped `paperpilotv6` | Free CAP already blown this month — **cut over to new project** |
| Orphan Cloudinary JSON after deletes | Acceptable for thesis; optional cleanup later |
| Slightly slower first open of a result | One CDN fetch; acceptable |

---

## 10. Success criteria

- Idle dashboard does not burn multi‑GB/hour.  
- New writes: RTDB version/scan/mechanics nodes are **KB-scale**.  
- Upload → scan → Issues/Trace works on web (and mobile when shipped).  
- Monthly RTDB downloads stay **well under 10 GB** under thesis demo use.
