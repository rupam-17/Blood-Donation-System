<?php


// DATABASE_CONFIG
define("DB_HOST","localhost");
define("DB_USER","root");
define("DB_PASS","Yours_DB_PASSWORD");
define("DB_NAME","blood_donation_database");

// EMAIL_CONFIG
define("MAIL_USERNAME","YPURS_EMAIL@gmail.com");
define("MAIL_PASSWORD","YOUR_GMAIL_APP_PASSWORD");

define("RECAPTCHA_SECRET_KEY", "YOUR_RECAPCHA_SECRET_KEY");


define("BASE_URL","/");

define("ADMIN_UPLOAD_DIR", __DIR__ . "/../uploads/admins/");
define("DONOR_UPLOAD_DIR", __DIR__ . "/../uploads/donors/");

define("ADMIN_UPLOAD_URL", BASE_URL . "uploads/admins/");
define("DONOR_UPLOAD_URL", BASE_URL . "uploads/donors/");


?>