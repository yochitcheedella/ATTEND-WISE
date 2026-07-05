# **Project Design Report (PDR)**

## **AttendWise – AI-Powered Student Attendance Companion**

---

# PROJECT DESIGN REPORT (PDR)

## Project Title

**AttendWise – AI-Powered Student Attendance Companion**

---

# 1. Introduction

## 1.1 Project Overview

AttendWise is a student-centric attendance monitoring application designed to help students maintain the minimum required attendance percentage throughout their academic semester.

Unlike traditional attendance systems managed by colleges, AttendWise serves as a **personal attendance companion**, allowing students to create their timetable, record daily attendance, monitor attendance percentages, analyze historical data, and predict future attendance requirements.

The application focuses entirely on students and does not include faculty or parent modules. Its goal is to simplify attendance tracking while providing meaningful analytics and intelligent insights.

---

# 2. Problem Analysis

Many students face the following challenges:

* Forgetting to record attendance.
* Difficulty calculating attendance percentage.
* Uncertainty about the number of classes needed to maintain 75%.
* No visualization of attendance trends.
* Lack of reminders.
* Difficulty identifying subjects with poor attendance.

These problems often result in students failing to meet institutional attendance requirements.

---

# 3. Proposed Solution

AttendWise provides an intelligent attendance tracking system where students:

* Create their semester timetable once.
* Receive today's schedule automatically.
* Mark attendance with one tap.
* Track attendance for every subject.
* View attendance reports.
* Predict future attendance.
* Calculate safe bunks.
* Receive reminders.
* Analyze attendance using graphs.

---

# 4. Objectives

* Maintain attendance above target percentage.
* Automate attendance calculations.
* Reduce manual work.
* Provide attendance analytics.
* Help students plan absences.
* Improve attendance awareness.

---

# 5. System Modules

## Module 1 – User Management

Functions

* Registration
* Login
* Google Authentication
* Profile Management
* Semester Selection

---

## Module 2 – Timetable Management

Students create a weekly timetable.

Functions

* Add subjects
* Edit timetable
* Delete timetable
* Duplicate semester timetable
* Upload timetable image (future)
* OCR timetable import (future)

Output

Daily class schedule generated automatically.

---

## Module 3 – Daily Attendance

Every day the application loads today's timetable.

Student marks

* Present
* Absent
* Cancelled
* Holiday

Attendance is updated instantly.

---

## Module 4 – Attendance Engine

Responsible for

* Attendance calculations
* Subject calculations
* Semester calculations
* Overall percentage
* Required classes
* Safe bunks
* Prediction calculations

---

## Module 5 – Analytics Module

Provides

* Daily Attendance
* Weekly Attendance
* Monthly Attendance
* Semester Attendance
* Subject Analytics
* Attendance Heatmap
* Calendar View

---

## Module 6 – Reports Module

Generate

* Daily Report
* Weekly Report
* Monthly Report
* Semester Report
* Custom Date Report

Export formats

* PDF
* Excel

---

## Module 7 – Notification Module

Responsible for

Morning reminder

Today's schedule

Attendance pending reminder

Low attendance warning

Goal achievement notification

---

# 6. Functional Requirements

### User

* Register
* Login
* Logout
* Edit profile

### Timetable

* Create timetable
* Update timetable
* Delete timetable
* View timetable

### Attendance

* Mark attendance
* Edit attendance
* Delete attendance

### Dashboard

Display

* Attendance percentage
* Present
* Absent
* Total classes
* Today's classes
* Safe bunks
* Required classes

### Reports

Generate reports

### Analytics

View attendance statistics

---

# 7. Non-Functional Requirements

Performance

* Fast loading

Security

* Authentication
* Encrypted data

Reliability

* Cloud backup
* Data synchronization

Usability

* Simple UI
* Easy navigation

Scalability

* Support thousands of users

Availability

* 24×7 access

---

# 8. System Architecture

