const contactForm = document.getElementById("contactForm");


function showToast(msg)
    {
        const t = document.getElementById("toast");
        if (!t) return;

        t.textContent = msg;
        t.classList.add("show");

        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => {
            t.classList.remove("show");
        }, 1500); // disappears after 1.50 sec
    }



async function getCsrfToken()
    {
        const res = await fetch("php/csrf_token.php",
            {
                credentials: "same-origin"
            }
            );
        if (!res.ok) throw new Error("Failed to get CSRF token");

        const data = await res.json();

        return data.csrf_token;
    }

if (contactForm)
    {
        contactForm.addEventListener("submit", async (e) =>
            {
                e.preventDefault();

                const name = (contactForm.querySelector('[name="name"]')?.value || "").trim();
                const email = (contactForm.querySelector('[name="email"]')?.value || "").trim();
                const phone = (contactForm.querySelector('[name="phone"]')?.value || "").trim();
                const message = (contactForm.querySelector('[name="message"]')?.value || "").trim();


                if(!name || !email || !phone || !message)
                    {
                        showToast("Please fill all required fields.");
                        return;
                    }
                if(message.length > 500)
                    {
                        showToast("Message cannot exceed 500 characters.");
                        return;
                    }

                try
                    {
                        const csrfToken = await getCsrfToken();

                        const captchaToken = grecaptcha.getResponse();
                        if(!captchaToken)
                            {
                                showToast("Please complete CAPTCHA.");
                                return;
                            }

                    // 1) Verify CAPTCHA
                        const captchaFd = new FormData();
                        captchaFd.append("g-recaptcha-response", captchaToken);
                        captchaFd.append("purpose", "contact_us");
                        captchaFd.append("csrf_token", csrfToken);

                        const captchaRes = await fetch("php/captcha.php",
                            {
                                method: "POST",
                                body: captchaFd,
                                credentials: "same-origin"
                            });

                        const captchaText = (await captchaRes.text()).trim();
                        if (captchaText !== "captcha_success")
                            {
                                grecaptcha.reset();
                                showToast("Captcha verification failed. Please try again.");
                                return;
                            }
                        
                        // 2) Submit Contact Message
                        const fd = new FormData();
                        fd.append("action", "submit_contact_message");
                        fd.append("csrf_token", csrfToken);
                        fd.append("name", name);
                        fd.append("email", email);
                        fd.append("phone", phone);
                        fd.append("message", message);

                        const res = await fetch("php/server.php",
                            {
                                method: "POST",
                                body: fd,
                                credentials: "same-origin"
                            });

                        const text = (await res.text()).trim();

                        const map = {
                                message_sent: "Message sent successfully.",
                                missing_data: "Please fill all required fields.",
                                invalid_email: "Invalid email format.",
                                invalid_phone: "Phone must be 10-15 digits.",
                                message_too_long: "Message cannot exceed 500 characters.",
                                captcha_not_verified: "Captcha not verified. Try again.",
                                csrf_invalid: "Session expired. Refresh and try again.",
                                query_error: "Server query failed. Try again.",
                                message_error: "Failed to send message. Try again."
                            };

                        showToast(map[text] || `Request failed: ${text}`);

                        if (text === "message_sent")
                            {
                                contactForm.reset();
                                grecaptcha.reset();
                            }
                    }
                catch(err)
                    {
                        console.error(err);
                        grecaptcha.reset();
                        showToast("Something went wrong. Please try again.");
                    }
            });
    }




