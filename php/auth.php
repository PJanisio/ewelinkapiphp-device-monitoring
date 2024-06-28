<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/autoloader.php';

$httpClient = new HttpClient();
$token = new Token($httpClient);

header('Content-Type: application/json');

try {
    if (isset($_GET['code']) && isset($_GET['region'])) {
        $tokenData = $token->getToken();
        echo json_encode(['success' => true, 'tokenData' => $tokenData]);
        $token->redirectToUrl(Constants::REDIRECT_URL);
    } else {
        if (!$token->checkAndRefreshToken()) {
            $loginUrl = $httpClient->getLoginUrl();
            echo json_encode(['redirect' => $loginUrl]);
        } else {
            echo json_encode(['success' => true, 'message' => 'Token is valid']);
        }
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
