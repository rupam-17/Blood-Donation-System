<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . "/../src/PHPMailer.php";
require_once __DIR__ . "/../src/SMTP.php";
require_once __DIR__ . "/../src/Exception.php";



function sendDonationThankYouEmail($email, $name, $donation_date, $next_eligible_date, $total_donations)
    {
        if(empty($email))
            {
                return false;
            }

        $mail = new PHPMailer(true);

        try
            {
                $mail->isSMTP();
                $mail->Host       = "smtp.gmail.com";
                $mail->SMTPAuth   = true;
                $mail->Username   = MAIL_USERNAME;
                $mail->Password   = MAIL_PASSWORD;
                $mail->SMTPSecure = "tls";
                $mail->Port       = 587;

                $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
                $mail->addAddress($email, $name);

                $mail->Subject = "Thank You for Your Blood Donation";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>Thank you for donating blood on <strong>" . htmlspecialchars($donation_date) . "</strong>.</p>
                    <p>Your generosity helps save lives.</p>
                    <table cellpadding='6' style='border-collapse:collapse;'>
                        <tr><td><strong>Total Donations:</strong></td><td>" . (int)$total_donations . "</td></tr>
                        <tr><td><strong>Next Eligible Date:</strong></td><td>" . htmlspecialchars($next_eligible_date) . "</td></tr>
                    </table>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Dear $name, thank you for donating on $donation_date. Total donations: $total_donations. Next eligible date: $next_eligible_date.";

                $mail->send();
                return true;
            }
        catch (Exception $e)
            {
                error_log("Donation thank-you email failed: " . $e->getMessage());
                return false;
            }
    }




                            // ---------------------------------------------------------------------------




function sendEligibilityReminderEmail($email, $name, $blood_group, $city, $eligible_date)
    {
        $mail = new PHPMailer(true);

        try
            {
                $mail->isSMTP();
                $mail->Host       = "smtp.gmail.com";
                $mail->SMTPAuth   = true;
                $mail->Username   = MAIL_USERNAME;
                $mail->Password   = MAIL_PASSWORD;
                $mail->SMTPSecure = "tls";
                $mail->Port       = 587;

                $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
                $mail->addAddress($email, $name);

                $friendly_date = !empty($eligible_date) ? date("d M Y", strtotime($eligible_date)) : "today";

                $mail->Subject = "You Are Eligible to Donate Again";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>You are now eligible to donate again from <strong>" . htmlspecialchars($friendly_date) . "</strong>.</p>
                    <p><strong>Blood Group:</strong> " . htmlspecialchars($blood_group) . "<br>
                    <strong>City:</strong> " . htmlspecialchars($city) . "</p>
                    <p>Your next donation can save another life.</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Dear $name, you are eligible to donate again from $friendly_date. Blood Group: $blood_group, City: $city.";

                $mail->send();
                return true;
            }
        catch (Exception $e)
            {
                error_log("Eligibility reminder email failed: " . $e->getMessage());
                return false;
            }
    }



                            // ---------------------------------------------------------------------------


                            

function sendRecallEmail($email, $name, $blood_group, $city)
    {
        if(empty($email))
            {
                return false;
            }

        $mail = new PHPMailer(true);

        try
            {
                $mail->isSMTP();
                $mail->Host       = "smtp.gmail.com";
                $mail->SMTPAuth   = true;
                $mail->Username   = MAIL_USERNAME;
                $mail->Password   = MAIL_PASSWORD;
                $mail->SMTPSecure = "tls";
                $mail->Port       = 587;

                $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
                $mail->addAddress($email, $name);

                $recall_link = BASE_URL . "login.php";

                $mail->Subject = "We Miss You - Recall to Donate Again";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>It has been a while since your last blood donation. Your support is still needed.</p>
                    <p><strong>Blood Group:</strong> " . htmlspecialchars($blood_group) . "<br>
                    <strong>City:</strong> " . htmlspecialchars($city) . "</p>
                    <p>Please return and update your availability.</p>
                    <p><a href='" . htmlspecialchars($recall_link) . "'>Recall me / Return to my donor account</a></p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Dear $name, we miss you. Please return to your donor account: $recall_link";

                $mail->send();
                return true;
            }
        catch (Exception $e)
            {
                error_log("Recall email failed: " . $e->getMessage());
                return false;
            }
    }





                        // ---------------------------------------------------------------------------


