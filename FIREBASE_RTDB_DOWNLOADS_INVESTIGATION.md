# Firebase RTDB Downloads Investigation

**Project:** `paperpilotv6`  
**Database:** `paperpilotv6-default-rtdb` (`asia-southeast1`)  
**Investigated:** 2026-10-20 (read-only; no rules, data, or settings were changed)  
**Firebase CLI user:** `vincebelleopo@gmail.com`  
**Question:** Why is Downloads ~157.98 GB, and is it a DDoS?

---

## Verdict

**This does not look like an external DDoS.**

It looks like **self-inflicted read amplification**: the API stores large `parsed_data` blobs inside RTDB manuscript versions, then the web/mobile dashboards call `GET /manuscripts` every ~30s, and that endpoint downloads **every version’s full payload** just to compute version counts.

Evidence in one line:

| Signal | Value | DDoS? |
|---|---|---|
| Monthly downloads (sent) | **~156.3 GB** (matches your ~157.98 GB) | — |
| Monthly download **limit** | **10 GB** | Explains rate-limit / CAP |
| Data stored in RTDB | **~477 MB** today | Not a dump of huge DB |
| Dominant API op | `rest_get` (Admin/server) | Not public websocket flood |
| Realtime listens | ~2–4 total | Almost no client listeners |
| Security-rules READ DENY | **4** (Oct 20 only) | Not mass probing |
| Active users with versions | **15** owners, **247** versions | Small user base |

**Conclusion:** usage CAP is real; cause is app architecture + polling, not a botnet hammering an open database.

---

## How this was confirmed (Firebase CLI + Monitoring)

### Firebase CLI (read-only)

```text
firebase login          # authenticated as vincebelleopo@gmail.com
firebase projects:list
firebase use paperpilotv6
firebase database:instances:list --project paperpilotv6
# -> paperpilotv6-default-rtdb

firebase database:get / --project paperpilotv6 --shallow
# -> users, phones, usernames, paperpilot_auth, paperpilot

firebase database:get /paperpilot --project paperpilotv6 --shallow
# -> manuscripts, manuscript_versions, mechanics, compliance_scans, ...
```

Shallow inventory (no writes):

| Path | Distinct owners (approx.) |
|---|---|
| `/paperpilot/manuscript_versions` | 15 |
| `/paperpilot/manuscripts` | 15 |
| `/paperpilot/mechanics` | 17 |
| `/paperpilot/compliance_scans` | 14 |
| `/paperpilot/subscriptions` | 25 |

Counts (shallow only):

- **55** manuscripts  
- **247** manuscript versions  
- **202** compliance scans  

### Cloud Monitoring (same project, last ~14 days)

Metric used for console “Downloads”:  
`firebasedatabase.googleapis.com/network/sent_bytes_count`

#### Daily downloads (bytes sent out of RTDB)

| Day (UTC bucket end) | Downloads |
|---|---|
| 2026-10-07 | 0.73 GB |
| 2026-10-08 | 0.96 GB |
| 2026-10-09 | 0.08 GB |
| 2026-10-10 | 0.08 GB |
| 2026-10-11 | 0.38 GB |
| 2026-10-12 | 0.32 GB |
| 2026-10-13 | 0.39 GB |
| 2026-10-15 | **6.18 GB** |
| 2026-10-16 | **11.79 GB** |
| 2026-10-17 | **41.29 GB** |
| 2026-10-18 | 1.70 GB |
| 2026-10-19 | **58.45 GB** |
| 2026-10-20 (partial) | **22.82 GB** |
| **~14-day sum** | **~145.1 GB** |

Billing “monthly sent” gauge (cumulative for the month):

| When | `network/monthly_sent` |
|---|---|
| 2026-10-20 | **167,774,246,842 bytes ≈ 156.27 GB** |

That matches the Firebase console figure (~157.98 GB; small gap = later hours / UI rounding).

#### Usage CAP

| Metric | Value |
|---|---|
| `network/monthly_sent_limit` | **10,737,418,240 bytes = 10 GB** |
| `storage/limit` | **1 GB** |
| `storage/total_bytes` (latest) | **~477 MB** (under storage limit) |

You are far over the **download** cap (10 GB/month), not the storage cap. That is why Firebase rate-limits / disables network for overages.

#### Hourly spikes (last ~3 days) — important for “attack vs app”

Selected peaks:

| Hour (UTC) | Downloads |
|---|---|
| 2026-10-18 16:00 | **14.51 GB** |
| 2026-10-18 19:00 | **15.41 GB** |
| 2026-10-19 14:00–15:00 | ~5.0–5.4 GB/hr |
| 2026-10-20 14:00 | **16.37 GB** |

These are **sustained multi‑GB hours**, but request volume is still app-scale (tens of thousands of REST gets/day), not millions of IPs.

#### Operation mix (`network/api_hits_count`)

Dominant operation: **`rest_get`** (Firebase Admin / REST from your API), e.g.:

- 2026-10-17: ~18,088 `rest_get`
- 2026-10-19: ~21,659 `rest_get`
- 2026-10-20: ~9,021 `rest_get`

Almost no client realtime traffic:

- `realtime_listen`: **2** (Oct 18), **2** (Oct 20)

Security rules:

- READ DENY evaluations observed: **4** on Oct 20 only  
  → not consistent with attackers hammering open paths.

---

## Why downloads exploded (root cause in code)

### 1. Huge payloads stored in RTDB version nodes

Each `/paperpilot/manuscript_versions/{uid}/{manuscriptId}/{versionId}` sample typically contains:

- `parsed_data` — often **1.5–3.5 MB**
- `extracted_text` — often **~100–150 KB**
- metadata (small)

Measured samples (read-only, limited):

