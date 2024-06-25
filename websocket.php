<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/autoloader.php';

$action = $_GET['action'] ?? null;
$deviceIdentifier = $_GET['device'] ?? null;
$params = $_GET['params'] ?? [];

$httpClient = new HttpClient();
$devices = new Devices($httpClient);

header('Content-Type: application/json');

try {
    switch ($action) {
        case 'getAllParams':
            $response = $devices->getAllDeviceParamLive($deviceIdentifier);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'getLiveParams':
            $response = $devices->forceGetData($deviceIdentifier, []);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'getDevicesList':
            $devicesList = $devices->getDevicesList();
            $response = [];
            foreach ($devicesList as $name => $deviceStatus) {
                $response[] = [
                    'name' => $name,
                    'deviceid' => $deviceStatus['deviceid'],
                    'productModel' => $deviceStatus['productModel']
                ];
            }
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        default:
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