function sendSecurityAlertPasswordReset($email, $role = "user")
{
    if(empty($email))
        {
            return false;
        }

    $mail = new PHPMailer(true);

    try
        {
            $mail->isSMTP();
            $mail->Host       = "smtp.gmail.com";
            $mail->SMTPAuth   = true;
            $mail->Username   = MAIL_USERNAME;
            $mail->Password   = MAIL_PASSWORD;
            $mail->SMTPSecure = "tls";
            $mail->Port       = 587;

            $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
            $mail->addAddress($email);

            $time = date("d M Y h:i A");

            $mail->Subject = "Security Alert: Password Reset";
            $mail->isHTML(true);
            $mail->Body = "
                <p>Your account password was reset.</p>
                <p><strong>Role:</strong> " . htmlspecialchars($role) . "<br>
                <strong>Time:</strong> " . htmlspecialchars($time) . "</p>
                <p>If this was not you, secure your account immediately.</p>
                <p><em>Blood Donation System</em></p>
            ";
            $mail->AltBody = "Security alert: your password was reset on $time. If this wasn't you, secure your account immediately.";

            $mail->send();
            return true;
        }
    catch (Exception $e)
        {
            error_log("Security password reset email failed: " . $e->getMessage());
            return false;
        }
}




                        // ---------------------------------------------------------------------------







function sendSecurityAlertEmailChange($recipient_email, $name, $old_email, $new_email, $role = "user")
    {
        if(empty($recipient_email))
            {
                return false;
            }

        $mail = new PHPMailer(true);

        try
            {
                $mail->isSMTP();
                $mail->Host       = "smtp.gmail.com";
                $mail->SMTPAuth   = true;
                $mail->Username   = MAIL_USERNAME;
                $mail->Password   = MAIL_PASSWORD;
                $mail->SMTPSecure = "tls";
                $mail->Port       = 587;

                $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
                $mail->addAddress($recipient_email, $name);

                $time = date("d M Y h:i A");

                $mail->Subject = "Security Alert: Email Address Changed";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>Your account email was updated.</p>
                    <p><strong>Role:</strong> " . htmlspecialchars($role) . "<br>
                    <strong>Old Email:</strong> " . htmlspecialchars($old_email) . "<br>
                    <strong>New Email:</strong> " . htmlspecialchars($new_email) . "<br>
                    <strong>Time:</strong> " . htmlspecialchars($time) . "</p>
                    <p>If you did not make this change, contact support immediately.</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Security alert: email changed from $old_email to $new_email on $time. If this wasn't you, contact support immediately.";

                $mail->send();
                return true;
            }
        catch (Exception $e)
            {
                error_log("Security email-change alert failed: " . $e->getMessage());
                return false;
            }
    }
                        






                        // ---------------------------------------------------------------------------

                
                        

function sendAdminWelcomeEmail($email, $admin_name, $admin_phone, $admin_created_at)
    {
        if(empty($email))
            {
                return false;
            }

        $mail = new PHPMailer(true);

        try
            {
                $mail->isSMTP();
                $mail->Host       = "smtp.gmail.com";
                $mail->SMTPAuth   = true;
                $mail->Username   = MAIL_USERNAME;
                $mail->Password   = MAIL_PASSWORD;
                $mail->SMTPSecure = "tls";
                $mail->Port       = 587;

                $mail->setFrom(MAIL_USERNAME, "Blood Donation System");
                $mail->addAddress($email, $admin_name);

                $mail->Subject = "Welcome as Admin - Blood Donation System";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($admin_name) . "</strong>,</p>
                    <p>Your admin account has been created successfully.</p>
                    <table cellpadding='6' style='border-collapse:collapse;'>
                        <tr><td><strong>Name:</strong></td><td>" . htmlspecialchars($admin_name) . "</td></tr>
                        <tr><td><strong>Email:</strong></td><td>" . htmlspecialchars($email) . "</td></tr>
                        <tr><td><strong>Phone:</strong></td><td>" . htmlspecialchars($admin_phone) . "</td></tr>
                        <tr><td><strong>Created On:</strong></td><td>" . htmlspecialchars($admin_created_at) . "</td></tr>
                    </table>
                    <p>Please keep your credentials secure.</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Welcome $admin_name. Your admin account was created on $admin_created_at. Email: $email, Phone: $admin_phone.";

                $mail->send();
                return true;
            }
        catch (Exception $e)
            {
                error_log("Admin welcome email failed: " . $e->getMessage());
                return false;
            }
    }







                        // ---------------------------------------------------------------------------








                        // ---------------------------------------------------------------------------



?>