(function() {
	'use strict';

	var gulp = require('gulp');
	var runSequence = require('run-sequence');

	gulp.task('dev-tests', function () {
		runSequence('dev', 'build-tests');
	});

	gulp.task('watch', function () {
		gulp.watch([
			'spacetime.js',
			'lib/**/*',
			'compositors/**/*',
			'plugins/**/*'
		], ['dev-tests']);

		gulp.watch([
			'test/*.js'
		], ['build-tests']);
	});
}());
