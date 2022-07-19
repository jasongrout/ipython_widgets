var path = require('path');

// TODO: for widgets 8 to work in a widgets 7 environment, we need the new css
// (the nouislider css particularly, but also the other css that we've changed
// to be lumino-based, for example).
module.exports = (env, argv) => {
    var devtool = argv.mode === 'development' ? 'source-map' : false;
    return [
        {// Embeddable @juptyer-widgets/controls bundle
        //
        // The target bundle is always `dist/index.js`, which is the path
        // required by the custom widget embedder.
            entry: ['./amd-public-path.js', './dist-index.js'],
            output: {
                filename: 'index.js',
                path: path.resolve(__dirname, 'dist'),
                libraryTarget: 'amd',
                publicPath: '', // Set in amd-public-path.js
            },
            devtool,
            module: {
                rules: [ { test: /\.css$/, use: ['style-loader', 'css-loader']} ]
            },
            // 'module' is the magic requirejs dependency used to set the publicPath
            externals: ['@jupyter-widgets/base', 'module']
        }
    ];
}
