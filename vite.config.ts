/// <reference types="vitest" />
import { defineConfig } from 'vite';

/** Relative asset URLs for itch.io and other static hosts in subfolders. */
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
