// AttendWise AI Student Attendance Companion - Core Business Logic & State Engine
// Supports offline-first LocalCache (localStorage) and real calculations.

const API_BASE_URL = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") 
    ? "http://127.0.0.1:8000" 
    : window.location.origin;


// ============================================================================
// 1. DEFAULT DATA CONFIGURATION
// ============================================================================

const DEFAULT_SUBJECTS = [
    { id: "s1", name: "Advanced Algorithms", code: "CS-401", prof: "Dr. Alan Turing", color: "#cdbdff" },
    { id: "s2", name: "Data Science Fundamentals", code: "CS-402", prof: "Prof. Ada Lovelace", color: "#40e56c" },
    { id: "s3", name: "Cloud Computing Lab", code: "CS-403", prof: "Dr. Grace Hopper", color: "#7c4dff" },
    { id: "s4", name: "Cyber Ethics", code: "CS-404", prof: "Prof. Dennis Ritchie", color: "#ffb3ae" },
    { id: "s5", name: "Psychology", code: "HS-201", prof: "Dr. William James", color: "#02c953" }
];

const DEFAULT_TIMETABLE = [
    // Mon
    { day: "Mon", subject: "Advanced Algorithms", start: "09:00", end: "10:30", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
    { day: "Mon", subject: "Data Science Fundamentals", start: "11:00", end: "12:30", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Practical" },
    { day: "Mon", subject: "Cloud Computing Lab", start: "14:00", end: "16:00", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Hybrid" },
    { day: "Mon", subject: "Cyber Ethics", start: "16:30", end: "17:30", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" },
    
    // Tue
    { day: "Tue", subject: "Data Science Fundamentals", start: "09:00", end: "10:30", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Lecture" },
    { day: "Tue", subject: "Psychology", start: "11:00", end: "12:30", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
    { day: "Tue", subject: "Advanced Algorithms", start: "14:00", end: "15:30", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
    
    // Wed
    { day: "Wed", subject: "Cloud Computing Lab", start: "09:00", end: "11:00", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Practical" },
    { day: "Wed", subject: "Cyber Ethics", start: "11:30", end: "12:30", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" },
    { day: "Wed", subject: "Psychology", start: "14:00", end: "15:30", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
    
    // Thu
    { day: "Thu", subject: "Advanced Algorithms", start: "09:00", end: "10:30", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
    { day: "Thu", subject: "Data Science Fundamentals", start: "11:00", end: "12:30", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Practical" },
    
    // Fri
    { day: "Fri", subject: "Psychology", start: "09:30", end: "11:00", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
    { day: "Fri", subject: "Cloud Computing Lab", start: "13:30", end: "15:30", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Hybrid" },
    { day: "Fri", subject: "Cyber Ethics", start: "16:00", end: "17:00", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" }
];

// Helper to pre-populate 2 months of rich historical logs for the calendar and charts
function generateMockAttendanceLogs() {
    const logs = {};
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60); // 60 days ago
    const today = new Date();
    
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dayStr = weekdays[d.getDay()];
        if (dayStr === "Sun") continue; // No classes on Sundays
        
        const dateKey = d.toISOString().split("T")[0];
        const dayClasses = DEFAULT_TIMETABLE.filter(c => c.day === dayStr);
        
        if (dayClasses.length > 0) {
            logs[dateKey] = dayClasses.map(c => {
                // Randomly assign attendance status: 80% Present, 12% Absent, 5% Cancelled, 3% Holiday
                const rand = Math.random();
                let status = "present";
                if (rand > 0.88) {
                    status = "absent";
                } else if (rand > 0.83) {
                    status = "cancelled";
                } else if (rand > 0.80) {
                    status = "holiday";
                }
                
                // If it's today, keep them as upcoming/unmarked by default
                const isTodayStr = new Date().toISOString().split("T")[0];
                if (dateKey === isTodayStr) {
                    status = "upcoming";
                }
                
                return {
                    subject: c.subject,
                    start: c.start,
                    end: c.end,
                    status: status
                };
            });
        }
    }
    return logs;
}

// ============================================================================
// 2. STATE STORAGE & INITIALIZATION
// ============================================================================

let appState = {
    profile: {
        name: "Sarah Jenkins",
        targetGoal: 75,
        term: "Semester 1 (Autumn)",
        streak: 12
    },
    subjects: DEFAULT_SUBJECTS,
    timetable: DEFAULT_TIMETABLE,
    attendanceLogs: {}, // dateKey -> array of { subject, start, end, status }
    leavePlans: [],
    notifications: [],
    timetableMode: "list"
};

function getAuthHeaders() {
    const token = localStorage.getItem("access_token");
    return token ? { "Authorization": "Bearer " + token } : {};
}

function showAuthScreen() {
    const screen = document.getElementById("auth-screen");
    if (screen) screen.classList.remove("hidden");
}

function hideAuthScreen() {
    const screen = document.getElementById("auth-screen");
    if (screen) screen.classList.add("hidden");
}

function switchAuthTab(tab) {
    const signinTab = document.getElementById("auth-tab-signin");
    const signupTab = document.getElementById("auth-tab-signup");
    const signinForm = document.getElementById("signin-form");
    const signupForm = document.getElementById("signup-form");
    
    if (tab === "signin") {
        signinTab.className = "flex-1 py-2 text-center text-label-md rounded-xl font-bold transition-all bg-surface-container-high text-on-surface shadow-sm";
        signupTab.className = "flex-1 py-2 text-center text-label-md rounded-xl font-bold transition-all text-on-surface-variant hover:text-on-surface";
        signinForm.classList.remove("hidden");
        signupForm.classList.add("hidden");
    } else {
        signupTab.className = "flex-1 py-2 text-center text-label-md rounded-xl font-bold transition-all bg-surface-container-high text-on-surface shadow-sm";
        signinTab.className = "flex-1 py-2 text-center text-label-md rounded-xl font-bold transition-all text-on-surface-variant hover:text-on-surface";
        signupForm.classList.remove("hidden");
        signinForm.classList.add("hidden");
    }
}

async function quickLoginDemo() {
    document.getElementById("signin-email").value = "sarah@example.com";
    document.getElementById("signin-password").value = "password123";
    const form = document.getElementById("signin-form");
    form.requestSubmit();
}

async function handleAuthSignIn(e) {
    e.preventDefault();
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("access_token", data.access_token);
            showToast("Login Successful", "Welcome to AttendWise!", "check_circle");
            await initAppState();
            tabNavigation("dashboard");
        } else {
            const err = await response.json();
            showToast("Login Failed", err.detail || "Incorrect email or password", "error");
        }
    } catch (err) {
        showToast("Error", "Could not connect to auth server", "error");
        console.error(err);
    }
}

async function handleAuthSignUp(e) {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const college = document.getElementById("signup-college").value.trim();
    const branch = document.getElementById("signup-branch").value.trim();
    const goal = parseFloat(document.getElementById("signup-goal").value);
    const semester = document.getElementById("signup-semester").value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                email,
                password,
                college,
                branch,
                attendance_goal: goal,
                semester
            })
        });
        
        if (response.ok) {
            showToast("Registration Successful", "Please log in with your credentials", "check_circle");
            switchAuthTab("signin");
            document.getElementById("signin-email").value = email;
            document.getElementById("signin-password").value = password;
        } else {
            const err = await response.json();
            showToast("Registration Failed", err.detail || "Could not register account", "error");
        }
    } catch (err) {
        showToast("Error", "Could not connect to auth server", "error");
        console.error(err);
    }
}

function handleAuthSignOut() {
    if (confirm("Are you sure you want to sign out?")) {
        localStorage.removeItem("access_token");
        location.reload();
    }
}

// Initial state loader
async function initAppState() {
    const token = localStorage.getItem("access_token");
    if (!token) {
        showAuthScreen();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/state`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            appState.profile = data.profile;
            appState.subjects = data.subjects;
            appState.timetable = data.timetable;
            appState.attendanceLogs = data.attendanceLogs;
            hideAuthScreen();
        } else if (response.status === 401) {
            localStorage.removeItem("access_token");
            showAuthScreen();
            return;
        } else {
            console.error("Failed to fetch state from backend, using defaults");
            appState.attendanceLogs = generateMockAttendanceLogs();
            hideAuthScreen();
        }
    } catch (e) {
        console.error("Backend not reachable, using defaults", e);
        appState.attendanceLogs = generateMockAttendanceLogs();
        hideAuthScreen();
    }

    // Load leave plans from backend
    await fetchLeavePlans();
    // Load notifications from local storage and run engine
    loadNotifications();
    generateSmartNotifications();
}

async function saveStateToLocalStorage() {
    // Sync timetable with backend
    try {
        const response = await fetch(`${API_BASE_URL}/timetable/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                timetable: appState.timetable
            })
        });
        if (response.ok) {
            console.log("Timetable synced with backend successfully");
        } else {
            console.error("Failed to sync timetable with backend");
            showToast("Sync Failed", "Could not save timetable schedule changes to backend.", "error");
        }
    } catch (e) {
        console.error("Network error during timetable sync", e);
        showToast("Connection Error", "Timetable changes not synced to backend.", "error");
    }
}

function resetAppData() {
    if (confirm("Are you sure you want to reset all data? This will restore the default timetable and clear your custom attendance records.")) {
        localStorage.clear();
        location.reload();
    }
}

// ============================================================================
// 3. UTILITIES & HELPER FUNCTIONS
// ============================================================================

// Formats a date object to YYYY-MM-DD
function formatDateKey(dateObj) {
    const tzOffset = dateObj.getTimezoneOffset() * 60000; // offset in milliseconds
    return (new Date(dateObj - tzOffset)).toISOString().split("T")[0];
}

// Helper to show a notification popup
function showToast(title, message, iconType = "notifications") {
    const toast = document.getElementById("toast-notification");
    const titleEl = document.getElementById("toast-title");
    const msgEl = document.getElementById("toast-message");
    const iconEl = document.getElementById("toast-icon");
    
    titleEl.textContent = title;
    msgEl.textContent = message;
    iconEl.textContent = iconType;
    
    // Slide in from the right
    toast.style.transform = "translateX(0px)";
    
    setTimeout(() => {
        // Slide back out to the right
        toast.style.transform = "translateX(120%)";
    }, 4000);
}


function triggerGreetingNotification() {
    const global = calculateGlobalAttendance();
    const analysis = runBunkAnalyzer();
    const subjectStats = calculateSubjectAttendance();
    
    // Find lowest attendance subject
    let lowestSubject = null;
    let lowestPct = 100;
    Object.values(subjectStats).forEach(s => {
        if (s.total > 0 && s.percent < lowestPct) {
            lowestPct = s.percent;
            lowestSubject = s;
        }
    });
    
    const messages = [
        `Your overall attendance is at ${global.percentage}%. ${analysis.type === 'safe' ? `You have ${analysis.count} safe bunks remaining.` : `Attend next ${analysis.count} classes to recover!`}`,
        `Streak: ${appState.profile.streak} consecutive days! Keep it up to stay above your ${appState.profile.targetGoal}% target.`,
        `Tip: Use the AI OCR upload to scan your timetable image and import it instantly.`,
        lowestSubject ? `⚠️ ${lowestSubject.name} is at ${lowestSubject.percent}% — needs attention!` : `All subjects are on track. Great work!`
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    showToast("AttendWise AI Insights", randomMsg, "insights");
}

// ============================================================================
// 4. TAB NAVIGATION ROUTING
// ============================================================================

let currentTab = "dashboard";

function tabNavigation(tabId) {
    currentTab = tabId;
    
    // Hide all views
    document.querySelectorAll(".tab-view").forEach(view => {
        view.classList.add("hidden");
    });
    
    // Show selected view
    const targetView = document.getElementById(`tab-view-${tabId}`);
    if (targetView) targetView.classList.remove("hidden");

    // Scroll main content back to top
    const mainEl = document.getElementById("main-content");
    if (mainEl) mainEl.scrollTop = 0;
    
    // Reset all sidebar nav buttons
    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.classList.remove("nav-link-active", "text-primary");
        btn.classList.add("text-on-surface-variant");
        const icon = btn.querySelector(".material-symbols-outlined");
        if (icon) icon.style.fontVariationSettings = "'FILL' 0, 'wght' 400";
    });
    
    // Set active style for selected nav button
    const activeBtn = document.getElementById(`nav-btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add("nav-link-active", "text-primary");
        activeBtn.classList.remove("text-on-surface-variant");
        const icon = activeBtn.querySelector(".material-symbols-outlined");
        if (icon) icon.style.fontVariationSettings = "'FILL' 1, 'wght' 500";
    }

    // Highlight mobile bottom navigation buttons
    document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabId) {
            btn.classList.add("text-primary");
            btn.classList.remove("text-on-surface-variant");
        } else {
            btn.classList.remove("text-primary");
            btn.classList.add("text-on-surface-variant");
        }
    });

    // Update top header title & subtitle
    const pageMeta = {
        dashboard: { title: "Dashboard", sub: "Overview of your attendance performance" },
        daily:     { title: "Daily Log",  sub: "Mark and track today's attendance" },
        analytics: { title: "Analytics",  sub: "Trends, heatmaps and AI forecasts" },
        reports:   { title: "Reports",    sub: "Generate and download attendance reports" },
        schedule:  { title: "Schedule",   sub: "Manage your weekly timetable, calendar and leaves" }
    };
    const meta = pageMeta[tabId] || { title: "AttendWise", sub: "" };
    const titleEl = document.getElementById("page-title");
    const subEl = document.getElementById("page-subtitle");
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.sub;
    
    // Render-on-navigate actions
    if (tabId === "dashboard") {
        renderDashboard();
    } else if (tabId === "daily") {
        initDailyTab();
    } else if (tabId === "analytics") {
        renderAnalytics();
    } else if (tabId === "reports") {
        loadReportPreview();
    } else if (tabId === "schedule") {
        // By default open Timetable sub-tab
        let activeSubTab = "timetable";
        if (!document.getElementById("schedule-view-calendar").classList.contains("hidden")) {
            activeSubTab = "calendar";
        } else if (!document.getElementById("schedule-view-leaves").classList.contains("hidden")) {
            activeSubTab = "leaves";
        }
        toggleScheduleSubTab(activeSubTab);
    }
}


// Sub tab navigation inside Schedule (Timetable vs Calendar vs Leaves)
function toggleScheduleSubTab(subTab) {
    const timetableBtn = document.getElementById("schedule-subtab-timetable");
    const calendarBtn = document.getElementById("schedule-subtab-calendar");
    const leavesBtn = document.getElementById("schedule-subtab-leaves");
    
    const timetableBox = document.getElementById("schedule-view-timetable");
    const calendarBox = document.getElementById("schedule-view-calendar");
    const leavesBox = document.getElementById("schedule-view-leaves");
    
    [timetableBtn, calendarBtn, leavesBtn].forEach(btn => {
        if (btn) btn.className = "px-5 py-2 rounded-xl font-bold transition-all text-on-surface-variant hover:text-on-surface text-sm";
    });
    [timetableBox, calendarBox, leavesBox].forEach(box => {
        if (box) box.classList.add("hidden");
    });
    
    if (subTab === "timetable") {
        if (timetableBtn) timetableBtn.className = "px-5 py-2 rounded-xl font-bold transition-all bg-surface-container-high text-on-surface shadow-sm text-sm";
        if (timetableBox) timetableBox.classList.remove("hidden");
        renderTimetableDayList();
    } else if (subTab === "calendar") {
        if (calendarBtn) calendarBtn.className = "px-5 py-2 rounded-xl font-bold transition-all bg-surface-container-high text-on-surface shadow-sm text-sm";
        if (calendarBox) calendarBox.classList.remove("hidden");
        initCalendarView();
    } else if (subTab === "leaves") {
        if (leavesBtn) leavesBtn.className = "px-5 py-2 rounded-xl font-bold transition-all bg-surface-container-high text-on-surface shadow-sm text-sm";
        if (leavesBox) leavesBox.classList.remove("hidden");
        renderLeavePlans();
    }
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.toggle("hidden");
}

// ============================================================================
// 5. CALCULATIONS ENGINE (BUSINESS LOGIC)
// ============================================================================

function calculateGlobalAttendance() {
    let presentCount = 0;
    let absentCount = 0;
    
    Object.values(appState.attendanceLogs).forEach(dayLogs => {
        dayLogs.forEach(cls => {
            if (cls.status === "present") presentCount++;
            if (cls.status === "absent") absentCount++;
        });
    });
    
    const totalConducted = presentCount + absentCount;
    const percentage = totalConducted > 0 ? Math.round((presentCount / totalConducted) * 100) : 0;
    
    return {
        percentage,
        present: presentCount,
        absent: absentCount,
        total: totalConducted
    };
}

function calculateSubjectAttendance() {
    const subjectStats = {};
    
    // Initialize subjects list
    appState.subjects.forEach(sub => {
        subjectStats[sub.name] = { present: 0, absent: 0, total: 0, percent: 0, code: sub.code, color: sub.color };
    });
    
    // Add logs
    Object.values(appState.attendanceLogs).forEach(dayLogs => {
        dayLogs.forEach(cls => {
            if (subjectStats[cls.subject]) {
                if (cls.status === "present") {
                    subjectStats[cls.subject].present++;
                    subjectStats[cls.subject].total++;
                } else if (cls.status === "absent") {
                    subjectStats[cls.subject].absent++;
                    subjectStats[cls.subject].total++;
                }
            }
        });
    });
    
    // Calculate individual percentages
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        stats.percent = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
    });
    
    return subjectStats;
}

// Calculate Safe Bunk or Classes Needed logic
function runBunkAnalyzer() {
    const global = calculateGlobalAttendance();
    const target = appState.profile.targetGoal;
    
    if (global.total === 0) {
        return { type: "neutral", text: "No logs logged", desc: "Start marking attendance to view limits." };
    }
    
    // Safe Bunks Formula: floor((Present - (Target/100) * Conducted) / (Target/100))
    // How many classes can we miss and still maintain >= Target percentage?
    const targetFraction = target / 100;
    const safeBunks = Math.floor((global.present - targetFraction * global.total) / targetFraction);
    
    if (safeBunks >= 0) {
        return {
            type: "safe",
            count: safeBunks,
            text: `${safeBunks} Classes`,
            desc: `You can safely miss ${safeBunks} consecutive classes while keeping above your ${target}% target.`
        };
    } else {
        // Classes Needed Formula: ceil((Target/100 * Conducted - Present) / (1 - Target/100))
        // How many consecutive classes must we attend to recover to Target?
        const classesNeeded = Math.ceil((targetFraction * global.total - global.present) / (1 - targetFraction));
        return {
            type: "risk",
            count: classesNeeded,
            text: `${classesNeeded} Classes Required`,
            desc: `Warning! You are below your goal. You must attend the next ${classesNeeded} consecutive classes to reach ${target}%.`
        };
    }
}

// Locally compute attendance streak from appState.attendanceLogs
// Mirrors the backend _compute_streak logic — counts consecutive class days
// going backwards where the student had at least one 'present' record.
// Skips days with no records, or days with only 'cancelled'/'holiday'/'upcoming'.
function computeLocalStreak() {
    const today = new Date();
    let streak = 0;
    let checkDate = new Date(today); // start from today

    for (let i = 0; i < 365; i++) {
        const dateKey = formatDateKey(checkDate);
        const records = appState.attendanceLogs[dateKey] || [];

        // Determine if there were any real class records (present or absent)
        const hasPresent = records.some(r => r.status === "present");
        const hasMeaningful = records.some(r => r.status === "present" || r.status === "absent");

        if (!hasMeaningful) {
            // No real class records — skip (weekend, holiday, cancelled-only)
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        } else if (hasPresent) {
            // Had at least one present — counts as streak day
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            // Had classes but was absent all day — streak broken
            break;
        }
    }
    return streak;
}

// Finds the next class scheduled today
function getNextScheduledClass() {
    const today = new Date();
    const dayIndex = today.getDay(); // 0 is Sun, 1 is Mon
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayDayStr = weekdays[dayIndex];
    
    if (todayDayStr === "Sun") {
        return null;
    }
    
    const todayClasses = appState.timetable.filter(c => c.day === todayDayStr);
    if (todayClasses.length === 0) return null;
    
    // Sort classes chronologically by start time
    todayClasses.sort((a, b) => a.start.localeCompare(b.start));
    
    const currentTimeStr = today.toTimeString().split(" ")[0].slice(0, 5); // "HH:MM"
    
    // Find first class whose start time is in the future
    const nextClass = todayClasses.find(c => c.start.localeCompare(currentTimeStr) > 0);
    
    // If all classes have passed, return null
    return nextClass || null;
}

// ============================================================================
// 6. VIEW RENDERING PIPELINE
// ============================================================================

// --- A. DASHBOARD ---
function renderDashboard() {
    const global = calculateGlobalAttendance();
    
    // Compute local streak as fallback if backend returned 0
    const displayStreak = appState.profile.streak > 0
        ? appState.profile.streak
        : computeLocalStreak();
    // Cache the computed streak back into appState for use by toast messages
    if (displayStreak > appState.profile.streak) {
        appState.profile.streak = displayStreak;
    }
    
    // Profile Updates
    document.getElementById("header-student-name").textContent = appState.profile.name;
    document.getElementById("dash-target-goal").textContent = `${appState.profile.targetGoal}%`;
    const targetGoal2El = document.getElementById("dash-target-goal-2");
    if (targetGoal2El) targetGoal2El.textContent = `${appState.profile.targetGoal}%`;

    // Streak display with tiered visual feedback
    const streakEl = document.getElementById("dash-streak-count");
    const streakIconContainer = document.getElementById("dash-streak-icon-container");
    if (streakEl) {
        streakEl.textContent = `${displayStreak} Day${displayStreak !== 1 ? 's' : ''}`;
        // Color the streak text + icon based on milestone tiers
        if (displayStreak >= 30) {
            streakEl.style.color = "#ff9800"; // legendary orange
            streakEl.style.textShadow = "0 0 12px rgba(255, 152, 0, 0.6)";
            if (streakIconContainer) {
                streakIconContainer.style.background = "rgba(255, 152, 0, 0.15)";
                streakIconContainer.style.color = "#ff9800";
                streakIconContainer.style.boxShadow = "0 0 16px rgba(255, 152, 0, 0.4)";
                streakIconContainer.style.animation = "pulse 1.5s ease-in-out infinite";
            }
        } else if (displayStreak >= 14) {
            streakEl.style.color = "#ffb3ae"; // hot red-pink
            streakEl.style.textShadow = "0 0 10px rgba(255, 100, 80, 0.5)";
            if (streakIconContainer) {
                streakIconContainer.style.background = "rgba(255, 100, 80, 0.15)";
                streakIconContainer.style.color = "#ffb3ae";
                streakIconContainer.style.boxShadow = "0 0 12px rgba(255, 100, 80, 0.3)";
                streakIconContainer.style.animation = "";
            }
        } else if (displayStreak >= 7) {
            streakEl.style.color = "#40e56c"; // warm green
            streakEl.style.textShadow = "0 0 8px rgba(64, 229, 108, 0.4)";
            if (streakIconContainer) {
                streakIconContainer.style.background = "rgba(64, 229, 108, 0.15)";
                streakIconContainer.style.color = "#40e56c";
                streakIconContainer.style.boxShadow = "0 0 8px rgba(64, 229, 108, 0.25)";
                streakIconContainer.style.animation = "";
            }
        } else if (displayStreak > 0) {
            streakEl.style.color = "#cdbdff"; // default primary
            streakEl.style.textShadow = "";
            if (streakIconContainer) {
                streakIconContainer.style.background = "";
                streakIconContainer.style.color = "";
                streakIconContainer.style.boxShadow = "";
                streakIconContainer.style.animation = "";
            }
        } else {
            streakEl.style.color = "";
            streakEl.style.textShadow = "";
            if (streakIconContainer) {
                streakIconContainer.style.background = "";
                streakIconContainer.style.color = "";
                streakIconContainer.style.boxShadow = "";
                streakIconContainer.style.animation = "";
            }
        }
    }
    
    // Overall Stats
    document.getElementById("dash-total-classes").textContent = global.total;
    document.getElementById("dash-present-classes").textContent = global.present;
    document.getElementById("dash-absent-classes").textContent = global.absent;
    
    // Ring Animation
    const circle = document.getElementById("dashboard-progress-circle");
    const pctEl = document.getElementById("dash-overall-percent");
    
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const targetPercent = global.percentage;
    const offset = circumference - (targetPercent / 100 * circumference);
    
    // Animate radial track and number counter
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
    }, 200);
    
    let currentCount = 0;
    const countDuration = 800;
    const startTime = performance.now();
    
    function animateCount(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / countDuration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        currentCount = Math.floor(ease * targetPercent);
        pctEl.textContent = currentCount;
        if (progress < 1) {
            requestAnimationFrame(animateCount);
        } else {
            pctEl.textContent = targetPercent;
        }
    }
    requestAnimationFrame(animateCount);
    
    // Bunks Analysis Card
    const analysis = runBunkAnalyzer();
    const bunkTitle = document.getElementById("dash-safe-bunks-title");
    const bunkDesc = document.getElementById("dash-safe-bunks-desc");
    const bunkBar = document.getElementById("dash-safe-bunks-bar");
    
    bunkTitle.textContent = analysis.text;
    bunkDesc.textContent = analysis.desc;
    
    if (analysis.type === "safe") {
        bunkBar.className = "h-full bg-secondary w-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(64,229,108,0.4)]";
        bunkTitle.className = "font-headline-lg-mobile text-[22px] text-secondary font-extrabold";
    } else if (analysis.type === "risk") {
        bunkBar.className = "h-full bg-error w-[30%] rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(255,82,82,0.4)]";
        bunkTitle.className = "font-headline-lg-mobile text-[22px] text-error font-extrabold";
    } else {
        bunkBar.className = "h-full bg-outline w-[10%] rounded-full";
        bunkTitle.className = "font-headline-lg-mobile text-[22px] text-on-surface-variant font-extrabold";
    }
    
    // Next Class Card
    const nextClass = getNextScheduledClass();
    const nextNameEl = document.getElementById("dash-next-class-name");
    const nextTimeEl = document.getElementById("dash-next-class-time");
    const nextCountdownEl = document.getElementById("dash-next-class-countdown");
    const markBtn = document.getElementById("dash-mark-present-btn");
    
    if (nextClass) {
        nextNameEl.textContent = nextClass.subject;
        nextTimeEl.textContent = `${formatTimeAmPm(nextClass.start)} - ${formatTimeAmPm(nextClass.end)} | ${nextClass.room}`;
        
        // Calculate minutes remaining
        const now = new Date();
        const startParts = nextClass.start.split(":");
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const diff = startMinutes - currentMinutes;
        
        if (diff > 0 && diff < 60) {
            nextCountdownEl.textContent = `IN ${diff} MIN`;
            nextCountdownEl.className = "bg-primary/20 text-primary text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse";
        } else if (diff <= 0) {
            nextCountdownEl.textContent = `ONGOING`;
            nextCountdownEl.className = "bg-secondary/20 text-secondary text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider";
        } else {
            const hrs = Math.floor(diff / 60);
            nextCountdownEl.textContent = `IN ${hrs} HR`;
            nextCountdownEl.className = "bg-primary/20 text-primary text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider";
        }
        
        markBtn.classList.remove("hidden");
        // Bind button click to quick mark present
        markBtn.onclick = () => {
            quickMarkClassPresent(nextClass.subject, nextClass.start, nextClass.end);
        };
    } else {
        nextNameEl.textContent = "No Upcoming Classes";
        nextTimeEl.textContent = "Your timetable is clear for today.";
        nextCountdownEl.textContent = "COMPLETED";
        nextCountdownEl.className = "bg-surface-container-highest text-on-surface-variant text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider";
        markBtn.classList.add("hidden");
    }
}

function formatTimeAmPm(timeStr) {
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour is 12
    return `${hours}:${minutes} ${ampm}`;
}

// Quick action from dashboard card
async function quickMarkClassPresent(subject, start, end) {
    const todayStr = formatDateKey(new Date());
    if (!appState.attendanceLogs[todayStr]) {
        const dayIdx = new Date().getDay();
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const todayDayStr = weekdays[dayIdx];
        const dayClasses = appState.timetable.filter(c => c.day === todayDayStr);
        appState.attendanceLogs[todayStr] = dayClasses.map(c => ({
            subject: c.subject, start: c.start, end: c.end, status: "upcoming", color: c.color
        }));
    }
    
    const record = appState.attendanceLogs[todayStr].find(c => c.subject === subject && c.start === start);
    if (record) {
        record.status = "present";
        
        try {
            await fetch(`${API_BASE_URL}/attendance/mark`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    ...getAuthHeaders()
                },
                body: JSON.stringify({
                    date: todayStr,
                    subject_name: subject,
                    start: start,
                    status: "present"
                })
            });
            // Re-fetch streak from backend
            await refreshStreakFromBackend();
        } catch (e) {
            console.error("Failed to sync attendance", e);
        }
        
        showToast("Attendance Marked", `Logged "Present" for ${subject}. Streak: ${appState.profile.streak} days!`, "check_circle");
        renderDashboard();
    }
}

// Re-fetches streak (and other profile stats) from /state without full reload
async function refreshStreakFromBackend() {
    try {
        const res = await fetch(`${API_BASE_URL}/state`, { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            appState.profile.streak = data.profile.streak;
        }
    } catch (e) {
        console.warn("Could not refresh streak from backend", e);
    }
}

// --- B. DAILY ATTENDANCE TAB ---
let activeDailyDayOffset = 0; // 0 represents today, -1 is yesterday, etc.

function initDailyTab() {
    activeDailyDayOffset = 0; // Reset to today
    renderDailyWeekTabs();
    renderDailyScheduleList();
}

function renderDailyWeekTabs() {
    const container = document.getElementById("daily-week-tabs");
    container.innerHTML = "";
    
    const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const today = new Date();
    
    // Render 6 days of the current week (Mon - Sat)
    // Find Monday of the current week
    const currentDayIdx = today.getDay();
    const monday = new Date(today);
    const offsetToMon = currentDayIdx === 0 ? -6 : 1 - currentDayIdx; // Adjust to monday
    monday.setDate(today.getDate() + offsetToMon);
    
    for (let i = 0; i < 6; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        
        const dateStr = d.getDate();
        const dayStr = weekdays[d.getDay()];
        const dKey = formatDateKey(d);
        const todayKey = formatDateKey(today);
        
        const isSelected = formatDateKey(new Date(today.getTime() + activeDailyDayOffset * 86400000)) === dKey;
        
        const btn = document.createElement("button");
        btn.className = isSelected 
            ? "flex-shrink-0 flex flex-col items-center p-2.5 rounded-2xl bg-primary-container text-on-primary-container border border-primary/40 shadow-sm w-12"
            : "flex-shrink-0 flex flex-col items-center p-2.5 rounded-2xl bg-surface-container border border-outline-variant w-12 hover:border-primary/50 transition-colors";
        
        // Status indicator dot (green for high attendance, red for missing, grey for empty)
        let indicatorHtml = '<div class="w-1.5 h-1.5 bg-outline-variant rounded-full mt-1"></div>';
        if (appState.attendanceLogs[dKey]) {
            const dayRecords = appState.attendanceLogs[dKey];
            const hasAbsent = dayRecords.some(r => r.status === "absent");
            const hasPresent = dayRecords.some(r => r.status === "present");
            if (hasAbsent) {
                indicatorHtml = '<div class="w-1.5 h-1.5 bg-error rounded-full mt-1 animate-pulse"></div>';
            } else if (hasPresent) {
                indicatorHtml = '<div class="w-1.5 h-1.5 bg-secondary rounded-full mt-1"></div>';
            }
        }
        
        btn.innerHTML = `
            <span class="text-[9px] font-semibold opacity-70">${dayStr}</span>
            <span class="text-[14px] font-extrabold mt-0.5">${dateStr}</span>
            ${indicatorHtml}
        `;
        
        btn.onclick = () => {
            const timeDiff = d.getTime() - today.getTime();
            activeDailyDayOffset = Math.round(timeDiff / 86400000);
            renderDailyWeekTabs();
            renderDailyScheduleList();
        };
        
        container.appendChild(btn);
    }
}

function renderDailyScheduleList() {
    const listBox = document.getElementById("daily-classes-list-container");
    listBox.innerHTML = "";
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + activeDailyDayOffset);
    const dateKey = formatDateKey(targetDate);
    
    // Header label update
    const option = { weekday: 'long', month: 'short', day: 'numeric' };
    document.getElementById("daily-header-date").textContent = targetDate.toLocaleDateString('en-US', option);
    
    // Check if we have logs for this day. If not, check if it's a weekday and pull timetable
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = weekdays[targetDate.getDay()];
    
    if (dayName === "Sun") {
        listBox.innerHTML = `
            <div class="text-center py-10 glass-card rounded-3xl p-6">
                <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">bedtime</span>
                <p class="text-on-surface-variant font-bold text-[14px] mt-2">Sunday Holiday</p>
                <p class="text-[11px] text-on-surface-variant/80 mt-1">No lectures scheduled today. Enjoy your weekend!</p>
            </div>
        `;
        document.getElementById("daily-marked-ratio").textContent = "Holiday";
        document.getElementById("daily-schedule-progress-bar").style.width = "100%";
        return;
    }
    
    let dayRecords = appState.attendanceLogs[dateKey];
    
    if (!dayRecords) {
        // Populated from timetable
        const dayClasses = appState.timetable.filter(c => c.day === dayName);
        if (dayClasses.length === 0) {
            listBox.innerHTML = `
                <div class="text-center py-10 glass-card rounded-3xl p-6">
                    <span class="material-symbols-outlined text-[48px] text-on-surface-variant/40">event_busy</span>
                    <p class="text-on-surface-variant font-bold text-[14px] mt-2">No Scheduled Classes</p>
                    <p class="text-[11px] text-on-surface-variant/80 mt-1">Your timetable has no lectures configured for ${dayName}s.</p>
                </div>
            `;
            document.getElementById("daily-marked-ratio").textContent = "0/0 Classes";
            document.getElementById("daily-schedule-progress-bar").style.width = "0%";
            return;
        }
        dayRecords = dayClasses.map(c => ({
            subject: c.subject,
            start: c.start,
            end: c.end,
            status: "upcoming"
        }));
        
        appState.attendanceLogs[dateKey] = dayRecords;
    }
    
    // Sort chronologically
    dayRecords.sort((a, b) => a.start.localeCompare(b.start));
    
    let markedCount = 0;
    dayRecords.forEach((rec, idx) => {
        if (rec.status !== "upcoming") markedCount++;
        
        const card = document.createElement("div");
        
        // Use subject color for left border accent
        const subjectObj = appState.subjects.find(s => s.name === rec.subject);
        const subjectColor = subjectObj ? subjectObj.color : rec.color || "#cdbdff";
        
        // Dynamic card styles
        let borderAccent = "bg-primary";
        let statusBadge = `<span class="px-2.5 py-0.5 bg-surface-container-highest text-on-surface-variant rounded-full text-[10px] uppercase font-bold tracking-wider">Upcoming</span>`;
        
        if (rec.status === "present") {
            borderAccent = "bg-secondary shadow-[0_0_8px_rgba(64,229,108,0.4)]";
            statusBadge = `<span class="px-2.5 py-0.5 bg-secondary/15 text-secondary rounded-full text-[10px] uppercase font-bold tracking-wider border border-secondary/20">Present</span>`;
        } else if (rec.status === "absent") {
            borderAccent = "bg-error shadow-[0_0_8px_rgba(255,82,82,0.4)]";
            statusBadge = `<span class="px-2.5 py-0.5 bg-error/15 text-error rounded-full text-[10px] uppercase font-bold tracking-wider border border-error/20">Absent</span>`;
        } else if (rec.status === "cancelled") {
            borderAccent = "bg-tertiary shadow-[0_0_8px_rgba(255,179,174,0.4)]";
            statusBadge = `<span class="px-2.5 py-0.5 bg-tertiary/15 text-on-tertiary-container rounded-full text-[10px] uppercase font-bold tracking-wider border border-tertiary/20">Cancelled</span>`;
        } else if (rec.status === "holiday") {
            borderAccent = "bg-outline-variant";
            statusBadge = `<span class="px-2.5 py-0.5 bg-outline-variant/15 text-on-surface-variant rounded-full text-[10px] uppercase font-bold tracking-wider border border-outline-variant/20">Holiday</span>`;
        }
        
        card.className = "relative bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden p-4 transition-all duration-300 transform translate-y-2 opacity-0 animate-fade-in-up";
        card.style.animationDelay = `${idx * 0.08}s`;
        card.style.borderLeftColor = subjectColor;
        card.style.borderLeftWidth = "4px";
        card.style.borderLeftStyle = "solid";
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-bold text-[15px] leading-tight text-on-surface">${rec.subject}</h3>
                    <div class="flex items-center gap-1.5 mt-1 text-on-surface-variant">
                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                        <span class="text-[12px] font-label-md">${formatTimeAmPm(rec.start)} - ${formatTimeAmPm(rec.end)}</span>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
            
            <!-- Quick status logger buttons -->
            <div class="grid grid-cols-4 gap-1.5 mt-3 pt-2 border-t border-outline-variant/30">
                <button class="${rec.status === 'present' ? 'bg-secondary text-zinc-950 font-bold shadow-[0_0_10px_rgba(64,229,108,0.4)]' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-[9px] active:scale-95 transition-all" onclick="updateRecordStatus('${dateKey}', '${rec.subject}', '${rec.start}', 'present')">
                    <span class="material-symbols-outlined text-[16px]">${rec.status === 'present' ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span>PRESENT</span>
                </button>
                <button class="${rec.status === 'absent' ? 'bg-error text-zinc-950 font-bold shadow-[0_0_10px_rgba(255,82,82,0.4)]' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-[9px] active:scale-95 transition-all" onclick="updateRecordStatus('${dateKey}', '${rec.subject}', '${rec.start}', 'absent')">
                    <span class="material-symbols-outlined text-[16px]">${rec.status === 'absent' ? 'cancel' : 'radio_button_unchecked'}</span>
                    <span>ABSENT</span>
                </button>
                <button class="${rec.status === 'cancelled' ? 'bg-tertiary text-zinc-950 font-bold shadow-[0_0_10px_rgba(255,179,174,0.4)]' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-[9px] active:scale-95 transition-all" onclick="updateRecordStatus('${dateKey}', '${rec.subject}', '${rec.start}', 'cancelled')">
                    <span class="material-symbols-outlined text-[16px]">event_busy</span>
                    <span>CANCEL</span>
                </button>
                <button class="${rec.status === 'holiday' ? 'bg-on-surface-variant text-zinc-950 font-bold' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-[9px] active:scale-95 transition-all" onclick="updateRecordStatus('${dateKey}', '${rec.subject}', '${rec.start}', 'holiday')">
                    <span class="material-symbols-outlined text-[16px]">festival</span>
                    <span>HOLIDAY</span>
                </button>
            </div>
        `;
        
        listBox.appendChild(card);
    });
    
    // Ratio & Progress update
    const totalCount = dayRecords.length;
    document.getElementById("daily-marked-ratio").textContent = `${markedCount}/${totalCount} Marked`;
    
    const pct = totalCount > 0 ? (markedCount / totalCount) * 100 : 0;
    document.getElementById("daily-schedule-progress-bar").style.width = `${pct}%`;
}

