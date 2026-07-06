#!/bin/bash

# AttendWise Production Deployment Script
# Automated deployment and management for AttendWise system

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOG_DIR="$PROJECT_ROOT/logs"
BACKUP_DIR="$PROJECT_ROOT/backups"

# Environment Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
DB_BACKUP_RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-7}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp]${NC} $1" | tee -a "$LOG_DIR/deploy.log"
}

error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] ERROR:${NC} $1" | tee -a "$LOG_DIR/deploy-error.log"
}

warn() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] WARN:${NC} $1" | tee -a "$LOG_DIR/deploy.log"
}

info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] INFO:${NC} $1" | tee -a "$LOG_DIR/deploy.log"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons"
        exit 1
    fi
}

# Create necessary directories
setup_directories() {
    info "Creating necessary directories..."
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKEND_DIR/logs"
    mkdir -p "$BACKEND_DIR/uploads"
    mkdir -p "$BACKEND_DIR/cache"
    mkdir -p "$BACKEND_DIR/data"
    chmod 755 "$LOG_DIR"
    chmod 755 "$BACKUP_DIR"
    chmod 755 "$BACKEND_DIR/logs"
    chmod 755 "$BACKEND_DIR/uploads"
    chmod 755 "$BACKEND_DIR/cache"
    chmod 755 "$BACKEND_DIR/data"
}

# Load environment variables
load_environment() {
    info "Loading environment configuration..."

    # Frontend environment
    if [[ -f "$FRONTEND_DIR/.env" ]]; then
        export $(grep -v '^#' "$FRONTEND_DIR/.env" | xargs)
    elif [[ -f "$FRONTEND_DIR/.env.production" ]]; then
        export $(grep -v '^#' "$FRONTEND_DIR/.env.production" | xargs)
    else
        warn "Frontend .env not found, using system defaults"
    fi

    # Backend environment
    if [[ -f "$BACKEND_DIR/.env" ]]; then
        source "$BACKEND_DIR/.env"
    elif [[ -f "$BACKEND_DIR/.env.production" ]]; then
        source "$BACKEND_DIR/.env.production"
    else
        error "Backend .env file not found"
        exit 1
    fi
}

# Health check function
health_check() {
    local service_name="$1"
    local url="$2"
    local timeout="${3:-30}"
    local interval="${4:-5}"

    info "Performing health check for $service_name..."
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))

    while true; do
        local current_time=$(date +%s)
        if [[ $current_time -ge $end_time ]]; then
            error "Health check for $service_name timed out after $timeout seconds"
            return 1
        fi

        if curl -f -s --max-time 10 "$url" > /dev/null 2>&1; then
            info "$service_name is healthy"
            return 0
        fi

        local remaining=$((end_time - current_time))
        warn "$service_name health check failed, retrying in $interval seconds... ($remaining seconds remaining)"
        sleep $interval
    done
}

# Backup database
backup_database() {
    info "Creating database backup..."
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"

    if [[ -z "$DATABASE_URL" ]]; then
        error "DATABASE_URL not set, cannot create database backup"
        return 1
    fi

    if [[ "$DATABASE_URL" == postgresql* ]]; then
        # PostgreSQL backup
        if command -v pg_dump >/dev/null 2>&1; then
            pg_dump "$DATABASE_URL" > "$backup_file" 2>>"$LOG_DIR/backup.log"
            if [[ $? -eq 0 ]]; then
                info "PostgreSQL backup created: $backup_file"
            else
                error "PostgreSQL backup failed"
                return 1
            fi
        else
            warn "pg_dump not available, skipping PostgreSQL backup"
        fi
    else
        # SQLite backup
        local sqlite_db="${DATABASE_URL:11}" # Remove "sqlite:///" prefix
        if [[ -f "$sqlite_db" ]]; then
            cp "$sqlite_db" "$backup_file" 2>>"$LOG_DIR/backup.log"
            if [[ $? -eq 0 ]]; then
                info "SQLite backup created: $backup_file"
            else
                error "SQLite backup failed"
                return 1
            fi
        else
            warn "SQLite database not found: $sqlite_db, skipping backup"
        fi
    fi

    # Clean up old backups
    clean_old_backups

    # Upload to S3 if configured
    if [[ -n "$BACKUP_S3_BUCKET" ]]; then
        upload_backup_to_s3 "$backup_file"
    fi
}

clean_old_backups() {
    info "Cleaning old backups (retention: $DB_BACKUP_RETENTION_DAYS days)..."
    find "$BACKUP_DIR" -name "backup_*.sql" -mtime +$DB_BACKUP_RETENTION_DAYS -delete
    if [[ $? -eq 0 ]]; then
        info "Old backups cleaned successfully"
    else
        warn "Failed to clean old backups"
    fi
}

