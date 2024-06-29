<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '../../autoloader.php';

$action = $_GET['action'] ?? null;
$deviceIdentifier = $_GET['device'] ?? null;

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
            $params = $_GET['params'] ?? [];
            $response = $devices->getDeviceParamLive($deviceIdentifier, $params);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'getDevicesList':
            $devicesList = $devices->getDevicesList();
            $response = [];
            foreach ($devicesList as $name => $deviceStatus) {
                $response[] = [
                    'name' => $name,
                    'deviceid' => $deviceStatus['deviceid'],
                    'productModel' => $deviceStatus['productModel'],
                    'online' => $deviceStatus['online']
                ];
            }
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'updateDeviceState':
            $newState = $_GET['newState'] ?? null;
            if ($newState === null) {
                echo json_encode(['success' => false, 'error' => 'New state not provided']);
                break;
            }
            $params = [
                'switch' => $newState
            ];
            $response = $devices->setDeviceStatus($deviceIdentifier, $params);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        default:
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>