(function() {
	'use strict';

	var gulp = require('gulp');
	var webpack = require('gulp-webpack');

	gulp.task('min', function () {
		var config = require('../../config');

		return gulp.src('./spacetime.js')
			.pipe(webpack(config.min))
			.pipe(gulp.dest('build'));
	});
}());
