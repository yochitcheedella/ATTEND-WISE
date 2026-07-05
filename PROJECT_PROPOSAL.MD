# **Project Proposal**

# **AttendWise – AI-Powered Student Attendance Companion**

---

# 1. Project Overview

## Project Title

**AttendWise – AI-Powered Student Attendance Companion**

## Project Type

Cross-Platform Mobile Application (Android & iOS) with Cloud Backend

## Domain

Education Technology (EdTech)

## Duration

4–6 Months

---

# 2. Abstract

Maintaining the minimum attendance requirement is a challenge for many college students. Most institutions require students to maintain at least **75% attendance**, but students often struggle to calculate their attendance manually and determine how many classes they can safely miss or need to attend.

**AttendWise** is a student-centric attendance management application designed to simplify attendance tracking. Students upload their semester timetable once, and the application automatically displays the scheduled classes each day. With a single tap, students mark themselves as Present, Absent, Cancelled, or Holiday.

The application continuously calculates attendance percentages, predicts future attendance, estimates the number of classes required to maintain the target percentage, and provides intelligent reminders and visual analytics. Unlike institutional attendance systems, AttendWise is a **personal attendance companion** that helps students make informed decisions regarding their attendance without requiring faculty or parent involvement.

---

# 3. Problem Statement

Students frequently encounter the following problems:

* Difficulty tracking attendance manually.
* Inability to calculate attendance percentage accurately.
* Lack of awareness about how many classes they need to attend to maintain 75%.
* Missing attendance updates due to busy schedules.
* No centralized personal attendance tracking system.
* Difficulty analyzing attendance trends over weeks and semesters.

These challenges often result in students falling below the required attendance threshold without realizing it until it is too late.

---

# 4. Proposed Solution

AttendWise provides a smart, student-only attendance monitoring platform that allows students to:

* Create or import their weekly timetable.
* Automatically view daily scheduled classes.
* Record attendance with one tap.
* Monitor attendance for each subject.
* Calculate attendance percentage instantly.
* Predict future attendance.
* Determine safe bunk limits.
* View attendance analytics using interactive charts.
* Receive reminders and smart insights.

---

# 5. Objectives

The primary objectives are:

* Help students maintain minimum attendance requirements.
* Eliminate manual attendance calculations.
* Improve attendance awareness.
* Provide attendance analytics.
* Predict attendance trends.
* Improve student discipline through reminders.
* Provide a beautiful and intuitive user experience.

---

# 6. Target Users

* Undergraduate students
* Postgraduate students
* Engineering students
* Degree college students
* Coaching institute students

---

# 7. Scope

The application focuses exclusively on students.

There is:

* No Faculty Module
* No Parent Module
* No College Administration Module

Students independently maintain their attendance records.

---

# 8. Functional Requirements

## User Management

* User Registration
* Login
* Google Sign-In
* Forgot Password
* User Profile

---

## Timetable Management

Students can

* Create timetable
* Edit timetable
* Delete timetable
* Duplicate previous semester timetable
* Upload timetable image
* Scan timetable PDF
* OCR timetable extraction

---

## Daily Attendance

Each day the application automatically displays

Today's Classes

Students can mark

* Present
* Absent
* Cancelled
* Holiday

Attendance updates instantly.

---

## Attendance Dashboard

Displays

* Overall Attendance
* Current Percentage
* Today's Classes
* Total Classes
* Present Classes
* Absent Classes
* Attendance Goal
* Safe Bunks
* Classes Needed

---

## Attendance Calculator

Automatically calculates

Current Percentage

Classes Required

Safe Bunks

Remaining Classes

Predicted Attendance

---

## Subject Attendance

Each subject contains

* Attendance Percentage
* Total Classes
* Present
* Absent
* Attendance Trend
* Goal Progress

---

## Calendar

Students can view attendance using a calendar.

Colors

🟢 Present

🔴 Absent

🟡 Partial

⚪ Holiday

Selecting a date displays detailed attendance.

