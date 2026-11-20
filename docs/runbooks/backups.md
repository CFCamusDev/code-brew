# Respaldos PostgreSQL y restauración — S8.3 / #126

Este procedimiento prepara un `pg_dump` PostgreSQL 17 cifrado por Restic en un bucket S3 externo al VPS. La automatización y la restauración se prueban localmente en Docker. El propietario debe instalarla en el VPS, comprobar una copia externa de menos de 24 horas y cronometrar una restauración en staging antes de cerrar #126. No se han ejecutado operaciones remotas.

## Preparación del propietario

Usar un checkout de este PR fusionado en `develop` en `/opt/code-brew`, Docker Compose y systemd. La stack de producción conserva sus contenedores y configuración. La herramienta se conecta a su red existente, sin publicar puertos ni montar el socket Docker.

1. Crear un bucket privado **fuera del VPS**, con un prefijo exclusivo para esta base y credenciales limitadas a ese prefijo. Restic necesita listar, leer, escribir y eliminar objetos para retención y bloqueo. No aplicar una política de expiración arbitraria a los objetos internos del repositorio, pues puede romper snapshots conservados.
2. Copiar `ops/backups/env.example` a `/etc/codebrew-backups/backup.env` (propietario root, modo 0600). Ajustar `PGHOST`, usuario, base y `BACKUP_NETWORK` a los de producción; obtener la red con `docker inspect codebrew-db`. Configurar endpoint S3 HTTPS, bucket/prefijo, región y `BACKUP_HOST` estable, por ejemplo `codebrew-production`. El nombre de host de respaldo identifica el origen en Restic; no es el hostname efímero del contenedor.
3. Crear `/etc/codebrew-backups/secrets` con propietario UID/GID **70:70** y modo 0700. El contenedor usa el usuario postgres de Alpine (UID 70). Crear dentro estos archivos, también 70:70 y modo 0600, con un editor privado:

| Archivo | Contenido |
| --- | --- |
| `pgpass` | `host:5432:base:usuario:contraseña` para el origen; durante una restauración, añadir entradas del destino y la base de ensayo. Escapar `:` y `\` según libpq. |
| `restic_password` | Contraseña aleatoria propia para cifrar el repositorio. Guardar otra copia en el gestor de contraseñas del propietario fuera del VPS. |
| `s3_credentials` | Perfil `[default]` con `aws_access_key_id` y `aws_secret_access_key`; incluir `aws_session_token` si corresponde. |

No guardar estos archivos en el checkout ni introducir secretos como argumentos de consola. La contraseña Restic y las credenciales S3 son distintas; sin la primera no se pueden recuperar los datos. Docker monta el directorio de secretos en solo lectura. El archivo pgpass debe ser legible por UID 70 y no por grupo/otros; libpq rechaza permisos más amplios.

Desde `/opt/code-brew`:

```sh
docker compose --env-file /etc/codebrew-backups/backup.env -f ops/backups/compose.yml build
docker compose --env-file /etc/codebrew-backups/backup.env -f ops/backups/compose.yml run --rm --no-deps backup init
docker compose --env-file /etc/codebrew-backups/backup.env -f ops/backups/compose.yml run --rm --no-deps backup backup
docker compose --env-file /etc/codebrew-backups/backup.env -f ops/backups/compose.yml run --rm --no-deps backup verify
```

`init` se ejecuta una sola vez para un repositorio nuevo. Un error no debe resolverse creando otro repositorio ni eliminando bloqueos sin investigar. `backup` transmite el dump a Restic mediante `--stdin-from-command`: si el dump falla no se confirma un snapshot. No crea un dump plano en el VPS. Después de guardar aplica retención de **7 días, 4 semanas y 6 meses**, agrupada por host y etiquetas; estas categorías pueden solaparse. No equivale a 17 copias obligatorias. La retención solo se ejecuta después de un respaldo correcto y usa un repositorio dedicado.

`verify` exige un snapshot del origen de menos de 24 horas y ejecuta `restic check --read-data`. Un código de salida distinto de cero significa fallo, también si el almacenamiento externo es inaccesible, la copia caducó o hay daños. Los errores no imprimen stderr de herramientas, SQL ni credenciales. Los éxitos registran ID, fecha del snapshot y duración. El tiempo se mide dentro del contenedor.

## Programación y vigilancia

Instalar los archivos `ops/backups/codebrew-backup.service` y `codebrew-backup.timer` en `/etc/systemd/system/`, comprobar el directorio y la ruta de Docker del servicio y ejecutar:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now codebrew-backup.timer
sudo systemctl start codebrew-backup.service
systemctl list-timers codebrew-backup.timer
systemctl status codebrew-backup.service
journalctl -u codebrew-backup.service --since yesterday
```

