<?php

if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }
require_once "admin_auth.php";
require_once "common_functions.php";
require_once "config.php";
require_once "mails.php";

require_once __DIR__ . "/../src/PHPMailer.php";
require_once __DIR__ . "/../src/SMTP.php";
require_once __DIR__ . "/../src/Exception.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;



$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error)
{
    error_log("Database connection failed: " . $conn->connect_error);
    http_response_code(500);
    exit("server_error");
}

/*

                               F  U  N  C  T  I  O  N  S                   S  T  A  R  T  I  N  G


            */




// ADMIN Function
function createAdmin($conn, $admin_name, $date_of_birth, $admin_phone, $admin_email, $admin_city, $admin_password, $admin_photo, $admin_created_at)
                        
    {
        $stmt = $conn->prepare("insert into admins
                                (admin_name, date_of_birth, admin_phone, admin_email, admin_city, admin_password,
                                admin_photo, admin_created_at)
                                values(?, ?, ?, ?, ?, ?, ?, ?)");

        if(!$stmt)
            {
                return false;
            }
        
        $stmt->bind_param(
                "ssssssss", $admin_name, $date_of_birth, $admin_phone, $admin_email, $admin_city, $admin_password,
                $admin_photo, $admin_created_at
                );
        
        $result = $stmt->execute();
        
        if($result)
        {
            logActivity($conn, "Admin: " . $_SESSION['admin_name'], "created_admin");
        }
        return $result;
        
    }





                            // ---------------------------------------------------------------------------


             





                            // ---------------------------------------------------------------------------


    
function getDonorDetails($conn, $donor_id)
    {
        updateDonorAvailability($conn);

        $sql = "SELECT id, name, blood_group, phone, email, city,
        latitude, longitude, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age, last_donation_date, next_eligible_date,
        availability, total_donations,donor_photo, last_login FROM donors WHERE id = ?";

        $stmt = $conn->prepare($sql);

        if(!$stmt)
            {
                echo "query_error";
                return null;
            }

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();

        $result = $stmt->get_result();

        if($result->num_rows == 0)
            {
                return null;
            }
        $donor = $result->fetch_assoc();

        if(!empty($donor['donor_photo']))
            {
                $donor['donor_photo'] = DONOR_UPLOAD_URL . $donor['donor_photo'];
            }
        else
            {
                $donor['donor_photo'] = null;
            }

        return $donor;
    }



                                    // ---------------------------------------------------------------------------




function deleteDonor($conn, $donor_id)
    {
        $stmt = $conn->prepare("SELECT name, email, donor_photo FROM donors WHERE id = ?");

        if(!$stmt)
            {
                return false;
            }

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();

        $donor = $stmt->get_result()->fetch_assoc();

        $stmt = $conn->prepare("DELETE FROM donors WHERE id = ?");

        if(!$stmt)
            {
                return false;
            }

        $stmt->bind_param("i", $donor_id);

        if($stmt->execute())
            {
                if(!empty($donor['donor_photo']))
                    {
                        $file = DONOR_UPLOAD_DIR . $donor['donor_photo'];

                        if(file_exists($file))
                            {
                                unlink($file);
                            }
                    }

        
                logActivity($conn, "Admin: " . $_SESSION['admin_name'], "deleted_donor");

                // Send deletion email in donor email
                if(!empty($donor['email']))
                    {
                        sendDonorDeletedEmail($donor['email'], $donor['name']);
                    }

                return true;
            }

        return false;
    }

                            // ---------------------------------------------------------------------------



function recordDonation($conn, $donor_id, $units = 1, $location = null, $notes = null, $donation_date = null, $admin_id = null)
    {
        $donor_id = (int)$donor_id;
        $units = (int)$units;
        $location = trim((string)$location);
        $notes = trim((string)$notes);

        if ($units < 1 || $units > 5) {
            return "invalid_units";
        }

        if ($donation_date === null || trim($donation_date) === "") {
            $donation_date = date("Y-m-d");
        } else {
            $donation_date = trim($donation_date);
            $dt = DateTime::createFromFormat("Y-m-d", $donation_date);
            if (!$dt || $dt->format("Y-m-d") !== $donation_date) {
                return "invalid_date";
            }
        }

        $next_eligible = date("Y-m-d", strtotime($donation_date . " +90 days"));

        $stmt = $conn->prepare("SELECT id, name, email, total_donations, availability, last_donation_date FROM donors WHERE id = ?");
        if (!$stmt) return "query_error";

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows === 0) return "donor_not_found";
        $donor = $result->fetch_assoc();

        if ($donor['availability'] !== "available") return "donor_not_available";

        if (!empty($donor['last_donation_date'])) {
            $last = new DateTime($donor['last_donation_date']);
            $new  = new DateTime($donation_date);
            $days = $new->diff($last)->days;
            if ($new < $last || $days < 90) return "donation_too_soon";
        }

        $conn->begin_transaction();

        try {
            // 1) insert donation record
            $locVal = ($location !== "") ? $location : null;
            $notesVal = ($notes !== "") ? $notes : null;

            $ins = $conn->prepare(
                "INSERT INTO donation_records (donor_id, admin_id, units, donation_date, location, notes)
                VALUES (?, ?, ?, ?, ?, ?)"
            );
            if (!$ins) throw new Exception("insert_error");

            // admin_id may be null
            if ($admin_id === null) {
                $nullAdmin = null;
                $ins->bind_param("iiisss", $donor_id, $nullAdmin, $units, $donation_date, $locVal, $notesVal);
            } else {
                $admin_id = (int)$admin_id;
                $ins->bind_param("iiisss", $donor_id, $admin_id, $units, $donation_date, $locVal, $notesVal);
            }

            if (!$ins->execute()) throw new Exception("insert_failed");

            // 2) update donor summary
            $upd = $conn->prepare(
                "UPDATE donors
                SET total_donations = total_donations + ?,
                    last_donation_date = ?,
                    next_eligible_date = ?,
                    availability = 'unavailable',
                    auto_unavailable = TRUE
                WHERE id = ?"
            );
            if (!$upd) throw new Exception("update_error");

            $upd->bind_param("issi", $units, $donation_date, $next_eligible, $donor_id);
            if (!$upd->execute()) throw new Exception("update_failed");

            logActivity($conn, "Donor: " . $donor['name'], "donated_blood");

            $donation_date_fmt = date("d M Y", strtotime($donation_date));
            $next_eligible_fmt = date("d M Y", strtotime($next_eligible));
            $new_total_donations = ((int)$donor['total_donations']) + $units;

            if (!empty($donor['email'])) {
                sendDonationThankYouEmail(
                    $donor['email'],
                    $donor['name'],
                    $donation_date_fmt,
                    $next_eligible_fmt,
                    $new_total_donations
                );
            }

            $conn->commit();
            return "donation_recorded";
        } catch (Exception $e) {
            $conn->rollback();
            return "donation_failed";
        }
    }





    
                                    // ---------------------------------------------------------------------------

