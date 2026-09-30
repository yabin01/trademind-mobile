const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const alias = {
  '@trademind/trading-core': path.resolve(__dirname, 'src/core/trading-core/src/index.ts'),
  '@trademind/analytics': path.resolve(__dirname, 'src/core/analytics/src/index.ts'),
  '@tm/core': path.resolve(__dirname, 'src/core'),
  '@tm/db': path.resolve(__dirname, 'src/db'),
  '@tm/lib': path.resolve(__dirname, 'src/lib'),
  '@tm/store': path.resolve(__dirname, 'src/store'),
  '@tm/components': path.resolve(__dirname, 'src/components'),
};

config.resolver = config.resolver || {};
config.resolver.alias = { ...(config.resolver.alias || {}), ...alias };

module.exports = config;
