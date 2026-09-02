# PaperPilot

Research-paper assistant: web dashboard, Expo mobile app, FastAPI + Gemini analysis, Firebase for auth and storage.

**v1 stack:** React.js + Tailwind · Expo · FastAPI · Python · Gemini API · rule engine · Firebase

Deferred: Go, Express.js, native Swift iOS (Expo already builds iOS).

## Layout

```
PaperPilot/
  api/       FastAPI (Gemini + rules + PDF text)
  web/       React + Vite + Tailwind
  mobile/    React Native Expo
  firebase.json
```

## Run after installs (see SETUP.md)

1. Firebase: create a project, copy web config into `web/.env` and `mobile/app.json` extra.
2. Gemini: put `GEMINI_API_KEY` in `api/.env`.
3. API: `cd api` → create venv → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`
4. Web: `cd web` → `npm install` → `npm run dev`
5. Mobile: `cd mobile` → `npx expo start`
