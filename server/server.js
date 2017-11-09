var SerialPort = require('serialport');
var express = require('express');
var serveStatic = require('serve-static');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io')(server);
var logger = require('tracer').console({
    format : '{{timestamp}} <{{title}}> {{file}}:{{line}} {{message}}',
    dateformat : 'yyyy-mm-dd HH:MM:ss.l'
});
var Game = require('./game');

app.use(serveStatic(__dirname + '/../web'));

var serialPort = null;
var portName = null;
var baudRate = 9600;
var serialPorts = [];
var game = null;
var robotAcksReceived = {};

io.on('connection', function (socket) {
    if (!game) {
        game = new Game('A', 'A', 'B');

        game.on('stateChanged', function() {
            io.emit('gameInfo', game.getInfo());
        });

        game.on('sendSignal', function (info) {
            logger.log('sendSignal', info);

            robotAcksReceived = {};

            sendRobotAcks();

            sendSignal(info, function (err) {
                if (err) {
                    logger.log('failed to send signal', err, info);
                } else {
                    logger.log('sent signal', info);
                }
            });
        });
    }

    socket.emit('info', {
        game: game.getInfo()
    });

    socket.emit('serialPortChanged', getSerialPortInfo());

    sendRobotAcks();

    socket.on('setGameState', function (state) {
        logger.log('setGameState', state);

        if (state === 'started') {
            game.start();
        } else if (state === 'stopped') {
            game.stop();
        } else if (state === 'idle') {
            game.end();
        }
    });

    socket.on('setFieldId', function (fieldId) {
        logger.log('setFieldId', fieldId);
        game.setFieldId(fieldId);
    });

    socket.on('setRobot1Id', function (id) {
        logger.log('setRobot1Id', id);
        game.setRobot1Id(id);
    });

    socket.on('setRobot2Id', function (id) {
        logger.log('setRobot2Id', id);
        game.setRobot2Id(id);
    });

    socket.on('getTimeElapsed', function (callback) {
        //logger.log('getTimeElapsed');
        callback(game.timer.getTimeElapsed());
    });

    socket.on('listSerialPorts', function (callback) {
        listSerialPorts(callback);
    });

    socket.on('isSerialPortOpen', function (callback) {
        callback(null, isSerialPortOpen());
    });

    socket.on('connectSerialPort', function (path, callback) {
        connectSerialPort(path, callback)
    });

    socket.on('disconnectSerialPort', function (callback) {
        disconnectSerialPort(callback)
    });

    socket.on('writeSerialPort', function (message, callback) {
        writeSerialPort(message, callback)
    });

    socket.on('signal', function (info, callback) {
        if (!info) {
            return;
        }

        if (info.type === 'start') {
            game.start(info.robotId);
            callback();
        } else {
            sendSignal(info, callback);
        }
    });

    socket.on('getSerialPortInfo', function (callback) {
        callback(getSerialPortInfo());
    });
});

function sendRobotAcks() {
    io.emit('robotAcks', robotAcksReceived);
}

function listSerialPorts(callback) {
    SerialPort.list(function (err, ports) {
        if (err) {
            logger.log(err);
            callback(err)
        } else {
            logger.log(ports);
            serialPorts = ports;
            callback(null, ports)
        }
    });
}

function isSerialPortOpen() {
    return serialPort !== null && typeof serialPort.isOpen === 'function' && serialPort.isOpen();
}

function getSerialPortInfo() {
    if (isSerialPortOpen()) {
        return {
            path: serialPort.path
        };
    } else {
        return null;
    }
}

