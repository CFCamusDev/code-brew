/** Reglas de arquitectura (ADR 0002). Se ejecutan con `pnpm deps:check` y en el CI. */

// Ruta de un módulo: src/server/modules/<módulo>/<capa>/...  (sin ancla ^ para poder probarlo con fixtures)
const modules = '(?:^|/)src/server/modules';
const layer = name => `${modules}/[^/]+/${name}/`;

// Paquetes de fuera del dominio. Los npm se resuelven a node_modules/<paquete>/ (también bajo .pnpm); astro:env es virtual.
const pkg = names => `(?:^|/)node_modules/(?:${names})/`;
const outsideWorld = `${pkg('drizzle-orm|postgres|astro|@astrojs/[^/]+|react|react-dom|cloudinary')}|^astro:`;
const infra = `${modules}/[^/]+/infrastructure/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dominio-puro',
      comment: 'El dominio no depende de otras capas, de Drizzle, Astro, React ni de la base de datos: solo de sí mismo y de shared.',
      severity: 'error',
      from: { path: layer('domain') },
      to: {
        path: [
          `${modules}/[^/]+/(application|infrastructure|http)/`,
          '(^|/)src/lib/',
          '(^|/)src/pages/',
          '(^|/)src/components/',
          '(^|/)src/features/',
          '(^|/)src/ui/',
          outsideWorld
        ]
      }
    },
    {
      name: 'dominio-sin-unit-of-work',
      comment: 'La transacción se abre en la capa de aplicación; el dominio no conoce UnitOfWork ni la base de datos.',
      severity: 'error',
      from: { path: layer('domain') },
      to: { path: '(^|/)src/server/shared/unit-of-work' }
    },
    {
      name: 'aplicacion-sin-infraestructura',
      comment: 'Los casos de uso hablan con puertos (interfaces), nunca con la infraestructura, el transporte HTTP ni librerías de fuera.',
      severity: 'error',
      from: { path: layer('application') },
      to: {
        path: [
          `${modules}/[^/]+/(infrastructure|http)/`,
          '(^|/)src/lib/server/',
          '(^|/)src/pages/',
          '(^|/)src/components/',
          outsideWorld
        ]
      }
    },
    {
      name: 'puertos-sin-infraestructura',
      comment: 'Los puertos (application/ports) solo declaran contratos.',
      severity: 'error',
      from: { path: `${modules}/[^/]+/application/ports/` },
      to: { path: [`${modules}/[^/]+/(infrastructure|http)/`, outsideWorld] }
    },
    {
      name: 'infraestructura-sin-http',
      comment: 'La infraestructura implementa puertos; no conoce el transporte HTTP ni las páginas.',
      severity: 'error',
      from: { path: layer('infrastructure') },
      to: { path: [`${modules}/[^/]+/http/`, '(^|/)src/pages/', '(^|/)src/components/'] }
    },
    {
      name: 'http-sin-infraestructura',
      comment: 'Los controladores delegan en casos de uso. Solo composition.ts (raíz de composición) conecta infraestructura.',
      severity: 'error',
      from: { path: layer('http'), pathNot: '/composition\.ts$' },
      to: { path: infra }
    },
    {
      name: 'modulos-solo-por-su-indice',
      comment: 'Un módulo solo usa a otro por su index.ts público, no por sus carpetas internas.',
      severity: 'error',
      from: { path: `${modules}/([^/]+)/` },
      to: {
        path: `${modules}/([^/]+)/`,
        pathNot: [`${modules}/$1/`, `${modules}/[^/]+/index\.ts$`]
      }
    },
    {
      name: 'shared-sin-modulos',
      comment: 'shared es la base: no puede depender de ningún módulo, de la interfaz ni de Astro.',
      severity: 'error',
      from: { path: '(^|/)src/server/shared/' },
      to: { path: [`${modules}/`, '(^|/)src/pages/', '(^|/)src/components/', `${pkg('astro|@astrojs/[^/]+')}|^astro:`] }
    },
    {
      name: 'shared-solo-unit-of-work-toca-la-bd',
      comment: 'Dentro de shared solo unit-of-work.ts conoce Drizzle y la conexión.',
      severity: 'error',
      from: { path: '(^|/)src/server/shared/', pathNot: '/unit-of-work\.ts$' },
      to: { path: [pkg('drizzle-orm|postgres'), '(^|/)src/lib/server/db/'] }
    },
    {
      name: 'servidor-sin-interfaz',
      comment: 'src/server no importa páginas ni componentes.',
      severity: 'error',
      from: { path: '(^|/)src/server/' },
      to: { path: ['(^|/)src/pages/', '(^|/)src/components/'] }
    },
    {
      name: 'sin-ciclos',
      comment: 'Sin dependencias circulares en el código nuevo.',
      severity: 'error',
      from: { path: '(^|/)src/server/' },
      to: { circular: true }
    }
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|\.astro)/' }
  }
};
