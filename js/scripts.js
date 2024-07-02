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
     * @param {boolean} isModal - Whether the loader is for a modal window
     */
    function updateLoader(progress, text, isModal = false) {
        if (isModal) {
            $('#modal-loader-progress').css('width', progress + '%').text(progress + '%');
            $('#modal-loader-text').text(text);
        } else {
            $('#progressBar').css('width', progress + '%').text(progress + '%');
            $('#progressText').text(text);
        }
    }

    // Show loader and initialize theme
    showProgressModal();
    updateLoader(10, 'Loading Device List...', false);

    /**
     * Apply the selected theme
     * @param {string} theme - 'dark' or 'light'
     */
    function applyTheme(theme) {
        if (theme === 'dark') {
            $('html').attr('data-bs-theme', 'dark');
            $('#darkModeToggle').prop('checked', true);
            $('#darkModeIcon').removeClass('fa-sun').addClass('fa-moon');
        } else {
            $('html').attr('data-bs-theme', 'light');
            $('#darkModeToggle').prop('checked', false);
            $('#darkModeIcon').removeClass('fa-moon').addClass('fa-sun');
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
                    updateLoader(40, 'Authorization successful. Fetching devices...', false);
                    fetchDevices();
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Authorization failed.', false);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Authorization failed.', false);
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
                    let currentDevice = deviceSelect.val();  // Save the current selection
                    deviceSelect.empty();
                    deviceSelect.append('<option value="">Select Device</option>');
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
                    deviceSelect.val(currentDevice);  // Restore the previous selection
                    updateLoader(100, 'Device list loaded.', false);
                    setTimeout(function () {
                        $('#progressModal').modal('hide');
                    }, 500);
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to load device list.', false);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to load device list.', false);
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
                        let value = data.data[param];
                        if (typeof value === 'object' && !Array.isArray(value)) {
                            continue; // Skip parameters with [object Object] values
                        }
                        paramForm.append('<div class="form-check col-md-4"><input class="form-check-input" type="checkbox" name="params" value="' + param + '"><label class="form-check-label">' + param + '</label></div>');
                    }
                    $('#startMonitoring').show();
                    $('#parameters-content').show();
                    $('#parameters').show(); // Unhide the parameters section
                    $('#monitoringControls').show(); // Show request interval
                    updateLoader(100, 'Parameters loaded.', false);
                    setTimeout(function () {
                        $('#progressModal').modal('hide');
                    }, 500);

                    updateDeviceToggles(data.data);

                    $('#deviceControl').show();
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to fetch parameters.', false);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to fetch parameters.', false);
            }
        });
    }

    // Function to update device toggles for multi-channel devices
    function updateDeviceToggles(data) {
        let multiChannelToggles = $('#multiChannelToggles');
        multiChannelToggles.empty();
        if (data.switches !== undefined && Array.isArray(data.switches)) {
            data.switches.forEach((switchState, index) => {
                let switchId = `deviceToggle_${index}`;
                let switchLabel = `Switch ${index + 1}`;
                multiChannelToggles.append(`
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="${switchId}" data-index="${index}" ${switchState.switch === 'on' ? 'checked' : ''}>
                        <label class="form-check-label" for="${switchId}">${switchLabel}</label>
                    </div>
                `);
            });

            multiChannelToggles.find('.form-check-input').change(function () {
                let deviceId = $('#deviceId').val();
                let index = $(this).data('index');
                let newState = $(this).prop('checked') ? 'on' : 'off';
                updateDeviceSwitchState(deviceId, index, newState);
            });
        } else {
            multiChannelToggles.append(`
                <div class="d-flex align-items-center">
                    <div class="form-check form-switch me-3">
                        <input class="form-check-input" type="checkbox" id="deviceToggle" ${data.switch === 'on' ? 'checked' : ''}>
                        <label class="form-check-label" for="deviceToggle">Turn ON/OFF device:</label>
                    </div>
                    <div id="deviceToggleLabel" class="ms-2"></div>
                </div>
            `);

            $('#deviceToggle').change(function () {
                let deviceId = $('#deviceId').val();
                let newState = $(this).prop('checked') ? 'on' : 'off';
                updateDeviceState(deviceId, newState);
            });

            let initialStatus = data.switch === 'on' ? 'on' : 'off';
            updateToggleLabel(initialStatus);
        }
    }

    // Function to update the device state for single-channel devices
    function updateDeviceState(deviceId, newState) {
        showProgressModal();
        updateLoader(30, 'Updating device state...', false);
        updateLoader(50, 'Waiting for response...', false);
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'updateDeviceState', device: deviceId, newState: newState },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    console.log('Device state updated successfully');
                    updateLoader(100, 'Device state updated.', false);
                    setTimeout(function () {
                        $('#progressModal').modal('hide');
                    }, 500);
                    fetchDeviceParameters(deviceId); // This will update the toggle state based on the actual device state
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to update device state.', false);
                    $('#deviceToggle').prop('disabled', false); // Enable the toggle in case of error
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to update device state.', false);
                $('#deviceToggle').prop('disabled', false); // Enable the toggle in case of error
            }
        });
    }

    // Function to update the device state for multi-channel devices
    function updateDeviceSwitchState(deviceId, index, newState) {
        showProgressModal();
        updateLoader(30, 'Updating device switch state...', false);
        updateLoader(50, 'Waiting for response...', false);
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'updateDeviceState', device: deviceId, newState: newState, outlet: index },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    console.log('Device switch state updated successfully');
                    updateLoader(100, 'Device switch state updated.', false);
                    setTimeout(function () {
                        $('#progressModal').modal('hide');
                    }, 500);
                    fetchDeviceParameters(deviceId); // This will update the toggle state based on the actual device state
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to update device switch state.', false);
                    $('#deviceToggle_' + index).prop('disabled', false); // Enable the toggle in case of error
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to update device switch state.', false);
                $('#deviceToggle_' + index).prop('disabled', false); // Enable the toggle in case of error
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
        updateLoader(50, 'Starting monitoring...', false);
        updateLoader(60, 'Connecting...', false);
        updateLoader(70, 'Sending request...', false);
        updateLoader(80, 'Waiting for response...', false);
        firstResponseReceived = false;

        // Show hidden sections
        $('#deviceData').show();
        if (useWebSocket) {
            $('#heartbeat, #websocketsStats').show();
        } else {
            $('#httpStats').show();
        }
        $('#changesLog').show();

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
                                let logEntry = '<div>Time: ' + new Date().toLocaleTimeString() + ' - Parameter: ' + param + ' - Old Value: <span class="changed-value">' + previousData[param] + '</span> - New Value: <span class="changed-value">' + data.data[param] + '</span></div>';
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

                        updateLoader(100, 'Monitoring started.', false);
                        setTimeout(function () {
                            $('#progressModal').modal('hide');
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
        showProgressModal();
        updateLoader(50, 'Stopping monitoring...', false);
        updateLoader(60, 'Fetching current parameters...', false);

        let deviceId = $('#deviceId').val();
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'getAllParams', device: deviceId },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    updateDeviceToggles(data.data);
                    $('#progressModal').modal('hide');
                    $('#parameters').show();
                    $('#stopMonitoring').hide();
                    $('#heartbeatLog').text('Monitoring stopped.');
                    updateWebSocketStatus(false);
                    // Hide sections after stopping monitoring
                    $('#deviceData, #heartbeat, #websocketsStats, #httpStats, #changesLog, #monitoringControls').hide();
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to fetch current parameters.', false);
                    setTimeout(function () {
                        $('#progressModal').modal('hide');
                    }, 500);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to fetch current parameters.', false);
                setTimeout(function () {
                    $('#progressModal').modal('hide');
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
            updateToggleLabel(switchState === 'on' ? 'on' : 'off');
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
        let statusClass = status === 'on' ? 'ws-online' : 'ws-offline';
        let labelText = `${deviceName} (${deviceProduct}) - <span class="ws-icon ${statusClass}"></span>`;
        $('#deviceToggleLabel').html(labelText);
    }

    // Fetch device parameters on device change
    $('#deviceId').change(function () {
        let deviceId = $('#deviceId').val();
        if (!deviceId) {
            alert('Please select a device');
            return;
        }
        showProgressModal();
        updateLoader(20, 'Fetching device parameters...', false);
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
        showProgressModal();
        updateLoader(30, 'Connecting...', false);
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

    // Switch to HTTP monitoring
    $('#useHttp').click(function () {
        if (useWebSocket) {
            stopMonitoring();
        }
        useWebSocket = false;
        $('#heartbeat, #websocketsStats').hide();
        $('#useHttp').removeClass('btn-outline-primary').addClass('btn-primary');
        $('#useWebSocket').removeClass('btn-primary').addClass('btn-outline-secondary');
        $('#monitoringControls').hide(); // Hide request interval
        showProgressModal();
        updateLoader(10, 'Switching to HTTP...', false);
        fetchDevices();
    });

    // Switch to WebSocket monitoring
    $('#useWebSocket').click(function () {
        if (!useWebSocket) {
            stopMonitoring();
        }
        useWebSocket = true;
        $('#requestInterval').val(15); // Default interval for WebSocket
        $('#httpStats').hide();
        $('#useHttp').removeClass('btn-primary').addClass('btn-outline-primary');
        $('#useWebSocket').removeClass('btn-outline-secondary').addClass('btn-primary');
        $('#monitoringControls').hide(); // Hide request interval
        showProgressModal();
        updateLoader(10, 'Switching to WebSocket...', false);
        fetchDevices();
    });

    // Check authorization and load initial data
    checkAuthorization();
    $('#useHttp').click(); // Use HTTP by default

    // Open Advanced Control modal
    $('#advancedControl').click(function () {
        let deviceId = $('#deviceId').val();
        if (!deviceId) {
            alert('Please select a device');
            return;
        }
        showProgressModal(true);
        updateLoader(20, 'Fetching device parameters for advanced control...', true);
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'GET',
            data: { action: 'getAllParams', device: deviceId },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    let formContent = $('#advancedControlFormContent');
                    formContent.empty();

                    // Add color picker if color parameters exist
                    if (data.data.colorR !== undefined && data.data.colorG !== undefined && data.data.colorB !== undefined) {
                        formContent.append(`
                            <div class="mb-3 col-md-12">
                                <label for="colorPicker" class="form-label">Select Color for: colorR, colorG, colorB</label>
                                <input type="color" class="form-control" id="colorPicker" value="#000000">
                            </div>
                        `);
                        $('#colorPicker').change(function () {
                            let color = $(this).val();
                            let r = parseInt(color.slice(1, 3), 16);
                            let g = parseInt(color.slice(3, 5), 16);
                            let b = parseInt(color.slice(5, 7), 16);
                            $('#colorR').val(r);
                            $('#colorG').val(g);
                            $('#colorB').val(b);
                        });
                    }

                    for (let param in data.data) {
                        let value = data.data[param];
                        if (typeof value === 'object' && !Array.isArray(value)) {
                            continue; // Skip parameters with [object Object] values
                        }
                        if (Array.isArray(value)) {
                            value.forEach((subValue, index) => {
                                if (typeof subValue === 'object') {
                                    for (let subParam in subValue) {
                                        formContent.append(`
                                            <div class="mb-3 col-md-6">
                                                <label for="${param}_${index}_${subParam}" class="form-label">${param}[${index}].${subParam}</label>
                                                <input type="text" class="form-control" id="${param}_${index}_${subParam}" name="${param}[${index}].${subParam}" value="${subValue[subParam]}">
                                            </div>
                                        `);
                                    }
                                } else {
                                    formContent.append(`
                                        <div class="mb-3 col-md-6">
                                            <label for="${param}_${index}" class="form-label">${param}[${index}]</label>
                                            <input type="text" class="form-control" id="${param}_${index}" name="${param}[${index}]" value="${subValue}">
                                        </div>
                                    `);
                                }
                            });
                        } else {
                            formContent.append(`
                                <div class="mb-3 col-md-6">
                                    <label for="${param}" class="form-label">${param}</label>
                                    <input type="text" class="form-control" id="${param}" name="${param}" value="${value}">
                                </div>
                            `);
                        }
                    }

                    $('#advancedControlModal').modal('show');
                    updateLoader(100, 'Parameters loaded.', true);
                    setTimeout(function () {
                        $('#modalProgressModal').modal('hide');
                    }, 500);
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to fetch parameters.', true);
                    setTimeout(function () {
                        $('#modalProgressModal').modal('hide');
                    }, 500);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to fetch parameters.', true);
                setTimeout(function () {
                    $('#modalProgressModal').modal('hide');
                }, 500);
            }
        });
    });

    // Handle Advanced Control form submission
    $('#sendAdvancedControl').click(function () {
        let deviceId = $('#deviceId').val();
        let formData = $('#advancedControlForm').serializeArray();
        let params = {};
        formData.forEach(item => {
            let keys = item.name.split('[').map(k => k.replace(']', ''));
            let lastKey = keys.pop();
            let nestedParam = keys.reduce((obj, key) => obj[key] = obj[key] || {}, params);
            nestedParam[lastKey] = item.value;
        });

        showProgressModal(true);
        updateLoader(30, 'Sending updated parameters...', true);
        let action = useWebSocket ? 'forceUpdateDevice' : 'setDeviceStatus';
        $.ajax({
            url: useWebSocket ? 'php/websocket.php' : 'php/http.php',
            method: 'POST',
            data: {
                action: action,
                device: deviceId,
                params: JSON.stringify(params)
            },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    console.log('Device parameters updated successfully');
                    updateLoader(100, 'Parameters updated successfully.', true);
                    setTimeout(function () {
                        $('#modalProgressModal').modal('hide');
                    }, 500);
                    $('#advancedControlModal').modal('hide');
                } else {
                    console.error(data.error ? data.error : 'Unknown error');
                    updateLoader(100, 'Failed to update parameters.', true);
                    setTimeout(function () {
                        $('#modalProgressModal').modal('hide');
                    }, 500);
                }
            },
            error: function (xhr, status, error) {
                console.error(error);
                updateLoader(100, 'Failed to update parameters.', true);
                setTimeout(function () {
                    $('#modalProgressModal').modal('hide');
                }, 500);
            }
        });
    });

    /**
     * Show the progress modal
     * @param {boolean} isModal - Whether it is for a modal window
     */
    function showProgressModal(isModal = false) {
        if (isModal) {
            $('#modalProgressModal').modal('show');
        } else {
            $('#progressModal').modal('show');
        }
    }
});
