# Production Dockerfile for AttendWise Backend
# Multi-stage build with optimizations for performance, security, and size

# ========== STAGE 1: Build Dependencies ==========
FROM python:3.11-slim AS build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    python3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100

# Create app user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy requirements files
COPY backend/requirements-production.txt backend/requirements.txt
COPY backend/requirements.txt .

# Install production dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt && \
    pip install --no-cache-dir -r backend/requirements-production.txt

# ========== STAGE 2: Application Build ==========
FROM python:3.11-slim AS app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONPATH=/app/src \
    PYTHONPATH=/app/backend \
    # Gunicorn settings
    GUNICORN_WORKERS=4 \
    GUNICORN_TIMEOUT=120 \
    GUNICORN_KEEPALIVE=2 \
    # Database settings
    DATABASE_URL="postgresql://postgres:password@postgres:5432/attendwise" \
    # Redis settings
    REDIS_URL="redis://redis:6379/0" \
    # Security
    SECRET_KEY="change-this-in-production" \
    # Logging
    LOG_LEVEL="INFO"

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads /app/cache && \
    chown -R appuser:appuser /app

WORKDIR /app

# Copy application source code
COPY backend/ ./backend/

# Copy static files from frontend build (if available)
COPY dist/ ./static/ 2>/dev/null || echo "Frontend build not found, creating empty directory"

# Install application from requirements
RUN pip install --no-cache-dir -r backend/requirements.txt && \
    pip install --no-cache-dir -r backend/requirements-production.txt

# Set up gunicorn configuration
COPY backend/gunicorn_config.py ./

# Create log directories
RUN mkdir -p /app/logs /app/uploads /app/cache && \
    chown -R appuser:appuser /app && \
    chmod +x /app/backend/*.py

# ========== STAGE 3: Production Image ==========
FROM python:3.11-slim AS production

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONPATH=/app \
    # Production settings
    GUNICORN_WORKERS=4 \
    GUNICORN_TIMEOUT=120 \
    GUNICORN_KEEPALIVE=2 \
    # Security
    SECRET_KEY="change-this-in-production" \
    DEBUG=false \
    LOG_LEVEL="INFO"

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads /app/cache /tmp/uploads && \
    chown -R appuser:appuser /app

WORKDIR /app

# Copy from build stage
COPY --from=app /app /app

# Copy gunicorn config
COPY backend/gunicorn_config.py /app/

# Add non-root user for security
RUN chown -R appuser:appuser /app && \
    chmod +x /app/backend/*.py && \
    chown -R appuser:appuser /app/logs /app/uploads /app/cache

# Health check endpoint
COPY healthcheck.sh /app/
RUN chmod +x /app/healthcheck.sh

# Database initialization script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Expose port
EXPOSE 8000

# Create non-root user to run the application
USER appuser

# Set entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command
CMD ["gunicorn", "--config", "gunicorn_config.py", "--bind", "0.0.0.0:8000", "backend.main:app"]

# Labels for better container management
LABEL maintainer="AttendWise Team"
LABEL description="AI-Powered Student Attendance Companion Backend"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="attendwise-backend"
LABEL org.opencontainers.image.description="Production backend for AttendWise AI attendance system"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="2024-07-06T12:00:00Z"
LABEL org.opencontainers.image.authors="AttendWise Team"

# Health check label
LABEL org.label-schema.healthcheck="true"
LABEL org.label-schema.healthcheck.port="8000"
LABEL org.label-schema.healthcheck.endpoint="/health"

# Build metadata
ARG BUILD_DATE
ARG VCS_REF
LABEL build_date="$BUILD_DATE"
LABEL vcs_ref="$VCS_REF"
LABEL vcs_url="https://github.com/your-org/attendwise"