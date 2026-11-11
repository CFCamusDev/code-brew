## Qué cambia
<!-- Una o dos frases. Enlaza el issue: Closes #123 -->

## Cómo se probó
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:integration` (si toca BD, pagos, pedidos o stock)
- [ ] Capturas a 1440 px y 390 px (si cambia la interfaz)

## Lista de verificación
- [ ] Sigue las capas de ADR 0002 (el dominio no importa Drizzle ni Astro)
- [ ] Las operaciones que modifican varias tablas están dentro de una transacción
- [ ] Sin precios ni totales calculados en el navegador como fuente de verdad
- [ ] Si crea una migración: es aditiva, tiene etiqueta `migración` y no hay otra abierta
- [ ] Sin secretos ni datos reales en el código o los logs
- [ ] Documentación y ADR actualizados si cambia una decisión

## Notas para quien revisa
<!-- Riesgos, decisiones, qué mirar primero -->
