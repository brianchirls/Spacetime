(function() {
	'use strict';
	var gulp = require('gulp');
	var webpack = require('gulp-webpack');

	gulp.task('build-test', function () {
		var config = require('../../config');

		return gulp.src('./test/test.js')
			.pipe(webpack(config.test))
			.pipe(gulp.dest('build'))
			.on('error', function(err) {
				// Make sure failed tests cause gulp to exit non-zero
				// todo: this does not work. may need to refactor, not using gulp-webpack
				throw err;
			});
	});
}());
