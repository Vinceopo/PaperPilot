# PaperPilot ML Analyze Service (Render)

Standalone FastAPI service for hybrid document compliance: deterministic PDF/DOCX layout checks plus optional Gemini/citation ML helpers. The Vercel `api/` gateway proxies here; browsers and mobile clients never call Render directly.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | None | Liveness for Render |
| `POST` | `/v1/analyze` | `ML-Service-Key` | Start analyze job |
| `GET` | `/v1/analyze/{job_id}/progress` | `ML-Service-Key` | Stage + percent |
| `GET` | `/v1/analyze/{job_id}/result` | `ML-Service-Key` | Full scan payload |

Progress stages: `queued` → `parsing` → `checking` → `scoring` → `done` | `failed`.

### Create job body (JSON)

```json
{
  "job_id": "optional-client-id",
  "document_url": "https://…/manuscript.pdf",
  "filename": "thesis.pdf",
  "mechanics": { "rules": { "font": { "families": ["Times New Roman"] } } },
  "tier": "free"
}
```

Alternatively send `document_base64` instead of `document_url`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ML_SERVICE_KEY` | Yes | Shared secret; send as header `ML-Service-Key` |
| `GEMINI_API_KEY` | No | Optional issue wording/severity enrichment |
| `GEMINI_MODEL` | No | Default `gemini-2.0-flash` |
| `MAX_DOCUMENT_BYTES` | No | Default 25 MiB |
| `JOB_TTL_SECONDS` | No | In-memory job retention (default 3600) |
| `PORT` | No | Render sets this automatically |

Copy `.env.example` to `.env` for local runs.

## Local run

```bash
cd PaperPilot-main/machinelearning
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ML_SERVICE_KEY=dev-secret
uvicorn app.main:app --reload --port 8000
```

```bash
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/v1/analyze \
  -H "Content-Type: application/json" \
  -H "ML-Service-Key: dev-secret" \
  -d '{"document_base64":"…","filename":"paper.pdf","mechanics":{"rules":{}}}'
```

## Render deploy

1. **New Web Service** → connect repo.
2. **Root directory:** `PaperPilot-main/machinelearning`
3. **Runtime:** Docker (uses `Dockerfile`) *or* Native Python:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Health check path:** `/health`
5. Set `ML_SERVICE_KEY` (and optional `GEMINI_API_KEY`) in Render env.
6. Note the public URL for the Vercel gateway (`ML_SERVICE_URL` + same key as `ML_SERVICE_KEY`).

Citation style ML loads optional models from `PaperPilot-main/paperpilot-ml/models/` when present in the image; format compliance does not require them.

## Tests

```bash
cd PaperPilot-main/machinelearning
PYTHONPATH=. python -m unittest discover -s tests -p 'test_*.py'
```
