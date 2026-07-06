<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . "/../src/PHPMailer.php";
require_once __DIR__ . "/../src/SMTP.php";
require_once __DIR__ . "/../src/Exception.php";



function logActivity($conn, $actor_name, $action_type)
    {
        $stmt = $conn->prepare(
                                    "INSERT INTO activity_logs(actor_name, action_type)
                                    VALUES(?, ?)"
                                );

        if(!$stmt)
            {
                return false;
            }

        $stmt->bind_param("ss", $actor_name, $action_type);

        return $stmt->execute();
    }




                            // ---------------------------------------------------------------------------

function isValidEmail($email)
    {
        return is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL);
    }


                            // ---------------------------------------------------------------------------



function isValidPhone($phone)
    {
        // 10 to 15 digits, optional leading +
        return is_string($phone) && preg_match('/^\+?\d{10,15}$/', trim($phone));
    }


                            // ---------------------------------------------------------------------------



function isValidBloodGroup($bg)
    {
        $allowed = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
        return is_string($bg) && in_array(strtoupper(trim($bg)), $allowed, true);
    }



                            // ---------------------------------------------------------------------------



function getContactMessages($conn, $filter = "all")
    {
        $filter = strtolower(trim((string)$filter));
        $allowed = ["all", "read", "unread"];

        if (!in_array($filter, $allowed, true)) {
            $filter = "all";
        }

        $sql = "SELECT id, name, email, phone, message, created_at, is_read
                FROM contact_messages";

        if ($filter === "read") {
            $sql .= " WHERE is_read = 1";
        } elseif ($filter === "unread") {
            $sql .= " WHERE is_read = 0";
        }

        $sql .= " ORDER BY created_at DESC";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return false;
        }

        $stmt->execute();
        $result = $stmt->get_result();

        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $row['is_read'] = (int)$row['is_read'];
            $messages[] = $row;
        }

        return $messages;
    }





    

function markContactMessageRead($conn, $message_id)
    {
        $message_id = (int)$message_id;

        $check = $conn->prepare("SELECT id FROM contact_messages WHERE id = ?");
        if (!$check) {
            return "query_error";
        }

        $check->bind_param("i", $message_id);
        $check->execute();
        $exists = $check->get_result()->fetch_assoc();

        if (!$exists) {
            return "message_not_found";
        }

        $stmt = $conn->prepare("UPDATE contact_messages SET is_read = 1 WHERE id = ?");
        if (!$stmt) {
            return "query_error";
        }

        $stmt->bind_param("i", $message_id);

        if ($stmt->execute()) {
            return "message_marked_read";
        }

        return "update_failed";
    }






function deleteContactMessage($conn, $message_id)
    {
        $message_id = (int)$message_id;

        $check = $conn->prepare("SELECT id FROM contact_messages WHERE id = ?");
        if (!$check) {
            return "query_error";
        }

        $check->bind_param("i", $message_id);
        $check->execute();
        $exists = $check->get_result()->fetch_assoc();

        if (!$exists) {
            return "message_not_found";
        }

        $stmt = $conn->prepare("DELETE FROM contact_messages WHERE id = ?");
        if (!$stmt) {
            return "query_error";
        }

        $stmt->bind_param("i", $message_id);

        if ($stmt->execute()) {
            return "message_deleted";
        }

        return "delete_failed";
    }
                       


                            
                            // ---------------------------------------------------------------------------

function createContactMessage($conn, $name, $email, $phone, $message)
    {
        $name = trim((string)$name);
        $email = trim((string)$email);
        $phone = trim((string)$phone);
        $message = trim((string)$message);

        if($name === '' || $email === '' || $phone === '' || $message === '')
            {
                return "missing_data";
            }

        if(!isValidEmail($email))
            {
                return "invalid_email";
            }

        if(!isValidPhone($phone))
            {
                return "invalid_phone";
            }

        if(mb_strlen($message) > 500)
            {
                return "message_too_long";
            }

        $stmt = $conn->prepare(
                "INSERT INTO contact_messages (name, email, phone, message)
                VALUES (?, ?, ?, ?)"
            );

        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("ssss", $name, $email, $phone, $message);

        if($stmt->execute())
            {
                 logActivity($conn, "Visitor: " . $name, "submitted_contact_message");
        
                return "message_sent";
            }

        return "message_error";

    }





                            // ---------------------------------------------------------------------------




