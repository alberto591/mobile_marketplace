import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
});
