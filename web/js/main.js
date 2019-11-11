$(document).ready(function () {
    var refBox = new RefBox();

	//refBox.render();

    window.refBox = refBox;
});

function RefBox() {
	this.com = new Com(this, function (info) {
	    if (!this.game) {
            this.game = new Game(info.game.fieldId, info.game.robot1.id, info.game.robot2.id, this.com, info.game);
            this.render();
        } else {
	        this.game.update(info.game);
        }
    }.bind(this));

	this.game = null;
}

RefBox.prototype.render = function () {
	this.game.render();
	this.renderSettings();
};

RefBox.prototype.renderSettings = function () {
	var $container = $('<div class="settings-container"></div>');

	this.com.render($container);

	$('#content').append($container);
};

function Com(refBox, callback) {
    this.refBox = refBox;

    this.socket = io.connect();

    this.serialPortInfo = null;

    this.robotAcks = {};

	this.$container = null;

    this.isShowingPorts = false;
	this.$portsContainer = null;

    this.isShowingComConfig = false;

    this.socket.on('info', function (info) {
        console.log('info', info);
        callback(info);
    }.bind(this));

    this.socket.on('gameInfo', function (info) {
        console.log('gameInfo', info);
        if (this.refBox.game) {
            this.refBox.game.update(info);
        }
    }.bind(this));

    this.socket.on('serialPortChanged', function (info) {
        console.log('serialPortChanged', info);

        this.serialPortInfo = info;

        this.updateUI();
    }.bind(this));

    this.socket.on('robotAcks', function (info) {
        console.log('robotAcks', info);

        this.robotAcks = info;

        if (this.refBox.game) {
            this.refBox.game.updateRobotAcks();
        }
    }.bind(this));
}

Com.prototype.render = function ($parentContainer) {
	var $container = $('<div class="com-container"></div>'),
        $comConfig = $('<div class="button com-config-button">Configure RF module</div>'),
		$button = $('<div class="button com-button">No Connection</div>');

	$container.append(/*$comConfig, */$button);

    $comConfig.on('click', function () {
        this.isShowingComConfig = !this.isShowingComConfig;

        if (this.isShowingComConfig) {
            this.showComConfig();
        } else {
            this.hideComConfig();
        }
    }.bind(this));

	$button.on('click', function () {
		this.isShowingPorts = !this.isShowingPorts;

		if (this.isShowingPorts) {
			this.showPorts();
		} else {
			this.hidePorts();
		}
	}.bind(this));

	this.$container = $container;

	$parentContainer.append($container);

	//setInterval(function () {
		//console.log('listPorts');

		this.listPorts(function () {
			if (this.isShowingPorts) {
				this.renderPorts();
			}
		}.bind(this));
	//}.bind(this), 1000);
};

Com.prototype.showPorts = function () {
	this.renderPorts();
	this.$portsContainer.removeClass('hidden');
};

Com.prototype.hidePorts = function () {
	this.$portsContainer.addClass('hidden');
};

Com.prototype.getTimeElapsed = function (callback) {
    this.socket.emit('getTimeElapsed', function (timeElapsed) {
        callback(timeElapsed);
    }.bind(this));
};

Com.prototype.renderPorts = function () {
	var $portsContainer = this.$portsContainer;

	if ($portsContainer === null) {
		$portsContainer = $('<div class="ports-container"></div>');
		this.$portsContainer = $portsContainer;

		this.$container.append(this.$portsContainer);

		if (!this.isShowingPorts) {
			$portsContainer.addClass('hidden');
		}
	}

	$portsContainer.empty();

	if (this.ports) {
        this.ports.forEach(function (port) {
            if (port.pnpId) {
                var isConnected = this.serialPortInfo !== null && port.path === this.serialPortInfo.path;
                var name = (isConnected ? 'Disconnect ' : '') + port.path;

                var $port = $('<div class="button">' + name + '</div>');

                $portsContainer.append($port);

                $port.on('click', function () {
                    if (isConnected) {
                        this.disconnect();
                    } else {
                        this.connect(port.path);
                    }
                }.bind(this));
            }
        }.bind(this));
    }
};

Com.prototype.updateInfo = function () {
    this.socket.emit('getSerialPortInfo', function (info) {
        this.serialPortInfo = info;

        this.updateUI();
	}.bind(this));
};

Com.prototype.updateUI = function () {
    var $button = this.$container.find('.com-button');

    if (this.serialPortInfo) {
        $button.text(this.serialPortInfo.path);
    } else {
        $button.text('No Connection');
    }

    this.renderPorts();
};

