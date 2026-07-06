from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, time, timedelta
import os
import base64
import requests
import json
import math


from fastapi.security import OAuth2PasswordRequestForm
from . import models, schemas, auth
from .database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Simple SQLite migration for minimum_required_attendance and academic_calendar columns
from sqlalchemy import text
try:
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(subjects)"))
        columns = [row[1] for row in result.fetchall()]
        if "minimum_required_attendance" not in columns:
            conn.execute(text("ALTER TABLE subjects ADD COLUMN minimum_required_attendance FLOAT DEFAULT 75.0"))
            
        result_sem = conn.execute(text("PRAGMA table_info(semesters)"))
        columns_sem = [row[1] for row in result_sem.fetchall()]
        if "academic_calendar" not in columns_sem:
            conn.execute(text("ALTER TABLE semesters ADD COLUMN academic_calendar TEXT"))
except Exception as e:
    print("Migration warning:", e)

app = FastAPI(
    title="AttendWise API",
    description="Backend API for AttendWise AI-Powered Student Attendance Companion",
    version="1.0.0"
)

# Configure CORS
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")] if allowed_origins_str else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True if allowed_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

import uuid
import time
from datetime import datetime
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Middleware for Request ID & Structured Logging (Checklist Section 6)
@app.middleware("http")
async def add_request_id_and_logging(request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        print(f"INFO: {request.method} {request.url.path} - {response.status_code} (Duration: {process_time:.4f}s, RequestID: {request_id})")
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as e:
        process_time = time.time() - start_time
        print(f"ERROR: {request.method} {request.url.path} failed - {str(e)} (Duration: {process_time:.4f}s, RequestID: {request_id})")
        raise e

# Custom Global Exception Handlers (Checklist Section 5)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail,
            "error": exc.detail,
            "timestamp": datetime.utcnow().isoformat(),
            "requestId": getattr(request.state, "request_id", str(uuid.uuid4()))
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    err_msgs = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in errors]
    message = "Validation error: " + "; ".join(err_msgs)
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": message,
            "error": errors,
            "timestamp": datetime.utcnow().isoformat(),
            "requestId": getattr(request.state, "request_id", str(uuid.uuid4()))
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "An unexpected server error occurred.",
            "error": str(exc),
            "timestamp": datetime.utcnow().isoformat(),
            "requestId": getattr(request.state, "request_id", str(uuid.uuid4()))
        }
    )

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

