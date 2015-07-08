module.exports = (function () {
	'use strict';

	const

	/*
		Utility functions (other files)
	*/
		eventEmitterize = require('./lib/event-emitterize'),
		parseTimeCode = require('./lib/parse-timecode'),
		forEach = require('lodash.foreach'), //todo: implement our own, faster
		binarySearch = require('binary-search'),
		nextTick = require('next-tick'),
		Clock = require('./lib/clock'),
		{
			extend,
			hasOwn,
			nop,
			always,
			recall,
			consoleMethod,
			findFirst
		} = require('./lib/utils'),

	/*
		Global reference variables
	*/
		minClipLength = 1 / 60,

		defaultCompositors = {
			audio: ['basic-audio'],
			video: ['dom-video']
			//todo: data, subtitles, 3d?
		},

		readOnlyProperties = [
			'ended',
			'error',
			'networkState',
			'paused',
			'readyState',
			'seeking',
			'videoHeight',
			'videoWidth'
		],

	// boolean value represents whether this is a writeable property
		clipPlayerMethods = {
			play: {
				exposed: true,
				def: nop,
				trigger: ['play', 'playing']
			},
			pause: {
				exposed: true,
				def: nop,
				trigger: ['pause']
			},
			//src: true, should just use modify, since this always needs to handle an existing player
			currentTime: {
				writeable: true,
				exposed: true,
				def: recall(0),
				trigger: ['seeking', 'seeked']
			},
			load: {
				writeable: false,
				exposed: false,
				def: nop
			},
			duration: {
				def: always(0)
			},
			playbackRate: {
				writeable: true,
				def: recall(1)
			},
			volume: {
				writeable: true,
				exposed: false,
				def: recall(1),
				trigger: ['volumechange']
			},
			muted: {
				writeable: true,
				exposed: false,
				def: recall(false),
				trigger: ['volumechange']
			},
			readyState: {
				exposed: true,
				def: always(4)
			},
			networkState: {
				exposed: true,
				def: always(1)
			},
			seeking: {
				exposed: true,
				def: always(false)
			},
			//draw: false,?
			//loop: true, this will probably be managed by Spacetime
			destroy: {
				writeable: false,
				exposed: false,
				def: nop
			}
		},
		clipPlayerEvents = [
			'pause',
			'play',
			'playing',
			'progress',
			'seeked',
			'seeking',
			'stalled',
			'suspend',
			'waiting'
		],


	/*
	shims and API status
	- todo: web audio API?
	- todo: move all now and timing stuff into Clock
	- todo: move requestAnimationFrame into compositor
	*/
		requestAnimationFrame = require('./lib/raf').requestAnimationFrame,
		cancelAnimationFrame = require('./lib/raf').cancelAnimationFrame;

	/*
		Global "environment" variables
	*/
	var
		maxGlobalId = Date.now(), //todo: come up with something better than this
		globalPlugins = {},
		globalCompositors = {};

	/*
		utility functions
	*/

	function guid(prefix) {
		//todo: do a better job of converting prefix to a string
		var id = (prefix || '') + maxGlobalId;
		maxGlobalId++;
		return id;
	}

	function compareClipsByStart(a, b) {
		var diff;

		if (a === b) {
			return 0;
		}

		diff = a.start() - b.start() ||
			(a.end() || a.start()) - (b.end() || b.start());

		if (!diff) {
			return a.id < b.id ? -1 : 1;
		}

		return diff;
	}

	function compareClipsByEnd(a, b) {
		var diff;
		if (a === b) {
			return 0;
		}
		diff = (a.end() || a.start()) - (b.end() || b.start()) ||
			a.start() - b.start();

		if (!diff) {
			return a.id < b.id ? -1 : 1;
		}

		return diff;
	}

	function Spacetime(opts) {
		//initialize object, private properties
		var spacetime = this,
			options = opts || {},
			isDestroyed = false,
			compositors = {},

			Clip,
			Layer,

			/*
			todo: move most of the below stuff into an object that can be accessed by modules
			*/
			playerState = {
				autoplay: false,
				//buffered, todo: new timeRanges object
				//controls?
				//crossOrigin?
				currentTime: 0,
				//currentSrc?
				//defaultMuted?
				//defaultPlaybackRate?
				duration: 0,
				ended: false,
				error: null,
				height: 0,
				loop: false,
				muted: false,
				networkState: 0,
				paused: true,
				playbackRate: 1,
				playing: false, //is time actually progressing?
				//played, todo: new timeRanges object
				//poster?
				preload: 'none',
				//preservesPitch?
				readyState: 0,
				//seekable, todo: new timeRanges object
				seeking: false,
				//src,
				videoHeight: 0,
				videoWidth: 0,
				volume: 1,
				width: 0
			},

			//time control
			lastUpdateTime = 0,
			lastCurrentTime = -1,
			timeout = -1,
			clock,
			now,

			/*
			playerState.duration is the memoized calculated value.
			duration is the value explicitly set, if any
			*/
			duration = Infinity,

			autoDraw,
			animationRequestId,

			/*
			minimum time in ms between update calls triggered by draw
			todo: make this a configurable option
			*/
			updateThrottle = 16,

			plugins = {},
			compositorPlugins = Object.create(null),

			clipsByStart = [],
			clipsByEnd = [],
			clipsById = Object.create(null),
			activeClips = Object.create(null),
			currentClips = Object.create(null),

			layersById = Object.create(null),
			layersOrder = [],

			startIndex = 0,
			endIndex = 0,

			id;

		function loadCompositor(list, type, def) {
			var definition,
				compositor;


			if (list && !Array.isArray(list)) {
				if (typeof list === 'string') {
					list = [list];
				} else {
					list = [];
				}
			}
			definition = findFirst((list || []).concat(def), (comp) => {
				if (typeof comp === 'string') {
					comp = globalCompositors[comp];
				}
				return comp && comp.type === type &&
					(!comp.compatible || comp.compatible());
			});
			if (typeof definition === 'string') {
				definition = globalCompositors[definition];
			}

			//there should always be at least the default compositor that's compatible and loaded

			compositor = extend({}, definition);
			if (typeof definition === 'function') {
				extend(compositor, definition.call(spacetime));
			}
			if (typeof compositor.definition === 'function') {
				extend(compositor, compositor.definition.call(spacetime, options));
			}

			return compositor;
		}

		function activateClip(clip) {
			activeClips[clip.id] = clip;
			//todo: update playing/waiting state
		}

		function deactivateClip(clip) {
			delete activeClips[clip.id];
			//todo: update playing/waiting state
		}

		//todo: call updateFlow() any time waiting/playing state changes
		//todo: call updateFlow() on seeking or seeked
		/*
		updateFlow sets a timeout for the next time that an event needs to be
		started or stopped. It can be redundant with the regular draw/update
		cycle in most cases, but we may be able to remove update from every
		draw call if we find it's not necessary. And, we can replace the Clock
		with one using a web worker in the browser, so that events get
		fired even when our tab is in the background.
		*/
		function updateFlow() {
			var iStart,
				iEnd,
				currentTime = playerState.currentTime,
				diff = 0,
				delay = currentTime;

			clock.clearTimeout(timeout);
			if (playerState.playing && playerState.playbackRate) {
				if (playerState.playbackRate > 0) {
					delay = playerState.duration - currentTime;
					iEnd = endIndex;
					iStart = startIndex + 1;
				} else {
					iEnd = endIndex - 1;
					iStart = startIndex;
				}

				if (iEnd >= 0 && iEnd < clipsByEnd.length) {
					diff = Math.abs(clipsByEnd[iEnd].end() - currentTime);
					if (diff > 0 && diff < delay) {
						delay = diff;
					}
				}

				if (iStart >= 0 && iStart < clipsByStart.length) {
					diff = Math.abs(clipsByStart[iStart].start() - currentTime);
					if (diff > 0 && diff < delay) {
						delay = diff;
					}
				}

				//setTimeout takes milliseconds
				timeout = clock.setTimeout(update, delay * 1000);
			}
		}

		function update(force) {
			var currentTime,
				rightNow = now(),
				clip,
				epsilon = playerState.playing ? 1 / 10 : 1 / 100,
				needUpdateFlow = false,
				ended = false;

			if (playerState.playing) {
				currentTime = playerState.currentTime + (rightNow - lastUpdateTime) * playerState.playbackRate / 1000;
			} else {
				currentTime = playerState.currentTime;
			}
			lastUpdateTime = now();

			/*
			todo: come up with a better criterion for running update,
			remove boolean trap
			*/
			if (!force && Math.abs(currentTime - playerState.currentTime) < 0.005) {
				return;
			}

			if (!playerState.ended && playerState.duration) {
				if (playerState.playbackRate > 0) {
					ended = currentTime >= playerState.duration;
				} else if (playerState.playbackRate < 0) {
					ended = currentTime <= 0 && !playerState.ended;
				}
			}
			currentTime = Math.min(Math.max(currentTime, 0), playerState.duration);
			playerState.currentTime = currentTime;

			if (clipsByStart.length) {
				//go through all clips that need to be updated, started or stopped
				//todo: if seeking, use binarySearch

				// play advancing
				if (lastCurrentTime <= currentTime) {
					// deactivate any clips that have passed
					clip = clipsByEnd[endIndex];
					while (clip && clip.end() <= currentTime) {
						needUpdateFlow = true;
						delete currentClips[clip.id];
						clip.deactivate();

						endIndex++;
						clip = clipsByEnd[endIndex];
					}
					endIndex = Math.min(endIndex, clipsByEnd.length - 1);

					// activate any clips that are current
					clip = clipsByStart[startIndex];
					while (clip && clip.start() <= currentTime) {
						if (clip.end() > currentTime) {
							needUpdateFlow = true;
							currentClips[clip.id] = clip;
							clip.activate();
						}

						startIndex++;
						clip = clipsByStart[startIndex];
					}
					startIndex = Math.min(startIndex, clipsByStart.length - 1);

				// play receding
				} else {
					epsilon *= -1;

					// activate any clips that are current
					clip = clipsByStart[startIndex];
					while (clip && clip.start() > currentTime) {
						needUpdateFlow = true;
						delete currentClips[clip.id];
						clip.deactivate();

						startIndex--;
						clip = clipsByStart[startIndex];
					}
					startIndex = Math.max(startIndex, 0);

					// deactivate any clips that are not current
					clip = clipsByEnd[endIndex];
					while (clip && clip.end() > currentTime) {
						if (clip.start() <= currentTime) {
							needUpdateFlow = true;
							currentClips[clip.id] = clip;
							clip.activate();
						}

						endIndex--;
						clip = clipsByEnd[endIndex];
					}
					endIndex = Math.max(endIndex, 0);
				}

				if (needUpdateFlow) {
					updateFlow();
				}
			}

			//todo: if any one clip's currentTime is too far off expected value, fire 'waiting'
			forEach(activeClips, (clip) => {
				clip.seek(playerState.currentTime, epsilon);
			});

			//todo: if timeController is no longer active, select a new one
			//todo: tell clips which ones need to be loaded or abort loading

			//todo: maybe throttle this? could be an option
			spacetime.emit('timeupdate');

			if (ended) {
				//todo: looping
				ended = playerState.ended;
				playerState.ended = true;
				spacetime.pause();
				if (!ended) {
					spacetime.emit('ended');
				}
			} else {
				playerState.ended = false;
			}

			lastCurrentTime = currentTime;
		}

		function updateDuration() {
			var dur = 0, d = 0, i;

			if (duration < Infinity) {
				dur = duration;
			} else {
				for (i = clipsByEnd.length - 1; i >= 0; i--) {
					d = clipsByEnd[i].end();
					if (d < Infinity) {
						dur = d;
						break;
					}
				}
			}

			if (dur !== playerState.duration) {
				playerState.duration = dur;
				//todo: maybe we want to hold off on durationchange until all clips have a duration?
				spacetime.emit('durationchange');
				update(true);
				updateFlow();
			}
		}

		/*
		scan through all clips to determine whether we can play, whether
		we are done seeking.
		todo: set loading state here
		*/
		function checkPlayingState() {
			var id,
				clip,
				readyState = 4,
				clipsPlaying = true;

			for (id in activeClips) {
				if (hasOwn(activeClips, id)) {
					clip = activeClips[id];
					if (!clip.playing) {
						clipsPlaying = false;
					}
					readyState = Math.min(readyState, clip.readyState());
					if (clip.seeking() || readyState < 2) {
						break;
					}
				}
			}

			playerState.readyState = readyState;
			if (readyState > 1) {
				if (playerState.seeking) {
					playerState.seeking = false;
					spacetime.emit('seeked');
				}
				if (!playerState.seeking && !playerState.playing && !playerState.paused) {
					playerState.playing = true;
					for (id in activeClips) {
						if (hasOwn(activeClips, id)) {
							activeClips[id].play();
						}
					}
					spacetime.emit('playing');
				}
			} else if (!clipsPlaying && playerState.playing) {
				playerState.playing = false;
				playerState.readyState = 3;
				for (id in activeClips) {
					if (hasOwn(activeClips, id)) {
						activeClips[id].pause();
					}
				}
				spacetime.emit('waiting');
			}

			updateFlow();
		}

		/*
		todo: rename `draw` to `render`, as it will be agnostic of the kind of tracks/compositors
		being used. Each compositor will supply its own timing callback. we can't assume
		requestAnimationFrame for everything
		*/
		function draw() {
			if (now() - lastUpdateTime > updateThrottle) {
				update();
			}

			//todo: go through all clips that need to be redrawn

			forEach(compositors, (compositor) => {
				if (compositor && compositor.draw) {
					compositor.draw.call(spacetime);
				}
			});

			if (autoDraw) {
				cancelAnimationFrame(animationRequestId);
				animationRequestId = requestAnimationFrame(draw);
			}
		}

		function removeClipFromLists(clip) {
			var i;

			i = binarySearch(clipsByStart, clip, compareClipsByStart);
			if (i >= 0) {
				clipsByStart.splice(i, 1);
				if (startIndex > i) {
					startIndex--;
				}
			}

			i = binarySearch(clipsByEnd, clip, compareClipsByEnd);
			if (i >= 0) {
				clipsByEnd.splice(i, 1);
				if (endIndex > i) {
					endIndex--;
				}
			}
		}

		function addClipToLists(clip) {
			var i;

			//place clip into appropriate point in each queue
			i = binarySearch(clipsByStart, clip, compareClipsByStart);
			i = ~i; // jshint ignore:line
			if (i < startIndex) {
				startIndex++;
			}
			clipsByStart.splice(i, 0, clip);

			i = binarySearch(clipsByEnd, clip, compareClipsByEnd);
			i = ~i; // jshint ignore:line
			if (i < endIndex) {
				endIndex++;
			}
			clipsByEnd.splice(i, 0, clip);

			update(true);

			/*
			todo:
			- set any missing start times
			- recalculate total duration
			*/
			updateDuration();
			updateFlow();
		}

		function loadClip(clip) {
			if (clipsById[clip.id]) {
				return;
			}

			clipsById[clip.id] = clip;
			plugins[clip.type].clips[clip.id] = clip.id;
			/*
			todo:
			make a lookup of clips by 'name' option and make that searchable later
			*/

			/*
			todo: add listener to clip for when it changes and re-sort if
			start/end time are different
			*/
			clip.on('activate', activateClip);
			clip.on('deactivate', deactivateClip);
			clip.on([
				'timechange',
				'loadedmetadata'
			], updateDuration);
			clip.on([
				'seeking',
				'seeked',
				'playing',
				'waiting'
			], checkPlayingState);

			//temp for debuggin
			[
				'waiting',
				'seeking',
				'seeked',
				'playing',
				'play',
				// 'progress',
				'stalled',
				'suspend'
			].forEach((evt) => {
				clip.on(evt, (e) => {
					console.log(evt, e && e.target.currentTime, e && e.target.seeking, e && e.target.src);
				});
			});

			/*
			todo: allow option for blacklist or whitelist of which compositors to include for a clip
			- e.g. use only the audio track of a video clip
			*/
			forEach(compositors, (compositor) => {
				//todo: make sure it supports this type of clip
				if (compositor && compositor.add) {
					compositor.add.call(spacetime, clip);
				}
			});

			addClipToLists(clip);

			//todo: fire event for clip added, with clip id

			//will only activate if in time range
			//todo: only if clip, plugin and layer are enabled
			/*
			todo: remove this. unnecessary because addClipToLists calls update
			if (playerState.currentTime >= clip.start() && playerState.currentTime < clip.end()) {
				activateClip(clip);
			}
			*/
		}

		/*
			Constructors
		*/
		Clip = function (plugin, options) {
			/*
			todo: consider allowing start time to be negative
			- can be shifted around later without losing data
			- ignore playback for anything before 0
			- do not load anything before 0
			*/
			/*
			todo: add from/to, internal clip times
			- accessor methods. internal shift?
			- how are they affected by trim?
			*/
			var self = this,
				id = options.id,
				initialized = false,
				playerMethods = {},
				playerEvents = {
					playing: (e) => {
						self.playing = true;
						self.emit('playing', e);
					},
					waiting: (e) => {
						self.playing = false;
						self.emit('waiting', e);
					},
					pause: (e) => {
						self.playing = false;
						self.emit('pause', e);
					}
				},

				start,
				end,

				from = 0,
				to = Infinity,

				minTime = 0,
				maxTime = Infinity;

			function reset(player) {
				//todo: do we need more parameters?

				function makePlayerMethod(methodName, spec) {
					var method = plugin[methodName] || methodName;

					function triggerEvents() {
						spec.trigger.forEach((evt) => {
							if (playerEvents[evt]) {
								playerEvents[evt]();
							}
							nextTick(() => {
								self.emit(evt);
							});
						});
					}

					if (typeof method === 'string') {
						if (player) {
							method = player[method];
							if (typeof method === 'function') {
								return method.bind(player);
							}

							if (spec.writeable) {
								return (value) => {
									if (value !== undefined && player[methodName] !== value) {
										player[methodName] = value;
										if (spec.trigger && !player.addEventListener) {
											triggerEvents();
										}
									}
									return player[methodName];
								};
							}

							return () => {
								return player[methodName];
							};
						}
					} else if (typeof method === 'function') {
						return method.bind(self);
					}

					if (spec.trigger && !player.addEventListener) {
						return (value) => {
							if (!spec.writeable || value !== undefined && spec.def() !== value) {
								spec.def(value);
								triggerEvents();
							}
							return spec.def();
						};
					}

					return spec.def || nop;
				}

				var key;

				player = typeof player === 'object' && player;
				for (key in clipPlayerMethods) {
					if (hasOwn(clipPlayerMethods, key)) {
						playerMethods[key] = makePlayerMethod(key, clipPlayerMethods[key]);
						if (clipPlayerMethods[key].exposed) {
							self[key] = playerMethods[key];
						}
					}
				}

				if (player && player.addEventListener && player.removeEventListener) {
					clipPlayerEvents.forEach((evt) => {
						if (playerEvents[evt]) {
							player.removeEventListener(evt, playerEvents[evt]);
						} else {
							playerEvents[evt] = self.emit.bind(self, evt);
						}
						player.addEventListener(evt, playerEvents[evt]);
					});
				}

				//todo: what about a method for getting buffered sections?

				/*
				todo: if cannot play currently set source object, fire error
				- name: "MediaError",
				- message: "Media Source Not Supported",
				- code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
				*/

				/*
				todo:
				- reset readyState, networkState
				- fire emptied, abort, whatever necessary events
				*/
				self.playing = false;
				self.metadata.duration = Infinity;
			}

			function addToLayer(layerId) {

				function overlaps(clip) {
					return clip.start() < (end || Infinity) && clip.end() > start;
				}

				var layerId,
					layer,
					clip;

				layerId = options.layer;
				if (typeof layerId === 'number') {
					if (layerId >= 0 && layersOrder[layerId]) {
						layer = layersOrder[layerId];
					}
				} else if (typeof layerId === 'string' && layerId) {
					layer = layersById[layerId];
					if (!layer) {
						spacetime.addLayer(layerId);
						layer = layersById[layerId];
					}
				}

				/*
				If layer is specified and clip overlaps with existing clip on same layer,
				trim existing clip for that period of time

				Otherwise, if top layer has room for new clip, use top layer,
				else add new layer
				*/
				if (layer) {
					clip = findFirst(layer.clips, overlaps);
					if (clip) {
						/*
						todo: replace this whole thing with splice
						if resulting clip length is 0, remove it
						*/
						clip.splice(self.start(), self.end());
					}
				} else if (layersOrder.length) {
					clip = findFirst(layersOrder[layersOrder.length - 1].clips, overlaps);
					if (!clip) {
						layer = layersOrder[layersOrder.length - 1];
					}
				}
				if (!layer) {
					layerId = guid('spacetime');
					spacetime.addLayer(layerId);
					layer = layersById[layerId];
				}
				layer.add(self);
				self.layer = layer;
			}

			this.active = false;
			this.id = id;
			this.type = plugin.id;
			this.enabled = true;
			this.playing = false;

			eventEmitterize(this);

			//this.playbackRate = 1;

			/*
			todo methods:
			- setCurrentTime
			- getCurrentTime
			- play
			- pause
			- destroy (calls pause)
			- modify
			- load(start, end). load(0, 0) means just metadata
			- set/get playback rate
			- get/set general properties
			- some way to access the compositable element(s) and/or data
			- compatible
			- report buffered, seekable ranges
			*/

			this.loadMetadata = function (values) {
				var k,
					duration,
					metadata = self.metadata,
					changed = false,
					durationchange = false,
					oldEnd = end,
					newEnd;

				//todo: make sure duration is not negative or Infinity
				duration = values.duration;
				if (isNaN(duration)) {
					duration = metadata.duration;
				} else if (metadata.duration !== duration) {
					metadata.duration = duration || Infinity;
					durationchange = true;
				}

				for (k in values) {
					if (values.hasOwnProperty(k) && metadata[k] !== values[k]) {
						metadata[k] = values[k];
						changed = true;
					}
				}

				if (changed) {
					if (durationchange) {
						if (isNaN(duration)) {
							duration = minClipLength;
						}
						newEnd = isNaN(end) ? Infinity : end;
						newEnd = Math.min(newEnd, Math.min(maxTime, start + duration));

						if (initialized && oldEnd !== newEnd && !(isNaN(newEnd) && isNaN(oldEnd))) {
							// remove it from the old place in queues before re-inserting to the new place
							removeClipFromLists(self);
							end = newEnd;
							addClipToLists(self);

							self.emit('timechange', self);
						}
					}

					self.emit('loadedmetadata', self, metadata);
				}
			};

			/*
			Check that currentTime is where it's supposed to be relative to
			playerState.currentTime. If it's out of whack, then seek.

			Seeking is allowed even when inactive so we can be cued up in advance
			todo: account for clip playing at a different playbackRate than parent
			*/
			this.seek = function (time, epsilon) {
				var currentTime,
					desiredTime,
					diff;

				currentTime = playerMethods.currentTime();
				desiredTime = time - start + from;
				diff = Math.abs(desiredTime - currentTime);

				//todo: what happens if we don't have a duration yet?
				if (desiredTime >= to) {
					desiredTime = to;
					this.pause();
				} else if (desiredTime < from) {
					desiredTime = from;
					this.pause();
				}
				/*
				todo: if we're supposed to be playing and we've just seeked
				between from and to, resume playing
				*/

				//todo: don't do anything if (desiredTime - currentTime) is very small
				if (diff > Math.abs(epsilon) && desiredTime < playerMethods.duration()) {
					//todo: fire waiting? or
					playerMethods.currentTime(desiredTime);
				}
			};

			this.activate = function () {
				//todo: also check that layer is enabled
				if (!this.active && this.enabled &&
						this.start() <= playerState.currentTime &&
						this.end() > playerState.currentTime) {
					this.active = true;

					if (plugin.activate) {
						plugin.activate();
					}

					//todo: seek to appropriate place based on parent's currentTime

					// if parent is playing, try to play
					if (playerState.playing && playerState.playbackRate) {
						self.play();
					}
					self.emit('activate', self);
				}
			};

			this.deactivate = function () {
				if (this.active) {
					this.active = false;

					if (plugin.deactivate) {
						plugin.deactivate();
					}
					self.pause();
					self.emit('deactivate', self);
				}
			};

			this.enable = function () {
				if (!this.enabled) {
					this.enabled = true;
					this.activate();
					this.emit('enabled');
				}
			};

			this.disable = function () {
				if (this.enabled) {
					this.enabled = false;
					this.deactivate();
					this.emit('disabled');
				}
			};

			this.destroy = function () {
				self.deactivate();

				parent.remove(id);

				self.removeAllListeners();
				//todo: clean up
			};

			this.src = function (src) {
				/*
				todo: we need a callback function that checks if the old source and new source have changed
				- only reset if it has changed
				- otherwise we can update it and call modify but don't need to reset
				- e.g. src on video needs reset; new text for a text effect does not
				- anything that makes buffered go backwards should cause a reset (or change duration?)
				*/
			};

			/*
			Time editing methods:
			*/

			this.start = function (val) {
				var time,
					oldStart = start;

				if (val !== undefined) {
					time = parseTimeCode(val);
					if (isNaN(time)) {
						throw new Error('Clip.start - Unknown time value ' + time);
					}

					start = Math.max(0, time);
					if (!isNaN(end)) {
						end = Math.max(start + minClipLength, end);
						maxTime = Math.max(maxTime, end);
						//todo: adjust clip duration
					}

					minTime = Math.max(0, Math.min(minTime, start));

					if (initialized && start !== oldStart) {
						self.emit('timechange', self);
					}
				}

				return start;
			};

			this.end = function (val) {
				var oldEnd = end,
					time;

				if (val !== undefined) {
					time = parseTimeCode(val);
					if (isNaN(time)) {
						throw new Error('Clip.end - Unknown time value ' + time);
					}

					end = time;
					maxTime = Math.max(maxTime, end);
					start = Math.min(start, end - minClipLength);
					minTime = Math.max(0, Math.min(minTime, start));

					if (initialized && oldEnd !== end && !(isNaN(end) && isNaN(oldEnd))) {
						self.emit('timechange', self);
					}
				}

				if (end === undefined) {
					return Infinity;
				}
				return end;
			};

			/*
			todo: what if to < from?
			*/
			this.from = function (val) {
				if (val !== undefined && !isNaN(val)) {
					from = Math.max(0, val);
					from = Math.min(self.metadata.duration, from);

					//todo: seek to current position, pause or loop if outside range
					//todo: come up with an event to fire if this value changed
				}

				return from;
			};

			this.to = function (val) {
				if (val !== undefined && !isNaN(val)) {
					to = Math.max(0, val);
					//for now, we're not gonna enforce an upper limit on 'to'

					//todo: seek to current position, pause or loop if outside range
					//todo: come up with an event to fire if this value changed
				}

				return to;
			};

			this.trim = function (min, max) {
				var oldStart = start,
					oldEnd = end,
					change = false;

				if (isNaN(min)) {
					min = 0;
				}

				if (isNaN(max)) {
					max = Infinity;
				}

				if (max <= min) {
					throw new Error('Clip.trim: max must be greater than min');
				}

				minTime = Math.max(min, minTime);
				maxTime = Math.min(max, maxTime);

				start = Math.max(start, minTime);
				if (!isNaN(end)) {
					end = Math.max(start, Math.min(end, maxTime));
					change = end !== oldEnd;
				}
				from += oldStart - start;

				change = change || start !== oldStart;
				if (change) {
					self.emit('timechange', self);
				}
			};

			this.splice = function (min, max) {
				var newClip;
				if (isNaN(max) || max < min) {
					max = min;
				}

				//todo: this whole mess could probably be made more efficient
				if (self.end() < Infinity && max < Infinity &&
						self.end() <= max && self.start() >= min) {

					//entire clip range is removed
					spacetime.remove(self.id);
				} else if (self.end() < Infinity && max < Infinity &&
						self.end() > max && self.start() < min) {

					//break clip into two pieces and splice out the middle
					newClip = self.clone();
					newClip.trim(max);
					self.trim(0, min);

					//add new clip to the same layer
					newClip.layer = self.layer;
					self.layer.add(newClip);

					//add new clip to the rest of the composition
					loadClip(newClip);
				} else if (self.start() < min) {
					//chop off end of clip
					self.trim(min);
				} else {
					//chop off start of clip
					self.trim(0, max);
				}

				/*
				todo: if length of new clip is 0,
				start = end = Math.min(start, min)
				log warning if called from outside
				*/
			};

			this.shift = function (delta) {
				var s, e;
				s = start;
				//todo: fill this in
				//todo: don't forget to emit timechange if necessary
			};

			/*
			Note: clone is for internal use only and does not add new clip to timeline anywhere
			*/
			this.clone = function () {
				var opts = extend({}, options),
					newClip;

				extend(opts, {
					id: guid('spacetime'),
					start: start,
					end: end,
					from: from,
					to: to,
					layer: null
				});

				newClip = new Clip(plugin, opts);
				return newClip;
			};

			this.reset = reset;

			this.metadata = {
				duration: Infinity
			};

			this.start(options.start || 0);
			this.end(options.end);

			plugin = extend({}, plugin);
			if (plugin.definition) {
				plugin = extend(plugin, plugin.definition.call(this, options));
			}

			if (options.layer !== null) {
				addToLayer(options.layer);
			}

			//todo: is this audio, video or other?
			reset(plugin.player);

			initialized = true;

			/*
			todo: export publicly accessible object with fewer methods
			public methods:
			- isActive
			- modify
			- remove (from parent)
			- id
			- event handling (on/off)
			- get parent object
			- get container?
			- get special values, provided by definition
			*/
		};

		Layer = function (options) {
			var self = this;

			function sortClips() {
				self.clips.sort(compareClipsByStart);
			}

			this.options = options;
			this.clips = [];

			this.id = options.id;

			this.add = function (clip) {
				/*
				For now, we assume there are no duplicates. It may become necessary to
				scan for and remove any duplicates.
				*/
				clip.layer = self;
				clip.on('timechange', sortClips);
				self.clips.push(clip);
				sortClips();
			};

			this.remove = function (clipId) {
				var i, clip;

				for (i = 0; i < self.clips.length; i++) {
					clip = self.clips[i];
					if (clip.id === clipId) {
						clip.off('timechange', sortClips);
						clip.layer = null;
						self.clips.splice(i, 1);
						return;
					}
				}
			};

			this.destroy = function () {
				/*
				todo: clean out any events or options created later
				*/
			};

			//todo: make publicly accessible object, if necessary?
		};

		/*
		Match loading states of HTMLMediaElement
		- allow `modify` method to determine whether to reset/empty state, based on properties changed
		- property changes that make it less "loaded" should trigger state reset
		*/

		//select compositors
		forEach(
			extend({
				video: [],
				audio: []
			}, options.compositors),
			(list, type) => {
				compositors[type] = loadCompositor(list, type, defaultCompositors[type]);
			}
		);

		id = guid('spacetime');

		this.logger = extend(Spacetime.logger);

		this.id = function () {
			return id;
		};

		/*
		Methods for installing and removing all plugin types
		*/

		this.plugin = function (hook, definition) {
			var type,
				plugin;

			if (plugins[hook]) {
				Spacetime.logger.warn('Media Type [' + hook + '] already loaded');
				return spacetime;
			}

			/*todo:
			- object should include canPlayType (and canPlaySrc?) method/regex
			- object should have a list of track types supported and whether each is required, e.g.:
				- 'video' supports video, audio (neither required)
				- 'text' supports video, required
				- 'audio' supports audio, required
			*/

			if (typeof definition === 'function') {
				plugin = {
					definition: definition
				};
			} else if (typeof definition === 'object' && definition) {
				plugin = extend({}, definition);
			}

			extend(plugin, definition);
			plugin.clips = {};
			plugin.id = hook;

			if (!definition.title) {
				definition.title = hook;
			}

			plugins[hook] = plugin;

			return spacetime;
		};

		this.removePlugin = function (hook) {
			var plugin;

			if (!hook) {
				return;
			}

			plugin = plugins[hook];

			if (!plugin) {
				return;
			}

			forEach(plugin.clips, spacetime.remove);

			delete plugins[hook];

			return spacetime;
		};

		this.compositor = function (hook, definition) {
			var compositor;

			/*
			todo: this needs to be completely rewritten to replace any existing
			compositors of this type, and it should actually be activated

			or just get rid of it
			*/

			if (compositorPlugins[hook]) {
				Spacetime.logger.warn('Compositor [' + hook + '] already loaded');
				return spacetime;
			}

			if (typeof definition === 'function') {
				compositor = {
					definition: definition
				};
			} else if (typeof definition === 'object' && definition) {
				compositor = extend({}, definition);
			}

			extend(compositor, definition);
			compositor.clips = {};
			compositor.id = hook;

			if (!definition.type) {
				/*
				todo: does it need to be one of the pre-defined compositor types? (video, audio, data) probably not
				*/
				Spacetime.logger.error('Cannot define compositor [' + hook + '] without a type');
				return;
			}

			if (!definition.title) {
				definition.title = hook;
			}

			compositorPlugins[hook] = compositor;

			return spacetime;
		};

		this.removeCompositor = function (hook) {
			var compositor;

			if (!hook) {
				return;
			}

			compositor = compositorPlugins[hook];

			/*
			todo: figure out what do to here
			In practice, this is probably just here for cleaning up unit tests
			*/

			delete compositorPlugins[hook];
		};

		/*
		clip CRUD methods
		*/

		//add or update a clip
		//todo: allow batch loading of multiple clips
		this.add = function (hook, options) {
			var id = guid('spacetime'); //todo: allow forced id?

			/*
			todo:
			Allow a composition to clone an alien clip by making the properties
			on the public clip object match the options parameter for Spacetime.add
			Need to be able to pass just an 'options object' and have hook specified in there
			*/

			/*
			todo: smart loading to infer hook by cycling through all plugins,
			running canPlaySrc on each one
			if no plugin found, throw error
			*/

			options = extend({}, options);
			options.id = id;
			if (options.layer === null) {
				options.layer = undefined;
			}

			loadClip(new Clip(plugins[hook], options));

			return spacetime;
		};

		//remove a clip
		this.remove = function (clipId) {
			var clip = clipsById[clipId],
				i;

			if (clip) {
				clip.deactivate();

				forEach(compositors, (compositor) => {
					//todo: make sure it supports this type of clip
					if (compositor && compositor.remove) {
						compositor.remove.call(spacetime, clip);
					}
				});

				removeClipFromLists(clip);

				delete clipsById[clipId];
				delete plugins[clip.type].clips[clip.id];

				// remove clip from layer
				if (clip.layer) {
					clip.layer.remove(clipId);
				}

				//todo: destroy the clip?
				clip.off('activate', activateClip);
				clip.off('deactivate', deactivateClip);
				clip.off('timechange', updateDuration);
				clip.off('loadedmetadata', updateDuration);

				//todo: fire event for clip removed with clip id

				updateFlow();
			}

			return spacetime;
		};

		/*
		todo: add a method to test if a prospective clip is compatible, i.e.:
		- there is a plugin that canPlay the clip
		- the currently loaded compositor can handle both the plugin and the clip
		*/

		//todo: list/search clips by time, hook, layer and/or id
		//todo: getClipById - need public clip class
		//todo: get history of added clip ids?
		//todo: enable/disable clip .disable(), .disable('video'), .disable(['video', '3d'])
		//todo: move a clip from one layer to another

		/*
		layer CRUD methods
		todo: search layer(s); getLayerById
		- layer order
		- whether layer is enabled/disabled
		- "custom" layer options passed to compositor?
		todo: get history of added layer ids?
		todo: rename layer?
		todo: move layer order
		todo: enable/disable layer
		*/
		this.addLayer = function (id, order) {
			var layer;
			//todo: third argument for clip(s) to add to layer? or options?
			//todo: "custom" layer options passed to compositor?

			if (typeof id === 'number') {
				if (order === undefined) {
					order = id;
				} else {
					id = String(id);
				}
			}

			if (!id) {
				id = guid('spacetime');
			} else if (layersById[id]) {
				throw new Error('Spacetime.addLayer - layer already exists: ' + id);
			}

			if (isNaN(order)) {
				order = layersOrder.length;
			} else {
				order = Math.max(0, order);
			}

			layer = new Layer({
				id: id
			});
			layersById[id] = layer;
			if (order < layersOrder.length) {
				layersOrder.splice(order, 0, layer);
			} else {
				layersOrder[order] = layer;
			}

			//todo: notify compositors of layer addition and order update

			return spacetime;
		};

		this.removeLayer = function (id) {
			var layer,
				i,
				clips;

			// make sure this layer exists
			if (typeof id === 'number') {
				layer = layersOrder[id];
				id = layer && layer.id;
			} else if (typeof id === 'string') {
				layer = layersById[id];
			}

			if (!layer) {
				return spacetime;
			}

			// destroy any clips on this layer
			layer.clips.forEach((clip) => {
				spacetime.remove(clip.id);
			});
			layer.destroy();

			i = layersOrder.indexOf(layer);
			if (i >= 0) {
				layersOrder.splice(i, 1);
			}
			delete layersById[id];

			//todo: notify compositors of layer removal

			return spacetime;
		};

		//todo: set/get "global" properties that get passed to plugins, compositor

		eventEmitterize(this);
		//todo: first, next promises

		/*
		player methods
		todo: make this look like a HTMLMediaElement?
		- canPlayType
		- canPlaySrc?
		- fastSeek?
		- load
		*/

		this.pause = function () {
			var key;

			if (playerState.paused) {
				return;
			}

			//todo: update play/playing state
			playerState.paused = true;

			//todo: temp!
			playerState.playing = false;
			for (key in activeClips) {
				if (hasOwn(activeClips, key)) {
					activeClips[key].pause();
				}
			}

			updateFlow();

			return spacetime;
		};

		this.play = function () {
			// var key;

			if (!playerState.paused) {
				return;
			}

			if (playerState.ended) {
				if (playerState.playbackRate > 0) {
					spacetime.currentTime = 0;
				} else if (playerState.playbackRate < 0) {
					spacetime.currentTime = playerState.duration;
				}
			}

			playerState.paused = false;

			checkPlayingState();

			//todo: start loading from currentTime

			update();

			return spacetime;
		};

		this.load = function (start, end) {
			/*
			todo: make from, to optional allowing determination of which section
			to load. This would enable management of child compositions.
			load(0, 0) means just metadata
			*/
			return spacetime;
		};

		Object.defineProperty(this, 'currentTime', {
			configurable: false,
			enumerable: true,
			get: function () {
				return playerState.currentTime;
			},
			set: function (value) {
				var diff,
					time = parseFloat(value);

				//throw error if not a number or not in range
				if (time < 0 || time > spacetime.duration || isNaN(time)) {
					throw new Error('Invalid currentTime value: ' + value);
				}

				//don't do anything if abs(currentTime - value) < precision
				//don't do anything if !paused and (value - currentTime) is very small
				diff = time - playerState.currentTime;
				if (Math.abs(diff) > 1 / 100/* &&
						!(playerState.playing && diff < 0.1 * playerState.playbackRate)*/) {

					//start seeking if necessary
					playerState.seeking = true;
					spacetime.emit('seeking');
					playerState.currentTime = time;
					update(true);
				}
			}
		});

		Object.defineProperty(this, 'duration', {
			configurable: false,
			enumerable: true,
			get: function () {
				return playerState.duration === Infinity ? 0 : playerState.duration;
			},
			set: function (value) {
				var newDuration;
				/*
				if duration is less than existing clips:
				- if currentTime > duration: pause, currentTime = duration
				- keep all clips but force them to abort loading after duration
				*/
				newDuration = parseFloat(value);

				//throw error if not a number or not in range
				if (newDuration < 0 || isNaN(value)) {
					throw new Error('Invalid duration value: ' + value);
				}

				//todo: allow setting Infinity to go back to auto
				if (duration !== newDuration) {
					duration = newDuration;
					updateDuration();
				}
			}
		});


		/*
		todo: more writeable properties
		- loop
		- width - w, h should be "custom" properties defined by compositor
		- height
		- src (runs this.clip)
		- autoplay
		- controls?
		- crossOrigin?
		- defaultMuted?
		- defaultPlaybackRate?
		- muted
		- playbackRate
		- poster?
		- preload
		- preservesPitch?
		- volume
		*/

		//set up all read-only 'properties'
		readOnlyProperties.forEach((property) => {
			Object.defineProperty(spacetime, property, {
				configurable: false,
				enumerable: true,
				get: function () {
					return playerState[property];
				}
			});
		});

		/*
		Spacetime object management methods
		*/

		this.destroy = function () {
			var i;

			isDestroyed = true;
			playerState.playing = false;

			cancelAnimationFrame(animationRequestId); //todo: handle this in clock
			clock.clear();
			updateFlow();

			// destroy all layers and clips
			for (i = layersOrder.length - 1; i >= 0; i--) {
				spacetime.removeLayer(layersOrder[i].id);
			}

			spacetime.removeAllListeners();

			forEach(compositors, (compositor) => {
				if (compositor && compositor.destroy) {
					compositor.destroy();
				}
			});

			//todo: neutralize all methods, reset state, etc.
		};

		this.isDestroyed = function () {
			return isDestroyed;
		};

		/*
		allow for option to have draw fired by external animation loop
		good for parent compositions to control children
		or for using in a game loop
		todo: do the same for update
		*/
		this.draw = draw;

		forEach(globalPlugins, (plugin, key) => {
			spacetime.plugin(key, plugin);
		});

		forEach(options.plugins, (plugin, key) => {
			spacetime.plugin(key, plugin);
		});

		//todo: allow this to be toggled and queried after create
		//todo: auto-updates too?
		autoDraw = options.autoDraw === undefined ? true : !!options.autoDraw;
		if (autoDraw) {
			requestAnimationFrame(draw);
		}

		/*
		todo:
		- allow passing of clock options to clock if needed?
		- automatically pick clock based on platform/build?
		*/
		if (typeof options.clock === 'function') {
			clock = new options.clock();
		} else {
			clock = new Clock();
		}
		now = clock.now;
	}

	Spacetime.plugin = function (hook, definition) {
		//keeping it simple for now
		globalPlugins[hook] = definition;
	};

	Spacetime.compositor = function (hook, definition) {
		//keeping it simple for now
		//todo: make sure type exists
		globalCompositors[hook] = definition;
	};

	/*
	Utilities
	*/
	Spacetime.util = Spacetime.prototype.util = {
		parseTimeCode: parseTimeCode
		//todo: requestAnimationFrame, cancelAnimationFrame. make sure to account for missing requestID
	};

	Spacetime.logger = {
		log: consoleMethod('log'),
		info: consoleMethod('info'),
		warn: consoleMethod('warn'),
		error: consoleMethod('error')
	};

	//todo: maybe rename to 'null' or 'timer' or something
	Spacetime.plugin('', function (options) {
		var currentTime = 0,
			duration = NaN,
			startTime;

		return {
		};
	});

	Spacetime.compositor('dom-video', require('./compositors/spacetime.dom-video'));

	Spacetime.compositor('basic-audio', {
		title: 'Basic Audio',
		type: 'audio',
		definition () {
			return {
				properties: {
					volume: function (element, volume) {
						element.volume = Math.max(0, Math.min(1, volume));
					},
					muted: function (element, muted) {
						element.muted = !!muted;
					}
				}
			};
		}
	});

	return Spacetime;
}());
