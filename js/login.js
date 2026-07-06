// /js/login.js
(() => {
  "use strict";

  const form = document.getElementById("loginForm");
  const userTab = document.getElementById("userTab");
  const adminTab = document.getElementById("adminTab");
  const passInput = document.getElementById("loginPass");
  const togglePass = document.getElementById("togglePass");

  let mode = "user"; // user | admin

  function showToast(msg) {
      const t = document.getElementById("toast");
      if (!t) {
        console.log(msg);
        return;
      }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove("show"), 2000);
    }

  async function getCsrfToken() {
      const res = await fetch("/php/csrf_token.php", { credentials: "same-origin" });
      if (!res.ok) throw new Error("csrf_fetch_failed");
      const data = await res.json();
      return data.csrf_token;
    }

  async function verifyCaptchaForLogin(csrfToken) {
      const token = window.grecaptcha ? grecaptcha.getResponse() : "";
      if (!token) return "captcha_failed";

      const fd = new FormData();
      fd.append("csrf_token", csrfToken);
      fd.append("purpose", "login");
      fd.append("g-recaptcha-response", token);

      const res = await fetch("/php/captcha.php", {
        method: "POST",
        body: fd,
        credentials: "same-origin"
      });

      return (await res.text()).trim();
    }

  function setMode(nextMode) {
      mode = nextMode === "admin" ? "admin" : "user";

      if (userTab) userTab.classList.toggle("active", mode === "user");
      if (adminTab) adminTab.classList.toggle("active", mode === "admin");

      const loginId = document.getElementById("loginId");
      if (loginId) {
        loginId.placeholder =
          mode === "admin"
            ? "Enter admin email or phone"
            : "Enter donor email or phone";
      }

      if (form) {
        const submitBtn = form.querySelector(".submit-btn");
        if (submitBtn) submitBtn.textContent = mode === "admin" ? "Admin Login" : "Login";
      }

      const forgotLink = document.getElementById("forgotLink");
      if (forgotLink) {
        forgotLink.href = mode === "admin"
          ? "forgot-pass.html?role=admin"
          : "forgot-pass.html?role=donor";
      }
    }

  function setupModeButtons() {
      if (userTab) userTab.addEventListener("click", () => setMode("user"));
      if (adminTab) adminTab.addEventListener("click", () => setMode("admin"));
      setMode("user");
    }

  function setupPasswordToggle() {
      if (!togglePass || !passInput) return;

      togglePass.addEventListener("click", () => {
        const show = passInput.type === "password";
        passInput.type = show ? "text" : "password";
        togglePass.innerHTML = show
          ? "<i class='bx bx-show'></i>"
          : "<i class='bx bx-hide'></i>";
      });
    }

  function mapError(code, currentMode) {
      const common = {
        missing_data: "Please fill all required fields.",
        wrong_password: "Wrong password.",
        csrf_invalid: "Session expired. Refresh and try again.",
        captcha_not_verified: "Captcha not verified. Try again.",
        server_error: "Server error. Try again."
      };

      const userOnly = {
        user_not_found: "Donor account not found."
      };

      const adminOnly = {
        admin_not_found: "Admin account not found.",
        admin_inactive: "Admin account is inactive."
      };

      return (
        common[code] ||
        (currentMode === "admin" ? adminOnly[code] : userOnly[code]) ||
        `Login failed: ${code}`
      );
    }

  async function handleSubmit(e) {
      e.preventDefault();
      if (!form) return;

      const fd = new FormData(form);
      const identifier = (fd.get("identifier") || "").trim();
      const password = (fd.get("password") || "").trim();

      if (!identifier || !password) {
        showToast("Please fill all required fields.");
        return;
      }

      const submitBtn = form.querySelector(".submit-btn");
      const originalBtnText = submitBtn ? submitBtn.textContent : "Login";

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Please wait...";
      }

      try {
        const csrfToken = await getCsrfToken();

        // CAPTCHA verify first
        const cap = await verifyCaptchaForLogin(csrfToken);
        if (cap !== "captcha_success") {
          showToast(cap === "captcha_failed" ? "Please complete CAPTCHA." : "Captcha verification failed.");
          if (window.grecaptcha) grecaptcha.reset();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
          return;
        }

        fd.append("csrf_token", csrfToken);
        fd.append("action", mode === "admin" ? "admin_login" : "donor_login");

        const res = await fetch("/php/login.php", {
          method: "POST",
          body: fd,
          credentials: "same-origin"
        });

        const text = (await res.text()).trim();

        if (text === "donor_login_success") {
          window.location.href = "/html/donor-dashboard.html";
          return;
        }

        if (text === "admin_login_success") {
          window.location.href = "/html/admin.html";
          return;
        }

        showToast(mapError(text, mode));
        if (window.grecaptcha) grecaptcha.reset();
      } catch (err) {
        console.error(err);
        showToast("Something went wrong. Please try again.");
        if (window.grecaptcha) grecaptcha.reset();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    }

  function init() {
      if (!form) return;
      setupModeButtons();
      setupPasswordToggle();
      form.addEventListener("submit", handleSubmit);
    }

  window.addEventListener("DOMContentLoaded", init);
})();