# Stage 1: Build wheels
FROM python:3.11-slim as builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-prod.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements-prod.txt

# Stage 2: Runtime
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    BACKEND_PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    tesseract-ocr \
    tesseract-ocr-spa \
    libzbar0 \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN useradd -m -r appuser && \
    mkdir -p /app/uploads /app/static /app/templates && \
    chown -R appuser:appuser /app

COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements-prod.txt .
RUN pip install --no-cache-dir /wheels/* && \
    find /app -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; \
    rm -rf /root/.cache /tmp/*

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE ${BACKEND_PORT}

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=2 \
    CMD python -c "import urllib.request, os; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', os.environ.get('BACKEND_PORT', '8000')) + '/health', timeout=5)" || exit 1

ENTRYPOINT ["tini", "--"]
CMD sh -c 'exec gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT:-${BACKEND_PORT:-8000}}" \
    --workers "${WEB_CONCURRENCY:-1}" \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -'
