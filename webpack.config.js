var webpack = require("webpack");
module.exports = {
    entry: "./spacetime.js",
    output: {
        path: __dirname + '/build/',
        filename: "spacetime.js",
        library: 'Spacetime',
        libraryTarget: 'umd'
    },
    module: {
        preLoaders: [
            {
                test: /\.js$/,
                exclude: /node_modules|bower_components/,
                loader: 'jshint-loader'
            },
            {
                test:    /\.js$/,
                exclude: /node_modules|bower_components/,
                loader: 'jscs-loader'
            }
        ],
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules|bower_components/,
                loader: 'babel-loader'
            }
        ]
    },
    resolve: {
        modulesDirectories: ["web_modules", "node_modules", "bower_components"]
    },
    plugins: [
        new webpack.ResolverPlugin(
            new webpack.ResolverPlugin.DirectoryDescriptionFilePlugin("bower.json", ["main"])
        )
    ],

    //pretty strict
    jshint: {
        bitwise: true,
        browser: true,
        camelcase: true,
        curly: true,
        eqeqeq: true,
        es3: true,
        forin: true,
        freeze: true,
        funcscope: true,
        globalstrict: true,
        immed: true,
        iterator: true,
        latedef: true,
        maxparams: 4,
        newcap: true,
        noarg: true,
        nonbsp: true,
        nonew: true,
        notypeof: true,
        quotmark: 'single',
        shadow: true,
        //singleGroups: true,
        undef: true,
        //unused: true, todo: add this back in when more stuff is working

        failOnHint: true,
        emitErrors: true,
        esnext: true
    },

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