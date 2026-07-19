import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

// AttendWise AI Student Attendance Companion - Core Business Logic & State Engine
// Supports offline-first LocalCache (localStorage) and real calculations.

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (isLocalHost ? "http://127.0.0.1:8000" : window.location.origin);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const capacitorStorageAdapter = {
    getItem: async (key) => {
        const { value } = await Preferences.get({ key });
        return value;
    },
    setItem: async (key, value) => {
        await Preferences.set({ key, value });
    },
    removeItem: async (key) => {
        await Preferences.remove({ key });
    }
};

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: capacitorStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    }
}) : null;

// Initialize Capacitor Plugins
try {
    StatusBar.setStyle({ style: Style.Dark });
    StatusBar.setOverlaysWebView({ overlay: false });
    Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    // Note: SplashScreen.hide() is deliberately moved to after auth check in initAppState
} catch (e) {
    console.warn("Capacitor plugins not available in web mode.");
}

// Function to handle the custom CSS splash screen fade out
function removeSplashScreen() {
    const splash = document.getElementById('custom-splash-screen');
    if (splash && splash.style.opacity !== '0') {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 1000);
    }
}



// ============================================================================
// GLOBAL FETCH INTERCEPTOR & OFFLINE DETECTION (Phase 1 & 2)
// ============================================================================
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    if (!navigator.onLine) {
        showToast("Offline", "You are currently offline. Check your connection.", "wifi_off");
    }
    
    try {
        const response = await originalFetch.apply(this, args);
        if (response.status === 401) {
            console.warn("Unauthorized API call. Token expired.");
            showToast("Session Expired", "Please log in again.", "lock");
            
            // Wipe token and force redirect to login
            localStorage.removeItem("access_token");
            try {
                await Preferences.remove({ key: "access_token" });
            } catch (err) {}
            showAuthScreen();
            
            const mainContent = document.getElementById("main-content");
            if (mainContent) mainContent.classList.add("hidden");
            const sidebar = document.getElementById("desktop-sidebar");
            if (sidebar) sidebar.classList.add("hidden");
            const mobileSidebar = document.getElementById("mobile-sidebar-overlay");
            if (mobileSidebar) mobileSidebar.classList.add("hidden");
        }
        return response;
    } catch (err) {
        if (!navigator.onLine) {
            console.warn("Fetch failed due to offline status:", err);
        }
        throw err; // Let caller handle it
    }
};

window.addEventListener('offline', () => {
    showToast("Offline", "You have lost internet connection.", "wifi_off");
});

window.addEventListener('online', () => {
    showToast("Online", "Internet connection restored.", "wifi");
});


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

let authState = "Initializing";

let appState = {
    profile: {
        name: "Sarah Jenkins",
        targetGoal: 75,
        term: "Semester 1 (Autumn)",
        streak: 12,
        college: "Engineering College",
        branch: "Computer Science",
        roll_number: "21CS001",
        section: "A",
        year: "2nd Year",
        register_number: "",
        university: "",
        profile_photo: ""
    },
    subjects: DEFAULT_SUBJECTS,
    timetable: DEFAULT_TIMETABLE,
    attendanceLogs: {}, // dateKey -> array of { subject, start, end, status }
    leavePlans: [],
    notifications: [],
    timetableMode: "list",
    activeSemester: null,
    holidays: []
};

function getAuthHeaders() {
    const token = localStorage.getItem("access_token");
    return token ? { "Authorization": "Bearer " + token } : {};
}

/**
 * Lightweight client-side JWT expiry check (no signature verification).
 * Returns true if the token exists and its exp claim is in the future.
 * Used as a fast pre-check to avoid a wasted /state round-trip.
 */
function isTokenFresh() {
    const token = localStorage.getItem("access_token");
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (!payload.exp) return true; // no exp = assume valid
        return Date.now() / 1000 < payload.exp;
    } catch {
        return true; // if we can't parse, let the server decide
    }
}

