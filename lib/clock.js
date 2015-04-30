module.exports = (function (global) {
	'use strict';

	var eventEmitterize = require('./event-emitterize');

	function Clock() {
		var emitter = eventEmitterize(),
			events = {},
			throttle = 8,
			lastTime = -1,
			maxTime = 100,
			running = false;

		function getEventData(event) {
			var obj = events[event];
			if (!obj) {
				obj = events[event] = {
					throttle: throttle,
					maxTime: maxTime
				};
			}
		}

		this.now = global && global.performance && global.performance.now ?
			global.performance.now.bind(global.performance) :
			Date.now.bind(Date);

		this.play = function play() {
			running = true;
			this.tick();
		};

		this.pause = function pause() {
			running = false;
		};

		this.paused = function paused() {
			return !running;
		};

		this.on = function on(event, callback) {
		};

		this.off = function off(event, callback) {
		};

		this.clear = function clear() {
			//todo: clear all events and timeouts
		};

		this.setThrottle = function setThrottle(event, time) {
			var obj;

			if (typeof event === 'string' && event) {
				obj = getEventData(event);

				time = Math.max(time, 0);
				if (isNaN(time)) {
					return;
				}

				obj.throttle = time;
				obj.maxTime = Math.max(100, time * 2);
			} else {
				time = Math.max(event, 0);
				if (isNaN(time)) {
					return;
				}
				throttle = time;
				maxTime = Math.max(100, time * 2);
			}
		};

		this.tick = function tick() {
			var diff;

			if (!running) {
				return;
			}

			//todo: loop through all

			setTimeout(this.tick, 16);
		};

		this.setTimeout = setTimeout.bind(window);
		this.clearTimeout = clearTimeout.bind(window);
	}

	return Clock;
}(global));