const { defineConfig } = require('eslint/config');
const sonar = require('./eslint-sonar.config.cjs');

module.exports = defineConfig(
  {
    ignores: ['dist/', 'dist-test/', 'node_modules/', 'coverage/', '.scannerwork/'],
  },
  ...sonar,
);