async function updateRecordStatus(dateKey, subject, start, status) {
    const list = appState.attendanceLogs[dateKey];
    if (list) {
        const record = list.find(r => r.subject === subject && r.start === start);
        if (record) {
            record.status = status;
            
            try {
                await fetch(`${API_BASE_URL}/attendance/mark`, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        ...getAuthHeaders()
                    },
                    body: JSON.stringify({
                        date: dateKey,
                        subject_name: subject,
                        start: start,
                        status: status
                    })
                });
                // Re-fetch streak after any status change
                await refreshStreakFromBackend();
            } catch (e) {
                console.error("Failed to sync attendance", e);
            }
            
            renderDailyScheduleList();
            // Also update calendar month stats if needed
            renderCalendarMonthStats();
            showToast("Log Updated", `Marked ${subject} as ${status.toUpperCase()}.`, "done");
        }
    }
}

// --- C. ANALYTICS VIEW ---
async function renderAnalytics() {
    let detailedData = null;
    try {
        const response = await fetch(`${API_BASE_URL}/analytics/detailed`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            detailedData = await response.json();
        }
    } catch (e) {
        console.error("Could not fetch detailed analytics, using client-side fallback calculations", e);
    }

    const subjectStats = detailedData ? detailedData.subjects : calculateSubjectAttendance();
    
    // Subject progress bars rendering
    const subjectsBox = document.getElementById("analytics-subjects-list");
    subjectsBox.innerHTML = "";
    
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        
        const row = document.createElement("div");
        let accentBorder = "border-l-primary";
        let fillProgressColor = "bg-primary";
        let warningBadge = "";
        
        // Highlight logic for low attendance (< 75%)
        if (stats.percent < appState.profile.targetGoal && stats.total > 0) {
            accentBorder = "border-l-error";
            fillProgressColor = "bg-error";
            warningBadge = `
                <div class="flex items-center gap-0.5 text-error text-[10px] font-bold uppercase animate-pulse">
                    <span class="material-symbols-outlined text-[12px]">priority_high</span> Critical
                </div>
            `;
        } else if (stats.percent >= 85) {
            accentBorder = "border-l-secondary";
            fillProgressColor = "bg-secondary";
        }
        
        row.className = `glass-card p-3 rounded-2xl flex items-center gap-3 border-l-4 ${accentBorder} transition-all duration-300`;
        row.innerHTML = `
            <div class="flex-1 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-[13px] text-on-surface">${name}</span>
                    <span class="text-[12px] font-extrabold text-on-surface">${stats.percent}%</span>
                </div>
                <div class="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                    <div class="h-full ${fillProgressColor} rounded-full progress-fill-animate" style="width: ${stats.percent}%"></div>
                </div>
                <div class="flex justify-between items-center text-[10px] text-on-surface-variant font-label-sm">
                    <span>${stats.present} present / ${stats.absent} absent</span>
                    <span>${stats.code}</span>
                </div>
            </div>
            ${warningBadge}
        `;
        subjectsBox.appendChild(row);
    });
    
    // Heatmap Activity Grid Generation (last 16 weeks)
    const heatmapBox = document.getElementById("heatmap-grid-container");
    heatmapBox.innerHTML = "";
    
    const intensities = [
        "bg-surface-container-highest/60 text-surface-container-highest", 
        "bg-secondary/20 text-secondary-fixed-dim/40", 
        "bg-secondary/40 text-secondary-fixed-dim/60", 
        "bg-secondary/70 text-secondary-fixed-dim/80", 
        "bg-secondary text-secondary"
    ];
    
    // Construct calendar matrix for last 16 weeks (columns = 16, rows = 7 days)
    const today = new Date();
    const sixteenWeeksAgo = new Date();
    sixteenWeeksAgo.setDate(today.getDate() - 16 * 7);
    
    // Align to Monday of that week
    const firstDayIndex = sixteenWeeksAgo.getDay();
    const mondayOffset = firstDayIndex === 0 ? -6 : 1 - firstDayIndex;
    sixteenWeeksAgo.setDate(sixteenWeeksAgo.getDate() + mondayOffset);

    for (let c = 0; c < 16; c++) {
        const col = document.createElement("div");
        col.className = "flex flex-col gap-1";
        
        for (let r = 0; r < 7; r++) {
            const cellDate = new Date(sixteenWeeksAgo);
            cellDate.setDate(sixteenWeeksAgo.getDate() + (c * 7 + r));
            const dateStr = formatDateKey(cellDate);
            
            let level = 0;
            if (detailedData && detailedData.heatmap && detailedData.heatmap[dateStr] !== undefined) {
                level = detailedData.heatmap[dateStr];
            } else {
                // Client-side fallback: check local attendance logs
                const logs = appState.attendanceLogs[dateStr];
                if (logs && logs.length > 0) {
                    const present = logs.filter(l => l.status === "present").length;
                    const total = logs.filter(l => l.status === "present" || l.status === "absent").length;
                    if (total > 0) {
                        const pct = present / total;
                        level = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
                    }
                }
            }
            
            const intensityClass = intensities[level];
            const cell = document.createElement("div");
            cell.className = `w-2 h-2 rounded-[1.5px] ${intensityClass} transition-all duration-300 hover:scale-150 hover:z-10 hover:shadow-[0_0_8px_currentColor] cursor-pointer`;
            cell.title = `${cellDate.toLocaleDateString()}: level ${level}`;
            col.appendChild(cell);
        }
        heatmapBox.appendChild(col);
    }
    
    // Bento insights
    const analysis = runBunkAnalyzer();
    document.getElementById("analytics-bunk-limit-insight").textContent = analysis.type === "safe" ? `${analysis.count} Bunks` : "0 Bunks";
    document.getElementById("analytics-goal-diff-insight").textContent = analysis.type === "safe" ? "On Track" : "Action Req.";
    
    // Weekly Trend SVG Line Chart Loader
    const trendValues = detailedData && detailedData.weekly_trend ? detailedData.weekly_trend : [72, 75, 71, 79, 83, 82];
    renderWeeklyTrendChart(trendValues);

    // Reset prediction inputs to 0
    document.getElementById("predict-attend-input").value = 0;
    document.getElementById("predict-miss-input").value = 0;
    updatePredictionForecast();
}

