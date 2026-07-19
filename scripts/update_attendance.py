import os
import sys
from datetime import date, time, timedelta
from sqlalchemy.orm import Session

# Add the project root to sys.path so we can import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import SessionLocal
from backend import models

def split_block_sessions(db: Session, user_id: int, semester_id: int):
    # Find all sessions in June and July 2026 (June 29 to July 18) for user_id
    start_date = date(2026, 6, 29)
    end_date = date(2026, 7, 18)
    
    sessions = db.query(models.ClassSession).filter(
        models.ClassSession.user_id == user_id,
        models.ClassSession.date >= start_date,
        models.ClassSession.date <= end_date
    ).all()
    
    to_delete = []
    to_add = []
    
    for s in sessions:
        # Tinkering Lab or AI Lab block (9:50 - 12:40)
        if s.subject.name in ("Tinkering Lab", "Artificial Intelligence Lab") and s.start_time == time(9, 50) and s.end_time == time(12, 40):
            to_delete.append(s.id)
            times = [(time(9, 50), time(10, 40)), (time(11, 0), time(11, 50)), (time(11, 50), time(12, 40))]
            for start, end in times:
                to_add.append(models.ClassSession(
                    user_id=user_id,
                    semester_id=semester_id,
                    subject_id=s.subject_id,
                    date=s.date,
                    start_time=start,
                    end_time=end,
                    room=s.room,
                    session_type=s.session_type,
                    status="upcoming",
                    is_extra=s.is_extra
                ))
        # CN Lab or FS Lab block (14:30 - 17:00)
        elif s.subject.name in ("Computer Networks Lab", "Full Stack development-2 Lab") and s.start_time == time(14, 30) and s.end_time == time(17, 0):
            to_delete.append(s.id)
            times = [(time(14, 30), time(15, 20)), (time(15, 20), time(16, 10)), (time(16, 10), time(17, 0))]
            for start, end in times:
                to_add.append(models.ClassSession(
                    user_id=user_id,
                    semester_id=semester_id,
                    subject_id=s.subject_id,
                    date=s.date,
                    start_time=start,
                    end_time=end,
                    room=s.room,
                    session_type=s.session_type,
                    status="upcoming",
                    is_extra=s.is_extra
                ))
        # EDA block on Wednesday (14:30 - 16:10)
        elif s.subject.name == "Exploratory Data Analysis with Python" and s.start_time == time(14, 30) and s.end_time == time(16, 10):
            to_delete.append(s.id)
            times = [(time(14, 30), time(15, 20)), (time(15, 20), time(16, 10))]
            for start, end in times:
                to_add.append(models.ClassSession(
                    user_id=user_id,
                    semester_id=semester_id,
                    subject_id=s.subject_id,
                    date=s.date,
                    start_time=start,
                    end_time=end,
                    room=s.room,
                    session_type=s.session_type,
                    status="upcoming",
                    is_extra=s.is_extra
                ))
                
    if to_delete:
        db.query(models.ClassSession).filter(models.ClassSession.id.in_(to_delete)).delete(synchronize_session=False)
    if to_add:
        db.add_all(to_add)
    db.commit()
    print(f"Split {len(to_delete)} block sessions into {len(to_add)} individual period sessions.")

