/*jslint devel: true, bitwise: true, browser: true, white: true, nomen: true, plusplus: true, maxerr: 50, indent: 4, todo: true */
/*global define, require, exports */
(function (root, factory) {
	'use strict';

	//todo: load Q as a dependency

	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['spacetime'], factory);
	} else if (typeof exports === 'object') {
		factory(require('spacetime'));
	} else {
		// Browser globals
		factory(root.Spacetime);
	}
}(this, function (Spacetime, undefined) {
	'use strict';

	Spacetime.plugin('video', function (options) {
		var video;

		function getPlayer(source) {
			//todo: proper element type check, in case of iframes?
			if (source instanceof HTMLVideoElement) {
				video = source;
			} else {
				if (!video) {
					video = document.createElement('video');
				}
				if (typeof source === 'string') {
					//todo: fill this in
				} else if (Array.isArray(source)) {
					//todo: fill this in
				} else if (source && typeof source === 'object') {
					//todo: fill this in
				}
				//todo: modify source url to use time range
			}
		}

		getPlayer(options.src);

		/*
		todo: animate:
		- top, left, width, height? (or make this a filter)
		- opacity
		- volume
		*/

		return {
			element: video,
			player: video,
			modify: function (options, changes) {
				//todo: test for equality of options.src and changes.src
				getPlayer(changes.src);
				this.reset(video); //todo: pass in video as `element` too
			},
			activate: function () {
				//todo: add 'active' class
			},
			deactivate: function () {
				//todo: remove 'active' class
			}
			//todo: destroy
			//todo: compatible

			/*
			implied:
			- play
			- pause
			- src?
			- currentTime
			- load
			- duration
			- playbackRate
			- width
			- height
			- videoWidth
			- videoHeight
			*/
		};
	}, {
		//canPlayType: 
		//canPlaySrc:
	});
}));