function renderWeeklyTrendChart(weekValues) {
    const container = document.getElementById("analytics-trend-svg-box");
    container.innerHTML = "";
    
    if (!weekValues || weekValues.length === 0) {
        weekValues = [0, 0, 0, 0, 0, 0];
    }
    
    // Map percentages into SVG coordinate bounds (y-axis inverted, height = 120, width = 360)
    // 0% -> y=110, 100% -> y=10
    const points = weekValues.map((v, idx) => {
        const x = idx * 60 + 30; // Spacing
        const y = 110 - (v / 100 * 90);
        return { x, y };
    });
    
    // Construct Path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        // Curve construction using control points
        const cpX1 = points[i-1].x + 30;
        const cpY1 = points[i-1].y;
        const cpX2 = points[i].x - 30;
        const cpY2 = points[i].y;
        pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
    }
    
    // Filled area path
    const fillD = `${pathD} L ${points[points.length-1].x} 120 L ${points[0].x} 120 Z`;
    
    // Trend difference calculation
    const diff = weekValues[weekValues.length - 1] - weekValues[0];
    const trendText = document.getElementById("analytics-trend-percent");
    trendText.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
    trendText.className = diff >= 0 ? "font-headline-md text-[18px] text-secondary font-extrabold flex items-center gap-1" : "font-headline-md text-[18px] text-error font-extrabold flex items-center gap-1";
    
    const svgHtml = `
        <svg class="w-full h-full overflow-visible" viewBox="0 0 360 120">
            <defs>
                <linearGradient id="trend-fill-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#40e56c;stop-opacity:0.25"></stop>
                    <stop offset="100%" style="stop-color:#40e56c;stop-opacity:0"></stop>
                </linearGradient>
            </defs>
            <!-- Gradient underlay -->
            <path d="${fillD}" fill="url(#trend-fill-gradient)"></path>
            <!-- Main Path -->
            <path class="chart-path" d="${pathD}" fill="none" stroke="#40e56c" stroke-width="3" stroke-linecap="round"></path>
            <!-- Highlight Points -->
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" fill="#40e56c" r="3.5" stroke="#131313" stroke-width="1.5"></circle>`).join("")}
        </svg>
    `;
    container.innerHTML = svgHtml;
}

// AI Attendance Prediction Forecast Handler
async function updatePredictionForecast() {
    const attendVal = parseInt(document.getElementById("predict-attend-input").value) || 0;
    const missVal = parseInt(document.getElementById("predict-miss-input").value) || 0;
    
    const percentEl = document.getElementById("prediction-result-percent");
    const statusEl = document.getElementById("prediction-result-status");
    
    try {
        const response = await fetch(`${API_BASE_URL}/analytics/prediction?missed=${missVal}&attended=${attendVal}`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            percentEl.textContent = `${data.predicted_percent.toFixed(1)}%`;
            
            if (attendVal === 0 && missVal === 0) {
                statusEl.textContent = "No Input";
                statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-highest text-on-surface-variant";
            } else if (data.will_reach_target) {
                statusEl.textContent = "Target Met";
                statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(64,229,108,0.2)]";
            } else {
                statusEl.textContent = "Below Target";
                statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20 shadow-[0_0_8px_rgba(255,82,82,0.2)]";
            }
            return;
        }
    } catch (e) {
        console.error("Failed to query prediction API, running local simulation fallback", e);
    }
    
    // Local Simulation Fallback
    const global = calculateGlobalAttendance();
    const target = appState.profile.targetGoal;
    
    const newPresent = global.present + attendVal;
    const newTotal = global.total + attendVal + missVal;
    const newPercent = newTotal > 0 ? (newPresent / newTotal * 100) : 0;
    
    percentEl.textContent = `${newPercent.toFixed(1)}%`;
    if (attendVal === 0 && missVal === 0) {
        statusEl.textContent = "No Input";
        statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-highest text-on-surface-variant";
    } else if (newPercent >= target) {
        statusEl.textContent = "Target Met";
        statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(64,229,108,0.2)]";
    } else {
        statusEl.textContent = "Below Target";
        statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20 shadow-[0_0_8px_rgba(255,82,82,0.2)]";
    }
}

// --- D. SCHEDULE (TIMETABLE & CALENDAR) ---
let activeTimetableDay = "Mon";

function renderTimetableDayList() {
    const selector = document.getElementById("timetable-day-selector");
    selector.innerHTML = "";
    
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    days.forEach(d => {
        const btn = document.createElement("button");
        const isActive = activeTimetableDay === d;
        btn.className = isActive 
            ? "px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-bold text-[12px] whitespace-nowrap shadow-[0_0_12px_rgba(124,77,255,0.3)] transition-all"
            : "px-5 py-2 rounded-full bg-surface-container text-on-surface-variant font-bold text-[12px] whitespace-nowrap border border-outline-variant hover:border-primary/50 transition-all";
        btn.textContent = d;
        btn.onclick = () => {
            activeTimetableDay = d;
            renderTimetableDayList();
            renderTimetableClasses();
        };
        selector.appendChild(btn);
    });
    
    renderTimetableClasses();
}

function renderTimetableClasses() {
    const listBox = document.getElementById("timetable-classes-list");
    listBox.innerHTML = "";
    
    const dayClasses = appState.timetable.filter(c => c.day === activeTimetableDay);
    dayClasses.sort((a, b) => a.start.localeCompare(b.start));
    
    // Period Grid Mode Rendering
    if (appState.timetableMode === "periods") {
        const PERIOD_SLOTS = [
            { id: "P1", name: "Period 1", start: "09:00", end: "10:00" },
            { id: "P2", name: "Period 2", start: "10:00", end: "11:00" },
            { id: "P3", name: "Period 3", start: "11:00", end: "12:00" },
            { id: "Lunch", name: "Lunch Break", start: "12:00", end: "13:00" },
            { id: "P4", name: "Period 4", start: "13:00", end: "14:00" },
            { id: "P5", name: "Period 5", start: "14:00", end: "15:00" },
            { id: "P6", name: "Period 6", start: "15:00", end: "16:00" },
            { id: "P7", name: "Period 7", start: "16:00", end: "17:00" }
        ];
        
        PERIOD_SLOTS.forEach((slot, index) => {
            // Find class that matches slot times
            const c = dayClasses.find(cls => cls.start === slot.start && cls.end === slot.end);
            const card = document.createElement("div");
            
            if (c) {
                const subjectObj = appState.subjects.find(s => s.name === c.subject);
                const subColor = subjectObj ? subjectObj.color : "#cdbdff";
                
                card.className = "glass-card rounded-2xl p-4 relative group overflow-hidden border-l-4 transition-all duration-300 transform translate-y-2 opacity-0 animate-fade-in-up";
                card.style.borderLeftColor = subColor;
                card.style.animationDelay = `${index * 0.05}s`;
                
                const classIdx = dayClasses.indexOf(c);
                
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <div class="flex items-center gap-1.5 text-primary font-bold text-[11px] mb-0.5" style="color: ${subColor}">
                                <span class="material-symbols-outlined text-[14px]">schedule</span>
                                ${slot.name} (${formatTimeAmPm(c.start)} - ${formatTimeAmPm(c.end)})
                            </div>
                            <h3 class="font-extrabold text-[15px] text-on-surface leading-tight">${c.subject}</h3>
                        </div>
                        <!-- Actions -->
                        <div class="flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button onclick="editClassRecord('${activeTimetableDay}', ${classIdx})" class="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-all"><span class="material-symbols-outlined text-[16px] block">edit</span></button>
                            <button onclick="deleteClassRecord('${activeTimetableDay}', ${classIdx})" class="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded-lg transition-all"><span class="material-symbols-outlined text-[16px] block">delete</span></button>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                        <span class="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-[9px] font-bold uppercase tracking-wider">${c.room}</span>
                        <span class="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style="background-color: ${subColor}15; color: ${subColor}">${c.type}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant border border-outline-variant/30">
                            <span class="material-symbols-outlined text-[14px]">person</span>
                        </div>
                        <span class="text-[12px] font-label-md text-on-surface-variant leading-none">${c.prof}</span>
                    </div>
                `;
            } else {
                card.className = "border border-dashed border-outline-variant/40 rounded-2xl p-4 flex items-center justify-between bg-surface-container/10 transition-all duration-300 transform translate-y-2 opacity-0 animate-fade-in-up";
                card.style.animationDelay = `${index * 0.05}s`;
                
                if (slot.id === "Lunch") {
                    card.className = "border border-dashed border-primary/20 rounded-2xl p-3 flex items-center justify-between bg-primary/5 transition-all duration-300 transform translate-y-2 opacity-0 animate-fade-in-up";
                    card.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-[18px]">restaurant</span>
                            <div>
                                <p class="text-[10px] text-primary font-bold uppercase tracking-wider">${slot.name}</p>
                                <p class="text-[11px] text-on-surface-variant font-label-md mt-0.5">${formatTimeAmPm(slot.start)} - ${formatTimeAmPm(slot.end)}</p>
                            </div>
                        </div>
                        <span class="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Recess</span>
                    `;
                } else {
                    card.innerHTML = `
                        <div>
                            <p class="text-[10px] text-outline font-bold uppercase tracking-wider">${slot.name}</p>
                            <p class="text-[12px] font-semibold text-on-surface-variant mt-1">${formatTimeAmPm(slot.start)} - ${formatTimeAmPm(slot.end)}</p>
                            <p class="text-[11px] text-outline/65 mt-0.5">Free Slot / No Class</p>
                        </div>
                        <button onclick="openAddClassModalForSlot('${slot.id}')" class="p-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl transition-all">
                            <span class="material-symbols-outlined text-[16px] block">add</span>
                        </button>
                    `;
                }
            }
            listBox.appendChild(card);
        });
        return;
    }
    
    // Chronological List Mode Rendering
    if (dayClasses.length === 0) {
        listBox.innerHTML = `
            <div class="text-center py-10 border border-dashed border-outline-variant rounded-2xl p-4">
                <span class="material-symbols-outlined text-[36px] text-on-surface-variant/40">event_busy</span>
                <p class="font-bold text-[13px] text-on-surface-variant mt-2">No Classes on ${activeTimetableDay}</p>
                <p class="text-[10px] text-on-surface-variant/70 mt-1">Configure classes manually or import via PDF upload.</p>
            </div>
        `;
        return;
    }
    
    dayClasses.sort((a, b) => a.start.localeCompare(b.start));
    
    dayClasses.forEach((c, index) => {
        const card = document.createElement("div");
        const subjectObj = appState.subjects.find(s => s.name === c.subject);
        const subColor = subjectObj ? subjectObj.color : "#cdbdff";
        
        card.className = "glass-card rounded-2xl p-4 relative group overflow-hidden border-l-4 transition-all duration-300 transform translate-y-2 opacity-0 animate-fade-in-up";
        card.style.borderLeftColor = subColor;
        card.style.animationDelay = `${index * 0.08}s`;
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-1.5 text-primary font-bold text-[11px] mb-0.5" style="color: ${subColor}">
                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                        ${formatTimeAmPm(c.start)} - ${formatTimeAmPm(c.end)}
                    </div>
                    <h3 class="font-extrabold text-[15px] text-on-surface leading-tight">${c.subject}</h3>
                </div>
                <!-- Actions -->
                <div class="flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button onclick="editClassRecord('${activeTimetableDay}', ${index})" class="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-all"><span class="material-symbols-outlined text-[16px] block">edit</span></button>
                    <button onclick="deleteClassRecord('${activeTimetableDay}', ${index})" class="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded-lg transition-all"><span class="material-symbols-outlined text-[16px] block">delete</span></button>
                </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-3">
                <span class="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-[9px] font-bold uppercase tracking-wider">${c.room}</span>
                <span class="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style="background-color: ${subColor}15; color: ${subColor}">${c.type}</span>
            </div>
            <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant border border-outline-variant/30">
                    <span class="material-symbols-outlined text-[14px]">person</span>
                </div>
                <span class="text-[12px] font-label-md text-on-surface-variant leading-none">${c.prof}</span>
            </div>
        `;
        listBox.appendChild(card);
    });
}

