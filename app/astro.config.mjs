// @ts-check
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// https://astro.build/config
export default defineConfig({
  integrations: [vue()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/zenn': {
          target: 'https://zenn.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zenn/, ''),
        },
        '/whatistoday': {
          target: 'https://api.whatistoday.cyou',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/whatistoday/, ''),
        },
        '/open-meteo': {
          target: 'https://api.open-meteo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/open-meteo/, ''),
        },
      },
    },
  },
});
