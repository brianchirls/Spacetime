(function (root, factory) {
	'use strict';

	if(typeof exports === 'object' && typeof module === 'object') {
		module.exports = factory();
	} else if(typeof define === 'function' && define.amd) {
		define(factory);
	} else if(typeof exports === 'object') {
		exports['SpacetimeVideo'] = factory();
	} else {
		root['SpacetimeVideo'] = factory();
	}

}(this, function () {
	'use strict';

	function SpacetimeVideo(options) {
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
			var i, end;

			//todo: proper element type check, in case of iframes?
			if (source instanceof HTMLVideoElement) {
				removeListeners();
				video = source;
				ownElement = false;
			} else {
				if (!video) {
					video = document.createElement('video');
					end = clip.end();
					if (end > 0 && end < Infinity) {
						video.preload = 'none';
					} else {
						video.preload = 'metadata';
					}
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
			load: function (start, end) {
				/*
				todo: make this smarter and/or more aggressive?
				*/
				if (!video.networkState || !video.readyState && video.networkState !== 2) {
					video.load();
				}
			},
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
	}

	SpacetimeVideo.compositors = ['dom-video', 'seriously']
	/*
	todo:
	- canPlayType:
	- canPlaySrc:
	*/

	return SpacetimeVideo;
}));