$(document).ready(function () {
    let previousData = {};
    let monitoringInterval;
    let heartbeatInterval;
    let websocketConnected = false;
    let requestCount = 0;
    let totalTime = 0;
    let failedRequestCount = 0;
    let pendingRequests = 0;
    let params = []; // Declare params here to make it available in the scope

    /**
     * Update the loader with progress and text
     */
    function updateLoader(progress, text) {
        $('#loader-progress').css('width', progress + '%').text(progress + '%');
        $('#loader-text').text(text);
    }

    // Show loader initially
    $('#loader').show();
    updateLoader(10, 'Loading Device List...');

    /**
     * Apply the theme based on the user's preference or system setting
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
     * Initialize theme based on system preference or saved user preference
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

    // Initialize theme on document ready
    initializeTheme();

    // Add click event to toggle dark mode
    $('#darkModeToggle').click(function () {
        const theme = $('html').attr('data-bs-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        localStorage.setItem('theme', theme);
    });

    /**
     * Check authorization
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
            url: 'php/websocket.php',
            method: 'GET',
            data: {
                action: 'getDevicesList'
            },
            success: function (response) {
                let data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    let deviceSelect = $('#deviceId');
                    deviceSelect.empty();
                    data.data.forEach(device => {
                        deviceSelect.append('<option value="' + device.deviceid + '">' + device.name + ' (' + device.deviceid + ' - ' + device.productModel + ')</option>');
                    });
                    updateLoader(60, 'Device list loaded.');
                    setTimeout(function() {
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
     * Fetch device parameters
     */
    function fetchDeviceParameters(deviceId) {
        console.log('Fetching device parameters for device ID:', deviceId);
        $.ajax({
            url: 'php/websocket.php',
            method: 'GET',
            data: {
                action: 'getAllParams',
                device: deviceId
            },
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
                    setTimeout(function() {
                        $('#loader').hide();
                    }, 500);
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
     * Start monitoring device parameters
     */
    function startMonitoring(deviceId, interval) {
        console.log('Starting monitoring for device ID:', deviceId, 'with interval:', interval);
        updateLoader(50, 'Starting monitoring...');
        updateLoader(60, 'Connecting to WebSocket...');
        updateLoader(70, 'Sending heartbeat...');
        updateLoader(80, 'Sending request...');
        monitoringInterval = setInterval(function () {
            pendingRequests++;
            const startTime = performance.now();
            $.ajax({
                url: 'php/websocket.php',
                method: 'GET',
                data: {
                    action: 'getLiveParams',
                    device: deviceId,
                    params: []  // Always send empty params
                },
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
                        
                        // Filter only selected parameters
                        let filteredData = {};
                        params.forEach(param => {
                            if (data.data[param] !== undefined) {
                                filteredData[param] = data.data[param];
                            }
                        });
                        liveData.text(JSON.stringify(filteredData, null, 2));

                        // Log changes and play notification sound
                        params.forEach(param => {
                            if (previousData[param] && previousData[param] !== data.data[param]) {
                                let logEntry = '<div class="changed">Time: ' + new Date().toLocaleTimeString() + ' - Parameter: ' + param + ' - Old Value: ' + previousData[param] + ' - New Value: ' + data.data[param] + '</div>';
                                changesContainer.prepend(logEntry); // Add new changes to the top

                                // Play notification sound
                                $('#notificationSound')[0].play();
                            }
                            previousData[param] = data.data[param];
                        });
                        updateLoader(100, 'Monitoring started.');
                        setTimeout(function() {
                            $('#loader').hide();
                        }, 500);
                        updateWebSocketStatus(true);
                        $('#heartbeatTime').text(elapsedTime);
                        $('#answerTimeLog').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                    } else {
                        console.error(data.error ? data.error : 'Unknown error');
                        failedRequestCount++;
                        $('#answerTimeLog').text(`Last answer: ${elapsedTime} seconds\nAverage answer: ${averageTime} seconds\nRequests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                        updateWebSocketStatus(false);
                    }
                },
                error: function (xhr, status, error) {
                    console.error(error);
                    failedRequestCount++;
                    pendingRequests--;
                    $('#answerTimeLog').text(`Requests made: ${requestCount}\nRequests failed: ${failedRequestCount}\nPending requests: ${pendingRequests}`);
                    updateWebSocketStatus(false);
                }
            });
        }, interval); // Polling at user-defined interval for live data

        heartbeatInterval = setInterval(function () {
            $('#heartbeatLog').text('Heartbeat sent at ' + new Date().toLocaleTimeString());
        }, 10000); // Logging heartbeat every 10 seconds
    }

    /**
     * Stop monitoring device parameters
     */
    function stopMonitoring() {
        console.log('Stopping monitoring');
        clearInterval(monitoringInterval);
        clearInterval(heartbeatInterval);
        $('#loader').hide();
        $('#parameters').show();
        $('#fetchParams').show();
        $('#stopMonitoring').hide();
        $('#heartbeatLog').text('Monitoring stopped.');
        updateWebSocketStatus(false);
    }

    /**
     * Update WebSocket connection status
     */
    function updateWebSocketStatus(isConnected) {
        let wsIcon = $('#ws-icon');
        if (isConnected) {
            wsIcon.removeClass('ws-offline').addClass('ws-online');
        } else {
            wsIcon.removeClass('ws-online').addClass('ws-offline');
        }
    }

    // Event listener for fetch parameters button
    $('#fetchParams').click(function () {
        let deviceId = $('#deviceId').val();
        if (!deviceId) {
            alert('Please select a device');
            return;
        }
        console.log('Fetch Params button clicked for device ID:', deviceId); // Debug log
        $('#loader').show();
        updateLoader(20, 'Fetching device parameters...');
        fetchDeviceParameters(deviceId);
    });

    // Event listener for start monitoring button
    $('#startMonitoring').click(function () {
        let deviceId = $('#deviceId').val();
        params = [];
        $('#paramForm input:checked').each(function() {
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
        console.log('Start Monitoring button clicked for device ID:', deviceId); // Debug log
        $('#loader').show();
        updateLoader(30, 'Connecting...');
        $('#parameters').hide();
        $('#fetchParams').hide();
        startMonitoring(deviceId, interval);
        $('#stopMonitoring').show();
    });

    // Event listener for stop monitoring button
    $('#stopMonitoring').click(function () {
        console.log('Stop Monitoring button clicked'); // Debug log
        stopMonitoring();
    });

    // Event listener for select all checkbox
    $('#selectAll').click(function () {
        $('#paramForm input').prop('checked', this.checked);
    });

    // Event listener for individual parameter checkboxes
    $('#paramForm').on('change', 'input', function () {
        if (!this.checked) {
            $('#selectAll').prop('checked', false);
        }
    });

    // Initialize by checking authorization
    checkAuthorization();
});
