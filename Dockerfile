# Stage 1: Build resources
FROM python:3.11-slim as builder

# Set environment variables for Python build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements files
COPY requirements.txt .

# Install dependencies into a separate directory for easy copying
# This builds wheels for everything, which we can then just install in the final stage
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt


# Stage 2: Final runtime environment
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install runtime dependencies ONLY (much smaller than build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user for better security
RUN useradd -m -r appuser && \
    mkdir -p /app/uploads && \
    mkdir -p /app/static && \
    mkdir -p /app/templates && \
    chown -R appuser:appuser /app

# Copy the built wheels from the builder stage
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .

# Install the dependencies without needing build tools
RUN pip install --no-cache /wheels/*

# Copy the rest of the application code
COPY --chown=appuser:appuser . .

# Switch to the non-root user
USER appuser

# Expose the configured port
EXPOSE 8000

# Simple healthcheck to verify the app is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, os; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8000') + '/')" || exit 1

# Start the application using check_db and uvicorn/main
CMD ["sh", "-c", "python check_db.py && python main.py"]
