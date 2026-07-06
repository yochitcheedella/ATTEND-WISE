# Gunicorn Configuration for AttendWise Backend Production
# Optimized for FastAPI with multi-process, async support

import multiprocessing
import os

# Server socket
bind = "0.0.0.0:8000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 100
preload_app = True
timeout = 120
keepalive = 2

# Process naming
proc_name = "attendwise-backend"

# Logging
accesslog = "/app/logs/access.log"
errorlog = "/app/logs/error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sμs'

# File permissions (uncomment if needed)
# user = "appuser"
# group = "appuser"
uid = None
gid = None

# Server mechanics
limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8190
limit_content_length = 100000000  # 100MB

# SSL (configure when using HTTPS)
# keyfile = "/app/ssl/private.key"
# certfile = "/app/ssl/certificate.crt"

# Server timeouts
# We timeout just the worker process but keep the master alive
# so it can restart workers that have crashed or hung.

# Worker timeout (in seconds)
timeout = 120

# Worker startup timeout
worker_tmp_dir = None

# Pool settings
# The number of requests a worker will process before restarting
max_requests = 1000

# Worker connections
worker_connections = 1000

# Process naming
proc_name = "attendwise-backend"

# Server hooks

def on_starting(server):
    """Called just before the master process is initialized."""
    server.log.info("AttendWise Backend starting up...")

def on_reload(server):
    """Called just before a worker process is restarted."""
    server.log.info("AttendWise Backend reloading...")

def when_ready(server):
    """Called just after the master process has initialized."""
    server.log.info("AttendWise Backend is ready. Listening on %s://%s:%s",
                   server.wsgi.url_scheme, server.address[0],
                   server.address[1])
    server.log.info("Worker processes: %d", server.worker_count)
    server.log.info("Worker class: %s", server.worker_class)

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    server.log.info("Spawning worker %d", worker.pid)

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    server.log.info("Worker spawned (pid: %d)", worker.pid)

def pre_exec(server):
    """Called just before a worker executes the executable."""
    server.log.info("Executing worker application")

def worker_int(server, worker):
    """Called just after a worker exited on SIGINT or SIGQUIT."""
    server.log.info("Worker received INT or QUIT signal")

def worker_abort(server, worker):
    """Called when a worker received the SIGABRT signal."""
    server.log.info("Worker received SIGABRT signal")

def pre_request(worker, req):
    """Called just before a worker processes the request."""
    worker.log.access("%(request_line)s %(status)s %(byte_size)sμs")

def post_request(worker, req, environ, req_time):
    """Called after a request is processed."""
    pass

def child_exit(server, worker):
    """Called just after a worker has been exited."""
    server.log.info("Worker exited (pid: %d)", worker.pid)

def on_exit(server):
    """Called just before exiting."""
    server.log.info("Server is shutting down...")

# Custom logging

class StructuredLogger:
    """Custom logger for structured logging with JSON output."""

    def __init__(self, logger):
        self.logger = logger

    def info(self, msg, *args, **kwargs):
        import json
        import time
        log_entry = {
            "timestamp": time.time(),
            "level": "INFO",
            "message": msg % args if args else msg,
            "service": "attendwise-backend",
            "environment": os.getenv("ENVIRONMENT", "production"),
            **kwargs,
        }
        self.logger.info(json.dumps(log_entry))

    def error(self, msg, *args, **kwargs):
        import json
        import time
        log_entry = {
            "timestamp": time.time(),
            "level": "ERROR",
            "message": msg % args if args else msg,
            "service": "attendwise-backend",
            "environment": os.getenv("ENVIRONMENT", "production"),
            **kwargs,
        }
        self.logger.error(json.dumps(log_entry))

    def warning(self, msg, *args, **kwargs):
        import json
        import time
        log_entry = {
            "timestamp": time.time(),
            "level": "WARNING",
            "message": msg % args if args else msg,
            "service": "attendwise-backend",
            "environment": os.getenv("ENVIRONMENT", "production"),
            **kwargs,
        }
        self.logger.warning(json.dumps(log_entry))

# Development overrides (use for local development)
if os.getenv("ENVIRONMENT") == "development":
    bind = "127.0.0.1:8000"
    workers = 1
    worker_class = "sync"
    loglevel = "debug"
    accesslog = "/app/logs/access-dev.log"
    errorlog = "/app/logs/error-dev.log"
    preload_app = False
    max_requests = 0  # No restart

# Memory optimization settings for containerized deployments
if os.getenv("ENVIRONMENT") == "production":
    # Optimize for container performance
    preload_app = True
    keepalive = 5
    timeout = 180
    max_requests = 500

    # Use better worker class for FastAPI
    worker_class = "uvicorn.workers.UvicornWorker"

    # Optimize worker startup
    worker_tmp_dir = "/tmp"

# Cache configuration
# These settings help optimize FastAPI application performance with Gunicorn

# Gunicorn limit requests per second
limit_request_line = 8192
limit_request_fields = 100
limit_request_field_size = 8192

# Maximum content length for file uploads
limit_content_length = 10485760  # 10MB for uploads

# Log rotation settings (if using systemd, let it handle log rotation)
# For container deployments, rely on external log management

# Security hardening
# Disable Python bytecode writing in production
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

# Improve startup performance
os.environ.setdefault("PYTHONUNBUFFERED", "1")

# Signal handling for graceful shutdown
import signal
def signal_handler(signum, frame):
    import sys
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

# Performance tuning for production

# Enable worker reuse for performance
worker_connections = 1000

# Better load balancing
preload_app = True

# Large file upload support
limit_content_length = 52428800  # 50MB for attendance reports

# HTTP proxy compatibility
# If behind a reverse proxy like Nginx, uncomment and configure:
# forwarded_allow_ips = ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
# x_forwarded_for_header = 'X-Forwarded-For'

# SSL configuration (example for HTTPS)
# keyfile = '/path/to/private.key'
# certfile = '/path/to/certificate.crt'
# ssl_version = 'TLSv1_2'

# Load balancing settings
# If using multiple backend servers
# chroot = '/path/to/chroot/dir'
# pidfile = '/path/to/gunicorn.pid'
# worker_tmp_dir = '/path/to/worker/tmp'

# Process management
# umask = 0

# Resource limits
# on startup, run: ulimit -n 65536 (increase file descriptor limit)

# CPU affinity
# instance = 0  # which instance of this app (for multihost deployment)
# enable_stdio_inheritance = True  # for docker logs

print("Gunicorn configuration loaded successfully")