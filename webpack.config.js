var webpack = require("webpack");
module.exports = {
    entry: "./spacetime.js",
    output: {
        path: __dirname + '/build/',
        filename: "spacetime.js",
        library: 'Spacetime',
        libraryTarget: 'umd'
    },
    resolve: {
        modulesDirectories: ["web_modules", "node_modules", "bower_components"]
    },
    plugins: [
        new webpack.ResolverPlugin(
            new webpack.ResolverPlugin.DirectoryDescriptionFilePlugin("bower.json", ["main"])
        )
    ]
};