```
+------------------------------------------------+
|              Mobile Application                |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|             Authentication Module              |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|              Timetable Module                  |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|             Attendance Module                  |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|            Attendance Calculation Engine       |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|              Analytics Module                  |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|             Notification Module                |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|             Report Generation Module           |
+------------------------------------------------+
                     |
                     |
+------------------------------------------------+
|        PostgreSQL (Supabase Database)          |
+------------------------------------------------+
```

---

# 9. Database Design

## Users

| Field             | Type      |
| ----------------- | --------- |
| User ID           | UUID      |
| Name              | String    |
| Email             | String    |
| Password          | Encrypted |
| College           | String    |
| Branch            | String    |
| Semester          | Integer   |
| Target Attendance | Integer   |

---

## Subjects

| Field        | Type    |
| ------------ | ------- |
| Subject ID   | UUID    |
| User ID      | UUID    |
| Subject Name | String  |
| Credits      | Integer |

---

## Timetable

| Field        | Type   |
| ------------ | ------ |
| Timetable ID | UUID   |
| User ID      | UUID   |
| Day          | String |
| Subject ID   | UUID   |
| Start Time   | Time   |
| End Time     | Time   |
| Classroom    | String |

---

## Attendance

| Field         | Type     |
| ------------- | -------- |
| Attendance ID | UUID     |
| User ID       | UUID     |
| Subject ID    | UUID     |
| Date          | Date     |
| Status        | Enum     |
| Timestamp     | DateTime |

Status Values:

* Present
* Absent
* Cancelled
* Holiday

---

## Notifications

| Field           | Type      |
| --------------- | --------- |
| Notification ID | UUID      |
| User ID         | UUID      |
| Message         | Text      |
| Read Status     | Boolean   |
| Created At      | Timestamp |

---

# 10. UI Design

## Screens

1. Splash Screen
2. Login
3. Register
4. Dashboard
5. Timetable
6. Today's Classes
7. Attendance Marking
8. Calendar
9. Subject Details
10. Analytics
11. Reports
12. Profile
13. Settings

---

# 11. Algorithms

### Attendance Percentage

```
Attendance %

=

Present Classes

/

Total Conducted Classes

×

100
```

---

### Safe Bunk

Calculate the maximum number of future classes that can be missed while staying above the selected attendance goal.

---

### Required Classes

Calculate the minimum consecutive classes that must be attended to reach the target attendance percentage.

---

### Attendance Prediction

Forecast attendance after hypothetical future attendance scenarios.

---

# 12. Security

* JWT Authentication
* Secure Password Hashing
* HTTPS Communication
* Database Row-Level Security (Supabase RLS)
* Encrypted User Data
* Secure Cloud Storage

---

# 13. Technology Stack

| Layer          | Technology               |
| -------------- | ------------------------ |
| Mobile App     | Flutter                  |
| Backend        | FastAPI                  |
| Database       | PostgreSQL (Supabase)    |
| Authentication | Supabase Auth            |
| Notifications  | Firebase Cloud Messaging |
| Charts         | FL Chart                 |
| OCR            | Google ML Kit            |
| Cloud Storage  | Supabase Storage         |

---

# 14. Testing Plan

* Unit Testing
* Integration Testing
* UI Testing
* Functional Testing
* Performance Testing
* Security Testing
* User Acceptance Testing (UAT)

---

# 15. Future Enhancements

* AI-based timetable import from images/PDFs.
* Attendance forecasting using machine learning.
* Voice commands for attendance updates.
* Home-screen widgets with live attendance.
* Smart attendance streaks and achievements.
* Integration with Google Calendar for class reminders.

---

# 16. Expected Deliverables

* Flutter mobile application (Android/iOS)
* FastAPI backend
* PostgreSQL database schema
* REST API documentation
* Complete UI/UX design
* User manual
* Testing report
* Source code repository
* Deployment guide

---

# 17. Conclusion

AttendWise is designed as a modern, student-focused attendance management solution that combines simple daily attendance recording with powerful analytics and prediction features. By automating calculations, providing personalized insights, and presenting attendance history through intuitive visualizations, the application helps students proactively maintain their attendance goals. Its modular architecture, secure cloud-based design, and scalable technology stack make it suitable as both a **major B.Tech final-year project** and a **production-ready EdTech application** with potential for future expansion.
