require('./gulp');

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
