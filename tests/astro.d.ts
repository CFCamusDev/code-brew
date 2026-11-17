// Vite compila los componentes en las pruebas; tsc necesita el contrato de su módulo.
declare module '*.astro' {
  const component: import('astro/runtime/server/index.js').AstroComponentFactory;
  export default component;
}