| Sample version size | `parsed_data` share |
|---|---|
| ~0.3 MB | ~0.25 MB |
| ~1.5 MB | ~1.4 MB |
| ~3.3–3.7 MB | ~3.2–3.6 MB |

Average of 17 measured version nodes: **~1.98 MB / version**.

Rough store math: `247 versions × ~2 MB ≈ ~0.5 GB` → matches **~477 MB stored**.

So the DB itself is not 157 GB. **Downloads are re-reading the same ~0.5 GB over and over.**

### 2. `list_manuscripts()` downloads full version trees

In `api/app/compliance_db.py`, `list_manuscripts()` does (conceptually):

```python
rows = manuscripts/{uid}.get()
for each manuscript:
    versions = manuscript_versions/{uid}/{mid}.get()  # FULL TREE
    # then only uses version_number / pending / id
```

That means listing manuscripts pulls **all `parsed_data` for all versions**, even though the API response only needs counts / latest version number.

`list_versions(..., include_content=False)` already knows how to omit content for HTTP — but `list_manuscripts` still loads full nodes from RTDB first.

### 3. Clients poll that endpoint every 30 seconds

Web (`web/src/App.jsx`):

- silent `loadDashboard()` every **30s** while tab visible  
- also on focus / visibility  
- `loadDashboard` always calls `listManuscripts()` (+ mechanics, subscription, scans)

Mobile (`mobile/src/context/AppDataContext.js`):

- same pattern: `setInterval(refresh, 30000)` while app active

### 4. Amplification math (why 10 GB → 150+ GB is easy)

Take a heavy user with **~55 versions** (observed top owner):

- ~55 × ~2 MB ≈ **~110 MB per `list_manuscripts` call**
- poll every 30s ≈ **120 calls/hour**
- ≈ **13 GB/hour** from **one** open dashboard session

That alone explains hourly peaks of **14–16 GB** without any attacker.

Two overlapping heavy sessions (web + mobile, or two browsers) can push **tens of GB/day**. Observed peak day: **58.45 GB** on 2026-10-19.

Secondary contributors (smaller than manuscripts list, but real):

- `list_mechanics()` also `.get()`s the whole mechanics tree (usually small in samples: ~3–12 KB/owner).
- Scan progress / hydrate paths re-read scan + version nodes during analysis.
- Any backend job or local script that walks version trees multiplies the same cost.
- This investigation’s own limited read-only samples added a small amount of download traffic (not material vs 150+ GB).

---

## DDoS checklist — what we can and cannot say

| Hypothesis | Finding |
|---|---|
| Open RTDB scraped by bots | **Unlikely.** Current rules set `.read: false` on `/paperpilot` and `/paperpilot_auth`; client paths require auth. Almost no `realtime_listen` traffic. |
| Auth bypass / stolen Admin key mass-reading | **Possible in theory**, but traffic shape matches **dashboard polling + Admin REST gets** from your own API pattern, not random path enumeration. Rules DENY flood is absent. |
| Volumetric network DDoS | **No.** Request counts are tens of thousands/day, not millions; bytes are large because **each response is huge**. |
| Self-DoS / accidental amplification | **Yes — best fit.** Large blobs × full-tree reads × 30s polling. |

We did **not** pull per-IP Cloudflare/Vercel logs in this pass. If you want absolute certainty, next read-only check is Vercel/API request logs for `GET /manuscripts` frequency correlated with the GB spikes above.

---

## Timeline interpretation

1. **Oct 7–13:** moderate daily downloads (hundreds of MB). Monthly sent already past 10 GB limit early in the month (`monthly_sent` was already ~15 GB on Oct 7).  
2. **Oct 15–17:** sharp climb (6 → 12 → **41 GB/day**) as usage/polling against fat version trees increased.  
3. **Oct 18:** lower day (1.7 GB) but still had multi‑GB hours.  
4. **Oct 19:** worst day (**58.45 GB**).  
5. **Oct 20:** still high (**22.8 GB** partial day) — CAP / rate limiting expected.

Stored size stayed ~400–480 MB the whole time → not “someone uploaded 150 GB”; it’s **egress**, not storage growth.

---

## What RTDB “Downloads” means here

Firebase counts **bytes the database sends to readers** (clients **and** Admin SDK / REST).  
Your architecture uses Admin SDK on the API for almost all app data under `/paperpilot`. Those server reads **fully count** toward Downloads and the 10 GB monthly network cap.

---

## Recommended fixes (not implemented — investigation only)

1. **Stop full-tree reads in `list_manuscripts`**  
   Read only `version_number` / `pending` / `id` fields (or maintain a slim index node). Never `.get()` whole `manuscript_versions/{uid}/{mid}` for listing.
2. **Do not store multi‑MB `parsed_data` in RTDB**  
   Keep it in object storage (Cloudinary/GCS) or compute on demand; RTDB should hold pointers + small metadata.
3. **Slow or event-drive dashboard refresh**  
   30s full refresh of manuscripts/mechanics/scans is expensive once payloads are large.
4. **Raise plan / quota only after fixing amplification**  
   Paying for more download quota without fixing (1)–(3) will burn money at the same rate.
5. **Rotate Admin credentials**  
   Local `*firebase-adminsdk*.json` files currently fail with `Invalid JWT Signature` (revoked/corrupt). Treat that as a security hygiene item separate from this bandwidth incident.

---

## Artifacts from this investigation

| File | Purpose |
|---|---|
| `FIREBASE_RTDB_DOWNLOADS_INVESTIGATION.md` | This report |
| `_rtdb_usage_raw.json` | Raw Monitoring + size-sample JSON (local) |
| `_rtdb_usage_probe2.py`, `_rtdb_cap_metrics.py` | Read-only probe scripts used to pull metrics |

No database writes, rule deploys, deletes, or setting changes were performed.
