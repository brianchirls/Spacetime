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
		var video,
			ownElement = false,
			hasMetadata = false,
			clip = this;

		function loadNewData() {
			if (video && video.readyState) {
				if (!hasMetadata) {
					clip.loadMetadata({
						duration: video.duration,
						videoWidth: video.videoWidth,
						videoHeight: video.videoHeight
					});
					hasMetadata = true;
				}

				//todo: update time ranges
			}
		}

		function addListeners() {
			if (video) {
				video.addEventListener('loadedmetadata', loadNewData, false);
				video.addEventListener('durationchange', loadNewData, false);
				video.addEventListener('progress', loadNewData, false);
			}
		}

		function removeListeners() {
			if (video) {
				video.removeEventListener('loadedmetadata', loadNewData, false);
				video.removeEventListener('durationchange', loadNewData, false);
				video.removeEventListener('progress', loadNewData, false);
			}
		}

		function getPlayer(source) {
			var i;

			//todo: proper element type check, in case of iframes?
			if (source instanceof HTMLVideoElement) {
				removeListeners();
				video = source;
				ownElement = false;
			} else {
				if (!video) {
					video = document.createElement('video');
					ownElement = true;
					addListeners();
				} else {
					for (i = video.childNodes.length - 1; i >= 0; i--) {
						video.removeChild(video.childNodes[i]);
					}
				}

				//todo: reset time ranges to nothing

				if (typeof source === 'string') {
					video.src = source;
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
				//todo: remove any event listeners
				hasMetadata = false;
				getPlayer(changes.src);
				this.reset(video); //todo: pass in video as `element` too
			},
			add: function () {
				loadNewData();
			},
			activate: function () {
				//todo: add 'active' class
			},
			deactivate: function () {
				//todo: remove 'active' class
			},
			destroy: function () {
				removeListeners();

				//clean up video element if we created it
				if (ownElement && video) {
					if (video.parentNode) {
						video.parentNode.removeChild(video);
					}
					video.src = '';
					video.load();
				}
				hasMetadata = false;
				video = null;
			}
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
		/*
		todo:
		canPlayType:
		canPlaySrc:
		*/
		compositors: ['dom-video', 'seriously']
	});
}));