function showAuthScreen() {
    const screen = document.getElementById("auth-screen");
    if (screen) screen.classList.remove("hidden");
    
    // Background ping to pre-warm Render free-tier backend (so it wakes up quickly)
    console.info("[Auth] Pre-warming Render backend...");
    fetch(`${API_BASE_URL}/ping`).catch(err => console.warn("Warmup ping error:", err));
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

/**
 * Toggles an input field between password (hidden) and text (visible) type.
 * Updates the eye icon on the button accordingly.
 */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn.querySelector(".material-symbols-outlined");
    if (input.type === "password") {
        input.type = "text";
        if (icon) icon.textContent = "visibility_off";
    } else {
        input.type = "password";
        if (icon) icon.textContent = "visibility";
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
    console.info("[Auth] Login requested.");
    authState = "Authenticating";
    
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    
    const submitBtn = document.getElementById("signin-submit-btn");
    const originalText = submitBtn ? submitBtn.textContent : "Access Dashboard";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Connecting...";
    }
    
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
        
        console.info(`[Auth] Response received for login. Status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("access_token", data.access_token);
            try {
                await Preferences.set({ key: "access_token", value: data.access_token });
            } catch (err) {
                console.warn("[Auth] Preferences.set failed", err);
            }
            console.info("[Auth] Session saved.");
            authState = "Authenticated";
            showToast("Login Successful", "Welcome to AttendWise!", "check_circle");
            await initAppState();
            if (window.capacitorPushNotifications) registerPushNotifications();
            tabNavigation("dashboard");
        } else {
            const err = await response.json();
            authState = "Unauthenticated";
            const errorMessage = err.detail || "Incorrect email or password";
            console.warn(`[Auth] Login failed: ${errorMessage}`);
            showToast("Login Failed", errorMessage, "error");
        }
    } catch (err) {
        authState = "Offline";
        console.error("[Auth] Network error during login:", err);
        showToast("Network Unavailable", "Could not connect to the authentication server. Please wait ~30 seconds for the server to wake up and try again.", "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

async function handleAuthSignUp(e) {
    e.preventDefault();
    console.info("[Auth] Signup requested.");
    authState = "Authenticating";
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const college = document.getElementById("signup-college").value.trim();
    const branch = document.getElementById("signup-branch").value.trim();
    const goalVal = document.getElementById("signup-goal").value.trim();
    const semester = document.getElementById("signup-semester").value;
    
    const submitBtn = document.getElementById("signup-submit-btn");
    const originalText = submitBtn ? submitBtn.textContent : "Create Account";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating Account...";
    }
    
    if (password.length < 6) {
        authState = "Unauthenticated";
        showToast("Weak Password", "Password must be at least 6 characters.", "warning");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
        return;
    }
    
    let goal = 75.0;
    if (goalVal) {
        goal = parseFloat(goalVal);
        if (isNaN(goal)) goal = 75.0;
    }
    
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
                college: college || null,
                branch: branch || null,
                attendance_goal: goal,
                semester: semester || null
            })
        });
        
        console.info(`[Auth] Response received for signup. Status: ${response.status}`);
        
        if (response.ok) {
            console.info("[Auth] Signup successful. Attempting auto-login.");
            showToast("Registration Successful", "Logging you in...", "check_circle");
            // Auto login after registration
            const formData = new URLSearchParams();
            formData.append("username", email);
            formData.append("password", password);
            
            const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formData
            });
            
            if (loginRes.ok) {
                const data = await loginRes.json();
                localStorage.setItem("access_token", data.access_token);
                try {
                    await Preferences.set({ key: "access_token", value: data.access_token });
                } catch (err) {
                    console.warn("[Auth] Preferences.set failed", err);
                }
                console.info("[Auth] Session saved after signup.");
                authState = "Authenticated";
                await initAppState();
                hideAuthScreen();
                tabNavigation("dashboard");
            } else {
                console.warn("[Auth] Auto-login failed. Redirecting to manual signin.");
                authState = "Unauthenticated";
                switchAuthTab("signin");
                document.getElementById("signin-email").value = email;
                document.getElementById("signin-password").value = password;
            }
        } else {
            const err = await response.json();
            authState = "Unauthenticated";
            const errorMessage = err.message || err.detail || "Could not register account";
            console.warn(`[Auth] Registration failed: ${errorMessage}`);
            showToast("Registration Failed", errorMessage, "error");
        }
    } catch (err) {
        authState = "Offline";
        console.error("[Auth] Network error during signup:", err);
        showToast("Network Unavailable", "Could not connect to the server. Please wait ~30 seconds for the server to wake up and try again.", "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

async function handleAuthSignOut() {
    if (confirm("Are you sure you want to sign out?")) {
        localStorage.removeItem("access_token");
        try {
            await Preferences.remove({ key: "access_token" });
        } catch (err) {
            console.warn("[Auth] Preferences.remove failed", err);
        }
        if (supabase) {
            await supabase.auth.signOut();
        }
        location.reload();
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById("fp-email").value.trim();
    try {
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        if (response.ok) {
            showToast("Token Sent", "Check the server console for the reset token.", "check_circle");
            document.getElementById("fp-step-email").classList.add("hidden");
            document.getElementById("fp-step-reset").classList.remove("hidden");
        } else {
            const err = await response.json();
            showToast("Failed", err.detail || "Could not request reset token", "error");
        }
    } catch (err) {
        showToast("Error", "Could not connect to auth server", "error");
        console.error(err);
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const token = document.getElementById("fp-token").value.trim();
    const newPassword = document.getElementById("fp-new-password").value;
    try {
        const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, new_password: newPassword })
        });
        if (response.ok) {
            showToast("Password Reset Successful", "Please sign in with your new password.", "check_circle");
            toggleModal("forgotPasswordModal");
            document.getElementById("fp-step-email").classList.remove("hidden");
            document.getElementById("fp-step-reset").classList.add("hidden");
        } else {
            const err = await response.json();
            showToast("Failed", err.detail || "Password reset failed", "error");
        }
    } catch (err) {
        showToast("Error", "Could not connect to auth server", "error");
        console.error(err);
    }
}

async function handleGoogleSignIn() {
    if (!supabase) {
        showToast("Error", "Supabase client not initialized (missing env config)", "error");
        return;
    }
    
    try {
        console.info("[Auth] Google Sign-In requested.");
        authState = "Authenticating";
        showToast("Google Sign-In", "Redirecting to Google...", "insights");
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) {
            authState = "Unauthenticated";
            throw error;
        }
    } catch (err) {
        authState = "Offline";
        console.error("[Auth] Google OAuth Failed:", err);
        showToast("OAuth Failed", err.message || "Could not start Google Sign-In", "error");
    }
}


// Initial state loader
async function initAppState() {
    console.info("[App] initAppState starting. Current authState:", authState);
    let sessionValid = false;

    const statusEl = document.getElementById("splash-status");
    if (statusEl) statusEl.textContent = "Checking credentials...";

    try {
        const cachedToken = await Preferences.get({ key: "access_token" });
        if (cachedToken && cachedToken.value) {
            localStorage.setItem("access_token", cachedToken.value);
            console.info("[Auth] Token restored from Capacitor Preferences");
        }
    } catch (prefErr) {
        console.warn("[Auth] Failed to restore token from Capacitor Preferences", prefErr);
    }

    if (!supabase) {
        console.warn("[App] Supabase missing. Falling back to FastAPI token check.");
        const token = localStorage.getItem("access_token");
        if (token) {
            authState = "Authenticated";
            sessionValid = true;
        } else {
            authState = "Unauthenticated";
        }
    } else {
        try {
            const { data, error } = await supabase.auth.getSession();
            const session = data ? data.session : null;
            
            if (error || !session) {
                console.info("[Auth] No active Supabase session. Checking local FastAPI token.");
                const token = localStorage.getItem("access_token");
                if (token) {
                    console.info("[Auth] Session restored via local FastAPI token.");
                    authState = "Authenticated";
                    sessionValid = true;
                } else {
                    authState = "Unauthenticated";
                }
            } else {
                console.info("[Auth] Session restored via Supabase.");
                authState = "Authenticated";
                sessionValid = true;
            }
        } catch (e) {
            console.warn("[Auth] Session check failed, attempting fallback recovery.", e);
            if (localStorage.getItem("access_token")) {
                authState = "Offline";
                sessionValid = true;
            } else {
                authState = "Unauthenticated";
            }
        }
    }

    if (!sessionValid) {
        showAuthScreen();
        try { await SplashScreen.hide(); } catch(err){}
        removeSplashScreen();
        return false;
    }

    // Fast client-side expiry pre-check — avoids a round-trip for an obviously expired token
    if (!isTokenFresh()) {
        console.info("[Auth] Local token is expired. Clearing and showing auth screen.");
        localStorage.removeItem("access_token");
        localStorage.removeItem("offline_app_state");
        try { await Preferences.remove({ key: "access_token" }); } catch (err) {}
        showAuthScreen();
        try { await SplashScreen.hide(); } catch(err){}
        removeSplashScreen();
        return false;
    }
    
    // Check PIN Lock
    const pinEnabled = localStorage.getItem("pin_enabled") === "true";
    if (pinEnabled) {
        const overlay = document.getElementById("pinLockOverlay");
        if (overlay) overlay.classList.remove("hidden");
    }
    
    try {
        if (statusEl) statusEl.textContent = "Connecting to server...";
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.warn("[App] /state request timed out. Falling back to offline load.");
            if (statusEl) statusEl.textContent = "Server slow, loading cached...";
        }, 7500); // 7.5s timeout for cold start fallback

        const response = await fetch(`${API_BASE_URL}/state`, {
            headers: getAuthHeaders(),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            if (statusEl) statusEl.textContent = "Restoring data...";
            const data = await response.json();
            appState.profile = data.profile;
            appState.subjects = data.subjects;
            appState.timetable = data.timetable;
            appState.attendanceLogs = data.attendanceLogs;
            appState.activeSemester = data.active_semester;
            appState.holidays = data.holidays || [];
            if (appState.activeSemester) {
                try {
                    const holController = new AbortController();
                    const holTimeout = setTimeout(() => holController.abort(), 3000);
                    const holResponse = await fetch(`${API_BASE_URL}/semesters/${appState.activeSemester.id}/holidays`, {
                        headers: getAuthHeaders(),
                        signal: holController.signal
                    });
                    clearTimeout(holTimeout);
                    if (holResponse.ok) {
                        appState.holidays = await holResponse.json();
                    } else {
                        appState.holidays = [];
                    }
                } catch (holErr) {
                    console.error("Failed to fetch holidays:", holErr);
                    appState.holidays = [];
                }
            } else {
                appState.holidays = [];
            }
            
            // Save state for offline caching
            localStorage.setItem('offline_app_state', JSON.stringify(appState));
            
            hideAuthScreen();
            if (window.capacitorPushNotifications) registerPushNotifications();
        } else if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("offline_app_state"); // clear stale cache on auth failure
            try {
                await Preferences.remove({ key: "access_token" });
            } catch (err) {}
            showAuthScreen();
            try { await SplashScreen.hide(); } catch(err){}
            removeSplashScreen();
            return false;
        } else {
            console.error("Failed to fetch state from backend, attempting offline load");
            const cached = localStorage.getItem('offline_app_state');
            if (cached) {
                Object.assign(appState, JSON.parse(cached));
                showToast("Offline Mode", "Viewing cached data", "cloud_off");
            } else {
                appState.attendanceLogs = generateMockAttendanceLogs();
            }
            hideAuthScreen();
        }
    } catch (e) {
        console.error("Backend not reachable or request timed out, attempting offline load", e);
        if (statusEl) statusEl.textContent = "Offline fallback...";
        const cached = localStorage.getItem('offline_app_state');
        if (cached) {
            Object.assign(appState, JSON.parse(cached));
            showToast("Offline Mode", "Viewing cached data", "cloud_off");
        } else {
            appState.attendanceLogs = generateMockAttendanceLogs();
        }
        hideAuthScreen();
    }

    // Load leave plans from backend
    await fetchLeavePlans();
    // Load notifications from local storage and run engine
    loadNotifications();
    generateSmartNotifications();
    
    // Apply preferences
    applyTheme(localStorage.getItem("theme") || "dark");
    applyAccentColor(localStorage.getItem("accent_color") || "purple");
    applyLanguage(localStorage.getItem("lang") || "en");
    toggleFloatingWidget(localStorage.getItem("widget_enabled") === "true");
    
    // Render profile photo in sidebar
    const avatarImg = document.getElementById("header-avatar-img");
    const avatarIcon = document.getElementById("header-avatar-icon");
    if (appState.profile && appState.profile.profile_photo) {
        if (avatarImg) {
            avatarImg.src = appState.profile.profile_photo;
            avatarImg.classList.remove("hidden");
        }
        if (avatarIcon) avatarIcon.classList.add("hidden");
    } else {
        if (avatarImg) avatarImg.classList.add("hidden");
        if (avatarIcon) avatarIcon.classList.remove("hidden");
    }
    
    // Check finished, ready to reveal the app
    try { await SplashScreen.hide(); } catch(err){}
    removeSplashScreen();
    return true;
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
        if (!response.ok) {
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

function protectRoutes() {
    if (authState !== "Authenticated" && authState !== "Offline") {
        console.warn("[Auth] Blocked access to protected route. Redirecting to login.");
        showAuthScreen();
        return false;
    }
    return true;
}

function tabNavigation(tabId) {
    if (!protectRoutes()) return;
    
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

// --- Sync Modal Functions ---
function openSyncModal(subjectId) {
    const subject = appState.subjects.find(s => s.id == subjectId);
    if (!subject) return;
    document.getElementById("sync-subject-id").value = subjectId;
    document.getElementById("sync-modal-title").innerText = `Sync ${subject.name}`;
    document.getElementById("sync-form-conducted").value = "";
    document.getElementById("sync-form-attended").value = "";
    document.getElementById("sync-preview-alert").classList.add("hidden");
    document.getElementById("sync-submit-btn").disabled = true;
    toggleModal('syncModal');
}

function updateSyncPreview() {
    const conducted = parseInt(document.getElementById("sync-form-conducted").value);
    const attended = parseInt(document.getElementById("sync-form-attended").value);
    const subjectId = document.getElementById("sync-subject-id").value;
    const btn = document.getElementById("sync-submit-btn");
    const preview = document.getElementById("sync-preview-alert");
    const previewText = document.getElementById("sync-preview-text");
    
    if (isNaN(conducted) || isNaN(attended)) {
        btn.disabled = true;
        preview.classList.add("hidden");
        return;
    }
    
    const subject = appState.subjects.find(s => s.id == subjectId);
    if (!subject) return;
    
    const subjectStats = calculateSubjectAttendance();
    const statsObj = subjectStats[subject.name] || {};
    const currConducted = statsObj.total || 0;
    const currAttended = statsObj.present || 0;
    
    if (conducted < currConducted) {
        preview.classList.remove("hidden");
        previewText.innerHTML = `<span class="text-error font-bold">Error:</span> Cannot reduce conducted classes (currently ${currConducted}).`;
        btn.disabled = true;
        return;
    }
    
    if (attended > conducted) {
        preview.classList.remove("hidden");
        previewText.innerHTML = `<span class="text-error font-bold">Error:</span> Attended cannot exceed conducted.`;
        btn.disabled = true;
        return;
    }
    
    const diffConducted = conducted - currConducted;
    const diffAttended = attended - currAttended;
    
    if (diffConducted < 0 || diffAttended < 0 || diffAttended > diffConducted) {
        preview.classList.remove("hidden");
        previewText.innerHTML = `<span class="text-error font-bold">Error:</span> Invalid sync. Conducted/attended diff cannot be negative, and attended diff cannot exceed conducted diff.`;
        btn.disabled = true;
        return;
    }
    
    const diffAbsent = diffConducted - diffAttended;
    
    preview.classList.remove("hidden");
    previewText.innerHTML = `Adding <b class="text-on-surface">${diffConducted} new classes</b> (${diffAttended} attended, ${diffAbsent} absent) to history.`;
    btn.disabled = false;
}

async function saveSyncAttendance(e) {
    e.preventDefault();
    const subjectId = document.getElementById("sync-subject-id").value;
    const conducted = parseInt(document.getElementById("sync-form-conducted").value);
    const attended = parseInt(document.getElementById("sync-form-attended").value);
    
    const btn = document.getElementById("sync-submit-btn");
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/subjects/${subjectId}/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ conducted, attended })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to sync attendance");
        }
        
        toggleModal("syncModal");
        showToast("Synced!", "Attendance synced successfully!", "check_circle");
        await fetchAllData();
    } catch (error) {
        showToast("Sync Failed", error.message, "error");
    } finally {
        btn.disabled = false;
    }
}

async function handleSyncOcrUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showToast("Processing...", "Reading image with AI...", "smart_toy");
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/attendance/ocr`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem('access_token')}` },
            body: formData
        });
        
        if (!response.ok) throw new Error("OCR failed");
        
        const data = await response.json();
        
        const subjectId = document.getElementById("sync-subject-id").value;
        const subject = appState.subjects.find(s => s.id == subjectId);
        
        let match = null;
        if (subject && data.length > 0) {
            match = data.find(item => 
                item.subject_name.toLowerCase().includes(subject.name.toLowerCase()) || 
                subject.name.toLowerCase().includes(item.subject_name.toLowerCase())
            ) || data[0]; 
        }
        
        if (match) {
            document.getElementById("sync-form-conducted").value = match.conducted;
            document.getElementById("sync-form-attended").value = match.attended;
            updateSyncPreview();
            showToast("Extracted!", `Found ${match.conducted} conducted, ${match.attended} attended`, "auto_awesome");
        } else {
            showToast("No Match", "No matching subject data found in image.", "search_off");
        }
        
    } catch (err) {
        showToast("OCR Failed", "Failed to process the uploaded image.", "broken_image");
    }
    
    e.target.value = "";
}

// ============================================================================
// 5. CALCULATIONS ENGINE (BUSINESS LOGIC)
// ============================================================================

// Returns duration weight (in hours) for a class entry.
// Timetable entries have start/end. Attendance logs also store start/end.
// Labs (Practical/Hybrid types) or long sessions count as their full duration.
// Falls back to 1 if time is unavailable.
function getClassWeight(cls) {
    if (!cls.start || !cls.end) return 1;
    const [sh, sm] = cls.start.split(':').map(Number);
    const [eh, em] = cls.end.split(':').map(Number);
    const durationHours = (eh * 60 + em - sh * 60 - sm) / 60;
    // Clamp to a reasonable range (at least 1, at most 4 hours)
    return Math.max(1, Math.min(4, Math.round(durationHours)));
}

/**
 * Returns the period-weight for a subject object from appState.subjects.
 * Lab/Practical subjects count as 3 periods; Theory subjects count as 1.
 */
function getSubjectWeight(sub) {
    if (!sub) return 1;
    const type = (sub.subject_type || sub.subjectType || '').toLowerCase();
    const name = (sub.name || '').toLowerCase();
    if (type === 'practical' || type === 'lab' || name.includes('lab')) return 3;
    return 1;
}


function calculateGlobalAttendance() {
    let presentHours = 0;
    let absentHours = 0;

    // Baseline from portal sync
    appState.subjects.forEach(sub => {
        const w = getSubjectWeight(sub);
        presentHours += (sub.baseline_attended || 0) * w;
        absentHours += ((sub.baseline_conducted || 0) - (sub.baseline_attended || 0)) * w;
    });

    // Build the non-instructional date set (exam periods, breaks, holidays)
    const nonInstructionalSet = new Set(getCombinedHolidayDates());
    const skipStatuses = new Set(["holiday", "exam", "event", "cancelled"]);

    Object.entries(appState.attendanceLogs).forEach(([dateKey, dayLogs]) => {
        // Skip entire day if it's non-instructional
        if (nonInstructionalSet.has(dateKey)) return;
        dayLogs.forEach(cls => {
            // Skip individual records flagged as non-instructional
            if (skipStatuses.has(cls.status)) return;
            const weight = getClassWeight(cls);
            if (cls.status === "present") presentHours += weight;
            if (cls.status === "absent") absentHours += weight;
        });
    });

    const totalConducted = presentHours + absentHours;
    const percentage = totalConducted > 0 ? Math.round((presentHours / totalConducted) * 100) : 0;

    return {
        percentage,
        present: Math.round(presentHours),
        absent: Math.round(absentHours),
        total: Math.round(totalConducted)
    };
}

function calculateSubjectAttendance() {
    const subjectStats = {};

    // Build the non-instructional date set once (includes exam periods, breaks, events)
    const nonInstructionalSet = new Set(getCombinedHolidayDates());

    // Initialize subjects list
    appState.subjects.forEach(sub => {
        const w = getSubjectWeight(sub);
        subjectStats[sub.name] = {
            id: sub.id,
            present: (sub.baseline_attended || 0) * w,
            absent: ((sub.baseline_conducted || 0) - (sub.baseline_attended || 0)) * w,
            total: (sub.baseline_conducted || 0) * w,
            percent: 0,
            code: sub.code || "",
            color: sub.color || "#7c4dff",
            prof: sub.prof || "No Faculty",
            min_req: sub.minimum_required_attendance || 75
        };
    });

    // Add logs — skip non-instructional days entirely (exam periods, breaks, holidays)
    Object.entries(appState.attendanceLogs).forEach(([dateKey, dayLogs]) => {
        // Skip the entire day if it's a non-instructional date
        if (nonInstructionalSet.has(dateKey)) return;

        dayLogs.forEach(cls => {
            // Also skip individual records that are flagged as holiday/exam/event/cancelled
            const skipStatus = ["holiday", "exam", "event", "cancelled"];
            if (skipStatus.includes(cls.status)) return;

            if (subjectStats[cls.subject]) {
                const weight = getClassWeight(cls);
                if (cls.status === "present") {
                    subjectStats[cls.subject].present += weight;
                    subjectStats[cls.subject].total += weight;
                } else if (cls.status === "absent") {
                    subjectStats[cls.subject].absent += weight;
                    subjectStats[cls.subject].total += weight;
                }
            }
        });
    });

    // Calculate individual percentages (round totals for display)
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        stats.percent = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
        stats.present = Math.round(stats.present);
        stats.absent = Math.round(stats.absent);
        stats.total = Math.round(stats.total);
    });

    return subjectStats;
}

function runBunkAnalyzer() {
    const subjectStats = calculateSubjectAttendance();
    const names = Object.keys(subjectStats);
    
    if (names.length === 0) {
        return { type: "neutral", text: "No logs logged", desc: "Start marking attendance to view limits.", count: 0 };
    }
    
    let highestRiskSub = null;
    let lowestPercent = 101;
    let safeBunksTotal = 1000;
    let hasCritical = false;
    let hasWarning = false;
    
    names.forEach(name => {
        const stats = subjectStats[name];
        if (stats.total === 0) return;
        
        const targetFraction = stats.min_req / 100;
        
        if (stats.percent < stats.min_req) {
            hasCritical = true;
            const classesNeeded = Math.ceil((targetFraction * stats.total - stats.present) / (1 - targetFraction));
            if (stats.percent < lowestPercent) {
                lowestPercent = stats.percent;
                highestRiskSub = {
                    name,
                    percent: stats.percent,
                    type: "risk",
                    count: classesNeeded,
                    desc: `Critical! "${name}" is at ${stats.percent}%. You must attend the next ${classesNeeded} consecutive classes to reach 75%.`
                };
            }
        } else {
            const safeBunks = Math.floor((stats.present - targetFraction * stats.total) / targetFraction);
            if (safeBunks < safeBunksTotal) {
                safeBunksTotal = safeBunks;
            }
            if (stats.percent < 80) {
                hasWarning = true;
                if (!hasCritical && stats.percent < lowestPercent) {
                    lowestPercent = stats.percent;
                    highestRiskSub = {
                        name,
                        percent: stats.percent,
                        type: "warning",
                        count: safeBunks,
                        desc: `Warning! "${name}" is at ${stats.percent}% (Close to falling below 75%). You can bunk at most ${safeBunks} classes.`
                    };
                }
            }
        }
    });
    
    if (highestRiskSub && highestRiskSub.type === "risk") {
        return {
            type: "risk",
            count: highestRiskSub.count,
            text: `Risk: ${highestRiskSub.name}`,
            desc: highestRiskSub.desc
        };
    } else if (highestRiskSub && highestRiskSub.type === "warning") {
        return {
            type: "warning",
            count: highestRiskSub.count,
            text: `Warning: ${highestRiskSub.name}`,
            desc: highestRiskSub.desc
        };
    } else {
        const count = safeBunksTotal === 1000 ? 0 : safeBunksTotal;
        return {
            type: "safe",
            count: count,
            text: `${count} Safe Bunk${count !== 1 ? 's' : ''}`,
            desc: `All subjects are safe (above 80%). You can safely miss at least ${count} consecutive classes overall.`
        };
    }
}

// Locally compute attendance streak from appState.attendanceLogs
// Mirrors the backend _compute_streak logic — counts consecutive class days
// going backwards where the student had at least one 'present' record.
// Skips days with no records, or days with only 'cancelled'/'holiday'/'exam'/'event'/'upcoming'.
function computeLocalStreak() {
    const today = new Date();
    let streak = 0;
    let checkDate = new Date(today);
    const nonInstructionalSet = new Set(getCombinedHolidayDates());

    for (let i = 0; i < 365; i++) {
        const dateKey = formatDateKey(checkDate);

        // Skip non-instructional days entirely (exam periods, holidays, breaks)
        if (nonInstructionalSet.has(dateKey)) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        const records = appState.attendanceLogs[dateKey] || [];
        const activeRecords = records.filter(r => !["cancelled", "holiday", "exam", "event", "upcoming"].includes(r.status));

        const hasPresent = activeRecords.some(r => r.status === "present");
        const hasMeaningful = activeRecords.length > 0;

        if (!hasMeaningful) {
            // No real class records — skip (weekend, holiday, cancelled-only)
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        } else if (hasPresent) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break; // Present on a class day — streak broken
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
    const subjectStats = calculateSubjectAttendance();
    
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
    
    // Determine overall ring color based on subject-wise risk
    let anyCritical = false;
    let anyWarning = false;
    Object.values(subjectStats).forEach(s => {
        if (s.total > 0) {
            if (s.percent < s.min_req) anyCritical = true;
            else if (s.percent < 80) anyWarning = true;
        }
    });
    
    let ringColor = "#cdbdff";
    let shadowColor = "rgba(205,189,255,0.5)";
    if (anyCritical) {
        ringColor = "#ff5252"; // red
        shadowColor = "rgba(255,82,82,0.5)";
    } else if (anyWarning) {
        ringColor = "#ffb300"; // amber
        shadowColor = "rgba(255,179,0,0.5)";
    } else {
        ringColor = "#40e56c"; // green
        shadowColor = "rgba(64,229,108,0.5)";
    }
    
    circle.setAttribute("stroke", ringColor);
    circle.style.filter = `drop-shadow(0 0 8px ${shadowColor})`;
    
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
    } else if (analysis.type === "warning") {
        bunkBar.className = "h-full bg-amber-500 w-[60%] rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(245,158,11,0.4)]";
        bunkTitle.className = "font-headline-lg-mobile text-[22px] text-amber-500 font-extrabold";
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

    // Render new bento widgets
    renderDashboardSubjectSummary();
    renderDashboardRecentLogs();
    renderDashboardAiInsights(global, analysis, displayStreak);
    updateSemesterDashboard();
    renderPendingAttendancePrompt();

    if (localStorage.getItem("widget_enabled") === "true") {
        updateFloatingWidgetData();
    }
}

function renderPendingAttendancePrompt() {
    const container = document.getElementById("dash-pending-attendance-container");
    if (!container) return;
    
    const today = new Date();
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = weekdays[today.getDay()];
    
    // Don't show prompts on Sunday
    if (dayName === "Sun") {
        container.classList.add("hidden");
        return;
    }
    
    const todayStr = formatDateKey(today);
    const todaySessions = ensureDailyScheduleReady(todayStr);
    const nowStr = today.toTimeString().split(" ")[0].slice(0, 5); // "HH:MM"
    
    // Find the first upcoming session that has already ended
    const pendingSession = todaySessions.find(s => s.status === "upcoming" && s.end && s.end.localeCompare(nowStr) <= 0);
    
    if (pendingSession) {
        document.getElementById("dash-pending-class-name").textContent = `Did you attend ${pendingSession.subject}?`;
        document.getElementById("dash-pending-class-time").textContent = `${formatTimeAmPm(pendingSession.start)} - ${formatTimeAmPm(pendingSession.end)}`;
        
        // Setup button click handlers
        document.getElementById("dash-pending-yes-btn").onclick = async () => {
            await updateRecordStatus(todayStr, pendingSession.subject, pendingSession.start, 'present');
            renderPendingAttendancePrompt();
            renderDashboard();
        };
        document.getElementById("dash-pending-no-btn").onclick = async () => {
            await updateRecordStatus(todayStr, pendingSession.subject, pendingSession.start, 'absent');
            renderPendingAttendancePrompt();
            renderDashboard();
        };
        document.getElementById("dash-pending-cancel-btn").onclick = async () => {
            await updateRecordStatus(todayStr, pendingSession.subject, pendingSession.start, 'cancelled');
            renderPendingAttendancePrompt();
            renderDashboard();
        };
        
        container.classList.remove("hidden");
    } else {
        container.classList.add("hidden");
    }
}


// --- DASHBOARD BENTO WIDGETS ---

function renderDashboardSubjectSummary() {
    const box = document.getElementById("dash-subjects-list");
    if (!box) return;
    box.innerHTML = "";
    const subjectStats = calculateSubjectAttendance();
    const names = Object.keys(subjectStats);
    if (names.length === 0) {
        box.innerHTML = `<p class="text-[11px] text-on-surface-variant/50 text-center py-4">No subjects found.</p>`;
        return;
    }
    
    // We adjust the max height in index.html, but let's make it look nice
    names.forEach(name => {
        const stats = subjectStats[name];
        const minReq = stats.min_req || 75;
        
        let status = "Safe";
        let badgeColor = "bg-secondary/15 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(64,229,108,0.2)]";
        let barColor = "bg-secondary";
        
        if (stats.percent < minReq) {
            status = "Critical";
            badgeColor = "bg-error/15 text-error border border-error/20 shadow-[0_0_8px_rgba(255,82,82,0.2)]";
            barColor = "bg-error";
        } else if (stats.percent < 80) {
            status = "Warning";
            badgeColor = "bg-amber-500/15 text-amber-500 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
            barColor = "bg-amber-500";
        }
        
        // Calculate safe bunks or required classes
        const targetFraction = minReq / 100;
        let actionText = "";
        if (stats.percent >= minReq) {
            const safeBunks = Math.floor((stats.present - targetFraction * stats.total) / targetFraction);
            actionText = safeBunks > 0 ? `Can miss ${safeBunks} class${safeBunks !== 1 ? 'es' : ''}` : `Cannot miss classes`;
        } else {
            const classesNeeded = Math.ceil((targetFraction * stats.total - stats.present) / (1 - targetFraction));
            actionText = `Must attend next ${classesNeeded} class${classesNeeded !== 1 ? 'es' : ''}`;
        }
        
        const safeName = escapeHTML(name);
        const safeProf = escapeHTML(stats.prof || 'No Faculty');
        
        const row = document.createElement("div");
        row.className = "bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 space-y-1.5";
        row.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4 class="font-extrabold text-[12px] text-on-surface leading-tight truncate" title="${safeName}">${safeName}</h4>
                    </div>
                    <p class="text-[10px] text-on-surface-variant font-medium mt-0.5">${safeProf}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${badgeColor}">${status}</span>
                    <p class="text-[10px] text-on-surface font-extrabold mt-1">${stats.percent}%</p>
                </div>
            </div>
            <div class="flex justify-between items-center text-[10px] text-on-surface-variant font-semibold pt-1 border-t border-outline-variant/10">
                <span>Attended: <b class="text-on-surface font-extrabold">${stats.present}/${stats.total}</b></span>
                <div class="flex items-center gap-1.5">
                    <button onclick="openSyncModal(${stats.id})" class="text-primary hover:underline font-bold transition-all text-[9px]">
                        Post Past Attendance
                    </button>
                    <span class="opacity-30">|</span>
                    <span class="font-extrabold text-on-surface">${actionText}</span>
                </div>
            </div>
            <div class="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                <div class="h-full ${barColor} rounded-full transition-all duration-700" style="width:${stats.percent}%"></div>
            </div>
        `;
        box.appendChild(row);
    });
}

