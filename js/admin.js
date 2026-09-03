(() => {
  "use strict";

  const API = {
    admin: "/php/admin.php",
    csrf: "/php/csrf_token.php",
    passwordReset: "/php/password_reset.php",
    logout: "/php/logout.php"
  };

  const state = {
    csrfToken: "",
    donorPage: 1,
    reqPage: 1,
    rowsPerPage: 8,
    donors: [],
    requests: [],
    donationRecords: [],
    admins: [],
    messages: [],
    activitiesByDate: {},
    currentRequest: null,
    currentMessage: null,
    currentAdmin: null,
    editingDonor: null,
    currentAdminDetails: null
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function val(id) {
    return ($(id)?.value || "").trim();
  }

  function initials(name) {
    return (name || "U")
      .split(" ")
      .filter(Boolean)
      .map((x) => x[0])
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

  function ageToDob(age) {
    const n = Number(age || 0);
    if (!n) return "";
    const now = new Date();
    return `${now.getFullYear() - n}-01-01`;
  }

  function showToast(msg, ms = 2300) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  function showMsg(id, msg, type = "error") {
    const e = $(id);
    if (!e) return;
    e.textContent = msg;
    e.className = `msg-box ${type}`;
  }

let _confirmAction = null;

  function openConfirmModal(message, onYes) {
    const modal = $("confirmModal");
    const text = $("confirmModalText");
    if (!modal || !text) return;

    _confirmAction = typeof onYes === "function" ? onYes : null;
    text.textContent = message || "Are you sure?";
    modal.classList.add("open");
  }

  function closeConfirmModal() {
    const modal = $("confirmModal");
    if (modal) modal.classList.remove("open");
    _confirmAction = null;
  }

  function setupConfirmModal() {
    $("confirmModalClose")?.addEventListener("click", closeConfirmModal);
    $("confirmModalCancel")?.addEventListener("click", closeConfirmModal);

    $("confirmModalYes")?.addEventListener("click", async () => {
      const fn = _confirmAction;
      closeConfirmModal();
      if (fn) await fn();
    });

    $("confirmModal")?.addEventListener("click", (e) => {
      if (e.target === $("confirmModal")) closeConfirmModal();
    });
  }

  function clearMsg(id) {
    const e = $(id);
    if (!e) return;
    e.textContent = "";
    e.className = "msg-box";
  }

  function asJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function getCsrfToken() {
    if (state.csrfToken) return state.csrfToken;
    const res = await fetch(API.csrf, { credentials: "same-origin" });
    const data = await res.json();
    state.csrfToken = data.csrf_token || "";
    return state.csrfToken;
  }

  async function postAdmin(formData, withCsrf = true) {
    if (withCsrf) formData.append("csrf_token", await getCsrfToken());
    const res = await fetch(API.admin, { method: "POST", body: formData, credentials: "same-origin" });
    return (await res.text()).trim();
  }

  function availLabel(v) {
    return String(v || "").toLowerCase() === "available" ? "Available" : "Not Available";
  }

  function availBackend(v) {
    const s = String(v || "").trim().toLowerCase();
    if (!s) return "";
    return s === "available" ? "available" : "unavailable";
  }

  function availBadge(v) {
    const ok = String(v || "").toLowerCase() === "available";
    return `<span class="badge ${ok ? "badge-green" : "badge-gray"}">${ok ? "Available" : "Not Available"}</span>`;
  }

  function reqStatusBadge(v) {
    const s = String(v || "").toLowerCase();
    const cls = s === "pending" ? "badge-orange" : s === "fulfilled" ? "badge-green" : s === "matched" ? "badge-purple" : "badge-gray";
    const label = s ? s[0].toUpperCase() + s.slice(1) : "-";
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  function urgencyBadge(v) {
    const s = String(v || "normal").toLowerCase();
    const cls = s === "critical" ? "badge-red" : s === "urgent" ? "badge-orange" : "badge-green";
    const label = s[0].toUpperCase() + s.slice(1);
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  function switchSection(name) {
    $$(".nav-item[data-section]").forEach((e) => e.classList.toggle("active", e.dataset.section === name));
    $$(".section").forEach((e) => e.classList.toggle("active", e.id === `section-${name}`));
    const map = {
      dashboard: "Dashboard",
      donors: "Manage Donors",
      search: "Search Donors",
      requests: "Blood Requests",
      donations: "Record Donation",
      messages: "Contact Messages",
      admins: "All Admins",
      myaccount: "My Account"
    };
    if ($("pageTitle")) $("pageTitle").textContent = map[name] || "Dashboard";
  }

  function renderPagination(containerId, total, current, cb) {
    const el = $(containerId);
    if (!el) return;
    if (total <= 1) {
      el.innerHTML = "";
      return;
    }
    let html = "";
    for (let i = 1; i <= total; i++) {
      html += `<button class="pg-btn${i === current ? " active" : ""}" data-p="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll(".pg-btn").forEach((b) => b.addEventListener("click", () => cb(Number(b.dataset.p))));
  }

  async function loadAll() {
    await Promise.all([
      loadStats(),
      loadDonors(),
      loadRequests(),
      loadDonationRecords(),
      loadAdmins(),
      loadMessages(),
      loadActivities()
    ]);

    const ok = await loadCurrentAdminFromSession();

    if(!ok) {
      resolveCurrentAdmin();
      await loadCurrentAdminDetails();
    }

    renderAll();
  }

  async function loadStats() {
    const fd = new FormData();
    fd.append("action", "get_donor_stats");
    const data = asJson(await postAdmin(fd));
    if (!data) return;
    const nums = $$(".stat-num[data-target]");
    if (nums[0]) nums[0].setAttribute("data-target", data.total_donors || 0);
    if (nums[1]) nums[1].setAttribute("data-target", data.available_donors || 0);
    if (nums[2]) nums[2].setAttribute("data-target", data.pending_requests || 0);
    if (nums[3]) nums[3].setAttribute("data-target", (state.messages || []).filter((m) => !Number(m.is_read)).length || 0);
    animateCounters();
  }

  async function loadCurrentAdminDetails() {
    if (!state.currentAdmin?.id) return;
    const fd = new FormData();
    fd.append("action", "get_admin_details");
    fd.append("admin_id", String(state.currentAdmin.id));
    const data = asJson(await postAdmin(fd));
    state.currentAdminDetails = data && typeof data === "object" ? data : null;
  }

  async function loadDonors(extra = {}) {
    const fd = new FormData();
    fd.append("action", "search_donors");
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v ?? ""));
    const data = asJson(await postAdmin(fd));
    state.donors = Array.isArray(data) ? data : [];
  }

  async function loadRequests() {
    const fd = new FormData();
    fd.append("action", "get_blood_requests");
    const data = asJson(await postAdmin(fd));
    state.requests = Array.isArray(data) ? data : [];
  }

  async function loadDonationRecords() {
    const fd = new FormData();
    fd.append("action", "get_donation_records");
    fd.append("limit", "100");
    const data = asJson(await postAdmin(fd));
    state.donationRecords = Array.isArray(data) ? data : [];
  }

  async function loadAdmins() {
    const fd = new FormData();
    fd.append("action", "get_admins");
    fd.append("sort_by", "id");
    fd.append("order", "ASC");
    const data = asJson(await postAdmin(fd));
    state.admins = Array.isArray(data) ? data : [];
  }


  async function loadCurrentAdminFromSession() {
    const fd = new FormData();
    fd.append("action", "get_current_admin");
    const text = await postAdmin(fd);
    const data = asJson(text);

    if (text === "admin_not_logged_in") {
      window.location.href = "/html/login.html";
      return false;
    }

    if (!data) return false;

    state.currentAdmin = data;
    state.currentAdminDetails = data;
    return true;
  }

  async function loadMessages(filter = "all") {
    const fd = new FormData();
    fd.append("action", "get_contact_messages");
    fd.append("filter", filter);
    const data = asJson(await postAdmin(fd));
    state.messages = Array.isArray(data) ? data : [];
  }

  async function loadActivities() {
    const fd = new FormData();
    fd.append("action", "get_activity_logs");
    const data = asJson(await postAdmin(fd));
    state.activitiesByDate = data && typeof data === "object" ? data : {};
  }

  function renderAll() {
    renderTopbarDate();
    renderBloodBars();
    renderActivities();
    renderDashRequests();
    renderDonorsTable();
    renderDonationDropdown();
    renderRequestsTable();
    renderDonationRecords();
    renderAdmins();
    renderMessages();
    updateBadges();
    fillMyAccount();
  }

  function renderTopbarDate() {
    if ($("topbarDate")) {
      $("topbarDate").textContent = new Date().toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    const name = state.currentAdmin?.admin_name || val("myName") || "Admin";
    const av = document.querySelector(".user-avatar");
    const nm = document.querySelector(".topbar-user .user-name");
    const roleEl = document.querySelector(".topbar-user .user-role");
    const bell = document.querySelector(".notif-wrap");

    if (nm) nm.textContent = name;

    if (roleEl && state.currentAdmin) {
      roleEl.textContent = isSuperAdminById(state.currentAdmin) ? "Super Admin" : "Admin";
    }

    if (av) {
      const photo = state.currentAdminDetails?.admin_photo || "";
      if (photo) {
        av.innerHTML = `<img src="${esc(photo)}" alt="admin photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        av.textContent = initials(name);
      }
    }

    if (bell) bell.style.display = "none";
  }

  function animateCounters() {
    $$(".stat-num[data-target]").forEach((el) => {
      const target = Number(el.getAttribute("data-target") || 0);
      let current = 0;
      const inc = Math.max(1, Math.ceil(target / 40));
      const t = setInterval(() => {
        current = Math.min(target, current + inc);
        el.textContent = String(current);
        if (current >= target) clearInterval(t);
      }, 25);
    });
  }

  function renderBloodBars() {
    const el = $("bloodBars");
    if (!el) return;
    const map = {};
    state.donors.forEach((d) => (map[d.blood_group] = (map[d.blood_group] || 0) + 1));
    const keys = Object.keys(map);
    if (!keys.length) {
      el.innerHTML = `<p style="opacity:.8">No donor data.</p>`;
      return;
    }
    const max = Math.max(...Object.values(map), 1);
    el.innerHTML = keys.map((g) => {
      const pct = Math.round((map[g] / max) * 100);
      return `<div class="bg-bar-row"><span class="bg-bar-label">${esc(g)}</span><div class="bg-bar-track"><div class="bg-bar-fill" style="width:${pct}%"></div></div><span class="bg-bar-count">${map[g]}</span></div>`;
    }).join("");
  }

  function renderActivities() {
    const list = $("activityList");
    if (!list) return;
    const rows = Object.values(state.activitiesByDate).flat().slice(0, 8);
    if (!rows.length) {
      list.innerHTML = `<li class="activity-item"><span class="activity-text">No activity yet.</span></li>`;
      return;
    }
    list.innerHTML = rows.map((a) => {
      const cls = String(a.action_type || "").includes("deleted") ? "act-red" : String(a.action_type || "").includes("donated") ? "act-green" : "act-orange";
      return `<li class="activity-item"><div class="act-dot ${cls}"></div><div><span class="activity-text">${esc(a.actor_name || "System")} - ${esc(a.action_type || "")}</span><span class="activity-time">${fmtDate(a.created_at)}</span></div></li>`;
    }).join("");
  }

  function renderDashRequests() {
    const body = $("dashReqBody");
    if (!body) return;
    body.innerHTML = state.requests.slice(0, 5).map((r, i) => `<tr><td>${i + 1}</td><td><strong>${esc(r.requester_name || "-")}</strong></td><td><span class="blood-badge">${esc(r.blood_group || "-")}</span></td><td>${esc(r.city || "-")}</td><td>${fmtDate(r.created_at)}</td><td>${urgencyBadge(r.urgency)}</td><td>${reqStatusBadge(r.status)}</td></tr>`).join("");
  }

  function renderDonorsTable() {
    const q = val("donorSearch").toLowerCase();
    const blood = val("donorBloodFilter");
    const av = val("donorAvailFilter").toLowerCase();
    const rows = state.donors.filter((d) => {
      const a = availLabel(d.availability).toLowerCase();
      return (!q || (d.name || "").toLowerCase().includes(q) || (d.phone || "").includes(q) || (d.city || "").toLowerCase().includes(q))
        && (!blood || d.blood_group === blood)
        && (!av || a === av.toLowerCase());
    });
    const pages = Math.max(1, Math.ceil(rows.length / state.rowsPerPage));
    if (state.donorPage > pages) state.donorPage = pages;
    const pageRows = rows.slice((state.donorPage - 1) * state.rowsPerPage, state.donorPage * state.rowsPerPage);
    const tbody = $("donorBody");
    if (!tbody) return;
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:1.2rem;">No donors found.</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((d) => `<tr><td><div class="tbl-avatar">${initials(d.name)}</div></td><td><strong>${esc(d.name || "-")}</strong></td><td>${esc(d.age || "-")}</td><td><span class="blood-badge">${esc(d.blood_group || "-")}</span></td><td>${esc(d.phone || "-")}</td><td>${esc(d.email || "-")}</td><td>${esc(d.city || "-")}</td><td>${fmtDate(d.last_donation_date)}</td><td>${fmtDate(d.next_eligible_date)}</td><td>${availBadge(d.availability)}</td><td><button class="act-btn" data-act="edit-donor" data-id="${d.id}"><i class='bx bx-edit'></i></button><button class="act-btn del" data-act="del-donor" data-id="${d.id}"><i class='bx bx-trash'></i></button></td></tr>`).join("");
    }
    renderPagination("donorPages", pages, state.donorPage, (p) => { state.donorPage = p; renderDonorsTable(); });
  }

  function renderDonationDropdown() {
    const sel = $("drDonor");
    const list = $("drDonorList");
    const search = $("drDonorSearch");
    if (!sel) return;

    const available = state.donors.filter((d) => String(d.availability || "").toLowerCase() === "available");

    sel.innerHTML =
      `<option value="" disabled selected>Choose donor...</option>` +
      available.map((d) => `<option value="${d.id}">${esc(d.name)} (${esc(d.blood_group)}) - ${esc(d.phone || "-")}</option>`).join("");

    if (list) {
      list.innerHTML = available.map((d) => {
        const label = `${d.name || "-"} (${d.blood_group || "-"}) - ${d.phone || "-"}`;
        return `<option value="${esc(label)}"></option>`;
      }).join("");
    }

    if (search) {
      search.onchange = function () {
        const v = search.value.trim();
        const found = available.find((d) => v === `${d.name || "-"} (${d.blood_group || "-"}) - ${d.phone || "-"}`);
        if (found) sel.value = String(found.id);
      };
    }
  }

  function renderRequestsTable() {
    const q = val("reqSearch").toLowerCase();
    const st = val("reqStatusFilter").toLowerCase();
    const blood = val("reqBloodFilter");
    const rows = state.requests.filter((r) => (!q || (r.requester_name || "").toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q)) && (!st || String(r.status || "").toLowerCase() === st) && (!blood || r.blood_group === blood));
    const pages = Math.max(1, Math.ceil(rows.length / state.rowsPerPage));
    if (state.reqPage > pages) state.reqPage = pages;
    const pageRows = rows.slice((state.reqPage - 1) * state.rowsPerPage, state.reqPage * state.rowsPerPage);
    const tbody = $("reqBody");
    if (!tbody) return;
    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:1.2rem;">No requests found.</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((r) => `<tr><td>${r.id}</td><td><strong>${esc(r.requester_name || "-")}</strong></td><td><span class="blood-badge">${esc(r.blood_group || "-")}</span></td><td>${esc(r.hospital_name || "-")}</td><td>${esc(r.city || "-")}</td><td>${esc(r.requester_phone || "-")}</td><td>${fmtDate(r.created_at)}</td><td>${urgencyBadge(r.urgency)}</td><td>${reqStatusBadge(r.status)}</td><td><button class="act-btn view-b" data-act="view-req" data-id="${r.id}"><i class='bx bx-show'></i></button><button class="act-btn del" data-act="del-req" data-id="${r.id}"><i class='bx bx-trash'></i></button></td></tr>`).join("");
    }
    renderPagination("reqPages", pages, state.reqPage, (p) => { state.reqPage = p; renderRequestsTable(); });
  }

  function renderDonationRecords() {
    const tbody = $("donRecBody");
    if (!tbody) return;
    tbody.innerHTML = state.donationRecords.slice(0, 20).map((r, i) => `<tr><td>${i + 1}</td><td><strong>${esc(r.donor_name || "-")}</strong></td><td><span class="blood-badge">${esc(r.blood_group || "-")}</span></td><td>${fmtDate(r.donation_date)}</td><td>${esc(r.location || "-")}</td><td>${esc(r.units || "-")}</td></tr>`).join("");
  }

  function renderAdmins() {
    const tbody = $("adminsBody");
    if (!tbody) return;

    tbody.innerHTML = state.admins.map((a, i) => {
      const role = isSuperAdminById(a) ? "Super Admin" : "Admin";
      const roleClass = role === "Super Admin" ? "badge-purple" : "badge-gray";

      const createBtn = $("createAdminBtn");
      if (createBtn) {
        createBtn.style.display = isSuperAdminById(state.currentAdmin) ? "inline-flex" : "none";
      }

      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${esc(a.admin_name || "-")}</strong></td>
        <td>${esc(a.admin_email || "-")}</td>
        <td><span class="badge ${roleClass}">${role}</span></td>
        <td>${fmtDate(a.admin_created_at)}</td>
        <td><span class="badge ${String(a.status).toLowerCase() === "active" ? "badge-green" : "badge-gray"}">${esc(a.status || "-")}</span></td>
        <td><button class="act-btn" data-act="toggle-admin" data-id="${a.id}" data-status="${String(a.status || "").toLowerCase() === "active" ? "inactive" : "active"}"><i class='bx bx-refresh'></i></button></td>
      </tr>`;
    }).join("");
  }

  function renderMessages() {
    const list = $("messagesList");
    if (!list) return;
    if (!state.messages.length) {
      list.innerHTML = `<p style="text-align:center;opacity:.8;padding:1rem;">No messages.</p>`;
      return;
    }
    list.innerHTML = state.messages.map((m) => `<div class="msg-card ${Number(m.is_read) ? "" : "unread"}" data-act="open-msg" data-id="${m.id}" style="cursor:pointer"><div class="msg-card-icon"><i class='bx bx-envelope'></i></div><div style="flex:1;min-width:0"><div class="msg-sender">${esc(m.name || "-")}</div><div class="msg-email">${esc(m.email || "-")}</div><div class="msg-preview">${esc(m.message || "")}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;"><span class="msg-time">${fmtDate(m.created_at)}</span>${Number(m.is_read) ? "" : `<span class="badge badge-red" style="font-size:.65rem">New</span>`}</div></div>`).join("");
  }

  function updateBadges() {
    const pending = state.requests.filter((r) => String(r.status || "").toLowerCase() === "pending").length;
    const unread = state.messages.filter((m) => !Number(m.is_read)).length;
    if ($("reqBadge")) { $("reqBadge").textContent = pending; $("reqBadge").classList.toggle("show", pending > 0); }
    if ($("msgBadge")) { $("msgBadge").textContent = unread; $("msgBadge").classList.toggle("show", unread > 0); }
  }

  function resolveCurrentAdmin() {
    const domName = document.querySelector(".user-name")?.textContent?.trim() || val("myName");
    const domEmail = val("myEmail");
    state.currentAdmin =
      state.admins.find((a) => a.admin_email === domEmail) ||
      state.admins.find((a) => (a.admin_name || "").toLowerCase() === (domName || "").toLowerCase()) ||
      state.admins[0] ||
      null;
  }

  function isSuperAdminById(admin) {
    const id = Number(admin?.id || 0);
    return id >= 1 && id <= 3;
  }

  function fillMyAccount() {
    if (!state.currentAdmin) return;
    if ($("myName")) $("myName").value = state.currentAdmin.admin_name || "";
    if ($("myEmail")) $("myEmail").value = state.currentAdmin.admin_email || "";
    if ($("myPhone")) $("myPhone").value = state.currentAdmin.admin_phone || "";
    if ($("myStatus")) $("myStatus").value = (state.currentAdmin.status || "active").toLowerCase() === "inactive" ? "Inactive" : "Active";
  }

  async function updateDonor() {
    const id = state.editingDonor?.id;
    if (!id) return;
    const fd = new FormData();
    fd.append("action", "update_donor");
    fd.append("donor_id", id);
    fd.append("name", val("mName"));
    fd.append("blood_group", val("mBlood"));
    fd.append("phone", val("mPhone"));
    fd.append("email", val("mEmail"));
    fd.append("city", val("mLocation"));
    fd.append("date_of_birth", ageToDob(val("mAge")));
    const t = await postAdmin(fd);
    if (t === "donor_updated") {
      showToast("Donor updated.");
      closeDonorModal();
      await loadDonors();
      renderDonorsTable();
      renderBloodBars();
      renderDonationDropdown();
      return;
    }
    showToast(`Update failed: ${t}`);
  }

  async function deleteDonor(id) {
    openConfirmModal("Delete this donor?", async () => {
      const fd = new FormData();
      fd.append("action", "delete_donor");
      fd.append("donor_id", String(id));
      const t = await postAdmin(fd);
      if (t === "donor_deleted") {
        showToast("Donor deleted.");
        await loadDonors();
        renderDonorsTable();
        renderBloodBars();
        renderDonationDropdown();
        return;
      }
      showToast(`Delete failed: ${t}`);
    });
    return;
  }

  async function recordDonation(e) {
    e.preventDefault();
    clearMsg("donRecMsg");
    const donor_id = val("drDonor");
    const donation_date = val("drDate");
    const units = val("drUnits");
    const location = val("drLocation");
    const notes = val("drNotes");
    if (!donor_id || !donation_date || !units || !location) {
      showMsg("donRecMsg", "Fill all required fields.");
      return;
    }
    const fd = new FormData();
    fd.append("action", "record_donation");
    fd.append("donor_id", donor_id);
    fd.append("donation_date", donation_date);
    fd.append("units", units);
    fd.append("location", location);
    fd.append("notes", notes);
    const t = await postAdmin(fd);
    if (t === "donation_recorded") {
      showMsg("donRecMsg", "Donation recorded.", "success");
      showToast("Donation recorded.");
      $("donRecForm")?.reset();
      await Promise.all([loadDonationRecords(), loadDonors(), loadStats()]);
      renderDonationRecords();
      renderDonorsTable();
      renderBloodBars();
      renderDonationDropdown();
      animateCounters();
      return;
    }
    showMsg("donRecMsg", `Failed: ${t}`);
  }

  async function updateRequestStatus(request_id, status) {
    const fd = new FormData();
    fd.append("action", "update_request_status");
    fd.append("request_id", String(request_id));
    fd.append("status", status);
    const t = await postAdmin(fd);
    if (t === "status_updated") {
      showToast("Request updated.");
      await Promise.all([loadRequests(), loadStats()]);
      renderRequestsTable();
      renderDashRequests();
      updateBadges();
      animateCounters();
      closeReqModal();
      return;
    }
    showToast(`Update failed: ${t}`);
  }

  async function deleteRequest(request_id) {
    openConfirmModal("Delete this request?", async () => {
      const fd = new FormData();
      fd.append("action", "delete_blood_request");
      fd.append("request_id", String(request_id));
      const t = await postAdmin(fd);
      if (t === "request_deleted") {
        showToast("Request deleted.");
        await Promise.all([loadRequests(), loadStats()]);
        renderRequestsTable();
        renderDashRequests();
        updateBadges();
        return;
      }
      showToast(`Delete failed: ${t}`);
    });
    return;
  }
  

  async function notifyDonor(donor_id, request_id) {
    const fd = new FormData();
    fd.append("action", "notify_donor");
    fd.append("donor_id", String(donor_id));
    fd.append("request_id", String(request_id));
    const t = await postAdmin(fd);
    return t;
  }

  function getNotifyDonorMatches(request) {
    const compatibleMap = {
      "O-": ["O-"],
      "O+": ["O-", "O+"],
      "A-": ["O-", "A-"],
      "A+": ["O-", "O+", "A-", "A+"],
      "B-": ["O-", "B-"],
      "B+": ["O-", "O+", "B-", "B+"],
      "AB-": ["O-", "A-", "B-", "AB-"],
      "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
    };

    const needed = String(request.blood_group || "").toUpperCase();
    const allowed = compatibleMap[needed] || [needed];
    const reqCity = String(request.city || "").trim().toLowerCase();

    // 1) filter only available + compatible
    const base = state.donors.filter(function (d) {
      const donorBlood = String(d.blood_group || "").toUpperCase();
      const bloodMatch = allowed.includes(donorBlood);
      const availMatch = String(d.availability || "").toLowerCase() === "available";
      return bloodMatch && availMatch;
    });

    // 2) sort: matching city first, others later
    base.sort(function (a, b) {
      const aCityMatch = reqCity && String(a.city || "").toLowerCase().includes(reqCity) ? 1 : 0;
      const bCityMatch = reqCity && String(b.city || "").toLowerCase().includes(reqCity) ? 1 : 0;
      return bCityMatch - aCityMatch;
    });

    return base;
  }

  function openNotifyDonorModal(request) {
    const modal = $("notifyDonorModal");
    if (!modal) return;

    state.currentRequest = request;
    const matches = getNotifyDonorMatches(request);

    const summary = $("notifyDonorSummary");
    const count = $("notifyDonorCount");
    const body = $("notifyDonorTableBody");

    if (summary) summary.textContent = `Blood Group: ${request.blood_group} · Location: ${request.city || "-"}`;
    if (count) {
      count.textContent = matches.length
        ? `${matches.length} matching donor${matches.length !== 1 ? "s" : ""} found`
        : "No matching donors found";
    }

    if (body) {
      body.innerHTML = matches.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:1.5rem">No matching donors available.</td></tr>`
        : matches.map((d) => {
            const mailHref = d.email
              ? `mailto:${d.email}?subject=${encodeURIComponent(`Blood Request: ${request.blood_group} in ${request.city || ""}`)}`
              : "#";
            const mailBtn = d.email
              ? `<a class="act-btn view-b" href="${mailHref}" title="Send Mail"><i class="bx bx-envelope"></i></a>`
              : `<span style="color:#aaa;font-size:0.78rem">No email</span>`;
            return `<tr>
              <td><strong>${esc(d.name || "-")}</strong></td>
              <td>${esc(d.city || "-")}</td>
              <td>${esc(d.phone || "-")}</td>
              <td>${esc(d.email || "-")}</td>
              <td>${mailBtn}</td>
            </tr>`;
          }).join("");
    }

    modal.classList.add("open");
  }

  function closeNotifyDonorModal() {
    $("notifyDonorModal")?.classList.remove("open");
  }

  async function markMessageRead(message_id) {
    const fd = new FormData();
    fd.append("action", "mark_contact_message_read");
    fd.append("message_id", String(message_id));
    const t = await postAdmin(fd);
    if (t === "message_marked_read") await loadMessages(val("msgFilter") || "all");
  }

  async function deleteMessage(message_id) {
    if (!confirm("Delete this message?")) return;
    const fd = new FormData();
    fd.append("action", "delete_contact_message");
    fd.append("message_id", String(message_id));
    const t = await postAdmin(fd);
    if (t === "message_deleted") {
      showToast("Message deleted.");
      closeMsgModal();
      await loadMessages(val("msgFilter") || "all");
      renderMessages();
      updateBadges();
      return;
    }
    showToast(`Delete failed: ${t}`);
  }

  async function createAdmin() {
    clearMsg("createAdminMsg");
    const fields = ["anName", "anEmail", "anPhone", "anPass", "anConf"];
    const [name, email, phone, pass, conf] = fields.map(val);
    if (!name || !email || !phone || !pass || !conf) return showMsg("createAdminMsg", "Fill all required fields.");
    if (pass !== conf) return showMsg("createAdminMsg", "Passwords do not match.");
    if (pass.length < 6) return showMsg("createAdminMsg", "Password must be at least 6 characters.");

    const fd = new FormData();
    fd.append("action", "create_admin");
    fd.append("admin_name", name);
    fd.append("date_of_birth", "1990-01-01");
    fd.append("admin_phone", phone);
    fd.append("admin_email", email);
    fd.append("admin_city", "Unknown");
    fd.append("password", pass);

    const t = await postAdmin(fd);
    if (t === "admin_created") {
      showToast("Admin created.");
      $("adminModal")?.classList.remove("open");
      fields.forEach((id) => { if ($(id)) $(id).value = ""; });
      await loadAdmins();
      renderAdmins();
      return;
    }
    showMsg("createAdminMsg", `Failed: ${t}`);
  }

  async function updateAdminStatus(admin_id, status) {
    const fd = new FormData();
    fd.append("action", "update_admin_status");
    fd.append("admin_id", String(admin_id));
    fd.append("status", status);
    const t = await postAdmin(fd);
    if (t === "status_updated") {
      showToast("Admin Status Updated.");
      await loadAdmins();
      renderAdmins();
      return;
    }

    const map = {
      missing_data: "Please fill all required fields.",
      invalid_email: "Invalid email format.",
      invalid_phone: "Invalid phone number.",
      invalid_age: "Invalid date of birth.",
      admin_exist: "Phone or email already exists.",
      admin_error: "Failed to create admin."
    };
    showMsg("createAdminMsg", map[t] || `Failed: ${t}`, "error");
    showToast(map[t] || "Failed to create admin.");
  }

  async function saveMyAccount(e) {
    e.preventDefault();
    clearMsg("myAccMsg");
    if (!state.currentAdmin) return showMsg("myAccMsg", "Admin not resolved.");

    const fd = new FormData();
    fd.append("action", "update_admin");
    fd.append("admin_id", String(state.currentAdmin.id));
    fd.append("admin_name", val("myName"));
    fd.append("admin_phone", val("myPhone"));
    fd.append("admin_email", val("myEmail"));
    fd.append("admin_city", state.currentAdmin.admin_city || "Unknown");

    const file = document.getElementById("myPhotoFile")?.files?.[0];
    if (file) fd.append("photo", file);

    const t = await postAdmin(fd);
    if (t === "admin_updated") {
      showMsg("myAccMsg", "Profile updated.", "success");
      showToast("Profile updated.");
      await loadAdmins();
      resolveCurrentAdmin();
      fillMyAccount();
      return;
    }
    showMsg("myAccMsg", `Update failed: ${t}`);
  }

  async function changeMyPassword(e) {
    e.preventDefault();
    clearMsg("myPassMsg");

    const oldP = val("myOldPass");
    const newP = val("myNewPass");
    const confP = val("myConfPass");

    if (!oldP || !newP || !confP) return showMsg("myPassMsg", "Fill all fields.");
    if (newP !== confP) return showMsg("myPassMsg", "Passwords do not match.");

    const fd = new FormData();
    fd.append("action", "change_password");
    fd.append("role", "admin");
    fd.append("current_password", oldP);
    fd.append("new_password", newP);
    fd.append("csrf_token", await getCsrfToken());

    const res = await fetch(API.passwordReset, { method: "POST", body: fd, credentials: "same-origin" });
    const t = (await res.text()).trim();

    if (t === "password_changed") {
      showMsg("myPassMsg", "Password changed.", "success");
      showToast("Password changed.");
      $("myPassForm")?.reset();
      return;
    }

    showMsg("myPassMsg", `Failed: ${t}`);
  }

  function openDonorEdit(id) {
    const d = state.donors.find((x) => Number(x.id) === Number(id));
    if (!d) return;
    state.editingDonor = d;
    if ($("donorModalTitle")) $("donorModalTitle").textContent = "Edit Donor";
    if ($("mName")) $("mName").value = d.name || "";
    if ($("mAge")) $("mAge").value = d.age || "";
    if ($("mBlood")) $("mBlood").value = d.blood_group || "";
    if ($("mPhone")) $("mPhone").value = d.phone || "";
    if ($("mEmail")) $("mEmail").value = d.email || "";
    if ($("mLocation")) $("mLocation").value = d.city || "";
    if ($("mLastDonated")) $("mLastDonated").value = d.last_donation_date || "";
    if ($("mStatus")) $("mStatus").value = availLabel(d.availability);
    if ($("donorNextBtn")) $("donorNextBtn").textContent = "Update Donor";
    if ($("donorModal")) $("donorModal").classList.add("open");
  }

  function closeDonorModal() {
    state.editingDonor = null;
    $("donorModal")?.classList.remove("open");
  }

  function openRequestModal(id) {
    const r = state.requests.find((x) => Number(x.id) === Number(id));
    if (!r) return;

    state.currentRequest = r;

    const acceptedGroups = [r.blood_group];
    const donors = state.donors.filter((d) =>
      acceptedGroups.includes(d.blood_group) &&
      String(d.availability || "").toLowerCase() === "available"
    );

    const donorHtml = donors.length
      ? donors.slice(0, 3).map((d) => `
          <div style="background:var(--off-white);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.8rem;font-size:0.8rem;margin-bottom:5px">
            <strong>${esc(d.name)}</strong> · ${esc(d.city)} · 📞 ${esc(d.phone || "-")}
          </div>
        `).join("")
      : `<p style="font-size:0.82rem;color:#aaa">No available matching donors.</p>`;

    if ($("reqModalBody")) {
      $("reqModalBody").innerHTML =
        `<div class="req-detail-grid">
          <div class="req-detail-item"><label>Requester</label><span>${esc(r.requester_name || "-")}</span></div>
          <div class="req-detail-item"><label>Blood Group</label><span><span class="blood-badge">${esc(r.blood_group || "-")}</span></span></div>
          <div class="req-detail-item"><label>Hospital</label><span>${esc(r.hospital_name || "-")}</span></div>
          <div class="req-detail-item"><label>City</label><span>${esc(r.city || "-")}</span></div>
          <div class="req-detail-item"><label>Contact</label><span>${esc(r.requester_phone || "-")}</span></div>
          <div class="req-detail-item"><label>Status</label><span>${reqStatusBadge(r.status)}</span></div>
          <div class="req-detail-item"><label>Urgency</label><span>${urgencyBadge(r.urgency)}</span></div>
        </div>
        <div style="margin-top:1rem">
          <h4 style="font-size:0.88rem;font-weight:700;margin-bottom:0.6rem"><i class="bx bx-group" style="color:var(--red)"></i> Matching Available Donors</h4>
          ${donorHtml}
        </div>`;
    }

    $("reqModal").classList.add("open");
  }

  function closeReqModal() {
    state.currentRequest = null;
    $("reqModal")?.classList.remove("open");
  }

  function openMsg(id) {
    const m = state.messages.find((x) => Number(x.id) === Number(id));
    if (!m) return;
    state.currentMessage = m;
    $("msgModalBody").innerHTML = `<div style="margin-bottom:1rem"><p style="font-weight:700">${esc(m.name)}</p><p>${esc(m.email)} | ${esc(m.phone || "-")}</p><p style="opacity:.7">${fmtDate(m.created_at)}</p></div><div style="background:var(--off-white);padding:1rem;border-radius:10px;">${esc(m.message)}</div><div style="margin-top:1rem"><a class="btn-red" href="mailto:${esc(m.email)}">Reply via Email</a></div>`;
    $("msgModal").classList.add("open");
  }

  function closeMsgModal() {
    state.currentMessage = null;
    $("msgModal")?.classList.remove("open");
  }

  function openSidebar() {
  const sidebar = $("sidebar");
  if (!sidebar) return;

  sidebar.classList.add("open");

  if (!document.querySelector(".sidebar-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "sidebar-overlay show";
    overlay.addEventListener("click", closeSidebar);
    document.body.appendChild(overlay);
  }
}

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  document.querySelector(".sidebar-overlay")?.remove();
}

  function bindEvents() {
    $("removeMyPhotoBtn")?.addEventListener("click", async () => {
      if (!state.currentAdmin) return;

      const confirmed = confirm("Remove your profile photo?");
      if (!confirmed) return;

      const fd = new FormData();
      fd.append("action", "update_admin");
      fd.append("admin_id", String(state.currentAdmin.id));
      fd.append("admin_name", val("myName"));
      fd.append("admin_phone", val("myPhone"));
      fd.append("admin_email", val("myEmail"));
      fd.append("admin_city", state.currentAdmin.admin_city || "Unknown");
      fd.append("remove_photo", "1");

      const result = await postAdmin(fd);

      if (result === "admin_updated") {
        showToast("Profile photo removed.");
        await loadCurrentAdminFromSession();
        renderTopbarDate();
      } else {
        showToast(`Could not remove photo: ${result}`);
      }
    });

    $("menuBtn")?.addEventListener("click", () => {
    const sidebar = $("sidebar");
    if (!sidebar) return;

    if (sidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
    $$(".nav-item[data-section], [data-goto]").forEach((e) => e.addEventListener("click", (ev) => {
      ev.preventDefault();
      switchSection(e.dataset.section || e.dataset.goto);

      if (window.innerWidth <= 800) {
        closeSidebar();
      }
    }));

    $("donorSearch")?.addEventListener("input", () => { state.donorPage = 1; renderDonorsTable(); });
    $("donorBloodFilter")?.addEventListener("change", () => { state.donorPage = 1; renderDonorsTable(); });
    $("donorAvailFilter")?.addEventListener("change", () => { state.donorPage = 1; renderDonorsTable(); });

    $("reqSearch")?.addEventListener("input", () => { state.reqPage = 1; renderRequestsTable(); });
    $("reqStatusFilter")?.addEventListener("change", () => { state.reqPage = 1; renderRequestsTable(); });
    $("reqBloodFilter")?.addEventListener("change", () => { state.reqPage = 1; renderRequestsTable(); });

    $("notifyDonorModalClose")?.addEventListener("click", closeNotifyDonorModal);
    $("notifyDonorModalCancel")?.addEventListener("click", closeNotifyDonorModal);
    $("notifyDonorModal")?.addEventListener("click", (e) => {
      if (e.target === $("notifyDonorModal")) closeNotifyDonorModal();
    });    

    $("addDonorBtn")?.addEventListener("click", () => {
        window.open("/html/register.html", "_blank");
      });

    $("srchBtn")?.addEventListener("click", async () => {
      const blood = val("srchBlood");
      const city = val("srchLocation");
      const availability = val("srchAvail");

      await loadDonors({
        searched_name: "",
        blood_group: blood,
        city,
        availability: availBackend(availability)
      });

      const list = state.donors;
      $("srchCount").textContent = `${list.length} donor${list.length !== 1 ? "s" : ""} found`;
      $("srchResultsWrap").style.display = list.length ? "block" : "none";
      $("srchEmpty").style.display = list.length ? "none" : "block";

      $("srchGrid").innerHTML = list.map((d) => {
        const av = initials(d.name);
        const phone = d.phone ? d.phone : "-";
        return `<div class="donor-result-card">
          <div class="drc-avatar">${av}</div>
          <div class="drc-name">${esc(d.name || "-")}</div>
          <div class="drc-loc"><i class="bx bx-map-pin"></i> ${esc(d.city || "-")}</div>
          <span class="blood-badge">${esc(d.blood_group || "-")}</span>
          <div style="font-size:0.79rem">📞 ${esc(phone)}</div>
          ${availBadge(d.availability)}
        </div>`;
      }).join("");
    });

    $("srchClear")?.addEventListener("click", async () => {
      ["srchBlood", "srchLocation", "srchAvail"].forEach((id) => { if ($(id)) $(id).value = ""; });
      await loadDonors();
      renderDonorsTable();
      $("srchResultsWrap").style.display = "none";
      $("srchEmpty").style.display = "none";
    });

    $("donorBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act][data-id]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "edit-donor") return openDonorEdit(id);
      if (btn.dataset.act === "del-donor") return deleteDonor(id);
    });

    $("donorNextBtn")?.addEventListener("click", async () => { if (state.editingDonor) await updateDonor(); });
    $("donorModalClose")?.addEventListener("click", closeDonorModal);
    $("donorModalCancel")?.addEventListener("click", closeDonorModal);

    $("reqBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act][data-id]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "view-req") return openRequestModal(id);
      if (btn.dataset.act === "del-req") return deleteRequest(id);
    });

    $("reqModalBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act='notify-one'][data-donor]");
      if (!btn || !state.currentRequest) return;
      const out = await notifyDonor(Number(btn.dataset.donor), Number(state.currentRequest.id));
      showToast(out === "donor_notified" ? "Donor notified." : `Notify failed: ${out}`);
    });

    $("reqModalClose")?.addEventListener("click", closeReqModal);
    $("reqModalCancel")?.addEventListener("click", closeReqModal);
    $("reqFulfillBtn")?.addEventListener("click", async () => state.currentRequest && updateRequestStatus(state.currentRequest.id, "fulfilled"));
    $("reqCancelBtn")?.addEventListener("click", async () => state.currentRequest && updateRequestStatus(state.currentRequest.id, "cancelled"));

    $("reqFindDonorBtn")?.addEventListener("click", () => {
      if (!state.currentRequest) return showToast("No request selected.");
      const selected = state.currentRequest;
      closeReqModal();
      openNotifyDonorModal(selected);
    });
   
    
    $("donRecForm")?.addEventListener("submit", recordDonation);

    $("messagesList")?.addEventListener("click", async (e) => {
      const card = e.target.closest("[data-act='open-msg'][data-id]");
      if (!card) return;
      const id = Number(card.dataset.id);
      await markMessageRead(id);
      await loadMessages(val("msgFilter") || "all");
      renderMessages();
      updateBadges();
      openMsg(id);
    });

    $("msgFilter")?.addEventListener("change", async () => {
      await loadMessages(val("msgFilter") || "all");
      renderMessages();
      updateBadges();
    });

    $("markMsgsRead")?.addEventListener("click", async () => {
      const unreadIds = state.messages.filter((m) => !Number(m.is_read)).map((m) => m.id);
      for (const id of unreadIds) await markMessageRead(id);
      await loadMessages(val("msgFilter") || "all");
      renderMessages();
      updateBadges();
      showToast("All messages marked read.");
    });

    $("msgModalClose")?.addEventListener("click", closeMsgModal);
    $("msgModalCancel")?.addEventListener("click", closeMsgModal);
    $("msgDeleteBtn")?.addEventListener("click", async () => state.currentMessage && deleteMessage(state.currentMessage.id));

    $("createAdminBtn")?.addEventListener("click", () => {
        if (!isSuperAdminById(state.currentAdmin)) {
          showToast("Only Super Admin can create admin.");
          return;
        }
        clearMsg("createAdminMsg");
        $("adminModal")?.classList.add("open");
      });
    $("adminModalClose")?.addEventListener("click", () => $("adminModal")?.classList.remove("open"));
    $("adminModalCancel")?.addEventListener("click", () => $("adminModal")?.classList.remove("open"));
    $("saveAdminBtn")?.addEventListener("click", createAdmin);

    $("adminsBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act='toggle-admin'][data-id][data-status]");
      if (!btn) return;
      await updateAdminStatus(Number(btn.dataset.id), btn.dataset.status);
    });

    $("myAccForm")?.addEventListener("submit", saveMyAccount);
    $("myPassForm")?.addEventListener("submit", changeMyPassword);

    const logoutLink = Array.from(document.querySelectorAll("a.nav-item")).find((a) => a.textContent.toLowerCase().includes("logout"));
    logoutLink?.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch(API.logout, { credentials: "same-origin" });
      } catch {}
      window.location.href = "/html/login.html";
    });
  }

  async function init() {
    bindEvents();
    setupConfirmModal();
    switchSection("dashboard");
    await loadAll();
    $("notifyAllDonorsBtn")?.addEventListener("click", () => {
      if (!state.currentRequest) return showToast("No request selected.");
      const matches = getNotifyDonorMatches(state.currentRequest);
      if (!matches.length) return showToast("No matching donors to notify.");

      const recipients = matches.map((d) => d.email).filter(Boolean).join(",");
      if (!recipients) return showToast("No donor emails available.");

      const subject = encodeURIComponent(`Blood Request: ${state.currentRequest.blood_group} in ${state.currentRequest.city || ""}`);
      const body = encodeURIComponent("There is a blood request matching your profile. Please respond if available.");
      window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      showToast("Failed to initialize admin dashboard.");
    });
  });
})();