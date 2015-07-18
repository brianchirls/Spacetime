module.exports = (function (global) {
	'use strict';

	var now = Date.now || function () {
			return new Date().getTime();
		};

	return {
		requestAnimationFrame: (function () {
			var lastTime = 0;
			return global.requestAnimationFrame ||
					global.webkitRequestAnimationFrame ||
					global.mozRequestAnimationFrame ||
					global.oRequestAnimationFrame ||
					global.msRequestAnimationFrame ||
					function (callback) {
						var currTime, timeToCall, id;

						function timeoutCallback() {
							callback(currTime + timeToCall);
						}

						currTime = now();
						timeToCall = Math.max(0, 16 - (currTime - lastTime));
						id = global.setTimeout(timeoutCallback, timeToCall);
						lastTime = currTime + timeToCall;

						return id;
					};
		}()),

		cancelAnimationFrame: global.cancelAnimationFrame ||
			global.webkitCancelAnimationFrame ||
			global.mozCancelAnimationFrame ||
			global.oCancelAnimationFrame ||
			global.msCancelAnimationFrame ||
			function (id) {
				global.clearTimeout(id);
			}
	};
}(global));
