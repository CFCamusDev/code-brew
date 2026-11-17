import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Las páginas se prerenderizan por defecto (p. ej. /checkout). Las que llevan `export const prerender = false`
  // (landing con precios en vivo, pedidos, API y panel) se renderizan en el servidor.
  output: 'static',
  compressHTML: true,
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
      // Pasarela de pagos: 'fake' usa FakeGateway (pruebas de integración y demos locales). Prohibida en staging y producción.
      PAYMENT_GATEWAY: envField.enum({ context: 'server', access: 'secret', values: ['culqi', 'fake'], optional: true }),
      CULQI_WEBHOOK_SECRET_PREVIOUS: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Correo (Resend): sin API key los correos solo se registran en los logs.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      EMAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SITE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Token para tareas programadas (Authorization: Bearer …), p. ej. cancelar pedidos abandonados.
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Seguimiento de errores (Sentry): sin DSN queda desactivado y la web funciona igual.
      SENTRY_DSN: envField.string({ context: 'server', access: 'secret', optional: true }),
      SENTRY_ENVIRONMENT: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Cloudinary: sin estas tres, la subida de imágenes de producto queda deshabilitada.
      CLOUDINARY_CLOUD_NAME: envField.string({ context: 'server', access: 'secret', optional: true }),
      CLOUDINARY_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      CLOUDINARY_API_SECRET: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  },
  server: {
    port: 80,
    host: true
  },
  vite: {
    // Solo desarrollo: prepara desde el arranque las dependencias de las islas. Si Vite las descubre a mitad
    // de la sesión rearma su caché y el navegador mezcla versiones (504 "Outdated Optimize Dep", "jsxDEV is not a function").
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'react/jsx-dev-runtime',
        'nanostores',
        '@nanostores/react',
        '@nanostores/persistent',
        'react-hook-form',
        '@hookform/resolvers/zod',
        'zod',
        // Escenas 3D y animaciones de la landing
        'three',
        'gsap',
        'gsap/ScrollTrigger'
      ]
    }
  }
});
