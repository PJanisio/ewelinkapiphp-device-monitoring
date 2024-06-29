$(document).ready(function () {
    // Initialize variables for monitoring
    let previousData = {};
    let monitoringInterval;
    let heartbeatInterval;
    let requestCount = 0;
    let totalTime = 0;
    let failedRequestCount = 0;
    let pendingRequests = 0;
    let params = [];
    let firstResponseReceived = false;
    let useWebSocket = false;

    /**
     * Update the loader progress and text
     * @param {number} progress - Progress percentage
     * @param {string} text - Text to display in the loader
     */
    function updateLoader(progress, text) {
        $('#loader-progress').css('width', progress + '%').text(progress + '%');
        $('#loader-text').text(text);
    }

    // Show loader and initialize theme
    $('#loader').show();
    updateLoader(10, 'Loading Device List...');

    /**
     * Apply the selected theme
     * @param {string} theme - 'dark' or 'light'
     */
    function applyTheme(theme) {
        if (theme === 'dark') {
            $('html').attr('data-bs-theme', 'dark');
            $('#darkModeToggle').prop('checked', true);
            $('#darkModeIcon').addClass('dark-icon').removeClass('light-icon');
        } else {
            $('html').attr('data-bs-theme', 'light');
            $('#darkModeToggle').prop('checked', false);
            $('#darkModeIcon').addClass('light-icon').removeClass('dark-icon');
        }
    }

    /**
     * Initialize theme based on user preference or system setting
     */
    function initializeTheme() {
        const userTheme = localStorage.getItem('theme');
        if (userTheme) {
            applyTheme(userTheme);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme('dark');
        } else {
            applyTheme('light');
        }
    }

    initializeTheme();

    // Toggle theme on button click
    $('#darkModeToggle').click(function () {
        const theme = $('html').attr('data-bs-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        localStorage.setItem('theme', theme);
    });

    /**
     * Check user authorization
     */
    function checkAuthorization() {
        $.ajax({
            url: 'php/auth.php',
            method: 'GET',
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.redirect) {
                    window.location.href = data.redirect;
                } else if (data.success) {
                    updateLoader(40, 'Authorization successful. Fetching devices...');
                    fetchDevices();
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Authorization failed.');
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Authorization failed.');
            }
        });
    }

    /**
     * Fetch the list of devices
     */
    function fetchDevices() {
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'getDevicesList' },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    let deviceSelect = $('#deviceId');
                    deviceSelect.empty();
                    data.data.forEach(device => {
                        let option = $('<option>', {
                            value: device.deviceid,
                            text: device.name + ' (' + device.deviceid + ' - ' + device.productModel + ')',
                            'data-device-name': device.name,
                            'data-device-product': device.productModel,
                            'data-device-status': device.online ? 'ONLINE' : 'OFFLINE'
                        });
                        if (!device.online) {
                            option.attr('disabled', 'disabled');
                            option.text(option.text() + ' (OFFLINE)');
                        }
                        deviceSelect.append(option);
                    });
                    updateLoader(60, 'Device list loaded.');
                    setTimeout(function () {
                        $('#loader').hide();
                    }, 500);
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to load device list.');
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to load device list.');
            }
        });
    }

    /**
     * Fetch parameters of a selected device
     * @param {string} deviceId - ID of the selected device
     */
    function fetchDeviceParameters(deviceId) {
        console.log('Fetching device parameters for device ID:', deviceId);
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'getAllParams', device: deviceId },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    let paramForm = $('#paramForm');
                    paramForm.empty();
                    for (let param in data.data) {
                        paramForm.append('<div class="form-check col-md-4"><input class="form-check-input" type="checkbox" name="params" value="' + param + '"><label class="form-check-label">' + param + '</label></div>');
                    }
                    $('#startMonitoring').show();
                    $('#parameters-content').show();
                    updateLoader(80, 'Parameters loaded.');
                    setTimeout(function () {
                        $('#loader').hide();
                    }, 500);

                    if (data.data.switch !== undefined) {
                        let switchState = data.data.switch;
                        $('#deviceToggle').prop('checked', switchState === 'on');
                        updateToggleLabel(switchState === 'on' ? 'SWITCHED ON' : 'SWITCHED OFF');
                    }

                    $('#deviceControl').show();
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to fetch parameters.');
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to fetch parameters.');
            }
        });
    }

    /**
     * Start monitoring the selected device parameters
     * @param {string} deviceId - ID of the selected device
     * @param {number} interval - Monitoring interval in milliseconds
     */
    function startMonitoring(deviceId, interval) {
        console.log('Starting monitoring for device ID:', deviceId, 'with interval:', interval);
        updateLoader(50, 'Starting monitoring...');
        updateLoader(60, 'Connecting...');
        updateLoader(70, 'Sending request...');
        updateLoader(80, 'Waiting for response...');
        firstResponseReceived = false;

        monitoringInterval = setInterval(function () {
            pendingRequests++;
            const startTime = performance.now();
            $.ajax({
                url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
                method: 'GET',
                data: { action: 'getLiveParams', device: deviceId, params: params },
                success: function (response) {
                    pendingRequests--;
                    const endTime = performance.now();
                    const elapsedTime = ((endTime - startTime) / 1000).toFixed(2);
                    requestCount++;
                    totalTime += parseFloat(elapsedTime);
                    let averageTime = (totalTime / requestCount).toFixed(2);

                    let data = typeof response === 'string' ? JSON.parse(response) : response;
                    if (data.success && data.data !== null) {
                        let liveData = $('#liveData');
                        let changesContainer = $('#changesContainer');

                        let filteredData = {};
                        params.forEach(param => {
                            if (data.data[param] !== undefined) {
                                filteredData[param] = data.data[param]; // No defaulting to 0
                            }
                        });
                        liveData.text(JSON.stringify(filteredData, null, 2));

                        params.forEach(param => {
                            if (previousData[param] !== undefined && previousData[param] !== data.data[param]) {
                                let logEntry = '<div class="changed">Time: ' + new Date().toLocaleTimeString() + ' - Parameter: ' + param + ' - Old Value: ' + previousData[param] + ' - New Value: ' + data.data[param] + '</div>';
                                changesContainer.prepend(logEntry);

                                $('#notificationSound')[0].play();
                            }
                            previousData[param] = data.data[param];
                        });

                        updateToggleState(data.data);

                        if (!firstResponseReceived) {
                            $('#deviceToggle').prop('disabled', false);
                            firstResponseReceived = true;
                        }

                        updateLoader(100, 'Monitoring started.');
                        setTimeout(function () {
                            $('#loader').hide();
                        }, 500);
                        updateWebSocketStatus(true);
                        $('#heartbeatTime').text(elapsedTime);
                        if (useWebSocket) {
                            $('#answerTimeLog').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                        } else {
                            $('#answerTimeLogHttp').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                        }
                    } else {
                        console.error(data.error ? data.error : 'Unknown error');
                        failedRequestCount++;
                        if (useWebSocket) {
                            $('#answerTimeLog').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                        } else {
                            $('#answerTimeLogHttp').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                        }
                        updateWebSocketStatus(false);
                    }
                },
                error: function (xhr, status, error) {
                    console.error(error);
                    failedRequestCount++;
                    pendingRequests--;
                    if (useWebSocket) {
                        $('#answerTimeLog').text(`Requests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                    } else {
                        $('#answerTimeLogHttp').text(`Requests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                    }
                    updateWebSocketStatus(false);
                }
            });
        }, interval);

        if (useWebSocket) {
            heartbeatInterval = setInterval(function () {
                $('#heartbeatLog').text('Heartbeat sent at ' + new Date().toLocaleTimeString());
            }, 10000);
        }
    }

    /**
     * Stop monitoring the device parameters
     */
    function stopMonitoring() {
        console.log('Stopping monitoring');
        clearInterval(monitoringInterval);
        clearInterval(heartbeatInterval);
        updateLoader(50, 'Stopping monitoring...');
        updateLoader(60, 'Fetching current parameters...');

        let deviceId = $('#deviceId').val();
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'getAllParams', device: deviceId },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    if (data.data.switch !== undefined) {
                        let switchState = data.data.switch;
                        $('#deviceToggle').prop('checked', switchState === 'on');
                        updateToggleLabel(switchState === 'on' ? 'SWITCHED ON' : 'SWITCHED OFF');
                    }
                    $('#loader').hide();
                    $('#parameters').show();
                    $('#stopMonitoring').hide();
                    $('#heartbeatLog').text('Monitoring stopped.');
                    updateWebSocketStatus(false);
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to fetch current parameters.');
                    setTimeout(function () {
                        $('#loader').hide();
                    }, 500);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to fetch current parameters.');
                setTimeout(function () {
                    $('#loader').hide();
                }, 500);
            }
        });
    }

    /**
     * Update the WebSocket status icon
     * @param {boolean} isConnected - WebSocket connection status
     */
    function updateWebSocketStatus(isConnected) {
        let wsIcon = $('#ws-icon');
        if (isConnected) {
            wsIcon.removeClass('ws-offline').addClass('ws-online');
        } else {
            wsIcon.removeClass('ws-online').addClass('ws-offline');
        }
    }

    /**
     * Update the toggle state based on received data
     * @param {Object} data - Received data
     */
    function updateToggleState(data) {
        if (data.switch !== undefined) {
            let switchState = data.switch;
            $('#deviceToggle').prop('checked', switchState === 'on');
            updateToggleLabel(switchState === 'on' ? 'SWITCHED ON' : 'SWITCHED OFF');
            $('#deviceToggle').prop('disabled', false); // Ensure toggle is enabled
        }
    }

    /**
     * Update the toggle label with the current state
     * @param {string} status - Current switch status
     */
    function updateToggleLabel(status) {
        let selectedDevice = $('#deviceId option:selected');
        let deviceName = selectedDevice.data('device-name');
        let deviceProduct = selectedDevice.data('device-product');
        let statusClass = status === 'SWITCHED ON' ? 'text-success fw-bold' : 'text-danger fw-bold';
        let labelText = `${deviceName} (${deviceProduct}) - <span class="${statusClass}">${status}</span>`;
        $('#deviceToggleLabel').html(labelText);
    }

    // Fetch device parameters on device change
    $('#deviceId').change(function () {
        let deviceId = $('#deviceId').val();
        if (!deviceId) {
            alert('Please select a device');
            return;
        }
        $('#loader').show();
        updateLoader(20, 'Fetching device parameters...');
        fetchDeviceParameters(deviceId);
    });

    // Start monitoring on button click
    $('#startMonitoring').click(function () {
        let deviceId = $('#deviceId').val();
        params = [];
        $('#paramForm input:checked').each(function () {
            params.push($(this).val());
        });
        if (params.length === 0) {
            alert('Please select at least one parameter to monitor');
            return;
        }
        let interval = $('#requestInterval').val() * 1000;
        if (interval < 1000) {
            alert('Interval must be at least 1 second.');
            return;
        }
        $('#loader').show();
        updateLoader(30, 'Connecting...');
        $('#parameters').hide();
        startMonitoring(deviceId, interval);
        $('#stopMonitoring').show();
    });

    // Stop monitoring on button click
    $('#stopMonitoring').click(function () {
        stopMonitoring();
    });

    // Select/Deselect all parameters
    $('#selectAll').click(function () {
        $('#paramForm input').prop('checked', this.checked);
    });

    // Uncheck 'Select All' if any parameter is unchecked
    $('#paramForm').on('change', 'input', function () {
        if (!this.checked) {
            $('#selectAll').prop('checked', false);
        }
    });

    // Toggle device state on checkbox change
    $('#deviceToggle').change(function () {
        let deviceId = $('#deviceId').val();
        let newState = $('#deviceToggle').prop('checked') ? 'on' : 'off';
        $('#deviceToggle').prop('disabled', true);
        $('#loader').show();
        updateLoader(30, 'Updating device state...');
        updateLoader(50, 'Waiting for response...');
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'updateDeviceState', device: deviceId, newState: newState },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    console.log('Device state updated successfully');
                    updateLoader(70, 'Fetching current parameters...');
                    fetchDeviceParameters(deviceId);
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to update device state.');
                    $('#deviceToggle').prop('disabled', false);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to update device state.');
                $('#deviceToggle').prop('disabled', false);
            }
        });
    });

    // Switch to HTTP monitoring
    $('#useHttp').click(function () {
        if (useWebSocket) {
            stopMonitoring();
        }
        useWebSocket = false;
        $('#httpStats').show();
        $('#websocketsStats').hide();
        $('#heartbeat').hide();
        $('#useHttp').removeClass('btn-outline-primary').addClass('btn-primary');
        $('#useWebSocket').removeClass('btn-primary').addClass('btn-outline-secondary');
        $('#loader').show();
        updateLoader(10, 'Switching to HTTP...');
        fetchDevices();
    });

    // Switch to WebSocket monitoring
    $('#useWebSocket').click(function () {
        if (!useWebSocket) {
            stopMonitoring();
        }
        useWebSocket = true;
        $('#httpStats').hide();
        $('#websocketsStats').show();
        $('#heartbeat').show();
        $('#useHttp').removeClass('btn-primary').addClass('btn-outline-primary');
        $('#useWebSocket').removeClass('btn-outline-secondary').addClass('btn-primary');
        $('#loader').show();
        updateLoader(10, 'Switching to WebSocket...');
        fetchDevices();
    });

    // Check authorization and load initial data
    checkAuthorization();
    $('#useHttp').click(); // Use HTTP by default
});
