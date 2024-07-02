<?php

require_once __DIR__ . '../../autoloader.php';

$action = $_GET['action'] ?? $_POST['action'] ?? null;
$deviceIdentifier = $_GET['device'] ?? $_POST['device'] ?? null;
$params = $_POST['params'] ?? null;

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
            // Always send empty params to getDataWebSocket
            $response = $devices->getDataWebSocket($deviceIdentifier, []);
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
    $outlet = $_GET['outlet'] ?? null; // Add outlet parameter
    if ($newState === null) {
        echo json_encode(['success' => false, 'error' => 'New state not provided']);
        break;
    }
    if ($outlet !== null) {
        $params = [
            'switch' => $newState,
            'outlet' => (int)$outlet
        ];
    } else {
        $params = [
            'switch' => $newState
        ];
    }
    $response = $devices->forceUpdateDevice($deviceIdentifier, $params);
    echo json_encode(['success' => true, 'data' => $response]);
    break;
        case 'forceUpdateDevice':
            $params = json_decode($params, true);
            $response = $devices->forceUpdateDevice($deviceIdentifier, $params);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        default:
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
