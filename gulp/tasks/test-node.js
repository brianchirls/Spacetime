(function() {
	'use strict';
	var gulp = require('gulp');
	var tape = require('tape');
	var requireUncached = require('require-uncached');
	var tapSpec = require('tap-spec');

	gulp.task('test-node', function () {
		var stream = tape.createStream();

		requireUncached('../../build/test-common.js');

		return stream
			.pipe(tapSpec());
	});
}());
