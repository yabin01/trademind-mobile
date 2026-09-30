const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@trademind/trading-core': path.resolve(__dirname, 'src/core/trading-core/src/index.ts'),
            '@trademind/analytics': path.resolve(__dirname, 'src/core/analytics/src/index.ts'),
            '@tm/core': path.resolve(__dirname, 'src/core'),
            '@tm/db': path.resolve(__dirname, 'src/db'),
            '@tm/lib': path.resolve(__dirname, 'src/lib'),
            '@tm/store': path.resolve(__dirname, 'src/store'),
            '@tm/components': path.resolve(__dirname, 'src/components'),
          },
        },
      ],
    ],
  };
};
