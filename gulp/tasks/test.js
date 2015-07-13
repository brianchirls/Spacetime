(function() {
	'use strict';
	var gulp = require('gulp');
	var runSequence = require('run-sequence');

	gulp.task('test', function(callback) {
		runSequence('build-test', 'test-node');
	});
}());
