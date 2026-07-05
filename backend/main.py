from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
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

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Welcome to AttendWise API. Visit /docs for Swagger UI."}

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
    
    # Find existing record for this subject on this day
    att = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id, 
        models.Attendance.subject_id == subject.id,
        models.Attendance.date == date_obj
    ).first()
    
    if att:
        att.status = req.status
    else:
        att = models.Attendance(
            user_id=user_id,
            subject_id=subject.id,
            date=date_obj,
            status=req.status
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
        tt_entry = next((t for t in timetable if t.day == day_str and t.subject_id == a.subject_id), None)
        
        start_str = tt_entry.start_time.strftime("%H:%M") if tt_entry else "00:00"
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
        "globalStats": {
            "percentage": stats["percentage"],
            "present": stats["present"],
            "absent": stats["absent"],
            "total": stats["total"]
        },
        "bunkAnalysis": bunk_info,
        "subjects": [{"id": s.id, "name": s.name, "code": s.code, "prof": s.prof, "color": s.color, "credits": s.credits} for s in subjects],
        "timetable": tt_formatted,
        "attendanceLogs": logs
    }
