/*
inspired by Node EventEmitter class http://nodejs.org/api/events.html
*/
module.exports = (function () {
	'use strict';

	return function (that) {
		var listeners = {},
			once = {};

		that.on = function (event, listener) {
			var list,
				onceList,
				i;

			if (!event || typeof listener !== 'function') {
				return that;
			}

			list = listeners[event];
			if (!list || !Array.isArray(list)) {
				list = listeners[event] = [];
			} else if (list.indexOf(listener) >= 0) {
				return that;
			}

			//remove this from once, since we're gonna call it all the time now
			onceList = once[event];
			if (onceList && Array.isArray(onceList)) {
				i = onceList.indexOf(listener);
				if (i >= 0) {
					onceList.splice(i, 1);
				}
			}

			list.push(listener);
			return that;
		};

		that.off = function (event, listener) {
			var list,
				i;

			if (!event) {
				return that;
			}

			list = listeners[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					list.splice(i, 1);
					return that;
				}
			}

			list = once[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					list.splice(i, 1);
				}
			}

			return that;
		};

		that.once = function (event, listener) {
			var list,
				i;

			if (!event || typeof listener !== 'function') {
				return that;
			}

			//don't bother if it's already being called all the time
			list = listeners[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					return that;
				}
			}

			list = once[event];
			if (!list || !Array.isArray(list)) {
				list = once[event] = [];
			} else if (list.indexOf(listener) >= 0) {
				return that;
			}

			list.push(listener);
		};

		that.emit = function (event) {
			//todo: change this to emit event asynchronously
			var list,
				i,
				listener,
				args;

			list = listeners[event];
			if (list && Array.isArray(list)) {
				args = Array.prototype.slice(arguments, 1);
				for (i = 0; i < list.length; i++) {
					listener = list[i];
					listener.apply(that, args);
				}
			}

			list = once[event];
			if (list && Array.isArray(list)) {
				if (!args) {
					args = Array.prototype.slice(arguments, 1);
				}

				while (list.length) {
					listener = list.shift();
					listener.apply(that, args);
				}
			}
		};

		that.removeAllListeners = function (event) {
			if (event) {
				delete listeners[event];
				delete once[event];
			} else {
				listeners = {};
				once = {};
			}
		};

		/*
		todo:
		- once
		- setMaxListeners
		- listeners
		- newListener/removeListener events?
		- removeAllListeners?
		*/

		that.addEventListener = that.on;
		that.removeEventListener = that.off;
	};
}());