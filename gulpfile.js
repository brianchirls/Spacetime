//based on example: https://github.com/webpack/webpack-with-common-libs/blob/master/gulpfile.js

var gulp = require('gulp');
var gutil = require('gulp-util');
var webpack = require('webpack');
var webpackConfig = require('./webpack.config.js');

// Build and watch cycle (another option for development)
// Advantage: No server required, can run app from filesystem
// Disadvantage: Requests are not blocked until bundle is available,
//               can serve an old app on refresh
gulp.task('watch', ['webpack:build-dev'], function() {
	gulp.watch(['spacetime.js', 'lib/**/*'], ['webpack:build-dev']);
});

// Development build
gulp.task('default', ['webpack:build-dev']);

// Production build
gulp.task('build', function(callback) {
	// build two production versions - one minified, one not

	var gulpWebpack = require('gulp-webpack');
	var uglify = require('gulp-uglify');
	var rename = require('gulp-rename');
	var header = require('gulp-header');
	var pkg = require('./package.json');

	var banner = [
		'/**',
		' * <%= pkg.name %> - <%= pkg.description %>',
		' * @version v<%= pkg.version %>',
		' * @link <%= pkg.homepage %>',
		' * @license <%= pkg.license %>',
		' */',
	''].join('\n');

	// modify some webpack config options
	var productionConfig = Object.create(webpackConfig);
	productionConfig.plugins.push(new webpack.DefinePlugin({
			'process.env': {
				// This has effect on the react lib size
				'NODE_ENV': JSON.stringify('production')
			}
		}),
		new webpack.optimize.DedupePlugin()
	);

	return gulp.src('src/entry.js')
		.pipe(gulpWebpack(productionConfig))
		.pipe(header(banner, { pkg : pkg } ))
		.pipe(gulp.dest('build/'))
		.pipe(uglify())
		.pipe(header(banner, { pkg : pkg } ))
		.pipe(rename({
			suffix: '.min'
		}))
		.pipe(gulp.dest('build/'));
});

// The development server (the recommended option for development)
gulp.task('server', ['webpack-dev-server']);

// modify some webpack config options
var myDevConfig = Object.create(webpackConfig);
myDevConfig.devtool = 'sourcemap';
myDevConfig.debug = true;
myDevConfig.output.pathInfo = true;

// create a single instance of the compiler to allow caching
var devCompiler = webpack(myDevConfig);

gulp.task('webpack:build-dev', function(callback) {
	// run webpack
	devCompiler.run(function(err, stats) {
		if(err) throw new gutil.PluginError('webpack:build-dev', err);
		gutil.log('[webpack:build-dev]', stats.toString({
			colors: true
		}));
		callback();
	});
});

/*
This is broken right now. don't use it
gulp.task('webpack-dev-server', function(callback) {
	var WebpackDevServer = require('webpack-dev-server');

	// modify some webpack config options
	var myConfig = Object.create(webpackConfig);
	myConfig.devtool = 'sourcemap';
	myConfig.debug = true;

	// Start a webpack-dev-server
	new WebpackDevServer(webpack(myConfig), {
		publicPath: '/' + myConfig.output.publicPath,
		stats: {
			colors: true
		}
	}).listen(8080, 'localhost', function(err) {
		if(err) throw new gutil.PluginError('webpack-dev-server', err);
		gutil.log('[webpack-dev-server]', 'http://localhost:8080/webpack-dev-server/index.html');
	});
});
*/