function updateDonorAvailability($conn)
    {
        $eligible_donors = [];

        $pick_sql = "SELECT id, name, email, blood_group, city, next_eligible_date FROM donors WHERE auto_unavailable = TRUE AND last_donation_date <= DATE_SUB(CURDATE(), INTERVAL 95 DAY)";

        $pick_result = $conn->query($pick_sql);
        
        if($pick_result)
            {
                while($row = $pick_result -> fetch_assoc())
                    {
                        $eligible_donors[] = $row;
                    }
            }
            
        
        // Auto-available after 95 days (90 + 5 extra days)
        $sql = "UPDATE donors SET availability = 'available', auto_unavailable = FALSE WHERE auto_unavailable = TRUE AND 
                last_donation_date <= DATE_SUB(CURDATE(), INTERVAL 95 DAY)";

        if($conn->query($sql) && !empty($eligible_donors))
            {
                foreach($eligible_donors as $donor)
                    {
                         if(!empty($donor['email']))
                            {
                                sendEligibilityReminderEmail($donor['email'], $donor['name'], $donor['blood_group'], $donor['city'], $donor['next_eligible_date']);
                            }

                    }

                   
            }
    }




                                // ---------------------------------------------------------------------------




function getDonorProfile($conn, $donor_id)
    {
        $stmt = $conn->prepare("SELECT id, name, blood_group, phone, email, city, latitude, longitude, date_of_birth,
                                last_donation_date, next_eligible_date, availability, donor_photo, total_donations
                                FROM donors WHERE id = ?");
        
        if(!$stmt)
        {
            return null;
        }

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();

        $result = $stmt->get_result();

        if($result->num_rows === 0)
        {
            return null;
        }

        $donor = $result->fetch_assoc();

        if(!empty($donor['donor_photo']))
        {
            $donor['donor_photo'] = DONOR_UPLOAD_URL . $donor['donor_photo'];
        }


        return $donor;
    }






                        // ---------------------------------------------------------------------------


function createBloodRequest($conn, $requester_name, $requester_phone, $requester_email, $blood_group,
                            $units_needed, $city, $hospital_name = null, $urgency = "normal", $notes = null)
    {
        $requester_name  = trim((string)$requester_name);
        $requester_phone = trim((string)$requester_phone);
        $requester_email = trim((string)$requester_email);
        $blood_group     = strtoupper(trim((string)$blood_group));
        $city            = trim((string)$city);
        $hospital_name   = trim((string)$hospital_name);
        $notes           = trim((string)$notes);
        $urgency         = strtolower(trim((string)$urgency));
        $units_needed    = (int)$units_needed;

        if($requester_name === "" || $requester_phone === "" || $blood_group === "" || $city === "")
            {
                return "missing_data";
            }

        if(!isValidPhone($requester_phone))
            {
                return "invalid_phone";
            }

        if($requester_email !== "" && !isValidEmail($requester_email))
            {
                return "invalid_email";
            }

        if(!isValidBloodGroup($blood_group))
            {
                return "invalid_blood_group";
            }

        if($units_needed < 1)
            {
                return "invalid_units";
            }

        if(!in_array($urgency, ["normal", "urgent", "critical"], true))
            {
                $urgency = "normal";
            }

        $requester_email = ($requester_email !== "") ? $requester_email : null;
        $hospital_name = ($hospital_name !== "") ? $hospital_name : null;
        $notes = ($notes !== "") ? $notes : null;

        $stmt = $conn->prepare(
                "INSERT INTO blood_requests
                (requester_name, requester_phone, requester_email, blood_group, units_needed, city, hospital_name, urgency, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );

        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param(
            "ssssissss",
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

        if($stmt->execute())
            {
                logActivity($conn, "Requester: " . $requester_name, "created_blood_request");
        
                return "request_created";
            }

        return "request_error";

        
    }



                        
                        // ---------------------------------------------------------------------------





//create donor function
function createDonor($conn, $name, $blood_group, $phone, $email, $city,
                        $latitude, $longitude,
                        $date_of_birth,
                        $last_donation_date, $next_eligible_date, 
                        $password, $photo
                    )
    {
        if($latitude !== null && $longitude !== null)
            {
                $stmt = $conn-> prepare("insert into donors
                                        (name, blood_group, phone, email, city, latitude, longitude,
                                        date_of_birth, last_donation_date, next_eligible_date, password, donor_photo)
                                        values(?,?,?,?,?,?,?,?,?,?,?,?)"
                                        );

                if(!$stmt)
                    {
                        return false;
                    }
        
                $stmt->bind_param("sssssddsssss",
                                    $name, $blood_group, $phone,
                                    $email, $city, $latitude, $longitude, $date_of_birth,
                                    $last_donation_date, $next_eligible_date,
                                    $password, $photo
                                );  
            }
        else
            {
                $stmt = $conn->prepare("INSERT INTO donors
                                        (name, blood_group, phone, email, city, latitude, longitude,
                                        date_of_birth, last_donation_date, next_eligible_date, password, donor_photo)
                                        VALUES(?,?,?,?,?,NULL,NULL,?,?,?,?,?)");

                if(!$stmt)
                    {
                        return false;
                    }

                $stmt->bind_param(
                                    "ssssssssss",
                                    $name,
                                    $blood_group,
                                    $phone,
                                    $email,
                                    $city,
                                    $date_of_birth,
                                    $last_donation_date,
                                    $next_eligible_date,
                                    $password,
                                    $photo
                                );
            }
        
        $result = $stmt->execute();
                
        if($result)
            {
                logActivity($conn, "Donor: " . $name, "registered");
            }

        return $result;

  
    }



                        // ---------------------------------------------------------------------------





function updateDonorProfile($conn, $donor_id, $name, $phone, $email, $city, $blood_group = null, $date_of_birth = null, $actor = "donor")
    {
        // Get current donor info
        $stmt = $conn->prepare(
            "SELECT name, phone, email, city, donor_photo, blood_group, date_of_birth
            FROM donors 
            WHERE id = ?"
            );
                                                                                    
        if(!$stmt)
            {
                return false;
            }
                                                                                    
        $stmt->bind_param("i", $donor_id);
        $stmt->execute();
                                                                                    
        $result = $stmt->get_result();
        $donor = $result->fetch_assoc();

                                                                                           
        if(!$donor)
            {
                return "donor_not_found";
            }

         $old_email = $donor['email'];
                                                                                    
        // Keep old values if new values are empty
        $name  = !empty($name)  ? $name  : $donor['name'];
        $phone = !empty($phone) ? $phone : $donor['phone'];
        $email = !empty($email) ? $email : $donor['email'];
        $city  = !empty($city)  ? $city  : $donor['city'];
        $blood_group = !empty($blood_group) ? $blood_group : $donor['blood_group'];
        $date_of_birth = !empty($date_of_birth) ? $date_of_birth : $donor['date_of_birth'];

        $email_changed = strcasecmp(trim((string)$old_email), trim((string)$email)) !== 0;

                                                                                     
        $current_photo = $donor['donor_photo'] ?? null;

        $actor_name = ($actor === "admin") ? "Admin: " . $_SESSION['admin_name'] : "Donor: " . $name;

        
                                                                                     
        // REMOVE PHOTO
        if(isset($_POST['remove_photo']) && $_POST['remove_photo'] == "1")
            {
                if(!empty($current_photo))
                    {
                        $file = DONOR_UPLOAD_DIR . $current_photo;
                                                                                    
                        if(file_exists($file))
                            {
                                unlink($file);
                            }
                    }
                                                                                    
                $stmt = $conn->prepare(
                    "UPDATE donors 
                    SET name=?, phone=?, email=?, city=?, blood_group = ?, date_of_birth = ?, donor_photo=NULL 
                    WHERE id=?"
                    );
                                                                                     
                if(!$stmt)
                    {
                        return false;
                    }
                                                                                     
                $stmt->bind_param("ssssssi", $name, $phone, $email, $city, $blood_group, $date_of_birth, $donor_id);
                                                                                     
                if($stmt->execute())
                    {
                        logActivity($conn, $actor_name, "updated_profile");

                        if($email_changed)
                            {
                                if(!empty($old_email))
                                    {
                                        sendSecurityAlertEmailChange($old_email, $name, $old_email, $email, "donor");
                                    }

                                if(!empty($email) && strcasecmp($email, $old_email) !== 0)
                                    {
                                        sendSecurityAlertEmailChange($email, $name, $old_email, $email, "donor");
                                    }
                            }


                        return true;
                    }
                                                                                    
                    return false;
            }
                                                                                    
                                                                                    
                                                                                    
        // NEW PHOTO UPLOAD
        if(isset($_FILES['photo']) && $_FILES['photo']['error'] == 0)
            {
                $tmp_name = $_FILES['photo']['tmp_name'];

                $file_size = $_FILES['photo']['size'];
                if ($file_size > 3000000)
                    {
                        return "file_too_large";
                    }

                $image_check = getimagesize($tmp_name);
                if ($image_check === false)
                    {
                        return "invalid_image";
                    }


                $upload_dir = DONOR_UPLOAD_DIR;
                                                                                    
                if(!is_dir($upload_dir))
                    {
                        mkdir($upload_dir,0777,true);
                    }
                                                                                    
                $allowed_types = ['jpg','jpeg','png'];
                $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
                                                                                    
                if(!in_array($ext, $allowed_types))
                    {
                        return "invalid_file_type";
                    }
                                                                                    
                $photo_name = uniqid() . "." . $ext;
                $upload_path = $upload_dir . $photo_name;
                                                                                    
                if(!move_uploaded_file($tmp_name, $upload_path))
                    {
                        return "upload_failed";
                    }
                                                                                    
                // delete old photo if exists
                if(!empty($current_photo))
                    {
                        $old = DONOR_UPLOAD_DIR . $current_photo;
                                                                                    
                        if(file_exists($old))
                            {
                                unlink($old);
                            }
                    }
                                                                                    
                $stmt = $conn->prepare(
                    "UPDATE donors
                    SET name=?, phone=?, email=?, city=?, donor_photo=?, blood_group =?, date_of_birth=?
                    WHERE id=?"
                    );
                                                                                     
                if(!$stmt)
                    {
                        return false;
                    }
                                                                                     
                $stmt->bind_param(
                    "sssssssi",
                    $name, $phone, $email, $city, $photo_name, $blood_group, $date_of_birth, $donor_id
                    );
                                                                                     
                if($stmt->execute())
                    {
                        logActivity($conn, $actor_name, "updated_profile");

                        if($email_changed)
                            {
                                if(!empty($old_email))
                                    {
                                        sendSecurityAlertEmailChange($old_email, $name, $old_email, $email, "donor");
                                    }

                                if(!empty($email) && strcasecmp($email, $old_email) !== 0)
                                    {
                                        sendSecurityAlertEmailChange($email, $name, $old_email, $email, "donor");
                                    }
                            }


                        return true;
                    }
                                                                                    
                    return false;
            }
                                                                                    
                                                                                    
                                                                                    
        // NORMAL UPDATE (no photo change)
        $stmt = $conn->prepare(
            "UPDATE donors 
                SET name=?, phone=?, email=?, city=?, blood_group = ?, date_of_birth = ?
                WHERE id=?"
            );
                                                                                     
        if(!$stmt)
            {
                return false;
            }
                                                                                     
        $stmt->bind_param("ssssssi", $name, $phone, $email, $city, $blood_group, $date_of_birth, $donor_id);
                                                                                     
        if($stmt->execute())
            {   
                logActivity($conn, $actor_name, "updated_profile");

                if($email_changed)
                    {
                        if(!empty($old_email))
                            {
                                sendSecurityAlertEmailChange($old_email, $name, $old_email, $email, "donor");
                            }

                        if(!empty($email) && strcasecmp($email, $old_email) !== 0)
                            {
                                sendSecurityAlertEmailChange($email, $name, $old_email, $email, "donor");
                            }
                    }


                return true;
            }
                                                                                    
        return false;
    }
                        



    
                            // ---------------------------------------------------------------------------




function getDonorStats($conn)
    {
        $stats = [];

        // Total Donors
        $result = $conn->query("SELECT COUNT(*) AS c FROM donors");
        $stats['total_donors'] = $result ? $result->fetch_assoc()['c'] : 0;

        // Available DONORS
        $result = $conn->query("SELECT COUNT(*) AS c FROM donors WHERE availability = 'available'");
        $stats['available_donors'] = $result ? $result->fetch_assoc()['c'] : 0;

        // TOTAL DONATION
        $result = $conn->query("SELECT SUM(total_donations) AS c FROM donors");
        $stats['total_donations'] = $result ? ($result->fetch_assoc()['c'] ?? 0) : 0;

        // INACTIVE DONORS
        $result = $conn->query("SELECT COUNT(*) AS c FROM donors WHERE availability = 'unavailable'");
        $stats['inactive_donors'] = $result ? $result->fetch_assoc()['c'] : 0;


        // REGISTERED IN LAST 7 DAYS
        $result = $conn->query(
                    "SELECT COUNT(*) AS c FROM activity_logs WHERE action_type = 'registered'
                    AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
                );
        $stats['registered_last_7_days'] = $result ? $result->fetch_assoc()['c'] : 0;


        // ACTIVE REQUESTS (pending + matched)
        $result = $conn->query("SELECT COUNT(*) AS c FROM blood_requests WHERE status IN ('pending','matched')");
        $stats['active_requests'] = $result ? (int)$result->fetch_assoc()['c'] : 0;

        // PENDING REQUESTS
        $result = $conn->query("SELECT COUNT(*) AS c FROM blood_requests WHERE status = 'pending'");
        $stats['pending_requests'] = $result ? (int)$result->fetch_assoc()['c'] : 0;

        // DONATIONS IN LAST 7 DAYS
        $result = $conn->query("SELECT COUNT(*) AS c FROM activity_logs WHERE action_type = 'donated_blood' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
        $stats['donations_last_7_days'] = $result ? (int)$result->fetch_assoc()['c'] : 0;




        return $stats;
    }




                            // ---------------------------------------------------------------------------



function getDonorHistory($conn, $donor_id)
    {
        $stmt = $conn->prepare("SELECT total_donations, last_donation_date, next_eligible_date FROM donors WHERE id = ?");

        if(!$stmt)
            {
                return null;
            }
        
        $stmt->bind_param("i", $donor_id);
        $stmt->execute();

        $result = $stmt->get_result();

        if($result->num_rows === 0)
            {
                return null;
            }
        
        return $result->fetch_assoc();

    }




                            // ---------------------------------------------------------------------------
                            



function getTopDonors($conn, $limit = 5)
    {
        $stmt = $conn->prepare("SELECT name, blood_group, city, total_donations, donor_photo FROM donors WHERE total_donations > 0 ORDER BY total_donations DESC, id ASC limit ?");

        if(!$stmt)
            {
                return [];
            }
        
        $stmt->bind_param("i", $limit);
        $stmt->execute();

        $result = $stmt->get_result();

        $donors = [];

        while($row = $result->fetch_assoc())
            {
                if(!empty($row['donor_photo']))
                    {
                        $row['donor_photo'] = DONOR_UPLOAD_URL . $row['donor_photo'];
                    }
                    else
                    {
                        $row['donor_photo'] = null; // or '/imgs/default-donor.png'
                    }

                $donors[] = $row;
            }
        
        return $donors;
    }





                            // ---------------------------------------------------------------------------

function ensureCsrfToken()
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];

    }






                            // ---------------------------------------------------------------------------



function requireCsrfToken()
    {
        if(session_status() === PHP_SESSION_NONE) {
                session_start();
            }

        $client = $_POST['csrf_token'] ?? '';

        if(!isset($_SESSION['csrf_token']) || !is_string($client) || !hash_equals($_SESSION['csrf_token'], $client)) {
                http_response_code(403);
                echo "csrf_invalid";
                exit();
            }
    }




    
                              // ---------------------------------------------------------------------------
                                        // B L O O D          R E Q
                              // ---------------------------------------------------------------------------





function getBloodRequests($conn, $filters = [])
    {
        $sql = "SELECT id, requester_name, requester_phone, requester_email,
                blood_group, units_needed, city, hospital_name,
                urgency, status, notes, created_at, updated_at
                FROM blood_requests WHERE 1=1";

        $params = [];
        $types  = "";

        // FILTER by status
        if (!empty($filters['status']))
            {
                $allowed_status = ["pending", "matched", "fulfilled", "cancelled"];
                if(in_array($filters['status'], $allowed_status, true))
                    {
                        $sql .= " AND status = ?";
                        $params[] = $filters['status'];
                        $types .= "s";
                    }
            }


        // FILTER by blood group
        if (!empty($filters['blood_group']))
            {
                $sql .= " AND blood_group = ?";
                $params[] = $filters['blood_group'];
                $types .= "s";
            }

        // FILTER by city
        if (!empty($filters['city']))
            {
                $sql .= " AND city LIKE ?";
                $params[] = "%" . $filters['city'] . "%";
                $types .= "s";
            }

        // FILTER by urgency
        if (!empty($filters['urgency']))
            {
                $allowed_urgency = ["normal", "urgent", "critical"];
                if (in_array($filters['urgency'], $allowed_urgency, true))
                    {
                        $sql .= " AND urgency = ?";
                        $params[] = $filters['urgency'];
                        $types .= "s";
                    }
            }


        // SORTING newest first by default
        $allowed_sort = ["created_at", "urgency", "blood_group", "status", "city"];
        $sort_by = "created_at";

        if (!empty($filters['sort_by']) && in_array($filters['sort_by'], $allowed_sort))
            {
                $sort_by = $filters['sort_by'];
            }

        $order = "DESC";

        if (!empty($filters['order']) && strtoupper($filters['order']) === "ASC")
            {
                $order = "ASC";
            }

        $sql .= " ORDER BY $sort_by $order";

        $stmt = $conn->prepare($sql);

        if (!$stmt)
            {
                return [];
            }

        if (!empty($params))
            {
                $stmt->bind_param($types, ...$params);
            }

        $stmt->execute();
        $result = $stmt->get_result();

        $requests = [];
        while ($row = $result->fetch_assoc())
            {
                $requests[] = $row;
            }

        return $requests;
    }






                            // ---------------------------------------------------------------------------




function sendBloodRequestEmail($email, $donor_name, $request)
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
                $mail->addAddress($email, $donor_name);

                $hospital = !empty($request['hospital_name']) ? $request['hospital_name'] : "a nearby hospital";

                $mail->Subject = "Urgent Blood Request - " . $request['blood_group'] . " Needed in " . $request['city'];
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($donor_name) . "</strong>,</p>
                    <p>There is an urgent blood request that matches your blood group.</p>
                    <table cellpadding='6'>
                        <tr><td><strong>Blood Group Needed:</strong></td><td>" . htmlspecialchars($request['blood_group']) . "</td></tr>
                        <tr><td><strong>City:</strong></td><td>" . htmlspecialchars($request['city']) . "</td></tr>
                        <tr><td><strong>Hospital:</strong></td><td>" . htmlspecialchars($hospital) . "</td></tr>
                        <tr><td><strong>Requested By:</strong></td><td>" . htmlspecialchars($request['requester_name']) . "</td></tr>
                    </table>
                    <p>If you are available, please contact us or visit the hospital directly.</p>
                    <p>Your donation can save a life. Thank you!</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Dear $donor_name, urgent blood request for {$request['blood_group']} in {$request['city']} at $hospital.";

                $mail->send();
                return true;

            }
        catch (Exception $e)
            {
                error_log("Blood request email failed: " . $e->getMessage());
                return false;
            }
    }





                            // ---------------------------------------------------------------------------






function sendWelcomeEmail($email, $name, $blood_group, $city, $phone)
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

                $mail->Subject = "Welcome to Blood Donation System!";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>Welcome to the Blood Donation Center! We are glad to have you with us.</p>
                    <p>Here are your registration details:</p>
                    <table cellpadding='6' style='border-collapse:collapse;'>
                        <tr><td><strong>Name:</strong></td><td>" . htmlspecialchars($name) . "</td></tr>
                        <tr><td><strong>Blood Group:</strong></td><td>" . htmlspecialchars($blood_group) . "</td></tr>
                        <tr><td><strong>City:</strong></td><td>" . htmlspecialchars($city) . "</td></tr>
                        <tr><td><strong>Phone:</strong></td><td>" . htmlspecialchars($phone) . "</td></tr>
                        <tr><td><strong>Email:</strong></td><td>" . htmlspecialchars($email) . "</td></tr>
                    </table>
                    <p>You can now log in and manage your donor profile.</p>
                    <p>Thank you for being a life saver!</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Welcome $name! Your registration is complete. Blood Group: $blood_group, City: $city, Phone: $phone.";

                $mail->send();
                return true;

            }
        catch (Exception $e)
            {
                error_log("Welcome email failed: " . $e->getMessage());
                return false;
            }
    }





                            // ---------------------------------------------------------------------------