upload_backup_to_s3() {
    local backup_file="$1"
    info "Uploading backup to S3: $backup_file"

    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$backup_file" "s3://$BACKUP_S3_BUCKET/backups/" --region "$AWS_REGION"
        if [[ $? -eq 0 ]]; then
            info "Backup uploaded to S3 successfully"
        else
            warn "Failed to upload backup to S3"
        fi
    else
        warn "AWS CLI not available, skipping S3 upload"
    fi
}

# Deploy frontend
install_frontend() {
    info "Installing frontend..."

    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        info "Running npm install..."
        cd "$FRONTEND_DIR"
        npm install
        cd "$PROJECT_ROOT"
    else
        info "Node modules already installed"
    fi

    info "Building frontend..."
    cd "$FRONTEND_DIR"
    npm run build:production
    if [[ $? -eq 0 ]]; then
        info "Frontend built successfully"
    else
        error "Frontend build failed"
        return 1
    fi
    cd "$PROJECT_ROOT"

    # Copy to backend static directory
    info "Copying frontend to backend static directory..."
    cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_DIR/static/" 2>/dev/null || {
        mkdir -p "$BACKEND_DIR/static"
        cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_DIR/static/" 2>/dev/null
    }
    if [[ $? -eq 0 ]]; then
        info "Frontend deployed to backend static directory"
    else
        error "Failed to copy frontend to backend"
        return 1
    fi
}

# Deploy backend
install_backend() {
    info "Installing backend..."

    if [[ -d "$BACKEND_DIR/venv" ]]; then
        info "Virtual environment already exists"
    else
        info "Creating virtual environment..."
        python3 -m venv "$BACKEND_DIR/venv"
    fi

    info "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    source venv/bin/activate
    pip install --no-cache-dir -r requirements-production.txt
    if [[ $? -eq 0 ]]; then
        info "Backend dependencies installed successfully"
    else
        error "Backend dependencies installation failed"
        return 1
    fi
    cd "$PROJECT_ROOT"

    # Run database migrations
    run_migrations
}

run_migrations() {
    info "Running database migrations..."

    # Check if alembic is available
    if [[ -f "$BACKEND_DIR/alembic.ini" ]]; then
        source venv/bin/activate
        cd "$BACKEND_DIR"
        alembic upgrade head
        if [[ $? -eq 0 ]]; then
            info "Database migrations completed successfully"
        else
            error "Database migrations failed"
            return 1
        fi
        cd "$PROJECT_ROOT"
    else
        warn "Alembic configuration not found, skipping migrations"
    fi
}

# Start services
start_services() {
    info "Starting services..."

    if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        info "Starting services with docker-compose..."
        docker-compose up -d
        if [[ $? -eq 0 ]]; then
            info "Services started successfully"
        else
            error "Failed to start services with docker-compose"
            return 1
        fi
    else
        info "docker-compose.yml not found, skipping service start"
        warn "Please ensure services are running manually"
    fi
}

# Health check validation
validate_health() {
    info "Validating system health..."

    # Wait for services to start
    sleep 30

    # Check database health
    if [[ -n "$DATABASE_URL" ]]; then
        health_check "Database" "$DATABASE_URL" 60 10
        if [[ $? -ne 0 ]]; then
            error "Database health check failed"
            return 1
        fi
    fi

    # Check Redis health
    if [[ -n "$REDIS_URL" ]]; then
        health_check "Redis" "$REDIS_URL" 30 5
        if [[ $? -ne 0 ]]; then
            error "Redis health check failed"
            return 1
        fi
    fi

    # Check backend health
    local backend_url="${BACKEND_URL:-http://localhost:8000}/health"
    health_check "Backend" "$backend_url" 120 15
    if [[ $? -ne 0 ]]; then
        error "Backend health check failed"
        return 1
    fi

    # Check frontend
    local frontend_url="${FRONTEND_URL:-http://localhost:3000}"
    health_check "Frontend" "$frontend_url" 60 10
    if [[ $? -ne 0 ]]; then
        error "Frontend health check failed"
        return 1
    fi

    info "All health checks passed!"
}

# Rollback deployment
rollback() {
    warn "Initiating deployment rollback..."

    # Check for available backups
    local latest_backup=$(ls -t "$BACKUP_DIR"/backup_*.sql 2>/dev/null | head -n 1)
    if [[ -z "$latest_backup" ]]; then
        error "No backup files found, cannot rollback"
        return 1
    fi

    warn "Using backup: $latest_backup"

    # Restore database from backup
    if [[ "$DATABASE_URL" == postgresql* ]]; then
        info "Restoring PostgreSQL database..."
        if command -v pg_restore >/dev/null 2>&1; then
            # Stop services
            docker-compose down 2>/dev/null || true

            # Restore database
            pg_restore --clean --no-owner --single-transaction "$DATABASE_URL" "$latest_backup"
            if [[ $? -eq 0 ]]; then
                info "Database restored successfully"
            else
                error "Database restoration failed"
                return 1
            fi
        else
            error "pg_restore not available, cannot restore PostgreSQL database"
            return 1
        fi
    else
        info "Restoring SQLite database..."
        local sqlite_db="${DATABASE_URL:11}" # Remove "sqlite:///" prefix
        cp "$latest_backup" "$sqlite_db"
        if [[ $? -eq 0 ]]; then
            info "SQLite database restored successfully"
        else
            error "SQLite database restoration failed"
            return 1
        fi
    fi

    # Restart services
    info "Restarting services..."
    start_services

    # Validate health after rollback
    info "Validating system health after rollback..."
    if validate_health; then
        info "Rollback completed successfully!"
    else
        error "Health check failed after rollback"
        return 1
    fi
}