function sendRecallToDonor($conn, $donor_id)
    {
        $stmt = $conn->prepare("SELECT name, email, blood_group, city FROM donors WHERE id = ?");
        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();
        $donor = $stmt->get_result()->fetch_assoc();

        if(!$donor)
            {
                return "donor_not_found";
            }

        if(empty($donor['email']))
            {
                return "invalid_email";
            }

        $sent = sendRecallEmail($donor['email'], $donor['name'], $donor['blood_group'], $donor['city']);

        if($sent)
            {
                logActivity($conn, "Admin: " . $_SESSION['admin_name'], "recall_mail_sent");
                return "recall_sent";
            }

        return "mail_failed";
    }



                                    
                                    // ---------------------------------------------------------------------------



                                    // ---------------------------------------------------------------------------




function updateAdmin($conn, $admin_id, $admin_name, $admin_phone, $admin_email, $admin_city)
    {
        $photo_name = NULL;

        // CHECK duplicate phone/email
        $stmt = $conn->prepare(
            "SELECT id FROM admins 
            WHERE (admin_phone = ? OR admin_email = ?) 
            AND id != ?"
            );
                                        
        $stmt->bind_param("ssi", $admin_phone, $admin_email, $admin_id);
        $stmt->execute();
        $result = $stmt->get_result();
                                        
        if($result->num_rows > 0)
            {
                return "admin_exists";
            }
                                        
                                        
        // CHECK current photo
        $stmt = $conn->prepare("SELECT admin_email, admin_photo FROM admins WHERE id = ?");
        $stmt->bind_param("i", $admin_id);
        $stmt->execute();
                                        
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        $old_admin_email = $row['admin_email'] ?? null;
        $email_changed = strcasecmp(trim((string)$old_admin_email), trim((string)$admin_email)) !== 0;

                                        
        $current_photo = $row['admin_photo'] ?? null;
                                        
                                        
                                        
        // REMOVE PHOTO
        if(isset($_POST['remove_photo']) && $_POST['remove_photo'] == "1")
            {
                if(!empty($current_photo))
                    {
                        $file = ADMIN_UPLOAD_DIR . $current_photo;
                                        
                        if(file_exists($file))
                            {
                                unlink($file);
                            }
                    }
                                        
                $stmt = $conn->prepare(
                    "UPDATE admins 
                    SET admin_name=?, admin_phone=?, admin_email=?, admin_city = ?, admin_photo=NULL 
                    WHERE id=?"
                    );
                                        
                if(!$stmt)
                    {
                        return false;
                    }
                                        
                $stmt->bind_param("ssssi", $admin_name, $admin_phone, $admin_email, $admin_city, $admin_id);
                                        
                if($stmt->execute())
                    {
                        logActivity($conn, "Admin: " . $_SESSION['admin_name'], "updated_profile");

                        if($email_changed)
                            {
                                if(!empty($old_admin_email))
                                    {
                                        sendSecurityAlertEmailChange($old_admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
                                    }

                                if(!empty($admin_email) && strcasecmp($admin_email, $old_admin_email) !== 0)
                                    {
                                        sendSecurityAlertEmailChange($admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
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

                    $upload_dir = ADMIN_UPLOAD_DIR;
                                        
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
                            $old = ADMIN_UPLOAD_DIR . $current_photo;
                                        
                            if(file_exists($old))
                                {
                                    unlink($old);
                                }
                        }
                                        
                    $stmt = $conn->prepare(
                        "UPDATE admins 
                        SET admin_name=?, admin_phone=?, admin_email=?, admin_city = ?, admin_photo=? 
                        WHERE id=?"
                        );
                                        
                    if(!$stmt)
                        {
                            return false;
                        }
                                        
                    $stmt->bind_param(
                                        "sssssi",$admin_name, $admin_phone, $admin_email, $admin_city, $photo_name, $admin_id
                                    );
                                        
                    if($stmt->execute())
                        {
                            logActivity($conn, "Admin: " . $_SESSION['admin_name'], "updated_profile");

                            if($email_changed)
                                {
                                    if(!empty($old_admin_email))
                                        {
                                            sendSecurityAlertEmailChange($old_admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
                                        }

                                    if(!empty($admin_email) && strcasecmp($admin_email, $old_admin_email) !== 0)
                                        {
                                            sendSecurityAlertEmailChange($admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
                                        }
                                }


                            return true;
                        }
                                        
                    return false;
                }
                                        
                                        
                                        
                // NORMAL UPDATE (no photo change)
                $stmt = $conn->prepare(
                    "UPDATE admins 
                    SET admin_name=?, admin_phone=?, admin_email=?, admin_city=?
                    WHERE id=?"
                    );
                                        
                if(!$stmt)
                    {
                        return false;
                    }
                                        
                $stmt->bind_param("ssssi", $admin_name, $admin_phone, $admin_email, $admin_city, $admin_id);
                                        
                if($stmt->execute())
                    {
                        logActivity($conn, "Admin: " . $_SESSION['admin_name'], "updated_profile");

                        if($email_changed)
                            {
                                if(!empty($old_admin_email))
                                    {
                                        sendSecurityAlertEmailChange($old_admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
                                    }

                                if(!empty($admin_email) && strcasecmp($admin_email, $old_admin_email) !== 0)
                                    {
                                        sendSecurityAlertEmailChange($admin_email, $admin_name, $old_admin_email, $admin_email, "admin");
                                    }
                            }


                        return true;
                    }
                                        
                return false;
    }



                                    

                                 // ---------------------------------------------------------------------------





function getAdminDetails($conn, $admin_id)
    {
        $stmt = $conn->prepare("SELECT id, admin_name, admin_phone, admin_email, admin_city, admin_photo, date_of_birth, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age FROM admins where id = ?");

        if(!$stmt)
            {
                return null;
            }

        $stmt->bind_param("i", $admin_id);
        $stmt->execute();

        $result = $stmt->get_result();

        if($result->num_rows == 0)
            {
                return null;
            }

        $admin = $result->fetch_assoc();

        if(!empty($admin['admin_photo']))
            {
                $admin['admin_photo'] = ADMIN_UPLOAD_URL . $admin['admin_photo'];
            }
        else
            {
                $admin['admin_photo'] = null;
            }

        return $admin;
    }




                                // ---------------------------------------------------------------------------




function getAdmins($conn, $filters = [])
    {
        $sql = "SELECT id, admin_name, admin_phone, admin_email, date_of_birth,
        TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age, admin_city, status, admin_created_at FROM admins WHERE 1=1";

        $params = [];
        $types = "";

        // SEARCHING by Name
        if(!empty($filters['search_name']))
            {
                $sql .= " AND admin_name LIKE ?";
                $params[] = "%" . $filters['search_name'] . "%";
                $types .= "s";
            }

        // SORTING
        $allowed_sort = ["id", "admin_name", "admin_created_at"];
        $sort_by = "admin_created_at";

        if(!empty($filters['sort_by']) && in_array($filters['sort_by'], $allowed_sort))
            {
                $sort_by = $filters['sort_by'];
            }

        // SORTING ORDER
        $order = "DESC";

        if(!empty($filters['order']) && strtoupper($filters['order']) === "ASC")
            {
                $order = "ASC";
            }

        $sql .= " ORDER BY $sort_by $order";
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
        $result = $stmt->get_result();

        $admins = [];

        while($row = $result->fetch_assoc())
            {
                $admins[] = $row;
            }

        return $admins;
    }
    




                            // ---------------------------------------------------------------------------







function updateAdminStatus($conn, $admin_id, $status)
    {
        if(!isset($_SESSION['admin_id']))
            {
                return "not_loged_in";
            }

        if($_SESSION['admin_id'] == $admin_id && $status === "inactive")
            {
                return "cannot_deactivate_self";
            }

        if(!in_array($status, ["active", "inactive"], true))
            {
                return "invalid_status";
            }

        $stmt = $conn->prepare("UPDATE admins SET status = ? WHERE id = ?");

        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("si", $status, $admin_id);

        if($stmt->execute())
            {
                return "status_updated";
            }

        return "update_failed";

    }

   

                             // ---------------------------------------------------------------------------





function getGroupedActivities($conn)
    {
        $sql = "SELECT actor_name, action_type, created_at
                FROM activity_logs
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ORDER BY created_at DESC";
                             
        $result = $conn->query($sql);

        if(!$result)
            {
                return [];
            }
                             
        $grouped = [];
                             
        while($row = $result->fetch_assoc())
            {
                $date = date("Y-m-d", strtotime($row['created_at']));
                
                if(!isset($grouped[$date]))
                    {
                        $grouped[$date] = [];
                    }
                             
                $grouped[$date][] = $row;
            }
                             
            return $grouped;
    }


    
                             // ---------------------------------------------------------------------------
                        


function updateAdminActivityStatus($conn)
    {
        $sql = "UPDATE admins SET status = 'inactive' WHERE last_login IS NOT NULL AND last_login <= DATE_SUB(NOW(), INTERVAL 365 DAY)";

        $conn->query($sql);        
    }



                              // ---------------------------------------------------------------------------
                                        // B L O O D          R E Q
                              // ---------------------------------------------------------------------------


function updateRequestStatus($conn, $request_id, $new_status)
    {
        $allowed = ["pending", "matched", "fulfilled", "cancelled"];
        if(!in_array($new_status, $allowed, true))
            {
                return "invalid_status";
            }

       $stmt = $conn->prepare(
                    "SELECT id, blood_group, city, requester_name, requester_email, hospital_name
                    FROM blood_requests WHERE id = ?"
                );

        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("i", $request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();
        if(!$request)
            {
                return "request_not_found";
            }

        $stmt = $conn->prepare("UPDATE blood_requests SET status = ? WHERE id = ?");
        if(!$stmt)
            {
                return "update_error";
            }

        $stmt->bind_param("si", $new_status, $request_id);
        if(!$stmt->execute())
            {
                return "update_failed";
            }

        logActivity($conn, "Admin: " . ($_SESSION['admin_name'] ?? 'Admin'), "request_status_changed_to_$new_status");

        // Auto email all matching donors when status → matched
        if($new_status === "matched")
            {
                autoNotifyMatchingDonors($conn, $request);
            }
        
        // Notify requester about status change if they provided an email
        if (!empty($request['requester_email'])) 
            {
                sendRequestStatusEmail(
                            $request['requester_email'],
                            $request['requester_name'],
                            $request['id'],
                            $request['blood_group'],
                            $request['city'],
                            $new_status
                        );

            }    


        return "status_updated";
    }





                              // ---------------------------------------------------------------------------


                              

                              
function autoNotifyMatchingDonors($conn, $request)
    {
        $compatible_donors = [
                "O-"  => ["O-"],
                "O+"  => ["O-", "O+"],
                "A-"  => ["O-", "A-"],
                "A+"  => ["O-", "O+", "A-", "A+"],
                "B-"  => ["O-", "B-"],
                "B+"  => ["O-", "O+", "B-", "B+"],
                "AB-" => ["O-", "A-", "B-", "AB-"],
                "AB+" => ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
            ];

        $donor_groups = $compatible_donors[$request['blood_group']] ?? [$request['blood_group']];
        $placeholders = implode(',', array_fill(0, count($donor_groups), '?'));
        $types = str_repeat("s", count($donor_groups)) . "s";

        $params   = $donor_groups;
        $params[] = $request['city'];

        $stmt = $conn->prepare(
                "SELECT name, email FROM donors
                WHERE blood_group IN ($placeholders)
                AND city = ?
                AND availability = 'available'
                AND email IS NOT NULL AND email != ''"
            );

        if(!$stmt)
            {
                return;
            }

        $stmt->bind_param($types, ...$params);
        $stmt->execute();

        $result = $stmt->get_result();
        while ($donor = $result->fetch_assoc())
            {
                sendBloodRequestEmail($donor['email'], $donor['name'], $request);
            }
    }





                              // ---------------------------------------------------------------------------


function notifySpecificDonor($conn, $donor_id, $request_id)
    {
        $stmt = $conn->prepare("SELECT name, email FROM donors WHERE id = ?");
        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("i", $donor_id);
        $stmt->execute();
        $donor = $stmt->get_result()->fetch_assoc();

        if(!$donor)
            {
                return "donor_not_found";
            }

        if(empty($donor['email']))
            {
                return "donor_no_email";
            }

        $stmt = $conn->prepare(
                "SELECT id, blood_group, city, requester_name, hospital_name
                FROM blood_requests WHERE id = ?"
            );

        if(!$stmt)
            {
                return "query_error";
            }

        $stmt->bind_param("i", $request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();

        if(!$request)
            {
                return "request_not_found";
            }

        $sent = sendBloodRequestEmail($donor['email'], $donor['name'], $request);

        if($sent)
            {
                logActivity($conn, "Admin: " . ($_SESSION['admin_name'] ?? 'Admin'), "manually_notified_donor");
                return "donor_notified";
            }

        return "email_failed";
    }




                              // ---------------------------------------------------------------------------


function deleteBloodRequest($conn, $request_id)
    {
        $stmt = $conn->prepare("DELETE FROM blood_requests WHERE id = ?");
        if(!$stmt)
            {
                return false;
            }

        $stmt->bind_param("i", $request_id);

        if($stmt->execute())
            {
                logActivity($conn, "Admin: " . ($_SESSION['admin_name'] ?? 'Admin'), "deleted_blood_request");
                return true;
            }

        return false;
    }

                              


                              // ---------------------------------------------------------------------------


                              // ---------------------------------------------------------------------------



                              // ---------------------------------------------------------------------------


updateAdminActivityStatus($conn);   



/*

                               F  U  N  C  T  I  O  N  S                   E  N  D  I  N  G


            */






            /*

                               A  C  T  I  O  N  S                   S  T  A  R  T  I  N  G


            */


                            // ---------------------------------------------------------------------------






// ADMIN ACTIONS
if(isset($_POST['action']))
    {
        requireAdmin();
        requireCsrfToken();

        switch($_POST['action'])
            {  
                // ADMIN Creation
                case "create_admin":
                    {
                        $admin_name = $_POST['admin_name'] ?? null;
                        $date_of_birth = $_POST['date_of_birth'] ?? null;
                        $admin_phone = $_POST['admin_phone'] ?? null;
                        $admin_email = $_POST['admin_email'] ?? null;
                        $admin_city = $_POST['admin_city'] ?? null;


                        // FIELD CHECKING
                        if(empty($admin_name) || empty($date_of_birth) || empty($admin_phone) || empty($admin_email) || empty($admin_city) || empty($_POST['password']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        if(!isValidEmail($admin_email))
                            {
                                echo "invalid_email";
                                exit();
                            }

                        if(!isValidPhone($admin_phone))
                            {
                                echo "invalid_phone";
                                exit();
                            }
                             
                        $dob = new DateTime($date_of_birth);
                        $today = new DateTime();
                        $age = $today->diff($dob)->y;

                        if($age < 18 || $age > 80)
                            {
                                echo "invalid_age";
                                exit();
                            }
                      

                        $password = $_POST['password'] ?? null;
                        $admin_password = password_hash($password, PASSWORD_DEFAULT);

                        $admin_created_at = date("Y-m-d");
                    
                        $admin_photo = NULL;
                        // HANDLING The PHOTO
                        if(isset($_FILES['photo']) && $_FILES['photo']['error'] == 0)
                            {
                                $tmp_name = $_FILES['photo']['tmp_name'];
                                $upload_dir = ADMIN_UPLOAD_DIR;

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

                                $admin_photo = uniqid(). "." . $file_extension;

                                $upload_path = $upload_dir.$admin_photo;

                                if(!move_uploaded_file($tmp_name, $upload_path))
                                    {
                                        echo "upload_failed";
                                        exit();
                                    }

                            }

                    
                        $result = createAdmin(
                            $conn, $admin_name, $date_of_birth, $admin_phone,
                            $admin_email, $admin_city, $admin_password, $admin_photo, $admin_created_at
                            );

                        if($result)
                            {
                                sendAdminWelcomeEmail($admin_email, $admin_name, $admin_phone, $admin_created_at);
                                
                                echo "admin_created";
                            }
                        else
                            {
                                if($conn->errno == 1062)
                                    {
                                        echo "admin_exist";
                                    }
                                    else
                                        {
                                            echo "admin_error";
                                        }
                            }
                    }

                break;
                    
            


                                            // ---------------------------------------------------------------------------




                //GETTING Donor Basic Info for ADMIN  
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

                        $donors = getDonors($conn, $filters);

                        echo json_encode($donors);
                    }

                break;




                                            // ---------------------------------------------------------------------------





                //GETTING Donor FULL Info for ADMIN  
                case "get_donor_details":
                    {
                        if(empty($_POST['donor_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $donor_id = $_POST['donor_id'] ?? null;
                        $donor = getDonorDetails($conn, $donor_id);

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




                                            // ---------------------------------------------------------------------------




                // UPDATING Donor for ADMIN
                case "update_donor":
                    {
                        if(empty($_POST['donor_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        
                        $donor_id = $_POST['donor_id'] ?? null;
                        $name = $_POST['name'] ?? null;
                        $blood_group = $_POST['blood_group'] ?? null;
                        $phone = $_POST['phone'] ?? null;
                        $email = $_POST['email'] ?? null;
                        $city = $_POST['city'] ?? null;
                        $date_of_birth = $_POST['date_of_birth'] ?? null;


                        if(!empty($email) && !isValidEmail($email)) { echo "invalid_email"; exit(); }
                        if(!empty($phone) && !isValidPhone($phone)) { echo "invalid_phone"; exit(); }
                        if(!empty($blood_group) && !isValidBloodGroup($blood_group)) { echo "invalid_blood_group"; exit(); }


                        $result = updateDonorProfile(
                            $conn, $donor_id, $name, $phone, $email, $city, $blood_group, $date_of_birth, "admin");

                        if($result === true)
                            {
                                echo "donor_updated";
                            }
                        else
                            {
                                echo $result;
                            }


                    }

                break;


                                                // ---------------------------------------------------------------------------




                // To DELETE a DONOR for ADMIN
                case "delete_donor":
                    {
                        if(empty($_POST['donor_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $donor_id = $_POST['donor_id'] ?? null;
                        $result = deleteDonor($conn, $donor_id);

                        if($result)
                            {
                                echo "donor_deleted";
                            }
                        else
                            {
                                echo "delete_failed";
                            }
                    }

                break;




                                            // ---------------------------------------------------------------------------






                case "record_donation":
                    {
                        if (empty($_POST['donor_id'])) {
                            echo "missing_data";
                            exit();
                        }

                        $donor_id = (int)$_POST['donor_id'];
                        $units = isset($_POST['units']) ? (int)$_POST['units'] : 1;
                        $location = $_POST['location'] ?? null;
                        $notes = $_POST['notes'] ?? null;
                        $donation_date = $_POST['donation_date'] ?? null;
                        $admin_id = $_SESSION['admin_id'] ?? null;

                        $result = recordDonation($conn, $donor_id, $units, $location, $notes, $donation_date, $admin_id);
                        echo $result;
                    }
                break;





                                            // ---------------------------------------------------------------------------

                case "get_donation_records":
                    {
                        $donor_id = isset($_POST['donor_id']) && $_POST['donor_id'] !== "" ? (int)$_POST['donor_id'] : null;
                        $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 50;

                        $records = getDonationRecords($conn, $donor_id, $limit);
                        echo json_encode($records);
                    }
                break;
    


                                            // ---------------------------------------------------------------------------




                                            // ---------------------------------------------------------------------------



                                            // ---------------------------------------------------------------------------



                case "update_admin":
                    {
                        if(empty($_POST['admin_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $admin_id = $_POST['admin_id'] ?? null;
                        $admin_name = $_POST['admin_name'] ?? null;
                        $admin_phone = $_POST['admin_phone'] ?? null;
                        $admin_email = $_POST['admin_email'] ?? null;
                        $admin_city = $_POST['admin_city'] ?? null;


                        if(!empty($admin_email) && !isValidEmail($admin_email))
                            {
                                echo "invalid_email";
                                exit();
                            }

                        if(!empty($admin_phone) && !isValidPhone($admin_phone))
                            {
                                echo "invalid_phone";
                                exit();
                            }

                        $result = updateAdmin($conn, $admin_id, $admin_name, $admin_phone, $admin_email, $admin_city);

                        if($result === true)
                            {
                                echo "admin_updated";
                            }
                         else
                            {
                                echo $result;
                            }
                    }

                break;




                                        // ---------------------------------------------------------------------------





                case "get_admin_details":
                    {
                        if(empty($_POST['admin_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $admin_id = $_POST['admin_id'] ?? null;

                        $admin = getAdminDetails($conn, $admin_id);

                        if($admin)
                            {
                                echo json_encode($admin);
                            }
                        else
                            {
                                echo "admin_not_found";
                            }

                    }

                break;


                                            // ---------------------------------------------------------------------------





                case "get_admins":
                    {   
                        $filters = ["search_name" => $_POST['search_name'] ?? null,
                                    "sort_by" => $_POST['sort_by'] ?? null,
                                    "order" => $_POST['order'] ?? null];

                        $admins = getAdmins($conn, $filters);

                        echo json_encode($admins);


                    }

                break;



                                        // ---------------------------------------------------------------------------




                case "update_admin_status":
                    {
                        if(empty($_POST['admin_id']) || empty($_POST['status']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $admin_id = $_POST['admin_id'] ?? null;
                        $status = $_POST['status'] ?? null;

                        $result = updateAdminStatus($conn, $admin_id, $status);

                        echo $result;
                    }

                break;




                                        // ---------------------------------------------------------------------------

                

                case "get_donor_stats":
                    {
                        $stats = getDonorStats($conn);
                        echo json_encode($stats);

                    }

                break;



                                        // ---------------------------------------------------------------------------

                case "get_activity_logs":
                    {
                        $logs = getGroupedActivities($conn);
                                        
                        echo json_encode($logs);
                    }

                break;

                                        // ---------------------------------------------------------------------------


                case "get_top_donors":
                    {
                        $top = getTopDonors($conn);

                        echo json_encode($top);
                    }   

                break;



                
                                        // ---------------------------------------------------------------------------



                case "get_blood_requests":
                    {
                        $filters = [
                                    "status" => $_POST['status']      ?? null,
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




                                        // ---------------------------------------------------------------------------


                

                case "update_request_status":
                    {
                        if (empty($_POST['request_id']) || empty($_POST['status']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $request_id = (int)$_POST['request_id'];
                        $new_status = $_POST['status'];

                        echo updateRequestStatus($conn, $request_id, $new_status);
                    }

                break;




                                        // ---------------------------------------------------------------------------



                case "notify_donor":
                    {
                        if(empty($_POST['donor_id']) || empty($_POST['request_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $donor_id = (int)$_POST['donor_id'];
                        $request_id = (int)$_POST['request_id'];

                        echo notifySpecificDonor($conn, $donor_id, $request_id);
                    }

                break;




                                        // ---------------------------------------------------------------------------
                  
                                        
                case "delete_blood_request":
                    {
                        if(empty($_POST['request_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $request_id = (int)$_POST['request_id'];
                        echo deleteBloodRequest($conn, $request_id) ? "request_deleted" : "delete_failed";
                    }

                break;



                                        // ---------------------------------------------------------------------------

                case "send_recall":
                    {
                        if(empty($_POST['donor_id']))
                            {
                                echo "missing_data";
                                exit();
                            }

                        $donor_id = (int)$_POST['donor_id'];
                        echo sendRecallToDonor($conn, $donor_id);
                    }
                break;




                                        // ---------------------------------------------------------------------------



                case "get_contact_messages":
                    {
                        $filter = $_POST['filter'] ?? "all"; // all | read | unread

                        $messages = getContactMessages($conn, $filter);

                        if ($messages === false) {
                            echo "query_error";
                        } else {
                            echo json_encode($messages);
                        }
                    }
                break;                        



                                        // ---------------------------------------------------------------------------


                case "mark_contact_message_read":
                    {
                        if (empty($_POST['message_id'])) {
                            echo "missing_data";
                            exit();
                        }

                        $message_id = (int)$_POST['message_id'];
                        echo markContactMessageRead($conn, $message_id);
                    }
                break;    





                                        // ---------------------------------------------------------------------------


                
                case "delete_contact_message":
                    {
                        if (empty($_POST['message_id'])) {
                            echo "missing_data";
                            exit();
                        }

                        $message_id = (int)$_POST['message_id'];
                        echo deleteContactMessage($conn, $message_id);
                    }
                break;                        




                                        // ---------------------------------------------------------------------------




                case "get_current_admin":
                    {
                        $admin_id = $_SESSION['admin_id'] ?? null;

                        if (empty($admin_id)) {
                            echo "admin_not_logged_in";
                            exit();
                        }

                        $admin = getAdminDetails($conn, $admin_id);

                        if ($admin) {
                            echo json_encode($admin);
                        } else {
                            echo "admin_not_found";
                        }
                    }
                break;                                        



                                        // ---------------------------------------------------------------------------


                                        // ---------------------------------------------------------------------------
                                

                


                                        


                default:
                    {
                        echo "invalid_action";
                    }
                break;               

            }
    }
    
$conn->close();


?>
