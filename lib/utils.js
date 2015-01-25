/* global console */
module.exports = (function () {
	'use strict';

	function nop() {}

	function hasOwn(obj, property) {
		return Object.prototype.hasOwnProperty.call(obj, property);
	}

	function extend(dest, src) {
		var property,
			descriptor;

		if (dest.prototype && src.prototype && dest.prototype !== src.prototype) {
			extend(dest.prototype, src.prototype);
		}

		for (property in src) {
			if (hasOwn(src, property)) {
				descriptor = Object.getOwnPropertyDescriptor(src, property);

				if (descriptor.get || descriptor.set) {
					Object.defineProperty(dest, property, {
						configurable: true,
						enumerable: true,
						get: descriptor.get,
						set: descriptor.set
					});
				} else {
					dest[property] = src[property];
				}
			}
		}

		return dest;
	}

	function findFirst(array, callback, thisArg) {
		var i, n, value;

		if (array.find) {
			return array.find(callback, thisArg);
		}

		for (i = 0, n = array.length; i < n; i++) {
			value = array[i];
			if (callback.call(thisArg, value, i, array)) {
				return value;
			}
		}

		return undefined;
	}

	function consoleMethod(name) {
		var method;
		if (!console) {
			return nop;
		}

		if (typeof console[name] === 'function') {
			method = console[name];
		} else if (typeof console.log === 'function') {
			method = console.log;
		} else {
			return nop;
		}

		if (method.bind) {
			return method.bind(console);
		}

		return function () {
			method.apply(console, arguments);
		};
	}

	return {
		hasOwn: hasOwn,
		extend: extend,
		findFirst: findFirst,
		consoleMethod: consoleMethod
	};

}());