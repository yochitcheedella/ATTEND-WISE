# Software Requirements Specification (SRS)

## **AttendWise – AI-Powered Student Attendance Companion**

**Version:** 1.0
**Document Type:** Software Requirements Specification (SRS)
**Project Type:** Student Attendance Monitoring System
**Platform:** Android & iOS Mobile Application
**Prepared For:** B.Tech Major Project

---

# Table of Contents

1. Introduction
2. Overall Description
3. System Features
4. External Interface Requirements
5. Functional Requirements
6. Non-Functional Requirements
7. Data Requirements
8. Use Case Specifications
9. System Workflow
10. Software Requirements
11. Hardware Requirements
12. Constraints
13. Assumptions
14. Future Enhancements

---

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for **AttendWise**, a student-centric attendance monitoring application.

The application enables students to create their academic timetable, record daily attendance, monitor attendance percentages, predict future attendance, analyze attendance trends, and maintain the required attendance threshold (such as 75%) without relying on institutional attendance systems.

---

## 1.2 Scope

AttendWise is designed exclusively for students.

The application provides:

* Student registration and authentication
* Timetable management
* Daily attendance tracking
* Subject-wise attendance
* Attendance analytics
* Attendance prediction
* Safe bunk calculation
* Attendance reports
* Notifications and reminders

The system **does not include**:

* Faculty login
* Parent login
* College administration module

---

## 1.3 Objectives

The system aims to:

* Simplify attendance tracking.
* Help students maintain required attendance.
* Automate attendance calculations.
* Provide attendance analytics.
* Improve attendance planning.
* Reduce manual calculations.

---

# 2. Overall Description

## 2.1 Product Perspective

AttendWise is a standalone mobile application with cloud synchronization.

Students create their timetable once and use the application throughout the semester.

The application automatically determines today's classes and allows students to record attendance quickly.

---

## 2.2 Product Functions

The system shall:

* Register users
* Authenticate users
* Manage timetable
* Display daily classes
* Record attendance
* Calculate attendance percentage
* Predict future attendance
* Calculate safe bunks
* Generate attendance reports
* Display analytics
* Send reminders

---

## 2.3 User Characteristics

Primary Users

* Undergraduate students
* Engineering students
* Degree students
* Coaching institute students

Users should possess:

* Basic smartphone knowledge
* Internet connectivity
* Academic timetable

---

## 2.4 Operating Environment

### Mobile

Android 10+

iOS 15+

### Backend

Cloud Server

### Database

PostgreSQL

---

# 3. System Features

## Feature 1

### User Authentication

Students can

* Register
* Login
* Logout
* Reset password
* Google Sign-In

---

## Feature 2

### Timetable Management

Students can

* Create weekly timetable
* Add subjects
* Edit subjects
* Delete subjects
* Copy timetable
* Upload timetable (future)

---

## Feature 3

### Daily Attendance

Application displays

Today's timetable

Students mark

* Present
* Absent
* Cancelled
* Holiday

---

## Feature 4

### Dashboard

Displays

* Overall attendance
* Today's attendance
* Present classes
* Absent classes
* Attendance goal
* Safe bunks
* Required classes

---

## Feature 5

### Attendance Analytics

Students can view

* Daily attendance
* Weekly attendance
* Monthly attendance
* Semester attendance
* Subject analytics
* Attendance calendar
* Attendance heatmap

---

## Feature 6

### Reports

Generate

* Daily
* Weekly
* Monthly
* Semester
* Custom reports

Export

* PDF
* Excel

---

## Feature 7

### Attendance Prediction

Predict

* Attendance after missing classes
* Attendance after attending classes
* End semester attendance
* Required classes

---

## Feature 8

### Notifications

Morning reminder

Today's timetable

Attendance pending reminder

Low attendance warning

Goal achievement

---

# 4. External Interface Requirements

## User Interface

The application shall provide:

* Responsive UI
* Dark mode
* Modern dashboard
* Interactive charts
* Calendar interface
* Simple attendance buttons

---

## Software Interface

* Supabase Authentication
* PostgreSQL Database
* Firebase Cloud Messaging
* Google ML Kit (Future)
* OpenAI/Gemini API (Future)

---

## Communication Interface

HTTPS

REST API

JSON

---

# 5. Functional Requirements

## FR-01 User Registration

The system shall allow students to create an account.

---

## FR-02 Login

The system shall authenticate users.

---

## FR-03 Profile

Users shall edit

* Name
* Semester
* Branch
* College

---

## FR-04 Timetable

The system shall

Create

Edit

Delete

Weekly timetable

---

## FR-05 Today's Schedule

