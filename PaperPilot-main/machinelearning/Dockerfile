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

CMD ["sh", "-c", "uvicorn app.main:app --host ${HOST} --port ${PORT}"]