function renderDashboardRecentLogs() {
    const box = document.getElementById("dash-recent-logs");
    if (!box) return;
    box.innerHTML = "";
    const allLogs = [];
    Object.keys(appState.attendanceLogs).forEach(dateKey => {
        (appState.attendanceLogs[dateKey] || []).forEach(cls => {
            if (cls.status !== "upcoming") allLogs.push({ date: dateKey, ...cls });
        });
    });
    allLogs.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
    const recent = allLogs.slice(0, 5);
    if (recent.length === 0) {
        box.innerHTML = `<p class="text-[11px] text-on-surface-variant/50 text-center py-4">No attendance marked yet.</p>`;
        return;
    }
    const dotMap = { present: "bg-secondary", absent: "bg-error", cancelled: "bg-tertiary", holiday: "bg-outline" };
    const labelMap = { present: "Present", absent: "Absent", cancelled: "Cancelled", holiday: "Holiday" };
    recent.forEach(log => {
        const dot = dotMap[log.status] || "bg-primary";
        const label = labelMap[log.status] || log.status;
        const dateShort = new Date(log.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const item = document.createElement("div");
        item.className = "relative pl-1 mb-3 last:mb-0 flex justify-between items-center group";
        item.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full ${dot} border border-background"></div>
                <div class="flex justify-between items-center pr-2">
                    <span class="font-bold text-[11px] text-on-surface truncate max-w-[120px]" title="${log.subject}">${log.subject}</span>
                    <span class="text-[9px] text-on-surface-variant">${dateShort}</span>
                </div>
                <p class="text-[10px] text-on-surface-variant mt-0.5">Marked <span class="font-semibold text-on-surface">${label}</span></p>
            </div>
            <button onclick="undoAttendance('${log.date}', '${log.subject}', '${log.start}')" class="opacity-0 group-hover:opacity-100 p-1.5 bg-error/10 text-error hover:bg-error hover:text-white rounded-lg transition-all" title="Undo Attendance">
                <span class="material-symbols-outlined text-[14px]">undo</span>
            </button>
        `;
        box.appendChild(item);
    });
}

window.undoAttendance = async function(dateStr, subjectName, startStr) {
    if (!appState.attendanceLogs[dateStr]) return;
    
    // Find the log
    const cls = appState.attendanceLogs[dateStr].find(c => c.subject === subjectName && c.start === startStr);
    if (!cls) return;
    
    // Optimistic update
    cls.status = "upcoming";
    saveState();
    
    // Re-render UI immediately
    renderDashboardRecentLogs();
    renderDashboardSubjectSummary();
    updateSemesterDashboard();
    
    // Sync with backend
    try {
        await fetch(`${API_BASE_URL}/attendance/mark`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                ...getAuthHeaders() 
            },
            body: JSON.stringify({
                date: dateStr,
                subject_name: subjectName,
                start: startStr,
                status: "upcoming"
            })
        });
        showToast("Log Removed", `Undid attendance for ${subjectName}.`, "undo");
    } catch (err) {
        console.error("Failed to undo attendance:", err);
        showToast("Error", "Could not reach server to undo attendance.", "error");
    }
};

function renderDashboardAiInsights(global, analysis, displayStreak) {
    const box = document.getElementById("dash-ai-insight-box");
    if (!box) return;
    
    const subjectStats = calculateSubjectAttendance();
    const names = Object.keys(subjectStats);
    
    let criticalList = [];
    let safeList = [];
    let highestRiskSub = null;
    let lowestPct = 101;
    
    names.forEach(name => {
        const stats = subjectStats[name];
        if (stats.total === 0) return;
        
        const minReq = stats.min_req || 75;
        const targetFraction = minReq / 100;
        
        if (stats.percent < minReq) {
            const classesNeeded = Math.ceil((targetFraction * stats.total - stats.present) / (1 - targetFraction));
            criticalList.push({ name, percent: stats.percent, needed: classesNeeded, minReq });
            if (stats.percent < lowestPct) {
                lowestPct = stats.percent;
                highestRiskSub = name;
            }
        } else {
            const safeBunks = Math.floor((stats.present - targetFraction * stats.total) / targetFraction);
            if (safeBunks > 0) {
                safeList.push({ name, percent: stats.percent, bunks: safeBunks, minReq });
            }
        }
    });
    
    let suggestions = [];
    
    // 1. Highest risk suggestion
    if (highestRiskSub) {
        suggestions.push({
            type: "error",
            text: `<strong>${highestRiskSub}</strong> is currently your highest-risk subject at <strong class="text-error">${lowestPct}%</strong>.`,
            icon: "warning"
        });
    }
    
    // 2. Critical subjects steps to reach target
    criticalList.forEach(item => {
        suggestions.push({
            type: "error",
            text: `Attend your next <strong class="text-error">${item.needed}</strong> consecutive ${item.name} classes to reach ${item.minReq}%.`,
            icon: "priority_high"
        });
    });
    
    // 3. Safe subjects skips remaining
    safeList.forEach(item => {
        suggestions.push({
            type: "secondary",
            text: `You can safely miss <strong class="text-secondary">${item.bunks}</strong> ${item.name} class${item.bunks !== 1 ? 'es' : ''} and still remain above ${item.minReq}%.`,
            icon: "check_circle"
        });
    });
    
    // Fallback if list is empty
    if (suggestions.length === 0) {
        suggestions.push({
            type: "primary",
            text: `Start marking attendance to generate smart AI scheduling recommendations.`,
            icon: "insights"
        });
    }
    
    // Render top 3 suggestions
    let html = `<div class="space-y-2">`;
    suggestions.slice(0, 3).forEach(s => {
        let theme = "bg-primary/8 border-primary/20 text-on-surface-variant";
        let iconColor = "text-primary";
        if (s.type === "error") {
            theme = "bg-error/8 border-error/20 text-on-surface-variant";
            iconColor = "text-error";
        } else if (s.type === "secondary") {
            theme = "bg-secondary/8 border-secondary/20 text-on-surface-variant";
            iconColor = "text-secondary";
        }
        html += `
            <div class="border rounded-xl p-2.5 text-[11px] leading-normal flex items-start gap-2 ${theme}">
                <span class="material-symbols-outlined text-[15px] ${iconColor} mt-0.5">${s.icon}</span>
                <div class="flex-1">${s.text}</div>
            </div>
        `;
    });
    html += `</div>`;
    box.innerHTML = html;
}

/**
 * Normalize any date string to YYYY-MM-DD (ISO 8601) for <input type="date"> and backend.
 * Handles: YYYY-MM-DD, DD-MM-YYYY, D-M-YYYY, DD/MM/YYYY, D/M/YYYY
 */
function normalizeDateToISO(dateStr) {
    if (!dateStr) return "";
    dateStr = String(dateStr).trim();
    // Already ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // DD-MM-YYYY or D-M-YYYY (with dashes)
    const dashDMY = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashDMY) {
        const [, d, m, y] = dashDMY;
        return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    // DD/MM/YYYY or D/M/YYYY (with slashes)
    const slashDMY = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDMY) {
        const [, d, m, y] = slashDMY;
        return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    // Try native Date parse as last resort
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
    }
    return "";
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

// --- NEW HELPER ---
function ensureDailyScheduleReady(dateKey) {
    const parts = dateKey.split("-");
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = weekdays[d.getDay()];
    
    // Check if this date is an academic holiday
    const isAcademicHoliday = appState.holidays && appState.holidays.some(h => {
        const hDateStr = typeof h.date === "string" ? h.date : h.date.toISOString().split("T")[0];
        return hDateStr === dateKey;
    });
    
    // Get expected classes from timetable
    const dayClasses = appState.timetable.filter(c => c.day === dayName).map(c => ({...c}));
    
    let existingLogs = appState.attendanceLogs[dateKey] || [];
    
    // Merge expected classes with existing logs from backend
    let mergedLogs = dayClasses.map(c => {
        let existing = existingLogs.find(r => r.subject === c.subject && r.start === c.start);
        if (existing) {
            return {
                subject: c.subject,
                start: c.start,
                end: c.end || existing.end,
                status: existing.status,
                color: c.color
            };
        } else {
            return {
                subject: c.subject,
                start: c.start,
                end: c.end,
                status: isAcademicHoliday ? "holiday" : "upcoming",
                color: c.color
            };
        }
    });
    
    // Check if there are any existing logs that are NOT in the timetable
    existingLogs.forEach(el => {
        if (!mergedLogs.find(ml => ml.subject === el.subject && ml.start === el.start)) {
            mergedLogs.push({
                subject: el.subject,
                start: el.start,
                end: el.end,
                status: el.status,
                color: el.color
            });
        }
    });
    
    mergedLogs.sort((a, b) => {
        const timeA = parseInt(a.start.replace(":", ""));
        const timeB = parseInt(b.start.replace(":", ""));
        return timeA - timeB;
    });
    
    appState.attendanceLogs[dateKey] = mergedLogs;
    return mergedLogs;
}

// Quick action from dashboard card
async function quickMarkClassPresent(subject, start, end) {
    const todayStr = formatDateKey(new Date());
    ensureDailyScheduleReady(todayStr);
    
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
    
    let dayRecords = ensureDailyScheduleReady(dateKey);
    
    if (dayRecords.length === 0) {
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
        const isNonInstructional = ["holiday", "exam", "event"].includes(rec.status);

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
        } else if (rec.status === "exam") {
            borderAccent = "bg-amber-400/70";
            statusBadge = `<span class="px-2.5 py-0.5 bg-amber-400/15 text-amber-400 rounded-full text-[10px] uppercase font-bold tracking-wider border border-amber-400/20">📝 Exam Day</span>`;
        } else if (rec.status === "event") {
            borderAccent = "bg-blue-400/70";
            statusBadge = `<span class="px-2.5 py-0.5 bg-blue-400/15 text-blue-400 rounded-full text-[10px] uppercase font-bold tracking-wider border border-blue-400/20">🎉 College Event</span>`;
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

            ${ isNonInstructional
                ? `<!-- Non-instructional day: no attendance buttons -->
                   <div class="flex items-center gap-2 mt-3 pt-2 border-t border-outline-variant/30 text-on-surface-variant text-[11px]">
                       <span class="material-symbols-outlined text-[14px]">info</span>
                       <span>Attendance not counted on this day.</span>
                   </div>`
                : `<!-- Quick status logger buttons -->
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
                   </div>`
            }
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
    
    // Populate subject select for AI Predictor (Checklist Section 1.5)
    const predSelect = document.getElementById("predict-subject-select");
    if (predSelect) {
        predSelect.innerHTML = `<option value="all">Overall Semester</option>`;
        appState.subjects.forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.name;
            opt.textContent = sub.name;
            predSelect.appendChild(opt);
        });
    }

    // Subject progress bars rendering
    const subjectsBox = document.getElementById("analytics-subjects-list");
    subjectsBox.innerHTML = "";
    
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        const minReq = stats.min_req || 75;
        
        const row = document.createElement("div");
        let accentBorder = "border-l-primary";
        let fillProgressColor = "bg-primary";
        let warningBadge = "";
        
        const status = stats.percent >= 80 ? 'Safe' : stats.percent >= minReq ? 'Warning' : 'Critical';
        
        if (status === 'Critical') {
            accentBorder = "border-l-error";
            fillProgressColor = "bg-error";
            warningBadge = `
                <div class="flex items-center gap-0.5 text-error text-[10px] font-bold uppercase animate-pulse">
                    <span class="material-symbols-outlined text-[12px]">priority_high</span> Critical
                </div>
            `;
        } else if (status === 'Warning') {
            accentBorder = "border-l-amber-500";
            fillProgressColor = "bg-amber-500";
            warningBadge = `
                <div class="flex items-center gap-0.5 text-amber-500 text-[10px] font-bold uppercase">
                    <span class="material-symbols-outlined text-[12px]">warning</span> Warning
                </div>
            `;
        } else {
            accentBorder = "border-l-secondary";
            fillProgressColor = "bg-secondary";
            warningBadge = `
                <div class="flex items-center gap-0.5 text-secondary text-[10px] font-bold uppercase">
                    <span class="material-symbols-outlined text-[12px]">check_circle</span> Safe
                </div>
            `;
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
                    <span>Target: ${minReq}%</span>
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
    // Column 15 (rightmost) = current week; column 0 = 15 weeks ago
    const today = new Date();
    const currentDayIdx = today.getDay(); // 0 = Sun
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + (currentDayIdx === 0 ? -6 : 1 - currentDayIdx));
    // Start Monday = 15 weeks before current Monday
    const startMonday = new Date(currentMonday);
    startMonday.setDate(currentMonday.getDate() - 15 * 7);

    for (let c = 0; c < 16; c++) {
        const col = document.createElement("div");
        col.className = "flex flex-col gap-1";
        
        for (let r = 0; r < 7; r++) {
            const cellDate = new Date(startMonday);
            cellDate.setDate(startMonday.getDate() + (c * 7 + r));
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
    const subSelect = document.getElementById("predict-subject-select");
    const subVal = subSelect ? subSelect.value : "all";
    
    const attendVal = parseInt(document.getElementById("predict-attend-input").value) || 0;
    const missVal = parseInt(document.getElementById("predict-miss-input").value) || 0;
    
    const percentEl = document.getElementById("prediction-result-percent");
    const statusEl = document.getElementById("prediction-result-status");
    
    if (subVal === "all") {
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
    } else {
        // Subject-specific prediction (local calculation based on Subject stats)
        const subjectStats = calculateSubjectAttendance();
        const stats = subjectStats[subVal];
        
        if (!stats) {
            percentEl.textContent = "--%";
            statusEl.textContent = "No Data";
            statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-highest text-on-surface-variant";
            return;
        }
        
        const newPresent = stats.present + attendVal;
        const newTotal = stats.total + attendVal + missVal;
        const newPercent = newTotal > 0 ? (newPresent / newTotal * 100) : 0;
        
        const targetGoal = stats.min_req || 75;
        
        percentEl.textContent = `${newPercent.toFixed(1)}%`;
        if (attendVal === 0 && missVal === 0) {
            statusEl.textContent = "No Input";
            statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-highest text-on-surface-variant";
        } else if (newPercent >= targetGoal) {
            statusEl.textContent = "Target Met";
            statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(64,229,108,0.2)]";
        } else {
            statusEl.textContent = "Below Target";
            statusEl.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20 shadow-[0_0_8px_rgba(255,82,82,0.2)]";
        }
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
        
        // Highlight academic calendar events
        const holidayEvent = appState.holidays && appState.holidays.find(h => {
            const hDateStr = typeof h.date === "string" ? h.date : h.date.toISOString().split("T")[0];
            return hDateStr === dateKey;
        });
        
        const cell = document.createElement("div");
        
        let cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer hover:bg-surface-container-highest/20 rounded-xl transition-colors text-[12px] font-semibold";
        if (isSelected) {
            cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer bg-primary-container/20 rounded-xl border border-primary/40 text-primary font-extrabold shadow-[0_0_8px_rgba(124,77,255,0.2)]";
        } else if (isToday) {
            cellClass = "h-10 flex flex-col items-center justify-center relative cursor-pointer bg-zinc-900 border border-outline-variant/60 rounded-xl text-on-surface font-extrabold";
        } else if (holidayEvent) {
            const type = holidayEvent.type || "Holiday";
            if (type.includes("Exam")) {
                cellClass += " bg-error/10 border border-error/30 text-error";
            } else if (type.includes("Break") || type.includes("Study")) {
                cellClass += " bg-warning/10 border border-warning/30 text-warning";
            } else if (type.includes("Event")) {
                cellClass += " bg-primary/10 border border-primary/30 text-primary";
            } else {
                cellClass += " bg-surface-container-high/50 border border-outline-variant/30 text-on-surface-variant/70";
            }
        } else if (isLeaveDay) {
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
    const dayName = weekdayNames[selDate.getDay()];
    
    detailTitle.textContent = `${monthNames[selDate.getMonth()]} ${selDate.getDate()}, ${selDate.getFullYear()}`;
    detailPill.textContent = dayName;
    
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
    
    // Highlight academic calendar events inside detail panel
    const academicHoliday = appState.holidays && appState.holidays.find(h => {
        const hDateStr = typeof h.date === "string" ? h.date : h.date.toISOString().split("T")[0];
        return hDateStr === selectedCalendarDateStr;
    });
    
    if (academicHoliday) {
        const holidayItem = document.createElement("div");
        holidayItem.className = `p-3 rounded-xl flex items-center justify-between mb-3 border border-outline-variant bg-surface-container`;
        holidayItem.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[18px]">festival</span>
                <div>
                    <p class="font-bold text-[12px] leading-tight">${academicHoliday.name}</p>
                    <p class="text-[9px] uppercase font-bold tracking-wider text-primary">${academicHoliday.type}</p>
                </div>
            </div>
            <span class="text-[9px] font-bold text-on-surface-variant">Academic Event</span>
        `;
        classesContainer.appendChild(holidayItem);
    }
    
    // Sunday check
    if (dayName === "Sunday") {
        classesContainer.appendChild(Object.assign(document.createElement("div"), {
            className: "text-center py-6 glass-card rounded-2xl p-4",
            innerHTML: `
                <span class="material-symbols-outlined text-[32px] text-on-surface-variant/40">bedtime</span>
                <p class="text-on-surface-variant font-bold text-[13px] mt-1">Sunday Holiday</p>
                <p class="text-[10px] text-on-surface-variant/80 mt-0.5">No lectures scheduled. Enjoy your weekend!</p>
            `
        }));
        return;
    }
    
    // Make sure we have the schedule populated from timetable
    const dayLogs = ensureDailyScheduleReady(selectedCalendarDateStr);
    
    if (!dayLogs || dayLogs.length === 0) {
        classesContainer.appendChild(Object.assign(document.createElement("div"), {
            className: "text-center py-6 glass-card rounded-2xl p-4",
            innerHTML: `
                <span class="material-symbols-outlined text-[32px] text-on-surface-variant/40">event_busy</span>
                <p class="text-on-surface-variant font-bold text-[13px] mt-1">No Scheduled Classes</p>
                <p class="text-[10px] text-on-surface-variant/80 mt-0.5">Your timetable has no lectures configured for ${dayName}s.</p>
            `
        }));
        return;
    }
    
    dayLogs.forEach(rec => {
        const item = document.createElement("div");
        const subjectObj = appState.subjects.find(s => s.name === rec.subject);
        const subjectColor = subjectObj ? subjectObj.color : rec.color || "#cdbdff";
        
        item.className = "relative bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden p-3.5 space-y-2.5 transition-all duration-300";
        item.style.borderLeftColor = subjectColor;
        item.style.borderLeftWidth = "4px";
        item.style.borderLeftStyle = "solid";
        
        let statusBadge = `<span class="px-2 py-0.5 bg-surface-container-highest text-on-surface-variant rounded-full text-[9px] uppercase font-bold tracking-wider">Upcoming</span>`;
        if (rec.status === "present") {
            statusBadge = `<span class="px-2 py-0.5 bg-secondary/15 text-secondary rounded-full text-[9px] uppercase font-bold tracking-wider border border-secondary/20">Present</span>`;
        } else if (rec.status === "absent") {
            statusBadge = `<span class="px-2 py-0.5 bg-error/15 text-error rounded-full text-[9px] uppercase font-bold tracking-wider border border-error/20">Absent</span>`;
        } else if (rec.status === "cancelled") {
            statusBadge = `<span class="px-2 py-0.5 bg-tertiary/15 text-on-tertiary-container rounded-full text-[9px] uppercase font-bold tracking-wider border border-tertiary/20">Cancelled</span>`;
        } else if (rec.status === "holiday") {
            statusBadge = `<span class="px-2 py-0.5 bg-outline-variant/15 text-on-surface-variant rounded-full text-[9px] uppercase font-bold tracking-wider border border-outline-variant/20">Holiday</span>`;
        }
        
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-[13px] text-on-surface leading-tight">${rec.subject}</h4>
                    <p class="text-[11px] text-on-surface-variant font-label-sm mt-0.5">${formatTimeAmPm(rec.start)} - ${formatTimeAmPm(rec.end)}</p>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
            <div class="grid grid-cols-4 gap-1 pt-1.5 border-t border-outline-variant/30">
                <button class="${rec.status === 'present' ? 'bg-secondary text-zinc-950 font-bold' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center py-1 rounded-lg text-[8px] active:scale-95 transition-all" onclick="updateCalendarRecordStatus('${selectedCalendarDateStr}', '${rec.subject}', '${rec.start}', 'present')">
                    <span>PRESENT</span>
                </button>
                <button class="${rec.status === 'absent' ? 'bg-error text-zinc-950 font-bold' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center py-1 rounded-lg text-[8px] active:scale-95 transition-all" onclick="updateCalendarRecordStatus('${selectedCalendarDateStr}', '${rec.subject}', '${rec.start}', 'absent')">
                    <span>ABSENT</span>
                </button>
                <button class="${rec.status === 'cancelled' ? 'bg-tertiary text-zinc-950 font-bold' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center py-1 rounded-lg text-[8px] active:scale-95 transition-all" onclick="updateCalendarRecordStatus('${selectedCalendarDateStr}', '${rec.subject}', '${rec.start}', 'cancelled')">
                    <span>CANCEL</span>
                </button>
                <button class="${rec.status === 'holiday' ? 'bg-on-surface-variant text-zinc-950 font-bold' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'} flex flex-col items-center justify-center py-1 rounded-lg text-[8px] active:scale-95 transition-all" onclick="updateCalendarRecordStatus('${selectedCalendarDateStr}', '${rec.subject}', '${rec.start}', 'holiday')">
                    <span>HOLIDAY</span>
                </button>
            </div>
        `;
        classesContainer.appendChild(item);
    });
}

async function updateCalendarRecordStatus(dateKey, subject, start, status) {
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
                await refreshStreakFromBackend();
            } catch (e) {
                console.error("Failed to sync attendance", e);
            }
            
            renderCalendarSelectedDayDetails();
            renderCalendarGrid();
            renderCalendarMonthStats();
            showToast("Log Updated", `Marked ${subject} as ${status.toUpperCase()}.`, "done");
        }
    }
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
// --- F. PROFILE SETTINGS DIALOG ---
let tempProfilePhotoBase64 = null;
let currentPinBuffer = "";

function openProfileModal() {
    document.getElementById("form-profile-name").value = appState.profile.name || "";
    document.getElementById("form-profile-target").value = appState.profile.targetGoal || 75;
    document.getElementById("form-profile-term").value = appState.profile.term || "";
    document.getElementById("form-profile-roll").value = appState.profile.roll_number || "";
    document.getElementById("form-profile-register-num").value = appState.profile.register_number || "";
    document.getElementById("form-profile-year").value = appState.profile.year || "";
    document.getElementById("form-profile-section").value = appState.profile.section || "";
    document.getElementById("form-profile-branch").value = appState.profile.branch || "";
    document.getElementById("form-profile-college").value = appState.profile.college || "";
    document.getElementById("form-profile-university").value = appState.profile.university || "";
    
    if (appState.profile.profile_photo) {
        document.getElementById("form-profile-photo-img").src = appState.profile.profile_photo;
    } else {
        document.getElementById("form-profile-photo-img").src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop";
    }
    
    // Preferences
    document.getElementById("form-profile-pin-enabled").checked = localStorage.getItem("pin_enabled") === "true";
    document.getElementById("form-profile-pin-code").value = localStorage.getItem("pin_code") || "";
    document.getElementById("form-profile-accent").value = localStorage.getItem("accent_color") || "purple";
    document.getElementById("form-profile-theme").value = localStorage.getItem("theme") || "dark";
    document.getElementById("form-profile-widget-enabled").checked = localStorage.getItem("widget_enabled") === "true";
    document.getElementById("form-profile-lang").value = localStorage.getItem("lang") || "en";
    
    tempProfilePhotoBase64 = appState.profile.profile_photo || null;
    
    toggleModal("profileModal");
}

async function saveProfileSettings(e) {
    e.preventDefault();
    const name = document.getElementById("form-profile-name").value.trim();
    const targetGoal = parseInt(document.getElementById("form-profile-target").value);
    const term = document.getElementById("form-profile-term").value;
    const roll = document.getElementById("form-profile-roll").value.trim();
    const registerNum = document.getElementById("form-profile-register-num").value.trim();
    const year = document.getElementById("form-profile-year").value.trim();
    const section = document.getElementById("form-profile-section").value.trim();
    const branch = document.getElementById("form-profile-branch").value.trim();
    const college = document.getElementById("form-profile-college").value.trim();
    const university = document.getElementById("form-profile-university").value.trim();
    
    const pinEnabled = document.getElementById("form-profile-pin-enabled").checked;
    const pinCode = document.getElementById("form-profile-pin-code").value.trim();
    const accentVal = document.getElementById("form-profile-accent").value;
    const themeVal = document.getElementById("form-profile-theme").value;
    const widgetEnabled = document.getElementById("form-profile-widget-enabled").checked;
    const langVal = document.getElementById("form-profile-lang").value;
    
    if (pinEnabled && pinCode.length !== 4) {
        showToast("Invalid PIN", "PIN code must be exactly 4 digits.", "warning");
        return;
    }
    
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
                semester: term,
                college: college,
                branch: branch,
                roll_number: roll,
                section: section,
                year: year,
                register_number: registerNum,
                university: university,
                profile_photo: tempProfilePhotoBase64
            })
        });
        
        if (response.ok) {
            appState.profile.name = name;
            appState.profile.targetGoal = targetGoal;
            appState.profile.term = term;
            appState.profile.college = college;
            appState.profile.branch = branch;
            appState.profile.roll_number = roll;
            appState.profile.section = section;
            appState.profile.year = year;
            appState.profile.register_number = registerNum;
            appState.profile.university = university;
            appState.profile.profile_photo = tempProfilePhotoBase64;
            
            // Save preferences
            localStorage.setItem("pin_enabled", pinEnabled ? "true" : "false");
            localStorage.setItem("pin_code", pinCode);
            localStorage.setItem("theme", themeVal);
            localStorage.setItem("accent_color", accentVal);
            localStorage.setItem("widget_enabled", widgetEnabled ? "true" : "false");
            localStorage.setItem("lang", langVal);
            
            // Apply preferences immediately
            applyTheme(themeVal);
            applyAccentColor(accentVal);
            applyLanguage(langVal);
            toggleFloatingWidget(widgetEnabled);
            
            // Render avatar changes
            const avatarImg = document.getElementById("header-avatar-img");
            const avatarIcon = document.getElementById("header-avatar-icon");
            if (tempProfilePhotoBase64) {
                if (avatarImg) {
                    avatarImg.src = tempProfilePhotoBase64;
                    avatarImg.classList.remove("hidden");
                }
                if (avatarIcon) avatarIcon.classList.add("hidden");
            } else {
                if (avatarImg) avatarImg.classList.add("hidden");
                if (avatarIcon) avatarIcon.classList.remove("hidden");
            }
            
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

function handleProfilePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        showToast("File Too Large", "Profile picture must be under 2MB.", "error");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        tempProfilePhotoBase64 = evt.target.result;
        document.getElementById("form-profile-photo-img").src = tempProfilePhotoBase64;
        showToast("Photo Selected", "Press Save Changes to update permanently.", "check_circle");
    };
    reader.readAsDataURL(file);
}

async function deleteUserAccount() {
    if (!confirm("Are you absolutely sure you want to delete your account? This action is permanent and all attendance logs, timetable versions, and academic semesters will be deleted forever!")) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/user/profile`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showToast("Account Deleted", "Your account has been deleted successfully.", "check_circle");
            localStorage.removeItem("access_token");
            localStorage.removeItem("pin_enabled");
            localStorage.removeItem("pin_code");
            localStorage.removeItem("theme");
            localStorage.removeItem("accent_color");
            localStorage.removeItem("widget_enabled");
            localStorage.removeItem("lang");
            
            toggleModal("profileModal");
            showAuthScreen();
        } else {
            showToast("Deletion Failed", "Failed to delete account from backend database.", "error");
        }
    } catch (err) {
        console.error("Deletion error:", err);
        showToast("Error", "Could not connect to backend server.", "error");
    }
}

// Preference Appliers
function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
    } else {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
    }
    localStorage.setItem("theme", theme);
}

