from pydantic import BaseModel, EmailStr
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
    attendance_goal: float = 75.0

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Subject Schemas ---
class SubjectBase(BaseModel):
    name: str
    code: Optional[str] = None
    prof: Optional[str] = None
    credits: int = 3
    color: str = "#7c4dff"

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

class UserUpdate(BaseModel):
    name: str
    attendance_goal: float
    semester: str

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
    type: str # Medical, Duty, Holiday, Personal
    status: str = "Approved"

class LeavePlanCreate(LeavePlanBase):
    pass

class LeavePlan(LeavePlanBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

