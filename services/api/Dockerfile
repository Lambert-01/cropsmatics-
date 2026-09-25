# Cropmatics Rwanda API image.
#
# Build context is the REPOSITORY ROOT, not services/api:
#   docker build -f services/api/Dockerfile -t cropmatics-api .
#
# Why: `data/processed/` is git-ignored (regenerable), so a container built only
# from services/api would start with no processed tables and every analytical
# endpoint would return 503. The image therefore runs the data pipeline at build
# time from the committed raw sources:
#
#     raw committed source -> pipeline -> processed data -> FastAPI
#
# Verified with `GET /api/v1/health/readiness` (status must be `ready`).
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps needed by psycopg/geoalchemy build (kept minimal).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# --- Python dependencies (cached independently of source changes) ----------
COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/services/api/requirements.txt

# --- Data pipeline inputs --------------------------------------------------
# Only the immutable raw sources and reference dictionaries are copied. The
# pipeline writes into data/processed, which is generated inside the image.
COPY scripts /app/scripts
COPY data/raw /app/data/raw
COPY data/dictionaries /app/data/dictionaries
COPY data/source_registry /app/data/source_registry

# --- Build the processed analytical tables ---------------------------------
# Fails the build if validation fails, so a broken image is never published.
RUN python scripts/data/run_all.py \
    && test -f data/processed/training_district_crop.csv \
    && test -f data/processed/manifest.json

# --- Application code + migrations -----------------------------------------
COPY services/api/app /app/services/api/app
COPY services/api/alembic /app/services/api/alembic
COPY services/api/alembic.ini /app/services/api/alembic.ini

# --- Optional ML model card ------------------------------------------------
# ml/reports/ is git-ignored. Either build the card here (INSTALL_ML=true, which
# installs the heavy ML extras) or inject an approved card as a deployment
# artifact. Default false keeps the API image small; the model page then reports
# `unavailable` honestly instead of showing metrics that do not exist.
COPY ml /app/ml
ARG INSTALL_ML=false
RUN if [ "$INSTALL_ML" = "true" ]; then \
      pip install -r /app/services/api/requirements-ml.txt && \
      python ml/src/pipelines/run_training.py ; \
    fi

WORKDIR /app/services/api

EXPOSE 8000

# Non-root user for least privilege. /app is chowned so the pipeline output and
# any runtime cache stay writable by the non-root user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import json,urllib.request; \
r=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/readiness')); \
raise SystemExit(0 if r.get('status')=='ready' else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
