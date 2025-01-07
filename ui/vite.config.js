import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/bookmarks': 'http://localhost:3000',
      '/archive': 'http://localhost:3000',
      '/star': 'http://localhost:3000',
      '/unstar': 'http://localhost:3000',
      '/getText': 'http://localhost:3000',
    },
  },
});
