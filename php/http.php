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
            $params = $_GET['params'] ?? [];
            $response = $devices->getDeviceParamLive($deviceIdentifier, $params);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'getDevicesList':
            // Fetch the latest devices data before getting the devices list
            $devices->fetchDevicesData();
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
            $response = $devices->setDeviceStatus($deviceIdentifier, $params);
            echo json_encode(['success' => true, 'data' => $response]);
            break;
        case 'setDeviceStatus':
            $params = json_decode($params, true);
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
