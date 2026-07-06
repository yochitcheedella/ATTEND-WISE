import os
import random
from datetime import date, time, timedelta
from sqlalchemy.orm import Session
from backend.database import engine, get_db, Base
from backend import models, schemas, auth
from backend.main import _generate_sessions_for_version

# Make sure tables exist
Base.metadata.create_all(bind=engine)

def seed_college_data():
    db: Session = next(get_db())

    # 1. Fetch or create Sarah Jenkins user
    user = db.query(models.User).filter(models.User.email == "sarah@example.com").first()
    if not user:
        user = models.User(
            name="Sarah Jenkins",
            email="sarah@example.com",
            password_hash=auth.get_password_hash("password123"),
            college="Vishnu Institute of Technology",
            branch="CSE (Artificial Intelligence & Data Science)",
            semester="III B.Tech I Semester",
            attendance_goal=75.0
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Clear existing data for a clean college seed
        db.query(models.Attendance).filter(models.Attendance.user_id == user.id).delete()
        db.query(models.ClassSession).filter(models.ClassSession.user_id == user.id).delete()
        db.query(models.Timetable).filter(models.Timetable.user_id == user.id).delete()
        db.query(models.TimetableVersion).filter(models.TimetableVersion.user_id == user.id).delete()
        db.query(models.Holiday).filter(models.Holiday.user_id == user.id).delete()
        db.query(models.Semester).filter(models.Semester.user_id == user.id).delete()
        db.query(models.Subject).filter(models.Subject.user_id == user.id).delete()
        db.commit()

        # Update college profile details
        user.college = "Vishnu Institute of Technology"
        user.branch = "CSE (Artificial Intelligence & Data Science)"
        user.semester = "III B.Tech I Semester"
        db.commit()

    # 2. Seed Subjects
    subjects_data = [
        {"name": "Artificial Intelligence", "code": "CS-311", "prof": "Mrs. G. Diana Kamal", "color": "#7c4dff", "credits": 3},
        {"name": "Computer Networks", "code": "CS-312", "prof": "Mr. M. Kumara Swamy", "color": "#40e56c", "credits": 3},
        {"name": "Computer Organization and Architecture", "code": "CS-313", "prof": "Mr. D. Krishna Kumar", "color": "#ffb3ae", "credits": 3},
        {"name": "Exploratory Data Analysis with Python", "code": "CS-314", "prof": "Mrs. A. Bhagyasri", "color": "#cdbdff", "credits": 3},
        {"name": "Open Elective - 1", "code": "OE-311", "prof": "Mr. VVS Sarma", "color": "#02c953", "credits": 3},
        {"name": "Artificial Intelligence Lab", "code": "CS-311L", "prof": "Mrs. G. Diana Kamal", "color": "#ffdad7", "credits": 2},
        {"name": "Computer Networks Lab", "code": "CS-312L", "prof": "Mr. M. Kumara Swamy", "color": "#ffb3ae", "credits": 2},
        {"name": "Full Stack development-2 Lab", "code": "CS-315L", "prof": "Mr. M. Srinivasa Raju", "color": "#02c953", "credits": 2},
        {"name": "Tinkering Lab", "code": "CS-316L", "prof": "Mr. KJS Upendra", "color": "#cdbdff", "credits": 1},
        {"name": "Mentoring/Seminar", "code": "CS-317L", "prof": "Department Faculty", "color": "#7c4dff", "credits": 1}
    ]

    subjects_map = {}
    for sub in subjects_data:
        s = models.Subject(user_id=user.id, **sub)
        db.add(s)
        db.commit()
        db.refresh(s)
        subjects_map[sub["name"]] = s.id

    # 3. Seed Semester (III B.Tech I Semester: 29-06-2026 to 28-11-28)
    sem_start = date(2026, 6, 29)
    sem_end = date(2026, 11, 28)
    semester = models.Semester(
        user_id=user.id,
        name="III B.Tech I Semester",
        academic_year="2026-27",
        start_date=sem_start,
        end_date=sem_end,
        is_active=True
    )
    db.add(semester)
    db.commit()
    db.refresh(semester)

    # 4. Seed Dasara Holidays (19-10-2026 to 24-10-2026)
    hol_start = date(2026, 10, 19)
    for i in range(6):
        d = hol_start + timedelta(days=i)
        h = models.Holiday(
            user_id=user.id,
            semester_id=semester.id,
            date=d,
            name="Dasara Holidays",
            type="Festival"
        )
        db.add(h)
    db.commit()

    # 5. Create Timetable Version
    version = models.TimetableVersion(
        user_id=user.id,
        semester_id=semester.id,
        label="Original Timetable",
        effective_from=sem_start
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    # 6. Seed Timetable entries
    timetable_data = [
        # Monday
        {"day": "Mon", "subject": "Computer Organization and Architecture", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 402", "type": "Lecture"},
        {"day": "Mon", "subject": "Tinkering Lab", "start_time": time(9, 50), "end_time": time(12, 40), "room": "Lab Block", "type": "Practical"},
        {"day": "Mon", "subject": "Computer Networks", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 102", "type": "Lecture"},
        {"day": "Mon", "subject": "Open Elective - 1", "start_time": time(14, 30), "end_time": time(15, 20), "room": "Room 201", "type": "Lecture"},
        {"day": "Mon", "subject": "Exploratory Data Analysis with Python", "start_time": time(15, 20), "end_time": time(16, 10), "room": "Room 402", "type": "Lecture"},
        {"day": "Mon", "subject": "Mentoring/Seminar", "start_time": time(16, 10), "end_time": time(17, 0), "room": "Seminar Hall", "type": "Lecture"},

        # Tuesday
        {"day": "Tue", "subject": "Exploratory Data Analysis with Python", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 402", "type": "Lecture"},
        {"day": "Tue", "subject": "Computer Networks", "start_time": time(9, 50), "end_time": time(10, 40), "room": "Room 102", "type": "Lecture"},
        {"day": "Tue", "subject": "Open Elective - 1", "start_time": time(11, 0), "end_time": time(11, 50), "room": "Room 201", "type": "Lecture"},
        {"day": "Tue", "subject": "Computer Organization and Architecture", "start_time": time(11, 50), "end_time": time(12, 40), "room": "Room 402", "type": "Lecture"},
        {"day": "Tue", "subject": "Artificial Intelligence", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 303", "type": "Lecture"},
        {"day": "Tue", "subject": "Computer Networks Lab", "start_time": time(14, 30), "end_time": time(17, 0), "room": "CN Lab", "type": "Practical"},

        # Wednesday
        {"day": "Wed", "subject": "Computer Networks", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 102", "type": "Lecture"},
        {"day": "Wed", "subject": "Mentoring/Seminar", "start_time": time(9, 50), "end_time": time(10, 40), "room": "Seminar Hall", "type": "Lecture"},
        {"day": "Wed", "subject": "Artificial Intelligence", "start_time": time(11, 0), "end_time": time(11, 50), "room": "Room 303", "type": "Lecture"},
        {"day": "Wed", "subject": "Open Elective - 1", "start_time": time(11, 50), "end_time": time(12, 40), "room": "Room 201", "type": "Lecture"},
        {"day": "Wed", "subject": "Computer Organization and Architecture", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 402", "type": "Lecture"},
        {"day": "Wed", "subject": "Exploratory Data Analysis with Python", "start_time": time(14, 30), "end_time": time(15, 20), "room": "Room 402", "type": "Lecture"},
        {"day": "Wed", "subject": "Exploratory Data Analysis with Python", "start_time": time(15, 20), "end_time": time(16, 10), "room": "Room 402", "type": "Lecture"},
        {"day": "Wed", "subject": "Mentoring/Seminar", "start_time": time(16, 10), "end_time": time(17, 0), "room": "Seminar Hall", "type": "Lecture"},

        # Thursday
        {"day": "Thu", "subject": "Exploratory Data Analysis with Python", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 402", "type": "Lecture"},
        {"day": "Thu", "subject": "Computer Organization and Architecture", "start_time": time(9, 50), "end_time": time(10, 40), "room": "Room 402", "type": "Lecture"},
        {"day": "Thu", "subject": "Mentoring/Seminar", "start_time": time(11, 0), "end_time": time(11, 50), "room": "Seminar Hall", "type": "Lecture"},
        {"day": "Thu", "subject": "Artificial Intelligence", "start_time": time(11, 50), "end_time": time(12, 40), "room": "Room 303", "type": "Lecture"},
        {"day": "Thu", "subject": "Computer Networks", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 102", "type": "Lecture"},
        {"day": "Thu", "subject": "Open Elective - 1", "start_time": time(14, 30), "end_time": time(15, 20), "room": "Room 201", "type": "Lecture"},
        {"day": "Thu", "subject": "Computer Organization and Architecture", "start_time": time(15, 20), "end_time": time(16, 10), "room": "Room 402", "type": "Lecture"},
        {"day": "Thu", "subject": "Artificial Intelligence", "start_time": time(16, 10), "end_time": time(17, 0), "room": "Room 303", "type": "Lecture"},

        # Friday
        {"day": "Fri", "subject": "Artificial Intelligence", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 303", "type": "Lecture"},
        {"day": "Fri", "subject": "Artificial Intelligence Lab", "start_time": time(9, 50), "end_time": time(12, 40), "room": "AI Lab", "type": "Practical"},
        {"day": "Fri", "subject": "Open Elective - 1", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 201", "type": "Lecture"},
        {"day": "Fri", "subject": "Computer Networks", "start_time": time(14, 30), "end_time": time(15, 20), "room": "Room 102", "type": "Lecture"},
        {"day": "Fri", "subject": "Exploratory Data Analysis with Python", "start_time": time(15, 20), "end_time": time(16, 10), "room": "Room 402", "type": "Lecture"},
        {"day": "Fri", "subject": "Computer Organization and Architecture", "start_time": time(16, 10), "end_time": time(17, 0), "room": "Room 402", "type": "Lecture"},

        # Saturday
        {"day": "Sat", "subject": "Open Elective - 1", "start_time": time(9, 0), "end_time": time(9, 50), "room": "Room 201", "type": "Lecture"},
        {"day": "Sat", "subject": "Exploratory Data Analysis with Python", "start_time": time(9, 50), "end_time": time(10, 40), "room": "Room 402", "type": "Lecture"},
        {"day": "Sat", "subject": "Computer Networks", "start_time": time(11, 0), "end_time": time(11, 50), "room": "Room 102", "type": "Lecture"},
        {"day": "Sat", "subject": "Mentoring/Seminar", "start_time": time(11, 50), "end_time": time(12, 40), "room": "Seminar Hall", "type": "Lecture"},
        {"day": "Sat", "subject": "Artificial Intelligence", "start_time": time(13, 40), "end_time": time(14, 30), "room": "Room 303", "type": "Lecture"},
        {"day": "Sat", "subject": "Full Stack development-2 Lab", "start_time": time(14, 30), "end_time": time(17, 0), "room": "FS Lab", "type": "Practical"}
    ]

    for entry in timetable_data:
        t = models.Timetable(
            user_id=user.id,
            subject_id=subjects_map[entry["subject"]],
            day=entry["day"],
            start_time=entry["start_time"],
            end_time=entry["end_time"],
            room=entry["room"],
            type=entry["type"],
            version_id=version.id
        )
        db.add(t)
    db.commit()

    # 7. Generate class sessions for the semester version
    _generate_sessions_for_version(db, user.id, version)

    # 8. Mark realistic mock attendance logs for past classes (between 29-06-2026 and yesterday 04-07-2026)
    # Note: Today's date in local system time is 2026-07-05
    today = date(2026, 7, 5)
    past_sessions = db.query(models.ClassSession).filter(
        models.ClassSession.user_id == user.id,
        models.ClassSession.date < today,
        models.ClassSession.status == "upcoming"
    ).all()

    for session in past_sessions:
        rand = random.random()
        # 85% Present, 12% Absent, 3% Cancelled
        if rand > 0.88:
            status = "absent"
        elif rand > 0.85:
            status = "cancelled"
        else:
            status = "present"

        session.status = status
        
        # Link to Attendance record
        att = models.Attendance(
            user_id=user.id,
            subject_id=session.subject_id,
            date=session.date,
            status=status,
            session_id=session.id
        )
        db.add(att)

    db.commit()
    print("Vishnu Institute of Technology CSE(AI&DS) timetable and academic calendar seeded successfully!")

if __name__ == "__main__":
    seed_college_data()
