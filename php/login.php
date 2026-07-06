<?php

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





if(isset($_POST['action']))
    {
        switch($_POST['action'])
            {
                // Donor Login
                case "donor_login":
                    { 
                        requireCsrfToken();

                        $identifier = trim($_POST['identifier'] ?? ''); // [either email or phone no]
                        $password = trim($_POST['password'] ?? '');    


                        if(empty($identifier) || empty($password))
                            {
                                echo "missing_data";
                                exit();
                            }

                        // Finding the Donor in DB through email or phone no
                        $stmt = $conn->prepare(
                                "SELECT id, password FROM donors WHERE email = ? or phone = ?"
                            );

                        $stmt->bind_param("ss", $identifier, $identifier);
                        $stmt->execute();

                        $result = $stmt->get_result();

                        if($result->num_rows === 0)
                            {
                                echo "user_not_found";
                                exit();
                            }

                        $user = $result->fetch_assoc();


                        // Password Verification
                        if(!password_verify($password, $user['password']))
                            {
                                echo "wrong_password";
                                exit();
                            }


                            // Update Last Login 
                        $update = $conn->prepare(
                            "UPDATE donors SET last_login = NOW() where id = ?"
                            );

                        $update->bind_param("i", $user['id']);
                        $update->execute();

                        session_regenerate_id(true);

                        // Create the Session
                        $_SESSION['donor_id'] = $user['id'];

                        $_SESSION['user_id'] = $user['id'];
                        $_SESSION['role'] = 'user';

                        echo "donor_login_success";
                        // Donor Login Done

                    }

                break;



                // ADMIN Login
                case "admin_login":
                    {
                        requireCsrfToken();


                        $identifier = trim($_POST['identifier'] ?? ''); //Either email or Phone no
                        $password = trim($_POST['password'] ?? '');

                        if(empty($identifier) || empty($password))
                            {
                                echo "missing_data";
                                exit();
                            }


                        // Finding the admin through email or phone no
                        $stmt = $conn->prepare(
                                "SELECT id, admin_name, admin_password, status from admins where admin_email = ? or admin_phone = ?"

                            );

                        $stmt->bind_param("ss", $identifier, $identifier);
                        $stmt->execute();
                        $result = $stmt->get_result();

                        if($result->num_rows === 0)
                            {
                                echo "admin_not_found";
                                exit();
                            }
                        $admin = $result->fetch_assoc();

                        // Cheking the Admin is active
                        if($admin['status'] !== "active")
                            {
                                echo "admin_inactive";
                                exit();
                            } 

                        // password verification
                        if(!password_verify($password, $admin['admin_password']))
                            {
                                echo "wrong_password";
                                exit();
                            }

                        // last login updation
                        $update = $conn->prepare(
                            "UPDATE admins SET last_login = NOW() where id = ?"
                            );
                        
                        $update->bind_param("i", $admin['id']);
                        $update->execute();

                        session_regenerate_id(true);


                        // Session creation
                        $_SESSION['admin_id'] = $admin['id'];
                        $_SESSION['admin_name'] = $admin['admin_name'];


                        $_SESSION['user_id'] = $admin['id'];
                        $_SESSION['role'] = 'admin';

                        // login success
                        echo "admin_login_success";

                    }
                
                break;




                default:
                    {
                        echo "invalid_action";
                    }

                break;
            }
    }

$conn->close();

?>