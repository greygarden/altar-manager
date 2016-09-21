const serialport = require('serialport');
const SerialPort = serialport.SerialPort;

// Get the device locations for the workers
if (!process.env.ALTAR_WORKER_DEVICES) {
    console.log('Error: Please specify the location of altar-worker devices with the ALTAR_WORKER_DEVICES environment variable.');
    console.log('Hint: here is a list of available serial devices:');
    SerialPort.list((error, ports) => {
        ports.forEach((port) => {
            console.log(port.comName);
        });
        process.exit(1);
    });
} else {
    const workerDevices = process.env.ALTAR_WORKER_DEVICES.split(',');

    for (workerDevice of workerDevices) {
        const port = new SerialPort(workerDevice, {
            parser: serialport.parsers.readline('\n'),
            baudRate: 38400
        });
        port.on('data', console.log);
    }
}