---

## Attendance Analytics

Students can view attendance by

Daily

Weekly

Monthly

Semester

Custom Date Range

Graphs include

Attendance Trend

Present vs Absent

Subject Comparison

Monthly Comparison

Attendance Heatmap

---

## Smart Notifications

Daily reminder

Missed attendance reminder

Low attendance warning

Goal achievement notification

---

## Attendance Prediction

Examples

"If I miss tomorrow?"

"If I attend every class this week?"

"How many classes do I need before exams?"

---

## Reports

Generate

Daily Report

Weekly Report

Monthly Report

Semester Report

Export

PDF

Excel

---

# 9. Non-Functional Requirements

* Fast response time
* Offline support
* Secure authentication
* Cloud synchronization
* Responsive UI
* Easy navigation
* Data encryption
* Cross-platform compatibility
* Battery optimization

---

# 10. System Architecture

```
                   Mobile Application

                         │

               Authentication Module

                         │

               Timetable Management

                         │

                 Attendance Module

                         │

                 Analytics Engine

                         │

               Prediction Engine

                         │

                 Notification Engine

                         │

              Cloud Database (Supabase)

                         │

                  Cloud Storage
```

---

# 11. Technology Stack

## Frontend

* Flutter (Recommended)

or

* React Native

---

## Backend

* FastAPI (Python)

---

## Database

* PostgreSQL (Supabase)

---

## Authentication

* Supabase Authentication

---

## Notifications

* Firebase Cloud Messaging

---

## Charts

* FL Chart

---

## Cloud Storage

* Supabase Storage

---

## OCR

* Google ML Kit

---

## AI

* Gemini API / OpenAI API (Future)

---

# 12. Database Design

## Users

* User ID
* Name
* Email
* College
* Branch
* Semester
* Target Attendance

---

## Subjects

* Subject ID
* Subject Name
* Semester
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

## Notifications

* Reminder Time
* Notification Type
* Read Status

---

# 13. Unique Features

### Smart Timetable

Create once.

Use throughout semester.

---

### One-Tap Attendance

No typing.

One tap only.

---

### Attendance Prediction

Forecast attendance before taking leave.

---

### Safe Bunk Calculator

Know exactly how many classes you can miss.

---

### Attendance Heatmap

GitHub-style visualization.

---

### Attendance Goals

75%

80%

85%

90%

95%

---

### AI Suggestions

Automatically recommend

* Subjects needing improvement.
* Weekly attendance strategy.
* Semester planning.

---

### Custom Analytics

Daily

Weekly

Monthly

Semester

Custom Range

---

# 14. Future Enhancements

* AI timetable generation.
* Automatic class detection based on time.
* Voice attendance updates.
* Smart widgets.
* Wear OS support.
* Apple Watch support.
* Attendance streak rewards.
* Semester GPA integration.
* Multi-device synchronization.

---

# 15. Expected Outcomes

After using AttendWise, students will be able to:

* Monitor attendance effortlessly.
* Stay above the required attendance percentage.
* Plan absences intelligently.
* Analyze attendance trends.
* Receive proactive reminders.
* Improve attendance consistency.
* Reduce the risk of detention due to low attendance.

---

# 16. Benefits

### Students

* Saves time
* Eliminates manual calculations
* Prevents low attendance
* Provides actionable insights
* Improves academic planning

### Educational Impact

* Encourages regular attendance
* Promotes self-discipline
* Enhances time management
* Supports academic success

---

# 17. Project Highlights

* 🎯 Student-only application
* 📅 Smart timetable-based attendance
* ✅ One-tap daily attendance
* 📊 Daily, weekly, monthly, semester, and custom-range analytics
* 📈 Attendance prediction and forecasting
* 🧮 Safe bunk and required classes calculator
* 📆 Interactive attendance calendar
* 📄 PDF and Excel report generation
* 🔔 Smart reminders and notifications
* 🤖 AI-powered attendance insights (future-ready)