// Delete class from timetable
function deleteClassRecord(day, index) {
    if (confirm("Are you sure you want to delete this class from your timetable?")) {
        const dayClasses = appState.timetable.filter(c => c.day === day);
        dayClasses.sort((a, b) => a.start.localeCompare(b.start));
        const targetClass = dayClasses[index];
        
        const masterIdx = appState.timetable.findIndex(c => 
            c.day === day && c.subject === targetClass.subject && c.start === targetClass.start
        );
        
        if (masterIdx > -1) {
            appState.timetable.splice(masterIdx, 1);
            saveStateToLocalStorage();
            renderTimetableClasses();
            showToast("Class Deleted", `Removed class from your ${day} schedule.`, "delete");
        }
    }
}

// Add/Edit manual class handlers
function openAddClassModal() {
    document.getElementById("class-modal-title").textContent = "Add New Class";
    document.getElementById("edit-class-index").value = "-1";
    document.getElementById("add-class-form").reset();
    document.getElementById("form-class-day").value = activeTimetableDay;
    
    const periodSelect = document.getElementById("form-class-period-select");
    if (periodSelect) periodSelect.value = "custom";
    document.getElementById("form-class-start").disabled = false;
    document.getElementById("form-class-end").disabled = false;
    
    toggleModal("addClassModal");
}

