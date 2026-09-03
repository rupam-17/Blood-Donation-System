(() => {
  "use strict";

  const API = {
    server: "/php/server.php",
    csrf: "/php/csrf_token.php",
    captcha: "/php/captcha.php",
    passwordReset: "/php/password_reset.php",
    logout: "/php/logout.php"
  };

  const state = {
    csrfToken: "",
    profile: null,
    donationRecords: [],
    myRequests: [],
    notifications: []
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg, ms = 2200) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), ms);
  }

  function showMsgBox(id, msg, type = "error") {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `msg-box ${type}`;
  }

  function clearMsgBox(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = "";
    el.className = "msg-box";
  }

  function val(id) {
    return ($(id)?.value || "").trim();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initials(name) {
    return (name || "U")
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function fmtDate(d) {
    if (!d) return "-";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
  }

  function todayGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  function normalizeAvail(v) {
    const x = String(v || "").toLowerCase();
    return x === "available" ? "available" : "unavailable";
  }

  async function getCsrfToken() {
    if (state.csrfToken) return state.csrfToken;
    const res = await fetch(API.csrf, { credentials: "same-origin" });
    if (!res.ok) throw new Error("csrf_fetch_failed");
    const data = await res.json();
    state.csrfToken = data.csrf_token || "";
    return state.csrfToken;
  }

  async function postText(url, formData) {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "same-origin"
    });
    return (await res.text()).trim();
  }

  async function verifyCaptcha(purpose) {
    const token = window.grecaptcha ? grecaptcha.getResponse() : "";
    if (!token) return "captcha_failed";

    const csrf = await getCsrfToken();
    const fd = new FormData();
    fd.append("csrf_token", csrf);
    fd.append("purpose", purpose);
    fd.append("g-recaptcha-response", token);

    return await postText(API.captcha, fd);
  }

  function asJsonOrNull(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function switchSection(name) {
    $$(".nav-item[data-section]").forEach((a) => {
      a.classList.toggle("active", a.dataset.section === name);
    });
    $$(".section").forEach((s) => {
      s.classList.toggle("active", s.id === `section-${name}`);
    });

    const map = {
      overview: "Overview",
      profile: "My Profile",
      history: "Donation History",
      requests: "Blood Requests",
      donors: "Find Donors",
      notifications: "Notifications"
    };
    if ($("topbarTitle")) $("topbarTitle").textContent = map[name] || "Overview";
    if (name === "notifications") markAllNotificationsRead();
  }

  function openSidebar() {
    const sb = $("sidebar");
    if (!sb) return;
    sb.classList.add("open");

    if (!document.querySelector(".sidebar-overlay")) {
      const ov = document.createElement("div");
      ov.className = "sidebar-overlay show";
      ov.addEventListener("click", closeSidebar);
      document.body.appendChild(ov);
    }
  }

  function closeSidebar() {
    const sb = $("sidebar");
    if (sb) sb.classList.remove("open");
    const ov = document.querySelector(".sidebar-overlay");
    if (ov) ov.remove();
  }

  function bindNavigation() {
    $("menuBtn")?.addEventListener("click", () => {
      const sb = $("sidebar");
      if (!sb) return;
      if (sb.classList.contains("open")) closeSidebar();
      else openSidebar();
    });

    $$(".nav-item[data-section], .qa-btn[data-section], .link-btn[data-section]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const sec = el.dataset.section;
        if (!sec) return;
        switchSection(sec);
        if (window.innerWidth <= 900) closeSidebar();
      });
    });

    $("notifBtn")?.addEventListener("click", () => switchSection("notifications"));

    const logoutLink = Array.from(document.querySelectorAll("a.nav-item")).find((a) =>
      a.textContent.toLowerCase().includes("logout")
    );
    if (logoutLink) {
      logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await fetch(API.logout, { credentials: "same-origin" });
        } catch {}
        window.location.href = "/html/login.html";
      });
    }
  }

  function setAvatar(elId, name, photoUrl) {
    const el = $(elId);
    if (!el) return;
    if (photoUrl) {
      el.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="profile photo">`;
    } else {
      el.textContent = initials(name);
    }
  }

  function applyProfileToUI() {
    const p = state.profile;
    if (!p) return;

    const shortName = (p.name || "Donor").split(" ")[0];
    if ($("welcomeMsg")) $("welcomeMsg").textContent = `${todayGreeting()}, ${shortName} 👋`;

    if ($("sidebarName")) $("sidebarName").textContent = p.name || "Donor";
    if ($("sidebarBlood")) $("sidebarBlood").textContent = `${p.blood_group || "-"} · ${p.city || "-"}`;
    if ($("topbarName")) $("topbarName").textContent = shortName;

    if ($("profileName")) $("profileName").textContent = p.name || "-";
    if ($("profileBlood")) $("profileBlood").textContent = p.blood_group || "-";
    if ($("pPhone")) $("pPhone").textContent = p.phone || "-";
    if ($("pEmail")) $("pEmail").textContent = p.email || "-";
    if ($("pLocation")) $("pLocation").textContent = p.city || "-";

    setAvatar("sidebarAvatar", p.name, p.donor_photo);
    setAvatar("topbarAvatar", p.name, p.donor_photo);
    setAvatar("profileAvatar", p.name, p.donor_photo);

    if ($("pfName")) $("pfName").value = p.name || "";
    if ($("pfPhone")) $("pfPhone").value = p.phone || "";
    if ($("pfEmail")) $("pfEmail").value = p.email || "";
    if ($("pfLocation")) $("pfLocation").value = p.city || "";
    if ($("pfBlood") && p.blood_group) $("pfBlood").value = p.blood_group;
    if ($("pfAge")) $("pfAge").value = p.date_of_birth || "";

    const av = normalizeAvail(p.availability);
    const avLabel = av === "available" ? "Available" : "Not Available";
    if ($("availToggle")) $("availToggle").checked = av === "available";
    if ($("availLabel")) $("availLabel").textContent = avLabel;
    if ($("pfAvail")) $("pfAvail").value = avLabel;

    const badge = $("profileStatusBadge");
    if (badge) {
      badge.textContent = avLabel;
      badge.className = `badge ${av === "available" ? "badge-green" : "badge-gray"}`;
    }
  }

  async function loadProfile() {
    const fd = new FormData();
    fd.append("action", "get_donor_profile");

    const text = await postText(API.server, fd);

    if (text === "not_logged_in" || text === "unauthorized") {
      window.location.href = "/html/login.html";
      return false;
    }

    const data = asJsonOrNull(text);
    if (!data) {
      showToast("Failed to load profile.");
      return false;
    }

    state.profile = data;
    applyProfileToUI();
    return true;
  }

  function renderOverviewStats(historyObj) {
    const cards = document.querySelectorAll(".stat-card .stat-num");
    const total = Number(historyObj?.total_donations ?? state.profile?.total_donations ?? 0);
    const last = historyObj?.last_donation_date ? fmtDate(historyObj.last_donation_date) : "-";
    const next = historyObj?.next_eligible_date ? fmtDate(historyObj.next_eligible_date) : "-";

    if (cards[0]) cards[0].textContent = String(total);
    if (cards[1]) cards[1].textContent = last;
    if (cards[2]) cards[2].textContent = next;
    if ($("nextDonateDate")) $("nextDonateDate").textContent = next;
  }

  async function loadDonorHistorySummary() {
    const fd = new FormData();
    fd.append("action", "donor_history");
    const text = await postText(API.server, fd);
    const data = asJsonOrNull(text);
    renderOverviewStats(data || null);
  }

  async function loadDonationRecords() {
    const fd = new FormData();
    fd.append("action", "get_my_donation_records");
    fd.append("limit", "100");

    const text = await postText(API.server, fd);
    const data = asJsonOrNull(text);
    state.donationRecords = Array.isArray(data) ? data : [];
    renderRecentDonations();
    renderDonationHistoryTable();
  }

  function renderRecentDonations() {
    const tbody = $("recentDonationsTbody");
    if (!tbody) return;

    const rows = state.donationRecords.slice(0, 3);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No records yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((r) => {
        return `<tr>
          <td>${escapeHtml(fmtDate(r.donation_date))}</td>
          <td>${escapeHtml(r.location || "-")}</td>
          <td>${escapeHtml(r.units ?? "-")}</td>
          <td><span class="badge badge-green">Recorded</span></td>
        </tr>`;
      })
      .join("");
  }

  function renderDonationHistoryTable() {
    const tbody = $("donationHistoryTbody");
    const empty = $("historyEmpty");
    if (!tbody) return;

    if (!state.donationRecords.length) {
      tbody.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }

    if (empty) empty.style.display = "none";
    tbody.innerHTML = state.donationRecords
      .map((r, i) => {
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(fmtDate(r.donation_date))}</td>
          <td>${escapeHtml(r.location || "-")}</td>
          <td>${escapeHtml(r.units ?? "-")}</td>
          <td><span class="blood-chip">${escapeHtml(r.blood_group || state.profile?.blood_group || "-")}</span></td>
          <td>${escapeHtml(r.admin_name || "Admin")}</td>
          <td><span class="badge badge-green">Verified</span></td>
        </tr>`;
      })
      .join("");
  }

  async function loadMyRequests() {
    const identifier = state.profile?.email || state.profile?.phone || "";
    if (!identifier) {
      state.myRequests = [];
      renderMyRequests();
      renderActiveRequests();
      return;
    }

    const fd = new FormData();
    fd.append("action", "get_my_blood_requests");
    fd.append("identifier", identifier);

    const text = await postText(API.server, fd);

    if (text === "no_requests_found") {
      state.myRequests = [];
    } else {
      const data = asJsonOrNull(text);
      state.myRequests = Array.isArray(data) ? data : [];
    }

    renderMyRequests();
    renderActiveRequests();
  }

  function reqStatusBadge(statusRaw) {
    const s = String(statusRaw || "").toLowerCase();
    const cls = s === "fulfilled" ? "badge-green" : s === "pending" ? "badge-orange" : "badge-gray";
    const label = s ? s[0].toUpperCase() + s.slice(1) : "-";
    return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function urgencyBadge(uRaw) {
    const u = String(uRaw || "normal").toLowerCase();
    const cls = u === "critical" ? "badge-red" : u === "urgent" ? "badge-orange" : "badge-green";
    const label = u[0].toUpperCase() + u.slice(1);
    return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function renderActiveRequests() {
    const box = $("activeRequestsList");
    if (!box) return;

    const active = state.myRequests.filter((r) => {
      const s = String(r.status || "").toLowerCase();
      return s === "pending" || s === "matched";
    });

    if (!active.length) {
      box.innerHTML = `<p style="font-size:.9rem;opacity:.8">No active requests.</p>`;
      return;
    }

    box.innerHTML = active
      .slice(0, 5)
      .map((r) => {
        return `<div class="active-req-item">
          <div>
            <div class="req-patient">${escapeHtml(r.requester_name || "-")}</div>
            <div class="req-detail">${escapeHtml((r.blood_group || "-") + " · " + (r.hospital_name || r.city || "-"))}</div>
          </div>
          ${urgencyBadge(r.urgency)}
        </div>`;
      })
      .join("");
  }

  function renderMyRequests() {
    const tbody = $("myRequestsTbody");
    if (!tbody) return;

    const filter = (val("reqFilterStatus") || "").toLowerCase();
    const rows = state.myRequests.filter((r) => {
      if (!filter) return true;
      return String(r.status || "").toLowerCase() === filter;
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No requests found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((r, i) => {
        const s = String(r.status || "").toLowerCase();
        const canAct = s === "pending" || s === "matched";

        const actBtns = canAct
          ? `<button class="act-btn btn-fulfill" data-act="fulfill" data-id="${r.id}">Fulfilled</button>
             <button class="act-btn btn-cancel" data-act="cancel" data-id="${r.id}">Cancel</button>`
          : "-";

        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(r.requester_name || "-")}</strong></td>
          <td><span class="blood-chip">${escapeHtml(r.blood_group || "-")}</span></td>
          <td>${escapeHtml(r.hospital_name || "-")}</td>
          <td>${escapeHtml(fmtDate(r.created_at))}</td>
          <td>${urgencyBadge(r.urgency)}</td>
          <td>${reqStatusBadge(r.status)}</td>
          <td>${actBtns}</td>
        </tr>`;
      })
      .join("");
  }

  async function requestAction(requestId, actionType) {
    const identifier = state.profile?.email || state.profile?.phone || "";
    if (!identifier) {
      showToast("Missing profile identifier.");
      return;
    }

    const ask =
      actionType === "fulfill"
        ? "Mark this request as fulfilled?"
        : "Cancel this request?";
    if (!window.confirm(ask)) return;

    const csrf = await getCsrfToken();
    const fd = new FormData();
    fd.append("csrf_token", csrf);
    fd.append("request_id", String(requestId));
    fd.append("identifier", identifier);
    fd.append("action", actionType === "fulfill" ? "fulfill_blood_request" : "cancel_blood_request");

    const text = await postText(API.server, fd);

    if (text === "request_fulfilled" || text === "request_cancelled") {
      showToast(actionType === "fulfill" ? "Marked as fulfilled." : "Request cancelled.");
      await loadMyRequests();
      pushNotification(
        actionType === "fulfill" ? "Request fulfilled" : "Request cancelled",
        `Request #${requestId} updated.`,
        "green"
      );
      return;
    }

    const map = {
      csrf_invalid: "Session expired. Refresh and try again.",
      request_not_found: "Request not found.",
      cannot_fulfill: "This request cannot be fulfilled now.",
      cannot_cancel: "This request cannot be cancelled now.",
      update_error: "Failed to update request."
    };
    showToast(map[text] || `Failed: ${text}`);
  }

  function bindRequestActions() {
    $("myRequestsTbody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act][data-id]");
      if (!btn) return;
      const id = Number(btn.dataset.id || 0);
      const act = btn.dataset.act;
      if (!id || !act) return;
      btn.disabled = true;
      try {
        await requestAction(id, act);
      } catch (err) {
        console.error(err);
        showToast("Request update failed.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function openModal(id) {
    const m = $(id);
    if (m) m.classList.add("open");
  }

  function closeModal(id) {
    const m = $(id);
    if (m) m.classList.remove("open");
  }

  function bindModals() {
    $("newRequestBtn")?.addEventListener("click", () => openModal("requestModal"));
    $("reqModalClose")?.addEventListener("click", () => closeModal("requestModal"));
    $("reqModalCancel")?.addEventListener("click", () => closeModal("requestModal"));

    $("changePassBtn")?.addEventListener("click", () => openModal("passModal"));
    $("passModalClose")?.addEventListener("click", () => closeModal("passModal"));
    $("passModalCancel")?.addEventListener("click", () => closeModal("passModal"));

    ["requestModal", "passModal"].forEach((id) => {
      const m = $(id);
      m?.addEventListener("click", (e) => {
        if (e.target === m) closeModal(id);
      });
    });
  }

  async function submitNewRequest() {
    clearMsgBox("reqModalMsg");

    const requester_name = state.profile?.name || "";
    const requester_phone = state.profile?.phone || "";
    const requester_email = state.profile?.email || "";

    const blood_group = val("rmBlood");
    const hospital_name = val("rmHospital");
    const city = val("rmLocation");
    const urgency = (val("rmUrgency") || "normal").toLowerCase();
    const notes = val("rmPatient"); // patient name shown in notes if needed
    const patient = val("rmPatient");
    const contact = val("rmContact");

    if (!patient || !blood_group || !hospital_name || !city || !contact) {
      showMsgBox("reqModalMsg", "Please fill all required fields.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(contact.replace(/\s+/g, ""))) {
      showMsgBox("reqModalMsg", "Contact number must be valid 10 digits.");
      return;
    }

    if (!window.grecaptcha) {
      showMsgBox("reqModalMsg", "Add Google reCAPTCHA widget on this page first.");
      return;
    }

    const cap = await verifyCaptcha("blood_request");
    if (cap !== "captcha_success") {
      showMsgBox("reqModalMsg", "Captcha not verified. Try again.");
      if (window.grecaptcha) grecaptcha.reset();
      return;
    }

    const csrf = await getCsrfToken();
    const fd = new FormData();
    fd.append("action", "create_blood_request");
    fd.append("csrf_token", csrf);

    fd.append("requester_name", requester_name || patient);
    fd.append("requester_phone", requester_phone || contact);
    fd.append("requester_email", requester_email);
    fd.append("blood_group", blood_group);
    fd.append("units_needed", "1");
    fd.append("city", city);
    fd.append("hospital_name", hospital_name);
    fd.append("urgency", urgency);
    fd.append("notes", notes ? `Patient: ${patient}. ${notes}` : `Patient: ${patient}`);

    const text = await postText(API.server, fd);

    if (text === "request_created") {
      closeModal("requestModal");
      ["rmPatient", "rmBlood", "rmHospital", "rmLocation", "rmContact", "rmUrgency"].forEach((id) => {
        if ($(id)) $(id).value = id === "rmUrgency" ? "Normal" : "";
      });
      if (window.grecaptcha) grecaptcha.reset();
      showToast("Blood request submitted.");
      await loadMyRequests();
      switchSection("requests");
      pushNotification("Request submitted", "Your blood request was created.", "orange");
      return;
    }

    const map = {
      missing_data: "Please fill all required fields.",
      invalid_phone: "Phone must be valid.",
      invalid_email: "Email is invalid.",
      invalid_blood_group: "Invalid blood group.",
      invalid_units: "Invalid units.",
      captcha_not_verified: "Captcha not verified."
    };
    showMsgBox("reqModalMsg", map[text] || `Failed: ${text}`);
    if (window.grecaptcha) grecaptcha.reset();
  }

  async function saveProfile() {
    clearMsgBox("profileMsg");

    const name = val("pfName");
    const phone = val("pfPhone");
    const email = val("pfEmail");
    const city = val("pfLocation");

    if (!name || !phone || !email || !city) {
      showMsgBox("profileMsg", "Please fill all required fields.");
      return;
    }

    const csrf = await getCsrfToken();
    const fd = new FormData();
    fd.append("action", "update_donor_profile");
    fd.append("csrf_token", csrf);
    fd.append("name", name);
    fd.append("phone", phone);
    fd.append("email", email);
    fd.append("city", city);

    const file = $("profilePhotoFile")?.files?.[0];
    if (file) fd.append("photo", file);

    const text = await postText(API.server, fd);

    if (text === "profile_updated") {
      showMsgBox("profileMsg", "Profile updated successfully.", "success");
      showToast("Profile saved.");
      await loadProfile();
      return;
    }

    const map = {
      invalid_email: "Invalid email format.",
      invalid_phone: "Phone must be valid.",
      user_exists: "Phone or email already exists.",
      unauthorized: "Login required.",
      csrf_invalid: "Session expired."
    };
    showMsgBox("profileMsg", map[text] || `Update failed: ${text}`);
  }

  async function toggleAvailabilityUI(checked) {
    const availability = checked ? "available" : "unavailable";
    const csrf = await getCsrfToken();

    const fd = new FormData();
    fd.append("action", "toggle_availability");
    fd.append("csrf_token", csrf);
    fd.append("availability", availability);

    const text = await postText(API.server, fd);

    if (text === "availability_updated") {
      state.profile.availability = availability;
      applyProfileToUI();
      showToast(`Status updated to ${checked ? "Available" : "Not Available"}.`);
      return;
    }

    if ($("availToggle")) $("availToggle").checked = !checked;
    const map = {
      not_eligible_yet: "You are not eligible yet.",
      invalid_availability: "Invalid availability value.",
      unauthorized: "Login required.",
      csrf_invalid: "Session expired."
    };
    showToast(map[text] || `Failed: ${text}`);
  }

  async function searchDonors() {
    const fd = new FormData();
    fd.append("action", "search_donors");
    fd.append("searched_name", "");
    fd.append("city", val("fdLocation"));
    fd.append("blood_group", val("fdBlood"));
    fd.append("availability", (val("fdAvail") || "").toLowerCase());

    const text = await postText(API.server, fd);
    const rows = asJsonOrNull(text);

    const grid = $("fdGrid");
    const empty = $("fdEmpty");
    if (!grid || !empty) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      grid.innerHTML = "";
      grid.style.display = "none";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";
    grid.style.display = "grid";
    grid.innerHTML = rows
      .map((d) => {
        const photo = d.donor_photo || "";
        const av = normalizeAvail(d.availability);
        const avText = av === "available" ? "Available" : "Not Available";
        const avatar = photo
          ? `<img src="${escapeHtml(photo)}" alt="donor photo">`
          : escapeHtml(initials(d.name || "U"));

        return `<div class="donor-card">
          <div class="d-avatar">${avatar}</div>
          <div class="d-name">${escapeHtml(d.name || "-")}</div>
          <div class="d-loc"><i class='bx bx-map'></i> ${escapeHtml(d.city || "-")}</div>
          <span class="blood-chip">${escapeHtml(d.blood_group || "-")}</span>
          <div class="d-phone"><i class='bx bx-phone'></i> ${escapeHtml(d.phone || "-")}</div>
          <span class="badge ${av === "available" ? "badge-green" : "badge-gray"}">${avText}</span>
        </div>`;
      })
      .join("");
  }

  async function changePassword() {
    clearMsgBox("passMsg");

    const current = val("curPass");
    const next = val("newPass");
    const confirmNext = val("confPass");

    if (!current || !next || !confirmNext) {
      showMsgBox("passMsg", "Please fill all fields.");
      return;
    }
    if (next.length < 6) {
      showMsgBox("passMsg", "New password must be at least 6 characters.");
      return;
    }
    if (next !== confirmNext) {
      showMsgBox("passMsg", "Passwords do not match.");
      return;
    }

    const csrf = await getCsrfToken();
    const fd = new FormData();
    fd.append("action", "change_password");
    fd.append("csrf_token", csrf);
    fd.append("role", "donor");
    fd.append("current_password", current);
    fd.append("new_password", next);

    const text = await postText(API.passwordReset, fd);

    if (text === "password_changed") {
      closeModal("passModal");
      ["curPass", "newPass", "confPass"].forEach((id) => { if ($(id)) $(id).value = ""; });
      showToast("Password changed successfully.");
      return;
    }

    const map = {
      wrong_current_password: "Current password is wrong.",
      same_password: "New password cannot be same as current.",
      weak_password: "Password must be at least 6 characters.",
      missing_data: "Please fill all fields.",
      unauthorized: "Login required.",
      invalid_role: "Invalid role.",
      csrf_invalid: "Session expired."
    };
    showMsgBox("passMsg", map[text] || `Failed: ${text}`);
  }

  function pushNotification(title, body, type = "green") {
    state.notifications.unshift({
      id: Date.now() + Math.random(),
      title,
      body,
      type,
      read: false,
      time: new Date()
    });
    renderNotifications();
  }

  function renderNotifications() {
    const list = $("notifList");
    if (!list) return;

    if (!state.notifications.length) {
      list.innerHTML = `<li class="notif-item"><div style="opacity:.8">No notifications yet.</div></li>`;
      updateNotifBadge();
      return;
    }

    list.innerHTML = state.notifications
      .map((n) => {
        const t = new Date(n.time);
        const time = Number.isNaN(t.getTime()) ? "-" : t.toLocaleString("en-IN");
        const icon = n.type === "red" ? "bx-droplet" : n.type === "orange" ? "bx-bell" : "bx-check-circle";

        return `<li class="notif-item ${n.read ? "" : "unread"}">
          <div class="notif-icon ${escapeHtml(n.type)}"><i class='bx ${icon}'></i></div>
          <div style="flex:1">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${escapeHtml(n.body)}</div>
            <span class="notif-time">${escapeHtml(time)}</span>
          </div>
          ${n.read ? "" : `<div class="unread-dot"></div>`}
        </li>`;
      })
      .join("");

    updateNotifBadge();
  }

  function updateNotifBadge() {
    const unread = state.notifications.filter((n) => !n.read).length;
    const badge = $("notifBadge");
    const dot = $("notifDot");

    if (badge) {
      badge.textContent = String(unread);
      badge.style.display = unread > 0 ? "inline-flex" : "none";
    }
    if (dot) dot.classList.toggle("show", unread > 0);
  }

  function markAllNotificationsRead() {
    state.notifications.forEach((n) => (n.read = true));
    renderNotifications();
  }

  function seedNotifications() {
    state.notifications = [
      {
        id: 1,
        title: "Welcome",
        body: "Dashboard loaded successfully.",
        type: "green",
        read: false,
        time: new Date()
      }
    ];
    renderNotifications();
  }

  function bindEvents() {
    $("reqFilterStatus")?.addEventListener("change", renderMyRequests);
    $("reqModalSubmit")?.addEventListener("click", async () => {
      const btn = $("reqModalSubmit");
      if (btn) btn.disabled = true;
      try {
        await submitNewRequest();
      } catch (e) {
        console.error(e);
        showMsgBox("reqModalMsg", "Failed to submit request.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    $("removeProfilePhotoBtn")?.addEventListener("click", async () => {
      if (!confirm("Remove your profile photo?")) return;

      try {
        const csrf = await getCsrfToken();
        const fd = new FormData();

        fd.append("action", "update_donor_profile");
        fd.append("csrf_token", csrf);
        fd.append("remove_photo", "1");

        const result = await postText(API.server, fd);

        if (result === "profile_updated") {
          showToast("Profile photo removed.");
          await loadProfile();
        } else {
          showToast(`Could not remove photo: ${result}`);
        }
      } catch (error) {
        console.error(error);
        showToast("Could not remove profile photo.");
      }
    });

    $("profileForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("profileForm")?.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;
      try {
        await saveProfile();
      } catch (err) {
        console.error(err);
        showMsgBox("profileMsg", "Failed to save profile.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    $("availToggle")?.addEventListener("change", async (e) => {
      try {
        await toggleAvailabilityUI(!!e.target.checked);
      } catch (err) {
        console.error(err);
        showToast("Failed to update availability.");
      }
    });

    $("fdSearchBtn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await searchDonors();
      } catch (err) {
        console.error(err);
        showToast("Search failed.");
      }
    });

    $("passModalSubmit")?.addEventListener("click", async () => {
      const btn = $("passModalSubmit");
      if (btn) btn.disabled = true;
      try {
        await changePassword();
      } catch (e) {
        console.error(e);
        showMsgBox("passMsg", "Failed to change password.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    $("markAllReadBtn")?.addEventListener("click", () => {
      markAllNotificationsRead();
      showToast("All notifications marked as read.");
    });

    bindRequestActions();
  }

  async function init() {
    bindNavigation();
    bindModals();
    bindEvents();
    seedNotifications();

    const ok = await loadProfile();
    if (!ok) return;

    await Promise.all([
      loadDonorHistorySummary(),
      loadDonationRecords(),
      loadMyRequests()
    ]);

    switchSection("overview");
  }

  window.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      console.error(err);
      showToast("Failed to initialize dashboard.");
    });
  });
})();