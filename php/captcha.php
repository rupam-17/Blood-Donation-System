<?php

if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }

require_once "common_functions.php";
require_once "config.php";
requireCsrfToken();


$captchaResponse = $_POST['g-recaptcha-response']??'';

if(empty($captchaResponse))
{
    echo "captcha_failed";
    return;    
}

$purpose = $_POST['purpose'] ?? '';
$allowed = ["donor_register", "blood_request", "contact_us", "login", "forgot_password"];
if(!in_array($purpose, $allowed, true))
    {
        echo "invalid_purpose"; exit();
    }



$query = http_build_query([
        'secret' => RECAPTCHA_SECRET_KEY,
        'response' => $captchaResponse
    ]);

$verify = file_get_contents("https://www.google.com/recaptcha/api/siteverify?$query");

if ($verify === false) {
    echo "captcha_verify_error";
    exit();
}


$response = json_decode($verify);


if($response && $response->success)
{
    echo "captcha_success \n";
    $_SESSION['captcha_ok'][$purpose] = time();

    // include "otp.php";
}else{
    echo "captcha_failed \n";
}

?>