Com.prototype.listPorts = function (callback) {
    this.socket.emit('listSerialPorts', function (err, ports) {
        if (!err) {
            this.ports = ports;
        }

        if (typeof callback === 'function') {
            callback();
        }
    }.bind(this));
};

Com.prototype.isOpen = function (callback) {
    this.socket.emit('isSerialPortOpen', function (err, isOpen) {
        callback(isOpen);
    });
};

Com.prototype.connect = function (path) {
    this.socket.emit('connectSerialPort', path, function () {
        this.updateInfo();
    }.bind(this));
};

Com.prototype.disconnect = function () {
    this.socket.emit('disconnectSerialPort', function (err) {
        this.updateInfo();
    }.bind(this));
};

Com.prototype.send = function (message) {
    this.socket.emit('writeSerialPort', message, function (err) {
        if (err) {
            console.log('message sending failed', message, err);
        } else {
            console.log('message sent', message);
        }
    });
};

Com.prototype.sendSignal = function (info) {
    this.socket.emit('signal', info, function (err) {
        if (err) {
            console.log('signal sending failed', info, err);
        } else {
            console.log('signal sent', info);
        }
    });
};

Com.prototype.setGameState = function (state) {
    this.socket.emit('setGameState', state);
};

Com.prototype.setFieldId = function (id) {
    this.socket.emit('setFieldId', id);
};

Com.prototype.setRobot1Id = function (id) {
    this.socket.emit('setRobot1Id', id);
};

Com.prototype.setRobot2Id = function (id) {
    this.socket.emit('setRobot2Id', id);
};

function Game(fieldId, robot1Id, robot2Id, com, options) {
    options = options || {};

    this.fieldId = fieldId;

    this.robot1 = new Robot(robot1Id, this);
    this.robot2 = new Robot(robot2Id, this);

	this.com = com;

    this.state = options.state || 'idle';

    this.$container = null;

    this.controls = {};

    this.controlDefinitions = [
        {
            id: 'start',
            name: 'Start',
            method: this.start
        },
        {
            id: 'stop',
            name: 'Stop',
            method: this.stop
        },
        {
            id: 'end',
            name: 'End',
            method: this.end
        }
    ];

    this.stateNames = {
        idle: 'Idle',
        started: 'Started',
        stopped: 'Stopped',
        paused: 'Paused'
    };
}

Game.prototype.update = function (info) {
    info = info || {};

    this.fieldId = info.fieldId || this.fieldId;
    this.state = info.state || this.state;

    this.robot1.update(info.robot1);
    this.robot2.update(info.robot2);

    this.updateUI();
};

Game.prototype.setState = function (state, robotId) {
    this.com.setGameState(state, robotId);
};

Game.prototype.sendSignal = function (type, robotId) {
    this.com.sendSignal({
        type: type,
        robotId: robotId
    });
};

Game.prototype.setFieldId = function (fieldId) {
    this.com.setFieldId(fieldId);
};

Game.prototype.setRobotId = function (robot, id) {
    if (robot === this.robot1) {
        this.com.setRobot1Id(id);
    } else if (robot === this.robot2) {
        this.com.setRobot2Id(id);
    }
};

Game.prototype.getStateText = function () {
    return (this.stateNames[this.state] || this.state);
};

Game.prototype.updateUI = function () {
    this.$container.find('.game-state').text(this.getStateText());

    var $fieldId = this.$container.find('.field-id');

    if ($fieldId.text() !== this.fieldId) {
        $fieldId.text(this.fieldId);
    }
};

Game.prototype.render = function () {
    var $container = $('<div class="container"></div>'),
        $gameContainer = $('<div class="game-container"></div>'),
        $robot1Container = $('<div class="robot-container"></div>'),
        $robot2Container = $('<div class="robot-container"></div>'),
        $info = $('<div class="info"></div>'),
        $field = $('<div class="field-info"></div>'),
        $fieldLabel = $('<div>Field: </div>'),
        $fieldId = $('<div contenteditable class="field-id">' + this.fieldId + '</div>'),
        $state = $('<div class="game-state-container">' +
            '<span>State: </span>' +
            '<span class="game-state">' + this.getStateText() + '</span>' +
            '</div>'),
        $time = $('<div class="time"></div>'),

        $controls = $('<div class="controls"></div>');

    this.controlDefinitions.forEach(function (controlDefinition) {
        var control = new Button(controlDefinition.id, controlDefinition.name, controlDefinition.method.bind(this));

        this.controls[control.id] = control;

        control.render($controls);
    }.bind(this));

    $fieldId.on('keyup', function () {
        var value = $fieldId.text();

        if (value.length !== 1 || !(/[A-Z]/.test(value)) || this.fieldId === value) {
            return;
        }

        this.setFieldId(value);
    }.bind(this));

    this.robot1.render($robot1Container);
    this.robot2.render($robot2Container);

    $controls.append($state, $time);

    $field.append($fieldLabel, $fieldId);
    $info.append($field);
    $gameContainer.append($info, $controls);
    $container.append($robot1Container, $gameContainer, $robot2Container);
    $('#content').append($container);

    this.$container = $container;

    this.updateTime();

    setInterval(this.updateTime.bind(this), 1000);
};