function applyAccentColor(accent) {
    let primary, secondary, primaryContainer, onPrimaryFixed;
    if (accent === "green") {
        primary = "#a7f3d0";
        secondary = "#34d399";
        primaryContainer = "#047857";
        onPrimaryFixed = "#064e3b";
    } else if (accent === "amber") {
        primary = "#fde68a";
        secondary = "#fbbf24";
        primaryContainer = "#b45309";
        onPrimaryFixed = "#78350f";
    } else if (accent === "cyan") {
        primary = "#a5f3fc";
        secondary = "#22d3ee";
        primaryContainer = "#0891b2";
        onPrimaryFixed = "#083344";
    } else { // purple default
        primary = "#cdbdff";
        secondary = "#40e56c";
        primaryContainer = "#7c4dff";
        onPrimaryFixed = "#20005f";
    }
    
    if (window.tailwind) {
        window.tailwind.config.theme.extend.colors.primary = primary;
        window.tailwind.config.theme.extend.colors.secondary = secondary;
        window.tailwind.config.theme.extend.colors["primary-container"] = primaryContainer;
        window.tailwind.config.theme.extend.colors["on-primary-fixed"] = onPrimaryFixed;
    }
    localStorage.setItem("accent_color", accent);
}

const LOCALIZATION = {
    en: {
        dashboard: "Dashboard",
        daily: "Daily Checklist",
        analytics: "Analytics",
        reports: "Reports",
        schedule: "Schedule",
        overview_subtitle: "Overview of your attendance performance",
        daily_subtitle: "Track today's class-by-class attendance status",
        analytics_subtitle: "Deep-dive subject-wise and historical insights",
        reports_subtitle: "Export attendance certificates and PDF summaries",
        schedule_subtitle: "Timetable grid and version management"
    },
    te: {
        dashboard: "డ్యాష్‌బోర్డ్",
        daily: "రోజువారీ చెక్‌లిస్ట్",
        analytics: "విశ్లేషణలు",
        reports: "నివేదికలు",
        schedule: "సమయపట్టిక",
        overview_subtitle: "మీ హాజరు పనితీరు యొక్క అవలోకనం",
        daily_subtitle: "ఈ రోజు తరగతి వారీగా హాజరు స్థితిని ట్రాక్ చేయండి",
        analytics_subtitle: "సబ్జెక్ట్ వారీగా మరియు చారిత్రక అంతర్దృష్టులు",
        reports_subtitle: "PDF సారాంశాలను డౌన్‌లోड చేసుకోండి",
        schedule_subtitle: "సమయపట్టిక గ్రిడ్ మరియు వెర్షన్ల నిర్వహణ"
    },
    hi: {
        dashboard: "डैशबोर्ड",
        daily: "दैनिक चेकलिस्ट",
        analytics: "विश्लेषण",
        reports: "रिपोर्ट्स",
        schedule: "समय-सारणी",
        overview_subtitle: "आपकी उपस्थिति के प्रदर्शन का अवलोकन",
        daily_subtitle: "आज की कक्षा-वार उपस्थिति स्थिति को ट्रैक करें",
        analytics_subtitle: "विषय-वार और ऐतिहासिक विस्तृत जानकारी",
        reports_subtitle: "पीडीएफ सारांश निर्यात करें",
        schedule_subtitle: "समय-सारणी ग्रिड और प्रबंधन"
    },
    es: {
        dashboard: "Tablero",
        daily: "Lista Diaria",
        analytics: "Analítica",
        reports: "Informes",
        schedule: "Horario",
        overview_subtitle: "Descripción general de su rendimiento de asistencia",
        daily_subtitle: "Seguimiento de asistencia hoy",
        analytics_subtitle: "Información detallada por tema e histórica",
        reports_subtitle: "Exportar resúmenes en PDF",
        schedule_subtitle: "Cuadrícula de horarios y gestión"
    }
};

