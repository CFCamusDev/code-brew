/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Pruebas unitarias: sin base de datos ni servidor. getViteConfig habilita los módulos virtuales de Astro (astro:env).
export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
});
