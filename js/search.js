//  BLOOD CENTER — search.js


window.addEventListener("DOMContentLoaded", function () {
  const searchBtn = document.getElementById("searchBtn");
  const clearBtn = document.getElementById("clearBtn");
  const sLocation = document.getElementById("sLocation");

  if (searchBtn) searchBtn.addEventListener("click", runSearch);
  if (clearBtn) clearBtn.addEventListener("click", clearSearch);
  if (sLocation) {
    sLocation.addEventListener("keydown", function (e) {
      if (e.key === "Enter") runSearch();
    });
  }
});

async function getCsrfToken() {
  const res = await fetch("../php/csrf_token.php", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to get CSRF token");
  const data = await res.json();
  return data.csrf_token;
}

function mapAvailability(uiValue) {
  if (uiValue === "Available") return "available";
  if (uiValue === "Not Available") return "unavailable";
  return "";
}

async function runSearch() {
  const blood = document.getElementById("sBlood")?.value || "";
  const city = (document.getElementById("sLocation")?.value || "").trim();
  const availUi = document.getElementById("sAvail")?.value || "";
  const availability = mapAvailability(availUi);

  try {
    const csrf = await getCsrfToken();

    const fd = new FormData();
    fd.append("action", "search_donors");
    fd.append("csrf_token", csrf); // safe to send; this action currently doesn't require it
    if (blood) fd.append("blood_group", blood);
    if (city) fd.append("city", city);
    if (availability) fd.append("availability", availability);

    const res = await fetch("../php/server.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    const text = (await res.text()).trim();

    let donors = [];
    try {
      donors = JSON.parse(text);
    } catch (_) {
      // backend returned non-JSON error text
      showResults([]);
      return;
    }

    if (!Array.isArray(donors)) donors = [];
    showResults(donors);
  } catch (err) {
    console.error(err);
    showResults([]);
  }
}

function showResults(results) {
  const defaultState = document.getElementById("defaultState");
  const emptyState = document.getElementById("emptyState");
  const resultsTop = document.getElementById("resultsTop");
  const grid = document.getElementById("donorsGrid");
  const countEl = document.getElementById("resultsCount");

  if (defaultState) defaultState.style.display = "none";

  if (!results || results.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    if (resultsTop) resultsTop.style.display = "none";
    if (grid) grid.innerHTML = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (resultsTop) resultsTop.style.display = "flex";
  if (countEl) countEl.textContent = `${results.length} donor${results.length !== 1 ? "s" : ""} found`;

  if (grid) {
    grid.innerHTML = results.map(buildDonorCard).join("");
  }
}

function buildDonorCard(donor) {
  const name = donor.name || "Unknown";
  const blood = donor.blood_group || "-";
  const age = donor.age ?? "-";
  const location = donor.city || "-";
  const phone = donor.phone || "Hidden";
  const lastDonated = donor.last_donation_date || null;

  const rawAvail = (donor.availability || "").toLowerCase();
  const isAvailable = rawAvail === "available";
  const availLabel = isAvailable ? "● Available" : "○ Not Available";
  const statusClass = isAvailable ? "pill-available" : "pill-not-available";

  const avatar = getInitials(name);
  const lastDonatedText = lastDonated ? `Last donated: ${lastDonated}` : "No donation record";

  return `
    <div class="donor-card">
      <div class="donor-avatar">${avatar}</div>
      <div class="donor-name">${escapeHtml(name)}</div>

      <div class="donor-location">
        <i class="bx bx-map-pin"></i>${escapeHtml(location)}
      </div>

      <span class="blood-tag">${escapeHtml(blood)}</span>
      <div class="card-divider"></div>

      <div class="donor-info-row">
        <span>Age</span>
        <span>${escapeHtml(String(age))} years</span>
      </div>

      <div class="donor-phone">
        <i class="bx bx-phone"></i>${escapeHtml(phone)}
      </div>

      <div class="last-donated">${escapeHtml(lastDonatedText)}</div>

      <span class="status-pill ${statusClass}">${availLabel}</span>
    </div>
  `;
}

function clearSearch() {
  const sBlood = document.getElementById("sBlood");
  const sLocation = document.getElementById("sLocation");
  const sAvail = document.getElementById("sAvail");

  if (sBlood) sBlood.value = "";
  if (sLocation) sLocation.value = "";
  if (sAvail) sAvail.value = "";

  const defaultState = document.getElementById("defaultState");
  const emptyState = document.getElementById("emptyState");
  const resultsTop = document.getElementById("resultsTop");
  const grid = document.getElementById("donorsGrid");

  if (defaultState) defaultState.style.display = "block";
  if (emptyState) emptyState.style.display = "none";
  if (resultsTop) resultsTop.style.display = "none";
  if (grid) grid.innerHTML = "";
}

function getInitials(name) {
  return (name || "U")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}