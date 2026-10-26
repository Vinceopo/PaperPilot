# PaperPilot — what to download (Windows)

Install in this order. Close and reopen Cursor (and PowerShell) after Node and Python so `node` and `python` are on PATH.

## 1. Git

- Download: [https://git-scm.com/download/win](https://git-scm.com/download/win)
- Install with default options.
- Check: `git --version`

## 2. Node.js LTS (web + Expo)

- Download: [https://nodejs.org/](https://nodejs.org/) (LTS, 20 or 22)
- Check: `node -v` and `npm -v`

## 3. Python 3.11 or 3.12 (FastAPI + Gemini)

- Download: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
- Enable **Add python.exe to PATH**.
- Check: `python --version` and `pip --version`

## 4. Google accounts (no installer)

### Firebase

1. [https://console.firebase.google.com/](https://console.firebase.google.com/) → Add project `paperpilot`
2. Enable **Authentication → Email/Password**
3. Enable **Authentication → Google**, select a support email, and add your local web domains under **Authentication → Settings → Authorized domains** if needed.
4. Create **Firestore** (start in test mode, then use `firestore.rules` in this repo)
5. Enable **Storage**
6. Add a **Web** app; copy the config object into `web/.env` (see `web/.env.example`)
7. Add an **Android** app (package `com.paperpilot.app`) when you run Expo on a device
8. Copy the Web app config values into `mobile/app.json` under `extra.firebase`; add the Google Web client ID under `extra.googleWebClientId` for mobile Google sign-in.

### Gemini API

1. [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key
2. Copy into `api/.env` as `GEMINI_API_KEY`

## 5. Expo Go (phone, optional)

- Android: Expo Go from Google Play
- iOS later: Expo Go from the App Store (same Expo project)

## 6. After the tools are installed

```powershell
cd C:\Users\User\PaperPilot\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# edit .env — paste GEMINI_API_KEY
# Set FIREBASE_CREDENTIALS to the service-account JSON path shown in the repository root.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```powershell
cd C:\Users\User\PaperPilot\web
copy .env.example .env
# edit .env — paste Firebase keys
npm install
npm run dev
```

```powershell
cd C:\Users\User\PaperPilot\mobile
npm install
npx expo start
```

Do **not** install Go, Express, or Xcode/Swift for v1.

## 7. Render ML service + Vercel gateway env

Document compliance scans run on a **Render** Web Service (`PaperPilot-main/machinelearning/`). The Vercel **api/** gateway starts jobs, stores results in Firebase, and exposes progress — browsers and mobile never call Render directly.

### Render (ML service)

1. Create a **Web Service** on [Render](https://render.com/) connected to this repo.
2. **Root directory:** `PaperPilot-main/machinelearning`
3. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or use the included `Dockerfile`).
4. **Health check path:** `/health`
5. Environment variables on Render:

| Variable | Required | Notes |
|----------|----------|--------|
| `ML_SERVICE_KEY` | Yes | Long random secret; must match Vercel `ML_SERVICE_KEY` |
| `GEMINI_API_KEY` | No | Optional issue wording / severity enrichment |
| `GEMINI_MODEL` | No | Default `gemini-2.0-flash` |
| `MAX_DOCUMENT_BYTES` | No | Default 120 MiB (match Pro upload ceiling) |
| `JOB_TTL_SECONDS` | No | In-memory job retention (default 3600) |

Copy the service public URL (e.g. `https://paperpilot-ml.onrender.com`) for Vercel.

Local ML run (optional):

```powershell
cd PaperPilot-main\machinelearning
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# set ML_SERVICE_KEY in .env
uvicorn app.main:app --reload --port 8001
```

### Vercel (api gateway + web)

Root `vercel.json` builds `web/` and routes `/api/*` to `api/index.py`. In the Vercel project dashboard (**Settings → Environment Variables**), set Production (and Preview if you use it):

| Variable | Required | Notes |
|----------|----------|--------|
| `ML_SERVICE_URL` | Yes* | Render service URL, no trailing slash |
| `ML_SERVICE_KEY` | Yes* | Same value as on Render |
| `MAX_UPLOAD_BYTES` | Yes | `120000000` (Pro ceiling; Free 15 MB / Premium 45 MB / Pro 120 MB enforced by plan) |
| `AWS_ACCESS_KEY_ID` | Yes | IAM user with S3 put/get on the bucket |
| `AWS_SECRET_ACCESS_KEY` | Yes | Matching secret (never commit) |
| `AWS_REGION` | Yes | e.g. `ap-southeast-2` |
| `AWS_S3_BUCKET` | Yes | e.g. `paperpilot-storage` |

\*If both ML vars are unset, scans fall back to in-process compliance on the gateway (local dev only).

Also keep existing gateway vars (`FIREBASE_CREDENTIALS`, `FIREBASE_DATABASE_URL`, `GEMINI_API_KEY`, PayMongo, Resend/SMTP, `APP_PUBLIC_URL`, etc.) — full list with placeholders in `api/.env.example`.

Do **not** paste secrets into chat or commit them. Prefer the Vercel dashboard over `vercel env add` unless the CLI is already authenticated on your machine.

After changing env vars, **redeploy** the Vercel project so the API picks them up.

### S3 bucket CORS + public read (browser uploads / preview)

Clients upload with `PUT` to an API-issued **presigned** URL (`upload_url`). That URL is **not** a document link — opening it in a tab issues `GET` and AWS returns `SignatureDoesNotMatch` XML. Preview/download must use `public_url` only.

**CORS** — S3 console → bucket → Permissions → Cross-origin resource sharing (CORS):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      "https://paperpilotph.vercel.app"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Bucket policy** (public `GetObject` so `public_url` works in the browser). Replace the bucket name if yours differs. Block Public Access must allow this policy (turn off “Block public access to buckets and objects granted through new public bucket or access point policies” for this bucket, or the equivalent that blocks bucket policies):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::paperpilot-storage/*"
    }
  ]
}
```

IAM user keys on the API still need `s3:PutObject` / `s3:GetObject` (and `s3:ListBucket` if you use console tooling). The API downloads via authenticated `GetObject`; browser preview needs the public policy above.

### Upload size by plan

| Plan | Max upload |
|------|------------|
| Free | 15 MB |
| Premium | 45 MB |
| Pro | 120 MB |

On Render ML, raise `MAX_DOCUMENT_BYTES` to at least `120000000` so Pro manuscripts are not rejected during analyze.

### Scan API (clients poll via gateway)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/manuscripts/{id}/versions/{id}/scan` | Start scan; returns `scan_id`, `status: running` when ML is configured |
| `GET` | `/scans/{scan_id}/progress` | `{ percent, stage, message, status }` |
| `GET` | `/scans/{scan_id}` | Full result (hydrates from ML when still running) |

## If PowerShell blocks venv activate

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

