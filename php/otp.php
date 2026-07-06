<?php

if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . "/../src/PHPMailer.php";
require_once __DIR__ . "/../src/SMTP.php";
require_once __DIR__ . "/../src/Exception.php";

require_once __DIR__ . "/common_functions.php";



//otp generation
function generateOTP()
    {
        return random_int(100000,999999);
    }

function sendOTP($email,$otp)
    {
        $mail = new PHPMailer(true);

        try
        {
            $mail->isSMTP();
            $mail->Host = "smtp.gmail.com";
            $mail->SMTPAuth = true;
            
            require_once __DIR__ . "/config.php";
            // the otp sender mail
            $mail->Username = MAIL_USERNAME;
            
            // gmail app password
            $mail->Password = MAIL_PASSWORD;
            
            $mail->SMTPSecure = "tls";
            $mail->Port = 587;

            // the email sender
            $mail->setFrom("donation.blood.system@gmail.com", "Blood Donation System");

            // the receiver
            $mail->addAddress($email);

            // the email
            $mail->Subject = "OTP Verification";
            $mail->Body = "Your OTP is: " . $otp;

            // mail send
            $mail->send();
            
            return true;
            
        }
        catch(Exception $e)
        {
            error_log("OTP mail failed: " . $e->getMessage());
            return false;
        }

    }




// opt verification

function verifyOTP($user_otp, $session_key)
    {
        $time_key = $session_key . "_time";

        $attempt_key = $session_key . "_attempts";
        $max_attempts = 7;

        if (!isset($_SESSION[$session_key]) || !isset($_SESSION[$time_key]))
            {
                return "otp_expired";
            }

        // OTP Checking
        
        if(time() - $_SESSION[$time_key] > 600)
            {
                unset($_SESSION[$session_key], $_SESSION[$time_key], $_SESSION[$attempt_key]);
                return "otp_expired";
            }

        if (!isset($_SESSION[$attempt_key]))
            {
                $_SESSION[$attempt_key] = 0;
            }


        // Lock after to many attempts
        if ($_SESSION[$attempt_key] >= $max_attempts)
            {
                unset($_SESSION[$session_key], $_SESSION[$time_key], $_SESSION[$attempt_key]);
                return "too_many_attempts";
            }

        // FOR SUCCESSFUL OTP VERIFICATION
        if ((string)$user_otp === (string)$_SESSION[$session_key])
            {
                unset($_SESSION[$session_key], $_SESSION[$time_key], $_SESSION[$attempt_key]);
                return "otp_verified";            
            }

        // Wrong OTP
        $_SESSION[$attempt_key]++;
        return "invalid_otp";
         
    }
    
    
    



function processOTP($email, $session_key)
    {
        if(isset($_SESSION[$session_key."_last_request"]))
        {
            if(time() - $_SESSION[$session_key."_last_request"] <60)
            {
                return "wait_before_retry";
            }
        }

        $otp = generateOTP();

        if(sendOTP($email, $otp))
        {
            $_SESSION[$session_key] = $otp;

            $_SESSION[$session_key."_time"] = time();
            $_SESSION[$session_key."_last_request"] = time();
            $_SESSION[$session_key . "_attempts"] = 0;
            return "otp_sent";
        }
        else
        {
            return "otp_failed";
        }
    }




    
// if(isset($_POST['action']) && $_POST['action'] === "send_otp")
//     {
//         requireCsrfToken();

//         if(!isset($_POST['email']) || trim($_POST['email']) === "")
//             {   
//                 echo "missing_email";
//                 exit();
//             }

//         $email = trim($_POST['email']);

//         if(!filter_var($email, FILTER_VALIDATE_EMAIL))
//             {   
//                 echo "invalid_email";
//                 exit();
//             }

//         $result = processOTP($email,"donor_otp");
          
//         if($result === "otp_sent")
//             {
//                 $_SESSION['donor_otp_email'] = $email;
//                 unset($_SESSION['donor_otp_verified']);
                
//             }
        
//         echo $result;
//         exit();
        
//     }



// if(isset($_POST['action']) && $_POST['action'] === "verify_otp")
//     {
//         requireCsrfToken();
        
//         if(!isset($_POST['otp']) || trim($_POST['otp']) === "")
//             {
//                 echo "missing_otp";
//                 exit();
//             }
//         $user_otp = trim($_POST['otp']);

//         if(!preg_match('/^\d{6}$/', $user_otp))
//             {
//                 echo "invalid_otp_format";
//                 exit();
//             }
        
//         $result = verifyOTP($user_otp, "donor_otp");

//         if ($result === "otp_verified")
//             {
//                 $_SESSION['donor_otp_verified'] = true;
//             }

//         echo $result;
//         exit();
        
//     }

?>