El timer corre a las **03:00 UTC cada día** y recupera una ejecución omitida al arrancar el VPS. El servicio realiza backup y comprobación completa; falla si cualquiera falla. No hay un daemon de respaldo permanente. No lanzar dos ejecuciones manuales simultáneas ni desbloquear Restic mientras haya una operación activa.

Configurar en la monitorización del propietario una alerta por fallo de la unidad **y una ejecución independiente de `verify` antes de superar 24 h**. Un timer instalado no demuestra que los respaldos estén funcionando. Un VPS apagado tampoco puede emitir sus propias alertas: la vigilancia debe residir fuera del VPS. Revisar duración y coste de lectura de `--read-data` al crecer el repositorio, antes de ampliar los límites del servicio (2 h).

## Restauración de ensayo en staging

1. Comprobar primero una copia externa con `verify` y conservar su ID completo. La restauración permite seleccionar una copia histórica; la comprobación de frescura es independiente.
2. Preparar una base **nueva y vacía** en PostgreSQL de staging, por ejemplo `codebrew_restore`, con su propio volumen. El proceso no crea, borra ni limpia bases. No reutilizar producción ni una base con datos. Los scripts exigen sufijo `_restore` y rechazan cualquier objeto de usuario ya existente.
3. Crear `/etc/codebrew-backups/restore.env` a partir de la configuración de backup. Mantener el repositorio y `BACKUP_HOST` del **origen**; cambiar `PGHOST`, red y credenciales hacia **staging**. `PGDATABASE` conserva el nombre de origen como protección contra sobrescribirlo. Establecer `RESTORE_DATABASE=codebrew_restore` y `SNAPSHOT_ID=<ID completo de 64 caracteres>`. Dejar `SNAPSHOT_ID` vacío selecciona la última copia del host y etiqueta. No reutilizar este archivo en el timer de producción.
4. Añadir al pgpass la entrada del destino y ejecutar:

```sh
docker compose --env-file /etc/codebrew-backups/restore.env -f ops/backups/compose.yml run --rm --no-deps backup restore
```

La descarga se descifra en `/work`, un tmpfs privado limitado a 2 GiB, y se elimina al terminar. Ajustar esa memoria antes de ensayar dumps mayores. `pg_restore` valida el archivo y restaura en una sola transacción, sin propietarios ni permisos del origen; después ejecuta ANALYZE. Un fallo de restauración revierte sus cambios. Esto respalda una base, no los roles globales del clúster ni archivos Cloudinary: los roles de conexión se preparan aparte.

5. Comparar migraciones, cantidades de líneas/productos/pedidos y una muestra de relaciones/stock con el origen del snapshot. La herramienta devuelve éxito de PostgreSQL, pero esas comprobaciones de negocio siguen siendo necesarias.
6. Antes de arrancar la aplicación con los datos restaurados, aislar correos, cron, outbox, pagos y webhooks. Una copia de producción contiene datos personales y trabajo pendiente. Usar únicamente claves Culqi test; no permitir envíos a clientes. Con el propietario, configurar una instancia de ensayo hacia `codebrew_restore`, comprobar `/api/health`, acceso al panel y pedidos. Evitar que el arranque de una versión nueva migre la copia antes de comparar el estado recuperado.
7. Registrar snapshot, fecha, tamaño, duración, versión de aplicación y resultado. No publicar datos personales ni secretos. Eliminar la base de ensayo solo después de verificar la evidencia y confirmar su identidad.

## Verificación local y alcance

```sh
node scripts/test-backups.mjs
pnpm test
pnpm typecheck
```

El ensayo Docker crea nombres/red/repositorio aleatorios y una base migrada y sembrada con los scripts reales. Comprueba recuperación de datos Unicode, historial de migraciones, productos, relaciones y restricciones; rechaza sobrescritura y contraseña incorrecta; verifica que un dump fallido no deja snapshots parciales. Cronometra la recuperación y limpia exclusivamente sus recursos. El repositorio QA es local y cifrado: no demuestra que exista una copia fuera del VPS.

No cerrar #126 hasta registrar una copia externa reciente y una restauración cronometrada y verificada en staging. La configuración de #125 / PR #174 y los accesos del propietario son necesarios para esa última comprobación operativa.

Referencias: [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html), [pgpass](https://www.postgresql.org/docs/17/libpq-pgpass.html), [almacenamiento y cifrado Restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [backup desde un comando](https://restic.readthedocs.io/en/stable/040_backup.html), [retención Restic](https://restic.readthedocs.io/en/stable/060_forget.html).