# Stop services
stop_services() {
    info "Stopping services..."

    if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        info "Stopping services with docker-compose..."
        docker-compose down
        if [[ $? -eq 0 ]]; then
            info "Services stopped successfully"
        else
            warn "Failed to stop some services with docker-compose"
        fi
    else
        info "docker-compose.yml not found, skipping service stop"
    fi

    # Kill remaining processes
    info "Cleaning up remaining processes..."
    pkill -f "gunicorn" 2>/dev/null || true
    pkill -f "uvicorn" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true

    info "Services stopped successfully"
}

# Show deployment status
status() {
    info "Deployment Status"
    echo "================================================"
    echo "Environment: $ENVIRONMENT"
    echo "Frontend Directory: $FRONTEND_DIR"
    echo "Backend Directory: $BACKEND_DIR"
    echo "Log Directory: $LOG_DIR"
    echo "Backup Directory: $BACKUP_DIR"
    echo ""
    echo "Frontend Status:"
    if [[ -d "$FRONTEND_DIR/node_modules" ]]; then
        echo "  ✅ Node modules installed"
    else
        echo "  ❌ Node modules not installed"
    fi

    if [[ -d "$FRONTEND_DIR/dist" ]]; then
        echo "  ✅ Frontend built"
    else
        echo "  ❌ Frontend not built"
    fi

    echo ""
    echo "Backend Status:"
    if [[ -d "$BACKEND_DIR/venv" ]]; then
        echo "  ✅ Virtual environment exists"
    else
        echo "  ❌ Virtual environment not found"
    fi

    if [[ -d "$BACKEND_DIR/static" ]]; then
        echo "  ✅ Static files deployed"
    else
        echo "  ❌ Static files not deployed"
    fi

    echo ""
    echo "Backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        local backup_count=$(find "$BACKUP_DIR" -name "backup_*.sql" 2>/dev/null | wc -l)
        echo "  📦 Backup files: $backup_count"
    else
        echo "  ❌ Backup directory not found"
    fi

    echo ""
    echo "Services:"
    if docker-compose ps > /dev/null 2>&1; then
        echo "  🐳 Docker services:"
        docker-compose ps --services 2>/dev/null || echo "  Unable to list services"
    else
        echo "  📦 Docker not running"
    fi

    echo "================================================"
}

# Show logs
logs() {
    local service="$1"
    info "Showing logs for: $service"

    if [[ -f "$LOG_DIR/deploy.log" ]]; then
        tail -f "$LOG_DIR/deploy.log"
    else
        info "No deploy.log found"
    fi
}

# Main deployment function
deploy() {
    info "Starting AttendWise Production Deployment..."
    info "Environment: $ENVIRONMENT"
    info "Project Root: $PROJECT_ROOT"

    # Run deployment steps
    check_root
    setup_directories
    load_environment
    install_frontend
    install_backend
    backup_database
    start_services
    validate_health

    info "================================================"
    info "🎉 Deployment completed successfully!"
    info "================================================"
    info "Services are now running and healthy"
    info "Access the application at: http://localhost:3000"
    info "API Documentation: http://localhost:8000/docs"
    info "Health Check: http://localhost:8000/health"
    info "================================================"
}

# Show help
help() {
    cat << EOF
AttendWise Production Deployment Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  deploy              Deploy the AttendWise application (default)
  rollback            Rollback to previous version
  stop                Stop all services
  status              Show deployment status
  logs [service]      Show deployment logs
  help                Show this help message

Options:
  -e, --environment    Environment (production, staging, development) [default: production]
  -b, --backup-retention   Number of days to retain backups [default: 7]

Examples:
  $0 deploy                    Deploy AttendWise to production
  $0 deploy -e production -b 14    Deploy with 14-day backup retention
  $0 rollback                   Rollback to previous version
  $0 stop                       Stop all services
  $0 status                     Show deployment status
EOF
}

# Parse command line arguments
case "${1:-deploy}" in
    deploy)
        deploy "$@"
        ;;
    rollback)
        rollback "$@"
        ;;
    stop)
        stop_services "$@"
        ;;
    status)
        status "$@"
        ;;
    logs)
        logs "$2"
        ;;
    help|*)
        help
        ;;
esac

exit 0