// /js/forgot-pass.js
(() => {
  "use strict";

  // Main form
  const form = document.getElementById("forgotForm");
  const identifierInput = document.getElementById("forgotEmail");
  const submitBtn = form ? form.querySelector(".submit-btn") : null;

  // Optional role UI (works even if not present)
  const donorTab = document.getElementById("fpDonorTab");
  const adminTab = document.getElementById("fpAdminTab");
  const roleHidden = document.getElementById("fpRole");

  // OTP modal
  const otpModal = document.getElementById("otpModal");
  const otpHint = document.getElementById("otpHint");
  const otpInput = document.getElementById("otpInput");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  const resendOtpBtn = document.getElementById("resendOtpBtn");
  const otpBackBtn = document.getElementById("otpBackBtn");

  // Reset password modal
  const resetPassModal = document.getElementById("resetPassModal");
  const newPass = document.getElementById("newPass");
  const confirmNewPass = document.getElementById("confirmNewPass");
  const updatePasswordBtn = document.getElementById("updatePasswordBtn");
  const resetBackBtn = document.getElementById("resetBackBtn");

  // Password eye buttons
  const toggleNewPass = document.getElementById("toggleNewPass");
  const toggleConfirmNewPass = document.getElementById("toggleConfirmNewPass");

  let csrfTokenCache = "";
  let resendTimer = null;

  // Default role + auto-read role from login URL param
  let role = "donor";
  const qpRole = new URLSearchParams(window.location.search).get("role");
  if (qpRole === "admin" || qpRole === "donor") {
    role = qpRole;
  }

  // keep identifier used for resend
  let resetIdentifier = "";

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) {
      alert(msg);
      return;
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function mapMsg(code) {
    const map = {
      missing_data: "Please fill all required fields.",
      invalid_role: "Invalid role selected.",
      user_not_found: "No account found for this email/phone.",
      otp_sent: "OTP sent successfully.",
      otp_failed: "Failed to send OTP.",
      wait_before_retry: "Please wait before requesting another OTP.",
      missing_otp: "Please enter OTP.",
      invalid_otp_format: "OTP must be 6 digits.",
      invalid_otp: "Invalid OTP.",
      otp_expired: "OTP expired. Please resend OTP.",
      too_many_attempts: "Too many attempts. Resend OTP.",
      otp_verified: "OTP verified.",
      otp_not_verified: "Please verify OTP first.",
      weak_password: "Password must be at least 6 characters.",
      same_password: "New password cannot be same as old password.",
      password_reset_success: "Password reset successful.",
      csrf_invalid: "Session expired. Refresh and try again.",
      unauthorized: "Unauthorized request.",
      captcha_failed: "Please complete CAPTCHA.",
      captcha_not_verified: "Captcha not verified. Try again.",
      captcha_verify_error: "Captcha verification failed.",
      invalid_purpose: "Captcha purpose invalid.",
      server_error: "Server error. Try again."
    };
    return map[code] || `Request failed: ${code}`;
  }

  function setRole(nextRole) {
    role = nextRole === "admin" ? "admin" : "donor";

    if (donorTab) donorTab.classList.toggle("active", role === "donor");
    if (adminTab) adminTab.classList.toggle("active", role === "admin");
    if (roleHidden) roleHidden.value = role;

    if (identifierInput) {
      identifierInput.placeholder =
        role === "admin"
          ? "Enter admin email or phone"
          : "Enter donor email or phone";
    }
  }

  function setupRoleToggle() {
    if (donorTab) donorTab.addEventListener("click", () => setRole("donor"));
    if (adminTab) adminTab.addEventListener("click", () => setRole("admin"));
    setRole(role); // apply URL role/default
  }

  function setupEye(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show
        ? "<i class='bx bx-show'></i>"
        : "<i class='bx bx-hide'></i>";
    });
  }

  function openModal(el) {
    if (!el) return;
    el.classList.add("open");
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.remove("open");
  }

  function lockBtn(btn, lock, loadingText, normalText) {
    if (!btn) return;
    btn.disabled = lock;
    btn.textContent = lock ? loadingText : normalText;
  }

  function resetCaptcha() {
    if (window.grecaptcha && typeof window.grecaptcha.reset === "function") {
      window.grecaptcha.reset();
    }
  }

  function maskIdentifier(v) {
    if (!v) return "";
    if (v.includes("@")) {
      const [local, domain] = v.split("@");
      const tail = local.slice(-3) || local;
      return `***${tail}@${domain}`;
    }
    const digits = v.replace(/\D/g, "");
    return `******${digits.slice(-4)}`;
  }

  function startResendCountdown() {
    if (!resendOtpBtn) return;

    let sec = 60;
    clearInterval(resendTimer);

    resendOtpBtn.disabled = true;
    resendOtpBtn.textContent = `Resend OTP (${sec}s)`;

    resendTimer = setInterval(() => {
      sec -= 1;
      if (sec <= 0) {
        clearInterval(resendTimer);
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = "Resend OTP";
        return;
      }
      resendOtpBtn.textContent = `Resend OTP (${sec}s)`;
    }, 1000);
  }

  async function getCsrfToken() {
    if (csrfTokenCache) return csrfTokenCache;

    const res = await fetch("/php/csrf_token.php", { credentials: "same-origin" });
    if (!res.ok) throw new Error("csrf_fetch_failed");

    const data = await res.json();
    csrfTokenCache = data.csrf_token || "";
    return csrfTokenCache;
  }

  async function postReset(fd) {
    const res = await fetch("/php/password_reset.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });
    return (await res.text()).trim();
  }

  async function verifyCaptchaForForgot(csrfToken) {
    const token = window.grecaptcha ? grecaptcha.getResponse() : "";
    if (!token) return "captcha_failed";

    const fd = new FormData();
    fd.append("csrf_token", csrfToken);
    fd.append("purpose", "forgot_password");
    fd.append("g-recaptcha-response", token);

    const res = await fetch("/php/captcha.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }

  async function sendOtpFlow(e) {
    e.preventDefault();

    const identifier = (identifierInput?.value || "").trim();
    if (!identifier) {
      showToast("Please enter email or phone.");
      return;
    }

    lockBtn(submitBtn, true, "Sending...", "Send OTP");

    try {
      const csrf = await getCsrfToken();

      // Real captcha verification
      const cap = await verifyCaptchaForForgot(csrf);
      if (cap !== "captcha_success") {
        showToast(mapMsg(cap));
        resetCaptcha();
        lockBtn(submitBtn, false, "Sending...", "Send OTP");
        return;
      }

      const fd = new FormData();
      fd.append("action", "send_reset_otp");
      fd.append("csrf_token", csrf);
      fd.append("role", role);
      fd.append("identifier", identifier);

      const out = await postReset(fd);
      if (out !== "otp_sent") {
        showToast(mapMsg(out));
        resetCaptcha();
        lockBtn(submitBtn, false, "Sending...", "Send OTP");
        return;
      }

      resetIdentifier = identifier;
      if (otpHint) otpHint.textContent = `OTP sent to ${maskIdentifier(identifier)}`;

      showToast("OTP sent.");
      openModal(otpModal);
      startResendCountdown();
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please try again.");
      resetCaptcha();
      lockBtn(submitBtn, false, "Sending...", "Send OTP");
    }
  }

  async function verifyOtpFlow() {
    const otp = (otpInput?.value || "").trim();
    if (!/^\d{6}$/.test(otp)) {
      showToast("Enter valid 6-digit OTP.");
      return;
    }

    lockBtn(verifyOtpBtn, true, "Verifying...", "Verify OTP");

    try {
      const csrf = await getCsrfToken();

      const fd = new FormData();
      fd.append("action", "verify_reset_otp");
      fd.append("csrf_token", csrf);
      fd.append("otp", otp);

      const out = await postReset(fd);
      if (out !== "otp_verified") {
        showToast(mapMsg(out));
        lockBtn(verifyOtpBtn, false, "Verifying...", "Verify OTP");
        return;
      }

      showToast("OTP verified.");
      closeModal(otpModal);
      openModal(resetPassModal);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please try again.");
      lockBtn(verifyOtpBtn, false, "Verifying...", "Verify OTP");
    }
  }

  async function resendOtpFlow() {
    if (!resetIdentifier) {
      showToast("Please send OTP first.");
      return;
    }
    if (resendOtpBtn?.disabled) return;

    lockBtn(resendOtpBtn, true, "Sending...", "Resend OTP");

    try {
      const csrf = await getCsrfToken();

      const fd = new FormData();
      fd.append("action", "send_reset_otp");
      fd.append("csrf_token", csrf);
      fd.append("role", role);
      fd.append("identifier", resetIdentifier);

      const out = await postReset(fd);
      if (out !== "otp_sent") {
        showToast(mapMsg(out));
        lockBtn(resendOtpBtn, false, "Sending...", "Resend OTP");
        return;
      }

      showToast("OTP resent.");
      startResendCountdown();
    } catch (err) {
      console.error(err);
      showToast("Failed to resend OTP.");
      lockBtn(resendOtpBtn, false, "Sending...", "Resend OTP");
    }
  }

  async function resetPasswordFlow() {
    const p1 = (newPass?.value || "").trim();
    const p2 = (confirmNewPass?.value || "").trim();

    if (!p1 || !p2) {
      showToast("Please fill both password fields.");
      return;
    }
    if (p1.length < 6) {
      showToast("Password must be at least 6 characters.");
      return;
    }
    if (p1 !== p2) {
      showToast("Passwords do not match.");
      return;
    }

    lockBtn(updatePasswordBtn, true, "Updating...", "Update Password");

    try {
      const csrf = await getCsrfToken();

      const fd = new FormData();
      fd.append("action", "reset_password");
      fd.append("csrf_token", csrf);
      fd.append("password", p1);

      const out = await postReset(fd);
      if (out !== "password_reset_success") {
        showToast(mapMsg(out));
        lockBtn(updatePasswordBtn, false, "Updating...", "Update Password");
        return;
      }

      showToast("Password changed. Redirecting to login...");
      closeModal(resetPassModal);

      form?.reset();
      if (otpInput) otpInput.value = "";
      if (newPass) newPass.value = "";
      if (confirmNewPass) confirmNewPass.value = "";
      resetCaptcha();

      lockBtn(submitBtn, false, "Sending...", "Send OTP");

      setTimeout(() => {
        window.location.href = "/html/login.html";
      }, 1200);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please try again.");
      lockBtn(updatePasswordBtn, false, "Updating...", "Update Password");
    }
  }

  function init() {
    setupRoleToggle();
    setupEye(toggleNewPass, newPass);
    setupEye(toggleConfirmNewPass, confirmNewPass);

    form?.addEventListener("submit", sendOtpFlow);
    verifyOtpBtn?.addEventListener("click", verifyOtpFlow);
    resendOtpBtn?.addEventListener("click", resendOtpFlow);

    otpBackBtn?.addEventListener("click", () => {
      closeModal(otpModal);
      lockBtn(submitBtn, false, "Sending...", "Send OTP");
    });

    updatePasswordBtn?.addEventListener("click", resetPasswordFlow);

    resetBackBtn?.addEventListener("click", () => {
      closeModal(resetPassModal);
      openModal(otpModal);
      lockBtn(updatePasswordBtn, false, "Updating...", "Update Password");
    });

    otpInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        verifyOtpFlow();
      }
    });

    confirmNewPass?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        resetPasswordFlow();
      }
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();