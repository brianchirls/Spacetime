'use strict';

const
	/*
		Utility functions (other files)
	*/
	nextTick = require('next-tick'),
	eventEmitterize = require('./event-emitterize'),
	parseTimeCode = require('./parse-timecode'),
	TimeRanges = require('./time-ranges'),
	{
		extend,
		hasOwn,
		nop,
		guid,
		always,
		recall,
		consoleMethod,
		findFirst
	} = require('./utils'),

	/*
		Global reference variables
	*/
	minClipLength = 1 / 60,

	// todo: move this out into a separate file or calculate it
	loadAheadTime = 10,

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
		/*
		gonna disable this for now, since .load() on a media element is destructive,
		and this should be idempotent. So this will need to be implemented on the
		plugin unless there is a good use case for attaching it to the player
		load: {
			writeable: false,
			exposed: false,
			def: nop
		},
		*/
		duration: {
			def: always(minClipLength)
		},
		buffered: {
			def: always(Infinity)
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
	];

function Clip(internal, plugin, options) {
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
	const self = this,
		spacetime = internal.spacetime,
		playerState = internal.state;

	let id = options.id,
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
			},
			progress: (e) => {
				updateClipBuffered();
				self.emit('progress', e);
			}
		},

		start,
		end,

		from = 0,
		to = Infinity,

		minTime = 0,
		maxTime = Infinity;

	/*
	takes time in context of global timeline and converts to time in context
	of this clip's media. Considers start, from and to.
	*/
	function localPlayTime(time) {
		return time - start + from;
	}

	function updateClipBuffered() {
		var buffered = playerMethods.buffered(),
			ranges,
			i, range;

		if (typeof buffered === 'number' && !isNaN(buffered)) {
			if (playerMethods.readyState()) {
				buffered = Math.min(Math.max(0, buffered - from), self.metadata.duration);
			} else {
				buffered = 0;
			}
			self.buffered.reset(buffered);
		} else if (buffered && buffered.start && buffered.end) {
			ranges = self.buffered.ranges;
			ranges.length = buffered.length;
			for (i = ranges.length - 1; i >= 0; i--) {
				range = ranges[i];
				if (!range) {
					range = ranges[i] = {};
				}
				range.start = Math.min(Math.max(0, buffered.start(i) - from), self.metadata.duration);
				range.end = Math.min(Math.max(0, buffered.end(i) - from), self.metadata.duration);
				if (range.end === range.start) {
					ranges.splice(i, 1);
				}
			}

		}
	}

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
		updateClipBuffered();
	}

	this.layer = null;
	this.active = false;
	this.id = id;
	this.type = plugin.id;
	this.enabled = true;
	this.playing = false;
	this.buffered = new TimeRanges();
	this.spacetime = spacetime;

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
					end = newEnd;

					self.emit('timechange', self);
				}
			}

			updateClipBuffered();

			self.emit('loadedmetadata', self, metadata);
		}
	};

	this.load = function (start, end) {
		if (plugin.load) {
			plugin.load(Math.max(0, localPlayTime(start)), localPlayTime(end));
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
		desiredTime = localPlayTime(time);
		diff = Math.abs(desiredTime - currentTime);

		//todo: if clip is set to loop...loop

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
		if (!this.active && this.isEnabled() &&
				this.isCurrent()) {

			let loadStart = playerMethods.currentTime(),
				loadEnd = loadStart + loadAheadTime * playerState.playbackRate;

			//todo: take into account preload settings
			this.load(loadStart, loadEnd);

			if (plugin.activate && !this.active) {
				this.active = true;

				//todo: do not activate if seeking. wait until seeked
				plugin.activate();
				self.emit('activate', self);
			}
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

		Maybe we should just remove this whole thing and have src be one of the plugin's
		custom properties
		*/
		updateClipBuffered();
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

		if (to < Infinity) {
			return to;
		}

		return Math.min(to, Math.min(self.metadata.duration, end - start) + from);
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
			let newClip = self.clone();
			newClip.trim(max);
			self.trim(0, min);

			//add new clip to the rest of the composition
			internal.loadClip(newClip, self.layer);
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
		let opts = extend({}, options);
		extend(opts, {
			id: guid('spacetime'),
			start: start,
			end: end,
			from: from,
			to: to,
			layer: null
		});

		return new Clip(plugin, opts);
	};

	this.reset = reset;

	/*
	info methods
	*/
	this.isActive = () => this.isActive;

	this.isEnabled = () => {
		//todo: also check that layer, compositor and plugin are enabled
		return this.enabled;
	};

	this.isCurrent = () => {
		let currentTime = playerState.currentTime;
		return this.start() <= currentTime &&
			this.end() > currentTime;
	};

	this.metadata = {
		duration: Infinity
	};

	this.start(options.start || 0);
	this.end(options.end);
	this.from(options.from || 0);
	this.to(options.to);

	plugin = extend({}, plugin);
	if (plugin.definition) {
		plugin = extend(plugin, plugin.definition.call(this, options));
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
}

export default Clip;
