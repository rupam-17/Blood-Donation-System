<?php


if(session_status() === PHP_SESSION_NONE)
    {
        session_start();
    }


function requireAdmin()
{
    if(!isset($_SESSION['user_id']) || !isset($_SESSION['role']) ||$_SESSION['role'] !== 'admin' || !isset($_SESSION['admin_id'])
            )
        {
            http_response_code(401);
            echo "admin_not_logged_in";
            exit();
        }
}

?>