const serialport = require('serialport');
const SerialPort = serialport.SerialPort;
const request = require('request-promise');

// Get the device locations for the workers
if (!process.env.ALTAR_WORKER_DEVICES) {
    console.log('Error: Please specify the location of altar-worker devices with the ALTAR_WORKER_DEVICES environment variable.');
    console.log('Hint: here is a list of available serial devices:');
    serialport.list((error, ports) => {
        ports.forEach((port) => {
            console.log(port.comName);
        });
        process.exit(1);
    });
} else if (!process.env.SPIRIT_URL) {
    console.log('Error: Please specify the location of spirit installation with the SPIRIT_URL environment variable.');
    process.exit(1);
} else {
    const workerDevices = process.env.ALTAR_WORKER_DEVICES.split(',');

    for (workerDevice of workerDevices) {
        const port = new SerialPort(workerDevice, {
            parser: serialport.parsers.readline('\n'),
            baudRate: 38400
        });
        port.on('data', (data) => {
            request({
                method: 'POST',
                uri: process.env.SPIRIT_URL + '/metrics',
                body: JSON.stringify({
                    data: data
                })
            }).then((data) => {
                console.log(data.body);
            }).catch((error) => {
                console.log(error);
            });
        });
    }
}