FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Single worker: jobs are in-process threads; multiple workers would 404 each other's jobs.
# Build stamp: pagination position-only (redeploy when this comment changes).
CMD ["sh", "-c", "uvicorn app.main:app --host ${HOST} --port ${PORT} --workers 1 --timeout-keep-alive 75"]
