import os
from datetime import datetime, timedelta, date, time
from sqlalchemy.orm import Session
from backend.database import engine, get_db, Base
from backend import models, schemas, auth
from backend.main import register_user, create_subject, create_timetable, log_attendance

# Make sure tables exist
Base.metadata.create_all(bind=engine)

def seed_database():
    db: Session = next(get_db())

    # Check if user already exists
    user = db.query(models.User).filter(models.User.email == "sarah@example.com").first()
    if not user:
        user_in = schemas.UserCreate(
            name="Sarah Jenkins",
            email="sarah@example.com",
            password="password123",
            college="Engineering College",
            branch="Computer Science",
            semester="Semester 1 (Autumn)",
            attendance_goal=75.0
        )
        user = models.User(
            name=user_in.name,
            email=user_in.email,
            password_hash=auth.get_password_hash(user_in.password),
            college=user_in.college,
            branch=user_in.branch,
            semester=user_in.semester,
            attendance_goal=user_in.attendance_goal
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Check subjects
    if db.query(models.Subject).count() == 0:
        subjects_data = [
            {"name": "Advanced Algorithms", "code": "CS-401", "prof": "Dr. Alan Turing", "color": "#cdbdff"},
            {"name": "Data Science Fundamentals", "code": "CS-402", "prof": "Prof. Ada Lovelace", "color": "#40e56c"},
            {"name": "Cloud Computing Lab", "code": "CS-403", "prof": "Dr. Grace Hopper", "color": "#7c4dff"},
            {"name": "Cyber Ethics", "code": "CS-404", "prof": "Prof. Dennis Ritchie", "color": "#ffb3ae"},
            {"name": "Psychology", "code": "HS-201", "prof": "Dr. William James", "color": "#02c953"}
        ]
        
        for idx, sub in enumerate(subjects_data, 1):
            s = models.Subject(user_id=user.id, **sub)
            db.add(s)
        db.commit()

    # Check timetable
    if db.query(models.Timetable).count() == 0:
        subjects_map = {s.name: s.id for s in db.query(models.Subject).all()}
        
        timetable_data = [
            {"day": "Mon", "subject": "Advanced Algorithms", "start_time": time(9, 0), "end_time": time(10, 30), "room": "Room 402", "type": "Lecture"},
            {"day": "Mon", "subject": "Data Science Fundamentals", "start_time": time(11, 0), "end_time": time(12, 30), "room": "Lab 2A", "type": "Practical"},
            {"day": "Mon", "subject": "Cloud Computing Lab", "start_time": time(14, 0), "end_time": time(16, 0), "room": "Seminar Hall", "type": "Hybrid"},
            {"day": "Mon", "subject": "Cyber Ethics", "start_time": time(16, 30), "end_time": time(17, 30), "room": "Room 101", "type": "Lecture"},
            
            {"day": "Tue", "subject": "Data Science Fundamentals", "start_time": time(9, 0), "end_time": time(10, 30), "room": "Lab 2A", "type": "Lecture"},
            {"day": "Tue", "subject": "Psychology", "start_time": time(11, 0), "end_time": time(12, 30), "room": "Room 305", "type": "Lecture"},
            {"day": "Tue", "subject": "Advanced Algorithms", "start_time": time(14, 0), "end_time": time(15, 30), "room": "Room 402", "type": "Lecture"},
            
            {"day": "Wed", "subject": "Cloud Computing Lab", "start_time": time(9, 0), "end_time": time(11, 0), "room": "Seminar Hall", "type": "Practical"},
            {"day": "Wed", "subject": "Cyber Ethics", "start_time": time(11, 30), "end_time": time(12, 30), "room": "Room 101", "type": "Lecture"},
            {"day": "Wed", "subject": "Psychology", "start_time": time(14, 0), "end_time": time(15, 30), "room": "Room 305", "type": "Lecture"},
            
            {"day": "Thu", "subject": "Advanced Algorithms", "start_time": time(9, 0), "end_time": time(10, 30), "room": "Room 402", "type": "Lecture"},
            {"day": "Thu", "subject": "Data Science Fundamentals", "start_time": time(11, 0), "end_time": time(12, 30), "room": "Lab 2A", "type": "Practical"},
            
            {"day": "Fri", "subject": "Psychology", "start_time": time(9, 30), "end_time": time(11, 0), "room": "Room 305", "type": "Lecture"},
            {"day": "Fri", "subject": "Cloud Computing Lab", "start_time": time(13, 30), "end_time": time(15, 30), "room": "Seminar Hall", "type": "Hybrid"},
            {"day": "Fri", "subject": "Cyber Ethics", "start_time": time(16, 0), "end_time": time(17, 0), "room": "Room 101", "type": "Lecture"}
        ]
        
        for tt in timetable_data:
            t = models.Timetable(
                user_id=user.id,
                subject_id=subjects_map[tt.pop("subject")],
                **tt
            )
            db.add(t)
        db.commit()

    # Check attendance logs
    if db.query(models.Attendance).count() == 0:
        import random
        subjects_map = {s.name: s.id for s in db.query(models.Subject).all()}
        timetable = db.query(models.Timetable).all()
        
        # map weekday (0=Mon, 6=Sun) to "Mon", "Tue"
        days_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
        
        today = date.today()
        start_date = today - timedelta(days=60)
        
        current_date = start_date
        while current_date <= today: # Include today to mark as upcoming or present
            day_str = days_map[current_date.weekday()]
            day_classes = [t for t in timetable if t.day == day_str]
            
            for cls in day_classes:
                rand = random.random()
                status = "present"
                if rand > 0.88:
                    status = "absent"
                elif rand > 0.83:
                    status = "cancelled"
                elif rand > 0.80:
                    status = "holiday"
                
                if current_date == today:
                    status = "upcoming"
                    
                att = models.Attendance(
                    user_id=user.id,
                    subject_id=cls.subject_id,
                    date=current_date,
                    status=status
                )
                db.add(att)
            current_date += timedelta(days=1)
        db.commit()

    print("Database seeded successfully!")

if __name__ == "__main__":
    seed_database()
