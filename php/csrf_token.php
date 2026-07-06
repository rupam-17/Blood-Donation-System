<?php
require_once "common_functions.php";

header("Content-Type: application/json");
echo json_encode(["csrf_token" => ensureCsrfToken()]);

?>