function applyLanguage(lang) {
    const dict = LOCALIZATION[lang] || LOCALIZATION.en;
    
    const navDashboard = document.getElementById("nav-btn-dashboard");
    const navDaily = document.getElementById("nav-btn-daily");
    const navAnalytics = document.getElementById("nav-btn-analytics");
    const navReports = document.getElementById("nav-btn-reports");
    const navSchedule = document.getElementById("nav-btn-schedule");
    
    if (navDashboard) {
        navDashboard.innerHTML = `<span class="material-symbols-outlined text-[18px]">dashboard</span> ${dict.dashboard}`;
    }
    if (navDaily) {
        navDaily.innerHTML = `<span class="material-symbols-outlined text-[18px]">rule</span> ${dict.daily}`;
    }
    if (navAnalytics) {
        navAnalytics.innerHTML = `<span class="material-symbols-outlined text-[18px]">insights</span> ${dict.analytics}`;
    }
    if (navReports) {
        navReports.innerHTML = `<span class="material-symbols-outlined text-[18px]">description</span> ${dict.reports}`;
    }
    if (navSchedule) {
        navSchedule.innerHTML = `<span class="material-symbols-outlined text-[18px]">calendar_today</span> ${dict.schedule}`;
    }
    
    const activeTabTitle = document.getElementById("page-title");
    const activeTabSubtitle = document.getElementById("page-subtitle");
    if (activeTabTitle && activeTabSubtitle) {
        if (currentTab === "dashboard") {
            activeTabTitle.textContent = dict.dashboard;
            activeTabSubtitle.textContent = dict.overview_subtitle;
        } else if (currentTab === "daily") {
            activeTabTitle.textContent = dict.daily;
            activeTabSubtitle.textContent = dict.daily_subtitle;
        } else if (currentTab === "analytics") {
            activeTabTitle.textContent = dict.analytics;
            activeTabSubtitle.textContent = dict.analytics_subtitle;
        } else if (currentTab === "reports") {
            activeTabTitle.textContent = dict.reports;
            activeTabSubtitle.textContent = dict.reports_subtitle;
        } else if (currentTab === "schedule") {
            activeTabTitle.textContent = dict.schedule;
            activeTabSubtitle.textContent = dict.schedule_subtitle;
        }
    }
    localStorage.setItem("lang", lang);
}

function toggleFloatingWidget(checked) {
    const widget = document.getElementById("floating-widget-preview");
    if (!widget) return;
    
    if (checked) {
        widget.classList.remove("hidden");
        updateFloatingWidgetData();
    } else {
        widget.classList.add("hidden");
    }
    localStorage.setItem("widget_enabled", checked ? "true" : "false");
    
    const chk = document.getElementById("form-profile-widget-enabled");
    if (chk) chk.checked = checked;
}

function updateFloatingWidgetData() {
    const pctEl = document.getElementById("widget-overall-pct");
    const remEl = document.getElementById("widget-classes-rem");
    const currentClassEl = document.getElementById("widget-current-class");
    const countdownEl = document.getElementById("widget-countdown");
    const warningBanner = document.getElementById("widget-warning-banner");
    
    if (!pctEl) return;
    
    const global = calculateGlobalAttendance();
    pctEl.textContent = `${global.percentage}%`;
    
    if (global.percentage >= appState.profile.targetGoal) {
        pctEl.className = "font-extrabold text-[22px] text-secondary";
        if (warningBanner) warningBanner.classList.add("hidden");
    } else {
        pctEl.className = "font-extrabold text-[22px] text-error";
        if (warningBanner) {
            warningBanner.classList.remove("hidden");
            warningBanner.textContent = `CRITICAL: Attendance below ${appState.profile.targetGoal}%!`;
        }
    }
    
    let totalExpectedClasses = 0;
    let totalRemainingClasses = 0;
    if (appState.activeSemester) {
        const startDate = new Date(appState.activeSemester.start_date + "T00:00:00");
        const endDate = new Date(appState.activeSemester.end_date + "T00:00:00");
        const today = new Date();
        today.setHours(0,0,0,0);
        const holidays = getCombinedHolidayDates();
        const remainingStart = today > startDate ? today : startDate;
        
        const uniqueSubjects = Array.from(new Set(appState.timetable.map(t => t.subject)));
        uniqueSubjects.forEach(subName => {
            if (subName.toLowerCase().includes("break") || subName.toLowerCase().includes("recess")) return;
            totalExpectedClasses += calculateSubjectExpectedClasses(subName, startDate, endDate, holidays, appState.timetable);
            totalRemainingClasses += today > endDate ? 0 : calculateSubjectExpectedClasses(subName, remainingStart, endDate, holidays, appState.timetable);
        });
        remEl.textContent = `${totalRemainingClasses} Classes Left`;
    } else {
        remEl.textContent = "0 Classes Left";
    }
    
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const dayStr = weekdays[today.getDay()];
    const todayClasses = appState.timetable.filter(c => c.day === dayStr);
    
    const nowStr = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
    const activeClass = todayClasses.find(c => c.start <= nowStr && c.end >= nowStr);
    if (activeClass) {
        currentClassEl.textContent = activeClass.subject;
        const [endH, endM] = activeClass.end.split(":").map(Number);
        const minutesLeft = (endH * 60 + endM) - (today.getHours() * 60 + today.getMinutes());
        countdownEl.textContent = `${minutesLeft} min remaining`;
        countdownEl.classList.remove("hidden");
    } else {
        const nextClass = todayClasses.filter(c => c.start > nowStr).sort((a, b) => a.start.localeCompare(b.start))[0];
        if (nextClass) {
            currentClassEl.textContent = `Next: ${nextClass.subject}`;
            const [startH, startM] = nextClass.start.split(":").map(Number);
            const minutesToStart = (startH * 60 + startM) - (today.getHours() * 60 + today.getMinutes());
            if (minutesToStart > 60) {
                const hrs = Math.floor(minutesToStart / 60);
                countdownEl.textContent = `starts in ${hrs} hr`;
            } else {
                countdownEl.textContent = `starts in ${minutesToStart} min`;
            }
            countdownEl.classList.remove("hidden");
        } else {
            currentClassEl.textContent = "Free Period";
            countdownEl.classList.add("hidden");
        }
    }
}

