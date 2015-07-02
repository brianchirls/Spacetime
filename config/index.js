module.exports = (function () {
	'use strict';

	var assign = require('object-assign');
	var webpack = require('webpack');
	var pkg = require('../package.json');

	var banner = [
		pkg.name + ' - ' + pkg.description,
		'@version v' + pkg.version,
		'@link ' + pkg.homepage,
		'@license ' + pkg.license
	].join('\n');

	var common = {
		// entry: './src/entry.js',
		module: {
			preLoaders: [
				{
					test: /\.js$/,
					exclude: /node_modules|bower_components|src\/lib/,
					loader: 'jshint-loader'
				},
				{
					test:	/\.js$/,
					exclude: /node_modules|bower_components/,
					loader: 'jscs-loader'
				}
			],
			loaders: [
				{
					test: /\.js$/,
					exclude: /node_modules/,
					loader: 'babel-loader'
				}
			]
		},
		resolve: {
			modulesDirectories: ['node_modules', 'bower_components']
		},
		plugins: [
			new webpack.ResolverPlugin(
				new webpack.ResolverPlugin.DirectoryDescriptionFilePlugin('bower.json', ['main'])
			)
		],

		jshint: assign({
			failOnHint: true,
			emitErrors: true
		}, pkg.jshintConfig),

		jscs: {
			emitErrors: true,
			failOnHint: true,
			esnext: true,

			preset: 'crockford',
			validateIndentation: '\t',
			validateLineBreaks: 'LF',
			requireLineFeedAtFileEnd: null,
			validateQuoteMarks: '\''
		}
	};

	var exports = {};

	exports.dev = assign({}, common, {
		debug: true,
		devtool: 'eval', //sourcemap?
		output: {
			filename: 'spacetime.js',
			pathInfo: true,
			libraryTarget: 'umd',
			library: 'Spacetime'
		}
	});

	exports.production = assign({}, common, {
		devtool: 'source-map',
		output: {
			filename: 'spacetime.js',
			sourceMapFilename: '[file].map',
			libraryTarget: 'umd',
			library: 'Spacetime'
		},

		jshint: assign({
			unused: true
		}, common.jshint),

		plugins: common.plugins.concat([
			new webpack.DefinePlugin({
				'process.env': {
					// This has effect on the react lib size
					// 'NODE_ENV': JSON.stringify('production')
				}
			}),
			new webpack.optimize.DedupePlugin(),
			new webpack.BannerPlugin(banner)
		])
	});

	exports.min = assign({}, exports.production, {
		devtool: 'source-map',
		output: {
			filename: 'spacetime.min.js',
			sourceMapFilename: '[file].map',
			libraryTarget: 'umd',
			library: 'Spacetime'
		},
		plugins: common.plugins.concat([
			new webpack.DefinePlugin({
				'process.env': {
					// This has effect on the react lib size
					// 'NODE_ENV': JSON.stringify('production')
				}
			}),
			new webpack.optimize.DedupePlugin(),
			new webpack.optimize.UglifyJsPlugin({
				compress: {
					warnings: false
				}
			}),
			new webpack.BannerPlugin(banner)
		])
	});

	return exports;
}());
