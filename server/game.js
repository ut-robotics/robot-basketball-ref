const EventEmitter = require('events');
const util = require('util');
var logger = require('tracer').console({
    format : '{{timestamp}} <{{title}}> {{file}}:{{line}} {{message}}',
    dateformat : 'yyyy-mm-dd HH:MM:ss.l'
});

function Game(fieldId, robot1Id, robot2Id) {
    this.fieldId = fieldId;

    this.robot1 = new Robot(robot1Id, this);
    this.robot2 = new Robot(robot2Id, this);

    this.state = 'idle';
    this.timer = new Timer();

    this.stateNames = {
        idle: 'Idle',
        started: 'Started',
        stopped: 'Stopped'
    };
}

util.inherits(Game, EventEmitter);

Game.prototype.getInfo = function () {
    return {
        fieldId: this.fieldId,
        state: this.state,
        timeElapsed: this.timeElapsed,
        robot1: this.robot1.getInfo(),
        robot2: this.robot2.getInfo()
    }
};

Game.prototype.setFieldId = function (fieldId) {
    this.fieldId = fieldId;

    this.emit('stateChanged');
};

Game.prototype.setRobot1Id = function (id) {
    this.robot1.id = id;

    this.emit('stateChanged');
};

Game.prototype.setRobot2Id = function (id) {
    this.robot2.id = id;

    this.emit('stateChanged');
};

Game.prototype.sendSignal = function (signal, robotId) {
    this.emit('sendSignal', {
        type: signal,
        fieldId: this.fieldId,
        robotId: robotId || 'X'
    });
};

Game.prototype.start = function (robotId) {
    var rid = 'X';

    if (robotId === this.robot1.id || robotId === this.robot2.id) {
        rid = robotId;
    }

    this.sendSignal('start', rid);

    if (this.state === 'idle') {
        this.timer.reset();
        this.timer.start();
    } else if (this.state === 'stopped') {
        this.timer.start();
    }

    this.state = 'started';
    this.emit('stateChanged');
};

Game.prototype.stop = function () {
    this.sendSignal('stop');

    if (this.state === 'started') {
        this.timer.pause();
    }

    this.state = 'stopped';
    this.emit('stateChanged');
};

Game.prototype.end = function () {
    this.sendSignal('stop');

    this.timer.reset();

    this.state = 'idle';
    this.emit('stateChanged');
};

function Robot(id, game) {
    this.id = id;
    this.game = game;
}

Robot.prototype.getInfo = function () {
    return {
        id: this.id
    };
};

function Timer() {
    this.state = 'idle';
    this.startTime = null;
    this.timeElapsed = 0;
}

Timer.prototype.start = function () {
    //logger.log('timer start');

    this.state = 'started';
    this.startTime = Date.now();

    //logger.log('timer elapsed', this.timeElapsed, this.getTimeElapsed());
};

Timer.prototype.pause = function () {
    //logger.log('timer start');

    if (this.state !== 'started') {
        return;
    }

    this.state = 'paused';
    this.timeElapsed += Date.now() - this.startTime;

    //logger.log('timer elapsed', this.timeElapsed, this.getTimeElapsed());
};

Timer.prototype.reset = function () {
    //logger.log('timer reset');

    this.state = 'idle';
    this.startTime = null;
    this.timeElapsed = 0;

    //logger.log('timer elapsed', this.timeElapsed, this.getTimeElapsed());
};

Timer.prototype.getTimeElapsed = function () {
    if (this.state === 'idle') {
        return 0;
    }

    if (this.state === 'paused') {
        return this.timeElapsed;
    }

    if (this.state === 'started') {
        return this.timeElapsed + Date.now() - this.startTime;
    }
};

module.exports = Game;