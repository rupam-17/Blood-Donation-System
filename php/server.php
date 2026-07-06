<?php

if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }

require_once "common_functions.php";
require_once "config.php";
require_once "mails.php";


$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error)
{
    error_log("Database connection failed: " . $conn->connect_error);
    http_response_code(500);
    exit("server_error");
}




                                            //   F  U  N  C  T  I  O  N             S  T  A  R  T



                                // -----------------------------------------------------------------------



                                

function toggleAvailability($conn, $donor_id, $availability)
    {
        if(!in_array($availability, ["available", "unavailable"], true))
            {
                return "invalid_availability";
            }

        // Get Donor Info
        $stmt = $conn->prepare("SELECT next_eligible_date, availability, name FROM donors WHERE id = ?");

        if(!$stmt)
            {
                return "query_error";
            }
        
        $stmt->bind_param("i", $donor_id);
        $stmt->execute();

        $result = $stmt->get_result();
        $donor = $result->fetch_assoc();

        if(!$donor)
            {
                return "donor_not_found";
            }
        
        // Checking for Donation Restriction
        if($availability === "available")
            {
                if(!empty($donor['next_eligible_date']))
                    {
                        $today = new DateTime();
                        $eligible = new DateTime($donor['next_eligible_date']);

                        if($today < $eligible)
                            {
                                return "not_eligible_yet";
                            }
                    }
            }

        // Update the Availability
        $stmt = $conn->prepare("UPDATE donors SET availability = ? WHERE id = ?");

        if(!$stmt)
            {
                return "update_error";
            }

        $stmt->bind_param("si", $availability, $donor_id);

        if($stmt->execute())
            {
                logActivity($conn, "Donor: " . $donor['name'], "Changed_availability");
                return "availability_updated";
            }


        return "update_failed";
    }                                

                            


                                // -----------------------------------------------------------------------
/*

                                                              F  U  N  C  T  I  O  N

                                                                    E  N  D

*/
                                // -----------------------------------------------------------------------

/*

                                                D  O  N  O  R                           A  C  T  I  O  N

                                                                    S  T  A  R  T

*/
                                // -----------------------------------------------------------------------



