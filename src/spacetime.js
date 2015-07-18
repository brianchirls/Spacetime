module.exports = (function () {
	'use strict';

	const

	/*
		Utility functions (other files)
	*/
		eventEmitterize = require('./event-emitterize'),
		parseTimeCode = require('./parse-timecode'),
		forEach = require('lodash.foreach'), //todo: implement our own, faster
		binarySearch = require('binary-search'),
		Clip = require('./clip'),
		Clock = require('./clock'),
		TimeRanges = require('./time-ranges'),
		{
			extend,
			hasOwn,
			guid,
			consoleMethod,
			findFirst
		} = require('./utils'),

	/*
		Global reference variables
	*/
		loadAheadTime = 10,

		defaultCompositors = {
			audio: ['basic-audio'],
			video: ['dom-video']
			//todo: data, subtitles, 3d?
		},

		readOnlyProperties = [
			'ended',
			'error',
			'buffered',
			'networkState',
			'paused',
			'readyState',
			'seeking',
			'videoHeight',
			'videoWidth'
		],

	/*
	shims and API status
	- todo: web audio API?
	- todo: move all now and timing stuff into Clock
	- todo: move requestAnimationFrame into compositor
	*/
		requestAnimationFrame = require('./raf').requestAnimationFrame,
		cancelAnimationFrame = require('./raf').cancelAnimationFrame;

	/*
		Global "environment" variables
	*/
	let
		globalPlugins = {},
		globalCompositors = {};

	/*
		utility functions
	*/

	function compareClipsByStart(a, b) {
		if (a === b) {
			return 0;
		}

		let diff = a.start() - b.start() ||
			(a.end() || a.start()) - (b.end() || b.start());

		if (!diff) {
			return a.id < b.id ? -1 : 1;
		}

		return diff;
	}

	function compareClipsByEnd(a, b) {
		if (a === b) {
			return 0;
		}

		let diff = (a.end() || a.start()) - (b.end() || b.start()) ||
			a.start() - b.start();

		if (!diff) {
			return a.id < b.id ? -1 : 1;
		}

		return diff;
	}

	function Spacetime(opts) {
		//initialize object, private properties
		const spacetime = this;

		let options = opts || {},
			isDestroyed = false,
			compositors = {},

			Layer,

			internal,
			buffered = new TimeRanges(),
			playerState = {
				autoplay: false,
				buffered: buffered.pub,
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
		}

		function deactivateClip(clip) {
			delete activeClips[clip.id];
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

		//tell clips which ones need to be loaded/queued
		/*
		todo: can we tell clips to abort loading?

		I'd like to get more advanced and keep track of how many clips are actively
		using the network. Maybe even number of live network connections for each
		clip, so we can account for nested compositions. lookAheadTime would be
		adjusted based on number of network connections in use.
		*/
		function updateLoadingClips() {
			const direction = playerState.playbackRate >= 0 ? 1 : -1,
				currentTime = playerState.currentTime,
				clips = playerState.playbackRate >= 0 ? clipsByStart : clipsByEnd,
				loadAhead = loadAheadTime * Math.abs(playerState.playbackRate);

			let i = playerState.playbackRate >= 0 ? startIndex : endIndex,
				delta = 0,
				count = 0,
				time = 0,
				clip;

			while (count < 10 && i >= 0 && i < clips.length) {
				clip = clips[i];
				time = direction > 0 ? clip.start() : clip.end();
				delta = (time - currentTime) * direction;
				if (delta >= loadAhead) {
					break;
				}

				if (!clip.isCurrent()) {
					clip.seek(time, 1 / 60);
				}

				//todo: load from currentTime, not from clip edge time; round to nearest 5 secs?
				//todo: take into account preload settings
				clip.load(Math.min(time, time + loadAhead * direction), Math.max(time, time + loadAhead * direction));

				i += direction;
				count++;
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
						/*
						todo: do not deactivate clip if currentTime === playerState.duration
						*/

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

			updateLoadingClips();

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

		function updateBuffered(start, end) {
			/*
			Scan through all clips that overlap with this range and find places
			where they're all buffered. First, add the whole clip. Then, subtract
			all parts of clips in that range that are not buffered.

			todo: calculate canplaythrough, canplayall, etc. and fire events
			todo: use much wider range if a clip length is reduced
			todo: only use enabled clips
			todo: figure out how to tell if anything changed and fire progress
			*/
			var i, j,
				clip,
				rangeStart,
				rangeEnd,
				clipStart;

			buffered.add(start, end);

			for (i = 0; i < clipsByStart.length; i++) {
				clip = clipsByStart[i];
				clipStart = clip.start();

				if (clip.start() > end) {
					break;
				}

				if (clip.end() >= start) {
					rangeStart = 0;
					for (j = 0; j < clip.buffered.length; j++) {
						rangeEnd = clip.buffered.start(j);
						if (rangeEnd > rangeStart) {
							buffered.subtract(rangeStart + clipStart, rangeEnd + clipStart);
						}
						rangeStart = clip.buffered.end(j);
					}
					rangeEnd = clip.end() - clipStart;
					if (rangeEnd > rangeStart) {
						buffered.subtract(rangeStart + clipStart, rangeEnd + clipStart);
					}
				}
			}

			spacetime.emit('progress');
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

			update(true);
			if (dur !== playerState.duration) {
				playerState.duration = dur;
				//todo: maybe we want to hold off on durationchange until all clips have a duration?
				spacetime.emit('durationchange');
				updateFlow();
				updateBuffered(0, dur);
			}
		}

		/*
		scan through all clips to determine whether we can play, whether
		we are done seeking.
		todo: set loading state here
		todo: move readyState out of here and into updateBuffered
		*/
		function checkPlayingState() {
			var id,
				clip,
				readyState = 4,
				clipsPlaying = true;

			/*
			First, determine aggregate state of clips - whether they're playing,
			whether they're ready to play.
			todo: networkState
			*/
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
				/*
				If we've finished seeking, fire the 'seeked' event
				*/
				if (playerState.seeking) {
					playerState.seeking = false;
					spacetime.emit('seeked');
				}

				/*
				If all clips are ready to play and they're supposed to play,
				play them and fire 'playing event'
				*/
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
				/*
				We were playing, but now we're not anymore because at least
				one clip has stopped. So pause the others and fire 'waiting'.
				*/
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
			if (clock.now() - lastUpdateTime > updateThrottle) {
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

			/*
			todo: set any missing start times
			*/
			updateDuration();
			updateFlow();
		}

		function addClipToLayer(clip, layerId) {

			function overlaps(c) {
				return c.start() < (clip.end() || Infinity) && c.end() > clip.start();
			}

			var layerId,
				layer,
				c;

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
				c = findFirst(layer.clips, overlaps);
				if (c) {
					/*
					todo: replace this whole thing with splice
					if resulting clip length is 0, remove it
					*/
					c.splice(clip.start(), clip.end());
				}
			} else if (layersOrder.length) {
				c = findFirst(layersOrder[layersOrder.length - 1].clips, overlaps);
				if (!c) {
					layer = layersOrder[layersOrder.length - 1];
				}
			}
			if (!layer) {
				layerId = guid('spacetime');
				spacetime.addLayer(layerId);
				layer = layersById[layerId];
			}
			layer.add(clip);
			clip.layer = layer;
		}

		function loadClip(clip, layerId) {
			if (clipsById[clip.id]) {
				return;
			}

			clipsById[clip.id] = clip;
			plugins[clip.type].clips[clip.id] = clip.id;
			/*
			todo:
			make a lookup of clips by 'name' option and make that searchable later
			*/

			addClipToLayer(clip, layerId);

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

			//todo: also fire when loading is reset
			clip.on(['progress', 'empty'], () => {
				updateBuffered(clip.start(), clip.end());
			});
			clip.on('timechange', () => {
				// remove it from the old place in queues before re-inserting to the new place
				removeClipFromLists(clip);
				addClipToLists(clip);
				updateBuffered(0, playerState.duration);
			});

			clip.on([
				'seeking',
				'seeked',
				'playing',
				'waiting'
			], checkPlayingState);

			//temp for debuggin
			// [
			// 	'waiting',
			// 	'seeking',
			// 	'seeked',
			// 	'playing',
			// 	'play',
			// 	'progress',
			// 	'stalled',
			// 	'suspend'
			// ].forEach((evt) => {
			// 	clip.on(evt, (e) => {
			// 		console.log(evt, e && e.target.currentTime, e && e.target.seeking, e && e.target.src);
			// 	});
			// });

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

			//addClipToLists calls update and will activate this clip if necessary
			addClipToLists(clip);

			//todo: fire event for clip added, with clip id
		}

		/*
			Constructors
		*/
		Layer = function (options) {
			const self = this;

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

		internal = {
			spacetime,
			state: playerState,
			duration,
			buffered,
			loadClip
		};

		this.logger = extend(Spacetime.logger);

		this.id = function () {
			return id;
		};

		/*
		Methods for installing and removing all plugin types
		*/

		this.plugin = function (hook, definition) {
			var plugin;

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
			let id;

			if (options.id) {
				if (clipsById[options.id]) {
					throw new Error('Clip with id ' + options.id + ' already exists');
				}
				id = options.id;
			} else {
				id = guid('spacetime');
			}

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

			loadClip(new Clip(internal, plugins[hook], options), options.layer);

			//todo: maybe it should return the clip? see what jQuery does
			return spacetime;
		};

		//remove a clip
		this.remove = function (clipId) {
			const clip = clipsById[clipId];

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

		this.getClipById = function (id) {
			var clip = clipsById[id];
			return clip && clip.pub || null;
		};

		/*
		search by:
		- from/to in timeline
		- plugin(s)
		- output type
		- layer
		- enabled/disabled?
		- active/inactive?
		- plugin-specific properties?

		todo: might be fun to make this return an iterator one day
		*/
		this.findClips = function (search) {
			var results = [],
				clip,
				i;

			for (i = 0; i < clipsByStart.length; i++) {
				clip = clipsByStart[i];

				if (search) {
					// to
					if (search.to < Infinity && clip.start() > search.to) {
						// done searching
						break;
					}

					// jscs:disable disallowKeywords

					// from
					if (search.from > 0 && clip.end() < search.from) {
						continue;
					}

					// todo: we may rename 'plugin' to something else?
					if (Array.isArray(search.plugin) && search.plugin.indexOf(clip.type) < 0 ||
							typeof search.plugin === 'string' && clip.type !== search.plugin) {
						continue;
					}

					/*
					todo:
					- output/compositor type(s)
					- layer
					- enabled/disabled?
					- active/inactive?
					- etc...
					*/

					// jscs:enable disallowKeywords
				}

				results.push(clip.pub);
			}

			return results;
		};

		/*
		todo: add a method to test if a prospective clip is compatible, i.e.:
		- there is a plugin that canPlay the clip
		- the currently loaded compositor can handle both the plugin and the clip
		*/

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
				i;

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

			updateLoadingClips();
			checkPlayingState();

			//todo: start loading from currentTime

			update(true);

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

		//todo: allow this to be toggled and queried after create
		//todo: auto-updates too?
		autoDraw = options.autoDraw === undefined ? true : !!options.autoDraw;
		if (autoDraw) {
			draw();
		}
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

	//todo: move this out into separate file; include it in the browser build?
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