// PIN Keypad functions
function pressPinNum(num) {
    const pinCode = localStorage.getItem("pin_code") || "1234";
    if (currentPinBuffer.length < 4) {
        currentPinBuffer += num;
        updatePinDots();
        
        if (currentPinBuffer.length === 4) {
            setTimeout(() => {
                if (currentPinBuffer === pinCode) {
                    const overlay = document.getElementById("pinLockOverlay");
                    if (overlay) overlay.classList.add("hidden");
                    currentPinBuffer = "";
                    updatePinDots();
                    showToast("Access Granted", "PIN authentication successful.", "check_circle");
                } else {
                    currentPinBuffer = "";
                    updatePinDots();
                    showToast("Access Denied", "Incorrect Security PIN code entered.", "error");
                    const prompt = document.getElementById("pin-lock-prompt");
                    if (prompt) {
                        prompt.textContent = "Incorrect PIN. Try again!";
                        prompt.classList.add("text-error");
                        setTimeout(() => {
                            prompt.textContent = "Enter your 4-digit security PIN";
                            prompt.classList.remove("text-error");
                        }, 2000);
                    }
                }
            }, 300);
        }
    }
}

function simulateBiometricUnlock() {
    showToast("Biometric Auth", "Verifying face/fingerprint credentials...", "insights");
    setTimeout(() => {
        const overlay = document.getElementById("pinLockOverlay");
        if (overlay) overlay.classList.add("hidden");
        currentPinBuffer = "";
        updatePinDots();
        showToast("Access Granted", "Biometric verification successful.", "check_circle");
    }, 1000);
}

function clearPinInput() {
    if (currentPinBuffer.length > 0) {
        currentPinBuffer = currentPinBuffer.slice(0, -1);
        updatePinDots();
    }
}

function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (dot) {
            if (i <= currentPinBuffer.length) {
                dot.className = "w-3.5 h-3.5 rounded-full bg-primary border-2 border-primary shadow-[0_0_8px_rgba(124,77,255,0.6)] transition-all";
            } else {
                dot.className = "w-3.5 h-3.5 rounded-full border-2 border-outline-variant/60 bg-transparent transition-all";
            }
        }
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(`${API_BASE_URL}/leave_plans`, {
            headers: getAuthHeaders(),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
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
        item.className = `p-3 rounded-xl border border-outline-variant/20 hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0 w-full ${n.read ? 'opacity-60' : 'bg-primary/5 border-primary/20'}`;
        
        let iconSymbol = "notifications";
        let iconColor = "text-primary";
        if (n.type === "warning") { iconSymbol = "warning"; iconColor = "text-error"; }
        else if (n.type === "success") { iconSymbol = "check_circle"; iconColor = "text-secondary"; }
        
        item.innerHTML = `
            <div class="flex items-start gap-2.5 w-full">
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
    
    // 2. Subject-wise notifications (Checklist Section 1.5)
    const subjectStats = calculateSubjectAttendance();
    Object.keys(subjectStats).forEach(name => {
        const stats = subjectStats[name];
        if (stats.total === 0) return;
        
        const minReq = stats.min_req || 75;
        
        if (stats.percent < minReq) {
            addNotification(
                "Critical Attendance",
                `Your attendance in "${name}" is at ${stats.percent}%, which is below the mandatory ${minReq}% limit.`,
                "warning"
            );
        } else if (stats.percent === minReq) {
            addNotification(
                "Borderline Attendance",
                `Borderline: Your attendance in "${name}" is exactly ${minReq}%. One bunk could drop it!`,
                "warning"
            );
        } else if (stats.percent > minReq && stats.percent <= minReq + 3) {
            addNotification(
                "Safe Attendance Reached",
                `Well done! Your attendance in "${name}" is back above the ${minReq}% threshold (currently ${stats.percent}%).`,
                "success"
            );
        }
        
        // One class away from falling below target
        const nextTotal = stats.total + 1;
        const nextPercent = Math.round((stats.present / nextTotal) * 100);
        if (stats.percent >= minReq && nextPercent < minReq) {
            addNotification(
                "At Risk of Shortage",
                `Warning: Missing one more class in "${name}" will drop you below ${minReq}% (predicted: ${nextPercent}%).`,
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
    
    // 4. End-of-week attendance summary (Friday/Saturday/Sunday)
    if (dayName === "Fri" || dayName === "Sat" || dayName === "Sun") {
        addNotification(
            "Weekly Attendance Summary",
            `It's the end of the week! Review your subject-wise standings in the Analytics tab to ensure all subjects remain above 75%.`,
            "info"
        );
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
    
    const nonInstructionalDates = new Set(getCombinedHolidayDates());
    const skipStatuses = new Set(["holiday", "exam", "event", "cancelled"]);

    Object.keys(appState.attendanceLogs).forEach(dateKey => {
        if (dateKey >= sStr && dateKey <= eStr) {
            // Skip entire non-instructional days from report totals
            const isNonInstructional = nonInstructionalDates.has(dateKey);
            dailyLog[dateKey] = [];
            appState.attendanceLogs[dateKey].forEach(rec => {
                // Holiday/exam/event records: add to dailyLog for display but don't count in totals
                if (!isNonInstructional && !skipStatuses.has(rec.status)) {
                    if (rec.status === "present") present++;
                    if (rec.status === "absent") absent++;
                } else if (rec.status === "cancelled") {
                    cancelled++;
                } else if (["holiday", "exam", "event"].includes(rec.status)) {
                    holidays++;
                }

                if (subjectStats[rec.subject] && !isNonInstructional && !skipStatuses.has(rec.status)) {
                    if (rec.status === "present") {
                        subjectStats[rec.subject].present++;
                        subjectStats[rec.subject].total++;
                    } else if (rec.status === "absent") {
                        subjectStats[rec.subject].absent++;
                        subjectStats[rec.subject].total++;
                    }
                }

                dailyLog[dateKey].push({ subject: rec.subject, status: rec.status });
            });
        }
    });
    
    if (period === "semester") {
        appState.subjects.forEach(sub => {
            if (subjectStats[sub.name]) {
                const w = getSubjectWeight(sub);
                subjectStats[sub.name].present += (sub.baseline_attended || 0) * w;
                subjectStats[sub.name].total += (sub.baseline_conducted || 0) * w;
                subjectStats[sub.name].absent += ((sub.baseline_conducted || 0) - (sub.baseline_attended || 0)) * w;
                
                present += (sub.baseline_attended || 0) * w;
                absent += ((sub.baseline_conducted || 0) - (sub.baseline_attended || 0)) * w;
            }
        });
    }
    
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
// 13. ONBOARDING WIZARD & CALENDAR PARSER CONTROLLERS
// ============================================================================

let selectedObTtFile = null;
let selectedObCalFile = null;
let currentOnboardingStep = 1;
let parsedCalendarData = null;

function goToOnboardingStep(stepNum) {
    currentOnboardingStep = stepNum;
    
    // Hide all steps
    document.getElementById("ob-step-1").classList.add("hidden");
    document.getElementById("ob-step-2").classList.add("hidden");
    document.getElementById("ob-step-3").classList.add("hidden");
    document.getElementById("ob-step-4").classList.add("hidden");
    
    // Show current step
    document.getElementById(`ob-step-${stepNum}`).classList.remove("hidden");
    
    // Update step dots
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        if (!dot) continue;
        const span = dot.querySelector("span");
        if (!span) continue;
        
        if (i < stepNum) {
            dot.className = "text-success flex items-center gap-1";
            span.className = "w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-[10px]";
            span.innerHTML = '<span class="material-symbols-outlined text-[12px]">check</span>';
        } else if (i === stepNum) {
            dot.className = "text-primary flex items-center gap-1";
            span.className = "w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]";
            span.textContent = i;
        } else {
            dot.className = "flex items-center gap-1 text-on-surface-variant/50";
            span.className = "w-5 h-5 rounded-full bg-surface-container-highest flex items-center justify-center text-[10px]";
            span.textContent = i;
        }
    }
    
    // Prefill Step 1 details if available
    if (stepNum === 1 && appState.profile) {
        document.getElementById("ob-college").value = appState.profile.college || "";
        document.getElementById("ob-branch").value = appState.profile.branch || "";
        document.getElementById("ob-semester").value = appState.profile.term || "Semester 1";
        document.getElementById("ob-goal").value = appState.profile.targetGoal || 75;
    }
}

// Timetable drag/drop
function handleObTtDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById("ob-tt-dropzone");
    if (dropzone) dropzone.classList.remove("border-primary", "bg-primary/5");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        updateObTtFileStatus(e.dataTransfer.files[0]);
    }
}
function handleObTtSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
        updateObTtFileStatus(e.target.files[0]);
    }
}
function updateObTtFileStatus(file) {
    selectedObTtFile = file;
    const dropzone = document.getElementById("ob-tt-dropzone");
    const statusBox = document.getElementById("ob-tt-status");
    const scanBtn = document.getElementById("ob-tt-scan-btn");
    
    const filenameEl = document.getElementById("ob-tt-filename");
    const filesizeEl = document.getElementById("ob-tt-filesize");
    
    if (file) {
        dropzone.classList.add("hidden");
        statusBox.classList.remove("hidden");
        scanBtn.disabled = false;
        
        filenameEl.textContent = file.name;
        filesizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    }
}

// Calendar drag/drop
function handleObCalDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById("ob-cal-dropzone");
    if (dropzone) dropzone.classList.remove("border-primary", "bg-primary/5");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        updateObCalFileStatus(e.dataTransfer.files[0]);
    }
}
function handleObCalSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
        updateObCalFileStatus(e.target.files[0]);
    }
}
function updateObCalFileStatus(file) {
    selectedObCalFile = file;
    const dropzone = document.getElementById("ob-cal-dropzone");
    const statusBox = document.getElementById("ob-cal-status");
    const scanBtn = document.getElementById("ob-cal-scan-btn");
    
    const filenameEl = document.getElementById("ob-cal-filename");
    const filesizeEl = document.getElementById("ob-cal-filesize");
    
    if (file) {
        dropzone.classList.add("hidden");
        statusBox.classList.remove("hidden");
        scanBtn.disabled = false;
        
        filenameEl.textContent = file.name;
        filesizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    }
}

async function startTimetableScanning() {
    if (!selectedObTtFile) return;
    
    const loader = document.getElementById("ocr-scanning-loader");
    const loaderText = document.getElementById("ocr-loader-text");
    if (loader) loader.classList.remove("hidden");
    if (loaderText) loaderText.textContent = "AI Timetable Parsing with Gemini...";
    
    const scanBtn = document.getElementById("ob-tt-scan-btn");
    if (scanBtn) scanBtn.disabled = true;
    
    const formData = new FormData();
    formData.append("file", selectedObTtFile);
    
    try {
        const response = await fetch(`${API_BASE_URL}/timetable/ocr`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: formData
        });
        
        if (loader) loader.classList.add("hidden");
        if (scanBtn) scanBtn.disabled = false;
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: "Unknown error" }));
            showToast("Parsing Failed", err.detail || "Gemini could not read timetable.", "error");
            return;
        }
        
        const data = await response.json();
        if (!data.timetable || data.timetable.length === 0) {
            showToast("No Classes Found", "Gemini could not detect any class entries.", "warning");
            return;
        }
        
        appState.tempTimetable = data.timetable;
        showToast("Timetable Scanned ✨", `AI extracted ${data.total_classes} classes.`, "check_circle");
        
        goToOnboardingStep(3);
    } catch (err) {
        if (loader) loader.classList.add("hidden");
        if (scanBtn) scanBtn.disabled = false;
        console.error("Timetable parse error:", err);
        showToast("Connection Error", "Could not reach timetable parser.", "error");
    }
}

async function startCalendarScanning() {
    if (!selectedObCalFile) return;
    
    const loader = document.getElementById("ocr-scanning-loader");
    const loaderText = document.getElementById("ocr-loader-text");
    if (loader) loader.classList.remove("hidden");
    if (loaderText) loaderText.textContent = "AI Academic Calendar Parsing with Gemini...";
    
    const scanBtn = document.getElementById("ob-cal-scan-btn");
    if (scanBtn) scanBtn.disabled = true;
    
    const formData = new FormData();
    formData.append("file", selectedObCalFile);
    
    try {
        const response = await fetch(`${API_BASE_URL}/semester/parse-calendar`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: formData
        });
        
        if (loader) loader.classList.add("hidden");
        if (scanBtn) scanBtn.disabled = false;
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: "Unknown error" }));
            showToast("Parsing Failed", err.detail || "Gemini could not read academic calendar.", "error");
            return;
        }
        
        const data = await response.json();
        parsedCalendarData = data;
        
        showToast("Calendar Scanned ✨", "Academic calendar data processed.", "check_circle");
        
        // Populate Verification Screen metrics — normalize dates to YYYY-MM-DD for <input type="date">
        // Populate Verification Screen metrics — normalize dates to YYYY-MM-DD for <input type="date">
        document.getElementById("ob-verify-start").value = normalizeDateToISO(data.semesterStart) || "";
        document.getElementById("ob-verify-end").value = normalizeDateToISO(data.semesterEnd) || "";
        
        // Calculate total holidays count (individual holiday dates + semester break dates + study holidays)
        const totalHolDates = new Set((data.holidays || []).map(h => h.date));
        const countDaysInRange = (ranges) => {
            (ranges || []).forEach(r => {
                if (r.start && r.end) {
                    let d = new Date(r.start + "T00:00:00");
                    const end = new Date(r.end + "T00:00:00");
                    while (d <= end) {
                        const dateStr = d.toISOString().split("T")[0];
                        totalHolDates.add(dateStr);
                        d.setDate(d.getDate() + 1);
                    }
                }
            });
        };
        countDaysInRange(data.semesterBreak);
        countDaysInRange(data.studyHolidays);

        document.getElementById("ob-verify-holidays").textContent = totalHolDates.size;
        document.getElementById("ob-verify-mid-exams").textContent = (data.midExams || []).length;
        document.getElementById("ob-verify-final-exams").textContent = (data.examDates || []).length;
        
        // Calculate expected active working days
        if (data.semesterStart && data.semesterEnd) {
            const startD = new Date(data.semesterStart + "T00:00:00");
            const endD = new Date(data.semesterEnd + "T00:00:00");
            let workDays = 0;
            
            // Build set of holiday dates
            const holDates = new Set((data.holidays || []).map(h => h.date));
            // Add exam dates to exclusions
            const addExclusion = (ranges) => {
                ranges.forEach(r => {
                    let d = new Date(r.start + "T00:00:00");
                    const end = new Date(r.end + "T00:00:00");
                    while (d <= end) {
                        holDates.add(d.toISOString().split("T")[0]);
                        d.setDate(d.getDate() + 1);
                    }
                });
            };
            addExclusion(data.midExams);
            addExclusion(data.labExams);
            addExclusion(data.semesterBreak);
            addExclusion(data.examDates);
            addExclusion(data.studyHolidays);
            
            // Override with working Saturdays
            const workSats = new Set(data.workingSaturdays);
            
            let curr = new Date(startD);
            while (curr <= endD) {
                const dateStr = curr.toISOString().split("T")[0];
                const day = curr.getDay();
                
                // Exclude Sundays
                if (day !== 0) {
                    if (workSats.has(dateStr) || !holDates.has(dateStr)) {
                        workDays++;
                    }
                }
                curr.setDate(curr.getDate() + 1);
            }
            document.getElementById("ob-verify-working-days").textContent = workDays;
        } else {
            document.getElementById("ob-verify-working-days").textContent = "-";
        }
        
        // Populate subject schedule list preview
        const verifySubjects = document.getElementById("ob-verify-subjects-list");
        verifySubjects.innerHTML = "";
        
        const timetableToPreview = appState.tempTimetable || [];
        const subjectsFound = [...new Set(timetableToPreview.map(t => t.subject))].filter(s => s && s.toLowerCase() !== 'break' && s.toLowerCase() !== 'lunch');
        
        if (subjectsFound.length === 0) {
            verifySubjects.innerHTML = '<p class="text-[10px] text-on-surface-variant/75 text-center py-2">No subjects found in timetable.</p>';
        } else {
            subjectsFound.forEach(sub => {
                const count = timetableToPreview.filter(t => t.subject === sub).length;
                const div = document.createElement("div");
                div.className = "flex justify-between py-1 border-b border-outline-variant/10 last:border-0";
                div.innerHTML = `
                    <span class="text-on-surface-variant font-medium flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-success text-[14px]">check_circle</span> ${sub}
                    </span>
                    <span class="text-on-surface font-bold">${count} classes / week</span>
                `;
                verifySubjects.appendChild(div);
            });
        }
        
        goToOnboardingStep(4);
    } catch (err) {
        if (loader) loader.classList.add("hidden");
        if (scanBtn) scanBtn.disabled = false;
        console.error("Calendar parse error:", err);
        showToast("Connection Error", "Could not reach calendar parser.", "error");
    }
}

