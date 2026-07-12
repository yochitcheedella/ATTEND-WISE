from pydantic import BaseModel, EmailStr, field_validator
from typing import List, Optional
from datetime import date, time, datetime

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    email: EmailStr
    college: Optional[str] = None
    branch: Optional[str] = None
    semester: Optional[str] = None
    roll_number: Optional[str] = None
    section: Optional[str] = None
    year: Optional[str] = None
    register_number: Optional[str] = None
    university: Optional[str] = None
    attendance_goal: float = 75.0

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name: str
    attendance_goal: float
    semester: Optional[str] = None
    college: Optional[str] = None
    branch: Optional[str] = None
    roll_number: Optional[str] = None
    section: Optional[str] = None
    year: Optional[str] = None
    register_number: Optional[str] = None
    university: Optional[str] = None
    profile_photo: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        return v

# --- Subject Schemas ---
class SubjectBase(BaseModel):
    name: str
    code: Optional[str] = None
    prof: Optional[str] = None
    credits: int = 3
    color: str = "#7c4dff"
    minimum_required_attendance: float = 75.0
    subject_type: str = "Theory"
    weekly_classes: int = 4
    total_planned_classes: int = 40

class SubjectCreate(SubjectBase):
    pass

class Subject(SubjectBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# --- Timetable Schemas ---
class TimetableBase(BaseModel):
    day: str
    start_time: time
    end_time: time
    room: Optional[str] = None
    type: Optional[str] = None

class TimetableCreate(TimetableBase):
    subject_id: int

class Timetable(TimetableBase):
    id: int
    user_id: int
    subject_id: int
    subject: Subject

    class Config:
        from_attributes = True

# --- Attendance Schemas ---
class AttendanceBase(BaseModel):
    date: date
    status: str
    remarks: Optional[str] = None

class AttendanceCreate(AttendanceBase):
    subject_id: int

class Attendance(AttendanceBase):
    id: int
    user_id: int
    subject_id: int
    created_at: datetime
    subject: Subject

    class Config:
        from_attributes = True

class TimetableEntry(BaseModel):
    day: str
    subject: str
    start: str
    end: str
    room: str
    prof: str
    type: str

class TimetableSyncRequest(BaseModel):
    timetable: List[TimetableEntry]

# --- LeavePlan Schemas ---
class LeavePlanBase(BaseModel):
    title: str
    start_date: date
    end_date: date
    type: str  # Medical, Duty, Holiday, Personal
    status: str = "Approved"

class LeavePlanCreate(LeavePlanBase):
    pass

class LeavePlan(LeavePlanBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ─── New Calendar-Driven Schemas ─────────────────────────────────────────────

class SemesterCreate(BaseModel):
    name: str                       # e.g. "3-1"
    academic_year: str              # e.g. "2026-27"
    start_date: date
    end_date: date
    academic_calendar: Optional[str] = None

class SemesterOut(BaseModel):
    id: int
    user_id: int
    name: str
    academic_year: str
    start_date: date
    end_date: date
    is_active: bool
    academic_calendar: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class HolidayCreate(BaseModel):
    date: date
    name: str
    type: str  # Public, College, Exam, Festival, Personal

class HolidayOut(BaseModel):
    id: int
    semester_id: int
    date: date
    name: str
    type: str

    class Config:
        from_attributes = True

class TimetableVersionCreate(BaseModel):
    semester_id: int
    label: Optional[str] = None
    effective_from: date
    timetable: List[TimetableEntry]

class TimetableVersionOut(BaseModel):
    id: int
    semester_id: Optional[int]
    label: Optional[str]
    effective_from: date
    created_at: datetime

    class Config:
        from_attributes = True

class ClassSessionOut(BaseModel):
    id: int
    date: date
    start_time: time
    end_time: time
    room: Optional[str]
    session_type: Optional[str]
    status: str
    is_extra: bool
    subject_id: int
    subject_name: str
    subject_color: str
    subject_prof: Optional[str]

    class Config:
        from_attributes = True

class MarkSessionRequest(BaseModel):
    status: str  # present, absent, cancelled, holiday
    remarks: Optional[str] = None

class ExtraClassCreate(BaseModel):
    semester_id: int
    subject_id: int
    date: date
    start_time: time
    end_time: time
    room: Optional[str] = None
    session_type: Optional[str] = "Extra"
