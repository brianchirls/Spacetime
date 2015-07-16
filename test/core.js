'use strict';

import test from 'tape';
import Spacetime from '../spacetime';

test('Spacetime Static Methods', function (t) {
	var statics = ['plugin', 'compositor'];

	t.plan(statics.length);

	statics.forEach((key) => {
		t.equal(typeof Spacetime[key], 'function', 'Spacetime.' + key + '() is a static function');
	});
});

test('Spacetime.destroy()', function (t) {
	// todo: make spacetime and destroy it
	// todo: make a clip and a layer and make sure they get destroyed
	// todo: look for appropriate events
	// todo: check isDestroyed
	// todo: make sure emitted events don't fire after destroyed
	t.end();
});
