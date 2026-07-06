<?php


require_once "otp.php";
require_once "mails.php";

if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }

require_once "config.php";

require_once "common_functions.php";


$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if($conn->connect_error)
    {
        error_log("Database connection failed: " . $conn->connect_error);
        http_response_code(500);
        exit("server_error");
    }



// Changing Password for Donor (Loged in Donor or Admin)
if(isset($_POST['action']) && $_POST['action'] === "change_password")
    {
        requireCsrfToken();

        $role = $_POST['role'];

        if($role === "donor")
            {
                if(!isset($_SESSION['donor_id']))
                    {
                        echo "unauthorized";
                        exit();
                    }
                
                $user_id = $_SESSION['donor_id'];
                $table = "donors";
                $password_column = "password";
                $id_column = "id";

            }

        elseif($role === "admin")
            {
                if(!isset($_SESSION['admin_id']))
                    {
                        echo "unauthorized";
                        exit();
                    }
                
                $user_id = $_SESSION['admin_id'];
                $table = "admins";
                $password_column = "admin_password";
                $id_column = "id";

            }
            else
                {
                    echo "invalid_role";
                    exit();
                }

        if(!isset($_POST['current_password'], $_POST['new_password']))
            {
                echo "missing_data";
                exit();
            }
        $current_password = trim($_POST['current_password']);
        $new_password = trim($_POST['new_password']);

        if($current_password === "" || $new_password === "")
            {
                echo "missing_data";
                exit();
            }

        if(strlen($new_password) < 6)
            {
                echo "weak_password";
                exit();
            }    

        $stmt = $conn->prepare(
            "SELECT $password_column FROM $table WHERE $id_column = ?"
            );

        $stmt->bind_param("i", $user_id);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result->fetch_assoc();

        if(!$user)
            {
                echo "user_not_found";
                exit();
            }

        if(!password_verify($current_password, $user[$password_column]))
            {
                echo "wrong_current_password";
                exit();
            }

        if(password_verify($new_password, $user[$password_column]))
            {
                echo "same_password";
                exit();
            }

        $new_hash = password_hash($new_password, PASSWORD_DEFAULT);

        // password update
        $stmt = $conn->prepare("UPDATE $table SET $password_column = ? WHERE $id_column = ?");
        $stmt->bind_param("si", $new_hash, $user_id);
        $stmt->execute();

        // fetch email for security alert
        if($role === "donor")
            {
                $email_stmt = $conn->prepare("SELECT email FROM donors WHERE id = ?");
            }
        else
            {
                $email_stmt = $conn->prepare("SELECT admin_email AS email FROM admins WHERE id = ?");
            }

        if($email_stmt)
            {
                $email_stmt->bind_param("i", $user_id);
                $email_stmt->execute();
                $email_result = $email_stmt->get_result();
                $email_row = $email_result->fetch_assoc();

                if(!empty($email_row['email']))
                    {
                        sendSecurityAlertPasswordReset($email_row['email'], $role);
                    }
            }


        echo "password_changed";

    }




                            // ---------------------------------------------------------------------------




// Changing Password for Donor and Admin (FORGET PASSWORD)
// sending Reset OTP
if(isset($_POST['action']) && $_POST['action'] === "send_reset_otp")
    {
        requireCsrfToken();

        $role = $_POST['role'] ?? '';
        $identifier = trim($_POST['identifier'] ?? '');

        if($role === "" || $identifier === "")
            {
                echo "missing_data";
                exit();
            }

        // Decision for Table (Donor or Admin)
        if($role === "donor")
            {
                $table = "donors";
                $email_column = "email";
                $phone_column = "phone";
            }
        elseif($role === "admin")
            {
                $table = "admins";
                $email_column = "admin_email";
                $phone_column = "admin_phone";
            }
        else
            {
                echo "invalid_role";
                exit();
            }

        $stmt = $conn->prepare("SELECT $email_column FROM $table WHERE $email_column = ? OR $phone_column = ?");

        $stmt->bind_param("ss", $identifier, $identifier);
        $stmt->execute();

        $result = $stmt->get_result();

        if($result->num_rows === 0)
            {
                echo "user_not_found";
                exit();
            }

        $user = $result->fetch_assoc();
        $email = $user[$email_column];

        $_SESSION['reset_email'] = $email;
        $_SESSION['reset_role'] = $role;

        echo processOTP($email,"reset_otp");

    }



                            // ---------------------------------------------------------------------------



if(isset($_POST['action']) && $_POST['action'] === "verify_reset_otp")
    {
        requireCsrfToken();


        $user_otp = trim($_POST['otp'] ?? '');
        if($user_otp === "")
            {
                echo "missing_otp";
                exit();
            }
        if(!preg_match('/^\d{6}$/', $user_otp))
            {
                echo "invalid_otp_format";
                exit();
            }

        $result = verifyOTP($user_otp,"reset_otp");

        if($result === "otp_verified")
            {
                $_SESSION['otp_verified'] = true;
            }

        echo $result;
    }


                        // ---------------------------------------------------------------------------




// Reset the Password after OTP
if(isset($_POST['action']) && $_POST['action'] === "reset_password")
    {   

        requireCsrfToken();

        if(!isset($_SESSION['reset_email']))
            {
                echo "unauthorized";
                exit();
            }

        if(!isset($_SESSION['otp_verified']))
            {
                echo "otp_not_verified";
                exit();
            }

        $role = $_SESSION['reset_role'];
        $email = $_SESSION['reset_email'];

        $new_password = trim($_POST['password'] ?? '');

        if($new_password === "")
            {
                echo "missing_data";
                exit();
            }

        if(strlen($new_password) < 6)
            {
                echo "weak_password";
                exit();
            }

        $new_hash = password_hash($new_password, PASSWORD_DEFAULT);

        // Table dicision
        if($role === "donor")
            {
                $table = "donors";
                $email_column = "email";
                $password_column = "password";
            }
        elseif($role === "admin")
            {
                $table = "admins";
                $email_column = "admin_email";
                $password_column = "admin_password";
            }
        else
            {
                echo "invalid_role";
                exit();
            }

        $stmt = $conn->prepare("SELECT $password_column FROM $table WHERE $email_column = ?");
        $stmt->bind_param("s", $email);
        $stmt->execute();

        $result = $stmt->get_result();
        $user = $result->fetch_assoc();

        if(password_verify($new_password, $user[$password_column]))
            {
                echo "same_password";
                exit();
            }

        $stmt = $conn->prepare("UPDATE $table SET $password_column = ? WHERE $email_column =?");

        $stmt->bind_param("ss",$new_hash, $email);
        $stmt->execute();

        sendSecurityAlertPasswordReset($email, $role);


        unset($_SESSION['reset_email']);
        unset($_SESSION['reset_role']);
        unset($_SESSION['otp_verified']);
        
        echo "password_reset_success";

    }

$conn->close();
?>