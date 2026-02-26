import baseConfig from './base.js';

export default [
  ...baseConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
];
