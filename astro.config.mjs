import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Las páginas se prerenderizan por defecto (p. ej. /checkout). Las que llevan `export const prerender = false`
  // (landing con precios en vivo, pedidos, API y panel) se renderizan en el servidor.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  env: {
    schema: {
      // Opcional en el esquema para que `astro build` no la exija; getDb() falla con un mensaje claro si falta al ejecutar.
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Culqi: sin llaves la web funciona, pero el botón de pago queda desactivado.
      CULQI_PUBLIC_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      CULQI_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Clave que va en la URL del webhook registrada en CulqiPanel (?key=...).
      CULQI_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Correo (Resend): sin API key los correos solo se registran en los logs.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      EMAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SITE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Token para tareas programadas (Authorization: Bearer …), p. ej. cancelar pedidos abandonados.
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  },
  server: {
    port: 80,
    host: true
  }
});