function sendRequestStatusEmail($email, $requester_name, $request_id, $blood_group, $city, $new_status)
    {
        if(empty($email))
            {
                return false;
            }

        $mail = new PHPMailer(true);

        // Status labels
        $status_labels = [
            "pending"   => "Pending",
            "matched"   => "Matched",
            "fulfilled" => "Fulfilled",
            "cancelled" => "Cancelled"
        ];

        $status_label = $status_labels[$new_status] ?? ucfirst($new_status);

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
                $mail->addAddress($email, $requester_name);

                $mail->Subject = "Your Blood Request Status Updated — " . $status_label;
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($requester_name) . "</strong>,</p>
                    <p>Your blood request status has been updated.</p>
                    <table cellpadding='6' style='border-collapse:collapse;'>
                        <tr><td><strong>Request ID:</strong></td><td>#" . (int)$request_id . "</td></tr>
                        <tr><td><strong>Blood Group:</strong></td><td>" . htmlspecialchars($blood_group) . "</td></tr>
                        <tr><td><strong>City:</strong></td><td>" . htmlspecialchars($city) . "</td></tr>
                        <tr><td><strong>New Status:</strong></td><td><strong>" . htmlspecialchars($status_label) . "</strong></td></tr>
                    </table>
                    <p>You can check the status of your request anytime using your phone number or email on our website.</p>
                    <p>Thank you for using Blood Donation System.</p>
                    <p><em>Blood Donation System</em></p>
                ";

                $mail->AltBody = "Dear $requester_name, your blood request #$request_id status is now: $status_label.";

                $mail->send();
                return true;

            }
        catch (Exception $e)
            {
                error_log("Request status email failed: " . $e->getMessage());
                return false;
            }
    }





                            // ---------------------------------------------------------------------------




