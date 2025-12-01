import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// API server URL
const API_URL = 'http://localhost:3002';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(API_URL),
  },
  server: {
    proxy: {
      '/bookmarks': API_URL,
      '/archive': API_URL,
      '/star': API_URL,
      '/unstar': API_URL,
      '/getText': API_URL,
    },
  },
});
