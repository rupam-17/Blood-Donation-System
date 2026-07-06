<?php

// require_once "auth.php";
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/common_functions.php';

header('Content-Type: application/json');

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error)
    {
        echo json_encode([
                            "success" => false,
                            "message" => "Database connection failed"
                        ]);
        exit;
    }

$stats = getDonorStats($conn);

echo json_encode([
            "success" => true,
            "total_donors" => $stats['total_donors'] ?? 0,
            "available_donors" => $stats['available_donors'] ?? 0,
            "total_donations" => $stats['total_donations'] ?? 0,
            "registered_last_7_days" => $stats['registered_last_7_days'] ?? 0

        ]);

$conn->close();
?>
