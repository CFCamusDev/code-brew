import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Las páginas se prerenderizan por defecto (la landing sigue siendo HTML estático).
  // Las rutas con `export const prerender = false` (API, checkout, admin) se renderizan en el servidor.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' })
    }
  },
  server: {
    port: 80,
    host: true
  }
});
