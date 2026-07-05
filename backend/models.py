from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, Time, DateTime
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
    attendance_goal = Column(Float, default=75.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subjects = relationship("Subject", back_populates="owner")
    timetables = relationship("Timetable", back_populates="owner")
    attendances = relationship("Attendance", back_populates="owner")
    leave_plans = relationship("LeavePlan", back_populates="owner")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)
    code = Column(String, nullable=True)
    prof = Column(String, nullable=True)
    credits = Column(Integer, default=3)
    color = Column(String, default="#7c4dff")

    owner = relationship("User", back_populates="subjects")
    timetables = relationship("Timetable", back_populates="subject")
    attendances = relationship("Attendance", back_populates="subject")

class Timetable(Base):
    __tablename__ = "timetable"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    day = Column(String) # Mon, Tue, Wed, Thu, Fri, Sat, Sun
    start_time = Column(Time)
    end_time = Column(Time)
    room = Column(String, nullable=True)
    type = Column(String, nullable=True) # Lecture, Practical, Hybrid

    owner = relationship("User", back_populates="timetables")
    subject = relationship("Subject", back_populates="timetables")

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    date = Column(Date)
    status = Column(String) # Present, Absent, Cancelled, Holiday
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="attendances")
    subject = relationship("Subject", back_populates="attendances")

class LeavePlan(Base):
    __tablename__ = "leave_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    start_date = Column(Date)
    end_date = Column(Date)
    type = Column(String) # Medical, Duty, Holiday, Personal
    status = Column(String, default="Approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="leave_plans")

