const serialport    = require('serialport')
const SerialPort    = serialport.SerialPort
const request       = require('request-promise')
// Connect to the spirit installation and listen for control updates
const socket        = require('socket.io-client')(process.env.SOCKET_URL)

const altarWorkers = []

// Handle control updates sent from spirit over web socket
function handleControlUpdates (workerIdentifier, port) {
    socket.on(`control-update-${workerIdentifier}`, (data) => {
        console.log(`Processing control value update for worker ${workerIdentifier}`)
        console.log(data)
        try {
            const parsed = JSON.parse(data)
            if (parsed.controlKey && parsed.controlValue) {
                port.write(`${parsed.controlKey}:${parsed.controlValue}`, (err) => {
                    if (err) {
                        return console.log('Error: ', err.message)
                    }
                });
            } else {
                console.log('Error: Data over socket did not include a valid controlKey and controlValue')
            }
        } catch (error) {
            console.log(`Error: ${error}`)
        }
    })
}

function listenForMetrics (portName, port) {

    port.on('data', (data) => {
        try {
            const parsed = JSON.parse(data)
            if (parsed.workerIdentifier && parsed.workerIdentifier.length === 36) {
                request({
                    method: 'POST',
                    uri: process.env.SPIRIT_URL + '/metrics',
                    body: data
                }).catch((error) => {
                    console.log(error);
                });
            }
        } catch (error) {
            console.log(`Parsing Failure: Device ${portName} outputted broken JSON.`)
            console.log(`Example of data output: ${data}`)
            port.close()
        }
    });
}

function checkForWorkerIdentifier (portName) {
    console.log(`Checking if ${portName} has been assigned an identifier...`)
    const serial = new SerialPort(portName, {
        parser: serialport.parsers.readline('\r\n'),
        baudRate: 38400
    });

    // Time out if no data has been output for 30 seconds
    const timeout = setTimeout(function () {
        console.log(`Identification Failure: Device ${portName} isn't sending any output, either isn't an altar-worker or has been disconnected.`)
        serial.close()
    }, 30000)

    // Allow up to 5 failures just in case we drop in half way through the serial buffer or something else breaks the output
    let failureCount = 0
    serial.on('data', (data) => {
        try {
            const parsed = JSON.parse(data)
            if (parsed.workerIdentifier && parsed.workerIdentifier.length === 36) {
                console.log(`Identification Success: Device ${portName} has unique identifier ${parsed.workerIdentifier}.`)
                clearTimeout(timeout)
                serial.close(function () {
                    console.log(`Listening / publishing metrics and controls from ${parsed.workerIdentifier}.`)
                    const serial = new SerialPort(portName, {
                        parser: serialport.parsers.readline('\r\n'),
                        baudRate: 38400
                    });
                    listenForMetrics(portName, serial)
                    handleControlUpdates(parsed.workerIdentifier, serial)
                })
            } else {
                failureCount++
            }
        } catch (error) {
            if (failureCount < 5) {
                failureCount++
                return
            }
            console.log(`Identification Failure: Device ${portName} doesn't appear to be reporting a unique ID. Please run the generate-worker-id utility to write a unique ID to this worker.`)
            console.log(`Example of data being output: ${data}`)
            clearTimeout(timeout)
            serial.close()
        }
    });
}

function identifySerialPorts () {
    // Get the device locations for the workers
    console.log('Attempting to locate attached altar worker devices.')
    serialport.list((error, ports) => {
        ports.forEach((port) => {
            const name = port.comName
            console.log(`Found ${name}, identifying...`)

            const serial = new SerialPort(name, {
                parser: serialport.parsers.readline('\r\n'),
                baudRate: 38400
            });

            // Time out if no data has been output for 30 seconds
            const timeout = setTimeout(function () {
                console.log(`Identification Failure: Device ${name} isn't sending any output, either isn't an altar-worker or has broken output.`)
                serial.close()
            }, 30000)

            // Allow up to 5 json failures just in case we drop in half way through the serial buffer or something else breaks the output
            let failureCount = 0
            serial.on('data', (data) => {
                try {
                    const parsed = JSON.parse(data)
                    if (parsed.type && parsed.type === 'identification' && parsed.value && parsed.value === 'altar-worker') {
                        console.log(`Identification Success: Device ${name} is an altar worker.`)
                        clearTimeout(timeout)
                        serial.close(function () {
                            checkForWorkerIdentifier(name)
                        })
                    }
                } catch (error) {
                    if (failureCount < 5) {
                        failureCount++
                        return
                    }
                    console.log(`Identification Failure: Device ${name} isn't outputting JSON, either isn't an altar-worker or has broken output.`)
                    console.log(`Example of data being output: ${data}`)
                    clearTimeout(timeout)
                    serial.close()
                }
            });
        })
    })
}

if (!process.env.SPIRIT_URL) {
    console.log('Error: Please specify the location of spirit installation with the SPIRIT_URL environment variable.')
    process.exit(1)
} else {
    identifySerialPorts()
}
