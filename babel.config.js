module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@trademind/trading-core': './src/core/trading-core/src/index.ts',
            '@trademind/analytics': './src/core/analytics/src/index.ts',
            '@tm/core': './src/core',
            '@tm/db': './src/db',
            '@tm/lib': './src/lib',
            '@tm/store': './src/store',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
        },
      ],
    ],
  };
};
