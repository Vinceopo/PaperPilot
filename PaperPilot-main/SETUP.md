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

## If PowerShell blocks venv activate

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

