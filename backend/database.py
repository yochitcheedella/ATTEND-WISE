import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables from the backend/.env file relative to this database.py file
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Default to local SQLite in the project root if DATABASE_URL is not provided or is invalid
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not SQLALCHEMY_DATABASE_URL or SQLALCHEMY_DATABASE_URL.startswith("http://") or SQLALCHEMY_DATABASE_URL.startswith("https://"):
    project_root = os.path.dirname(backend_dir)
    db_path = os.path.join(project_root, "attendwise.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

# Connection pooling configurations for production Postgres database
pool_size = int(os.getenv("DB_POOL_SIZE", "20"))
max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "10"))
pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args=connect_args
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args=connect_args,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
