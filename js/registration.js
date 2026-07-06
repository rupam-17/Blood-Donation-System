const registerForm = document.getElementById("registerForm");

// ---------- State ----------
let tempRegisterData = null;
let csrfTokenCache = "";
let resendTimer = null;


// ---------- UI Helpers ----------
function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) {
      console.log(msg);
      return;
    }

    t.textContent = msg;
    t.classList.add("show");

    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 1800);
  }


function lockBtn(id, lock, loadingText, normalText) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = lock;
    btn.textContent = lock ? loadingText : normalText;
  }


function openOtpModal() {
    const modal = document.getElementById("otpModal");
    if (!modal) return;
    modal.classList.add("open");
    const otpInput = document.getElementById("otpInput");
    if (otpInput) otpInput.focus();
  }


function closeOtpModal() {
    const modal = document.getElementById("otpModal");
    if (!modal) return;
    modal.classList.remove("open");

    const otpInput = document.getElementById("otpInput");
    if (otpInput) otpInput.value = "";
  }


// ---------- Password Eye Toggle ----------
function setupEye(btnId, inputId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener("click", function () {
    const inp = document.getElementById(inputId);
    if (!inp) return;

    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    btn.innerHTML = show
      ? "<i class='bx bx-show'></i>"
      : "<i class='bx bx-hide'></i>";
  });
}

setupEye("toggleRPass", "rPass");
setupEye("toggleRConfirm", "rConfirm");