# --- Authentication Endpoints ---
@app.post("/auth/register", response_model=schemas.User, tags=["Authentication"])
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        name=user.name,
        email=user.email,
        password_hash=hashed_password,
        college=user.college,
        branch=user.branch,
        semester=user.semester,
        attendance_goal=user.attendance_goal
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/auth/login", response_model=schemas.Token, tags=["Authentication"])
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = auth.timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- Subjects Endpoints ---
@app.post("/subjects", response_model=schemas.Subject, tags=["Subjects"])
def create_subject(subject: schemas.SubjectCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_subject = models.Subject(**subject.model_dump(), user_id=current_user.id)
    db.add(db_subject)
    db.commit()
    db.refresh(db_subject)
    return db_subject

@app.get("/subjects", response_model=List[schemas.Subject], tags=["Subjects"])
def get_subjects(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Subject).filter(models.Subject.user_id == current_user.id).all()

@app.put("/subjects/{subject_id}", response_model=schemas.Subject, tags=["Subjects"])
def update_subject(subject_id: int, subject_update: schemas.SubjectCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_sub = db.query(models.Subject).filter(models.Subject.id == subject_id, models.Subject.user_id == current_user.id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Update subject fields
    db_sub.name = subject_update.name
    db_sub.code = subject_update.code
    db_sub.prof = subject_update.prof
    db_sub.credits = subject_update.credits
    db_sub.color = subject_update.color
    db_sub.minimum_required_attendance = subject_update.minimum_required_attendance
    
    db.commit()
    db.refresh(db_sub)
    return db_sub

@app.delete("/subjects/{subject_id}", tags=["Subjects"])
def delete_subject(subject_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_sub = db.query(models.Subject).filter(models.Subject.id == subject_id, models.Subject.user_id == current_user.id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check if there are associated timetables or attendances, we will delete them or cascade.
    # To keep database clean, delete related timetable and attendances for this subject.
    db.query(models.Timetable).filter(models.Timetable.subject_id == subject_id).delete()
    db.query(models.Attendance).filter(models.Attendance.subject_id == subject_id).delete()
    
    db.delete(db_sub)
    db.commit()
    return {"message": "Subject and all related data deleted successfully"}

# --- Timetable Endpoints ---
@app.post("/timetable", response_model=schemas.Timetable, tags=["Timetable"])
def create_timetable(timetable: schemas.TimetableCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_tt = models.Timetable(**timetable.model_dump(), user_id=current_user.id)
    db.add(db_tt)
    db.commit()
    db.refresh(db_tt)
    return db_tt

@app.get("/timetable", response_model=List[schemas.Timetable], tags=["Timetable"])
def get_timetable(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Timetable).filter(models.Timetable.user_id == current_user.id).all()

# --- Attendance Endpoints ---
@app.post("/attendance", response_model=schemas.Attendance, tags=["Attendance"])
def log_attendance(attendance: schemas.AttendanceCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_att = models.Attendance(**attendance.model_dump(), user_id=current_user.id)
    db.add(db_att)
    db.commit()
    db.refresh(db_att)
    return db_att

@app.get("/attendance", response_model=List[schemas.Attendance], tags=["Attendance"])
def get_attendance(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Attendance).filter(models.Attendance.user_id == current_user.id).all()

# --- Helper Functions ---
def _compute_streak(user_id: int, db: Session) -> int:
    """
    Compute the current attendance streak:
    Count consecutive class days (going backwards from today) where the 
    user has at least one 'present' record.
    - Days with zero attendance records (weekends, holidays) are skipped.
    - Days where ALL records are 'cancelled' or 'holiday' are also skipped.
    - A day breaks the streak only if it has at least one 'absent' record
      AND zero 'present' records (i.e. the student was completely absent).
    - Today counts toward the streak if already partially marked present.
    """
    today = date.today()
    streak = 0
    check_date = today  # Start from today itself
    
    for _ in range(365):  # Max 1 year lookback
        day_attendances = db.query(models.Attendance).filter(
            models.Attendance.user_id == user_id,
            models.Attendance.date == check_date
        ).all()
        
        has_present = any(a.status.lower() == "present" for a in day_attendances)
        has_absent = any(a.status.lower() == "absent" for a in day_attendances)
        
        # Check if it's a meaningful class day: has at least one present/absent record
        active_statuses = {a.status.lower() for a in day_attendances}
        is_class_day = bool(active_statuses - {"cancelled", "holiday", "upcoming"})
        
        if len(day_attendances) == 0 or not is_class_day:
            # Skip days with no records or only cancelled/holiday/upcoming
            check_date -= timedelta(days=1)
            continue
        elif has_present:
            # Student attended at least one class — counts as streak day
            streak += 1
            check_date -= timedelta(days=1)
        else:
            # Student was absent on a class day — streak broken
            break
    
    return streak

def _compute_global_stats(user_id: int, db: Session):
    """Compute overall attendance stats across all subjects."""
    attendances = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id
    ).all()
    
    present = sum(1 for a in attendances if a.status.lower() == "present")
    absent = sum(1 for a in attendances if a.status.lower() == "absent")
    total = present + absent
    percentage = round((present / total * 100), 2) if total > 0 else 0.0
    
    return {"present": present, "absent": absent, "total": total, "percentage": percentage}

def _compute_safe_bunks(present: int, total: int, target_pct: float) -> dict:
    """Compute safe bunks or classes needed to reach target."""
    if total == 0:
        return {"type": "neutral", "count": 0, "text": "No data", "desc": "Start marking attendance to view limits."}
    
    target_fraction = target_pct / 100.0
    safe_bunks = math.floor((present - target_fraction * total) / target_fraction)
    
    if safe_bunks >= 0:
        return {
            "type": "safe",
            "count": safe_bunks,
            "text": f"{safe_bunks} Classes",
            "desc": f"You can safely miss {safe_bunks} consecutive classes while staying above {target_pct}%."
        }
    else:
        classes_needed = math.ceil((target_fraction * total - present) / (1 - target_fraction))
        return {
            "type": "risk",
            "count": classes_needed,
            "text": f"{classes_needed} Classes Required",
            "desc": f"Warning! You must attend the next {classes_needed} consecutive classes to reach {target_pct}%."
        }

# --- Analytics Endpoints ---
@app.get("/analytics/dashboard", tags=["Analytics"])
def get_dashboard_analytics(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    stats = _compute_global_stats(current_user.id, db)
    bunk_info = _compute_safe_bunks(stats["present"], stats["total"], current_user.attendance_goal)
    return {
        "overall_percentage": stats["percentage"],
        "total_classes": stats["total"],
        "present": stats["present"],
        "absent": stats["absent"],
        "safe_bunks": bunk_info["count"] if bunk_info["type"] == "safe" else 0,
        "bunk_analysis": bunk_info
    }

@app.get("/analytics/detailed", tags=["Analytics"])
def get_detailed_analytics(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """
    Returns:
    - Weekly trend: last 6 weeks attendance percentage
    - Heatmap data: attendance density per week for last 16 weeks
    - Subject-wise detailed stats
    """
    user_id = current_user.id
    today = date.today()
    
    # --- Weekly Trend (last 6 weeks) ---
    weekly_trend = []
    for week_offset in range(5, -1, -1):  # from 5 weeks ago to current week
        week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=week_offset)
        week_end = week_start + timedelta(days=6)
        
        week_attendances = db.query(models.Attendance).filter(
            models.Attendance.user_id == user_id,
            models.Attendance.date >= week_start,
            models.Attendance.date <= week_end
        ).all()
        
        p = sum(1 for a in week_attendances if a.status.lower() == "present")
        total = sum(1 for a in week_attendances if a.status.lower() in ("present", "absent"))
        pct = round(p / total * 100, 1) if total > 0 else 0.0
        weekly_trend.append(pct)
    
    # --- Heatmap Data (last 16 weeks, daily density) ---
    heatmap_start = today - timedelta(weeks=16)
    heatmap_attendances = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id,
        models.Attendance.date >= heatmap_start
    ).all()
    
    # Build a dict: date_str -> intensity (0-4)
    from collections import defaultdict
    date_stats = defaultdict(lambda: {"present": 0, "total": 0})
    for a in heatmap_attendances:
        d = a.date.isoformat()
        if a.status.lower() in ("present", "absent"):
            date_stats[d]["total"] += 1
        if a.status.lower() == "present":
            date_stats[d]["present"] += 1
    
    heatmap = {}
    for d, stats in date_stats.items():
        if stats["total"] == 0:
            heatmap[d] = 0
        else:
            pct = stats["present"] / stats["total"]
            if pct == 0:
                heatmap[d] = 0
            elif pct < 0.25:
                heatmap[d] = 1
            elif pct < 0.5:
                heatmap[d] = 2
            elif pct < 0.75:
                heatmap[d] = 3
            else:
                heatmap[d] = 4
    
    # --- Subject-Wise Stats ---
    subjects = db.query(models.Subject).filter(models.Subject.user_id == user_id).all()
    all_attendances = db.query(models.Attendance).filter(models.Attendance.user_id == user_id).all()
    
    subject_stats = {}
    for sub in subjects:
        sub_atts = [a for a in all_attendances if a.subject_id == sub.id]
        p = sum(1 for a in sub_atts if a.status.lower() == "present")
        ab = sum(1 for a in sub_atts if a.status.lower() == "absent")
        total = p + ab
        pct = round(p / total * 100, 1) if total > 0 else 0.0
        subject_stats[sub.name] = {
            "name": sub.name,
            "code": sub.code,
            "color": sub.color,
            "prof": sub.prof,
            "present": p,
            "absent": ab,
            "total": total,
            "percent": pct
        }
    
    return {
        "weekly_trend": weekly_trend,
        "heatmap": heatmap,
        "subjects": subject_stats
    }

@app.get("/analytics/prediction", tags=["Analytics"])
def get_prediction(
    missed: int = 0,
    attended: int = 0,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Prediction engine:
    - missed: how many classes the user plans to miss
    - attended: how many classes the user plans to attend
    Returns the predicted attendance percentage after those classes.
    """
    stats = _compute_global_stats(current_user.id, db)
    target = current_user.attendance_goal
    target_fraction = target / 100.0
    
    new_present = stats["present"] + attended
    new_total = stats["total"] + missed + attended
    
    predicted_pct = round(new_present / new_total * 100, 2) if new_total > 0 else 0.0
    
    # How many classes needed to reach target from current state
    if stats["total"] > 0:
        classes_for_target = max(0, math.ceil((target_fraction * stats["total"] - stats["present"]) / (1 - target_fraction)))
    else:
        classes_for_target = 0
    
    # Safe bunks from current state
    safe_bunks = max(0, math.floor((stats["present"] - target_fraction * stats["total"]) / target_fraction))
    
    return {
        "current_percent": stats["percentage"],
        "predicted_percent": predicted_pct,
        "will_reach_target": predicted_pct >= target,
        "classes_for_target": classes_for_target if stats["percentage"] < target else 0,
        "safe_bunks": safe_bunks if stats["percentage"] >= target else 0,
        "target": target,
        "scenarios": {
            "if_miss_1": round(stats["present"] / (stats["total"] + 1) * 100, 1) if stats["total"] > 0 else 0,
            "if_miss_3": round(stats["present"] / (stats["total"] + 3) * 100, 1) if stats["total"] > 0 else 0,
            "if_miss_5": round(stats["present"] / (stats["total"] + 5) * 100, 1) if stats["total"] > 0 else 0,
            "if_attend_5": round((stats["present"] + 5) / (stats["total"] + 5) * 100, 1) if stats["total"] > 0 else 100,
            "if_attend_10": round((stats["present"] + 10) / (stats["total"] + 10) * 100, 1) if stats["total"] > 0 else 100,
        }
    }

# --- Leave Plans Endpoints ---
@app.post("/leave_plans", response_model=schemas.LeavePlan, tags=["Leave Plans"])
def create_leave_plan(plan: schemas.LeavePlanCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_plan = models.LeavePlan(**plan.model_dump(), user_id=current_user.id)
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@app.get("/leave_plans", response_model=List[schemas.LeavePlan], tags=["Leave Plans"])
def get_leave_plans(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.LeavePlan).filter(models.LeavePlan.user_id == current_user.id).order_by(models.LeavePlan.start_date.asc()).all()

@app.delete("/leave_plans/{plan_id}", tags=["Leave Plans"])
def delete_leave_plan(plan_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_plan = db.query(models.LeavePlan).filter(models.LeavePlan.id == plan_id, models.LeavePlan.user_id == current_user.id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Leave plan not found")
    db.delete(db_plan)
    db.commit()
    return {"message": "Leave plan deleted successfully"}

# --- Profile Updates ---
@app.put("/user/profile", tags=["App"])
def update_profile(profile: schemas.UserUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    current_user.name = profile.name
    current_user.attendance_goal = profile.attendance_goal
    current_user.semester = profile.semester
    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated successfully"}

# --- Timetable Sync ---
@app.post("/timetable/sync", tags=["App"])
def sync_timetable(req: schemas.TimetableSyncRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    user_id = current_user.id
    
    # 1. Clear existing timetable entries
    db.query(models.Timetable).filter(models.Timetable.user_id == user_id).delete()
    db.commit()
    
    # 2. Add new timetable entries, resolving subjects by name
    from datetime import time as dt_time
    import random
    
    existing_subjects = db.query(models.Subject).filter(models.Subject.user_id == user_id).all()
    sub_map = {s.name.lower().strip(): s for s in existing_subjects}
    
    for entry in req.timetable:
        sub_key = entry.subject.lower().strip()
        # Ignore breaks when saving to database
        if entry.type == "Break" or sub_key in ["break", "lunch break", "recess", "lunch"]:
            continue
            
        if sub_key in sub_map:
            subject = sub_map[sub_key]
        else:
            colors = ["#cdbdff", "#40e56c", "#ffb3ae", "#7c4dff", "#02c953", "#ffdad7"]
            color = random.choice(colors)
            subject = models.Subject(
                user_id=user_id,
                name=entry.subject,
                code="CS-" + str(random.randint(100, 999)),
                prof=entry.prof,
                color=color,
                credits=3
            )
            db.add(subject)
            db.commit()
            db.refresh(subject)
            sub_map[sub_key] = subject
            
        start_parts = [int(p) for p in entry.start.split(":")]
        end_parts = [int(p) for p in entry.end.split(":")]
        start_time = dt_time(start_parts[0], start_parts[1])
        end_time = dt_time(end_parts[0], end_parts[1])
        
        db_tt = models.Timetable(
            user_id=user_id,
            subject_id=subject.id,
            day=entry.day,
            start_time=start_time,
            end_time=end_time,
            room=entry.room,
            type=entry.type
        )
        db.add(db_tt)
        
    db.commit()
    
    # Regenerate class sessions for active semester with the new timetable
    _generate_sessions_for_active_semester(db, user_id)
    
    return {"message": "Timetable synced successfully"}

# --- Reports Endpoints ---
@app.get("/reports/summary", tags=["Reports"])
def get_report_summary(
    period: str = "monthly",
    start_date: str = None,
    end_date: str = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns structured data for report generation.
    period: daily, weekly, monthly, semester, custom
    """
    user_id = current_user.id
    today = date.today()
    
    # Determine date range
    if period == "daily":
        d_start = today
        d_end = today
    elif period == "weekly":
        d_start = today - timedelta(days=today.weekday())
        d_end = d_start + timedelta(days=6)
    elif period == "monthly":
        d_start = today.replace(day=1)
        next_month = today.replace(day=28) + timedelta(days=4)
        d_end = next_month - timedelta(days=next_month.day)
    elif period == "semester":
        d_start = today - timedelta(days=120)
        d_end = today
    elif period == "custom" and start_date and end_date:
        d_start = date.fromisoformat(start_date)
        d_end = date.fromisoformat(end_date)
    else:
        d_start = today - timedelta(days=30)
        d_end = today
    
    attendances = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id,
        models.Attendance.date >= d_start,
        models.Attendance.date <= d_end
    ).all()
    
    subjects = db.query(models.Subject).filter(models.Subject.user_id == user_id).all()
    sub_map = {s.id: s for s in subjects}
    
    # Overall stats
    present = sum(1 for a in attendances if a.status.lower() == "present")
    absent = sum(1 for a in attendances if a.status.lower() == "absent")
    cancelled = sum(1 for a in attendances if a.status.lower() == "cancelled")
    holidays = sum(1 for a in attendances if a.status.lower() == "holiday")
    total = present + absent
    percentage = round((present / total * 100), 2) if total > 0 else 0.0
    
    # Subject-wise breakdown
    subject_breakdown = []
    for sub in subjects:
        sub_atts = [a for a in attendances if a.subject_id == sub.id]
        s_present = sum(1 for a in sub_atts if a.status.lower() == "present")
        s_absent = sum(1 for a in sub_atts if a.status.lower() == "absent")
        s_total = s_present + s_absent
        s_pct = round((s_present / s_total * 100), 2) if s_total > 0 else 0.0
        subject_breakdown.append({
            "name": sub.name,
            "code": sub.code,
            "present": s_present,
            "absent": s_absent,
            "total": s_total,
            "percentage": s_pct,
            "color": sub.color
        })
    
    # Daily log for the range
    daily_log = {}
    for a in attendances:
        d_str = a.date.isoformat()
        if d_str not in daily_log:
            daily_log[d_str] = []
        daily_log[d_str].append({
            "subject": sub_map[a.subject_id].name if a.subject_id in sub_map else "Unknown",
            "status": a.status
        })
    
    return {
        "period": period,
        "start_date": d_start.isoformat(),
        "end_date": d_end.isoformat(),
        "student": {
            "name": current_user.name,
            "college": current_user.college,
            "branch": current_user.branch,
            "semester": current_user.semester,
            "target_goal": current_user.attendance_goal
        },
        "overall": {
            "present": present,
            "absent": absent,
            "cancelled": cancelled,
            "holidays": holidays,
            "total_conducted": total,
            "percentage": percentage
        },
        "subjects": subject_breakdown,
        "daily_log": daily_log
    }

# --- AttendWise App Specific Endpoints ---

from pydantic import BaseModel

class MarkAttendanceRequest(BaseModel):
    date: str
    subject_name: str
    start: str
    status: str

@app.post("/attendance/mark", tags=["App"])
def mark_attendance(req: MarkAttendanceRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    user_id = current_user.id
    subject = db.query(models.Subject).filter(models.Subject.name == req.subject_name, models.Subject.user_id == user_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
        
    date_obj = date.fromisoformat(req.date)
    
    # Parse start time from HH:MM string
    try:
        h, m = map(int, req.start.split(':'))
        start_time_obj = time(h, m)
    except Exception:
        start_time_obj = None
    
    # Find existing record for this subject on this day for the specific session
    att = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id, 
        models.Attendance.subject_id == subject.id,
        models.Attendance.date == date_obj,
        models.Attendance.start_time == start_time_obj
    ).first()
    
    # Sync with ClassSession if it exists
    session = db.query(models.ClassSession).filter(
        models.ClassSession.user_id == user_id,
        models.ClassSession.subject_id == subject.id,
        models.ClassSession.date == date_obj,
        models.ClassSession.start_time == start_time_obj
    ).first()
    
    if session:
        session.status = req.status
        
    if att:
        att.status = req.status
        if session:
            att.session_id = session.id
    else:
        att = models.Attendance(
            user_id=user_id,
            subject_id=subject.id,
            date=date_obj,
            start_time=start_time_obj,
            status=req.status,
            session_id=session.id if session else None
        )
        db.add(att)
    db.commit()
    return {"message": "Success"}

@app.get("/state", tags=["App"])
def get_state(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    user_id = current_user.id
    user = current_user
        
    subjects = db.query(models.Subject).filter(models.Subject.user_id == user_id).all()
    timetable = db.query(models.Timetable).filter(models.Timetable.user_id == user_id).all()
    attendances = db.query(models.Attendance).filter(models.Attendance.user_id == user_id).all()
    active_semester = db.query(models.Semester).filter(
        models.Semester.user_id == user_id,
        models.Semester.is_active == True
    ).first()
    
    # Compute streak
    streak = _compute_streak(user_id, db)
    
    # Compute global stats for safe_bunks
    stats = _compute_global_stats(user_id, db)
    bunk_info = _compute_safe_bunks(stats["present"], stats["total"], user.attendance_goal)
    
    sub_map = {s.id: s for s in subjects}
    tt_formatted = []
    for t in timetable:
        tt_formatted.append({
            "day": t.day,
            "subject": sub_map[t.subject_id].name if t.subject_id in sub_map else "Unknown",
            "start": t.start_time.strftime("%H:%M"),
            "end": t.end_time.strftime("%H:%M"),
            "room": t.room,
            "prof": sub_map[t.subject_id].prof if t.subject_id in sub_map else None,
            "type": t.type,
            "color": sub_map[t.subject_id].color if t.subject_id in sub_map else "#7c4dff"
        })
        
    logs = {}
    days_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for a in attendances:
        d_str = a.date.isoformat()
        if d_str not in logs:
            logs[d_str] = []
        
        day_str = days_map[a.date.weekday()]
        
        # Match using subject AND start_time (if available) to find the correct timetable entry for end_time
        tt_entry = next((t for t in timetable if t.day == day_str and t.subject_id == a.subject_id and t.start_time == a.start_time), None)
        
        start_str = a.start_time.strftime("%H:%M") if a.start_time else "00:00"
        end_str = tt_entry.end_time.strftime("%H:%M") if tt_entry else "00:00"
        
        logs[d_str].append({
            "subject": sub_map[a.subject_id].name if a.subject_id in sub_map else "Unknown",
            "start": start_str,
            "end": end_str,
            "status": a.status,
            "color": sub_map[a.subject_id].color if a.subject_id in sub_map else "#7c4dff"
        })

    return {
        "profile": {
            "name": user.name,
            "targetGoal": user.attendance_goal,
            "term": user.semester,
            "streak": streak,
            "college": user.college,
            "branch": user.branch
        },
        "active_semester": {
            "id": active_semester.id,
            "name": active_semester.name,
            "start_date": active_semester.start_date.isoformat() if active_semester.start_date else None,
            "end_date": active_semester.end_date.isoformat() if active_semester.end_date else None,
            "academic_year": active_semester.academic_year,
            "academic_calendar": active_semester.academic_calendar
        } if active_semester else None,
        "globalStats": {
            "percentage": stats["percentage"],
            "present": stats["present"],
            "absent": stats["absent"],
            "total": stats["total"]
        },
        "bunkAnalysis": bunk_info,
        "subjects": [{"id": s.id, "name": s.name, "code": s.code, "prof": s.prof, "color": s.color, "credits": s.credits, "minimum_required_attendance": s.minimum_required_attendance} for s in subjects],
        "timetable": tt_formatted,
        "attendanceLogs": logs
    }

# --- Missing / Calendar-Driven Endpoints ---

@app.get("/user/profile", response_model=schemas.User, tags=["User"])
def get_user_profile(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.post("/auth/logout", tags=["Authentication"])
def logout():
    return {"message": "Successfully logged out"}

@app.get("/analytics/streak", tags=["Analytics"])
def get_streak(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    streak = _compute_streak(current_user.id, db)
    return {"streak": streak}

def _expand_date_range(start_str: str, end_str: str) -> List[date]:
    try:
        start_d = date.fromisoformat(start_str)
        end_d = date.fromisoformat(end_str)
        curr = start_d
        res = []
        while curr <= end_d:
            res.append(curr)
            curr += timedelta(days=1)
        return res
    except Exception:
        return []

@app.post("/semesters", response_model=schemas.SemesterOut, tags=["Semesters"])
def create_semester(
    sem: schemas.SemesterCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db.query(models.Semester).filter(models.Semester.user_id == current_user.id).update({"is_active": False})
    
    db_sem = models.Semester(
        user_id=current_user.id,
        name=sem.name,
        academic_year=sem.academic_year,
        start_date=sem.start_date,
        end_date=sem.end_date,
        academic_calendar=sem.academic_calendar,
        is_active=True
    )
    db.add(db_sem)
    db.commit()
    db.refresh(db_sem)
    
    # Populate Holidays from Academic Calendar if present (Checklist Section 1.6)
    if sem.academic_calendar:
        try:
            cal = json.loads(sem.academic_calendar)
            
            # 1. Standard Holidays
            for h in cal.get("holidays", []):
                h_date = date.fromisoformat(h["date"])
                db_hol = models.Holiday(
                    user_id=current_user.id,
                    semester_id=db_sem.id,
                    date=h_date,
                    name=h.get("name", "Holiday"),
                    type="Holiday"
                )
                db.merge(db_hol)
                
            # 2. Mid Exams
            for m in cal.get("midExams", []):
                for d in _expand_date_range(m["start"], m["end"]):
                    db_hol = models.Holiday(
                        user_id=current_user.id,
                        semester_id=db_sem.id,
                        date=d,
                        name=m.get("title", "Mid Exams"),
                        type="Mid Exam"
                    )
                    db.merge(db_hol)

            # 3. Lab Exams
            for l in cal.get("labExams", []):
                for d in _expand_date_range(l["start"], l["end"]):
                    db_hol = models.Holiday(
                        user_id=current_user.id,
                        semester_id=db_sem.id,
                        date=d,
                        name=l.get("title", "Lab Exams"),
                        type="Lab Exam"
                    )
                    db.merge(db_hol)
                    
            # 4. Semester Breaks
            for b in cal.get("semesterBreak", []):
                for d in _expand_date_range(b["start"], b["end"]):
                    db_hol = models.Holiday(
                        user_id=current_user.id,
                        semester_id=db_sem.id,
                        date=d,
                        name=b.get("title", "Semester Break"),
                        type="Semester Break"
                    )
                    db.merge(db_hol)
                    
            # 5. Final Exams
            for e in cal.get("examDates", []):
                for d in _expand_date_range(e["start"], e["end"]):
                    db_hol = models.Holiday(
                        user_id=current_user.id,
                        semester_id=db_sem.id,
                        date=d,
                        name=e.get("title", "Semester Exams"),
                        type="Semester Exam"
                    )
                    db.merge(db_hol)

            # 6. Study Holidays
            for s in cal.get("studyHolidays", []):
                for d in _expand_date_range(s["start"], s["end"]):
                    db_hol = models.Holiday(
                        user_id=current_user.id,
                        semester_id=db_sem.id,
                        date=d,
                        name=s.get("title", "Preparation Leave"),
                        type="Study Holiday"
                    )
                    db.merge(db_hol)

            # 7. Events (like Sports Day)
            for ev in cal.get("events", []):
                ev_date = date.fromisoformat(ev["date"])
                db_hol = models.Holiday(
                    user_id=current_user.id,
                    semester_id=db_sem.id,
                    date=ev_date,
                    name=ev.get("title", "College Event"),
                    type="Event"
                )
                db.merge(db_hol)
                
            db.commit()
        except Exception as err:
            print("Failed to auto-populate holidays from calendar:", err)
            
    # Generate scheduled class sessions
    _generate_sessions_for_active_semester(db, current_user.id)
    
    return db_sem

@app.get("/semesters", response_model=List[schemas.SemesterOut], tags=["Semesters"])
def get_semesters(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Semester).filter(models.Semester.user_id == current_user.id).all()

@app.get("/semesters/{semester_id}", response_model=schemas.SemesterOut, tags=["Semesters"])
def get_semester(
    semester_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    return sem

@app.put("/semesters/{semester_id}/activate", response_model=schemas.SemesterOut, tags=["Semesters"])
def activate_semester(
    semester_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    
    db.query(models.Semester).filter(models.Semester.user_id == current_user.id).update({"is_active": False})
    sem.is_active = True
    db.commit()
    db.refresh(sem)
    
    # Generate scheduled class sessions for the newly active semester
    _generate_sessions_for_active_semester(db, current_user.id)
    
    return sem

@app.delete("/semesters/{semester_id}", tags=["Semesters"])
def delete_semester(
    semester_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    db.delete(sem)
    db.commit()
    return {"message": "Semester and all associated data deleted successfully"}

@app.post("/semesters/{semester_id}/holidays", response_model=schemas.HolidayOut, tags=["Holidays"])
def create_holiday(
    semester_id: int,
    holiday: schemas.HolidayCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
        
    db_holiday = db.query(models.Holiday).filter(
        models.Holiday.user_id == current_user.id,
        models.Holiday.semester_id == semester_id,
        models.Holiday.date == holiday.date
    ).first()
    if db_holiday:
        raise HTTPException(status_code=400, detail="Holiday already exists on this date")
        
    db_holiday = models.Holiday(
        user_id=current_user.id,
        semester_id=semester_id,
        date=holiday.date,
        name=holiday.name,
        type=holiday.type
    )
    db.add(db_holiday)
    
    # Mark any class sessions on this date as holiday status
    db.query(models.ClassSession).filter(
        models.ClassSession.user_id == current_user.id,
        models.ClassSession.semester_id == semester_id,
        models.ClassSession.date == holiday.date,
        models.ClassSession.status == "upcoming"
    ).update({"status": "holiday"})
    
    db.commit()
    db.refresh(db_holiday)
    return db_holiday

@app.get("/semesters/{semester_id}/holidays", response_model=List[schemas.HolidayOut], tags=["Holidays"])
def get_holidays(
    semester_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    return db.query(models.Holiday).filter(
        models.Holiday.user_id == current_user.id,
        models.Holiday.semester_id == semester_id
    ).all()

@app.delete("/semesters/{semester_id}/holidays/{holiday_id}", tags=["Holidays"])
def delete_holiday(
    semester_id: int,
    holiday_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    h = db.query(models.Holiday).filter(
        models.Holiday.id == holiday_id,
        models.Holiday.semester_id == semester_id,
        models.Holiday.user_id == current_user.id
    ).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
        
    holiday_date = h.date
    db.delete(h)
    
    # Revert any holiday class sessions on this date back to upcoming
    db.query(models.ClassSession).filter(
        models.ClassSession.user_id == current_user.id,
        models.ClassSession.semester_id == semester_id,
        models.ClassSession.date == holiday_date,
        models.ClassSession.status == "holiday"
    ).update({"status": "upcoming"})
    
    db.commit()
    return {"message": "Holiday deleted successfully"}

def _generate_sessions_for_active_semester(db: Session, user_id: int):
    semester = db.query(models.Semester).filter(
        models.Semester.user_id == user_id,
        models.Semester.is_active == True
    ).first()
    if not semester:
        return
        
    start_gen = semester.start_date
    end_gen = semester.end_date
    
    # Delete existing upcoming class sessions for this active semester
    db.query(models.ClassSession).filter(
        models.ClassSession.user_id == user_id,
        models.ClassSession.semester_id == semester.id,
        models.ClassSession.date >= start_gen,
        models.ClassSession.status == "upcoming"
    ).delete()
    db.commit()
    
    holidays = db.query(models.Holiday).filter(
        models.Holiday.user_id == user_id,
        models.Holiday.semester_id == semester.id
    ).all()
    holiday_dates = {h.date for h in holidays}
    
    # Parse working Saturdays to override holiday check
    working_saturdays = set()
    if semester.academic_calendar:
        try:
            cal = json.loads(semester.academic_calendar)
            working_saturdays = {date.fromisoformat(d) for d in cal.get("workingSaturdays", [])}
        except Exception:
            pass
    
    days_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    
    # Load user's active timetable entries where version_id is None
    entries = db.query(models.Timetable).filter(
        models.Timetable.user_id == user_id,
        models.Timetable.version_id == None
    ).all()
    
    if not entries:
        # Fallback to load any timetable entries for the user if version_id is not used
        entries = db.query(models.Timetable).filter(models.Timetable.user_id == user_id).all()
        
    from collections import defaultdict
    day_entries = defaultdict(list)
    for entry in entries:
        day_entries[entry.day].append(entry)
        
    curr = start_gen
    to_add = []
    while curr <= end_gen:
        day_str = days_map[curr.weekday()]
        status = "holiday" if (curr in holiday_dates and curr not in working_saturdays) else "upcoming"
        
        if day_str == "Sun":
            curr += timedelta(days=1)
            continue
            
        for entry in day_entries[day_str]:
            # Check if there's already a session on this date and time
            session_exists = db.query(models.ClassSession).filter(
                models.ClassSession.user_id == user_id,
                models.ClassSession.subject_id == entry.subject_id,
                models.ClassSession.date == curr,
                models.ClassSession.start_time == entry.start_time
            ).first()
            if not session_exists:
                to_add.append(models.ClassSession(
                    user_id=user_id,
                    semester_id=semester.id,
                    subject_id=entry.subject_id,
                    date=curr,
                    start_time=entry.start_time,
                    end_time=entry.end_time,
                    room=entry.room,
                    session_type=entry.type or "Lecture",
                    status=status,
                    is_extra=False
                ))
        curr += timedelta(days=1)
        
    if to_add:
        db.add_all(to_add)
        db.commit()

def _generate_sessions_for_version(db: Session, user_id: int, version: models.TimetableVersion):
    semester = db.query(models.Semester).filter(models.Semester.id == version.semester_id, models.Semester.user_id == user_id).first()
    if not semester:
        return
        
    start_gen = max(version.effective_from, semester.start_date)
    end_gen = semester.end_date
    
    # Delete existing upcoming class sessions on or after start_gen
    db.query(models.ClassSession).filter(
        models.ClassSession.user_id == user_id,
        models.ClassSession.semester_id == semester.id,
        models.ClassSession.date >= start_gen,
        models.ClassSession.status == "upcoming"
    ).delete()
    db.commit()
    
    holidays = db.query(models.Holiday).filter(
        models.Holiday.user_id == user_id,
        models.Holiday.semester_id == semester.id
    ).all()
    holiday_dates = {h.date for h in holidays}
    
    days_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    
    entries = db.query(models.Timetable).filter(models.Timetable.version_id == version.id).all()
    
    from collections import defaultdict
    day_entries = defaultdict(list)
    for entry in entries:
        day_entries[entry.day].append(entry)
        
    curr = start_gen
    to_add = []
    while curr <= end_gen:
        day_str = days_map[curr.weekday()]
        status = "holiday" if curr in holiday_dates else "upcoming"
        
        for entry in day_entries[day_str]:
            # check if there's already a session on this date and time
            session_exists = db.query(models.ClassSession).filter(
                models.ClassSession.user_id == user_id,
                models.ClassSession.subject_id == entry.subject_id,
                models.ClassSession.date == curr,
                models.ClassSession.start_time == entry.start_time
            ).first()
            if not session_exists:
                to_add.append(models.ClassSession(
                    user_id=user_id,
                    semester_id=semester.id,
                    subject_id=entry.subject_id,
                    date=curr,
                    start_time=entry.start_time,
                    end_time=entry.end_time,
                    room=entry.room,
                    session_type=entry.type or "Lecture",
                    status=status,
                    is_extra=False
                ))
        curr += timedelta(days=1)
        
    if to_add:
        db.add_all(to_add)
        db.commit()

@app.post("/timetable/versions", response_model=schemas.TimetableVersionOut, tags=["Timetable Versions"])
def create_timetable_version(
    version: schemas.TimetableVersionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == version.semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
        
    db_version = models.TimetableVersion(
        user_id=current_user.id,
        semester_id=version.semester_id,
        label=version.label,
        effective_from=version.effective_from
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    
    import random
    from datetime import time as dt_time
    
    existing_subjects = db.query(models.Subject).filter(models.Subject.user_id == current_user.id).all()
    sub_map = {s.name.lower().strip(): s for s in existing_subjects}
    
    for entry in version.timetable:
        sub_key = entry.subject.lower().strip()
        if sub_key in sub_map:
            subject = sub_map[sub_key]
        else:
            colors = ["#cdbdff", "#40e56c", "#ffb3ae", "#7c4dff", "#02c953", "#ffdad7"]
            color = random.choice(colors)
            subject = models.Subject(
                user_id=current_user.id,
                name=entry.subject,
                code="CS-" + str(random.randint(100, 999)),
                prof=entry.prof,
                color=color,
                credits=3
            )
            db.add(subject)
            db.commit()
            db.refresh(subject)
            sub_map[sub_key] = subject
            
        start_parts = [int(p) for p in entry.start.split(":")]
        end_parts = [int(p) for p in entry.end.split(":")]
        start_time = dt_time(start_parts[0], start_parts[1])
        end_time = dt_time(end_parts[0], end_parts[1])
        
        db_tt = models.Timetable(
            user_id=current_user.id,
            subject_id=subject.id,
            day=entry.day,
            start_time=start_time,
            end_time=end_time,
            room=entry.room,
            type=entry.type,
            version_id=db_version.id
        )
        db.add(db_tt)
        
    db.commit()
    
    _generate_sessions_for_version(db, current_user.id, db_version)
    
    return db_version

@app.get("/timetable/versions", response_model=List[schemas.TimetableVersionOut], tags=["Timetable Versions"])
def get_timetable_versions(
    semester_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.TimetableVersion).filter(
        models.TimetableVersion.user_id == current_user.id,
        models.TimetableVersion.semester_id == semester_id
    ).all()

@app.get("/sessions", response_model=List[schemas.ClassSessionOut], tags=["Class Sessions"])
def get_class_sessions(
    start_date: date,
    end_date: date,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sessions = db.query(models.ClassSession).filter(
        models.ClassSession.user_id == current_user.id,
        models.ClassSession.date >= start_date,
        models.ClassSession.date <= end_date
    ).order_by(models.ClassSession.date.asc(), models.ClassSession.start_time.asc()).all()
    
    out = []
    for s in sessions:
        out.append(schemas.ClassSessionOut(
            id=s.id,
            date=s.date,
            start_time=s.start_time,
            end_time=s.end_time,
            room=s.room,
            session_type=s.session_type,
            status=s.status,
            is_extra=s.is_extra,
            subject_id=s.subject_id,
            subject_name=s.subject.name,
            subject_color=s.subject.color,
            subject_prof=s.subject.prof
        ))
    return out

@app.post("/sessions/{session_id}/mark", response_model=schemas.ClassSessionOut, tags=["Class Sessions"])
def mark_class_session(
    session_id: int,
    req: schemas.MarkSessionRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(models.ClassSession).filter(
        models.ClassSession.id == session_id,
        models.ClassSession.user_id == current_user.id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Class session not found")
        
    s.status = req.status
    
    att = db.query(models.Attendance).filter(
        models.Attendance.session_id == s.id,
        models.Attendance.user_id == current_user.id
    ).first()
    
    if not att:
        att = db.query(models.Attendance).filter(
            models.Attendance.user_id == current_user.id,
            models.Attendance.subject_id == s.subject_id,
            models.Attendance.date == s.date
        ).first()
        
    if att:
        att.status = req.status
        att.session_id = s.id
    else:
        att = models.Attendance(
            user_id=current_user.id,
            subject_id=s.subject_id,
            date=s.date,
            status=req.status,
            session_id=s.id
        )
        db.add(att)
        
    db.commit()
    db.refresh(s)
    
    return schemas.ClassSessionOut(
        id=s.id,
        date=s.date,
        start_time=s.start_time,
        end_time=s.end_time,
        room=s.room,
        session_type=s.session_type,
        status=s.status,
        is_extra=s.is_extra,
        subject_id=s.subject_id,
        subject_name=s.subject.name,
        subject_color=s.subject.color,
        subject_prof=s.subject.prof
    )

@app.post("/sessions/extra", response_model=schemas.ClassSessionOut, tags=["Class Sessions"])
def create_extra_class_session(
    extra: schemas.ExtraClassCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    sem = db.query(models.Semester).filter(
        models.Semester.id == extra.semester_id,
        models.Semester.user_id == current_user.id
    ).first()
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
        
    sub = db.query(models.Subject).filter(
        models.Subject.id == extra.subject_id,
        models.Subject.user_id == current_user.id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")
        
    session_exists = db.query(models.ClassSession).filter(
        models.ClassSession.user_id == current_user.id,
        models.ClassSession.subject_id == extra.subject_id,
        models.ClassSession.date == extra.date,
        models.ClassSession.start_time == extra.start_time
    ).first()
    if session_exists:
        raise HTTPException(status_code=400, detail="Class session already exists at this date and time")
        
    s = models.ClassSession(
        user_id=current_user.id,
        semester_id=extra.semester_id,
        subject_id=extra.subject_id,
        date=extra.date,
        start_time=extra.start_time,
        end_time=extra.end_time,
        room=extra.room,
        session_type=extra.session_type or "Extra",
        status="upcoming",
        is_extra=True
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    
    return schemas.ClassSessionOut(
        id=s.id,
        date=s.date,
        start_time=s.start_time,
        end_time=s.end_time,
        room=s.room,
        session_type=s.session_type,
        status=s.status,
        is_extra=s.is_extra,
        subject_id=s.subject_id,
        subject_name=s.subject.name,
        subject_color=s.subject.color,
        subject_prof=s.subject.prof
    )

# ============================================================================
# AI OCR TIMETABLE PARSER (Gemini 2.5 Flash)
# ============================================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.5-flash"
GEMINI_URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

TIMETABLE_OCR_PROMPT = """You are an expert academic timetable parser.
Analyze the provided timetable image or PDF and extract ALL class entries.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "timetable": [
    {
      "day": "Mon",
      "subject": "Subject Name",
      "start": "09:00",
      "end": "10:30",
      "room": "Room 101",
      "prof": "Prof. Name",
      "type": "Lecture"
    }
  ],
  "total_classes": 12,
  "message": "Successfully extracted N classes"
}

Rules:
- day must be one of: Mon, Tue, Wed, Thu, Fri, Sat
- start and end must be in HH:MM 24-hour format (e.g. 09:00, 14:30)
- type must be one of: Lecture, Practical, Hybrid, Tutorial, Break
- If room or prof is not visible, use empty string ""
- If a cell is empty or Free, skip it
- Return every detected class entry, including lab sessions (usually marked as Practical/Lab) and breaks (like recess, lunch, tea breaks, which should have type: "Break" and subject: "Break" or "Lunch Break").
"""

@app.post("/timetable/ocr", tags=["Timetable"])
async def ocr_timetable(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Upload a timetable image (PNG/JPEG/WebP) or PDF.
    Gemini AI will parse it and return a structured list of class entries.
    """
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in your .env file."
        )

    file_bytes = await file.read()
    encoded = base64.b64encode(file_bytes).decode("utf-8")

    mime_type = file.content_type or "image/png"
    if file.filename and file.filename.lower().endswith(".pdf"):
        mime_type = "application/pdf"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": TIMETABLE_OCR_PROMPT},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": encoded
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1
        }
    }

    headers = {"Content-Type": "application/json"}
    
    models_to_try = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-2.5-flash-lite"]
    gemini_response = None
    last_error = None
    successful_model = None

    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            import urllib.request as ureq
            req = ureq.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with ureq.urlopen(req, timeout=120) as resp:
                gemini_response = json.loads(resp.read().decode("utf-8"))
                successful_model = model
                break
        except Exception as e:
            error_msg = str(e)
            if hasattr(e, 'read'):
                try:
                    error_msg = e.read().decode("utf-8")
                except Exception:
                    pass
            print(f"Gemini API call failed for model {model}: {error_msg}")
            last_error = error_msg

    if not gemini_response:
        raise HTTPException(status_code=500, detail=f"Gemini OCR failed: {last_error}")

    try:
        candidates = gemini_response.get("candidates", [])
        if not candidates:
            raise HTTPException(status_code=500, detail="Gemini returned no candidates")

        raw_text = candidates[0]["content"]["parts"][0]["text"]
        parsed = json.loads(raw_text)
        timetable = parsed.get("timetable", [])

        valid_days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
        valid_types = {"Lecture", "Practical", "Hybrid", "Tutorial", "Break"}
        cleaned = []
        for entry in timetable:
            day = entry.get("day", "").strip()
            subject = entry.get("subject", "").strip()
            start = entry.get("start", "").strip()
            end = entry.get("end", "").strip()
            if day in valid_days and subject and start and end:
                cleaned.append({
                    "day": day,
                    "subject": subject,
                    "start": start,
                    "end": end,
                    "room": entry.get("room", "") or "",
                    "prof": entry.get("prof", "") or "",
                    "type": entry.get("type", "Lecture") if entry.get("type") in valid_types else "Lecture"
                })

        return {
            "timetable": cleaned,
            "total_classes": len(cleaned),
            "message": f"AI OCR extracted {len(cleaned)} classes from your timetable",
            "model": successful_model
        }

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Gemini JSON response: {str(e)}")
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, 'read'):
            try:
                error_msg = e.read().decode("utf-8")
            except Exception:
                pass
        print("GEMINI ERROR:", error_msg)
        raise HTTPException(status_code=500, detail=f"Gemini OCR failed: {error_msg}")

CALENDAR_OCR_PROMPT = """You are an expert academic calendar parser.
Analyze the provided academic calendar image or PDF and extract ALL key dates and events.

Return ONLY a valid JSON object (no markdown, no explanations) with this exact structure:
{
  "semesterStart": "YYYY-MM-DD",
  "semesterEnd": "YYYY-MM-DD",
  "holidays": [
    {"date": "YYYY-MM-DD", "name": "Name of holiday"}
  ],
  "midExams": [
    {"title": "Mid Exams", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
  ],
  "labExams": [
    {"title": "Lab Exams", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
  ],
  "semesterBreak": [
    {"title": "Break", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
  ],
  "examDates": [
    {"title": "Semester Exams", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
  ],
  "studyHolidays": [
    {"title": "Preparation Leave", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
  ],
  "workingSaturdays": [
    "YYYY-MM-DD"
  ],
  "events": [
    {"title": "Sports Day", "date": "YYYY-MM-DD"}
  ]
}

Rules:
- All dates must be in YYYY-MM-DD format.
- semesterStart and semesterEnd represent the absolute date boundaries of the academic semester.
- Extract any public/national holidays, college holidays, festivals, or local holidays into "holidays".
- Extract exam schedules (Mid Term, Lab, Practical, End Semester, Preparatory Leave/Study Holidays) into their corresponding arrays.
- Extract semester breaks/holidays (e.g. Winter/Summer vacations, Puja holidays).
- Extract Special Working Saturdays (where Monday or normal classes run) into "workingSaturdays".
- Extract any college events (Sports Day, Annual Fest, Project review days) into "events" with title and date.
"""

@app.post("/semester/parse-calendar", tags=["Semesters"])
async def parse_calendar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Upload an academic calendar image (PNG/JPEG/WebP) or PDF.
    Gemini AI will parse it and return a structured JSON configuration.
    """
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in your .env file."
        )

    file_bytes = await file.read()
    encoded = base64.b64encode(file_bytes).decode("utf-8")

    mime_type = file.content_type or "image/png"
    if file.filename and file.filename.lower().endswith(".pdf"):
        mime_type = "application/pdf"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": CALENDAR_OCR_PROMPT},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": encoded
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1
        }
    }

    url = f"{GEMINI_URL}?key={api_key}"
    headers = {"Content-Type": "application/json"}

    last_error = ""
    gemini_response = None
    successful_model = GEMINI_MODEL

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if resp.status_code == 200:
            gemini_response = resp.json()
        else:
            last_error = f"API returned HTTP {resp.status_code}: {resp.text}"
    except Exception as e:
        last_error = str(e)

    if not gemini_response:
        raise HTTPException(status_code=500, detail=f"Gemini OCR failed: {last_error}")

    try:
        candidates = gemini_response.get("candidates", [])
        if not candidates:
            raise HTTPException(status_code=500, detail="Gemini returned no candidates")

        raw_text = candidates[0]["content"]["parts"][0]["text"]
        parsed = json.loads(raw_text)

        return {
            "semesterStart": parsed.get("semesterStart") or "",
            "semesterEnd": parsed.get("semesterEnd") or "",
            "holidays": parsed.get("holidays") or [],
            "midExams": parsed.get("midExams") or [],
            "labExams": parsed.get("labExams") or [],
            "semesterBreak": parsed.get("semesterBreak") or [],
            "examDates": parsed.get("examDates") or [],
            "studyHolidays": parsed.get("studyHolidays") or [],
            "workingSaturdays": parsed.get("workingSaturdays") or [],
            "events": parsed.get("events") or [],
            "model": successful_model
        }

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Gemini JSON response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini calendar parsing failed: {str(e)}")

# SPA Fallback Routes (Must be defined at the bottom to avoid intercepting specific API routes)
if os.path.exists(frontend_dist):
    @app.get("/", tags=["Root"])
    def read_root():
        return FileResponse(os.path.join(frontend_dist, "index.html"))
        
    @app.get("/{catchall:path}", tags=["Root"])
    def serve_spa(catchall: str):
        file_path = os.path.join(frontend_dist, catchall)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/", tags=["Root"])
    def read_root():
        return {"message": "Welcome to AttendWise API. Frontend build not found. Visit /docs for Swagger UI."}
