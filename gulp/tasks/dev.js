(function() {
	'use strict';
	var gulp = require('gulp');
	var webpack = require('gulp-webpack');

	gulp.task('dev', function () {
		var config = require('../../config');

		return gulp.src('./spacetime.js')
			.pipe(webpack(config.dev))
			.pipe(gulp.dest('build'));
	});
}());
