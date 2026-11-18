# Staging: staging.coffeecodebrew.com

La configuración de S8.4 (#125) está preparada para que el propietario cree la stack. El despliegue real, el webhook de Culqi y un pago sandbox deben verificarse en el VPS antes de cerrar la issue.

## Crear la stack en Portainer (propietario)

1. Después de fusionar este PR en `develop`, crear una stack Git llamada **codebrew-staging**, con repositorio `https://github.com/CFCamusDev/code-brew`, referencia `refs/heads/develop`, Compose path `docker-compose.yml` y Additional paths `docker-compose.staging.yml`. Guardar autenticación de lectura si el repositorio la necesita. El motor Compose debe soportar `!override` (Compose 2.24.4 o superior).
2. Copiar los nombres de variables de `.env.staging.example` al formulario de variables de esta stack. Usar una contraseña PostgreSQL propia, alfanumérica y aleatoria; claves Culqi `pk_test_…` / `sk_test_…`; un secreto de webhook y `STAGING_CRON_SECRET` distintos, aleatorios y de al menos 32 caracteres. `STAGING_SITE_URL` será `https://staging.coffeecodebrew.com`. Mantener vacías las integraciones opcionales hasta configurarlas expresamente para staging. No importar las variables de producción.
3. Desplegar. Se crean contenedores `codebrew-staging-web/app/db`, red `codebrew-staging` y volumen `codebrew-staging-db-data`. Las migraciones y el seed se ejecutan al arrancar la aplicación. No se publica PostgreSQL. No activar el sondeo automático de Git de Portainer: los siguientes despliegues los solicitará CI después de validar el commit.
4. Configurar DNS y HTTPS del subdominio en el proxy del VPS. Por defecto, el servicio web escucha en `127.0.0.1:8026` del host. Si el proxy corre dentro de otro contenedor, ajustar `STAGING_BIND_ADDRESS` a una interfaz del host alcanzable por ese proxy y usarla como destino; `127.0.0.1` dentro del proxy apunta al propio proxy. Verificar el certificado y la ruta antes de registrar Culqi.
5. Consultar `https://staging.coffeecodebrew.com/api/health`: `status`, `database` y `migrations` deben ser `ok`; `environment` debe ser `staging`. En el primer arranque `deploymentId` es `manual`.

Para crear el administrador de esta base independiente, ejecutar en el VPS, usando tu correo:

```sh
docker exec -it codebrew-staging-app node scripts/admin/create-user.mjs tu-correo@dominio.com "Administrador staging" admin
```

El comando muestra una contraseña temporal una vez y restablece la contraseña si el correo ya existe. Guardarla de forma privada y cambiarla al entrar.

## Culqi sandbox (propietario)

En el panel de Culqi en modo pruebas, registrar el evento `order.status.changed` con destino:

```text
https://staging.coffeecodebrew.com/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET de esta stack>
```

No compartir la URL completa con el secreto en capturas, incidencias o logs. Usar las credenciales de prueba de la misma cuenta configurada en la stack. Realizar una compra con los medios de prueba de la documentación oficial de Culqi y verificar que el webhook llega correctamente y el pedido aparece pagado en `/admin/pedidos`. Conservar evidencia sin datos sensibles: fecha, identificador del pedido, resultado del webhook y estado del pedido. Un arranque saludable o una prueba con el gateway falso no valida este criterio.

## Activar despliegues desde develop (propietario)

Crear el entorno **staging** en GitHub Settings → Environments. Configurar en ese entorno:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Variable | `STAGING_PORTAINER_URL` | URL HTTPS de Portainer, alcanzable desde el runner |
| Variable | `STAGING_STACK_ID` | ID de la stack codebrew-staging |
| Variable | `STAGING_ENDPOINT_ID` | ID del entorno Docker de esa stack |
| Secret | `STAGING_PORTAINER_API_KEY` | Token del propietario autorizado para actualizar esa stack |

Cuando la stack y el acceso estén preparados, configurar la variable **del repositorio** `STAGING_ENABLED=true`. Hasta entonces el despliegue permanece deshabilitado. Para detener futuros despliegues, cambiarla a `false`.

El workflow reutilizable se llama desde CI únicamente para pushes a `develop`, después de calidad, integración y Docker. No se ejecuta en PR. Usa la API autenticada de Portainer; no requiere un webhook de Portainer. Antes de actualizar comprueba nombre, repositorio, entorno, referencia y archivo adicional. Conserva las variables de la stack y cambia únicamente `STAGING_DEPLOYMENT_ID`. Después espera una instancia saludable con ese identificador y comprueba que el `ConfigHash` de Portainer coincide con el SHA del CI. Si `develop` avanzó durante la operación y Portainer descargó otro commit, el job falla y el siguiente CI debe desplegar la revisión correcta. El pipeline de producción permanece independiente.

## Verificación local

```sh
pnpm test:staging
pnpm test:docker
```

La primera orden construye y arranca el Compose de staging con una base, volumen, red, nombres y puerto aleatorios, valida el aislamiento y `/api/health`, y elimina exclusivamente sus recursos al terminar. Usa claves con formato de pruebas para validar el arranque, sin llamar a Culqi. La segunda ejecuta las comprobaciones e integración Docker del proyecto.

## Evidencias pendientes para cerrar #125

- Stack real y HTTPS accesibles en el subdominio indicado.
- Webhook sandbox registrado y pedido confirmado mediante un pago de prueba real.
- Un push validado a `develop` despliega en Portainer y el job confirma SHA y nueva instancia saludable.

Referencias: [stack Git en Portainer](https://docs.portainer.io/user/docker/stacks/add), [API oficial de redespliegue Git](https://github.com/portainer/portainer/blob/develop/api/http/handler/stacks/stack_update_git_redeploy.go), [workflows reutilizables de GitHub](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [webhooks de Culqi](https://docs.culqi.com/es/documentacion/pagos-online/webhooks).
