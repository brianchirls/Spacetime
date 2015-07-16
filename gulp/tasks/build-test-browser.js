(function() {
	'use strict';
	var gulp = require('gulp');
	var webpack = require('gulp-webpack');
	var assign = require('object-assign');

	gulp.task('build-test-browser', function () {
		var config = require('../../config');

		return gulp.src('./test/test-browser.js')
			.pipe(webpack(assign({}, config.test, {
				output: {
					filename: 'test-browser.js'
				}
			})))
			.pipe(gulp.dest('build'))
			.on('error', function(err) {
				// Make sure failed tests cause gulp to exit non-zero
				// todo: this does not work. may need to refactor, not using gulp-webpack
				throw err;
			});
	});
}());
