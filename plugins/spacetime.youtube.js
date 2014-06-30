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

	Spacetime.plugin('youtube', function (options) {
		var player;

		function getPlayer(source) {
			//todo: proper element type check, in case of iframes?
			if (window.YT && window.YT.Player && source instanceof window.YT.Player) {
				player = source;
			} else {
				if (!player) {
					video = document.createElement('video');
				}
				if (typeof source === 'string') {
					//todo: fill this in
				} else if (Array.isArray(source)) {
					//todo: fill this in
				} else if (source && typeof source === 'object') {
					//todo: fill this in
				}
			}
		}

		getPlayer(options.src);

		/*
		todo: allow passing all this in a callback once dependency scripts have loaded
		*/
		return {
			//element: video,
			//player: video,
			modify: function (options, changes) {
				//todo: test for equality of options.src and changes.src
				//todo: some players need to start over if .controls changes
				//todo: if src changes, destroy old player and make a new one
				getPlayer(changes.src);
				this.reset(player); //todo: pass in `element` too
			},
			play: 'playVideo',
			pause: 'pauseVideo',
			duration: 'getDuration',
			currentTime: function (currentTime) {
				if (currentTime === undefined) {
					return player.getCurrentTime();
				}

				player.seekTo(currentTime, true);
				/*
				todo: check out allowSeekAhead at
				https://developers.google.com/youtube/iframe_api_reference#Functions
				*/
			},
			muted: function (muted) {
				if (muted === undefined) {
					return player.isMuted();
				}

				if (muted) {
					player.mute();
				} else {
					player.unMute();
				}
			},
			volume: function (volume) {
				if (volume === undefined) {
					return player.getVolume();
				}

				player.setVolume(volume);
			}
			//todo: height, width with player.setSize(height, width)
			//todo: videoWidth, videoHeight (assume 16:9 aspect ratio)
			//todo: playbackRate
			//todo: load?
			//todo: compatible
		};
	}, {
		//canPlayType: 
		//canPlaySrc:
	});
}));