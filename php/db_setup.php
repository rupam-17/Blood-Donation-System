<?php

if (php_sapi_name() !== "cli")
    {
        http_response_code(403);
        exit("forbidden");
    }

require_once "config.php";


$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if($conn->connect_error){
        error_log("DataBase Connection Failed:" . $conn->connect_error);
        http_response_code(500);
        exit("server_error");
    }



// Creating the ADMIN Table
$sql_admin = "create table if not exists admins(
    id int auto_increment primary key,
    admin_name varchar(100) not null,
    date_of_birth DATE not null,
    admin_phone varchar(15) unique not null,
    admin_email varchar(100) unique not null,
    admin_city varchar(100) not null,
    admin_password varchar(255) not null,
    admin_photo varchar(255) null,
    status enum('active','inactive') default 'active',
    admin_created_at date,
    last_login datetime null

    )";

if ($conn->query($sql_admin) !== TRUE)
{
    error_log("Admins table create failed: " . $conn->error);
    // echo "admin_table_error";
}






//Create Donor Table
$sql = "create table if not exists donors(
    id int auto_increment primary key,
    name varchar(100) not null,
    blood_group varchar(5) not null,
    phone varchar(15) not null unique,
    email varchar(50) not null unique,
    city varchar(100) not null,

    latitude double null,
    longitude double null,

    date_of_birth DATE not null,
    last_donation_date date null,
    next_eligible_date date null,
    availability enum('available','unavailable') default 'available',
    auto_unavailable BOOLEAN DEFAULT FALSE,
    donor_photo varchar(255) null,
    total_donations int default 0,
    last_login datetime null,
    password varchar(255) not null

    )";
    

if ($conn->query($sql) !== TRUE)
{
    error_log("Donors table create failed: " . $conn->error);
    // echo "donor_table_error";
}





// ACTIVITY Table
$sql_activity = "CREATE TABLE IF NOT EXISTS activity_logs(
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_name VARCHAR(100) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)";

$conn->query($sql_activity);





// BLOOD REQUESTS Table
$sql_blood_requests = "CREATE TABLE IF NOT EXISTS blood_requests(
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_name VARCHAR(100) NOT NULL,
        requester_phone VARCHAR(15) NOT NULL,
        requester_email VARCHAR(100) NULL,
        blood_group VARCHAR(5) NOT NULL,
        units_needed INT NOT NULL DEFAULT 1,
        city VARCHAR(100) NOT NULL,
        hospital_name VARCHAR(150) NULL,
        urgency ENUM('normal','urgent','critical') NOT NULL DEFAULT 'normal',
        status ENUM('pending','matched','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )";

if($conn->query($sql_blood_requests) !== TRUE)
    {
        error_log("Blood requests table create failed: " . $conn->error);
    }



// Contact messages
$sql_contactus = "CREATE TABLE IF NOT EXISTS contact_messages (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50), email VARCHAR(50), phone VARCHAR(15), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, message TEXT, is_read TINYINT(1) NOT NULL DEFAULT 0)";

$conn->query($sql_contactus);




// Contact messages
$sql_donation = "CREATE TABLE IF NOT EXISTS donation_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donor_id INT NOT NULL,
  admin_id INT NULL,
  units INT NOT NULL DEFAULT 1,
  donation_date DATE NOT NULL,
  location VARCHAR(150) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
)";

$conn->query($sql_donation);



$conn->close();

?>