function openAddClassModalForSlot(slotId) {
    openAddClassModal();
    document.getElementById("form-class-period-select").value = slotId;
    onClassPeriodSelectChange();
}

function editClassRecord(day, index) {
    const dayClasses = appState.timetable.filter(c => c.day === day);
    dayClasses.sort((a, b) => a.start.localeCompare(b.start));
    const cls = dayClasses[index];
    
    const masterIdx = appState.timetable.findIndex(c => 
        c.day === day && c.subject === cls.subject && c.start === cls.start
    );
    
    document.getElementById("class-modal-title").textContent = "Edit Class Info";
    document.getElementById("edit-class-index").value = masterIdx;
    
    document.getElementById("form-class-day").value = cls.day;
    document.getElementById("form-class-subject").value = cls.subject;
    document.getElementById("form-class-start").value = cls.start;
    document.getElementById("form-class-end").value = cls.end;
    document.getElementById("form-class-room").value = cls.room;
    document.getElementById("form-class-prof").value = cls.prof;
    document.getElementById("form-class-type").value = cls.type;
    
    const periodSelect = document.getElementById("form-class-period-select");
    if (periodSelect) {
        const timeMap = {
            P1: { start: "09:00", end: "10:00" },
            P2: { start: "10:00", end: "11:00" },
            P3: { start: "11:00", end: "12:00" },
            Lunch: { start: "12:00", end: "13:00" },
            P4: { start: "13:00", end: "14:00" },
            P5: { start: "14:00", end: "15:00" },
            P6: { start: "15:00", end: "16:00" },
            P7: { start: "16:00", end: "17:00" }
        };
        let matched = "custom";
        for (const [key, value] of Object.entries(timeMap)) {
            if (cls.start === value.start && cls.end === value.end) {
                matched = key;
                break;
            }
        }
        periodSelect.value = matched;
        onClassPeriodSelectChange();
    }
    
    toggleModal("addClassModal");
}

function saveCustomClass(e) {
    e.preventDefault();
    
    const startInput = document.getElementById("form-class-start");
    const endInput = document.getElementById("form-class-end");
    startInput.disabled = false;
    endInput.disabled = false;
    
    const editIdx = parseInt(document.getElementById("edit-class-index").value);
    
    const newClass = {
        day: document.getElementById("form-class-day").value,
        subject: document.getElementById("form-class-subject").value.trim(),
        start: startInput.value,
        end: endInput.value,
        room: document.getElementById("form-class-room").value.trim() || "N/A",
        prof: document.getElementById("form-class-prof").value.trim() || "Guest Lecturer",
        type: document.getElementById("form-class-type").value
    };
    
    // Validate subject exists in our subjects mapping, if not create color
    const subExists = appState.subjects.some(s => s.name === newClass.subject);
    if (!subExists) {
        const randColors = ["#cdbdff", "#40e56c", "#ffb3ae", "#7c4dff", "#02c953", "#ffdad7"];
        const color = randColors[Math.floor(Math.random() * randColors.length)];
        appState.subjects.push({
            id: "s" + (appState.subjects.length + 1),
            name: newClass.subject,
            code: "CS-" + Math.floor(100 + Math.random() * 900),
            prof: newClass.prof,
            color: color
        });
    }
    
    if (editIdx > -1) {
        // Edit existing
        appState.timetable[editIdx] = newClass;
        showToast("Class Updated", `Modified details for ${newClass.subject}.`, "edit");
    } else {
        // Insert new
        appState.timetable.push(newClass);
        showToast("Class Configured", `Added ${newClass.subject} to your ${newClass.day} schedule.`, "add");
    }
    
    saveStateToLocalStorage();
    toggleModal("addClassModal");
    
    // Refresh view
    activeTimetableDay = newClass.day;
    renderTimetableDayList();
}

// --- E. CALENDAR SUB-TAB VIEW ---
let calendarYear = new Date().getFullYear();
let calendarMonthIdx = new Date().getMonth(); // current month (0-indexed)
let selectedCalendarDateStr = ""; // YYYY-MM-DD

function initCalendarView() {
    const today = new Date();
    // Default to current selection or today
    if (!selectedCalendarDateStr) {
        calendarYear = today.getFullYear();
        calendarMonthIdx = today.getMonth();
        selectedCalendarDateStr = formatDateKey(today);
    }
    
    renderCalendarGrid();
    renderCalendarSelectedDayDetails();
    renderCalendarMonthStats();
}

