from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, Time, DateTime, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    college = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    semester = Column(String, nullable=True)
    roll_number = Column(String, nullable=True)
    section = Column(String, nullable=True)
    year = Column(String, nullable=True)
    register_number = Column(String, nullable=True)
    university = Column(String, nullable=True)
    attendance_goal = Column(Float, default=75.0)
    profile_photo = Column(Text, nullable=True)  # base64 or URL
    fcm_token = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subjects = relationship("Subject", back_populates="owner", cascade="all, delete-orphan")
    timetables = relationship("Timetable", back_populates="owner", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="owner", cascade="all, delete-orphan")
    leave_plans = relationship("LeavePlan", back_populates="owner", cascade="all, delete-orphan")
    semesters = relationship("Semester", back_populates="owner", cascade="all, delete-orphan")
    timetable_versions = relationship("TimetableVersion", back_populates="owner", cascade="all, delete-orphan")
    class_sessions = relationship("ClassSession", back_populates="owner", cascade="all, delete-orphan")
    holidays = relationship("Holiday", back_populates="owner", cascade="all, delete-orphan")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)
    code = Column(String, nullable=True)
    prof = Column(String, nullable=True)
    credits = Column(Integer, default=3)
    color = Column(String, default="#7c4dff")
    minimum_required_attendance = Column(Float, default=75.0)
    subject_type = Column(String, default="Theory")  # Theory or Lab
    weekly_classes = Column(Integer, default=4)
    total_planned_classes = Column(Integer, default=40)

    owner = relationship("User", back_populates="subjects")
    timetables = relationship("Timetable", back_populates="subject")
    attendances = relationship("Attendance", back_populates="subject")
    class_sessions = relationship("ClassSession", back_populates="subject")


class Timetable(Base):
    __tablename__ = "timetable"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    day = Column(String)  # Mon, Tue, Wed, Thu, Fri, Sat, Sun
    start_time = Column(Time)
    end_time = Column(Time)
    room = Column(String, nullable=True)
    type = Column(String, nullable=True)  # Lecture, Practical, Hybrid
    # Link to a specific timetable version (null = base timetable before versioning was added)
    version_id = Column(Integer, ForeignKey("timetable_versions.id"), nullable=True)

    owner = relationship("User", back_populates="timetables")
    subject = relationship("Subject", back_populates="timetables")
    version = relationship("TimetableVersion", back_populates="entries")


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    date = Column(Date)
    start_time = Column(Time, nullable=True) # To distinguish multiple classes of same subject
    status = Column(String)  # present, absent, cancelled, holiday
    remarks = Column(String, nullable=True)
    # Link to a specific class session when using calendar-driven flow
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="attendances")
    subject = relationship("Subject", back_populates="attendances")
    session = relationship("ClassSession", back_populates="attendance_record")


class LeavePlan(Base):
    __tablename__ = "leave_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    start_date = Column(Date)
    end_date = Column(Date)
    type = Column(String)  # Medical, Duty, Holiday, Personal
    status = Column(String, default="Approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="leave_plans")


# ─── New Calendar-Driven Models ─────────────────────────────────────────────

class Semester(Base):
    """Represents an academic semester with date boundaries."""
    __tablename__ = "semesters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)               # e.g. "3-1", "2-2"
    academic_year = Column(String)      # e.g. "2026-27"
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, default=True)
    academic_calendar = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="semesters")
    holidays = relationship("Holiday", back_populates="semester", cascade="all, delete-orphan")
    class_sessions = relationship("ClassSession", back_populates="semester", cascade="all, delete-orphan")
    timetable_versions = relationship("TimetableVersion", back_populates="semester", cascade="all, delete-orphan")


class Holiday(Base):
    """A holiday or non-working day that excludes sessions on that date."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    semester_id = Column(Integer, ForeignKey("semesters.id"))
    date = Column(Date)
    name = Column(String)               # e.g. "Diwali", "Pongal"
    type = Column(String)               # Public, College, Exam, Festival, Personal

    owner = relationship("User", back_populates="holidays")
    semester = relationship("Semester", back_populates="holidays")

    __table_args__ = (UniqueConstraint("user_id", "semester_id", "date", name="uq_holiday_user_semester_date"),)


class TimetableVersion(Base):
    """
    A versioned snapshot of the timetable.
    When the college changes the timetable mid-semester, a new version is created
    with an effective_from date. Sessions on or after that date are regenerated.
    """
    __tablename__ = "timetable_versions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=True)
    label = Column(String, nullable=True)       # Optional label e.g. "Mid-semester update"
    effective_from = Column(Date)               # Sessions from this date use this version
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="timetable_versions")
    semester = relationship("Semester", back_populates="timetable_versions")
    entries = relationship("Timetable", back_populates="version", cascade="all, delete-orphan")


class ClassSession(Base):
    """
    A single auto-generated class period on a specific date.
    Created by the semester calendar engine for every scheduled class in the semester.
    Students mark attendance against individual ClassSession rows.
    """
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    semester_id = Column(Integer, ForeignKey("semesters.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    date = Column(Date)
    start_time = Column(Time)
    end_time = Column(Time)
    room = Column(String, nullable=True)
    session_type = Column(String, nullable=True)    # Lecture, Practical, Hybrid, Extra
    status = Column(String, default="upcoming")     # upcoming, present, absent, cancelled, holiday
    is_extra = Column(Boolean, default=False)       # True for manually added extra classes
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="class_sessions")
    semester = relationship("Semester", back_populates="class_sessions")
    subject = relationship("Subject", back_populates="class_sessions")
    attendance_record = relationship("Attendance", back_populates="session", uselist=False)

    __table_args__ = (UniqueConstraint("user_id", "subject_id", "date", "start_time", name="uq_session"),)
