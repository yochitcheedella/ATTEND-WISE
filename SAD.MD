# **Software Architecture Document (SAD)**

## **AttendWise – AI-Powered Student Attendance Companion**

**Version:** 1.0
**Document Type:** Software Architecture Document (SAD)
**Project:** AttendWise – AI-Powered Student Attendance Companion

---

# Table of Contents

1. Introduction
2. Architectural Goals
3. System Architecture
4. High-Level Architecture
5. Module Architecture
6. Component Design
7. Database Architecture
8. API Architecture
9. Security Architecture
10. Deployment Architecture
11. Technology Stack
12. Sequence Diagrams
13. Data Flow
14. Design Decisions
15. Scalability
16. Future Enhancements

---

# 1. Introduction

## 1.1 Purpose

This document describes the software architecture of **AttendWise**, a student-only attendance monitoring application that enables students to manage their timetable, record attendance, monitor attendance statistics, and predict future attendance requirements.

The architecture is designed to be modular, scalable, secure, and cloud-based.

---

## 1.2 Scope

The architecture covers:

* Mobile application
* Backend services
* Database
* Authentication
* Notifications
* Analytics
* Report generation
* Cloud infrastructure

---

# 2. Architectural Goals

The architecture is designed to achieve:

* High performance
* Scalability
* Security
* Maintainability
* Modular development
* Offline-first capability
* Cloud synchronization
* Easy future expansion

---

# 3. Overall System Architecture

```text
                    +-------------------------+
                    |    Student (Mobile)     |
                    +-----------+-------------+
                                |
                                |
                      HTTPS / REST API
                                |
+--------------------------------------------------------------+
|                       FastAPI Backend                         |
+--------------------------------------------------------------+
| Authentication | Timetable | Attendance | Analytics | Reports |
| Notifications  | Prediction | User Profile | Settings         |
+--------------------------------------------------------------+
                                |
                                |
                        PostgreSQL Database
                          (Supabase)
                                |
                                |
          +---------------------+----------------------+
          |                                            |
   Firebase Cloud Messaging                    Supabase Storage
   (Push Notifications)                      (Reports & Files)
```

---

# 4. High-Level Architecture

The application follows a **three-tier architecture**.

### Presentation Layer

* Flutter Mobile App
* User Interface
* Local Storage
* Charts

### Business Logic Layer

* Attendance calculations
* Prediction engine
* Report generator
* Analytics engine
* Notification scheduler

### Data Layer

* PostgreSQL database
* Cloud storage
* Authentication
* Local cache

---

# 5. Module Architecture

## Module 1 – Authentication

Responsibilities:

* Register
* Login
* Logout
* Password reset
* Session management

Components:

* Authentication Service
* JWT Token Manager
* User Session

---

## Module 2 – Profile Management

Responsibilities:

* Student profile
* Semester
* Branch
* College
* Attendance goal

---

## Module 3 – Timetable Module

Responsibilities:

* Create timetable
* Edit timetable
* Delete timetable
* Weekly schedule
* Subject management

---

## Module 4 – Attendance Module

Responsibilities:

* Daily attendance
* Attendance editing
* Subject attendance
* Attendance history

---

## Module 5 – Attendance Engine

Responsibilities:

* Attendance percentage
* Safe bunk calculation
* Required classes
* Semester calculations
* Subject calculations

---

## Module 6 – Analytics Module

Responsibilities:

* Daily analytics
* Weekly analytics
* Monthly analytics
* Semester analytics
* Calendar view
* Heatmap
* Charts

---

## Module 7 – Prediction Module

Responsibilities:

* Future attendance prediction
* Attendance planning
* Goal tracking
* Risk detection

---

## Module 8 – Notification Module

Responsibilities:

* Daily reminders
* Attendance pending alerts
* Low attendance warnings
* Achievement notifications

---

## Module 9 – Reports Module

Responsibilities:

* PDF reports
* Excel reports
* Monthly reports
* Semester reports

---

# 6. Component Architecture

```text
                 Flutter Mobile App

     ┌──────────────────────────────────┐
     │          UI Components           │
     ├──────────────────────────────────┤
     │ Dashboard                        │
     │ Timetable                        │
     │ Attendance                       │
     │ Analytics                        │
     │ Reports                          │
     │ Calendar                         │
     │ Settings                         │
     └──────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────┐
     │       Business Logic Layer       │
     ├──────────────────────────────────┤
     │ Attendance Engine                │
     │ Prediction Engine                │
     │ Report Engine                    │
     │ Notification Service             │
     └──────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────┐
     │          Data Layer              │
     ├──────────────────────────────────┤
     │ Supabase                         │
     │ PostgreSQL                       │
     │ Local Storage                    │
     └──────────────────────────────────┘
```

---

# 7. Database Architecture

### Users

```
UserID (PK)
Name
Email
PasswordHash
College
Branch
Semester
AttendanceGoal
CreatedAt
```

---

### Subjects