async function saveOnboardingWizardData() {
    // Read dates from the editable inputs (user may have typed manually)
    const rawStart = document.getElementById("ob-verify-start").value || (parsedCalendarData && parsedCalendarData.semesterStart) || "";
    const rawEnd = document.getElementById("ob-verify-end").value || (parsedCalendarData && parsedCalendarData.semesterEnd) || "";
    
    // Normalize to YYYY-MM-DD regardless of what AI or user entered
    const startVal = normalizeDateToISO(rawStart);
    const endVal = normalizeDateToISO(rawEnd);
    
    if (!startVal || !endVal) {
        showToast("Semester Dates Required", "Please enter valid semester start and end dates (e.g. 2026-06-01).", "error");
        return;
    }
    
    // Validate dates are in correct order
    if (new Date(startVal) >= new Date(endVal)) {
        showToast("Invalid Dates", "Semester start date must be before the end date.", "error");
        return;
    }
    
    const saveBtn = document.getElementById("ob-save-btn");
    const originalBtnText = "Start Tracking";
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Setting Up Semester...";
    }
    
    // Helper: fetch with a timeout
    async function fetchWithTimeout(url, options, timeoutMs = 30000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return res;
        } catch (err) {
            clearTimeout(id);
            throw err;
        }
    }
    
    try {
        const startDate = new Date(startVal + "T00:00:00");
        const endDate = new Date(endVal + "T00:00:00");
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();
        const academicYear = `${startYear}-${String(endYear).slice(-2)}`;
        
        const college = document.getElementById("ob-college").value.trim();
        const branch = document.getElementById("ob-branch").value.trim();
        const term = document.getElementById("ob-semester").value;
        const targetGoal = parseInt(document.getElementById("ob-goal").value) || 75;
        
        // Step 1: Update user profile
        if (saveBtn) saveBtn.textContent = "Step 1/3: Saving Profile...";
        if (college || branch || term || targetGoal) {
            await fetchWithTimeout(`${API_BASE_URL}/user/profile`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                body: JSON.stringify({
                    name: appState.profile.name || "Student",
                    college: college || appState.profile.college,
                    branch: branch || appState.profile.branch,
                    semester: term || appState.profile.term,
                    attendance_goal: parseFloat(targetGoal)
                })
            }, 15000);
        }
        
        // Step 2: Create semester
        if (saveBtn) saveBtn.textContent = "Step 2/3: Creating Semester...";
        const semResponse = await fetchWithTimeout(`${API_BASE_URL}/semesters`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
                name: term,
                academic_year: academicYear,
                start_date: startVal,
                end_date: endVal,
                academic_calendar: JSON.stringify(parsedCalendarData)
            })
        }, 15000);
        
        if (!semResponse.ok) {
            const err = await semResponse.json();
            showToast("Setup Failed", err.detail || "Could not set semester dates.", "error");
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
            return;
        }
        
        const semData = await semResponse.json();
        appState.activeSemester = semData;
        
        // Step 3: Sync timetable (this triggers session generation — may take 10-20s on cold start)
        if (saveBtn) saveBtn.textContent = "Step 3/3: Building Schedule...";
        const timetableToSave = appState.tempTimetable || [];
        const syncResponse = await fetchWithTimeout(`${API_BASE_URL}/timetable/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ timetable: timetableToSave })
        }, 60000); // 60s — generating sessions for a full semester is the heaviest operation
        
        if (!syncResponse.ok) {
            showToast("Partial Setup", "Semester saved but schedule sync failed. You can re-sync from Settings.", "warning");
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
            return;
        }
        
        appState.timetable = timetableToSave;
        delete appState.tempTimetable;
        
        // Clear caches and state sync
        saveStateToLocalStorage();
        
        closeOcrModal();
        await initAppState();
        renderDashboard();
        renderTimetableClasses();
        
        showToast("Setup Complete ✨", "Timetable & Calendar setup synced successfully!", "check_circle");
    } catch (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
        if (err.name === "AbortError") {
            console.error("Setup timeout:", err);
            showToast("Setup Timed Out", "The server took too long. Please try again — your semester was likely created. Check Settings.", "warning");
        } else {
            console.error("Setup error:", err);
            showToast("Setup Error", "Failed to sync onboarding details. Please try again.", "error");
        }
    }
}

// ============================================================================
// 14. ONLOAD BOOTSTRAPPER
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Quick micro-interactions for active button pressing
    document.querySelectorAll("button, select, input, a").forEach(el => {
        el.addEventListener("mousedown", () => el.style.transform = "scale(0.97)");
        el.addEventListener("mouseup", () => el.style.transform = "");
        el.addEventListener("mouseleave", () => el.style.transform = "");
    });
    
    const isReady = await initAppState();
    
    if (isReady) {
        // Default open dashboard tab
        tabNavigation("dashboard");
        
        // Set active sub-tab defaults
        toggleScheduleSubTab("timetable");
        
        // First welcome message toast
        setTimeout(() => {
            showToast("AttendWise AI Active", `Hi ${appState.profile.name}, target set to ${appState.profile.targetGoal}%. Keep tracking!`, "insights");
        }, 1500);
    }
});

// Expose functions to window object for inline HTML event handlers (since app.js is a module)
window.switchAuthTab = switchAuthTab;
window.quickLoginDemo = quickLoginDemo;
window.handleAuthSignIn = handleAuthSignIn;
window.handleAuthSignUp = handleAuthSignUp;
window.handleAuthSignOut = handleAuthSignOut;
window.tabNavigation = tabNavigation;
window.openProfileModal = openProfileModal;
window.toggleMobileSidebar = toggleMobileSidebar;
window.toggleNotificationPanel = toggleNotificationPanel;
window.markAllNotificationsRead = markAllNotificationsRead;
window.triggerGreetingNotification = triggerGreetingNotification;
window.downloadReportPDF = downloadReportPDF;
window.downloadReportCSV = downloadReportCSV;
window.loadReportPreview = loadReportPreview;
window.toggleScheduleSubTab = toggleScheduleSubTab;
window.toggleTimetableViewMode = toggleTimetableViewMode;
window.toggleModal = toggleModal;
window.openAddClassModal = openAddClassModal;
window.changeCalendarMonth = changeCalendarMonth;
window.saveCustomClass = saveCustomClass;
window.saveProfileSettings = saveProfileSettings;
window.handleCreateLeavePlan = handleCreateLeavePlan;
window.resetAppData = resetAppData;
window.handleProfilePhotoUpload = handleProfilePhotoUpload;
window.pressPinNum = pressPinNum;
window.simulateBiometricUnlock = simulateBiometricUnlock;
window.clearPinInput = clearPinInput;
window.toggleFloatingWidget = toggleFloatingWidget;
window.deleteUserAccount = deleteUserAccount;

// Add missing exposures for dynamic element event handlers
window.updateRecordStatus = updateRecordStatus;
window.updateCalendarRecordStatus = updateCalendarRecordStatus;
window.openSyncModal = openSyncModal;
window.updateSyncPreview = updateSyncPreview;
window.saveSyncAttendance = saveSyncAttendance;
window.handleSyncOcrUpload = handleSyncOcrUpload;
window.editClassRecord = editClassRecord;
window.deleteClassRecord = deleteClassRecord;
window.openAddClassModalForSlot = openAddClassModalForSlot;
window.deleteLeavePlan = deleteLeavePlan;
window.onClassPeriodSelectChange = onClassPeriodSelectChange;

function getCombinedHolidayDates() {
    const dates = [];

    // 1. Add academic holidays from backend (Holiday table entries)
    if (appState.holidays && Array.isArray(appState.holidays)) {
        appState.holidays.forEach(h => {
            if (typeof h.date === "string") {
                dates.push(h.date);
            } else if (h.date && h.date.toISOString) {
                dates.push(h.date.toISOString().split("T")[0]);
            }
        });
    }

    // 2. Add leave plan dates (expanded from start_date to end_date)
    if (appState.leavePlans && Array.isArray(appState.leavePlans)) {
        appState.leavePlans.forEach(plan => {
            if (plan.start_date && plan.end_date) {
                const start = new Date(plan.start_date + "T00:00:00");
                const end = new Date(plan.end_date + "T00:00:00");
                let curr = new Date(start);
                while (curr <= end) {
                    dates.push(formatDateKey(curr));
                    curr.setDate(curr.getDate() + 1);
                }
            }
        });
    }

    // 3. Expand non-instructional ranges from the stored academic calendar.
    //    This covers exam periods, semester breaks, study holidays, and events
    //    even if the Holiday table rows have not yet been inserted for a user
    //    who completed onboarding before this logic was added.
    if (appState.activeSemester && appState.activeSemester.academic_calendar) {
        try {
            const cal = typeof appState.activeSemester.academic_calendar === "string"
                ? JSON.parse(appState.activeSemester.academic_calendar)
                : appState.activeSemester.academic_calendar;

            // Helper: expand a {start, end} range into individual YYYY-MM-DD strings
            function expandRange(arr) {
                (arr || []).forEach(item => {
                    if (!item.start || !item.end) return;
                    let cur = new Date(item.start + "T00:00:00");
                    const end = new Date(item.end + "T00:00:00");
                    while (cur <= end) {
                        dates.push(formatDateKey(cur));
                        cur.setDate(cur.getDate() + 1);
                    }
                });
            }

            expandRange(cal.midExams);
            expandRange(cal.internalAssessments);
            expandRange(cal.labExams);
            expandRange(cal.practicalExams);
            expandRange(cal.semesterBreak);
            expandRange(cal.examDates);
            expandRange(cal.studyHolidays);

            // Non-instructional single days
            (cal.nonInstructionalDays || []).forEach(d => { if (d.date) dates.push(d.date); });

            // Events explicitly marked as no-classes
            (cal.events || []).forEach(ev => { if (ev.hasClasses === false && ev.date) dates.push(ev.date); });
        } catch (e) {}
    }

    return dates;
}

function countWeekdaysInRange(startDate, endDate, dayName, holidays) {
    const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let count = 0;
    
    // Normalize dates to midnight to avoid timezone offsets causing issues
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    const holidaySet = new Set((holidays || []).map(h => {
        if (typeof h === "string") return h;
        if (h.date) return h.date;
        if (h.toISOString) return h.toISOString().split("T")[0];
        return "";
    }).filter(Boolean));
    
    let curr = new Date(start);
    while (curr <= end) {
        if (daysMap[curr.getDay()] === dayName) {
            const dateStr = formatDateKey(curr);
            if (!holidaySet.has(dateStr)) {
                count++;
            }
        }
        curr.setDate(curr.getDate() + 1);
    }
    return count;
}

function calculateWorkingDays(startDate, endDate, holidays, timetable) {
    const activeDays = new Set(timetable.map(t => t.day));
    if (activeDays.size === 0) {
        activeDays.add("Mon").add("Tue").add("Wed").add("Thu").add("Fri");
    }
    
    let count = 0;
    
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    const holidaySet = new Set((holidays || []).map(h => {
        if (typeof h === "string") return h;
        if (h.date) return h.date;
        if (h.toISOString) return h.toISOString().split("T")[0];
        return "";
    }).filter(Boolean));
    
    const workSats = new Set();
    if (appState.activeSemester && appState.activeSemester.academic_calendar) {
        try {
            const cal = typeof appState.activeSemester.academic_calendar === "string" 
                ? JSON.parse(appState.activeSemester.academic_calendar) 
                : appState.activeSemester.academic_calendar;
            if (cal && cal.workingSaturdays) {
                cal.workingSaturdays.forEach(d => workSats.add(d));
            }
        } catch (e) {}
    }
    
    const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    let curr = new Date(start);
    while (curr <= end) {
        const dayStr = daysMap[curr.getDay()];
        const dateStr = formatDateKey(curr);
        
        const isScheduled = activeDays.has(dayStr);
        const isHoliday = holidaySet.has(dateStr);
        const isWorkingSat = (dayStr === "Sat" && workSats.has(dateStr));
        
        if ((isScheduled && !isHoliday) || isWorkingSat) {
            count++;
        }
        curr.setDate(curr.getDate() + 1);
    }
    return count;
}

function calculateSubjectExpectedClasses(subjectName, startDate, endDate, holidays, timetable) {
    let expected = 0;
    const subjectSlots = timetable.filter(t => t.subject === subjectName);
    const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    // Build unified exclusion set: holidays + all non-instructional ranges from academic calendar
    const combinedHolidays = getCombinedHolidayDates();
    const holidaySet = new Set([
        ...(holidays || []).map(h => {
            if (typeof h === "string") return h;
            if (h.date) return h.date;
            if (h.toISOString) return h.toISOString().split("T")[0];
            return "";
        }).filter(Boolean),
        ...combinedHolidays
    ]);

    const workSats = new Set();
    if (appState.activeSemester && appState.activeSemester.academic_calendar) {
        try {
            const cal = typeof appState.activeSemester.academic_calendar === "string"
                ? JSON.parse(appState.activeSemester.academic_calendar)
                : appState.activeSemester.academic_calendar;
            if (cal && cal.workingSaturdays) {
                cal.workingSaturdays.forEach(d => workSats.add(d));
            }
        } catch (e) {}
    }

    subjectSlots.forEach(slot => {
        let curr = new Date(start);
        while (curr <= end) {
            const dayStr = daysMap[curr.getDay()];
            const dateStr = formatDateKey(curr);

            // Skip Sundays unless it's a working Saturday override (safety guard)
            if (dayStr === "Sun") { curr.setDate(curr.getDate() + 1); continue; }

            // Saturday: only count if it's a designated working Saturday
            if (dayStr === "Sat" && !workSats.has(dateStr)) { curr.setDate(curr.getDate() + 1); continue; }

            // Skip non-instructional days (holidays, exams, breaks, events)
            const isExcluded = holidaySet.has(dateStr) && !workSats.has(dateStr);
            if (dayStr === slot.day && !isExcluded) {
                expected++;
            }
            curr.setDate(curr.getDate() + 1);
        }
    });
    return expected;
}

function onOcrDatesChange() {
    const startVal = document.getElementById("ocr-semester-start").value;
    const endVal = document.getElementById("ocr-semester-end").value;
    const calcPanel = document.getElementById("ocr-calc-panel");
    
    if (!startVal || !endVal) {
        calcPanel.classList.add("hidden");
        return;
    }
    
    const startDate = new Date(startVal + "T00:00:00");
    const endDate = new Date(endVal + "T00:00:00");
    
    if (endDate < startDate) {
        calcPanel.classList.add("hidden");
        return;
    }
    
    calcPanel.classList.remove("hidden");
    
    // Calculate duration
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    const weeks = Math.floor(diffDays / 7);
    const remainingDays = diffDays % 7;
    
    let durationText = `${diffDays} days`;
    let weeksText = `${weeks} week${weeks !== 1 ? 's' : ''}`;
    if (remainingDays > 0) {
        weeksText += ` + ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }
    
    // Approximate months and days
    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    let startDay = startDate.getDate();
    let endDay = endDate.getDate();
    let mDays = 0;
    if (endDay >= startDay) {
        mDays = endDay - startDay;
    } else {
        months--;
        const tempDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        mDays = tempDate.getDate() - startDay + endDay;
    }
    
    let lengthText = `${diffDays} days (${weeksText})`;
    if (months > 0 || mDays > 0) {
        lengthText += ` ≈ ${months} mo ${mDays} days`;
    }
    
    document.getElementById("ocr-calc-duration").textContent = `-`;
    document.getElementById("ocr-calc-weeks").textContent = `-`;
    document.getElementById("ocr-calc-working-days").textContent = `-`;
}

