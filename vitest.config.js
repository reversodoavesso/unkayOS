import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    setupFiles: ['./tests/setup.js']
  }
});