// ---------- Photo Preview (from auth.js) ----------
(function setupPhotoPreview() {
    const photoFile = document.getElementById("photoFile");
    if (!photoFile) return;

    photoFile.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        showToast("Photo must be max 2MB.");
        this.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        const preview = document.getElementById("photoPreview");
        if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="photo">`;
      };
      reader.readAsDataURL(file);
    });
  })();


// ---------- Core Helpers ----------
async function getCsrfToken() {
    const res = await fetch("/php/csrf_token.php", {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error("Failed to get CSRF token");
    const data = await res.json();
    return data.csrf_token;
  }


function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

function validPhone(phone) {
    return /^[6-9]\d{9}$/.test((phone || "").replace(/\s+/g, ""));
  }

function computeAgeFromDob(dobStr) {
    const dob = new Date(dobStr);
    if (Number.isNaN(dob.getTime())) return NaN;

    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }


function readAge() {
    const dobEl = document.getElementById("rDob");
    if (dobEl && dobEl.value) return computeAgeFromDob(dobEl.value);

    // optional fallback if rAge exists
    const ageEl = document.getElementById("rAge");
    if (ageEl && ageEl.value) return Number(ageEl.value);

    return NaN;
  }


function readCity() {
    const c1 = document.getElementById("rCity");
    const c2 = document.getElementById("rLocation");
    return (c1?.value || c2?.value || "").trim();
  }


function maskEmail(email) {
    if (!email || !email.includes("@")) return email || "";
    const [local, domain] = email.split("@");
    const last3 = local.slice(-3) || local;
    return `***${last3}@${domain}`;
  }


function getLocationFromBrowser() {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve({ latitude: null, longitude: null });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        () => {
          // deny/error -> continue with null values
          resolve({ latitude: null, longitude: null });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }




function validateRegisterInput(d) {
    if (!d.name || !d.phone || !d.email || !d.blood_group || !d.city || !d.password || !d.confirm_password) {
      return "Please fill all required fields.";
    }

    const age = readAge();
    if (Number.isNaN(age) || age < 18 || age > 60) {
      return "Age must be between 18 and 60.";
    }

    if (!validPhone(d.phone)) return "Enter valid 10-digit phone number.";
    if (!validEmail(d.email)) return "Enter valid email address.";
    if (d.password.length < 6) return "Password must be at least 6 characters.";
    if (d.password !== d.confirm_password) return "Passwords do not match.";
    if (!d.terms) return "Please accept Terms & Conditions.";

    return "";
  }



// ---------- Backend Calls ----------
async function verifyCaptchaForRegister(csrfToken) {
    const token = window.grecaptcha ? grecaptcha.getResponse() : "";
    if (!token) return "captcha_failed";

    const fd = new FormData();
    fd.append("csrf_token", csrfToken);
    fd.append("purpose", "donor_register");
    fd.append("g-recaptcha-response", token);

    const res = await fetch("/php/captcha.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }  


async function sendOtp(email, csrfToken) {
    const fd = new FormData();
    fd.append("action", "send_otp");
    fd.append("csrf_token", csrfToken);
    fd.append("email", email);

    const res = await fetch("/php/server.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }



async function verifyOtp(otp, csrfToken) {
    const fd = new FormData();
    fd.append("action", "verify_otp");
    fd.append("csrf_token", csrfToken);
    fd.append("otp", otp);

    const res = await fetch("/php/server.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }  



async function createDonor(temp, csrfToken) {
    const fd = new FormData();
    fd.append("action", "new_donor");
    fd.append("csrf_token", csrfToken);

    fd.append("name", temp.name);
    fd.append("blood_group", temp.blood_group);
    fd.append("phone", temp.phone);
    fd.append("email", temp.email);
    fd.append("city", temp.city);
    fd.append("date_of_birth", temp.date_of_birth);
    fd.append("password", temp.password);

    if (temp.latitude !== null && temp.latitude !== undefined) {
      fd.append("latitude", String(temp.latitude));
    }
    if (temp.longitude !== null && temp.longitude !== undefined) {
      fd.append("longitude", String(temp.longitude));
    }

    if (temp.photoFile) fd.append("photo", temp.photoFile);

    const res = await fetch("/php/server.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin"
    });

    return (await res.text()).trim();
  }  



// ---------- Response Map ----------
const msgMap = {
    csrf_invalid: "Session expired. Refresh and try again.",
    captcha_failed: "Please complete CAPTCHA.",
    captcha_not_verified: "Captcha not verified. Try again.",
    captcha_verify_error: "Captcha verification failed. Try again.",
    invalid_purpose: "Captcha purpose invalid.",

    missing_email: "Email is required.",
    invalid_email: "Invalid email format.",
    otp_sent: "OTP sent.",
    otp_failed: "Failed to send OTP.",
    wait_before_retry: "Please wait 60 seconds before resend.",
    missing_otp: "Please enter OTP.",
    invalid_otp: "Invalid OTP.",
    otp_expired: "OTP expired. Please resend OTP.",
    too_many_attempts: "Too many wrong attempts. Resend OTP.",
    otp_verified: "OTP verified.",

    missing_data: "Please fill all required fields.",
    invalid_phone: "Phone must be valid.",
    invalid_blood_group: "Invalid blood group.",
    invalid_age: "Age must be between 18 and 60.",
    file_too_large: "Photo too large (max 3MB).",
    invalid_file_type: "Photo must be JPG/JPEG/PNG.",
    invalid_image: "Invalid image file.",
    upload_failed: "Failed to upload photo.",
    otp_not_verified: "Please verify OTP first.",
    otp_email_mismatch: "OTP email does not match entered email.",
    donor_created: "Registration successful.",
    donor_error: "Registration failed. Try again."
  };


function getMsg(code) {
    return msgMap[code] || `Request failed: ${code}`;
  }  


// ---------- Resend Countdown ----------
function startResendCountdown() {
    const btn = document.getElementById("resendOtpBtn");
    if (!btn) return;

    let sec = 60;
    btn.disabled = true;
    btn.textContent = `Resend OTP (${sec}s)`;

    
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      sec -= 1;
      if (sec <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = "Resend OTP";
        return;
      }
      btn.textContent = `Resend OTP (${sec}s)`;
    }, 1000);
  }





// ---------- Main Register Submit ----------
if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = (document.getElementById("rName")?.value || "").trim();
      const phone = (document.getElementById("rPhone")?.value || "").trim();
      const email = (document.getElementById("rEmail")?.value || "").trim();
      const blood_group = (document.getElementById("rBlood")?.value || "").trim();
      const city = readCity();
      const password = document.getElementById("rPass")?.value || "";
      const confirm_password = document.getElementById("rConfirm")?.value || "";
      const terms = document.getElementById("rTerms")?.checked;
      const dobInput = document.getElementById("rDob")?.value || "";
      const photoFile = document.getElementById("photoFile")?.files?.[0] || null;

      tempRegisterData = {
        name,
        phone,
        email,
        blood_group,
        city,
        password,
        confirm_password,
        terms,
        date_of_birth: dobInput,
        latitude: null,
        longitude: null,
        photoFile
      };

      const validationError = validateRegisterInput(tempRegisterData);
      if (validationError) {
        showToast(validationError);
        return;
      }

      lockBtn("registerBtn", true, "Processing...", "Register");

      try {
        if (!csrfTokenCache) csrfTokenCache = await getCsrfToken();

        // 1) captcha verify
        const capRes = await verifyCaptchaForRegister(csrfTokenCache);
        if (capRes !== "captcha_success") {
          if (window.grecaptcha) grecaptcha.reset();
          showToast(getMsg(capRes));
          lockBtn("registerBtn", false, "Processing...", "Register");
          return;
        }

        // 2) ask location (allow/deny both continue)
        const loc = await getLocationFromBrowser();
        tempRegisterData.latitude = loc.latitude;
        tempRegisterData.longitude = loc.longitude;

        // 3) send otp
        const otpSendRes = await sendOtp(tempRegisterData.email, csrfTokenCache);
        if (otpSendRes !== "otp_sent") {
          if (window.grecaptcha) grecaptcha.reset();
          showToast(getMsg(otpSendRes));
          lockBtn("registerBtn", false, "Processing...", "Register");
          return;
        }

        // 4) show popup + masked email hint
        const otpHint = document.getElementById("otpHint");
        if (otpHint) otpHint.textContent = `OTP sent to ${maskEmail(tempRegisterData.email)}`;
        openOtpModal();
        showToast(`OTP sent to ${maskEmail(tempRegisterData.email)}`);
        startResendCountdown();
      } catch (err) {
        console.error(err);
        if (window.grecaptcha) grecaptcha.reset();
        showToast("Something went wrong. Please try again.");
        lockBtn("registerBtn", false, "Processing...", "Register");
      }
    });
  }  



// ---------- Verify OTP ----------
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      const otp = (document.getElementById("otpInput")?.value || "").trim();

      if (!/^\d{6}$/.test(otp)) {
        showToast("Enter valid 6-digit OTP.");
        return;
      }

      if (!tempRegisterData) {
        showToast("Registration session expired. Fill form again.");
        return;
      }

      lockBtn("verifyOtpBtn", true, "Verifying...", "Verify OTP");

      try {
        if (!csrfTokenCache) csrfTokenCache = await getCsrfToken();

        const verifyRes = await verifyOtp(otp, csrfTokenCache);
        if (verifyRes !== "otp_verified") {
          showToast(getMsg(verifyRes));
          lockBtn("verifyOtpBtn", false, "Verifying...", "Verify OTP");
          return;
        }

        const createRes = await createDonor(tempRegisterData, csrfTokenCache);
        showToast(getMsg(createRes));

        if (createRes === "donor_created") {
          closeOtpModal();
          registerForm.reset();
          tempRegisterData = null;

          const preview = document.getElementById("photoPreview");
          if (preview) preview.innerHTML = "<i class='bx bx-user'></i>";

          if (window.grecaptcha) grecaptcha.reset();

          lockBtn("registerBtn", false, "Processing...", "Register");
          showToast("Registration successful. Redirecting to login...");

          setTimeout(() => {
              window.location.href = "/html/login.html";
            }, 1200);

        } else {
          lockBtn("verifyOtpBtn", false, "Verifying...", "Verify OTP");
        }
      } catch (err) {
        console.error(err);
        showToast("Something went wrong. Please try again.");
        lockBtn("verifyOtpBtn", false, "Verifying...", "Verify OTP");
      }
    });
  }




// ---------- Resend OTP ----------
const resendOtpBtn = document.getElementById("resendOtpBtn");
if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", async () => {
      if (!tempRegisterData?.email) {
        showToast("Email not found. Fill form again.");
        return;
      }

      if (resendOtpBtn.disabled) return;
      lockBtn("resendOtpBtn", true, "Sending...", "Resend OTP");

      try {
        if (!csrfTokenCache) csrfTokenCache = await getCsrfToken();

        const resendRes = await sendOtp(tempRegisterData.email, csrfTokenCache);
        showToast(getMsg(resendRes));

        if (resendRes === "otp_sent") {
          startResendCountdown();
        } else {
          lockBtn("resendOtpBtn", false, "Sending...", "Resend OTP");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to resend OTP.");
        lockBtn("resendOtpBtn", false, "Sending...", "Resend OTP");
      }
    });
  }



// ---------- OTP Back ----------
const otpBackBtn = document.getElementById("otpBackBtn");
if (otpBackBtn) {
    otpBackBtn.addEventListener("click", () => {
      closeOtpModal();
      lockBtn("registerBtn", false, "Processing...", "Register");
    });
  }



// ---------- OTP Enter key ----------
const otpInput = document.getElementById("otpInput");
if (otpInput) {
  otpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      verifyOtpBtn?.click();
    }
  });
}

