(function() {
	'use strict';
	var gulp = require('gulp');
	var webpack = require('gulp-webpack');
	var assign = require('object-assign');

	/*
	todo: figure out if it's possible to build node tests using 'external' setting
	for at least spacetime so it will hopefully build faster and smaller
	*/

	gulp.task('build-test-node', function () {
		var config = require('../../config');

		return gulp.src('./test/test-common.js')
			.pipe(webpack(assign({}, config.test, {
				debug: false,
				devtool: '',
				output: {
					filename: 'test-node.js',
					libraryTarget: 'commonjs'
				},
				target: 'node',
				externals: [
					'binary-search',
					'lodash.foreach',
					'next-tick'
				]
			})))
			.pipe(gulp.dest('build'))
			.on('error', function(err) {
				// Make sure failed tests cause gulp to exit non-zero
				// todo: this does not work. may need to refactor, not using gulp-webpack
				throw err;
			});
	});
}());