def update_user_attendance():
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(email="yochitcheedella@gmail.com").first()
        if not user:
            print("User yochitcheedella@gmail.com not found!")
            return
        
        print(f"Updating attendance for user: {user.name} ({user.email})")
        
        # Get active semester
        semester = db.query(models.Semester).filter_by(user_id=user.id, is_active=True).first()
        if not semester:
            print("Active semester not found for user!")
            return
        
        # Clear existing attendance logs for user in June and July 2026
        deleted_count = db.query(models.Attendance).filter(
            models.Attendance.user_id == user.id,
            models.Attendance.date >= date(2026, 6, 1),
            models.Attendance.date <= date(2026, 7, 31)
        ).delete()
        print(f"Deleted {deleted_count} existing attendance records for June and July.")
        
        # Reset any existing class sessions in June and July (up to July 18) to "upcoming" first
        sessions_to_reset = db.query(models.ClassSession).filter(
            models.ClassSession.user_id == user.id,
            models.ClassSession.date >= date(2026, 6, 29),
            models.ClassSession.date <= date(2026, 7, 18)
        ).all()
        for session in sessions_to_reset:
            session.status = "upcoming"
        db.commit()
        print(f"Reset {len(sessions_to_reset)} sessions in June & July (up to July 18) to upcoming.")
        
        # Perform block splitting for June & July
        split_block_sessions(db, user.id, semester.id)
        
        # 1. Get subjects
        subjects = db.query(models.Subject).filter_by(user_id=user.id).all()
        sub_map = {s.name: s for s in subjects}
        print("Subjects found:", list(sub_map.keys()))
        
        # Mapping of subject names in DB to June and July counts (Held, Attend)
        target_counts = {
            "June": {
                "Artificial Intelligence": (1, 1),
                "Computer Networks": (2, 2),
                "Computer Organization and Architecture": (2, 2),
                "Exploratory Data Analysis with Python": (2, 2),
                "Open Elective - 1": (0, 0),
                "Artificial Intelligence Lab": (0, 0),
                "Computer Networks Lab": (3, 0),
                "Full Stack development-2 Lab": (0, 0),
                "Tinkering Lab": (3, 3),
                "Mentoring/Seminar": (1, 1),
            },
            "July": {
                "Artificial Intelligence": (15, 13),
                "Computer Networks": (13, 10),
                "Computer Organization and Architecture": (14, 10),
                "Exploratory Data Analysis with Python": (17, 11),
                "Open Elective - 1": (12, 6),
                "Artificial Intelligence Lab": (9, 9),
                "Computer Networks Lab": (6, 6),
                "Full Stack development-2 Lab": (6, 6),
                "Tinkering Lab": (6, 6),
                "Mentoring/Seminar": (10, 8),
            }
        }
        
        # Now process each subject individually
        for sub_name, sub in sub_map.items():
            if sub_name not in target_counts["June"] or sub_name not in target_counts["July"]:
                print(f"Warning: no counts defined for subject {sub_name}")
                continue
                
            # Process June (June 29 to June 30)
            june_sessions = db.query(models.ClassSession).filter(
                models.ClassSession.user_id == user.id,
                models.ClassSession.subject_id == sub.id,
                models.ClassSession.date >= date(2026, 6, 29),
                models.ClassSession.date <= date(2026, 6, 30)
            ).order_by(models.ClassSession.date, models.ClassSession.start_time).all()
            
            june_held, june_attend = target_counts["June"][sub_name]
            june_absent = june_held - june_attend
            june_cancelled = len(june_sessions) - june_held
            
            # June is only 2 days, assign manually based on counts:
            assigned_pres = 0
            assigned_abs = 0
            for session in june_sessions:
                if assigned_pres < june_attend:
                    status = "present"
                    assigned_pres += 1
                elif assigned_abs < june_absent:
                    status = "absent"
                    assigned_abs += 1
                else:
                    status = "cancelled"
                
                session.status = status
                att = models.Attendance(
                    user_id=user.id,
                    subject_id=sub.id,
                    date=session.date,
                    start_time=session.start_time,
                    status=status,
                    session_id=session.id,
                    source="sync"
                )
                db.add(att)
                
            # Process July (July 1 to July 18)
            july_sessions = db.query(models.ClassSession).filter(
                models.ClassSession.user_id == user.id,
                models.ClassSession.subject_id == sub.id,
                models.ClassSession.date >= date(2026, 7, 1),
                models.ClassSession.date <= date(2026, 7, 18)
            ).order_by(models.ClassSession.date, models.ClassSession.start_time).all()
            
            july_held, july_attend = target_counts["July"][sub_name]
            july_absent = july_held - july_attend
            july_cancelled = len(july_sessions) - july_held
            
            N = len(july_sessions)
            if N < july_held:
                print(f"Warning: For {sub_name}, scheduled sessions in July ({N}) is less than target Held ({july_held})!")
                july_held = N
                july_absent = july_held - july_attend
                july_cancelled = 0
            
            # Distribute cancelled sessions deterministically
            cancelled_indices = set()
            if july_cancelled > 0:
                for i in range(july_cancelled):
                    idx = int(i * N / july_cancelled)
                    cancelled_indices.add(idx)
                    
            remaining = [idx for idx in range(N) if idx not in cancelled_indices]
            
            # Distribute absent sessions among remaining
            absent_indices = set()
            if july_absent > 0 and len(remaining) > 0:
                for j in range(july_absent):
                    idx = remaining[int(j * len(remaining) / july_absent)]
                    absent_indices.add(idx)
                    
            for idx, session in enumerate(july_sessions):
                if idx in cancelled_indices:
                    status = "cancelled"
                elif idx in absent_indices:
                    status = "absent"
                else:
                    status = "present"
                    
                session.status = status
                att = models.Attendance(
                    user_id=user.id,
                    subject_id=sub.id,
                    date=session.date,
                    start_time=session.start_time,
                    status=status,
                    session_id=session.id,
                    source="sync"
                )
                db.add(att)
                
        db.commit()
        print("Database updated successfully!")
        
        # Verify counts
        print("\nVerifying updated counts for user...")
        atts = db.query(models.Attendance).filter_by(user_id=user.id).all()
        
        from collections import defaultdict
        june_stats = defaultdict(lambda: {"held": 0, "attend": 0})
        july_stats = defaultdict(lambda: {"held": 0, "attend": 0})
        
        for a in atts:
            if a.date.month == 6:
                if a.status in ("present", "absent"):
                    june_stats[a.subject.name]["held"] += 1
                if a.status == "present":
                    june_stats[a.subject.name]["attend"] += 1
            elif a.date.month == 7:
                if a.status in ("present", "absent"):
                    july_stats[a.subject.name]["held"] += 1
                if a.status == "present":
                    july_stats[a.subject.name]["attend"] += 1
                    
        print("\nJUNE STATS:")
        total_june_held = 0
        total_june_attend = 0
        for name in target_counts["June"]:
            stats = june_stats[name]
            print(f" - {name}: Held={stats['held']}, Attend={stats['attend']} (Target: {target_counts['June'][name]})")
            total_june_held += stats['held']
            total_june_attend += stats['attend']
        print(f"Total June Held: {total_june_held}, Attend: {total_june_attend}")
        
        print("\nJULY STATS:")
        total_july_held = 0
        total_july_attend = 0
        for name in target_counts["July"]:
            stats = july_stats[name]
            print(f" - {name}: Held={stats['held']}, Attend={stats['attend']} (Target: {target_counts['July'][name]})")
            total_july_held += stats['held']
            total_july_attend += stats['attend']
        print(f"Total July Held: {total_july_held}, Attend: {total_july_attend}")
        
    finally:
        db.close()

if __name__ == "__main__":
    update_user_attendance()