function closeOcrModal() {
    toggleModal("ocrModal");
    setTimeout(() => {
        goToOnboardingStep(1);
        selectedObTtFile = null;
        selectedObCalFile = null;
        parsedCalendarData = null;
        const ttInput = document.getElementById("ob-tt-input");
        if (ttInput) ttInput.value = "";
        const calInput = document.getElementById("ob-cal-input");
        if (calInput) calInput.value = "";
        
        const ttDrop = document.getElementById("ob-tt-dropzone");
        if (ttDrop) ttDrop.classList.remove("hidden");
        const ttStatus = document.getElementById("ob-tt-status");
        if (ttStatus) ttStatus.classList.add("hidden");
        
        const calDrop = document.getElementById("ob-cal-dropzone");
        if (calDrop) calDrop.classList.remove("hidden");
        const calStatus = document.getElementById("ob-cal-status");
        if (calStatus) calStatus.classList.add("hidden");
        
        const ttBtn = document.getElementById("ob-tt-scan-btn");
        if (ttBtn) ttBtn.disabled = true;
        const calBtn = document.getElementById("ob-cal-scan-btn");
        if (calBtn) calBtn.disabled = true;
    }, 300);
}

function updateSemesterDashboard() {
    const banner = document.getElementById("dashboard-setup-banner");
    const card = document.getElementById("dashboard-semester-card");
    
    if (!banner || !card) return;
    
    if (!appState.activeSemester) {
        banner.classList.remove("hidden");
        card.classList.add("hidden");
        return;
    }
    
    banner.classList.add("hidden");
    card.classList.remove("hidden");
    
    const startDate = new Date(appState.activeSemester.start_date + "T00:00:00");
    const endDate = new Date(appState.activeSemester.end_date + "T00:00:00");
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Date range labels
    const option = { day: 'numeric', month: 'short', year: 'numeric' };
    const dateRangeText = `Start: ${startDate.toLocaleDateString('en-US', option)} | End: ${endDate.toLocaleDateString('en-US', option)}`;
    document.getElementById("sem-card-date-range").textContent = dateRangeText;
    
    // Status pill
    const progressPill = document.getElementById("sem-card-progress-pill");
    if (today > endDate) {
        progressPill.textContent = "Ended";
        progressPill.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-outline-variant text-on-surface-variant";
    } else if (today < startDate) {
        progressPill.textContent = "Upcoming";
        progressPill.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/20";
    } else {
        progressPill.textContent = "Active";
        progressPill.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(64,229,108,0.2)]";
    }
    
    // Semester length
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const weeks = Math.floor(diffDays / 7);
    const remDays = diffDays % 7;
    let weeksText = `${weeks} week${weeks !== 1 ? 's' : ''}`;
    if (remDays > 0) weeksText += ` + ${remDays} day${remDays !== 1 ? 's' : ''}`;
    
    document.getElementById("sem-card-length-days").textContent = `${diffDays} Days`;
    document.getElementById("sem-card-length-weeks").textContent = weeksText;
    
    // Working days
    const holidays = getCombinedHolidayDates();
    const totalWorkingDays = calculateWorkingDays(startDate, endDate, holidays, appState.timetable);
    const remainingStart = today > startDate ? today : startDate;
    const remainingWorkingDays = today > endDate ? 0 : calculateWorkingDays(remainingStart, endDate, holidays, appState.timetable);
    
    document.getElementById("sem-card-working-days").textContent = `${totalWorkingDays} Days`;
    document.getElementById("sem-card-working-remaining").textContent = `${remainingWorkingDays} remaining`;
    
    // Classes remaining & expected
    let totalExpectedClasses = 0;
    let totalRemainingClasses = 0;
    
    const uniqueSubjects = Array.from(new Set(appState.timetable.map(t => t.subject)));
    uniqueSubjects.forEach(subName => {
        if (subName.toLowerCase().includes("break") || subName.toLowerCase().includes("recess")) return;
        
        const exp = calculateSubjectExpectedClasses(subName, startDate, endDate, holidays, appState.timetable);
        const rem = today > endDate ? 0 : calculateSubjectExpectedClasses(subName, remainingStart, endDate, holidays, appState.timetable);
        totalExpectedClasses += exp;
        totalRemainingClasses += rem;
    });
    
    document.getElementById("sem-card-classes-remaining").textContent = totalRemainingClasses;
    document.getElementById("sem-card-expected-total").textContent = `of ${totalExpectedClasses} expected`;
    
    // Daily target minimum classes to attend today
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayDayStr = weekdays[today.getDay()];
    const classesToday = appState.timetable.filter(c => c.day === todayDayStr && !c.subject.toLowerCase().includes("break") && !c.subject.toLowerCase().includes("recess")).length;
    
    if (classesToday > 0 && today >= startDate && today <= endDate) {
        const targetGoal = appState.profile.targetGoal;
        const targetCount = Math.ceil(targetGoal / 100 * classesToday);
        document.getElementById("sem-card-daily-target").textContent = `${targetCount} / ${classesToday}`;
    } else {
        document.getElementById("sem-card-daily-target").textContent = "0 Classes";
    }
    
    // End-of-Semester Predictor table
    const global = calculateGlobalAttendance();
    
    // Calculate subject goal statuses (above/below target goal)
    const subjectStats = calculateSubjectAttendance();
    let aboveGoalCount = 0;
    let belowGoalCount = 0;
    Object.values(subjectStats).forEach(s => {
        if (s.total > 0) {
            if (s.percent >= s.min_req) {
                aboveGoalCount++;
            } else {
                belowGoalCount++;
            }
        }
    });
    
    const overallPctEl = document.getElementById("sem-card-overall-pct");
    const overallClassesEl = document.getElementById("sem-card-overall-classes");
    const subjectsSummaryEl = document.getElementById("sem-card-subjects-summary");
    
    if (overallPctEl) overallPctEl.textContent = `${global.percentage}%`;
    if (overallClassesEl) overallClassesEl.textContent = `${global.present} / ${global.total} Classes`;
    if (subjectsSummaryEl) subjectsSummaryEl.textContent = `${aboveGoalCount} Above / ${belowGoalCount} Below`;
    
    const predictorBody = document.getElementById("sem-card-predictor-table-body");
    predictorBody.innerHTML = "";
    
    const targets = [75, 80, 85, 90];
    targets.forEach(t => {
        const neededTotal = Math.ceil(t / 100 * totalExpectedClasses);
        const neededAdditional = neededTotal - global.present;
        const maxBunks = totalExpectedClasses - neededTotal - global.absent;
        
        let statusText = "";
        let badgeClass = "";
        
        if (neededAdditional <= 0) {
            statusText = `✅ Safe (Can bunk all ${totalRemainingClasses} remaining classes)`;
            badgeClass = "text-secondary bg-secondary/10 px-2 py-0.5 rounded";
        } else if (neededAdditional > totalRemainingClasses) {
            statusText = `❌ Not possible (Requires ${neededTotal} presents, max reachable is ${global.present + totalRemainingClasses})`;
            badgeClass = "text-error bg-error/10 px-2 py-0.5 rounded";
        } else {
            statusText = `⚠️ Attend ${neededAdditional} of ${totalRemainingClasses} remaining (Can bunk at most ${maxBunks})`;
            badgeClass = "text-primary bg-primary/10 px-2 py-0.5 rounded";
        }
        
        const tr = document.createElement("tr");
        tr.className = "border-b border-outline-variant/10 py-1.5 last:border-0";
        tr.innerHTML = `
            <td class="py-2 text-[12px] font-bold text-on-surface">${t}%</td>
            <td class="py-2 text-[11px]"><span class="${badgeClass}">${statusText}</span></td>
        `;
        predictorBody.appendChild(tr);
    });

    // 1. Semester Progress Bar updates
    const conductedClasses = totalExpectedClasses - totalRemainingClasses;
    const progressPercent = totalExpectedClasses > 0 ? Math.round((conductedClasses / totalExpectedClasses) * 100) : 0;
    
    const progressPercentEl = document.getElementById("sem-progress-percent");
    const progressBarEl = document.getElementById("sem-progress-bar");
    const progressConductedEl = document.getElementById("sem-progress-conducted");
    const progressTotalEl = document.getElementById("sem-progress-total");
    
    if (progressPercentEl) progressPercentEl.textContent = `${progressPercent}%`;
    if (progressBarEl) progressBarEl.style.width = `${progressPercent}%`;
    if (progressConductedEl) progressConductedEl.textContent = `Conducted: ${conductedClasses} classes`;
    if (progressTotalEl) progressTotalEl.textContent = `Total: ${totalExpectedClasses} classes`;

    // 2. Holiday Impact Analysis
    const impactEl = document.getElementById("sem-holiday-impact-text");
    if (impactEl) {
        let calData = null;
        if (appState.activeSemester && appState.activeSemester.academic_calendar) {
            try {
                calData = typeof appState.activeSemester.academic_calendar === "string" 
                    ? JSON.parse(appState.activeSemester.academic_calendar) 
                    : appState.activeSemester.academic_calendar;
            } catch (e) {}
        }
        
        if (calData && (calData.holidays || calData.midExams || calData.semesterBreak)) {
            const totalHols = calData.holidays ? calData.holidays.length : 0;
            const affectedMap = {};
            
            // Build holiday dates set
            const holidayDates = new Set((holidays || []).map(h => {
                if (typeof h === "string") return h;
                if (h.date) return h.date;
                return "";
            }).filter(Boolean));
            
            const weekdaysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            
            let curr = new Date(startDate);
            while (curr <= endDate) {
                const dStr = curr.toISOString().split("T")[0];
                if (holidayDates.has(dStr)) {
                    const dayStr = weekdaysMap[curr.getDay()];
                    const slots = appState.timetable.filter(s => s.day === dayStr && !s.subject.toLowerCase().includes("break"));
                    slots.forEach(s => {
                        affectedMap[s.subject] = (affectedMap[s.subject] || 0) + 1;
                    });
                }
                curr.setDate(curr.getDate() + 1);
            }
            
            let impactStr = "";
            const affectedItems = Object.entries(affectedMap);
            if (affectedItems.length > 0) {
                impactStr = affectedItems.map(([sub, count]) => `${sub} (${count} class${count > 1 ? 'es' : ''})`).join(", ");
                impactEl.innerHTML = `<span class="text-secondary font-bold">${totalHols} Holidays</span> registered. Affected classes: <span class="text-primary font-bold">${impactStr}</span>. Attendance requirements adjusted.`;
            } else {
                impactEl.textContent = `No scheduled classes were affected by the ${totalHols} registered holidays.`;
            }
        } else {
            impactEl.textContent = "No holidays or exams scheduled this semester.";
        }
    }
}

// Window exposures
window.closeOcrModal = closeOcrModal;
window.updateSemesterDashboard = updateSemesterDashboard;
window.goToOnboardingStep = goToOnboardingStep;
window.handleObTtSelect = handleObTtSelect;
window.handleObTtDrop = handleObTtDrop;
window.handleObCalSelect = handleObCalSelect;
window.handleObCalDrop = handleObCalDrop;
window.startTimetableScanning = startTimetableScanning;
window.startCalendarScanning = startCalendarScanning;
window.saveOnboardingWizardData = saveOnboardingWizardData;
window.handleForgotPassword = handleForgotPassword;
window.handleResetPassword = handleResetPassword;
window.handleGoogleSignIn = handleGoogleSignIn;


// --- GLOBAL ERROR BOUNDARY ---
window.addEventListener('error', function(e) {
    console.error('Global Error Caught:', e.error || e.message);
    if (!document.getElementById('global-error-toast')) {
        showToast('App Error', 'An unexpected error occurred. Restarting app...', 'error');
        setTimeout(() => location.reload(), 3000);
    }
});
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    showToast('Network/App Error', 'Something went wrong. Please check connection.', 'warning');
});

// --- PUSH NOTIFICATIONS ---
async function registerPushNotifications() {
    try {
        const { PushNotifications } = capacitorPushNotifications;
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
            throw new Error('User denied permissions!');
        }
        await PushNotifications.register();
        
        PushNotifications.addListener('registration', async (token) => {
            const access_token = localStorage.getItem('access_token');
            if (access_token) {
                await fetch(API_BASE_URL + '/user/device-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + access_token
                    },
                    body: JSON.stringify({ token: token.value })
                });
            }
        });
        
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            addNotification(notification.title || "New Notification", notification.body || "", "info");
        });
    } catch (e) {
        console.error("Push notification setup failed:", e);
    }
}
window.registerPushNotifications = registerPushNotifications;

if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            const email = session.user.email;
            const name = session.user.user_metadata?.full_name || 'Google Student';
            try {
                const response = await fetch(API_BASE_URL + '/auth/google-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email })
                });
                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem('access_token', data.access_token);
                    try {
                        await Preferences.set({ key: "access_token", value: data.access_token });
                    } catch (err) {
                        console.warn("[Auth] Preferences.set failed after Google login", err);
                    }
                    showToast('Google Login Success', 'Welcome back!', 'check_circle');
                    await initAppState();
                    tabNavigation('dashboard');
                }
            } catch (err) {
                console.error('FastAPI google login sync failed:', err);
            }
        }
    });
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.quickLoginDemo = quickLoginDemo;
