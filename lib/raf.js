module.exports = (function (window) {
	'use strict';

	var now = Date.now || function () {
			return new Date().getTime();
		};

	return {
		requestAnimationFrame: (function (){
			var lastTime = 0;
			return  window.requestAnimationFrame ||
					window.webkitRequestAnimationFrame ||
					window.mozRequestAnimationFrame ||
					window.oRequestAnimationFrame ||
					window.msRequestAnimationFrame ||
					function (callback) {
						var currTime, timeToCall, id;

						function timeoutCallback() {
							callback(currTime + timeToCall);
						}

						currTime = now();
						timeToCall = Math.max(0, 16 - (currTime - lastTime));
						id = window.setTimeout(timeoutCallback, timeToCall);
						lastTime = currTime + timeToCall;

						return id;
					};
		}()),

		cancelAnimFrame: window.cancelAnimationFrame ||
			window.webkitCancelAnimationFrame ||
			window.mozCancelAnimationFrame ||
			window.oCancelAnimationFrame ||
			window.msCancelAnimationFrame ||
			function (id) {
				window.cancelTimeout(id);
			}
	};
}(this));