function changeCalendarMonth(direction) {
    calendarMonthIdx += direction;
    if (calendarMonthIdx > 11) {
        calendarMonthIdx = 0;
        calendarYear++;
    } else if (calendarMonthIdx < 0) {
        calendarMonthIdx = 11;
        calendarYear--;
    }
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById("calendar-month-title").textContent = `${monthNames[calendarMonthIdx]} ${calendarYear}`;
    
    const daysGrid = document.getElementById("calendar-days-grid");
    daysGrid.innerHTML = "";
    
    // Find first day of month and total days
    const firstDay = new Date(calendarYear, calendarMonthIdx, 1);
    const startOffset = firstDay.getDay(); // 0 = Sun, 1 = Mon
    
    const totalDays = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
    const prevTotalDays = new Date(calendarYear, calendarMonthIdx, 0).getDate();
    
    // Draw padding cells for previous month
    for (let i = startOffset - 1; i >= 0; i--) {
        const d = prevTotalDays - i;
        const cell = document.createElement("div");
        cell.className = "h-10 flex flex-col items-center justify-center opacity-25 text-on-surface-variant text-[12px] font-label-md";
        cell.textContent = d;
        daysGrid.appendChild(cell);
    }
    
    // Draw actual calendar cells
    for (let day = 1; day <= totalDays; day++) {
        const cellDate = new Date(calendarYear, calendarMonthIdx, day);
        const dateKey = formatDateKey(cellDate);
        
        const isSelected = selectedCalendarDateStr === dateKey;
        const isToday = formatDateKey(new Date()) === dateKey;
        
        // Highlight leave days
        const isLeaveDay = appState.leavePlans && appState.leavePlans.some(plan => {
            const sDate = new Date(plan.start_date + "T00:00:00");
            const eDate = new Date(plan.end_date + "T00:00:00");
            return cellDate >= sDate && cellDate <= eDate;
        });
        
        const cell = document.createElement("div");
        
        let cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer hover:bg-surface-container-highest/20 rounded-xl transition-colors text-[12px] font-semibold";
        if (isSelected) {
            cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer bg-primary-container/20 rounded-xl border border-primary/40 text-primary font-extrabold shadow-[0_0_8px_rgba(124,77,255,0.2)]";
        } else if (isToday) {
            cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer bg-zinc-900 border border-outline-variant/60 rounded-xl text-on-surface font-extrabold";
        }
        
        if (isLeaveDay && !isSelected) {
            cellClass += " border border-dashed border-primary/40 text-primary bg-primary/5";
        }
        
        cell.className = cellClass;
        
        // Indicator dot markup based on attendance logs
        let dotHtml = "";
        const dayLogs = appState.attendanceLogs[dateKey];
        if (dayLogs && dayLogs.length > 0) {
            const dots = [];
            dayLogs.forEach(rec => {
                if (rec.status === "present") {
                    dots.push('<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>');
                } else if (rec.status === "absent") {
                    dots.push('<span class="w-1.5 h-1.5 rounded-full bg-error"></span>');
                } else if (rec.status === "cancelled") {
                    dots.push('<span class="w-1.5 h-1.5 rounded-full bg-tertiary"></span>');
                } else if (rec.status === "holiday") {
                    dots.push('<span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50"></span>');
                }
            });
            // Show maximum 3 dots in preview
            dotHtml = `<div class="absolute bottom-1 flex gap-0.5 justify-center w-full">${dots.slice(0, 3).join("")}</div>`;
        }
        
        cell.innerHTML = `
            <span>${day}</span>
            ${dotHtml}
        `;
        
        cell.onclick = () => {
            selectedCalendarDateStr = dateKey;
            renderCalendarGrid();
            renderCalendarSelectedDayDetails();
        };
        
        daysGrid.appendChild(cell);
    }
}

function renderCalendarSelectedDayDetails() {
    const detailTitle = document.getElementById("calendar-selected-date-str");
    const detailPill = document.getElementById("calendar-selected-day-pill");
    const classesContainer = document.getElementById("calendar-selected-day-classes");
    
    classesContainer.innerHTML = "";
    
    const selDate = new Date(selectedCalendarDateStr + "T00:00:00");
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    detailTitle.textContent = `${monthNames[selDate.getMonth()]} ${selDate.getDate()}, ${selDate.getFullYear()}`;
    detailPill.textContent = weekdayNames[selDate.getDay()];
    
    // Highlight leaves inside detail panel
    const dayLeave = appState.leavePlans && appState.leavePlans.find(plan => {
        const sDate = new Date(plan.start_date + "T00:00:00");
        const eDate = new Date(plan.end_date + "T00:00:00");
        return selDate >= sDate && selDate <= eDate;
    });
    
    if (dayLeave) {
        const leaveItem = document.createElement("div");
        let typeClass = "leave-personal";
        if (dayLeave.type.toLowerCase() === "medical") typeClass = "leave-medical";
        else if (dayLeave.type.toLowerCase() === "duty") typeClass = "leave-duty";
        else if (dayLeave.type.toLowerCase() === "holiday") typeClass = "leave-holiday";
        
        leaveItem.className = `p-3 rounded-xl flex items-center justify-between mb-3 ${typeClass}`;
        leaveItem.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">event_busy</span>
                <div>
                    <p class="font-bold text-[12px] leading-tight">${dayLeave.title}</p>
                    <p class="text-[9px] uppercase font-bold tracking-wider opacity-85">${dayLeave.type} Leave</p>
                </div>
            </div>
            <span class="text-[9px] font-bold">Planned Absence</span>
        `;
        classesContainer.appendChild(leaveItem);
    }
    
    const dayLogs = appState.attendanceLogs[selectedCalendarDateStr];
    
    if (!dayLogs || dayLogs.length === 0) {
        classesContainer.appendChild(Object.assign(document.createElement("div"), {
            className: "text-center py-4 text-on-surface-variant/60 text-[12px] italic",
            textContent: "No logs recorded for this date."
        }));
        return;
    }
    
    dayLogs.forEach(rec => {
        const item = document.createElement("div");
        item.className = "glass-card rounded-xl p-3.5 flex items-center justify-between";
        
        let statusBadge = `<span class="text-[10px] font-bold text-on-surface-variant/80 uppercase">No Record</span>`;
        let iconClass = "text-on-surface-variant";
        let iconSymbol = "radio_button_unchecked";
        
        if (rec.status === "present") {
            statusBadge = `<span class="text-[10px] font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20 uppercase">Present</span>`;
            iconClass = "text-secondary";
            iconSymbol = "check_circle";
        } else if (rec.status === "absent") {
            statusBadge = `<span class="text-[10px] font-bold text-error bg-error/10 px-2 py-0.5 rounded-full border border-error/20 uppercase">Absent</span>`;
            iconClass = "text-error";
            iconSymbol = "cancel";
        } else if (rec.status === "cancelled") {
            statusBadge = `<span class="text-[10px] font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full border border-tertiary/20 uppercase">Cancelled</span>`;
            iconClass = "text-tertiary";
            iconSymbol = "event_busy";
        } else if (rec.status === "holiday") {
            statusBadge = `<span class="text-[10px] font-bold text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full border border-outline-variant/20 uppercase">Holiday</span>`;
            iconClass = "text-on-surface-variant";
            iconSymbol = "festival";
        }
        
        item.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center ${iconClass}">
                    <span class="material-symbols-outlined text-[20px]">${iconSymbol}</span>
                </div>
                <div>
                    <h4 class="font-bold text-[13px] text-on-surface leading-tight">${rec.subject}</h4>
                    <p class="text-[11px] text-on-surface-variant font-label-sm">${formatTimeAmPm(rec.start)} - ${formatTimeAmPm(rec.end)}</p>
                </div>
            </div>
            <div>
                ${statusBadge}
            </div>
        `;
        classesContainer.appendChild(item);
    });
}

function renderCalendarMonthStats() {
    let present = 0;
    let absent = 0;
    
    const prefix = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, "0")}`;
    
    Object.keys(appState.attendanceLogs).forEach(dateKey => {
        if (dateKey.startsWith(prefix)) {
            appState.attendanceLogs[dateKey].forEach(rec => {
                if (rec.status === "present") present++;
                if (rec.status === "absent") absent++;
            });
        }
    });
    
    const total = present + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    document.getElementById("calendar-month-present-rate").textContent = `${rate}%`;
    document.getElementById("calendar-month-absent-count").textContent = absent;
}

// --- F. PROFILE SETTINGS DIALOG ---
function openProfileModal() {
    document.getElementById("form-profile-name").value = appState.profile.name;
    document.getElementById("form-profile-target").value = appState.profile.targetGoal;
    document.getElementById("form-profile-term").value = appState.profile.term;
    toggleModal("profileModal");
}

async function saveProfileSettings(e) {
    e.preventDefault();
    const name = document.getElementById("form-profile-name").value.trim();
    const targetGoal = parseInt(document.getElementById("form-profile-target").value);
    const term = document.getElementById("form-profile-term").value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/user/profile`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                name: name,
                attendance_goal: targetGoal,
                semester: term
            })
        });
        
        if (response.ok) {
            appState.profile.name = name;
            appState.profile.targetGoal = targetGoal;
            appState.profile.term = term;
            showToast("Profile Saved", "Updated goals and student profile parameters successfully.", "check_circle");
            toggleModal("profileModal");
            // Reload active view
            tabNavigation(currentTab);
        } else {
            showToast("Profile Save Failed", "Could not save profile parameters to backend.", "error");
        }
    } catch (e) {
        console.error("Failed to save profile", e);
        showToast("Error", "Could not connect to backend server", "error");
    }
}

// ============================================================================
// 7. AI OCR TIMETABLE SCAN SIMULATION
// ============================================================================

