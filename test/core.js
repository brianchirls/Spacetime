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
			'draw'
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

test('Spacetime.destroy()', function (t) {
	// todo: make spacetime and destroy it
	// todo: make a clip and a layer and make sure they get destroyed
	// todo: look for appropriate events
	// todo: check isDestroyed
	// todo: make sure emitted events don't fire after destroyed
	t.end();
});