The application shall automatically display

Today's classes

Based on current day.

---

## FR-06 Attendance Marking

Students shall mark

Present

Absent

Cancelled

Holiday

---

## FR-07 Attendance Percentage

System shall calculate

Overall attendance

Subject attendance

Semester attendance

---

## FR-08 Attendance Calculator

System shall calculate

Required classes

Safe bunks

Attendance percentage

---

## FR-09 Attendance History

Students shall view attendance

By

Date

Week

Month

Semester

Custom period

---

## FR-10 Calendar

Students shall select any date

View attendance

Edit attendance

---

## FR-11 Reports

Generate reports

Download PDF

Download Excel

---

## FR-12 Notifications

System shall send

Daily reminders

Attendance alerts

Goal completion

---

## FR-13 Analytics

System shall generate

Attendance charts

Monthly trends

Weekly trends

Subject comparison

---

## FR-14 Prediction

System shall predict

Future attendance

Semester attendance

Attendance goals

---

# 6. Non-Functional Requirements

## Performance

Response time < 2 seconds

---

## Reliability

99% uptime

---

## Security

JWT authentication

Encrypted passwords

HTTPS

---

## Scalability

Support over 50,000 users

---

## Availability

24×7

---

## Portability

Android

iOS

---

## Maintainability

Modular architecture

Reusable code

---

## Usability

Simple UI

Minimal user interaction

Easy navigation

---

# 7. Data Requirements

## User

* User ID
* Name
* Email
* College
* Semester

---

## Subject

* Subject ID
* Name
* Credits

---

## Timetable

* Day
* Subject
* Start Time
* End Time
* Classroom

---

## Attendance

* Date
* Subject
* Status
* Timestamp

---

## Reports

Generated

PDF

Excel

---

# 8. Use Case Specifications

## Use Case 1

### Register

Actor

Student

Flow

Register

Verify email

Login

---

## Use Case 2

### Create Timetable

Student

↓

Add subjects

↓

Save timetable

↓

Daily schedule generated

---

## Use Case 3

### Mark Attendance

Open app

↓

Today's classes

↓

Tap Present/Absent

↓

Attendance updated

---

## Use Case 4

### View Analytics

Dashboard

↓

Analytics

↓

Select Month

↓

Charts displayed

---

## Use Case 5

### Generate Report

Reports

↓

Select duration

↓

Generate

↓

Download

---

# 9. System Workflow

```text
Login/Register
      │
      ▼
Create Timetable
      │
      ▼
Daily Schedule Generated
      │
      ▼
Mark Attendance
      │
      ▼
Attendance Stored
      │
      ▼
Attendance Calculated
      │
      ▼
Analytics Updated
      │
      ▼
Predictions Generated
      │
      ▼
Reports Available
```

---

# 10. Software Requirements

| Component      | Technology                 |
| -------------- | -------------------------- |
| Mobile App     | Flutter                    |
| Backend        | FastAPI                    |
| Database       | PostgreSQL (Supabase)      |
| Authentication | Supabase Auth              |
| Notifications  | Firebase Cloud Messaging   |
| Charts         | FL Chart                   |
| OCR            | Google ML Kit (Future)     |
| AI             | OpenAI/Gemini API (Future) |

---

# 11. Hardware Requirements

### Development

* Intel Core i5 (or higher)
* 16 GB RAM
* 512 GB SSD

### Mobile Device

* Android 10+ or iOS 15+
* Minimum 4 GB RAM
* Internet connection

---

# 12. Constraints

* Internet required for cloud synchronization.
* Attendance depends on user honesty and manual updates.
* Timetable must be configured before attendance tracking begins.
* Push notifications require user permission.
* Prediction accuracy depends on complete attendance records.

---

# 13. Assumptions

* Students enter accurate timetable information.
* Students update attendance daily.
* Academic schedules remain relatively stable during the semester.
* Cloud services are available and operational.

---

# 14. Future Enhancements

* AI-powered timetable import from PDF or images.
* Voice-based attendance updates.
* Smart attendance widgets.
* Wearable device support.
* AI-driven attendance recommendations.
* Integration with personal calendars.
* Offline attendance with automatic cloud sync.
* Semester GPA tracking alongside attendance.

---

# Conclusion

The **AttendWise Software Requirements Specification (SRS)** defines a complete, scalable, and student-focused attendance monitoring system. By combining timetable management, one-tap attendance recording, predictive calculations, detailed analytics, and report generation, the application provides students with a powerful tool to monitor and improve their attendance. The modular architecture and modern technology stack also make it suitable for deployment as a production-ready EdTech application beyond an academic project.
