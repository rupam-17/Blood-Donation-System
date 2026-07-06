/* =========================================
   BLOOD CENTER - public_donor_requests.js
   request.html real backend + toast version
========================================= */
(function () {
  "use strict";

  // ---------- Elements ----------
  const form = document.getElementById("requestForm");

  const myRequestsBtn = document.getElementById("myRequestsBtn");
  const myRequestsModal = document.getElementById("myRequestsModal");
  const myRequestsModalClose = document.getElementById("myRequestsModalClose");
  const myRequestsCancel = document.getElementById("myRequestsCancel");
  const myRequestsSubmit = document.getElementById("myRequestsSubmit");
  const myRequestsIdentifier = document.getElementById("myRequestsEmail"); // keep id from HTML

  const myRequestsResultsModal = document.getElementById("myRequestsResultsModal");
  const myRequestsResultsClose = document.getElementById("myRequestsResultsClose");
  const myRequestsResultsBack = document.getElementById("myRequestsResultsBack");
  const myRequestsResultsEmail = document.getElementById("myRequestsResultsEmail");
  const myRequestsResultsCount = document.getElementById("myRequestsResultsCount");
  const myRequestsResultsBody = document.getElementById("myRequestsResultsBody");
  const myRequestsResultsEmpty = document.getElementById("myRequestsResultsEmpty");

  let csrfTokenCache = "";
  let currentIdentifier = "";
  let currentRows = [];

  // ---------- Messages ----------
  const msgMap = {
    csrf_invalid: "Session expired. Refresh and try again.",
    captcha_failed: "Please complete CAPTCHA.",
    captcha_not_verified: "Captcha not verified. Try again.",
    captcha_verify_error: "Captcha verification failed. Try again.",
    invalid_purpose: "Captcha purpose invalid.",

    missing_data: "Please fill all required fields.",
    invalid_phone: "Phone must be 10-12 digits.",
    invalid_email: "Invalid email format.",
    invalid_blood_group: "Invalid blood group.",
    invalid_units: "Units must be at least 1.",
    query_error: "Server query failed. Try again.",
    request_error: "Failed to submit request. Try again.",
    request_created: "Blood request submitted successfully.",

    no_requests_found: "No requests found for this identifier.",
    request_not_found: "Request not found.",
    cannot_fulfill: "This request cannot be marked fulfilled now.",
    cannot_cancel: "This request cannot be cancelled now.",
    fulfill_failed: "Failed to mark as fulfilled.",
    cancel_failed: "Failed to cancel request.",
    update_error: "Update failed. Try again.",
    request_fulfilled: "Request marked as fulfilled.",
    request_cancelled: "Request cancelled successfully."
  };

  function mapMsg(code) {
    return msgMap[code] || code || "Something went wrong.";
  }

  // ---------- Toast ----------
  function showToast(msg, type) {
    const t = document.getElementById("toast");
    if (!t) return;

    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");

    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.className = "toast";
    }, 2200);
  }

  // ---------- Helpers ----------
  function escapeHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(s) {
    if (!s) return "-";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return escapeHtml(s);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function normalizeUrgency(value) {
    const u = String(value || "").toLowerCase();
    if (u === "urgent" || u === "critical") return u;
    return "normal";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const clean = String(phone || "").replace(/\s+/g, "");
    return /^\+?\d{10,15}$/.test(clean);
  }

  function lockBtn(btn, lock, loadingHtml, normalHtml) {
    if (!btn) return;
    btn.disabled = lock;
    btn.innerHTML = lock ? loadingHtml : normalHtml;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function resetCaptcha() {
    if (window.grecaptcha && typeof window.grecaptcha.reset === "function") {
      window.grecaptcha.reset();
    }
  }

  function askConfirm(message){
    return new Promise((resolve) => {
        const modal = document.getElementById("confirmModal");
        const text = document.getElementById("confirmText");
        const yes = document.getElementById("confirmYes");
        const no = document.getElementById("confirmNo");
        const close = document.getElementById("confirmClose");

        if (!modal || !text || !yes || !no || !close) return resolve(false);

        text.textContent = message;
        openModal(modal);

        const cleanup = () => {
        yes.removeEventListener("click", onYes);
        no.removeEventListener("click", onNo);
        close.removeEventListener("click", onNo);
        modal.removeEventListener("click", onOverlay);
        };

        const onYes = () => { cleanup(); closeModal(modal); resolve(true); };
        const onNo = () => { cleanup(); closeModal(modal); resolve(false); };
        const onOverlay = (e) => { if (e.target === modal) onNo(); };

        yes.addEventListener("click", onYes);
        no.addEventListener("click", onNo);
        close.addEventListener("click", onNo);
        modal.addEventListener("click", onOverlay);
    });
    }



  async function getCsrfToken() {
    if (csrfTokenCache) return csrfTokenCache;

    const res = await fetch("/php/csrf_token.php", { credentials: "same-origin" });
    if (!res.ok) throw new Error("csrf_fetch_failed");

    const data = await res.json();
    csrfTokenCache = data.csrf_token || "";
    return csrfTokenCache;
  }

  async function verifyCaptcha(purpose, csrfToken) {
    const token = window.grecaptcha ? window.grecaptcha.getResponse() : "";
    if (!token) return "captcha_failed";

    const fd = new FormData();
    fd.append("csrf_token", csrfToken);
    fd.append("purpose", purpose);
    fd.append("g-recaptcha-response", token);

    const res = await fetch("/php/captcha.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }

  async function postServer(fd) {
    const res = await fetch("/php/server.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });
    return (await res.text()).trim();
  }

  // ---------- Submit Request ----------
  function collectRequestData() {
    const patient = (document.getElementById("rPatient")?.value || "").trim();
    const ageRaw = (document.getElementById("rAge")?.value || "").trim();
    const blood = (document.getElementById("rBlood")?.value || "").trim();
    const unitsRaw = (document.getElementById("rUnits")?.value || "").trim();
    const hospital = (document.getElementById("rHospital")?.value || "").trim();
    const city = (document.getElementById("rLocation")?.value || "").trim();
    const phone = (document.getElementById("rContact")?.value || "").trim();
    const email = (document.getElementById("rEmail")?.value || "").trim();
    const notesInput = (document.getElementById("rNotes")?.value || "").trim();

    const urgencyEl = document.querySelector('input[name="urgency"]:checked');
    const urgency = normalizeUrgency(urgencyEl ? urgencyEl.value : "normal");

    const age = Number(ageRaw);
    const units = Number(unitsRaw);

    if (!patient || !blood || !unitsRaw || !hospital || !city || !phone || !email) {
      return { error: "Please fill all required fields." };
    }
    if (!Number.isFinite(age) || age < 1 || age > 120) {
      return { error: "Please enter valid patient age (1-120)." };
    }
    if (!Number.isFinite(units) || units < 1 || units > 10) {
      return { error: "Please enter valid units (1-10)." };
    }
    if (!isValidPhone(phone)) {
      return { error: "Please enter valid phone number." };
    }
    if (!isValidEmail(email)) {
      return { error: "Please enter valid email address." };
    }

    // backend has no patient_age field, so store age in notes
    const notes = notesInput ? `Patient Age: ${age}\n${notesInput}` : `Patient Age: ${age}`;

    return {
      requester_name: patient,
      requester_phone: phone,
      requester_email: email,
      blood_group: blood,
      units_needed: String(units),
      city,
      hospital_name: hospital,
      urgency,
      notes
    };
  }

  async function submitRequest(e) {
    e.preventDefault();

    const submitBtn = form.querySelector(".submit-btn");
    const normalBtnHtml = '<i class="bx bx-send"></i> Submit Request';
    const loadingBtnHtml = '<i class="bx bx-loader-alt bx-spin"></i> Submitting...';

    const data = collectRequestData();
    if (data.error) {
      showToast(data.error, "error");
      return;
    }

    lockBtn(submitBtn, true, loadingBtnHtml, normalBtnHtml);

    try {
      const csrf = await getCsrfToken();

      const cap = await verifyCaptcha("blood_request", csrf);
      if (cap !== "captcha_success") {
        showToast(mapMsg(cap), "error");
        resetCaptcha();
        lockBtn(submitBtn, false, loadingBtnHtml, normalBtnHtml);
        return;
      }

      const fd = new FormData();
      fd.append("action", "create_blood_request");
      fd.append("csrf_token", csrf);
      fd.append("requester_name", data.requester_name);
      fd.append("requester_phone", data.requester_phone);
      fd.append("requester_email", data.requester_email);
      fd.append("blood_group", data.blood_group);
      fd.append("units_needed", data.units_needed);
      fd.append("city", data.city);
      fd.append("hospital_name", data.hospital_name);
      fd.append("urgency", data.urgency);
      fd.append("notes", data.notes);

      const out = await postServer(fd);

      if (out === "request_created") {
        showToast(mapMsg(out), "success");
        form.reset();
        resetCaptcha();
      } else {
        showToast(mapMsg(out), "error");
        resetCaptcha();
      }
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please try again.", "error");
      resetCaptcha();
    } finally {
      lockBtn(submitBtn, false, loadingBtnHtml, normalBtnHtml);
    }
  }

  // ---------- My Requests ----------
  async function fetchMyRequests(identifier) {
    const fd = new FormData();
    fd.append("action", "get_my_blood_requests");
    fd.append("identifier", identifier);

    const out = await postServer(fd);

    if (out === "no_requests_found") return [];
    if (out === "missing_data" || out === "query_error") throw new Error(out);

    let rows = [];
    try {
      rows = JSON.parse(out);
    } catch {
      throw new Error(out || "invalid_response");
    }

    return Array.isArray(rows) ? rows : [];
  }

  function renderRows(rows) {
    if (!myRequestsResultsBody || !myRequestsResultsEmpty || !myRequestsResultsCount) return;

    if (!rows.length) {
      myRequestsResultsBody.innerHTML = "";
      myRequestsResultsEmpty.style.display = "block";
      myRequestsResultsCount.textContent = "0 requests";
      return;
    }

    myRequestsResultsEmpty.style.display = "none";
    myRequestsResultsCount.textContent = `${rows.length} request${rows.length > 1 ? "s" : ""}`;

    myRequestsResultsBody.innerHTML = rows.map((row, i) => {
      const status = String(row.status || "pending").toLowerCase();
      const canAct = status === "pending" || status === "matched";

      const actionHtml = canAct
        ? `<button type="button" class="act-btn btn-fulfill" data-act="fulfill" data-id="${row.id}">Fulfilled</button>
           <button type="button" class="act-btn btn-cancel" data-act="cancel" data-id="${row.id}">Cancel</button>`
        : "-";

      return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(row.requester_name || "-")}</strong></td>
          <td>${escapeHtml(row.blood_group || "-")}</td>
          <td>${escapeHtml(row.hospital_name || "-")}</td>
          <td>${formatDate(row.created_at)}</td>
          <td>${escapeHtml(String(row.urgency || "-"))}</td>
          <td>${escapeHtml(String(row.status || "-"))}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join("");
  }

  async function applyRequestAction(action, requestId) {
    const csrf = await getCsrfToken();
    const fd = new FormData();

    fd.append("csrf_token", csrf);
    fd.append("request_id", String(requestId));
    fd.append("identifier", currentIdentifier);
    fd.append("action", action === "fulfill" ? "fulfill_blood_request" : "cancel_blood_request");

    return await postServer(fd);
  }

  function bindResultsActionHandler() {
    if (!myRequestsResultsBody) return;

    myRequestsResultsBody.addEventListener("click", async function (e) {
      const btn = e.target.closest("button[data-act][data-id]");
      if (!btn) return;

      const action = btn.getAttribute("data-act");
      const requestId = Number(btn.getAttribute("data-id"));
      if (!requestId || !action) return;

      const ok = await askConfirm(
        action === "fulfill"
            ? "Mark as fulfilled?"
            : "Cancel this request?"
        );
        if (!ok) return;

      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = "Please wait...";

      try {
        const out = await applyRequestAction(action, requestId);

        if (out === "request_fulfilled" || out === "request_cancelled") {
          showToast(mapMsg(out), "success");
          currentRows = await fetchMyRequests(currentIdentifier);
          renderRows(currentRows);
        } else {
          showToast(mapMsg(out), "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Action failed. Please try again.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  }

  function setupMyRequestsModal() {
    if (!myRequestsBtn || !myRequestsModal) return;

    myRequestsBtn.addEventListener("click", () => {
      openModal(myRequestsModal);
      if (myRequestsIdentifier) myRequestsIdentifier.focus();
    });

    myRequestsModalClose?.addEventListener("click", () => closeModal(myRequestsModal));
    myRequestsCancel?.addEventListener("click", () => closeModal(myRequestsModal));

    myRequestsModal.addEventListener("click", (e) => {
      if (e.target === myRequestsModal) closeModal(myRequestsModal);
    });

    myRequestsSubmit?.addEventListener("click", async () => {
      const identifier = (myRequestsIdentifier?.value || "").trim();
      if (!identifier) {
        showToast("Enter email or phone.", "error");
        return;
      }

      try {
        myRequestsSubmit.disabled = true;
        myRequestsSubmit.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Loading...';

        const rows = await fetchMyRequests(identifier);

        currentIdentifier = identifier;
        currentRows = rows;

        if (myRequestsResultsEmail) myRequestsResultsEmail.textContent = identifier;
        renderRows(rows);

        closeModal(myRequestsModal);
        openModal(myRequestsResultsModal);

        if (!rows.length) showToast("No requests found.", "error");
      } catch (err) {
        const code = err && err.message ? err.message : "";
        showToast(mapMsg(code), "error");
      } finally {
        myRequestsSubmit.disabled = false;
        myRequestsSubmit.innerHTML = '<i class="bx bx-search"></i> Find Requests';
      }
    });

    myRequestsResultsClose?.addEventListener("click", () => closeModal(myRequestsResultsModal));
    myRequestsResultsBack?.addEventListener("click", () => closeModal(myRequestsResultsModal));

    myRequestsResultsModal?.addEventListener("click", (e) => {
      if (e.target === myRequestsResultsModal) closeModal(myRequestsResultsModal);
    });
  }

  // ---------- Init ----------
  function init() {
    if (form) form.addEventListener("submit", submitRequest);
    setupMyRequestsModal();
    bindResultsActionHandler();
  }

  window.addEventListener("DOMContentLoaded", init);
})();