Game.prototype.updateRobotAcks = function () {
    this.robot1.updateRobotAcks();
    this.robot2.updateRobotAcks();
};

Game.prototype.updateTime = function () {
    this.com.getTimeElapsed(function (elapsedMilliseconds) {
        var elapsedSeconds = Math.round(elapsedMilliseconds / 1000);

        var elapsedTimeString = ('0' + Math.floor(elapsedSeconds / 60)).slice(-2) + ':'
            + ('0' + (elapsedSeconds % 60)).slice(-2);

        this.$container.find('.time').text(elapsedTimeString);
    }.bind(this));
};

Game.prototype.start = function () {
    this.setState('started');
};

Game.prototype.stop = function () {
    this.setState('stopped');
};

Game.prototype.end = function () {
    this.setState('idle');
};

function Robot(id, game) {
    this.id = id;
    this.game = game;

    this.$container = null;

    this.controls = {};

    this.controlDefinitions = [
        {
            id: 'start',
            name: 'Start',
            method: this.start
        },
        {
            id: 'stop',
            name: 'Stop',
            method: this.stop
        },
        {
            id: 'ping',
            name: 'Ping',
            method: this.ping
        }
    ]
}

Robot.prototype.update = function (info) {
    info = info || {};

    this.id = info.id || this.id;

    this.updateUI();
};

Robot.prototype.updateUI = function () {
    var $robotId = this.$container.find('.robot-id');

    if ($robotId.text() !== this.id) {
        $robotId.text(this.id);
    }
};

Robot.prototype.render = function ($container) {
    var $controls = $('<div class="controls"></div>'),
        $info = $('<div class="info"></div>'),
        $robot = $('<div class="robot-info"></div>'),
        $robotLabel = $('<div class="robot-label">Robot:</div>'),
        $robotId = $('<div contenteditable class="robot-id">' + this.id + '</div>');

    $robotId.on('keyup', function () {
        var value = $robotId.text();

        if (value.length !== 1 || !(/[A-Z]/.test(value)) || this.id === value) {
            return;
        }

        this.game.setRobotId(this, value);
    }.bind(this));

    this.controlDefinitions.forEach(function (controlDefinition) {
        var control = new Button(controlDefinition.id, controlDefinition.name, controlDefinition.method.bind(this));

        this.controls[control.id] = control;

        control.render($controls);
    }.bind(this));

    $robot.append($robotLabel, $robotId);
    $info.append($robot);
    $container.append($info, $controls);

    this.$container = $container;
};

Robot.prototype.updateRobotAcks = function () {
    var robotAcks = this.game.com.robotAcks,
        $robot = this.$container.find('.robot-info');

    if (robotAcks[this.id]) {
        $robot.addClass('active');
    } else {
        $robot.removeClass('active');
    }
};

Robot.prototype.sendSignal = function (state) {
    this.game.sendSignal(state, this.id);
};

Robot.prototype.start = function () {
    this.sendSignal('start');
};

Robot.prototype.stop = function () {
    this.sendSignal('stop');
};

Robot.prototype.ping = function () {
    this.sendSignal('ping');
};

function Button(id, name, action) {
    this.id = id;
    this.name = name;

    this.action = action;

    this.enabled = true;

    this.$button = null;
}

Button.prototype.render = function ($container) {
    var button = this,
        $button = $('<div class="button button-' + this.id + '">' + this.name + '</div>');

    $button.on('click', function () {
        if (button.enabled) {
            button.action();
        }
    });

    $container.append($button);

    this.$button = $button;

    this.update();
};

Button.prototype.update = function () {
    if (this.enabled) {
        this.$button.removeClass('disabled');
    } else {
        this.$button.addClass('disabled');
    }
};

Button.prototype.enable = function () {
    this.enabled = true;
    this.update();
};

Button.prototype.disable = function () {
    this.enabled = false;
    this.update();
};