if(isset($_POST['action']))
    {
        


        switch($_POST['action'])
            {
                //For new Donor through js
                case "new_donor":

                    {
                        requireCsrfToken();

                        $name = $_POST['name'] ?? null;
                        $blood_group = $_POST['blood_group'] ?? null;
                        $phone = $_POST['phone'] ?? null;
                        $email = $_POST['email'] ?? null;
                        $city = $_POST['city'] ?? null;

                        $latitude = isset($_POST['latitude']) && $_POST['latitude'] !== '' ? (float)$_POST['latitude'] : null;
                        $longitude = isset($_POST['longitude']) && $_POST['longitude'] !== '' ? (float)$_POST['longitude'] : null;


                        $date_of_birth = $_POST['date_of_birth'] ?? null;

                        if(!isset($_SESSION['donor_otp_verified']) || $_SESSION['donor_otp_verified'] !== true)
                            {
                                echo "otp_not_verified";
                                exit();
                            }

                        if(!isset($_SESSION['donor_otp_email']) || strcasecmp(trim($_SESSION['donor_otp_email']), trim($email)) !== 0)
                            {
                                echo "otp_email_mismatch";
                                exit();
                            }

                                        
                        // checking empty fields
                        if(empty($name) || empty($blood_group) || empty($phone) || empty($email) || empty($city) || empty($date_of_birth) || 
                                    empty($_POST['password']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        if(!isValidEmail($email))
                            {
                                echo "invalid_email";
                                exit();
                            }

                        if(!isValidPhone($phone))
                            {
                                echo "invalid_phone";
                                exit();
                            }

                        if(!isValidBloodGroup($blood_group))
                            {
                                echo "invalid_blood_group";
                                exit();
                            }


                        // AGE ValidaTION
                        $dob = new DateTime($date_of_birth);
                        $today = new DateTime();
                        $age = $today->diff($dob)->y;

                        if($age < 18 || $age > 60)
                            {
                                echo "invalid_age";
                                exit();
                            }    

                        $password_raw = $_POST['password'] ?? null;
                        $password = password_hash($password_raw, PASSWORD_DEFAULT);

                        $photo_name = NULL;

                        if(isset($_FILES['photo']) && $_FILES['photo']['error'] == 0)
                            {
                                $tmp_name = $_FILES['photo']['tmp_name'];
                                $upload_dir = DONOR_UPLOAD_DIR;

                                if(!is_dir($upload_dir))
                                {
                                    mkdir($upload_dir,0777,true);
                                }

                                $file_size = $_FILES['photo']['size'];

                                if($file_size > 3000000)
                                {
                                echo "file_too_large";
                                exit();
                                }

                                // file type checking
                                $allowed_types = ['jpg','jpeg','png'];
                                $file_extension = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));


                                if(!in_array($file_extension, $allowed_types))
                                {
                                    echo "invalid_file_type";
                                    exit();
                                }

                                $image_check = getimagesize($tmp_name);
                                if($image_check === false)
                                {
                                    echo "invalid_image";
                                    exit();
                                }

                                $photo_name = uniqid() . "." . $file_extension;
                                $upload_path  = $upload_dir . $photo_name;
                                
                                if(!move_uploaded_file($tmp_name, $upload_path))
                                {
                                    echo "upload_failed";
                                    exit();
                                }

                            }
                            

                        $last_donation_date = NULL;
                        $next_eligible_date = NULL;

                        if(!isset($_SESSION['captcha_ok']['donor_register']) ||
                                   (time() - $_SESSION['captcha_ok']['donor_register']) > 300)
                                     
                            {
                                echo "captcha_not_verified";
                                exit();
                            }
                        unset($_SESSION['captcha_ok']['donor_register']);

                        
                        // creting the danor(data)
                        $result = createDonor($conn, $name, $blood_group, $phone, $email, $city,
                                                $latitude, $longitude,
                                                $date_of_birth,
                                                $last_donation_date,
                                                $next_eligible_date,
                                                $password, $photo_name
                                            );

                        if($result)
                            {
                                unset(
                                        $_SESSION['donor_otp_verified'],
                                        $_SESSION['donor_otp_email'],
                                        $_SESSION['donor_otp'],
                                        $_SESSION['donor_otp_time'],
                                        $_SESSION['donor_otp_attempts'],
                                        $_SESSION['donor_otp_last_request']
                                    );
                                sendWelcomeEmail($email, $name, $blood_group, $city, $phone);

                                echo "donor_created";
                            }
                        else
                            {
                                echo "donor_error";
                            }
                    }

                break;




                                        // -----------------------------------------------------------------------
        




                // FOR DONOR details in own profile
                case "get_donor_profile":
                    {
                        if(!isset($_SESSION['donor_id']))
                        {
                            echo "not_logged_in";
                            exit();
                        }

                        $donor_id = $_SESSION['donor_id'];

                        $donor = getDonorProfile($conn, $donor_id);

                        if($donor)
                        {
                            echo json_encode($donor);
                        }
                        else
                        {
                            echo "donor_not_found";
                        }
                    }

                break;

                                        // -----------------------------------------------------------------------

            
                                        
                case "search_donors":                    
                    {
                        $filters = [
                            "search_name" => $_POST['searched_name'] ?? null,
                            "city" => $_POST['city'] ?? null,
                            "blood_group" => $_POST['blood_group'] ?? null,
                            "compatible_blood" => $_POST['compatible_blood'] ?? null,
                            "availability" => $_POST['availability'] ?? null,
                            "min_age" => $_POST['min_age'] ?? null,
                            "max_age" => $_POST['max_age'] ?? null,
                            "eligible_only" => $_POST['eligible_only'] ?? null,
                            "sort_by" => $_POST['sort_by'] ?? null,
                            "order" => $_POST['order'] ?? null,
                            "admin_lat" => $_POST['admin_lat'] ?? null,
                            "admin_lng" => $_POST['admin_lng'] ?? null,
                            "nearest" => $_POST['nearest'] ?? null

                            ];

                        $donors = getDonors($conn, $filters, true);

                        echo json_encode($donors);    
                    

                    }

                break;



                                        // -----------------------------------------------------------------------    

                                        
                
                                        
                case "update_donor_profile":
                    {
                        requireCsrfToken();

                        if(!isset($_SESSION['user_id']))
                            {
                                echo "unauthorized";
                                exit();
                            }


                        if(!isset($_SESSION['donor_id']))
                            {
                                echo "not_logged_in";
                                exit();
                            }
                        $donor_id = $_SESSION['donor_id'];

                        $name = $_POST['name'] ?? null;
                        $phone = $_POST['phone'] ?? null;
                        $email = $_POST['email'] ?? null;
                        $city = $_POST['city'] ?? null;

                        if (!empty($email) && !isValidEmail($email)) { echo "invalid_email"; exit(); }
                        if (!empty($phone) && !isValidPhone($phone)) { echo "invalid_phone"; exit(); }


                        $result = updateDonorProfile($conn, $donor_id, $name, $phone, $email, $city, null, null, "donor");

                        if($result === true)
                            {
                                echo "profile_updated";
                            }
                            else
                            {
                                echo $result;
                            }

                    }

                break;


                                        // ----------------------------------------------------------------------- 



            
                case "toggle_availability":
                    {
                        requireCsrfToken();

                        if(!isset($_SESSION['user_id']))
                            {
                                echo "unauthorized";
                                exit();
                            }

                        
                        if(!isset($_SESSION['donor_id']))
                            {
                                echo "not_logged_in";
                                exit();
                            }
                        
                        if(empty($_POST['availability']))
                            {
                                echo "missing_data";
                                exit();
                            }
                        
                        $donor_id = $_SESSION['donor_id'];
                        $availability = $_POST['availability'] ?? null;

                        $result = toggleAvailability($conn, $donor_id, $availability);

                        echo $result;

                    }

                break;



                                        // -----------------------------------------------------------------------


                                        
                                        
                case "donor_history":
                    {
                        if(!isset($_SESSION['user_id']))
                            {
                                echo "unauthorized";
                                exit();
                            }

                            
                        if(!isset($_SESSION['donor_id']))
                            {
                                echo "not_logged_in";
                                exit();
                            }
                        
                        $donor_id = $_SESSION['donor_id'];

                        $history = getDonorHistory($conn, $donor_id);

                        if($history)
                            {
                                echo json_encode($history);
                            }
                            else
                            {
                                echo "donor_not_found";
                            }

                    }

                break;

                

                                        // ----------------------------------------------------------------------- 

                                        

                case "get_top_donors":
                    {
                        $top = getTopDonors($conn);

                        echo json_encode($top);
                    }     
                    
                break;
                                            
                                        // -----------------------------------------------------------------------
                                                // B L O O D                   R E Q            Cases
                                        // -----------------------------------------------------------------------


                case "create_blood_request":
                    {
                        requireCsrfToken();

                        $requester_name  = $_POST['requester_name'] ?? null;
                        $requester_phone = $_POST['requester_phone'] ?? null;
                        $requester_email = $_POST['requester_email'] ?? null;
                        $blood_group     = $_POST['blood_group'] ?? null;
                        $units_needed    = $_POST['units_needed'] ?? 1;
                        $city            = $_POST['city'] ?? null;
                        $hospital_name   = $_POST['hospital_name'] ?? null;
                        $urgency         = $_POST['urgency'] ?? "normal";
                        $notes           = $_POST['notes'] ?? null;

                        if(empty($requester_name) || empty($requester_phone) || empty($blood_group) || empty($city))
                            {
                                echo "missing_data";
                                exit();
                            }

                        // CAPTCHA from captcha.php session
                        if(!isset($_SESSION['captcha_ok']['blood_request']) ||
                            (time() - $_SESSION['captcha_ok']['blood_request']) > 300)
                            {
                                echo "captcha_not_verified";
                                exit();
                            }

                                               
                        unset($_SESSION['captcha_ok']['blood_request']);


                        $result = createBloodRequest(
                                $conn,
                                $requester_name,
                                $requester_phone,
                                $requester_email,
                                $blood_group,
                                $units_needed,
                                $city,
                                $hospital_name,
                                $urgency,
                                $notes
                            );

                        echo $result;
                    }
                break;



                                        // -----------------------------------------------------------------------
                case "get_blood_requests":
                    {
                        $filters = [
                                "status" => $_POST['status'] ?? null,
                                "blood_group" => $_POST['blood_group'] ?? null,
                                "city" => $_POST['city'] ?? null,
                                "urgency" => $_POST['urgency'] ?? null,
                                "sort_by" => $_POST['sort_by'] ?? null,
                                "order" => $_POST['order'] ?? null,
                            ];

                        $requests = getBloodRequests($conn, $filters);
                        echo json_encode($requests);
                    }
                break;





                                        // -----------------------------------------------------------------------


                case "get_my_blood_requests":
                    {
                        $identifier = trim($_POST['identifier'] ?? '');

                        if (empty($identifier))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $stmt = $conn->prepare(
                                "SELECT id,requester_name, blood_group, units_needed, city, hospital_name,
                                urgency, status, notes, created_at, updated_at
                                FROM blood_requests
                                WHERE requester_email = ? OR requester_phone = ?
                                ORDER BY created_at DESC"
                            );

                        if (!$stmt)
                            {
                                echo "query_error"; exit(); 
                            }

                        $stmt->bind_param("ss", $identifier, $identifier);
                        $stmt->execute();

                        $result = $stmt->get_result();

                        if ($result->num_rows === 0)
                            {
                                echo "no_requests_found";
                                exit();
                            }

                        $requests = [];
                        while ($row = $result->fetch_assoc())
                            {
                                $requests[] = $row;
                            }

                        echo json_encode($requests);
                    }
                break;




                                        // -----------------------------------------------------------------------


                                
                // Requester marks their own blood request as fulfilled
                case "fulfill_blood_request":
                    {
                        requireCsrfToken();
                        
                        $request_id = (int)($_POST['request_id'] ?? 0);
                        $identifier = trim($_POST['identifier'] ?? ''); // phone or email

                        if (empty($request_id) || empty($identifier))
                            {
                                echo "missing_data";
                                exit();
                            }

                        // Verify the request belongs to this requester
                        $stmt = $conn->prepare(
                                "SELECT id, status FROM blood_requests
                                WHERE id = ?
                                AND (requester_email = ? OR requester_phone = ?)"
                            );

                        if (!$stmt)
                            {
                                echo "query_error";
                                exit();
                            }

                        $stmt->bind_param("iss", $request_id, $identifier, $identifier);
                        $stmt->execute();

                        $result = $stmt->get_result();
                        $request = $result->fetch_assoc();

                        if(!$request)
                            {
                                echo "request_not_found";
                                exit();
                            }

                        // Can only fulfill if status is pending or matched
                        if (!in_array($request['status'], ["pending", "matched"], true)) {
                            echo "cannot_fulfill";
                            exit();
                        }

                        // Mark as fulfilled
                        $stmt = $conn->prepare(
                                "UPDATE blood_requests SET status = 'fulfilled' WHERE id = ?"
                            );

                        if(!$stmt)
                            {
                                echo "update_error";
                                exit();
                            }

                        $stmt->bind_param("i", $request_id);

                        if($stmt->execute())
                            {
                                echo "request_fulfilled";
                            }
                        else
                            {
                                echo "fulfill_failed";
                            }
                    }
                break;



                                        // -----------------------------------------------------------------------

                case "submit_contact_message":
                    {
                        requireCsrfToken();

                        $name    = $_POST['name'] ?? '';
                        $email   = $_POST['email'] ?? '';
                        $phone   = $_POST['phone'] ?? '';
                        $message = $_POST['message'] ?? '';

                        if(!isset($_SESSION['captcha_ok']['contact_us']) ||
                        (time() - $_SESSION['captcha_ok']['contact_us']) > 300)
                        {
                            echo "captcha_not_verified";
                            exit();
                        }
                        unset($_SESSION['captcha_ok']['contact_us']);

                        echo createContactMessage($conn, $name, $email, $phone, $message);
                    }
                break;
                        









                                        // -----------------------------------------------------------------------
                          
                                        


                case "send_otp":
                    {
                        require_once "otp.php";
                        requireCsrfToken();

                        if(!isset($_POST['email']) || trim($_POST['email']) === ""){
                            echo "missing_email";
                            break;
                        }

                        $email = trim($_POST['email']);

                        if(!filter_var($email, FILTER_VALIDATE_EMAIL)){
                            echo "invalid_email";
                            break;
                        }

                        $result = processOTP($email, "donor_otp");

                        if($result === "otp_sent"){
                            $_SESSION['donor_otp_email'] = $email;
                            unset($_SESSION['donor_otp_verified']);
                        }

                        echo $result;
                    }

                break;
                                        


                                        // -----------------------------------------------------------------------



                case "verify_otp":
                    {
                        require_once "otp.php";

                        if(!isset($_POST['otp']) || trim($_POST['otp']) === ""){
                            echo "missing_otp";
                            break;
                        }

                        $otp = trim($_POST['otp']);

                        $result = verifyOTP($otp, "donor_otp");

                        if($result === "otp_verified"){
                            $_SESSION['donor_otp_verified'] = true;
                        }

                        echo $result;
                    }
                    
                break;





                

                                        // -----------------------------------------------------------------------



                case "cancel_blood_request":
                    {
                        requireCsrfToken();

                        $request_id = (int)($_POST['request_id'] ?? 0);
                        $identifier = trim($_POST['identifier'] ?? ''); // requester email or phone

                        if (empty($request_id) || empty($identifier)) {
                            echo "missing_data";
                            exit();
                        }

                        // Check request belongs to this requester
                        $stmt = $conn->prepare(
                            "SELECT id, status
                            FROM blood_requests
                            WHERE id = ?
                            AND (requester_email = ? OR requester_phone = ?)"
                        );

                        if (!$stmt) {
                            echo "query_error";
                            exit();
                        }

                        $stmt->bind_param("iss", $request_id, $identifier, $identifier);
                        $stmt->execute();

                        $result = $stmt->get_result();
                        $request = $result->fetch_assoc();

                        if (!$request) {
                            echo "request_not_found";
                            exit();
                        }

                        // Only pending/matched can be cancelled
                        if (!in_array($request['status'], ["pending", "matched"], true)) {
                            echo "cannot_cancel";
                            exit();
                        }

                        // Cancel it
                        $stmt = $conn->prepare(
                            "UPDATE blood_requests
                            SET status = 'cancelled'
                            WHERE id = ?"
                        );

                        if (!$stmt) {
                            echo "update_error";
                            exit();
                        }

                        $stmt->bind_param("i", $request_id);

                        if ($stmt->execute()) {
                            echo "request_cancelled";
                        } else {
                            echo "cancel_failed";
                        }
                    }
                break;
    



                                        // -----------------------------------------------------------------------



                                        
                case "get_my_donation_records":
                    {
                        if (!isset($_SESSION['user_id']) || !isset($_SESSION['donor_id'])) {
                            echo "unauthorized";
                            exit();
                        }

                        $donor_id = (int)$_SESSION['donor_id'];
                        $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 50;

                        $records = getDonationRecords($conn, $donor_id, $limit);
                        echo json_encode($records);
                    }
                break;





                                        // -----------------------------------------------------------------------






                                        // -----------------------------------------------------------------------

                default:
                    {
                        echo "invalid_action";
                    }
                break;


            }
                                                                    

    }




$conn->close();
?>
