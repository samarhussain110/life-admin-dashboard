(() => {
  "use strict";

  const STORAGE_KEY = "lifeAdminData";
  const PROFILE_DATABASE = "lifeAdminProfile";
  const PROFILE_STORE = "profiles";
  const PROFILE_RECORD_ID = "current-user";
  const PAGE_TITLES = {
    dashboard: "Overview", calendar: "Calendar", tasks: "Tasks", documents: "Documents",
    bills: "Bills & payments", goals: "Goals", reminders: "Reminders", insights: "Insights", settings: "Settings"
  };
  const ICONS = {
    tasks: "fa-check-double", bills: "fa-receipt", documents: "fa-folder-open", goals: "fa-bullseye",
    reminders: "fa-bell", calendarEvents: "fa-calendar-day"
  };
  const COLORS = { tasks: "violet", bills: "amber", documents: "blue", goals: "green", reminders: "rose", calendarEvents: "violet" };
  const CATEGORIES = {
    tasks: ["Personal", "Work", "Health", "Finance", "Home", "Learning"],
    bills: ["Electricity", "Internet", "Water", "Gas", "Rent", "Subscription", "Insurance", "Other"],
    documents: ["Identity", "Travel", "Vehicle", "Insurance", "Warranty", "Certificate", "Contract", "Other"],
    goals: ["Savings", "Learning", "Health", "Personal", "Career", "Other"],
    reminders: ["Personal", "Health", "Work", "Home", "Finance", "Other"],
    calendarEvents: ["Personal", "Work", "Family", "Health", "Finance", "Other"]
  };
  let state;
  let profile = null;
  let profileDatabasePromise;
  let currentPage = "dashboard";
  let editing = null;
  let confirmCallback = null;
  let progressGoalId = null;
  let activeCalendarDate = dateKey(new Date());
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let charts = {};
  let itemModal;
  let confirmModal;
  let progressModal;
  let profileSetupModal;
  let focusModal;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));

  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function offsetDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }
  function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  function dateDistance(value) {
    const target = parseDate(value);
    if (!target) return Infinity;
    const today = parseDate(dateKey(new Date()));
    return Math.round((target - today) / 86400000);
  }
  function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
    const date = parseDate(value);
    if (!date) return "No date";
    const format = profile?.dateFormat || "system";
    if (format !== "system") {
      const year = String(date.getFullYear());
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const parts = {
        mdy: options.year ? `${month}/${day}/${year}` : `${month}/${day}`,
        dmy: options.year ? `${day}/${month}/${year}` : `${day}/${month}`,
        ymd: options.year ? `${year}-${month}-${day}` : `${month}-${day}`
      };
      const formatted = parts[format];
      return options.weekday ? `${new Intl.DateTimeFormat(undefined, { weekday: options.weekday }).format(date)}, ${formatted}` : formatted;
    }
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function demoData() {
    const now = new Date().toISOString();
    const data = {
      tasks: [
        { id: generateId(), title: "Complete project documentation", description: "Wrap up the project notes and share them with the team.", category: "Work", priority: "High", dueDate: offsetDate(1), status: "In Progress", createdAt: now },
        { id: generateId(), title: "Review monthly budget", description: "Take a look at this month’s spending.", category: "Finance", priority: "Medium", dueDate: offsetDate(3), status: "Pending", createdAt: now },
        { id: generateId(), title: "Prepare presentation", description: "Gather the final slides for the project demo.", category: "Work", priority: "High", dueDate: offsetDate(0), status: "Pending", createdAt: now },
        { id: generateId(), title: "Organize home office", description: "A little reset for a calmer workspace.", category: "Home", priority: "Low", dueDate: offsetDate(8), status: "Completed", createdAt: now }
      ],
      bills: [
        { id: generateId(), name: "Electricity", category: "Electricity", amount: 86.4, dueDate: offsetDate(1), recurring: "Monthly", status: "Pending", notes: "Autopay is turned off." },
        { id: generateId(), name: "Home internet", category: "Internet", amount: 59, dueDate: offsetDate(5), recurring: "Monthly", status: "Pending", notes: "" },
        { id: generateId(), name: "Mobile plan", category: "Subscription", amount: 42, dueDate: offsetDate(-4), recurring: "Monthly", status: "Paid", notes: "Paid this month." },
        { id: generateId(), name: "Water", category: "Water", amount: 35.25, dueDate: offsetDate(-2), recurring: "Monthly", status: "Pending", notes: "" }
      ],
      documents: [
        { id: generateId(), name: "Driving License", type: "Vehicle", expiryDate: offsetDate(18), notes: "Renew online before the expiry date." },
        { id: generateId(), name: "Passport", type: "Travel", expiryDate: offsetDate(220), notes: "Stored safely at home." },
        { id: generateId(), name: "Home insurance", type: "Insurance", expiryDate: offsetDate(5), notes: "Review coverage before renewal." }
      ],
      goals: [
        { id: generateId(), name: "Emergency Fund", description: "Build a little more peace of mind.", target: 10000, current: 6800, deadline: offsetDate(180), category: "Savings" },
        { id: generateId(), name: "Learn JavaScript", description: "Practice by building small projects.", target: 24, current: 14, deadline: offsetDate(90), category: "Learning" },
        { id: generateId(), name: "Fitness Goal", description: "Stay consistent with weekly movement.", target: 100, current: 42, deadline: offsetDate(150), category: "Health" }
      ],
      reminders: [
        { id: generateId(), title: "Doctor appointment", date: offsetDate(1), time: "10:30", category: "Health", priority: "High", notes: "Annual check-in.", completed: false },
        { id: generateId(), title: "Team meeting", date: offsetDate(2), time: "14:00", category: "Work", priority: "Medium", notes: "Bring project notes.", completed: false },
        { id: generateId(), title: "Family dinner", date: offsetDate(4), time: "19:00", category: "Family", priority: "Low", notes: "Pick up dessert.", completed: false }
      ],
      calendarEvents: [
        { id: generateId(), title: "Project demo", date: offsetDate(0), time: "11:30", category: "Work", description: "Share the latest progress." },
        { id: generateId(), title: "Payment deadline", date: offsetDate(6), time: "09:00", category: "Finance", description: "A gentle reminder to review upcoming payments." },
        { id: generateId(), title: "Personal day", date: offsetDate(9), time: "12:00", category: "Personal", description: "Make some space to recharge." }
      ],
      notifications: [],
      browserNotificationHistory: [],
      activities: [{ id: generateId(), text: "Your Life Admin workspace is ready.", date: now, icon: "fa-sparkles" }],
      theme: "light",
      browserNotificationMigrationVersion: 1,
      settings: { notifications: true, browserNotifications: false, browserPermissionRequested: false, showCompleted: true, defaultPage: "dashboard", focusTaskIds: [] }
    };
    ["tasks", "bills", "documents", "goals", "reminders", "calendarEvents"].forEach(type => {
      data[type].forEach(item => { item.isDemo = true; });
    });
    return data;
  }
  function markLegacyDemoRecords(data) {
    const matches = {
      tasks: item => (
        (item.title === "Complete project documentation" && item.description === "Wrap up the project notes and share them with the team.") ||
        (item.title === "Review monthly budget" && item.description === "Take a look at this month’s spending.") ||
        (item.title === "Prepare presentation" && item.description === "Gather the final slides for the project demo.") ||
        (item.title === "Organize home office" && item.description === "A little reset for a calmer workspace.")
      ),
      bills: item => (
        (item.name === "Electricity" && item.amount === 86.4 && item.notes === "Autopay is turned off.") ||
        (item.name === "Home internet" && item.amount === 59 && item.recurring === "Monthly") ||
        (item.name === "Mobile plan" && item.amount === 42 && item.notes === "Paid this month.") ||
        (item.name === "Water" && item.amount === 35.25 && item.recurring === "Monthly")
      ),
      documents: item => (
        (item.name === "Driving License" && item.notes === "Renew online before the expiry date.") ||
        (item.name === "Passport" && item.notes === "Stored safely at home.") ||
        (item.name === "Home insurance" && item.notes === "Review coverage before renewal.")
      ),
      goals: item => (
        (item.name === "Emergency Fund" && item.description === "Build a little more peace of mind.") ||
        (item.name === "Learn JavaScript" && item.description === "Practice by building small projects.") ||
        (item.name === "Fitness Goal" && item.description === "Stay consistent with weekly movement.")
      ),
      reminders: item => (
        (item.title === "Doctor appointment" && item.notes === "Annual check-in.") ||
        (item.title === "Team meeting" && item.notes === "Bring project notes.") ||
        (item.title === "Family dinner" && item.notes === "Pick up dessert.")
      ),
      calendarEvents: item => (
        (item.title === "Project demo" && item.description === "Share the latest progress.") ||
        (item.title === "Payment deadline" && item.description === "A gentle reminder to review upcoming payments.") ||
        (item.title === "Personal day" && item.description === "Make some space to recharge.")
      )
    };
    Object.entries(matches).forEach(([type, isDemo]) => {
      if (Array.isArray(data[type])) {
        data[type].forEach(item => {
          if (typeof item.isDemo !== "boolean" && isDemo(item)) item.isDemo = true;
        });
      }
    });
  }
  function loadData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const initial = demoData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(stored);
      if (!parsed.browserNotificationMigrationVersion) {
        markLegacyDemoRecords(parsed);
        parsed.browserNotificationMigrationVersion = 1;
      }
      const defaults = demoData();
      return {
        ...defaults, ...parsed,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        browserNotificationHistory: Array.isArray(parsed.browserNotificationHistory) ? parsed.browserNotificationHistory : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        settings: { ...defaults.settings, ...(parsed.settings || {}), focusTaskIds: Array.isArray(parsed.settings?.focusTaskIds) ? parsed.settings.focusTaskIds.slice(0, 3) : [] }
      };
    } catch (error) {
      console.error("Unable to load Life Admin data.", error);
      showToast("Your saved data could not be read. It has not been overwritten.", "error");
      return demoData();
    }
  }
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function openProfileDatabase() {
    if (profileDatabasePromise) return profileDatabasePromise;
    profileDatabasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("This browser does not support IndexedDB, so a profile cannot be saved."));
        return;
      }
      const request = indexedDB.open(PROFILE_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
          request.result.createObjectStore(PROFILE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local profile database."));
      request.onblocked = () => reject(new Error("The local profile database is blocked by another open tab. Close other Life Admin tabs and try again."));
    });
    profileDatabasePromise.catch(() => { profileDatabasePromise = null; });
    return profileDatabasePromise;
  }
  async function loadProfile() {
    const database = await openProfileDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROFILE_STORE, "readonly");
      const request = transaction.objectStore(PROFILE_STORE).get(PROFILE_RECORD_ID);
      let result = null;
      request.onsuccess = () => { result = request.result || null; };
      request.onerror = () => reject(request.error || new Error("Could not read the saved profile."));
      transaction.oncomplete = () => {
        const name = typeof result?.name === "string" ? result.name.trim() : "";
        resolve(name ? {
          name,
          currency: result.currency || "USD",
          dateFormat: result.dateFormat || "system"
        } : null);
      };
      transaction.onerror = () => reject(transaction.error || new Error("Could not read the saved profile."));
      transaction.onabort = () => reject(transaction.error || new Error("Reading the saved profile was cancelled."));
    });
  }
  async function saveProfile(nextProfile) {
    const database = await openProfileDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROFILE_STORE, "readwrite");
      transaction.objectStore(PROFILE_STORE).put({ id: PROFILE_RECORD_ID, ...nextProfile });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the profile."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving the profile was cancelled."));
    });
  }
  function updateProfileDisplays() {
    const name = profile?.name || "";
    const label = name || "Your profile";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();
    byId("sidebarProfileName").textContent = label;
    byId("topProfileName").textContent = label;
    byId("topProfileName").parentElement.setAttribute("aria-label", name ? `Edit ${name}'s profile` : "Set up your profile");
    byId("topProfileAvatar").innerHTML = initials ? escapeHTML(initials) : '<i class="fa-solid fa-user"></i>';
    byId("sidebarProfileAvatar").innerHTML = initials ? escapeHTML(initials) : '<i class="fa-solid fa-user"></i>';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    byId("greeting").textContent = name ? `${greeting}, ${name}!` : "Welcome!";
  }
  async function saveProfileFromForm(form, input, modal) {
    const name = input.value.trim();
    input.setCustomValidity(name ? "" : "Please enter your name.");
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      input.focus();
      return;
    }
    try {
      const nextProfile = {
        name,
        currency: modal ? profile?.currency || "USD" : byId("profileCurrency").value,
        dateFormat: modal ? profile?.dateFormat || "system" : byId("profileDateFormat").value
      };
      await saveProfile(nextProfile);
      profile = nextProfile;
      updateProfileDisplays();
      if (modal) modal.hide();
      if (byId("profileName")) byId("profileName").value = name;
      if (byId("profileCurrency")) byId("profileCurrency").value = profile.currency;
      if (byId("profileDateFormat")) byId("profileDateFormat").value = profile.dateFormat;
      renderAll();
      form.classList.remove("was-validated");
      showToast(modal ? "Your profile is ready." : "Your profile preferences have been saved.");
    } catch (error) {
      console.error("Unable to save the local profile.", error);
      showToast(error.message || "Your name could not be saved.", "error");
    }
  }
  function logActivity(text, icon = "fa-circle-check") {
    const id = generateId();
    state.activities.unshift({ id, text, icon, date: new Date().toISOString() });
    state.activities = state.activities.slice(0, 200);
    return id;
  }
  function refresh() {
    updateAutomaticStatuses();
    updateNotifications();
    saveData();
    sendBrowserNotifications();
    renderAll();
  }
  function updateAutomaticStatuses() {
    state.bills.forEach(bill => {
      if (bill.status !== "Paid" && dateDistance(bill.dueDate) < 0) bill.status = "Overdue";
      else if (bill.status === "Overdue" && dateDistance(bill.dueDate) >= 0) bill.status = "Pending";
    });
  }
  function updateNotifications() {
    if (!state.settings.notifications) {
      state.notifications = [];
      return;
    }
    const candidates = [];
    for (const task of state.tasks.filter(item => item.status !== "Completed")) {
      const days = dateDistance(task.dueDate);
      if (days <= 1 && days >= 0) candidates.push({ key: `task-${task.id}`, title: `${task.title} is due ${days === 0 ? "today" : "tomorrow"}.`, type: "tasks" });
    }
    for (const bill of state.bills.filter(item => item.status !== "Paid")) {
      const days = dateDistance(bill.dueDate);
      if (days <= 2) candidates.push({ key: `bill-${bill.id}`, title: `${bill.name} ${days < 0 ? "is overdue" : days === 0 ? "is due today" : "is due soon"}.`, type: "bills" });
    }
    for (const document of state.documents) {
      const days = dateDistance(document.expiryDate);
      if (days <= 30) candidates.push({ key: `document-${document.id}`, title: `${document.name} ${days < 0 ? "has expired" : days <= 7 ? "expires soon" : "expires this month"}.`, type: "documents" });
    }
    const openTasks = state.tasks.filter(task => task.status !== "Completed").length;
    if (openTasks) candidates.push({ key: "open-tasks", title: `You have ${openTasks} incomplete task${openTasks === 1 ? "" : "s"}.`, type: "tasks" });
    const current = new Map(state.notifications.map(notification => [notification.key, notification]));
    state.notifications = candidates.map(candidate => ({
      ...candidate,
      read: current.has(candidate.key) ? current.get(candidate.key).read : false,
      createdAt: current.has(candidate.key) ? current.get(candidate.key).createdAt : new Date().toISOString()
    }));
  }
  function browserNotificationCandidates() {
    const candidates = [];
    state.tasks.filter(item => !item.isDemo && item.status !== "Completed").forEach(item => {
      const days = dateDistance(item.dueDate);
      if (days === 0 || (days === 1 && item.priority === "High")) {
        const alertType = days === 0 ? "due-today" : "high-priority-tomorrow";
        candidates.push({ key: `task:${item.id}:${alertType}:${item.dueDate}`, title: "Task coming up", body: `${item.title} is due ${days === 0 ? "today" : "tomorrow"}.`, page: "tasks" });
      }
    });
    state.bills.filter(item => !item.isDemo && item.status !== "Paid" && dateDistance(item.dueDate) === 0).forEach(item => {
      candidates.push({ key: `bill:${item.id}:${item.dueDate}`, title: "Bill due today", body: `${item.name} is due today.`, page: "bills" });
    });
    state.reminders.filter(item => !item.isDemo && !item.completed && dateDistance(item.date) === 0).forEach(item => {
      candidates.push({ key: `reminder:${item.id}:${item.date}`, title: "Reminder due today", body: `${item.title}${item.time ? ` · ${formatTime(item.time)}` : ""}`, page: "reminders" });
    });
    state.calendarEvents.filter(item => !item.isDemo && dateDistance(item.date) === 0).forEach(item => {
      candidates.push({ key: `event:${item.id}:${item.date}`, title: "Upcoming event", body: `${item.title}${item.time ? ` · ${formatTime(item.time)}` : ""}`, page: "calendar" });
    });
    state.documents.filter(item => !item.isDemo && dateDistance(item.expiryDate) >= 0 && dateDistance(item.expiryDate) <= 7).forEach(item => {
      candidates.push({ key: `document:${item.id}:${item.expiryDate}`, title: "Document expiring soon", body: `${item.name} expires ${dateDistance(item.expiryDate) === 0 ? "today" : `in ${dateDistance(item.expiryDate)} days`}.`, page: "documents" });
    });
    return candidates;
  }
  function sendBrowserNotifications() {
    if (!state?.settings?.browserNotifications || !window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted") return;
    if (!Array.isArray(state.browserNotificationHistory)) state.browserNotificationHistory = [];
    const sent = new Set(state.browserNotificationHistory);
    let changed = false;
    browserNotificationCandidates().forEach(item => {
      if (!state.settings.browserNotifications || sent.has(item.key)) return;
      try {
        const notification = new Notification(item.title, { body: item.body, tag: `life-admin-${item.key}` });
        notification.onclick = () => {
          window.focus();
          navigate(item.page);
          notification.close();
        };
        state.browserNotificationHistory.push(item.key);
        sent.add(item.key);
        changed = true;
      } catch (error) {
        console.error("Unable to show a browser notification.", error);
        state.settings.browserNotifications = false;
        saveData();
        updateBrowserNotificationStatus();
        showToast("Browser alerts could not be displayed. Check this site’s notification settings.", "error");
      }
    });
    if (changed) {
      state.browserNotificationHistory = state.browserNotificationHistory.slice(-500);
      saveData();
    }
  }
  function updateBrowserNotificationStatus() {
    const status = byId("browserNotificationStatus");
    const button = byId("enableBrowserNotifications");
    if (!status || !button) return;
    if (!("Notification" in window) || !window.isSecureContext) {
      status.textContent = "Unavailable here. Use a supported browser over HTTPS or localhost.";
      button.textContent = "Unavailable";
      button.disabled = true;
      return;
    }
    const permission = Notification.permission;
    button.disabled = permission === "denied" || (permission === "default" && state.settings.browserPermissionRequested);
    if (permission === "denied") {
      status.textContent = "Blocked by your browser. Allow notifications in this site’s browser settings.";
      button.textContent = "Blocked by browser";
    } else if (permission === "granted" && state.settings.browserNotifications) {
      status.textContent = "Allowed by your browser and active for saved items.";
      button.textContent = "Pause browser alerts";
    } else if (permission === "granted") {
      status.textContent = "Browser permission is allowed; alerts are currently paused.";
      button.textContent = "Enable browser alerts";
    } else if (state.settings.browserPermissionRequested) {
      status.textContent = "No permission choice was made. Change this site’s notification permission in browser settings.";
      button.textContent = "Check browser settings";
    } else {
      status.textContent = "Permission has not been requested. You’ll only be asked after choosing Enable.";
      button.textContent = "Enable notifications";
    }
  }
  async function enableBrowserNotifications() {
    if (!("Notification" in window) || !window.isSecureContext) {
      updateBrowserNotificationStatus();
      showToast("Browser notifications require a supported browser on HTTPS or localhost.", "warning");
      return;
    }
    if (Notification.permission === "denied") {
      updateBrowserNotificationStatus();
      showToast("Notifications are blocked. Allow them in this site’s browser settings.", "warning");
      return;
    }
    if (Notification.permission === "granted") {
      state.settings.browserNotifications = !state.settings.browserNotifications;
      saveData();
      if (state.settings.browserNotifications) sendBrowserNotifications();
      updateBrowserNotificationStatus();
      showToast(state.settings.browserNotifications ? "Browser alerts are enabled." : "Browser alerts are paused.", "info");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      state.settings.browserPermissionRequested = true;
      state.settings.browserNotifications = permission === "granted";
      saveData();
      updateBrowserNotificationStatus();
      if (permission === "granted") {
        sendBrowserNotifications();
        showToast("Browser notifications are enabled.");
      } else if (permission === "denied") {
        showToast("Notifications were blocked. Allow them in this site’s browser settings.", "warning");
      } else {
        showToast("No permission choice was made. You can enable notifications from browser settings.", "info");
      }
    } catch (error) {
      console.error("The browser notification permission request failed.", error);
      updateBrowserNotificationStatus();
      showToast("The browser could not request notification permission.", "error");
    }
  }
  function showToast(message, type = "success") {
    if (!window.bootstrap) return;
    const names = { success: "All set", warning: "Just a heads-up", error: "Something went wrong", info: "Life Admin" };
    const toast = document.createElement("div");
    toast.className = `toast toast-${type} align-items-center mb-2`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `<div class="toast-header"><span class="toast-accent"></span><strong class="me-auto">${names[type] || names.info}</strong><small>now</small><button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button></div><div class="toast-body">${escapeHTML(message)}</div>`;
    byId("toastContainer").append(toast);
    const instance = new bootstrap.Toast(toast, { delay: 3500 });
    instance.show();
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
    byId("liveRegion").textContent = message;
  }
  function showUndoToast(message, undo) {
    if (!window.bootstrap) return;
    const toast = document.createElement("div");
    toast.className = "toast align-items-center mb-2";
    toast.setAttribute("role", "status");
    toast.innerHTML = `<div class="toast-header"><span class="toast-accent"></span><strong class="me-auto">Action saved</strong><small>just now</small><button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button></div><div class="toast-body undo-toast-body"><span>${escapeHTML(message)}</span><button type="button" class="undo-button">Undo</button></div>`;
    byId("toastContainer").append(toast);
    const instance = new bootstrap.Toast(toast, { delay: 8000 });
    toast.querySelector(".undo-button").addEventListener("click", () => {
      undo();
      instance.hide();
    });
    instance.show();
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
    byId("liveRegion").textContent = `${message} Undo is available for a few seconds.`;
  }
  function renderAll() {
    renderHeader();
    renderDashboard();
    renderTasks();
    renderBills();
    renderDocuments();
    renderGoals();
    renderReminders();
    renderCalendar();
    renderSettings();
    renderInsights();
  }
  function renderHeader() {
    byId("taskNavCount").textContent = state.tasks.filter(task => task.status !== "Completed").length || "";
    const date = new Date();
    byId("todayDate").textContent = formatDate(dateKey(date), { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    updateProfileDisplays();
    document.body.classList.toggle("dark", state.theme === "dark");
    $(".theme-toggle i").className = state.theme === "dark" ? "fa-regular fa-sun" : "fa-regular fa-moon";
    byId("notificationDot").classList.toggle("show", state.settings.notifications && state.notifications.some(item => !item.read));
    byId("pageTitle").textContent = PAGE_TITLES[currentPage];
    $$(".nav-link[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === currentPage));
  }
  function emptyState(title, message, action = "", icon = "fa-seedling") {
    return `<div class="empty-state"><i class="fa-solid ${icon}"></i><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p>${action ? `<button class="text-link mt-2" data-action="${action}">+ Add your first item</button>` : ""}</div>`;
  }
  function daysMessage(days, noun) {
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    if (days === 0) return `${noun} today`;
    if (days === 1) return `${noun} tomorrow`;
    return `In ${days} days`;
  }
  function collectAttention() {
    const items = [];
    state.tasks.filter(task => task.status !== "Completed").forEach(task => {
      const days = dateDistance(task.dueDate);
      if (days <= 30) items.push({ type: "tasks", id: task.id, title: task.title, category: task.category, date: task.dueDate, description: daysMessage(days, "Due"), severity: days <= 2 ? "Urgent" : days <= 7 ? "Soon" : "Upcoming", icon: ICONS.tasks });
    });
    state.bills.filter(bill => bill.status !== "Paid").forEach(bill => {
      const days = dateDistance(bill.dueDate);
      if (days <= 30) items.push({ type: "bills", id: bill.id, title: bill.name, category: bill.category, date: bill.dueDate, description: `${daysMessage(days, "Payment due")} · ${currency(bill.amount)}`, severity: days <= 2 ? "Urgent" : days <= 7 ? "Soon" : "Upcoming", icon: ICONS.bills });
    });
    state.documents.forEach(document => {
      const days = dateDistance(document.expiryDate);
      if (days <= 30) items.push({ type: "documents", id: document.id, title: document.name, category: document.type, date: document.expiryDate, description: days < 0 ? "Expired — renewal needed" : `Expires ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`, severity: days <= 2 ? "Urgent" : days <= 7 ? "Soon" : "Upcoming", icon: ICONS.documents });
    });
    state.reminders.filter(reminder => !reminder.completed).forEach(reminder => {
      const days = dateDistance(reminder.date);
      if (days <= 30) items.push({ type: "reminders", id: reminder.id, title: reminder.title, category: reminder.category, date: reminder.date, time: reminder.time, description: `${daysMessage(days, "Reminder")} · ${formatTime(reminder.time)}`, severity: days <= 2 ? "Urgent" : days <= 7 ? "Soon" : "Upcoming", icon: ICONS.reminders });
    });
    state.calendarEvents.forEach(event => {
      const days = dateDistance(event.date);
      if (days <= 30) items.push({ type: "calendarEvents", id: event.id, title: event.title, category: event.category, date: event.date, time: event.time, description: `${daysMessage(days, "Event")} · ${formatTime(event.time)}`, severity: days <= 2 ? "Urgent" : days <= 7 ? "Soon" : "Upcoming", icon: ICONS.calendarEvents });
    });
    return items.filter(item => dateDistance(item.date) >= -7).sort((a, b) => dateDistance(a.date) - dateDistance(b.date)).slice(0, 6);
  }
  function renderDashboard() {
    renderFocus();
    renderWeeklySummary();
    const attention = collectAttention();
    const urgent = attention.filter(item => item.severity === "Urgent").length;
    const todayCount = attention.filter(item => dateDistance(item.date) === 0).length;
    const expiring = state.documents.filter(item => dateDistance(item.expiryDate) >= 0 && dateDistance(item.expiryDate) <= 30).length;
    const avgGoal = average(state.goals.map(goal => goalProgress(goal)));
    const overview = [
      { label: "Urgent", value: urgent, caption: `${urgent} item${urgent === 1 ? "" : "s"} need attention`, icon: "fa-triangle-exclamation", color: "rose", target: "tasks", trend: "A little attention goes a long way" },
      { label: "Due today", value: todayCount, caption: `${todayCount} thing${todayCount === 1 ? "" : "s"} on your plate`, icon: "fa-calendar-day", color: "amber", target: "calendar", trend: "One thing at a time" },
      { label: "Expiring soon", value: expiring, caption: `${expiring} document${expiring === 1 ? "" : "s"} in the next 30 days`, icon: "fa-file-circle-exclamation", color: "blue", target: "documents", trend: "Stay one step ahead" },
      { label: "Goals progress", value: `${avgGoal}%`, caption: `${state.goals.length} goal${state.goals.length === 1 ? "" : "s"} in motion`, icon: "fa-bullseye", color: "violet", target: "goals", trend: "Every bit counts" }
    ];
    byId("overviewCards").innerHTML = overview.map(card => `<div class="overview-card" data-page="${card.target}" role="button" tabindex="0"><div class="overview-card-top"><span>${card.label}</span><i class="${card.color} fa-solid ${card.icon}"></i></div><div class="overview-value">${card.value}</div><div class="overview-caption">${card.caption}</div><div class="overview-trend"><i class="fa-solid fa-arrow-trend-up"></i>${card.trend}</div></div>`).join("");
    byId("attentionCount").textContent = attention.length;
    byId("attentionList").innerHTML = attention.length ? attention.slice(0, 5).map(item => `<div class="attention-item"><span class="attention-icon ${COLORS[item.type]}"><i class="fa-solid ${item.icon}"></i></span><div class="attention-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.description)} · ${escapeHTML(item.category || item.type)}</small></div><span class="priority-pill ${item.severity.toLowerCase()}-pill">${item.severity.toUpperCase()}</span></div>`).join("") : emptyState("Nothing pressing right now", "A little breathing room. Enjoy it.", "add-task", "fa-mug-hot");
    byId("pulseScore").textContent = lifePulse();
    $("#pulseRing").style.setProperty("--progress", `${lifePulse()}%`);
    const completedTasks = state.tasks.length ? Math.round(state.tasks.filter(item => item.status === "Completed").length / state.tasks.length * 100) : 100;
    const paidRatio = state.bills.length ? Math.round(state.bills.filter(item => item.status === "Paid").length / state.bills.length * 100) : 100;
    const validDocs = state.documents.length ? Math.round(state.documents.filter(item => documentStatus(item) === "Valid").length / state.documents.length * 100) : 100;
    byId("pulseMetrics").innerHTML = [
      ["Tasks", `${completedTasks}%`], ["Bills", paidRatio > 70 ? "On track" : `${paidRatio}%`],
      ["Goals", `${avgGoal}%`], ["Documents", validDocs > 70 ? "Healthy" : `${validDocs}%`]
    ].map(([label, value]) => `<div class="pulse-metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
    renderTimeline();
    byId("activityList").innerHTML = state.activities.length ? state.activities.slice(0, 5).map(activity => `<div class="activity-item"><span class="activity-mark"><i class="fa-solid ${escapeHTML(activity.icon || "fa-circle-check")}"></i></span><div><p>${escapeHTML(activity.text)}</p><small>${relativeTime(activity.date)}</small></div></div>`).join("") : emptyState("Your story starts here", "Your updates will show up here.");
    renderChart("dashboardExpenseChart", expenseConfig());
  }
  function renderFocus() {
    const focused = (state.settings.focusTaskIds || []).map(id => state.tasks.find(task => task.id === id)).filter(Boolean);
    state.settings.focusTaskIds = focused.map(task => task.id).slice(0, 3);
    byId("focusList").innerHTML = focused.length ? focused.map(task => `<div class="focus-task ${task.status === "Completed" ? "focus-done" : ""}"><span class="focus-task-check"><i class="fa-solid ${task.status === "Completed" ? "fa-circle-check" : "fa-circle"}"></i></span><span class="focus-task-copy"><strong>${escapeHTML(task.title)}</strong><small>${task.status === "Completed" ? "Done for today" : `${escapeHTML(task.priority)} priority · Due ${formatDate(task.dueDate, { month: "short", day: "numeric" })}`}</small></span><div class="focus-task-actions">${task.status !== "Completed" ? `<button class="row-action" data-action="toggle-task" data-type="tasks" data-id="${task.id}" aria-label="Complete ${escapeHTML(task.title)}"><i class="fa-solid fa-check"></i></button>` : ""}<button class="row-action delete" data-action="unfocus-task" data-id="${task.id}" aria-label="Remove ${escapeHTML(task.title)} from focus"><i class="fa-solid fa-xmark"></i></button></div></div>`).join("") : emptyState("Give today a direction", "Pin up to three tasks you want to focus on.", "choose-focus", "fa-bullseye");
  }
  function renderWeeklySummary() {
    const upcoming = [
      ...state.tasks.filter(item => item.status !== "Completed" && dateDistance(item.dueDate) >= 0 && dateDistance(item.dueDate) <= 7),
      ...state.bills.filter(item => item.status !== "Paid" && dateDistance(item.dueDate) >= 0 && dateDistance(item.dueDate) <= 7),
      ...state.reminders.filter(item => !item.completed && dateDistance(item.date) >= 0 && dateDistance(item.date) <= 7),
      ...state.calendarEvents.filter(item => dateDistance(item.date) >= 0 && dateDistance(item.date) <= 7)
    ].length;
    const overdue = [
      ...state.tasks.filter(item => item.status !== "Completed" && dateDistance(item.dueDate) < 0),
      ...state.bills.filter(item => item.status !== "Paid" && dateDistance(item.dueDate) < 0),
      ...state.reminders.filter(item => !item.completed && dateDistance(item.date) < 0)
    ].length;
    const weekAgo = Date.now() - 7 * 86400000;
    const completed = state.activities.filter(activity => {
      const date = new Date(activity.date).getTime();
      return date >= weekAgo && /^(Task completed:|Reminder completed:|Bill marked paid:)/.test(activity.text);
    }).length;
    byId("weeklySummary").innerHTML = [
      { label: "Coming up", count: upcoming, note: "next 7 days", icon: "fa-arrow-right", color: "violet", page: "calendar" },
      { label: "Overdue", count: overdue, note: "needs a little care", icon: "fa-clock", color: "rose", page: "tasks" },
      { label: "Completed", count: completed, note: "in the last 7 days", icon: "fa-circle-check", color: "green", page: "tasks" }
    ].map(item => `<button class="weekly-metric" data-page="${item.page}"><span class="weekly-metric-icon ${item.color}"><i class="fa-solid ${item.icon}"></i></span><span class="weekly-metric-copy"><strong>${item.label}</strong><small>${item.note}</small></span><span class="weekly-metric-count">${item.count}</span></button>`).join("");
  }
  function openFocusPicker() {
    const selected = new Set(state.settings.focusTaskIds || []);
    const eligible = state.tasks.filter(task => task.status !== "Completed" || selected.has(task.id));
    byId("focusTaskChoices").innerHTML = eligible.length ? eligible.map(task => `<label class="focus-choice"><input type="checkbox" name="focusTasks" value="${task.id}" ${selected.has(task.id) ? "checked" : ""}><span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.category)} · ${task.status === "Completed" ? "Completed" : `${escapeHTML(task.priority)} priority`}</small></span></label>`).join("") : emptyState("No tasks to choose from", "Add a task first, then pin it here.", "add-task");
    byId("focusLimitMessage").textContent = `${Math.min(selected.size, 3)} of 3 priorities selected.`;
    if (selected.size >= 3) $$('input[name="focusTasks"]:not(:checked)', byId("focusTaskChoices")).forEach(input => { input.disabled = true; });
    byId("focusModal").querySelector('button[type="submit"]').disabled = eligible.length === 0;
    focusModal.show();
  }
  function saveFocusSelection(event) {
    event.preventDefault();
    const selected = $$('input[name="focusTasks"]:checked', byId("focusTaskChoices")).map(input => input.value);
    if (selected.length > 3) {
      showToast("Choose up to three priorities.", "warning");
      return;
    }
    state.settings.focusTaskIds = selected;
    focusModal.hide();
    refresh();
    showToast("Today's priorities have been saved.");
  }
  function renderTimeline() {
    const entries = [];
    state.tasks.filter(item => item.status !== "Completed" && dateDistance(item.dueDate) >= 0).forEach(item => entries.push({ title: item.title, date: item.dueDate, time: "", label: "Task" }));
    state.bills.filter(item => item.status !== "Paid" && dateDistance(item.dueDate) >= 0).forEach(item => entries.push({ title: item.name, date: item.dueDate, time: "", label: "Payment due" }));
    state.reminders.filter(item => !item.completed && dateDistance(item.date) >= 0).forEach(item => entries.push({ title: item.title, date: item.date, time: item.time, label: "Reminder" }));
    state.calendarEvents.filter(item => dateDistance(item.date) >= 0).forEach(item => entries.push({ title: item.title, date: item.date, time: item.time, label: "Event" }));
    entries.sort((a, b) => dateDistance(a.date) - dateDistance(b.date) || (a.time || "").localeCompare(b.time || ""));
    byId("timelineList").innerHTML = entries.length ? entries.slice(0, 5).map(item => `<div class="timeline-item"><div><strong>${escapeHTML(item.title)}</strong><small>${item.label}${item.time ? ` · ${formatTime(item.time)}` : ""}</small></div><span class="timeline-date">${dateDistance(item.date) === 0 ? "Today" : dateDistance(item.date) === 1 ? "Tomorrow" : formatDate(item.date, { weekday: "short", month: "short", day: "numeric" })}</span></div>`).join("") : emptyState("A clear horizon", "Your upcoming plans will appear here.", "add-event");
  }
  function currency(amount) {
    const code = profile?.currency || "USD";
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  }
  function average(values) {
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  }
  function goalProgress(goal) {
    const target = Number(goal.target) || 0;
    return target > 0 ? Math.min(100, Math.round(Number(goal.current) / target * 100)) : 0;
  }
  function lifePulse() {
    const taskScore = state.tasks.length ? state.tasks.filter(item => item.status === "Completed").length / state.tasks.length * 100 : 100;
    const billScore = state.bills.length ? state.bills.filter(item => item.status === "Paid").length / state.bills.length * 100 : 100;
    const goalScore = average(state.goals.map(goalProgress));
    const documentScore = state.documents.length ? state.documents.filter(item => documentStatus(item) === "Valid").length / state.documents.length * 100 : 100;
    const reminderScore = state.reminders.length ? state.reminders.filter(item => item.completed || dateDistance(item.date) >= 0).length / state.reminders.length * 100 : 100;
    return Math.round((taskScore + billScore + goalScore + documentScore + reminderScore) / 5);
  }
  function formatTime(value) {
    if (!value) return "";
    const [hours, minutes] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
  }
  function relativeTime(value) {
    const ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "Just now";
    if (ms < 60000) return "Just now";
    if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)} hr ago`;
    return `${Math.floor(ms / 86400000)} days ago`;
  }
  function renderStats(target, items) {
    byId(target).innerHTML = items.map(item => `<div class="stat-card"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("");
  }
  function statusClass(status) {
    return `status-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
  }
  function badge(status) {
    return `<span class="status-pill ${statusClass(status)}">${escapeHTML(status)}</span>`;
  }
  function tableEmpty(message, action) {
    return emptyState(message, "Add an item whenever you’re ready.", action, "fa-seedling");
  }
  function rowsTable(headers, rows) {
    if (!rows.length) return "";
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }
  function iconCell(type, title, subtitle = "") {
    return `<div class="item-title"><span class="table-icon ${COLORS[type]}"><i class="fa-solid ${ICONS[type]}"></i></span><span><strong>${escapeHTML(title)}</strong>${subtitle ? `<small>${escapeHTML(subtitle)}</small>` : ""}</span></div>`;
  }
  function actions(type, id, options = {}) {
    const edit = `<button class="row-action" data-action="edit" data-type="${type}" data-id="${id}" aria-label="Edit ${type}"><i class="fa-regular fa-pen-to-square"></i></button>`;
    const remove = `<button class="row-action delete" data-action="delete" data-type="${type}" data-id="${id}" aria-label="Delete ${type}"><i class="fa-regular fa-trash-can"></i></button>`;
    const toggle = options.toggle ? `<button class="row-action" data-action="${options.toggle.action}" data-type="${type}" data-id="${id}" aria-label="${options.toggle.label}"><i class="fa-solid ${options.toggle.icon}"></i></button>` : "";
    const pay = options.pay ? `<button class="row-action" data-action="pay" data-type="${type}" data-id="${id}" aria-label="Toggle payment status"><i class="fa-solid fa-${options.paid ? "rotate-left" : "check"}"></i></button>` : "";
    return `<div class="row-actions">${toggle}${pay}${edit}${remove}</div>`;
  }
  function matchesSearch(item, text, fields) {
    const query = (text || "").trim().toLowerCase();
    return !query || fields.some(field => String(item[field] ?? "").toLowerCase().includes(query));
  }
  function renderTasks() {
    const query = byId("tasksSearch").value;
    const status = byId("tasksStatus").value;
    const priority = byId("tasksPriority").value;
    const category = byId("tasksCategory").value;
    const sort = byId("tasksSort").value;
    const completed = state.tasks.filter(item => item.status === "Completed").length;
    renderStats("taskStats", [{ label: "All tasks", value: state.tasks.length }, { label: "In progress", value: state.tasks.filter(item => item.status === "In Progress").length }, { label: "Due today", value: state.tasks.filter(item => dateDistance(item.dueDate) === 0 && item.status !== "Completed").length }, { label: "Completed", value: `${completed} · ${state.tasks.length ? Math.round(completed / state.tasks.length * 100) : 0}%` }]);
    populateFilter("tasksCategory", state.tasks.map(item => item.category));
    let items = state.tasks.filter(item => matchesSearch(item, query, ["title", "description", "category"]) && (!status || item.status === status) && (!priority || item.priority === priority) && (!category || item.category === category));
    if (!state.settings.showCompleted && !status) items = items.filter(item => item.status !== "Completed");
    items.sort(sort === "priority" ? (a, b) => priorityRank(a.priority) - priorityRank(b.priority) : sort === "created" ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt) : (a, b) => dateDistance(a.dueDate) - dateDistance(b.dueDate));
    const rows = items.map(item => `<tr><td>${iconCell("tasks", item.title, item.category)}</td><td>${escapeHTML(item.category)}</td><td>${badge(item.priority)}</td><td>${formatDate(item.dueDate, { month: "short", day: "numeric", year: "numeric" })}</td><td>${badge(item.status)}</td><td>${actions("tasks", item.id, { toggle: { action: "toggle-task", label: item.status === "Completed" ? "Mark incomplete" : "Mark complete", icon: item.status === "Completed" ? "fa-rotate-left" : "fa-check" } })}</td></tr>`);
    byId("tasksList").innerHTML = rows.length ? rowsTable(["Task", "Category", "Priority", "Due date", "Status", ""], rows) : tableEmpty(query || status || priority || category ? "No tasks match those filters" : "No tasks yet", "add-task");
  }
  function priorityRank(value) { return ({ High: 0, Medium: 1, Low: 2 })[value] ?? 3; }
  function populateFilter(id, values) {
    const select = byId(id);
    const selected = select.value;
    const first = select.options[0].outerHTML;
    select.innerHTML = first + [...new Set(values.filter(Boolean))].sort().map(value => `<option>${escapeHTML(value)}</option>`).join("");
    select.value = [...select.options].some(option => option.value === selected) ? selected : "";
  }
  function renderBills() {
    const query = byId("billsSearch").value;
    const status = byId("billsStatus").value;
    const category = byId("billsCategory").value;
    const sort = byId("billsSort").value;
    const sum = key => currency(state.bills.filter(key).reduce((total, bill) => total + Number(bill.amount), 0));
    renderStats("billStats", [
      { label: "Monthly bills", value: currency(state.bills.filter(item => item.recurring === "Monthly" || item.recurring === "Yearly").reduce((total, bill) => total + Number(bill.amount) / (bill.recurring === "Yearly" ? 12 : 1), 0)) },
      { label: "Paid", value: sum(item => item.status === "Paid") },
      { label: "Pending", value: sum(item => item.status === "Pending") },
      { label: "Overdue", value: sum(item => item.status === "Overdue") }
    ]);
    populateFilter("billsCategory", state.bills.map(item => item.category));
    let items = state.bills.filter(item => matchesSearch(item, query, ["name", "category", "notes"]) && (!status || item.status === status) && (!category || item.category === category));
    items.sort(sort === "amount" ? (a, b) => Number(b.amount) - Number(a.amount) : (a, b) => dateDistance(a.dueDate) - dateDistance(b.dueDate));
    const rows = items.map(item => `<tr><td>${iconCell("bills", item.name, item.recurring === "One-time" ? "One-time" : "Recurring")}</td><td>${escapeHTML(item.category)}</td><td>${currency(item.amount)}</td><td>${formatDate(item.dueDate, { month: "short", day: "numeric", year: "numeric" })}</td><td>${badge(item.status)}</td><td>${actions("bills", item.id, { pay: true, paid: item.status === "Paid" })}</td></tr>`);
    byId("billsList").innerHTML = rows.length ? rowsTable(["Bill", "Category", "Amount", "Due date", "Status", ""], rows) : tableEmpty(query || status || category ? "No bills match those filters" : "No bills yet", "add-bill");
  }
  function documentStatus(item) {
    const days = dateDistance(item.expiryDate);
    return days < 0 ? "Expired" : days <= 30 ? "Expiring soon" : "Valid";
  }
  function renderDocuments() {
    const query = byId("documentsSearch").value;
    const type = byId("documentsType").value;
    const status = byId("documentsStatus").value;
    renderStats("documentStats", [
      { label: "All documents", value: state.documents.length },
      { label: "Valid", value: state.documents.filter(item => documentStatus(item) === "Valid").length },
      { label: "Expiring soon", value: state.documents.filter(item => documentStatus(item) === "Expiring soon").length },
      { label: "Expired", value: state.documents.filter(item => documentStatus(item) === "Expired").length }
    ]);
    populateFilter("documentsType", state.documents.map(item => item.type));
    const items = state.documents.filter(item => matchesSearch(item, query, ["name", "type", "notes"]) && (!type || item.type === type) && (!status || documentStatus(item) === status));
    const rows = items.map(item => `<tr><td>${iconCell("documents", item.name, item.notes)}</td><td>${escapeHTML(item.type)}</td><td>${formatDate(item.expiryDate, { month: "short", day: "numeric", year: "numeric" })}</td><td>${badge(documentStatus(item))}</td><td>${actions("documents", item.id)}</td></tr>`);
    byId("documentsList").innerHTML = rows.length ? rowsTable(["Document", "Type", "Expiry date", "Status", ""], rows) : tableEmpty(query || type || status ? "No documents match those filters" : "No documents yet", "add-document");
  }
  function renderGoals() {
    const query = byId("goalsSearch").value;
    const status = byId("goalsStatus").value;
    const sort = byId("goalsSort").value;
    const completed = state.goals.filter(item => goalProgress(item) === 100).length;
    renderStats("goalStats", [{ label: "Goals in motion", value: state.goals.length }, { label: "Average progress", value: `${average(state.goals.map(goalProgress))}%` }, { label: "Completed", value: completed }, { label: "Next deadline", value: state.goals.length ? formatDate(state.goals.toSorted ? state.goals.toSorted((a, b) => dateDistance(a.deadline) - dateDistance(b.deadline))[0].deadline : [...state.goals].sort((a, b) => dateDistance(a.deadline) - dateDistance(b.deadline))[0].deadline, { month: "short", day: "numeric" }) : "—" }]);
    let items = state.goals.filter(item => matchesSearch(item, query, ["name", "description", "category"]) && (!status || (goalProgress(item) === 100 ? "Completed" : "In progress") === status));
    items.sort(sort === "progress" ? (a, b) => goalProgress(b) - goalProgress(a) : (a, b) => dateDistance(a.deadline) - dateDistance(b.deadline));
    byId("goalsList").innerHTML = items.length ? items.map(item => {
      const progress = goalProgress(item);
      return `<article class="card-panel goal-card"><div class="goal-top"><span class="goal-icon ${COLORS.goals}"><i class="fa-solid ${ICONS.goals}"></i></span>${actions("goals", item.id, { toggle: { action: "progress-goal", label: "Update progress", icon: "fa-plus" } })}</div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description || item.category)}</p><div class="goal-amounts"><strong>${escapeHTML(item.category === "Savings" ? currency(item.current) : `${Number(item.current)} / ${Number(item.target)}`)}</strong><span>${item.category === "Savings" ? `of ${currency(item.target)}` : `${progress}%`}</span></div><div class="progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${progress}%"></div></div><div class="goal-bottom"><span>${progress === 100 ? "Goal reached — beautiful work!" : `Target · ${formatDate(item.deadline, { month: "short", day: "numeric", year: "numeric" })}`}</span><div class="row-actions"><button class="row-action" data-action="edit" data-type="goals" data-id="${item.id}" aria-label="Edit goal"><i class="fa-regular fa-pen-to-square"></i></button><button class="row-action delete" data-action="delete" data-type="goals" data-id="${item.id}" aria-label="Delete goal"><i class="fa-regular fa-trash-can"></i></button></div></div></article>`;
    }).join("") : `<div class="card-panel">${tableEmpty(query || status ? "No goals match those filters" : "No goals yet", "add-goal")}</div>`;
  }
  function renderReminders() {
    const query = byId("remindersSearch").value;
    const status = byId("remindersStatus").value;
    const sort = byId("remindersSort").value;
    renderStats("reminderStats", [{ label: "All reminders", value: state.reminders.length }, { label: "Upcoming", value: state.reminders.filter(item => !item.completed).length }, { label: "Due today", value: state.reminders.filter(item => !item.completed && dateDistance(item.date) === 0).length }, { label: "Completed", value: state.reminders.filter(item => item.completed).length }]);
    let items = state.reminders.filter(item => matchesSearch(item, query, ["title", "category", "notes"]) && (!status || (item.completed ? "Completed" : "Upcoming") === status));
    if (!state.settings.showCompleted && !status) items = items.filter(item => !item.completed);
    items.sort(sort === "priority" ? (a, b) => priorityRank(a.priority) - priorityRank(b.priority) : (a, b) => dateDistance(a.date) - dateDistance(b.date) || (a.time || "").localeCompare(b.time || ""));
    const rows = items.map(item => `<tr><td>${iconCell("reminders", item.title, item.notes)}</td><td>${escapeHTML(item.category)}</td><td>${formatDate(item.date, { month: "short", day: "numeric", year: "numeric" })}${item.time ? `<small class="d-block text-muted">${formatTime(item.time)}</small>` : ""}</td><td>${badge(item.priority)}</td><td>${badge(item.completed ? "Completed" : "Upcoming")}</td><td>${actions("reminders", item.id, { toggle: { action: "toggle-reminder", label: item.completed ? "Mark incomplete" : "Complete reminder", icon: item.completed ? "fa-rotate-left" : "fa-check" } })}</td></tr>`);
    byId("remindersList").innerHTML = rows.length ? rowsTable(["Reminder", "Category", "Date", "Priority", "Status", ""], rows) : tableEmpty(query || status ? "No reminders match those filters" : "No reminders yet", "add-reminder");
  }
  function renderCalendar() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    byId("calendarMonth").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(calendarCursor);
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - startOffset);
    const cells = [];
    const current = dateKey(new Date());
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = dateKey(day);
      const items = calendarItems(key);
      cells.push(`<button class="calendar-day ${day.getMonth() !== month ? "outside" : ""} ${key === current ? "today" : ""} ${key === activeCalendarDate ? "selected" : ""}" data-date="${key}" aria-label="${formatDate(key)}${items.length ? `, ${items.length} events` : ""}"><span class="day-number">${day.getDate()}</span>${items.slice(0, 2).map(item => `<span class="calendar-event-dot ${item.type === "bills" ? "bill-dot" : item.type === "tasks" ? "task-dot" : ""}">${escapeHTML(item.title)}</span>`).join("")}${items.length > 2 ? `<span class="calendar-event-dot">+${items.length - 2} more</span>` : ""}</button>`);
    }
    byId("calendarGrid").innerHTML = cells.join("");
    renderSelectedDay();
  }
  function calendarItems(date) {
    return [
      ...state.calendarEvents.filter(item => item.date === date).map(item => ({ ...item, type: "calendarEvents", subtitle: `Event · ${formatTime(item.time)}` })),
      ...state.reminders.filter(item => item.date === date && !item.completed).map(item => ({ ...item, type: "reminders", subtitle: `Reminder · ${formatTime(item.time)}` })),
      ...state.tasks.filter(item => item.dueDate === date && item.status !== "Completed").map(item => ({ ...item, type: "tasks", subtitle: `Task · ${item.status}` })),
      ...state.bills.filter(item => item.dueDate === date && item.status !== "Paid").map(item => ({ ...item, type: "bills", subtitle: `Payment · ${currency(item.amount)}` }))
    ].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }
  function renderSelectedDay() {
    byId("selectedDayTitle").textContent = formatDate(activeCalendarDate, { weekday: "long", month: "long", day: "numeric" });
    const items = calendarItems(activeCalendarDate);
    byId("selectedDayItems").innerHTML = items.length ? items.map(item => `<div class="day-event"><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></div>${item.type === "calendarEvents" ? `<div class="row-actions"><button class="row-action" data-action="edit" data-type="calendarEvents" data-id="${item.id}" aria-label="Edit event"><i class="fa-regular fa-pen-to-square"></i></button><button class="row-action delete" data-action="delete" data-type="calendarEvents" data-id="${item.id}" aria-label="Delete event"><i class="fa-regular fa-trash-can"></i></button></div>` : ""}</div>`).join("") : emptyState("A little breathing room", "Nothing planned for this day.", "add-event", "fa-mug-hot");
  }
  function renderSettings() {
    byId("profileName").value = profile?.name || "";
    byId("profileCurrency").value = profile?.currency || "USD";
    byId("profileDateFormat").value = profile?.dateFormat || "system";
    byId("settingNotifications").checked = state.settings.notifications;
    updateBrowserNotificationStatus();
    byId("settingCompleted").checked = state.settings.showCompleted;
    byId("settingDefaultPage").value = state.settings.defaultPage;
    $$(".theme-choice").forEach(button => button.classList.toggle("active", button.dataset.theme === state.theme));
  }
  function renderInsights() {
    const taskTotal = state.tasks.length;
    const taskDone = state.tasks.filter(item => item.status === "Completed").length;
    renderStats("insightStats", [
      { label: "Life pulse", value: `${lifePulse()} / 100` },
      { label: "Tasks completed", value: `${taskDone} / ${taskTotal}` },
      { label: "Goal progress", value: `${average(state.goals.map(goalProgress))}%` },
      { label: "Bills paid", value: `${state.bills.filter(item => item.status === "Paid").length} / ${state.bills.length}` }
    ]);
    renderChart("expenseChart", expenseConfig());
    renderChart("taskChart", {
      type: "doughnut",
      data: { labels: ["Completed", "In progress", "Pending"], datasets: [{ data: [taskDone, state.tasks.filter(item => item.status === "In Progress").length, state.tasks.filter(item => item.status === "Pending").length], backgroundColor: [chartColor("green"), chartColor("accent"), chartColor("muted")], borderWidth: 0 }] },
      options: doughnutOptions()
    });
    renderChart("goalChart", {
      type: "bar",
      data: { labels: state.goals.length ? state.goals.map(item => shorten(item.name)) : ["No goals yet"], datasets: [{ label: "Progress", data: state.goals.length ? state.goals.map(goalProgress) : [0], backgroundColor: chartColor("accent"), borderRadius: 6, barThickness: 18 }] },
      options: barOptions(100, "%")
    });
    renderChart("billChart", {
      type: "doughnut",
      data: { labels: ["Paid", "Pending", "Overdue"], datasets: [{ data: ["Paid", "Pending", "Overdue"].map(status => state.bills.filter(item => item.status === status).length), backgroundColor: [chartColor("green"), chartColor("amber"), chartColor("red")], borderWidth: 0 }] },
      options: doughnutOptions()
    });
    const upcoming = state.tasks.filter(item => item.status !== "Completed").length +
      state.bills.filter(item => item.status !== "Paid").length +
      state.reminders.filter(item => !item.completed).length +
      state.calendarEvents.filter(item => dateDistance(item.date) >= 0).length;
    const completed = state.tasks.filter(item => item.status === "Completed").length +
      state.bills.filter(item => item.status === "Paid").length +
      state.reminders.filter(item => item.completed).length;
    renderChart("itemsChart", {
      type: "doughnut",
      data: { labels: ["Upcoming", "Completed"], datasets: [{ data: [upcoming, completed], backgroundColor: [chartColor("accent"), chartColor("green")], borderWidth: 0 }] },
      options: doughnutOptions()
    });
  }
  function shorten(value) { return value.length > 15 ? `${value.slice(0, 13)}…` : value; }
  function chartColor(name) {
    return getComputedStyle(document.body).getPropertyValue(`--${name}`).trim() || (name === "accent" ? "#6b5ce7" : "#85889b");
  }
  function chartTextColor() { return getComputedStyle(document.body).getPropertyValue("--muted").trim() || "#85889b"; }
  function expenseConfig() {
    const categories = [...new Set(state.bills.map(item => item.category))];
    const labels = categories.length ? categories : ["No bills yet"];
    return {
      type: "bar",
      data: { labels, datasets: [{ label: "Amount", data: categories.length ? categories.map(category => state.bills.filter(item => item.category === category && item.recurring !== "One-time").reduce((sum, item) => sum + Number(item.amount) / (item.recurring === "Yearly" ? 12 : 1), 0)) : [0], backgroundColor: chartColor("accent"), borderRadius: 6, maxBarThickness: 32 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${currency(context.raw)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { family: "DM Sans", size: 9 } } },
          y: { beginAtZero: true, grid: { color: chartColor("border") }, ticks: { color: chartTextColor(), font: { family: "DM Sans", size: 9 }, callback: value => `$${value}` } }
        }
      }
    };
  }
  function doughnutOptions() {
    return { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { position: "bottom", labels: { color: chartTextColor(), usePointStyle: true, pointStyle: "circle", padding: 18, font: { family: "DM Sans", size: 10 } } } } };
  }
  function barOptions(max, suffix) {
    return { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${context.raw}${suffix}` } } }, scales: { x: { max, beginAtZero: true, grid: { color: chartColor("border") }, ticks: { color: chartTextColor(), font: { family: "DM Sans", size: 9 }, callback: value => `${value}${suffix}` } }, y: { grid: { display: false }, ticks: { color: chartTextColor(), font: { family: "DM Sans", size: 9 } } } } };
  }
  function renderChart(id, config) {
    const canvas = byId(id);
    if (!canvas || !window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, config);
  }

  const FIELD_DEFS = {
    tasks: [
      ["title", "Task name", "text", true, "e.g. Book annual check-up", true],
      ["category", "Category", "select", true, null, false, "tasks"],
      ["priority", "Priority", "select", true, null, false, ["Low", "Medium", "High"]],
      ["dueDate", "Due date", "date", true],
      ["status", "Status", "select", true, null, false, ["Pending", "In Progress", "Completed"]],
      ["description", "A few details", "textarea", false, "What would you like to remember?", true]
    ],
    bills: [
      ["name", "Bill name", "text", true, "e.g. Home internet", true],
      ["category", "Category", "select", true, null, false, "bills"],
      ["amount", "Amount (USD)", "number", true, "0.00", false, null, { min: "0", step: "0.01" }],
      ["dueDate", "Due date", "date", true],
      ["recurring", "Billing frequency", "select", true, null, false, ["Monthly", "Yearly", "One-time"]],
      ["status", "Payment status", "select", true, null, false, ["Pending", "Paid"]],
      ["notes", "Notes", "textarea", false, "Any details worth keeping?", true]
    ],
    documents: [
      ["name", "Document name", "text", true, "e.g. Vehicle insurance", true],
      ["type", "Document type", "select", true, null, false, "documents"],
      ["expiryDate", "Expiry date", "date", true],
      ["notes", "Notes", "textarea", false, "Renewal details or where it’s stored", true]
    ],
    goals: [
      ["name", "Goal name", "text", true, "e.g. A new skill", true],
      ["category", "Category", "select", true, null, false, "goals"],
      ["target", "Target value", "number", true, "100", false, null, { min: "0.01", step: "any" }],
      ["current", "Current progress", "number", true, "0", false, null, { min: "0", step: "any" }],
      ["deadline", "Target date", "date", true],
      ["description", "Why it matters", "textarea", false, "A little context for future you", true]
    ],
    reminders: [
      ["title", "Reminder title", "text", true, "e.g. Call the dentist", true],
      ["date", "Date", "date", true],
      ["time", "Time", "time", false],
      ["category", "Category", "select", true, null, false, "reminders"],
      ["priority", "Priority", "select", true, null, false, ["Low", "Medium", "High"]],
      ["notes", "Notes", "textarea", false, "Anything helpful to remember?", true]
    ],
    calendarEvents: [
      ["title", "Event title", "text", true, "e.g. Coffee with a friend", true],
      ["date", "Date", "date", true],
      ["time", "Time", "time", false],
      ["category", "Category", "select", true, null, false, "calendarEvents"],
      ["description", "A few details", "textarea", false, "Add a little context", true]
    ]
  };
  const TYPE_LABELS = { tasks: "Task", bills: "Bill", documents: "Document", goals: "Goal", reminders: "Reminder", calendarEvents: "Calendar event" };
  function openForm(type, id = null) {
    const existing = id ? state[type].find(item => item.id === id) : null;
    if (id && !existing) return showToast("That item could not be found.", "error");
    editing = { type, id };
    const labels = { tasks: "TASK DETAILS", bills: "PAYMENT DETAILS", documents: "DOCUMENT DETAILS", goals: "GOAL DETAILS", reminders: "REMINDER DETAILS", calendarEvents: "EVENT DETAILS" };
    byId("modalKicker").textContent = labels[type];
    byId("itemModalTitle").textContent = `${existing ? "Edit" : "Add"} ${TYPE_LABELS[type].toLowerCase()}`;
    byId("formFields").innerHTML = FIELD_DEFS[type].map(definition => fieldHTML(definition, existing)).join("");
    if (type === "bills") $("#field-amount").closest(".form-field").querySelector("label").textContent = `Amount (${profile?.currency || "USD"}) *`;
    byId("itemForm").classList.remove("was-validated");
    itemModal.show();
    setTimeout(() => $("#formFields input, #formFields select")?.focus(), 150);
  }
  function fieldHTML(definition, existing) {
    const [name, label, type, required, placeholder, full, optionSource, attributes = {}] = definition;
    let value = existing?.[name] ?? "";
    if (!existing && name === "dueDate" || !existing && name === "expiryDate" || !existing && name === "deadline" || !existing && name === "date") value = activeCalendarDate || offsetDate(7);
    if (!existing && name === "status") value = "Pending";
    if (!existing && name === "priority") value = "Medium";
    if (!existing && name === "recurring") value = "Monthly";
    if (!existing && name === "current") value = 0;
    let input;
    if (type === "select") {
      const options = Array.isArray(optionSource) ? optionSource : CATEGORIES[optionSource] || [];
      input = `<select class="form-select" id="field-${name}" name="${name}" ${required ? "required" : ""}><option value="">Choose ${label.toLowerCase()}</option>${options.map(option => `<option value="${escapeHTML(option)}" ${String(value) === option ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select>`;
    } else if (type === "textarea") {
      input = `<textarea id="field-${name}" name="${name}" placeholder="${escapeHTML(placeholder || "")}" ${required ? "required" : ""}>${escapeHTML(value)}</textarea>`;
    } else {
      const attr = Object.entries(attributes).map(([key, val]) => `${key}="${escapeHTML(val)}"`).join(" ");
      input = `<input id="field-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder || "")}" ${required ? "required" : ""} ${attr}>`;
    }
    return `<div class="form-field ${full ? "full" : ""}"><label for="field-${name}">${label}${required ? " <span class='text-danger'>*</span>" : ""}</label>${input}<div class="invalid-feedback">Please provide a valid ${label.toLowerCase()}.</div></div>`;
  }
  function onSubmitForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      form.querySelector(":invalid")?.focus();
      return;
    }
    const { type, id } = editing;
    const values = Object.fromEntries(new FormData(form).entries());
    if (type === "bills") values.amount = Number(values.amount);
    if (type === "goals") {
      values.target = Number(values.target);
      values.current = Number(values.current);
      if (values.target <= 0 || values.current < 0) return showToast("Goal values must be greater than zero and cannot be negative.", "warning");
      if (values.current > values.target) return showToast("Progress can’t be greater than the target.", "warning");
    }
    if (type === "reminders") values.completed = id ? Boolean(state[type].find(item => item.id === id)?.completed) : false;
    if (type === "tasks") values.createdAt = id ? state[type].find(item => item.id === id)?.createdAt : new Date().toISOString();
    if (id) {
      state[type] = state[type].map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...values };
        delete updated.isDemo;
        return updated;
      });
      logActivity(`${TYPE_LABELS[type]} updated: ${values.title || values.name}.`, "fa-pen");
    } else {
      state[type].unshift({ id: generateId(), ...values });
      logActivity(`${TYPE_LABELS[type]} added: ${values.title || values.name}.`, `fa-${ICONS[type]}`);
    }
    itemModal.hide();
    refresh();
    showToast(`${TYPE_LABELS[type]} ${id ? "updated" : "added"} successfully.`);
  }
  function askConfirmation(title, message, callback, confirmText = "Delete", destructive = true) {
    byId("confirmTitle").textContent = title;
    byId("confirmMessage").textContent = message;
    const button = byId("confirmDelete");
    button.textContent = confirmText;
    button.classList.toggle("btn-danger-soft", destructive);
    button.classList.toggle("btn-primary-custom", !destructive);
    confirmCallback = callback;
    confirmModal.show();
  }
  function deleteItem(type, id) {
    const item = state[type].find(record => record.id === id);
    if (!item) return;
    askConfirmation(`Delete this ${TYPE_LABELS[type].toLowerCase()}?`, `“${item.title || item.name}” will be removed. You can undo this for a few seconds.`, () => {
      const index = state[type].findIndex(record => record.id === id);
      const wasFocused = type === "tasks" && state.settings.focusTaskIds.includes(id);
      state[type] = state[type].filter(record => record.id !== id);
      if (wasFocused) state.settings.focusTaskIds = state.settings.focusTaskIds.filter(taskId => taskId !== id);
      const activityId = logActivity(`${TYPE_LABELS[type]} deleted: ${item.title || item.name}.`, "fa-trash-can");
      refresh();
      showUndoToast(`${TYPE_LABELS[type]} deleted.`, () => {
        state[type].splice(Math.min(index, state[type].length), 0, item);
        if (wasFocused && state.settings.focusTaskIds.length < 3) state.settings.focusTaskIds.push(id);
        state.activities = state.activities.filter(activity => activity.id !== activityId);
        refresh();
        showToast(`${TYPE_LABELS[type]} restored.`);
      });
    });
  }
  function handleAction(action, type, id) {
    if (action.startsWith("add-")) {
      const typeByAction = { "add-task": "tasks", "add-bill": "bills", "add-document": "documents", "add-goal": "goals", "add-reminder": "reminders", "add-event": "calendarEvents" };
      return openForm(typeByAction[action]);
    }
    if (action === "edit") return openForm(type, id);
    if (action === "delete") return deleteItem(type, id);
    if (action === "choose-focus") return openFocusPicker();
    if (action === "unfocus-task") {
      state.settings.focusTaskIds = state.settings.focusTaskIds.filter(taskId => taskId !== id);
      refresh();
      showToast("Task removed from today's focus.");
      return;
    }
    const item = state[type]?.find(record => record.id === id);
    if (!item) return;
    if (action === "toggle-task") {
      const previous = item.status;
      delete item.isDemo;
      item.status = item.status === "Completed" ? "Pending" : "Completed";
      const activityId = logActivity(`Task ${item.status === "Completed" ? "completed" : "reopened"}: ${item.title}.`, "fa-check");
      refresh();
      showUndoToast(item.status === "Completed" ? "Task completed." : "Task marked incomplete.", () => {
        const current = state.tasks.find(task => task.id === id);
        if (current) current.status = previous;
        state.activities = state.activities.filter(activity => activity.id !== activityId);
        refresh();
        showToast("Task change undone.");
      });
    } else if (action === "toggle-reminder") {
      const previous = item.completed;
      delete item.isDemo;
      item.completed = !item.completed;
      const activityId = logActivity(`Reminder ${item.completed ? "completed" : "reopened"}: ${item.title}.`, "fa-bell");
      refresh();
      showUndoToast(item.completed ? "Reminder completed." : "Reminder marked upcoming.", () => {
        const current = state.reminders.find(reminder => reminder.id === id);
        if (current) current.completed = previous;
        state.activities = state.activities.filter(activity => activity.id !== activityId);
        refresh();
        showToast("Reminder change undone.");
      });
    } else if (action === "pay") {
      const previous = item.status;
      delete item.isDemo;
      item.status = item.status === "Paid" ? (dateDistance(item.dueDate) < 0 ? "Overdue" : "Pending") : "Paid";
      const activityId = logActivity(`Bill marked ${item.status.toLowerCase()}: ${item.name}.`, "fa-receipt");
      refresh();
      showUndoToast(item.status === "Paid" ? "Bill marked as paid." : "Bill marked as unpaid.", () => {
        const current = state.bills.find(bill => bill.id === id);
        if (current) current.status = previous;
        state.activities = state.activities.filter(activity => activity.id !== activityId);
        refresh();
        showToast("Payment change undone.");
      });
    } else if (action === "progress-goal") {
      openProgressForm(item);
    }
  }
  function openProgressForm(goal) {
    progressGoalId = goal.id;
    byId("progressGoalName").textContent = goal.name;
    byId("progressValue").value = Number(goal.current) || 0;
    byId("progressValue").max = Number(goal.target);
    byId("progressTarget").textContent = `Target: ${Number(goal.target)} · Progress can’t exceed this value.`;
    byId("progressForm").classList.remove("was-validated");
    progressModal.show();
  }
  function saveGoalProgress(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = byId("progressValue");
    const goal = state.goals.find(item => item.id === progressGoalId);
    if (!goal) return showToast("That goal could not be found.", "error");
    input.setCustomValidity(Number(input.value) > Number(goal.target) ? "Progress cannot exceed the target." : "");
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      input.focus();
      return;
    }
    goal.current = Number(input.value);
    delete goal.isDemo;
    logActivity(`Goal progress updated: ${goal.name}.`, "fa-bullseye");
    progressModal.hide();
    refresh();
    showToast("Goal progress updated.");
  }
  function navigate(page) {
    if (!PAGE_TITLES[page]) return;
    currentPage = page;
    $$(".page-section").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-link[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    byId("pageTitle").textContent = PAGE_TITLES[page];
    byId("sidebar").classList.remove("open");
    byId("sidebarBackdrop").classList.remove("show");
    byId("searchResults").hidden = true;
    if (page === "insights") renderInsights();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function searchItems(query) {
    const collections = [
      ["tasks", "tasks", item => item.title, item => item.category, item => item.dueDate, item => item.status],
      ["bills", "bills", item => item.name, item => item.category, item => item.dueDate, item => item.status],
      ["documents", "documents", item => item.name, item => item.type, item => item.expiryDate, documentStatus],
      ["goals", "goals", item => item.name, item => item.category, item => item.deadline, item => `${goalProgress(item)}% complete`],
      ["reminders", "reminders", item => item.title, item => item.category, item => item.date, item => item.completed ? "Completed" : "Upcoming"],
      ["calendarEvents", "calendar", item => item.title, item => item.category, item => item.date, () => "Event"]
    ];
    const found = [];
    for (const [type, page, getTitle, getCategory, getDate, getStatus] of collections) {
      for (const item of state[type]) {
        const haystack = `${getTitle(item)} ${getCategory(item)} ${item.notes || item.description || ""}`.toLowerCase();
        if (haystack.includes(query.toLowerCase())) found.push({ type, page, id: item.id, title: getTitle(item), category: getCategory(item), date: getDate(item), status: getStatus(item) });
      }
    }
    return found.slice(0, 8);
  }
  function renderSearch(query) {
    const panel = byId("searchResults");
    if (!query.trim()) { panel.hidden = true; return; }
    const results = searchItems(query.trim());
    panel.innerHTML = `<div class="search-heading">${results.length ? `${results.length} matching item${results.length === 1 ? "" : "s"}` : "No matches yet"}</div>${results.length ? results.map(item => `<button class="search-result" data-search-type="${item.type}" data-search-page="${item.page}" data-search-id="${item.id}"><span class="table-icon ${COLORS[item.type]}"><i class="fa-solid ${ICONS[item.type]}"></i></span><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.category)} · ${escapeHTML(item.status)}${item.date ? ` · ${formatDate(item.date, { month: "short", day: "numeric" })}` : ""}</small></span></button>`).join("") : `<div class="search-empty">Try another name or category.</div>`}`;
    panel.hidden = false;
  }
  function renderNotifications() {
    const panel = byId("notificationPanel");
    const notifications = state.notifications;
    panel.innerHTML = `<h3>Your notifications</h3>${notifications.length ? notifications.map(item => `<div class="notification-row ${item.read ? "" : "unread"}" data-notification="${escapeHTML(item.key)}" data-notification-type="${item.type}" role="button" tabindex="0"><div><strong>${escapeHTML(item.title)}</strong><small>${relativeTime(item.createdAt)} · Click to mark as read</small></div></div>`).join("") : `<div class="notification-empty">It’s quiet here. We’ll let you know when something needs your attention.</div>`}`;
    panel.hidden = false;
  }
  function markNotification(key, type) {
    const notification = state.notifications.find(item => item.key === key);
    if (!notification) return;
    notification.read = true;
    saveData();
    renderHeader();
    byId("notificationPanel").hidden = true;
    navigate(type === "calendarEvents" ? "calendar" : type);
  }
  function exportData() {
    const payload = { app: "Life Admin Dashboard", version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `life-admin-backup-${dateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Your data backup has been downloaded.");
  }
  function validBackup(data) {
    if (!data || typeof data !== "object" || !data.data || typeof data.data !== "object") return false;
    const keys = ["tasks", "bills", "documents", "goals", "reminders", "calendarEvents"];
    return keys.every(key => Array.isArray(data.data[key])) &&
      data.data.tasks.every(item => item && typeof item.title === "string") &&
      data.data.bills.every(item => item && typeof item.name === "string" && Number.isFinite(Number(item.amount))) &&
      data.data.documents.every(item => item && typeof item.name === "string") &&
      data.data.goals.every(item => item && typeof item.name === "string" && Number(item.target) > 0) &&
      data.data.reminders.every(item => item && typeof item.title === "string") &&
      data.data.calendarEvents.every(item => item && typeof item.title === "string");
  }
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!validBackup(parsed)) throw new Error("This file does not look like a Life Admin backup.");
        askConfirmation("Restore this backup?", "Your current Life Admin data will be replaced with the data in this file.", () => {
          const restored = parsed.data;
          if (!restored.browserNotificationMigrationVersion) {
            markLegacyDemoRecords(restored);
            restored.browserNotificationMigrationVersion = 1;
          }
          const importedSettings = restored.settings || {};
          state = {
            ...demoData(), ...restored,
            settings: {
              notifications: true, browserNotifications: false, browserPermissionRequested: false, showCompleted: true, defaultPage: "dashboard",
              ...importedSettings,
              focusTaskIds: Array.isArray(importedSettings.focusTaskIds) ? importedSettings.focusTaskIds.slice(0, 3) : []
            }
          };
          refresh();
          showToast("Your backup has been restored.");
        }, "Restore backup", false);
      } catch (error) {
        console.error("Backup import failed.", error);
        showToast(error.message || "The selected file could not be imported.", "error");
      }
      byId("importFile").value = "";
    };
    reader.onerror = () => {
      showToast("The selected file could not be read.", "error");
      byId("importFile").value = "";
    };
    reader.readAsText(file);
  }
  function clearAllData() {
    askConfirmation("Clear all your data?", "All tasks, bills, documents, goals, reminders and events will be permanently removed.", () => {
      state = {
        tasks: [], bills: [], documents: [], goals: [], reminders: [], calendarEvents: [],
        notifications: [], browserNotificationHistory: [], browserNotificationMigrationVersion: 1, activities: [], theme: state.theme,
        settings: { ...state.settings, focusTaskIds: [] }
      };
      saveData();
      renderAll();
      showToast("Your workspace has been cleared.", "info");
    });
  }
  function bindEvents() {
    document.addEventListener("click", event => {
      const nav = event.target.closest("[data-page]");
      if (nav) { event.preventDefault(); navigate(nav.dataset.page); return; }
      const action = event.target.closest("[data-action]");
      if (action) { event.preventDefault(); handleAction(action.dataset.action, action.dataset.type, action.dataset.id); return; }
      const searchResult = event.target.closest("[data-search-id]");
      if (searchResult) { navigate(searchResult.dataset.searchPage); byId("searchResults").hidden = true; byId("globalSearch").value = ""; return; }
      const notification = event.target.closest("[data-notification]");
      if (notification) { markNotification(notification.dataset.notification, notification.dataset.notificationType); return; }
      const day = event.target.closest("[data-date]");
      if (day) { activeCalendarDate = day.dataset.date; renderCalendar(); return; }
      if (!event.target.closest(".notification-wrap")) byId("notificationPanel").hidden = true;
      if (!event.target.closest(".global-search-wrap")) byId("searchResults").hidden = true;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        byId("notificationPanel").hidden = true;
        byId("searchResults").hidden = true;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        byId("globalSearch").focus();
      }
      if ((event.key === "Enter" || event.key === " ") && event.target.matches(".overview-card")) {
        event.preventDefault();
        navigate(event.target.dataset.page);
      }
    });
    byId("globalSearch").addEventListener("input", event => renderSearch(event.target.value));
    byId("notificationButton").addEventListener("click", () => {
      const panel = byId("notificationPanel");
      if (panel.hidden) renderNotifications(); else panel.hidden = true;
    });
    byId("themeToggle").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      saveData();
      renderAll();
    });
    byId("mobileMenu").addEventListener("click", () => {
      byId("sidebar").classList.add("open");
      byId("sidebarBackdrop").classList.add("show");
    });
    byId("sidebarBackdrop").addEventListener("click", () => {
      byId("sidebar").classList.remove("open");
      byId("sidebarBackdrop").classList.remove("show");
    });
    byId("itemForm").addEventListener("submit", onSubmitForm);
    byId("progressForm").addEventListener("submit", saveGoalProgress);
    byId("profileSetupForm").addEventListener("submit", event => {
      event.preventDefault();
      saveProfileFromForm(event.currentTarget, byId("setupProfileName"), profileSetupModal);
    });
    byId("profileSettingsForm").addEventListener("submit", event => {
      event.preventDefault();
      saveProfileFromForm(event.currentTarget, byId("profileName"), null);
    });
    byId("profileShortcut").addEventListener("click", () => {
      navigate("settings");
      byId("profileName").focus();
    });
    byId("profileSetupModal").addEventListener("shown.bs.modal", () => byId("setupProfileName").focus());
    byId("editFocus").addEventListener("click", openFocusPicker);
    byId("focusForm").addEventListener("submit", saveFocusSelection);
    byId("focusTaskChoices").addEventListener("change", event => {
      if (!event.target.matches('input[name="focusTasks"]')) return;
      const checked = $$('input[name="focusTasks"]:checked', byId("focusTaskChoices"));
      byId("focusLimitMessage").textContent = `${checked.length} of 3 priorities selected.`;
      if (checked.length >= 3) {
        $$('input[name="focusTasks"]:not(:checked)', byId("focusTaskChoices")).forEach(input => { input.disabled = true; });
      } else {
        $$('input[name="focusTasks"]', byId("focusTaskChoices")).forEach(input => { input.disabled = false; });
      }
    });
    byId("confirmDelete").addEventListener("click", () => {
      const callback = confirmCallback;
      confirmCallback = null;
      confirmModal.hide();
      if (callback) callback();
    });
    byId("viewAttention").addEventListener("click", () => navigate("tasks"));
    byId("prevMonth").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
    byId("nextMonth").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });
    byId("calendarToday").addEventListener("click", () => {
      const today = new Date();
      calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
      activeCalendarDate = dateKey(today);
      renderCalendar();
    });
    byId("saveSettings").addEventListener("click", () => {
      state.settings = {
        notifications: byId("settingNotifications").checked,
        browserNotifications: state.settings.browserNotifications,
        browserPermissionRequested: state.settings.browserPermissionRequested,
        showCompleted: byId("settingCompleted").checked,
        defaultPage: byId("settingDefaultPage").value
      };
      refresh();
      showToast("Your preferences have been saved.");
    });
    byId("enableBrowserNotifications").addEventListener("click", enableBrowserNotifications);
    $$(".theme-choice").forEach(button => button.addEventListener("click", () => {
      state.theme = button.dataset.theme;
      saveData();
      renderAll();
    }));
    byId("exportData").addEventListener("click", exportData);
    byId("importData").addEventListener("click", () => byId("importFile").click());
    byId("importFile").addEventListener("change", event => importFile(event.target.files[0]));
    byId("clearData").addEventListener("click", clearAllData);
    ["tasksSearch", "tasksStatus", "tasksPriority", "tasksCategory", "tasksSort"].forEach(id => byId(id).addEventListener("input", renderTasks));
    ["billsSearch", "billsStatus", "billsCategory", "billsSort"].forEach(id => byId(id).addEventListener("input", renderBills));
    ["documentsSearch", "documentsType", "documentsStatus"].forEach(id => byId(id).addEventListener("input", renderDocuments));
    ["goalsSearch", "goalsStatus", "goalsSort"].forEach(id => byId(id).addEventListener("input", renderGoals));
    ["remindersSearch", "remindersStatus", "remindersSort"].forEach(id => byId(id).addEventListener("input", renderReminders));
  }
  function initialize() {
    state = loadData();
    itemModal = new bootstrap.Modal(byId("itemModal"));
    confirmModal = new bootstrap.Modal(byId("confirmModal"));
    progressModal = new bootstrap.Modal(byId("progressModal"));
    profileSetupModal = new bootstrap.Modal(byId("profileSetupModal"), { backdrop: "static", keyboard: false });
    focusModal = new bootstrap.Modal(byId("focusModal"));
    bindEvents();
    refresh();
    window.setInterval(() => {
      sendBrowserNotifications();
      updateBrowserNotificationStatus();
    }, 60000);
    const requestedPage = state.settings.defaultPage;
    if (requestedPage && requestedPage !== "dashboard") navigate(requestedPage);
    loadProfile().then(savedProfile => {
      profile = savedProfile;
      updateProfileDisplays();
      renderAll();
      if (!profile) profileSetupModal.show();
    }).catch(error => {
      console.error("Unable to load the local profile.", error);
      profile = null;
      updateProfileDisplays();
      renderAll();
      profileSetupModal.show();
      showToast(error.message || "Your local profile could not be loaded.", "error");
    });
  }
  initialize();
})();