function connectSerialPort(path, callback) {
    logger.log('connectSerialPort', path);

    if (isSerialPortOpen()) {
        disconnectSerialPort(function (err) {
            if (err) {
                logger.log(err);
                callback(err);
            } else {
                connect();
            }
        });
    } else {
        connect();
    }

    function connect() {
        logger.log('connecting', path);

        var parser = function(length) {
            var data = new Buffer(0);
            var startByte = 'a'.charCodeAt(0);

            return function(emitter, buffer) {
                data = Buffer.concat([data, buffer]);

                var i,
                    startIndex = 0,
                    out;

                console.log(data.toString());

                for (i = 0; i < data.length; i++) {
                    if (data[i] === startByte) {
                        //If startByte inside message, set message start to that byte
                        if (i < startIndex + length - 1) {
                            startIndex = i;
                        }
                    }

                    if (startIndex + length <= data.length) {
                        if (i == startIndex + length - 1) {
                            out = data.slice(startIndex, startIndex + length);
                            startIndex = i;
                            emitter.emit('data', out);
                        }
                    } else {
                        break;
                    }
                }

                if (i == data.length) {
                    data = new Buffer(0);
                } else {
                    data = data.slice(i);
                }
            };
        };

        serialPort = new SerialPort(path, {
            baudrate: baudRate,
            parser: parser(5)
        });

        serialPort.on('open', function () {
            logger.log('serialPort open');
            io.sockets.emit('serialPortChanged', getSerialPortInfo());
            callback();
        }.bind(this));

        serialPort.on('error', function (err) {
            logger.log('serialPort error', err);
        }.bind(this));

        serialPort.on('data', function(data) {
            console.log(data);

            logger.log('serialPort data: ' + data);
            io.emit('serialPortData', data);

            var stringData = data.toString('ascii');

            logger.log('stringData', stringData);

            var fieldId = stringData[1];
            var robotId = stringData[2];

            if (stringData[0] === 'a' && fieldId === game.fieldId && stringData.slice(3, 6) === 'ACK') {
                logger.log('ACK from ' + robotId);
                robotAcksReceived[robotId] = true;

                sendRobotAcks();
            }
        });
    }
}

function disconnectSerialPort(callback) {
    if (serialPort !== null && typeof serialPort.close === 'function') {
        serialPort.close(function (error) {
            if (error) {
                logger.error(error);
                callback(error);
            } else {
                callback();
            }
        });

        serialPort = null;

        io.sockets.emit('serialPortChanged', getSerialPortInfo());
    } else {
        callback();
    }
}

function sendSignal(info, callback) {
    //logger.log('sendSignal', info);

    if (!info) {
        callback('No info');
        return;
    }

    var signalTypes = {
        start: 'START',
        stop: 'STOP',
        ping: 'PING'
    };

    var type = info.type;
    var fieldId = game.fieldId;
    var robotId = info.robotId;

    if (!signalTypes[type]) {
        callback('Invalid signal type', type);
        return;
    }

    if (typeof robotId !== 'string' || robotId.length !== 1 || !(/[A-Z]/.test(robotId))) {
        callback('Invalid robot ID', robotId);
        return;
    }

    writeSerialPort(padCommand('a' + fieldId + robotId + signalTypes[type]), callback)
}

/*function writeSerialPort(message, callback) {
    logger.log('writeSerialPort', message);

    if (isSerialPortOpen()) {
        logger.log('send', message);

        serialPort.write(message, function(err, results) {
            if (err) {
                logger.error(err);
                callback(err);
            } else {
                //logger.log(results);
                callback();
            }
        });
    } else {
        callback();
    }
}*/


function writeSerialPort(message, callback) {
    logger.log('writeSerialPort', message);

    if (isSerialPortOpen()) {
        logger.log('send', message);

        var sendCount = 0;
        var sendCountMax = 10;

        var sendInterval = setInterval(function () {
            serialPort.write(message, function(err, results) {
                if (err) {
                    logger.error(err);
                    clearInterval(sendInterval);
                    callback(err);
                } else {
                    //logger.log(results);
                    sendCount++;

                    logger.log('sendCount', sendCount);

                    if (sendCount >= sendCountMax) {
                        clearInterval(sendInterval);
                        callback();
                    }
                }
            });
        }, 10);

    } else {
        callback();
    }
}

function padCommand(data, length) {
    if (typeof length !== 'number') {
        length = 12;
    }

    return (data + new Array(length + 1).join('-')).slice(0, length);
}

server.listen(3000);