/*jslint devel: true, bitwise: true, browser: true, white: true, nomen: true, plusplus: true, maxerr: 50, indent: 4, todo: true */
/*global define, module, exports */
(function (root, factory) {
	'use strict';

	//todo: load Q as a dependency

	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define('spacetime', function () {
			return factory(root);
		});
	} else if (typeof exports === 'object') {
		module.exports = factory(root);
	} else if (typeof root.Spacetime !== 'function') {
		// Browser globals
		root.Spacetime = factory(root);
	}
}(this, function (window, undefined) {
	'use strict';

	var document = window.document,
		console = window.console,

	/*
		Global environment variables
	*/

	maxSpacetimeId = 0,
	nop = function () {},
	plugins = {},
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

	/*
	todo: shims and API status
	- requestAnimationFrame, cancelAnimationFrame
	- web audio API
	*/
	now;

	/*
		utility functions
	*/

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

	function hasOwn(obj, property) {
		return Object.prototype.hasOwnProperty.call(obj, property);
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

	//todo: see if there's existing code that does this
	//todo: consider moving this out into a separate file as a dependency?
	//inspired by Node EventEmitter class http://nodejs.org/api/events.html
	function eventEmitterize(that) {
		var listeners = {},
			once = {};

		that.on = function (event, listener) {
			var list,
				onceList,
				i;

			if (!event || typeof listener !== 'function') {
				return that;
			}

			list = listeners[event];
			if (!list || !Array.isArray(list)) {
				list = listeners[event] = [];
			} else if (list.indexOf(listener) >= 0) {
				return that;
			}

			//remove this from once, since we're gonna call it all the time now
			onceList = once[event];
			if (onceList && Array.isArray(onceList)) {
				i = onceList.indexOf(listener);
				if (i >= 0) {
					onceList.splice(i, 1);
				}
			}

			list.push(listener);
			return that;
		};

		that.off = function (event, listener) {
			var list,
				i;

			if (!event) {
				return that;
			}

			list = listeners[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					list.splice(i, 1);
					return that;
				}
			}

			list = once[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					list.splice(i, 1);
				}
			}

			return that;
		};

		that.once = function (event, listener) {
			var list,
				i;

			if (!event || typeof listener !== 'function') {
				return that;
			}

			//don't bother if it's already being called all the time
			list = listeners[event];
			if (list && Array.isArray(list)) {
				i = list.indexOf(listener);
				if (i >= 0) {
					return that;
				}
			}

			list = once[event];
			if (!list || !Array.isArray(list)) {
				list = once[event] = [];
			} else if (list.indexOf(listener) >= 0) {
				return that;
			}

			list.push(listener);
		};

		that.emit = function (event) {
			//todo: change this to emit event asynchronously
			var list,
				i,
				listener,
				args;

			list = listeners[event];
			if (list && Array.isArray(list)) {
				args = Array.prototype.slice(arguments, 1);
				for (i = 0; i < list.length; i++) {
					listener = list[i];
					listener.apply(that, args);
				}
			}

			list = once[event];
			if (list && Array.isArray(list)) {
				if (!args) {
					args = Array.prototype.slice(arguments, 1);
				}

				while (list.length) {
					listener = list.shift();
					listener.apply(that, args);
				}
			}
		};

		that.removeAllListeners = function (event) {
			if (event) {
				delete listeners[event];
				delete once[event];
			} else {
				listeners = {};
				once = {};
			}
		};

		/*
		todo:
		- once
		- setMaxListeners
		- listeners
		- newListener/removeListener events?
		- removeAllListeners?
		*/

		that.addEventListener = that.on;
		that.removeEventListener = that.off;
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
		var id, //todo: generate id. allow forced id?
			that = this,
			playerMethods = {};

		/*
		Match loading states of HTMLMediaElement
		- allow `modify` method to determine whether to reset/empty state, based on properties changed
		- property changes that make it less "loaded" should trigger state reset
		*/

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

			/*
			todo:
			- reset readyState, networkState
			- fire emptied, abort, whatever necessary events
			*/

			player = typeof player === 'object' && player;
			for (key in clipPlayerMethods) {
				if (hasOwn(clipPlayerMethods, key)) {
					delete playerMethods[key];
					setUpProperty(key, clipPlayerMethods[key]);
				}
			}

			//todo: what about a method for getting buffered sections?
		}

		this.parent = parent;

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

		this.reset = reset;

		options = extend({}, options);
		if (plugin.definition) {
			plugin = extend(plugin, plugin.definition.call(this, options));
		}

		//todo: is this audio, video or other?
		reset(plugin.player);

	}

	function Spacetime(opts) {
		//initialize object, private properties
		var options = opts || {},
			id,
			spacetime = this,
			isDestroyed = false,

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
			endIndex = 0;

		function update() {
			var currentTime,
				rightNow = now();

			if (playing) {
				currentTime = (rightNow - lastUpdateTime) * playerState.playbackRate;
			}
			lastUpdateTime = now();

			if (Math.abs(currentTime - playerState.currentTime) < 0.5) {
				return;
			}

			playerState.currentTime = currentTime;
			//todo: go through all clips that need to be updated, started or stopped
			//todo: if any one clip's currentTime is too far off expected value, fire 'waiting'
			//todo: if timeController is no longer active, select a new one
		}

		function draw() {
			if (now() - lastUpdateTime > updateThrottle) {
				update();
			}

			//todo: go through all clips that need to be redrawn

			if (autoDraw) {
				cancelAnimationFrame(animationRequestId);
				animationRequestId = requestAnimationFrame(draw);
			}
		}

		maxSpacetimeId++;
		id = maxSpacetimeId;

		this.logger = extend(Spacetime.logger);

		eventEmitterize(this);

		this.id = function () {
			return id;
		};

		/*
		clip CRUD methods
		*/

		//add or update a clip
		//todo: allow batch loading of multiple clips
		this.add = function (hook, options) {
			var clip = new Clip(this, plugins[hook], options);
		};

		//remove a clip
		this.remove = function (clipId) {
		};

		//todo list/search clips by time or hook

		//todo: set/get "global" properties

		//todo: event emitter
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
			isDestroyed = true;

			spacetime.removeAllListeners();
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

		return;
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
		now: now
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

	return Spacetime;
}));