function sendDonorDeletedEmail($email, $name)
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

                $mail->Subject = "Your Donor Account Has Been Removed";
                $mail->isHTML(true);
                $mail->Body = "
                    <p>Dear <strong>" . htmlspecialchars($name) . "</strong>,</p>
                    <p>We are writing to let you know that your donor account has been removed from the Blood Donation System by an administrator.</p>
                    <p>If you believe this was a mistake or have any questions, please contact us.</p>
                    <p>Thank you for your contributions to saving lives. We truly appreciate your generosity.</p>
                    <p><em>Blood Donation System</em></p>
                ";
                $mail->AltBody = "Dear $name, your donor account has been removed from the Blood Donation System.";

                $mail->send();
                return true;

            }
        catch (Exception $e) 
            {
                error_log("Donor deleted email failed: " . $e->getMessage());
                return false;
            }
    }





                            // ---------------------------------------------------------------------------



function getDonationRecords($conn, $donor_id = null, $limit = 50)
    {
        $limit = (int)$limit;
        if ($limit < 1) $limit = 50;
        if ($limit > 500) $limit = 500;

        $sql = "SELECT dr.id, dr.donor_id, d.name AS donor_name, d.blood_group,
                    dr.units, dr.donation_date, dr.location, dr.notes,
                    dr.admin_id, a.admin_name,
                    dr.created_at
                FROM donation_records dr
                INNER JOIN donors d ON d.id = dr.donor_id
                LEFT JOIN admins a ON a.id = dr.admin_id";

        $params = [];
        $types = "";

        if ($donor_id !== null) {
            $sql .= " WHERE dr.donor_id = ?";
            $params[] = (int)$donor_id;
            $types .= "i";
        }

        $sql .= " ORDER BY dr.donation_date DESC, dr.id DESC LIMIT ?";
        $params[] = $limit;
        $types .= "i";

        $stmt = $conn->prepare($sql);
        if (!$stmt) return [];

        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();

        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }

        return $rows;
    }



                            

                            // ---------------------------------------------------------------------------




                            // ---------------------------------------------------------------------------





                            // ---------------------------------------------------------------------------




