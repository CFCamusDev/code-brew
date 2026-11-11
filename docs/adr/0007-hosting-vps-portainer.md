# ADR 0007 · Hosting en VPS con Portainer; caché en Nginx

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
El despliegue actual usa Docker, Nginx y Portainer en un VPS, con webhook de despliegue tras CI en main. No se contempla un servicio administrado por ahora.

## Decisión
Se mantiene el VPS con Portainer. Rendimiento: microcaché de HTML (30–60 s, stale-while-revalidate) y caché larga de estáticos en Nginx; precio y stock por endpoint cacheable corto. Límite de intentos con limit_req de Nginx. Respaldos con pg_dump programado, copia fuera del VPS y restauración probada en staging.

## Consecuencias
- Nginx OSS no purga caché: se usa TTL corto.
- Con una sola instancia no se necesita estado compartido, pero conviene no depender de memoria del proceso.
- Se agrega un entorno de staging en Portainer.

## Alternativas consideradas
- Servicio administrado (BD gestionada, CDN): descartado por ahora; se puede evaluar un CDN gratuito delante del VPS.
