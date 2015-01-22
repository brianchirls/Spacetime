module.exports = (function (window) {
	'use strict';

	var document = window.document,
		console = window.console,
		eventEmitterize = require('./lib/event-emitterize'),

	/*
		Global "environment" variables
	*/

		maxGlobalId = Date.now(), //todo: come up with something better than this
		nop = function () {},
		plugins = {},
		compositors = {},
		allClipsByType = {},

	/*
		Global reference variables
	*/

		readOnlyProperties = [
			'duration',
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
			play: false,
			pause: false,
			//src: true, should just use modify, since this always needs to handle an existing player
			currentTime: true,
			load: false,
			duration: false,
			playbackRate: true,
			width: true,
			height: true,
			videoWidth: false,
			videoHeight: false,
			volume: true,
			muted: true,
			//draw: false,?
			//loop: true, this will probably be managed by Spacetime
			destroy: false
		},

		timeCodeRegex = /^(?:(?:([0-9]+):)?(?:([0-9]+):))?(([0-9]+)(?:([.;])([0-9]+)))?$/,

	/*
	todo: shims and API status
	- web audio API
	*/
		requestAnimationFrame = require('./lib/raf').requestAnimationFrame,
		cancelAnimationFrame = require('./lib/raf').cancelAnimationFrame,
		now;

	/*
		utility functions
	*/

	function guid(prefix) {
		//todo: do a better job of converting prefix to a string
		var id = (prefix || '') + maxGlobalId;
		maxGlobalId++;
		return id;
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

	function parseTimeCode(timecode, frameRate) {
		var match,
			hour = 0,
			minute = 0,
			second = 0;

		if (typeof timecode === 'number') {
			return timecode;
		}

		if (typeof timecode === 'string') {
			match = timeCodeRegex.exec(timecode);
			if (match) {
				if (match[1]) {
					hour = parseInt(match[1], 10);
				}
				if (match[2]) {
					minute = parseInt(match[2], 10);
				}
				if (match[5] === '.') {
					second += parseFloat(match[3]);
				} else {
					second = parseInt(match[4], 10);
					if (match[5] === ';' && frameRate > 0) {
						second += parseInt(match[6], 10) / frameRate;
					}
				}
				return (hour * 60 + minute) * 60 + second;
			}
		}

		return NaN;
	}

	/*
		Constructors
	*/

	/*
		todo: come up with some creative way to make this read-only
		except by the creator
	*/
	function TimeRanges() {
		var ranges = [
			{
				start: 0,
				end: 0
			}
		];

		Object.defineProperty(this, 'length', {
			configurable: false,
			enumerable: true,
			get: function () {
				return ranges.length;
			}
		});

		this.add = function (start, end) {
			//todo: optimize with binary search
			var startIndex,
				endIndex,
				startObj,
				endObj;

			if (start >= end) {
				//todo: throw error?
				return;
			}

			startObj = ranges[0];
			for (startIndex = 0; startIndex < ranges.length; startIndex++) {
				if (ranges[startIndex].start > start) {
					break;
				}
				startObj = ranges[startIndex];
			}

			endObj = startObj;
			for (endIndex = startIndex; endIndex < ranges.length; endIndex++) {
				if (ranges[endIndex].start > end) {
					break;
				}
				endObj = ranges[endIndex];
			}

			if (startObj.end >= start) {
				startObj.end = end;
			} else if (endObj.start <= end && endObj.end > start) {
				endObj.start = start;
			} else {
				ranges.splice(endIndex, 0, {
					start: start,
					end: end
				});
				return;
			}

			//merge if ranges overlap
			/*
			todo: this is totally busted. fix it
			*/
			while (startIndex < endIndex) {
				ranges.splice(startIndex, endIndex - startIndex);
			}
		};

		this.start = function (i) {
			if (i >=0 && i < ranges.length) {
				return ranges[i].start;
			}

			//todo: throw DOMException/INDEX_SIZE_ERR
		};

		this.end = function (i) {
			if (i >=0 && i < ranges.length) {
				return ranges[i].end;
			}

			//todo: throw DOMException/INDEX_SIZE_ERR
		};
	}

	/*
	tests for TimeRanges
	todo: move these out into a separate file
	var ranges = new TimeRanges();
	ranges.add(0, 2);
	console.log(ranges.length, ranges.start(0), ranges.end(0));

	ranges.add(5, 6);
	console.log(ranges.length, ranges.start(1), ranges.end(1));

	ranges.add(3, 4);
	console.log(ranges.length, ranges.start(1), ranges.end(1));
	console.log(ranges.length, ranges.start(2), ranges.end(2));

	ranges.add(2, 3);
	console.log(ranges.length, ranges.start(1), ranges.end(1));

	ranges.add(0, 9);
	console.log(ranges.length, ranges.start(0), ranges.end(0));
	*/

	function Clip(parent, plugin, options) {
		var id = guid('spacetime'), //todo: allow forced id?
			that = this,
			playerMethods = {};

		function reset(player) {
			//todo: do we need more parameters?

			function setUpProperty(methodName, writeable) {
				var method = plugin[methodName] || methodName;

				if (typeof method === 'string') {
					if (player) {
						method = player[method];
						if (typeof method === 'function') {
							playerMethods[methodName] = method.bind(player);
						} else if (writeable) {
							playerMethods[methodName] = function (value) {
								if (value !== undefined) {
									player[method] = value;
								}
								return player[method];
							};
						} else {
							playerMethods[methodName] = function () {
								return player[method];
							};
						}
					}
				} else if (typeof method === 'function') {
					playerMethods[methodName] = method.bind(that);
				}
			}

			var key;

			player = typeof player === 'object' && player;
			for (key in clipPlayerMethods) {
				if (hasOwn(clipPlayerMethods, key)) {
					delete playerMethods[key];
					setUpProperty(key, clipPlayerMethods[key]);
				}
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

		}

		this.parent = parent;
		this.id = id;

		eventEmitterize(this);

		//this.playbackRate = 1;

		/*
		todo methods:
		- setCurrentTime
		- getCurrentTime
		- play
		- pause
		- activate
		- deactivate (calls pause)
		- destroy (calls pause)
		- modify
		- load(start, end). load(0, 0) means just metadata
		- set/get playback rate
		- get/set general properties
		- some way to access the compositable element(s) and/or data
		- compatible
		- report buffered, seekable ranges
		*/

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

		this.play = function () {
			//todo: update play/playing state
			if (playerMethods.play) {
				playerMethods.play();
			}
		};

		this.pause = function () {
			//todo: update play/playing state
			if (playerMethods.pause) {
				playerMethods.pause();
			}
		};

		this.activate = function () {
			if (playerMethods.activate) {
				playerMethods.activate();
			}
			//todo: if parent is playing, try to play
			//this.play();
			this.emit('activate');
		};

		this.deactivate = function () {
			if (playerMethods.deactivate) {
				playerMethods.deactivate();
			}
			this.pause();
			this.emit('deactivate');
		};

		this.destroy = function () {
			parent.remove(id);

			this.removeAllListeners();
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

		this.reset = reset;

		options = extend({}, options);
		plugin = extend({}, plugin);
		if (plugin.definition) {
			plugin = extend(plugin, plugin.definition.call(this, options));
		}

		this.start = parseTimeCode(options.start) || 0;

		//todo: is this audio, video or other?
		reset(plugin.player);
	}

	function Spacetime(opts) {
		//initialize object, private properties
		var options = opts || {},
			spacetime = this,
			isDestroyed = false,
			videoCompositor,
			audioCompositor,

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
				duration: NaN,
				ended: false,
				error: null,
				height: 0,
				loop: false,
				muted: false,
				networkState: 0,
				paused: true,
				playbackRate: 1,
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
			playing = false, //is time actually progressing?

			autoDraw,
			animationRequestId,

			/*
			minimum time in ms between update calls triggered by draw
			todo: make this a configurable option
			*/
			updateThrottle = 16,

			clipsByStart = [],
			clipsByEnd = [],
			clipsById = {},
			activeClips = {},
			startIndex = 0,
			endIndex = 0,

			id;

		function loadCompositor(list, type, def) {
			var compositor,
				name;

			if (list && !Array.isArray(list)) {
				if (typeof list === 'string') {
					list = [list];
				} else {
					list = [];
				}
			}
			name = findFirst((list || []).concat(def), function (id) {
				var comp = compositors[id];
				return comp && comp.type === type &&
					(!comp.compatible || comp.compatible());
			});

			//there should always be at least the default compositor that's compatible and loaded
			compositor = compositors[name];
			compositor = extend({}, compositor);
			if (compositor.definition) {
				compositor = extend(compositor, compositor.definition.call(spacetime, options));
			}

			return compositor;
		}

		function update() {
			var currentTime,
				rightNow = now();

			if (playing) {
				currentTime = (rightNow - lastUpdateTime) * playerState.playbackRate;
			} else {
				currentTime = playerState.currentTime;
			}
			lastUpdateTime = now();

			if (Math.abs(currentTime - playerState.currentTime) < 0.5) {
				return;
			}

			playerState.currentTime = currentTime;

			//todo: go through all clips that need to be updated, started or stopped

			//todo: if any one clip's currentTime is too far off expected value, fire 'waiting'
			//todo: if timeController is no longer active, select a new one
			//todo: tell clips which ones need to be loaded

			//todo: maybe throttle this? could be an option
			spacetime.emit('timeupdate');

			lastCurrentTime = currentTime;
		}

		function draw() {
			if (now() - lastUpdateTime > updateThrottle) {
				update();
			}

			//todo: go through all clips that need to be redrawn
			if (videoCompositor && videoCompositor.draw) {
				videoCompositor.draw.call(spacetime);
			}
			if (audioCompositor && audioCompositor.draw) {
				audioCompositor.draw.call(spacetime);
			}

			if (autoDraw) {
				cancelAnimationFrame(animationRequestId);
				animationRequestId = requestAnimationFrame(draw);
			}
		}

		/*
		Match loading states of HTMLMediaElement
		- allow `modify` method to determine whether to reset/empty state, based on properties changed
		- property changes that make it less "loaded" should trigger state reset
		*/

		//select compositors
		audioCompositor = loadCompositor(options.audioCompositor, 'audio', 'basic-audio');
		videoCompositor = loadCompositor(options.videoCompositor, 'video', 'dom-video');
		//todo: allow arbitrary data tracks and a compositor for each one?

		id = guid('spacetime');

		this.logger = extend(Spacetime.logger);

		this.id = function () {
			return id;
		};

		/*
		clip CRUD methods
		*/

		//add or update a clip
		//todo: allow batch loading of multiple clips
		this.add = function (hook, options) {
			/*
			todo: smart loading to infer hook by cycling through all plugins,
			running canPlaySrc on each one
			*/
			var clip = new Clip(this, plugins[hook], options);

			clipsById[clip.id] = clip;
			clipsByEnd.push(clip);
			clipsByStart.push(clip);

			/*
			todo: sort clips by start time and by end time
			or do a binary search/insertion
			*/

			/*
			todo: add listener to clip for when it changes and re-sort if
			start/end time are different
			*/

			if (videoCompositor && videoCompositor.add) {
				videoCompositor.add.call(spacetime, clip);
			}
			if (audioCompositor && audioCompositor.add) {
				audioCompositor.add.call(spacetime, clip);
			}
		};

		//remove a clip
		this.remove = function (clipId) {
			var clip = clipsById[clipId],
				i;

			if (clip) {
				/*
				todo: remove any listeners on this clip
				only necessary if we don't destroy the clip
				*/

				if (videoCompositor && videoCompositor.remove) {
					videoCompositor.remove.call(spacetime, clip);
				}
				if (audioCompositor && audioCompositor.remove) {
					audioCompositor.remove.call(spacetime, clip);
				}

				/*
				if we find we're using lots and lots of clips,
				it may be faster to binary search based on start/end times
				*/
				i = clipsByStart.indexOf(clip);
				if (i >= 0) {
					clipsByStart.splice(i, 1);
				}
				i = clipsByEnd.indexOf(clip);
				if (i >= 0) {
					clipsByEnd.splice(i, 1);
				}
				delete clipsById[clipId];
				//todo: destroy the clip?
			}
		};

		/*
		todo: add a method to test if a prospective clip is compatible, i.e.:
		- there is a plugin that canPlay the clip
		- the currently loaded compositor can handle both the plugin and the clip
		*/

		//todo list/search clips by time or hook

		//todo: set/get "global" properties

		eventEmitterize(this);
		//todo: first, next promises

		/*
		player methods
		todo: make this look like a HTMLMediaElement
		- canPlayType
		- canPlaySrc?
		- fastSeek?
		- load
		*/

		this.pause = function () {
			var key;

			//todo: update play/playing state

			for (key in activeClips) {
				if (hasOwn(activeClips, key)) {
					activeClips[key].pause();
				}
			}
		};

		this.play = function () {
			var key;

			//todo: update play/playing state

			//todo: check if all these clips are ready to play first
			for (key in activeClips) {
				if (hasOwn(activeClips, key)) {
					activeClips[key].play();
				}
			}
		};

		Object.defineProperty(this, 'currentTime', {
			configurable: false,
			enumerable: true,
			get: function () {
				return playerState.currentTime;
			},
			set: function (value) {
				value = parseFloat(value);
				//todo: throw error if not a number or not in range
				//todo: start seeking if necessary
				//todo: don't do anything if abs(currentTime - value) < precision
				//todo: don't do anything if !paused and (value - currentTime) is very small
			}
		});

		/*
		todo: more writeable properties
		- loop
		- width
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
		readOnlyProperties.forEach(function (property) {
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
			var key;

			isDestroyed = true;

			cancelAnimationFrame(animationRequestId);

			spacetime.removeAllListeners();

			for (key in clipsById) {
				if (hasOwn(clipsById, key)) {
					this.remove(key);
				}
			}

			if (videoCompositor && videoCompositor.destroy) {
				videoCompositor.destroy();
			}
			if (audioCompositor && audioCompositor.destroy) {
				audioCompositor.destroy();
			}

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

		//todo: allow this to be toggled and queried after create
		autoDraw = options.autoDraw === undefined ? true : !!options.autoDraw;
		if (autoDraw) {
			requestAnimationFrame(draw);
		}
	}

	Spacetime.plugin = function (hook, definition, meta) {
		var type;

		if (plugins[hook]) {
			Spacetime.logger.warn('Media Type [' + hook + '] already loaded');
			return false;
		}

		if (meta === undefined && typeof definition === 'object') {
			meta = definition;
		}

		/*
		if (!meta) {
			return false;
		}
		*/
		//todo: meta object should include canPlayType (and canPlaySrc?) method/regex

		type = extend({}, meta);

		if (typeof definition === 'function') {
			type.definition = definition;
		}

		if (!type.title) {
			type.title = hook;
		}

		plugins[hook] = type;
		allClipsByType[hook] = [];

		return true;
	};

	Spacetime.removePlugin = function (hook) {
		var all, clip, plugin;

		if (!hook) {
			return;
		}

		plugin = plugins[hook];

		if (!plugin) {
			return;
		}

		all = allClipsByType[hook];
		if (all) {
			while (all.length) {
				clip = all.shift();
				clip.destroy();
			}
			delete allClipsByType[hook];
		}

		delete plugins[hook];
	};

	Spacetime.compositor = function (hook, definition, meta) {
		if (compositors[hook]) {
			Spacetime.logger.warn('Compositor [' + hook + '] already loaded');
			return false;
		}

		if (meta === undefined && typeof definition === 'object') {
			meta = definition;
		}

		if (!meta.type) {
			/*
			todo: does it need to be one of the pre-defined compositor types? (video, audio, data) probably not
			*/
			Spacetime.logger.error('Cannot define compositor [' + hook + '] without a type');
			return;
		}

		/*
		if (!meta) {
			return false;
		}
		*/

		meta = extend({}, meta);

		if (typeof definition === 'function') {
			meta.definition = definition;
		}

		if (!meta.title) {
			meta.title = hook;
		}

		compositors[hook] = meta;

		return true;
	};

	Spacetime.removeCompositor = function (hook) {
		var all, compositor, plugin;

		if (!hook) {
			return;
		}

		plugin = compositors[hook];

		/*
		todo: throw an error if any compositions are using it or destroy them?
		In practice, this is probably just here for cleaning up unit tests
		*/

		delete compositors[hook];
	};

	/*
	set up shims
	*/
	if (window.performance && window.performance.now) {
		now = window.performance.now.bind(window.performance);
	} else {
		now = Date.now.bind(Date);
	}

	/*
	Utilities
	*/
	Spacetime.util = Spacetime.prototype.util = {
		now: now,
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
			starTime;

		return {
		};
	});

	Spacetime.compositor('dom-video', function (container, options) {
		//this part runs when a new composition is created
		var activeClass = options && options.activeClass || 'active';
		return {
			//for when parent container is set or changes
			parent: function (parent) {
			},
			move: function (clip) {
				//todo: set which layer this clip goes to. z-index, I guess? or sort order
			},
			add: function (clip) {
				//new clip is added to the composition
				//returns object to be operated upon
				//if throws or returns false, add fails
				//todo: just return the dom element object
			},
			activate: function (clip, element) {
				element.classList.add(activeClass);
			},
			deactivate: function (clip, element) {
				element.classList.remove(activeClass);
			},
			remove: function (clip, element) {
				//clip is removed from composition
				//todo: may not need to do anything here
			},
			destroy: function () {
				//composition is destroyed
			}
		};
	}, {
		title: 'DOM Video',
		type: 'video'
	});

	/*
	todo: do we allow a single compositor to support both audio and video?
	todo: what about data tracks?
	*/
	Spacetime.compositor('basic-audio', function () {
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
	}, {
		title: 'Basic Audio',
		type: 'audio'
	});

	return Spacetime;
}(this));