function getDonors($conn, $filters = [], $mask_sensitive = false)
    {   
        updateDonorAvailability($conn);
                        
        $sql ="SELECT id, name, blood_group, phone, email, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age,
        city, last_donation_date, next_eligible_date, donor_photo,
        availability, total_donations,
       (6371 * acos(
        LEAST(1, GREATEST(-1,
        cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) +
        sin(radians(?)) * sin(radians(latitude))
        ))
        )) AS distance
        FROM donors WHERE 1=1";
                        
        $params = [];
        $types ="";
                        
        // FOR DISTANCE
        $params[] =  $filters['admin_lat'] ?? 0;
        $params[] =  $filters['admin_lng'] ?? 0;
        $params[] =  $filters['admin_lat'] ?? 0;
                        
        $types .="ddd";
                        
                        
        // FILTER by NAME
        if(!empty($filters['search_name']))
            {
                $sql .= " AND name LIKE ?";
                $params[] = "%" . $filters['search_name'] . "%";
                $types .= "s";
            }
                        
                        
        // FILTER by CITY
        if(!empty($filters['city']))
            {
                $sql .= " AND city Like ?";
                $params[] = "%" . $filters['city'] . "%";
                $types .= "s";
            }
                        
        // ?FILTER by BLOOD GROUP
        if(!empty($filters['blood_group']))
            {
                $sql .= " AND blood_group = ?";
                $params[] = $filters['blood_group'];
                $types .= "s";
            }
                        
        // FILTER by COMPATABLE BLOOD GROUP
        if(!empty($filters['compatible_blood']))
            {
                $blood = $filters['compatible_blood'];
                
                $compatible = [
                "O-" => ["O-"],
                "O+" => ["O-","O+"],
                "A-" => ["O-", "A-"],
                "A+" => ["O-", "O+", "A-", "A+"],
                "B-" => ["O-", "B-"],
                "B+" => ["O-", "O+", "B-", "B+"],
                "AB-" =>["O-", "A-", "B-", "AB-"],
                "AB+" => ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
                
                ];
                        
            if(isset($compatible[$blood]))
                {
                    $groups = $compatible[$blood];
                        
                    $placeholders = implode(',' , array_fill(0, count($groups), '?' ));
                    $sql .= " AND blood_group IN ($placeholders)";
                        
                    foreach($groups as $g)
                        {
                            $params[] = $g;
                            $types .= "s";
                        }
                }
            }
                        
        // FILTER by Avaibility
        if(!empty($filters['availability']))
            {
                $sql .= " AND availability = ?";
                $params[] = $filters['availability'];
                $types .= "s";
            }
                        
        // FILTER by AGE
        // MIN Age
        if(!empty($filters['min_age']))
            {
            $sql .= " AND TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) >= ?";
            $params[] = $filters['min_age'];
            $types .= "i";
            }
        // MAX Age
        if(!empty($filters['max_age']))
            {
            $sql .= " AND TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) <= ?";
            $params[] = $filters['max_age'];
            $types .= "i";
            }
                                
        // FILTER by ELIGIBLE Donors
        if(!empty($filters['eligible_only']))
            {
            $sql .= " AND (next_eligible_date is NULL or next_eligible_date <= CURDATE())";
            }
                        
                        
        // SORTING OPTIONS
        $allowed_sort = ["name", "city", "age", "blood_group", "last_donation_date", "total_donations", "distance", ];
        
        $sort_by = "name";
                        
        if(!empty($filters['sort_by']) && in_array($filters['sort_by'], $allowed_sort))
            {
                $sort_by = $filters['sort_by'];
            }
                        
        if($sort_by === "age")
            {
                $sort_by = "TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE())";
            }
                        
        if(!empty($filters['nearest']))
            {
                $sql .= " AND latitude IS NOT NULL AND longitude IS NOT NULL";
                $sort_by = "distance";
                $order = "ASC";
            }
            else
            {          
                $order = "DESC";
                        
                if(!empty($filters['order']) && strtoupper($filters['order']) === "ASC")
                    {
                        $order = "ASC";
                    }
                                        
            }
        $sql .= " ORDER BY $sort_by $order";
                        
                        
        // STATEMENT Preparation
        $stmt = $conn->prepare($sql);
        
        if(!$stmt)
            {
                return [];
            }
                        
        if(!empty($params))
            {
                $stmt->bind_param($types, ...$params);
            }
                        
        $stmt->execute();
        $result =$stmt->get_result();
                        
                        
                        
        $donors = [];
        while($row = $result->fetch_assoc())
            {
                if(!empty($row['donor_photo']))
                    {
                        $row['donor_photo'] = DONOR_UPLOAD_URL . $row['donor_photo'];
                    }
                else
                    {
                        $row['donor_photo'] = null;
                    }
                    
                if($mask_sensitive)
                    {
                        if(!empty($row['phone']))
                            {
                                $row['phone'] = "**" . substr($row['phone'], -4);
                            }
                                                
                        if (!empty($row['email']))
                            {
                                $parts = explode("@", $row['email'], 2);
                                if (count($parts) === 2)
                                    {
                                        $row['email'] = "****@" . $parts[1];
                                    }
                                    else
                                    {
                                        $row['email'] = "****";
                                    }
                                    
                            }

                            
                    }
                    
                $donors[] = $row;

            }
                        
        return $donors;
    }
                       
    

?>