function runOcrSimulation(scanSource) {
    const loader = document.getElementById("ocr-scanning-loader");
    loader.classList.remove("hidden");
    
    setTimeout(() => {
        loader.classList.add("hidden");
        toggleModal("ocrModal");
        
        // Mocking rich timetable import
        appState.timetable = [
            { day: "Mon", subject: "Advanced Algorithms", start: "09:00", end: "10:30", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
            { day: "Mon", subject: "Data Science Fundamentals", start: "11:00", end: "12:30", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Practical" },
            { day: "Tue", subject: "Cyber Ethics", start: "10:00", end: "11:30", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" },
            { day: "Tue", subject: "Psychology", start: "13:00", end: "14:30", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
            { day: "Wed", subject: "Advanced Algorithms", start: "09:00", end: "10:30", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
            { day: "Wed", subject: "Cloud Computing Lab", start: "14:00", end: "16:00", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Practical" },
            { day: "Thu", subject: "Data Science Fundamentals", start: "11:00", end: "12:30", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Lecture" },
            { day: "Fri", subject: "Psychology", start: "09:30", end: "11:00", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
            { day: "Fri", subject: "Cloud Computing Lab", start: "13:30", end: "15:30", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Hybrid" }
        ];
        
        saveStateToLocalStorage();
        renderTimetableClasses();
        showToast("Timetable Imported", `Successfully processed 9 classes from scanned ${scanSource} via AI OCR.`, "center_focus_strong");
    }, 2000);
}

// ============================================================================
// 8. MOBILE NAV & HAMBURGER MENU
// ============================================================================

function toggleMobileSidebar() {
    const overlay = document.getElementById("mobile-sidebar-overlay");
    if (overlay) overlay.classList.toggle("hidden");
}

// ============================================================================
// 9. LEAVE PLANS BUSINESS LOGIC
// ============================================================================

async function fetchLeavePlans() {
    try {
        const response = await fetch(`${API_BASE_URL}/leave_plans`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            appState.leavePlans = await response.json();
        } else {
            appState.leavePlans = [];
        }
    } catch (e) {
        console.error("Failed to fetch leave plans", e);
        appState.leavePlans = [];
    }
}

async function handleCreateLeavePlan(e) {
    e.preventDefault();
    const title = document.getElementById("leave-plan-title").value.trim();
    const startDate = document.getElementById("leave-plan-start").value;
    const endDate = document.getElementById("leave-plan-end").value;
    const type = document.getElementById("leave-plan-type").value;
    
    if (new Date(startDate) > new Date(endDate)) {
        showToast("Invalid Dates", "Start date cannot be after end date", "error");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/leave_plans`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify({ title, start_date: startDate, end_date: endDate, type })
        });
        
        if (response.ok) {
            showToast("Leave Plan Created", `Planned leave "${title}" added.`, "check_circle");
            toggleModal("leavePlanModal");
            document.getElementById("leave-plan-form").reset();
            await fetchLeavePlans();
            renderLeavePlans();
            if (!document.getElementById("schedule-view-calendar").classList.contains("hidden")) {
                renderCalendarGrid();
            }
        } else {
            const err = await response.json();
            showToast("Failed to Create", err.detail || "Could not save leave plan.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Error", "Could not connect to server.", "error");
    }
}

async function deleteLeavePlan(id) {
    if (!confirm("Are you sure you want to delete this leave plan?")) return;
    try {
        const response = await fetch(`${API_BASE_URL}/leave_plans/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        if (response.ok) {
            showToast("Leave Plan Deleted", "Removed the planned leave.", "delete");
            await fetchLeavePlans();
            renderLeavePlans();
            if (!document.getElementById("schedule-view-calendar").classList.contains("hidden")) {
                renderCalendarGrid();
            }
        } else {
            showToast("Delete Failed", "Could not delete leave plan.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Error", "Could not connect to server.", "error");
    }
}

function renderLeavePlans() {
    const listContainer = document.getElementById("leave-plans-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    if (!appState.leavePlans || appState.leavePlans.length === 0) {
        listContainer.innerHTML = `
            <div class="col-span-2 text-center py-10 glass-card rounded-2xl p-6">
                <span class="material-symbols-outlined text-[48px] text-on-surface-variant/30">event_available</span>
                <p class="text-on-surface-variant text-[13px] mt-2">No leave plans created yet</p>
            </div>
        `;
        return;
    }
    
    appState.leavePlans.forEach((plan, idx) => {
        const card = document.createElement("div");
        card.className = "glass-card rounded-2xl p-5 relative overflow-hidden border border-outline-variant/30 animate-fade-in-up";
        card.style.animationDelay = `${idx * 0.08}s`;
        
        let typeClass = "leave-personal";
        if (plan.type.toLowerCase() === "medical") typeClass = "leave-medical";
        else if (plan.type.toLowerCase() === "duty") typeClass = "leave-duty";
        else if (plan.type.toLowerCase() === "holiday") typeClass = "leave-holiday";
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${typeClass}">
                        ${plan.type}
                    </span>
                    <h3 class="font-extrabold text-[15px] text-on-surface mt-2">${plan.title}</h3>
                </div>
                <button onclick="deleteLeavePlan(${plan.id})" class="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded-lg transition-all animate-pulse-on-hover">
                    <span class="material-symbols-outlined text-[16px] block">delete</span>
                </button>
            </div>
            <div class="flex items-center gap-2 mt-4 text-[12px] text-on-surface-variant font-label-md">
                <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                <span>${new Date(plan.start_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${new Date(plan.end_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// ============================================================================
// 10. NOTIFICATION SYSTEM
// ============================================================================

function loadNotifications() {
    try {
        const stored = localStorage.getItem("attendwise_notifications");
        appState.notifications = stored ? JSON.parse(stored) : [];
    } catch (e) {
        appState.notifications = [];
    }
    updateNotificationBell();
}

function saveNotifications() {
    localStorage.setItem("attendwise_notifications", JSON.stringify(appState.notifications));
    updateNotificationBell();
}

function addNotification(title, message, type = "info") {
    const dateStr = new Date().toISOString().split("T")[0];
    const exists = appState.notifications.some(n => n.title === title && n.message === message && n.date === dateStr);
    if (exists) return;
    
    const notif = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        title,
        message,
        date: dateStr,
        read: false,
        type
    };
    
    appState.notifications.unshift(notif);
    if (appState.notifications.length > 50) appState.notifications.pop();
    
    saveNotifications();
}

function updateNotificationBell() {
    const unreadCount = appState.notifications.filter(n => !n.read).length;
    const badge = document.getElementById("notif-badge");
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}

function toggleNotificationPanel() {
    const panel = document.getElementById("notif-panel");
    if (!panel) return;
    
    const isHidden = panel.classList.contains("hidden");
    if (isHidden) {
        renderNotificationsList();
        panel.classList.remove("hidden");
    } else {
        panel.classList.add("hidden");
    }
}

// Close notifications when clicking outside
document.addEventListener("click", (e) => {
    const panel = document.getElementById("notif-panel");
    const bellBtn = document.getElementById("notif-bell-btn");
    if (panel && !panel.classList.contains("hidden") && !panel.contains(e.target) && !bellBtn.contains(e.target)) {
        panel.classList.add("hidden");
    }
});

function renderNotificationsList() {
    const container = document.getElementById("notif-list");
    if (!container) return;
    container.innerHTML = "";
    
    if (!appState.notifications || appState.notifications.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-on-surface-variant/60 text-[12px]">
                No notifications yet.
            </div>
        `;
        return;
    }
    
    appState.notifications.forEach(n => {
        const item = document.createElement("div");
        item.className = `p-3 rounded-xl border border-outline-variant/20 hover:bg-surface-container-high transition-colors cursor-pointer ${n.read ? 'opacity-60' : 'bg-primary/5 border-primary/20'}`;
        
        let iconSymbol = "notifications";
        let iconColor = "text-primary";
        if (n.type === "warning") { iconSymbol = "warning"; iconColor = "text-error"; }
        else if (n.type === "success") { iconSymbol = "check_circle"; iconColor = "text-secondary"; }
        
        item.innerHTML = `
            <div class="flex items-start gap-2.5">
                <div class="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0 ${iconColor}">
                    <span class="material-symbols-outlined text-[16px]">${iconSymbol}</span>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-[12px] text-on-surface leading-tight">${n.title}</h4>
                        <span class="text-[9px] text-on-surface-variant">${n.date}</span>
                    </div>
                    <p class="text-[11px] text-on-surface-variant mt-1 leading-snug">${n.message}</p>
                </div>
            </div>
        `;
        item.onclick = () => {
            n.read = true;
            saveNotifications();
            renderNotificationsList();
        };
        container.appendChild(item);
    });
}

function markAllNotificationsRead() {
    appState.notifications.forEach(n => n.read = true);
    saveNotifications();
    renderNotificationsList();
}

function generateSmartNotifications() {
    // 1. Unmarked daily attendance notification
    const todayStr = formatDateKey(new Date());
    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
    if (dayName !== "Sun") {
        const dayClasses = appState.timetable.filter(c => c.day === dayName);
        if (dayClasses.length > 0) {
            const logs = appState.attendanceLogs[todayStr];
            const unmarkedCount = logs ? logs.filter(l => l.status === "upcoming").length : dayClasses.length;
            if (unmarkedCount > 0) {
                addNotification(
                    "Pending Attendance Logs",
                    `You have ${unmarkedCount} classes unmarked for today. Please update your Daily Log.`,
                    "info"
                );
            }
        }
    }
    
    // 2. Low attendance warning
    const subjectStats = calculateSubjectAttendance();
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        if (stats.total > 0 && stats.percent < appState.profile.targetGoal) {
            addNotification(
                "Low Attendance Warning",
                `Your attendance in "${name}" is at ${stats.percent}%, which is below your target of ${appState.profile.targetGoal}%.`,
                "warning"
            );
        }
    });
    
    // 3. Streak Milestones
    const streak = appState.profile.streak;
    if (streak >= 30) {
        addNotification("Legendary Streak!", `Incredible! You have maintained a ${streak} days attendance streak. Keep it up!`, "success");
    } else if (streak >= 14) {
        addNotification("Impressive Streak!", `Great job! You have logged attendance for ${streak} consecutive days.`, "success");
    } else if (streak >= 7) {
        addNotification("Week-Long Streak!", `Awesome! You have kept a ${streak} days attendance streak active.`, "success");
    }
    
    // 4. Overall Attendance Target Goal Status
    const global = calculateGlobalAttendance();
    if (global.total > 0) {
        if (global.percentage >= appState.profile.targetGoal) {
            addNotification("Goal Achieved", `Congratulations! Your overall attendance is at ${global.percentage}%, exceeding your ${appState.profile.targetGoal}% target.`, "success");
        } else {
            const analysis = runBunkAnalyzer();
            if (analysis.type === "risk") {
                addNotification("Action Required", `You need to attend the next ${analysis.count} consecutive classes to reach your target goal.`, "warning");
            }
        }
    }
}

// ============================================================================
// 11. REPORTS COMPILATION & GENERATION (jsPDF + CSV)
// ============================================================================

let reportData = null;

async function loadReportPreview() {
    const periodSelect = document.getElementById("report-period-select");
    if (!periodSelect) return;
    const period = periodSelect.value;
    const startDate = document.getElementById("report-custom-start").value;
    const endDate = document.getElementById("report-custom-end").value;
    
    const previewContainer = document.getElementById("report-preview-container");
    if (!previewContainer) return;
    
    previewContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-6 space-y-4">
            <div class="h-6 w-1/3 bg-surface-container rounded shimmer-loading"></div>
            <div class="grid grid-cols-4 gap-4">
                <div class="h-20 bg-surface-container rounded shimmer-loading"></div>
                <div class="h-20 bg-surface-container rounded shimmer-loading"></div>
                <div class="h-20 bg-surface-container rounded shimmer-loading"></div>
                <div class="h-20 bg-surface-container rounded shimmer-loading"></div>
            </div>
            <div class="h-40 bg-surface-container rounded shimmer-loading"></div>
        </div>
    `;
    
    let url = `${API_BASE_URL}/reports/summary?period=${period}`;
    if (period === "custom" && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    
    try {
        const response = await fetch(url, { headers: getAuthHeaders() });
        if (response.ok) {
            reportData = await response.json();
        } else {
            throw new Error("Failed to fetch from server");
        }
    } catch (e) {
        console.warn("Falling back to local report compilation", e);
        reportData = compileLocalReportData(period, startDate, endDate);
    }
    
    renderReportPreview();
}

function compileLocalReportData(period, startDate, endDate) {
    const today = new Date();
    let dStart, dEnd;
    
    if (period === "daily") {
        dStart = new Date(today);
        dEnd = new Date(today);
    } else if (period === "weekly") {
        const dayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
        dStart = new Date(today);
        dStart.setDate(today.getDate() + dayOffset);
        dEnd = new Date(dStart);
        dEnd.setDate(dStart.getDate() + 6);
    } else if (period === "monthly") {
        dStart = new Date(today.getFullYear(), today.getMonth(), 1);
        dEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (period === "semester") {
        dStart = new Date(today);
        dStart.setDate(today.getDate() - 120);
        dEnd = new Date(today);
    } else if (period === "custom" && startDate && endDate) {
        dStart = new Date(startDate);
        dEnd = new Date(endDate);
    } else {
        dStart = new Date(today);
        dStart.setDate(today.getDate() - 30);
        dEnd = new Date(today);
    }
    
    const sStr = formatDateKey(dStart);
    const eStr = formatDateKey(dEnd);
    
    let present = 0, absent = 0, cancelled = 0, holidays = 0;
    const subjectStats = {};
    appState.subjects.forEach(sub => {
        subjectStats[sub.name] = { name: sub.name, code: sub.code, color: sub.color, present: 0, absent: 0, total: 0, percentage: 0 };
    });
    
    const dailyLog = {};
    
    Object.keys(appState.attendanceLogs).forEach(dateKey => {
        if (dateKey >= sStr && dateKey <= eStr) {
            dailyLog[dateKey] = [];
            appState.attendanceLogs[dateKey].forEach(rec => {
                if (rec.status === "present") present++;
                if (rec.status === "absent") absent++;
                if (rec.status === "cancelled") cancelled++;
                if (rec.status === "holiday") holidays++;
                
                if (subjectStats[rec.subject]) {
                    if (rec.status === "present") {
                        subjectStats[rec.subject].present++;
                        subjectStats[rec.subject].total++;
                    } else if (rec.status === "absent") {
                        subjectStats[rec.subject].absent++;
                        subjectStats[rec.subject].total++;
                    }
                }
                
                dailyLog[dateKey].push({
                    subject: rec.subject,
                    status: rec.status
                });
            });
        }
    });
    
    const total = present + absent;
    const percentage = total > 0 ? roundDecimal((present / total * 100), 2) : 0.0;
    
    const subjectsList = Object.values(subjectStats).map(stats => {
        stats.percentage = stats.total > 0 ? roundDecimal((stats.present / stats.total * 100), 2) : 0.0;
        return stats;
    });
    
    return {
        period,
        start_date: sStr,
        end_date: eStr,
        student: {
            name: appState.profile.name,
            college: appState.profile.college || "University",
            branch: appState.profile.branch || "CS",
            semester: appState.profile.term,
            target_goal: appState.profile.targetGoal
        },
        overall: {
            present,
            absent,
            cancelled,
            holidays,
            total_conducted: total,
            percentage
        },
        subjects: subjectsList,
        daily_log: dailyLog
    };
}

function roundDecimal(num, decimals) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function onReportPeriodChange() {
    const period = document.getElementById("report-period-select").value;
    const customStart = document.getElementById("report-custom-start-wrap");
    const customEnd = document.getElementById("report-custom-end-wrap");
    
    if (period === "custom") {
        customStart.classList.remove("hidden");
        customEnd.classList.remove("hidden");
    } else {
        customStart.classList.add("hidden");
        customEnd.classList.add("hidden");
    }
}

function renderReportPreview() {
    const previewContainer = document.getElementById("report-preview-container");
    if (!previewContainer || !reportData) return;
    
    let listHtml = `
        <div class="grid grid-cols-4 gap-5">
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border-l-4 border-l-primary">
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Overall Attendance</span>
                <p class="font-bold text-[28px] text-primary mt-2">${reportData.overall.percentage}%</p>
                <p class="text-[11px] text-on-surface-variant mt-1">Goal: ${reportData.student.target_goal}%</p>
            </div>
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border-l-4 border-l-secondary">
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Classes Present</span>
                <p class="font-bold text-[28px] text-secondary mt-2">${reportData.overall.present}</p>
                <p class="text-[11px] text-on-surface-variant mt-1">Conducted: ${reportData.overall.total_conducted}</p>
            </div>
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border-l-4 border-l-error">
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Classes Absent</span>
                <p class="font-bold text-[28px] text-error mt-2">${reportData.overall.absent}</p>
                <p class="text-[11px] text-on-surface-variant mt-1">Absence limit: ${reportData.overall.total_conducted - reportData.overall.present} classes</p>
            </div>
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border-l-4 border-l-tertiary">
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Other Info</span>
                <p class="font-bold text-[20px] text-on-surface mt-2">${reportData.overall.cancelled} Cancelled</p>
                <p class="text-[11px] text-on-surface-variant mt-1">${reportData.overall.holidays} Holidays / Offs</p>
            </div>
        </div>
        
        <!-- Table view -->
        <div class="glass-card rounded-2xl p-5">
            <h3 class="font-bold text-[14px] text-on-surface mb-3">Subject Wise Overview</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-on-surface-variant border-collapse">
                    <thead>
                        <tr class="border-b border-outline-variant/30 text-outline text-[11px] uppercase tracking-wider">
                            <th class="py-2.5">Subject</th>
                            <th class="py-2.5">Code</th>
                            <th class="py-2.5 text-center">Present</th>
                            <th class="py-2.5 text-center">Absent</th>
                            <th class="py-2.5 text-center">Total</th>
                            <th class="py-2.5 text-right">Percentage</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/20">
    `;
    
    reportData.subjects.forEach(sub => {
        let textClass = "";
        if (sub.percentage < reportData.student.target_goal && sub.total > 0) textClass = "text-error font-bold";
        else if (sub.percentage >= 85) textClass = "text-secondary font-bold";
        
        listHtml += `
            <tr class="hover:bg-surface-container/20">
                <td class="py-3 font-semibold text-on-surface">${sub.name}</td>
                <td class="py-3 font-label-md">${sub.code || "CS-XXX"}</td>
                <td class="py-3 text-center text-secondary">${sub.present}</td>
                <td class="py-3 text-center text-error">${sub.absent}</td>
                <td class="py-3 text-center">${sub.total}</td>
                <td class="py-3 text-right ${textClass}">${sub.percentage}%</td>
            </tr>
        `;
    });
    
    listHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    previewContainer.innerHTML = listHtml;
}

function downloadReportCSV() {
    if (!reportData) {
        showToast("No Report Data", "Please generate a preview first.", "warning");
        return;
    }
    
    let csv = `AttendWise Attendance Report\n`;
    csv += `Student: ${reportData.student.name}\n`;
    csv += `College: ${reportData.student.college}\n`;
    csv += `Branch: ${reportData.student.branch} | Semester: ${reportData.student.semester}\n`;
    csv += `Period: ${reportData.start_date} to ${reportData.end_date}\n\n`;
    
    csv += `Subject,Code,Present,Absent,Total,Percentage\n`;
    reportData.subjects.forEach(sub => {
        csv += `"${sub.name}","${sub.code || ''}",${sub.present},${sub.absent},${sub.total},${sub.percentage}%\n`;
    });
    
    csv += `\nOverall Summary\n`;
    csv += `Total Present,${reportData.overall.present}\n`;
    csv += `Total Absent,${reportData.overall.absent}\n`;
    csv += `Total Conducted,${reportData.overall.total_conducted}\n`;
    csv += `Overall Attendance,${reportData.overall.percentage}%\n`;
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `AttendWise_Report_${reportData.period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Downloaded", "Attendance CSV saved successfully.", "check_circle");
}

function downloadReportPDF() {
    if (!reportData) {
        showToast("No Report Data", "Please generate a preview first.", "warning");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const primaryColor = [124, 77, 255];
    const textColor = [32, 31, 31];
    
    // Header Title Card
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("AttendWise Attendance Report", 15, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Report Period: ${reportData.start_date} to ${reportData.end_date}`, 15, 26);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 15, 32);
    
    // Student Info
    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("STUDENT PROFILE", 15, 52);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Name: ${reportData.student.name}`, 15, 59);
    doc.text(`College: ${reportData.student.college}`, 15, 65);
    doc.text(`Branch: ${reportData.student.branch}`, 110, 59);
    doc.text(`Semester: ${reportData.student.semester}`, 110, 65);
    doc.text(`Target Attendance Goal: ${reportData.student.target_goal}%`, 110, 71);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 76, 195, 76);
    
    // Overall Stats
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("OVERALL ATTENDANCE SUMMARY", 15, 87);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Overall Attendance: ${reportData.overall.percentage}%`, 15, 94);
    doc.text(`Total Classes Conducted: ${reportData.overall.total_conducted}`, 15, 100);
    doc.text(`Total Present: ${reportData.overall.present}`, 110, 94);
    doc.text(`Total Absent: ${reportData.overall.absent}`, 110, 100);
    doc.text(`Cancelled: ${reportData.overall.cancelled} | Holidays: ${reportData.overall.holidays}`, 15, 106);
    
    doc.line(15, 112, 195, 112);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("SUBJECT-WISE ATTENDANCE", 15, 123);
    
    const body = reportData.subjects.map(sub => [
        sub.name,
        sub.code || "CS-XXX",
        sub.present.toString(),
        sub.absent.toString(),
        sub.total.toString(),
        `${sub.percentage}%`
    ]);
    
    doc.autoTable({
        startY: 128,
        head: [["Subject Name", "Course Code", "Present", "Absent", "Total Conducted", "Percentage"]],
        body: body,
        theme: "striped",
        headStyles: { fillColor: primaryColor, halign: "left" },
        columnStyles: {
            2: { halign: "center" },
            3: { halign: "center" },
            4: { halign: "center" },
            5: { halign: "right", fontStyle: "bold" }
        },
        styles: { fontSize: 9 }
    });
    
    const finalY = doc.lastAutoTable.finalY || 180;
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text("This report is generated by AttendWise Attendance Monitor Companion.", 15, finalY + 15);
    doc.text("Disclaimer: Attendance percentages depend on user accuracy of daily marking.", 15, finalY + 20);
    
    doc.save(`AttendWise_Report_${reportData.period}.pdf`);
    showToast("PDF Downloaded", "Attendance PDF saved successfully.", "check_circle");
}

// ============================================================================
// 12. TIMETABLE GRID LAYOUT & PERIOD SELECT CODES
// ============================================================================

function toggleTimetableViewMode(mode) {
    appState.timetableMode = mode;
    const listBtn = document.getElementById("timetable-view-list-btn");
    const periodBtn = document.getElementById("timetable-view-periods-btn");
    
    if (!listBtn || !periodBtn) return;
    
    if (mode === "list") {
        listBtn.className = "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-surface-container-high text-on-surface shadow-sm";
        periodBtn.className = "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-on-surface-variant hover:text-on-surface";
    } else {
        periodBtn.className = "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-surface-container-high text-on-surface shadow-sm";
        listBtn.className = "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-on-surface-variant hover:text-on-surface";
    }
    renderTimetableClasses();
}

function onClassPeriodSelectChange() {
    const periodVal = document.getElementById("form-class-period-select").value;
    const startInput = document.getElementById("form-class-start");
    const endInput = document.getElementById("form-class-end");
    
    const timeMap = {
        P1: { start: "09:00", end: "10:00" },
        P2: { start: "10:00", end: "11:00" },
        P3: { start: "11:00", end: "12:00" },
        Lunch: { start: "12:00", end: "13:00" },
        P4: { start: "13:00", end: "14:00" },
        P5: { start: "14:00", end: "15:00" },
        P6: { start: "15:00", end: "16:00" },
        P7: { start: "16:00", end: "17:00" }
    };
    
    if (periodVal === "custom") {
        startInput.disabled = false;
        endInput.disabled = false;
    } else {
        const slot = timeMap[periodVal];
        if (slot) {
            startInput.value = slot.start;
            endInput.value = slot.end;
            startInput.disabled = true;
            endInput.disabled = true;
        }
    }
}

// ============================================================================
// 13. DRAG-AND-DROP FILE UPLOADER & OCR PARSING
// ============================================================================

let selectedOcrFile = null;

function handleOcrFileDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById("ocr-dropzone");
    if (dropzone) dropzone.classList.remove("border-primary", "bg-primary/5");
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        updateOcrFileStatus(e.dataTransfer.files[0]);
    }
}

function handleOcrFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
        updateOcrFileStatus(e.target.files[0]);
    }
}

function updateOcrFileStatus(file) {
    selectedOcrFile = file;
    
    const dropzone = document.getElementById("ocr-dropzone");
    const statusBox = document.getElementById("ocr-file-status");
    const submitBtn = document.getElementById("ocr-submit-btn");
    
    const filenameEl = document.getElementById("ocr-filename");
    const filesizeEl = document.getElementById("ocr-filesize");
    const fileIcon = document.getElementById("ocr-file-icon");
    
    if (file) {
        dropzone.classList.add("hidden");
        statusBox.classList.remove("hidden");
        submitBtn.classList.remove("hidden");
        
        filenameEl.textContent = file.name;
        filesizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        
        if (file.type === "application/pdf") {
            fileIcon.textContent = "picture_as_pdf";
            fileIcon.className = "material-symbols-outlined text-error text-[20px]";
        } else {
            fileIcon.textContent = "image";
            fileIcon.className = "material-symbols-outlined text-secondary text-[20px]";
        }
    }
}

function removeSelectedOcrFile(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    selectedOcrFile = null;
    document.getElementById("ocr-file-input").value = "";
    
    document.getElementById("ocr-dropzone").classList.remove("hidden");
    document.getElementById("ocr-file-status").classList.add("hidden");
    document.getElementById("ocr-submit-btn").classList.add("hidden");
}

function startOcrFileScanning() {
    if (!selectedOcrFile) return;
    
    const loader = document.getElementById("ocr-scanning-loader");
    loader.classList.remove("hidden");
    
    const submitBtn = document.getElementById("ocr-submit-btn");
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50");
    
    setTimeout(() => {
        loader.classList.add("hidden");
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50");
        toggleModal("ocrModal");
        
        // Mock parsed classes from OCR scanning mapping
        appState.timetable = [
            { day: "Mon", subject: "Advanced Algorithms", start: "09:00", end: "10:00", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
            { day: "Mon", subject: "Data Science Fundamentals", start: "10:00", end: "11:00", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Practical" },
            { day: "Mon", subject: "Cyber Ethics", start: "11:00", end: "12:00", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" },
            { day: "Tue", subject: "Data Science Fundamentals", start: "09:00", end: "10:00", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Lecture" },
            { day: "Tue", subject: "Psychology", start: "10:00", end: "11:00", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
            { day: "Wed", subject: "Cloud Computing Lab", start: "09:00", end: "10:00", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Practical" },
            { day: "Wed", subject: "Cyber Ethics", start: "10:00", end: "11:00", room: "Room 101", prof: "Prof. Dennis Ritchie", type: "Lecture" },
            { day: "Thu", subject: "Advanced Algorithms", start: "09:00", end: "10:00", room: "Room 402", prof: "Dr. Alan Turing", type: "Lecture" },
            { day: "Thu", subject: "Data Science Fundamentals", start: "10:00", end: "11:00", room: "Lab 2A", prof: "Prof. Ada Lovelace", type: "Practical" },
            { day: "Fri", subject: "Psychology", start: "09:00", end: "10:00", room: "Room 305", prof: "Dr. William James", type: "Lecture" },
            { day: "Fri", subject: "Cloud Computing Lab", start: "13:00", end: "14:00", room: "Seminar Hall", prof: "Dr. Grace Hopper", type: "Hybrid" }
        ];
        
        saveStateToLocalStorage();
        renderTimetableClasses();
        showToast("Timetable Processed", `AI scanned "${selectedOcrFile.name}" and extracted ${appState.timetable.length} classes mapped to period slots.`, "center_focus_strong");
        removeSelectedOcrFile();
    }, 2000);
}

// ============================================================================
// 14. ONLOAD BOOTSTRAPPER
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    await initAppState();
    
    // Default open dashboard tab
    tabNavigation("dashboard");
    
    // Set active sub-tab defaults
    toggleScheduleSubTab("timetable");
    
    // Quick micro-interactions for active button pressing
    document.querySelectorAll("button, select, input, a").forEach(el => {
        el.addEventListener("mousedown", () => el.style.transform = "scale(0.97)");
        el.addEventListener("mouseup", () => el.style.transform = "");
        el.addEventListener("mouseleave", () => el.style.transform = "");
    });
    
    // First welcome message toast
    setTimeout(() => {
        showToast("AttendWise AI Active", `Hi ${appState.profile.name}, target set to ${appState.profile.targetGoal}%. Keep tracking!`, "insights");
    }, 1500);
});
