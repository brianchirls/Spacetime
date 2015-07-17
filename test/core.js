'use strict';

import test from 'tape';
import Spacetime from '../spacetime';
import eventEmitterize from '../lib/event-emitterize';

test('Spacetime Static Methods', function (t) {
	var statics = ['plugin', 'compositor'];

	t.plan(statics.length);

	statics.forEach((key) => {
		t.equal(typeof Spacetime[key], 'function', 'Spacetime.' + key + '() is a static function');
	});
});

test('Spacetime Instance Methods and Properties', function (t) {
	var methods = [
			'id',
			'plugin',
			'removePlugin',
			'compositor',
			'removeCompositor',
			'add',
			'remove',
			'addLayer',
			'removeLayer',
			'pause',
			'play',
			'load',
			'destroy',
			'isDestroyed',
			'draw',
			'getClipById',
			'findClips'
		],
		properties = [
			'currentTime',
			'duration',
			'ended',
			'error',
			'buffered',
			'networkState',
			'paused',
			'readyState',
			'seeking',
			'videoHeight',
			'videoWidth',
			'logger'
		],
		spacetime;

	methods.push.apply(methods, Object.keys(eventEmitterize()));

	t.plan(methods.length + properties.length + 1);

	spacetime = new Spacetime({
		autoDraw: false
	});

	methods.forEach((key) => {
		t.equal(typeof spacetime[key], 'function', 'Spacetime.' + key + '() is a method');
	});

	properties.forEach((key) => {
		t.ok(typeof properties[key] !== undefined && typeof properties[key] !== 'function',
			'Spacetime.' + key + ' is a property');
	});

	t.equal(Object.keys(spacetime).length, methods.length + properties.length, 'No extra properties on Spacetime object');

	spacetime.destroy();
});

test('Find clips', function (t) {
	var spacetime = new Spacetime(),
		results;

	spacetime.plugin('one', function (options) {
		return {
		};
	});

	spacetime.plugin('two', function (options) {
		return {
		};
	});

	spacetime.add('', {
		id: '0',
		start: 0,
		end: 12
	});

	t.equal(spacetime.getClipById('0').id, '0', 'Spacetime.getClipById() returns clip');
	t.equal(spacetime.getClipById('nothing'), null, 'Spacetime.getClipById() returns null for unmatched id');

	spacetime.add('one', {
		id: 'from',
		start: 1,
		end: 3
	});

	spacetime.add('two', {
		id: 'between',
		start: 4,
		end: 5
	});

	spacetime.add('', {
		id: 'to',
		start: 9,
		end: 11
	});

	spacetime.add('', {
		id: 'before',
		start: 0,
		end: 1
	});

	spacetime.add('', {
		id: 'after',
		start: 11,
		end: 12
	});

	results = spacetime.findClips({
		from: 2,
		to: 10
	}).map(function (clip) {
		return clip.id;
	});

	t.ok(results.indexOf('from') >= 0, 'Spacetime.findClips: find clip that overlaps with from');

	t.ok(results.indexOf('from') >= 0, 'Spacetime.findClips: find clip that overlaps with from');
	t.ok(results.indexOf('to') >= 0, 'Spacetime.findClips: find clip that overlaps with to');
	t.ok(results.indexOf('between') >= 0, 'Spacetime.findClips: find clip fully between from/to');
	t.ok(results.indexOf('0') >= 0, 'Spacetime.findClips: find clip that covers full range');
	t.ok(results.indexOf('after') < 0, 'Spacetime.findClips: ignore clip that\'s fully after to');
	t.ok(results.indexOf('before') < 0, 'Spacetime.findClips: ignore clip that\'s fully before from');

	//search for a single plugin/type
	results = spacetime.findClips({
		plugin: 'one'
	}).map(function (clip) {
		return clip.id;
	});

	t.ok(results, ['from'], 'Spacetime.findClips: find clip that matches a single plugin');

	//search for a single plugin/type
	results = spacetime.findClips({
		plugin: ['one', 'two']
	}).map(function (clip) {
		return clip.id;
	});
	t.ok(results, ['from', 'between'], 'Spacetime.findClips: find clips that match a multiple plugins');

	spacetime.destroy();
	t.end();
});

test('Spacetime.destroy()', function (t) {
	var spacetime = new Spacetime({
		autoDraw: false
	});

	t.notOk(spacetime.isDestroyed(), 'Spacetime.isDestroyed is false before destroyed');

	// todo: make a clip and a layer and make sure they get destroyed
	// todo: look for appropriate events

	spacetime.destroy();

	// todo: make sure emitted events don't fire after destroyed
	t.ok(spacetime.isDestroyed(), 'Spacetime.isDestroyed is true after destroyed');

	t.end();
});
