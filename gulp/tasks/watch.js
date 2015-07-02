(function() {
	'use strict';

	var gulp = require('gulp');

	gulp.task('watch', function () {
		gulp.watch([
			'spacetime.js',
			'lib/**/*',
			'compositors/**/*',
			'plugins/**/*'
		], ['dev']);
	});
}());