```
SubjectID (PK)
UserID (FK)
SubjectName
Credits
Color
```

---

### Timetable

```
TimetableID (PK)
UserID (FK)
Day
SubjectID (FK)
StartTime
EndTime
Room
```

---

### Attendance

```
AttendanceID (PK)
UserID (FK)
SubjectID (FK)
Date
Status
Remarks
CreatedAt
```

Status:

* Present
* Absent
* Cancelled
* Holiday

---

### Reports

```
ReportID
UserID
Type
GeneratedDate
FileURL
```

---

### Notifications

```
NotificationID
UserID
Title
Message
Read
CreatedAt
```

---

# 8. REST API Architecture

## Authentication

```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/reset-password
```

---

## User

```
GET /user/profile
PUT /user/profile
```

---

## Subjects

```
GET /subjects
POST /subjects
PUT /subjects/{id}
DELETE /subjects/{id}
```

---

## Timetable

```
GET /timetable
POST /timetable
PUT /timetable/{id}
DELETE /timetable/{id}
```

---

## Attendance

```
GET /attendance
POST /attendance
PUT /attendance/{id}
DELETE /attendance/{id}
```

---

## Analytics

```
GET /analytics/daily
GET /analytics/weekly
GET /analytics/monthly
GET /analytics/semester
GET /analytics/custom
```

---

## Reports

```
GET /reports
POST /reports/pdf
POST /reports/excel
```

---

## Prediction

```
GET /prediction
```

---

# 9. Security Architecture

Authentication:

* Supabase Authentication
* JWT tokens

Authorization:

* Row-Level Security (RLS)

Password Protection:

* Secure hashing

Communication:

* HTTPS/TLS encryption

Data Protection:

* Encrypted storage
* Secure API access

---

# 10. Deployment Architecture

```text
Flutter App
      │
      ▼
 Google Play Store / App Store
      │
      ▼
FastAPI Backend (Docker)
      │
      ▼
Supabase PostgreSQL
      │
      ▼
Supabase Storage
      │
      ▼
Firebase Cloud Messaging
```

---

# 11. Technology Stack

| Layer             | Technology                |
| ----------------- | ------------------------- |
| Mobile Frontend   | Flutter                   |
| Backend           | FastAPI (Python)          |
| Database          | PostgreSQL (Supabase)     |
| Authentication    | Supabase Auth             |
| Notifications     | Firebase Cloud Messaging  |
| Charts            | FL Chart                  |
| Local Storage     | Hive / Shared Preferences |
| Report Generation | PDF & Excel libraries     |
| OCR (Future)      | Google ML Kit             |
| AI (Future)       | Gemini API / OpenAI API   |

---

# 12. Sequence Diagrams

### Attendance Recording

```text
Student
   │
   ▼
Open App
   │
   ▼
Today's Timetable
   │
   ▼
Select Subject
   │
   ▼
Tap Present / Absent
   │
   ▼
Attendance Module
   │
   ▼
Database Update
   │
   ▼
Attendance Engine
   │
   ▼
Dashboard Updated
```

---

### Report Generation

```text
Student
   │
   ▼
Select Report Type
   │
   ▼
Analytics Module
   │
   ▼
Generate PDF/Excel
   │
   ▼
Save to Storage
   │
   ▼
Download Report
```

---

# 13. Data Flow

```text
User Login
      │
      ▼
Timetable Setup
      │
      ▼
Daily Attendance Entry
      │
      ▼
Attendance Database
      │
      ▼
Calculation Engine
      │
      ▼
Analytics Engine
      │
      ▼
Dashboard
      │
      ▼
Prediction Engine
      │
      ▼
Notifications & Reports
```

---

# 14. Design Decisions

* **Flutter** for a single cross-platform codebase.
* **FastAPI** for high-performance REST APIs.
* **Supabase** for managed PostgreSQL, authentication, and storage.
* **Modular architecture** to simplify maintenance and future feature additions.
* **REST APIs** for clean separation between frontend and backend.
* **Cloud synchronization** with optional local caching for improved reliability.

---

# 15. Scalability

The architecture supports:

* Multi-device synchronization for a user.
* Thousands of concurrent users.
* Modular addition of new features without major redesign.
* Independent scaling of backend services and database resources.

---

# 16. Future Enhancements

* AI-based timetable extraction from PDFs or images.
* Offline attendance with automatic synchronization.
* Home-screen widgets.
* Smart attendance forecasting using machine learning.
* Integration with personal calendars.
* Voice-based attendance updates.
* Cross-device real-time synchronization.
* Attendance streaks and gamification.

---

# Conclusion

The **Software Architecture Document (SAD)** for **AttendWise** defines a robust, scalable, and secure architecture tailored for a student-only attendance monitoring application. Its layered design, modular components, RESTful backend, and cloud-native infrastructure provide a strong foundation for both a **major B.Tech project** and a production-ready EdTech application capable of future growth and feature expansion.
