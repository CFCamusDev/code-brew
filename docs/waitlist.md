# Lista de interesados: backend (S7.1)

`POST /api/waitlist` registra interés en un producto **próximamente** de una línea publicada. No necesita sesión. El formulario público, la administración de interesados y el envío de correos corresponden a S7.2, S7.3 y S7.4; este endpoint no envía mensajes.

## Contrato

Enviar `Content-Type: application/json`:

```json
{
  "email": "persona@example.com",
  "productSlug": "coldstart",
  "consent": true
}
```

El slug está disponible en el catálogo público, por lo que el cliente no necesita conocer IDs internos. El contrato es estricto: el correo se recorta y pasa a minúsculas, admite hasta 254 caracteres y debe ser válido; el slug admite hasta 80 caracteres; el consentimiento debe ser el booleano `true`, sin coerción de texto.

| Código | Significado |
|---|---|
| 200 | Solicitud registrada; misma respuesta para alta y duplicado |
| 400 | Datos, consentimiento o JSON inválidos |
| 404 | Producto inexistente, no próximo o de línea no publicada |
| 405 | Método distinto de POST; no hay consulta pública de suscriptores |
| 413 | Cuerpo mayor que 4 KiB, también sin Content-Length |
| 415 | Tipo de contenido distinto de JSON |
| 429 | Demasiados intentos; incluye Retry-After |
| 503 | Persistencia temporalmente no disponible |

Las respuestas llevan `Cache-Control: no-store` y no devuelven correo, ID de suscripción ni condición de duplicado. Si falla la persistencia se registra un mensaje fijo con el ID de petición; no se registra el error SQL original, que podría contener el correo en sus parámetros.

## Persistencia y concurrencia

La migración aditiva `0015_waitlist_subscriptions.sql` crea `waitlist_subscriptions` con `id`, `email`, `product_id`, `consent`, `created_at` y `notified_at`. Tiene unicidad por correo/producto, restricciones de consentimiento y normalización, e índice por producto/fecha de notificación para los casos de uso posteriores.

El caso de uso abre una transacción. El adaptador toma bloqueos compartidos del producto y después de su línea, en el mismo orden que el editor, para coordinarse con cambios de estado. El dominio admite solo próximos de líneas activas. El alta usa `ON CONFLICT DO NOTHING`: los reintentos simultáneos dejan una fila y conservan `created_at` y `notified_at`. El mismo correo puede interesarse por productos diferentes. Borrar un producto elimina sus suscripciones por cascada; archivar una línea no las elimina.

## Límite de intentos

La app admite 20 intentos por IP en una ventana fija de 15 minutos, contando también solicitudes inválidas y duplicadas, sin reiniciar el contador tras un éxito. Al superar el límite devuelve 429 con `Retry-After: 900`. El contador se reserva antes de operaciones asíncronas. Su memoria está acotada a 5000 IP; recupera capacidad cuando vencen las entradas y rechaza claves nuevas si sigue llena.

Nginx incluye la ruta en la zona existente `contact`, que limita ráfagas antes de llegar a Node. Se reutiliza `clientIp` y la configuración de proxy de la aplicación. El contador de 15 minutos es por proceso y se reinicia con Node; no es un límite distribuido entre réplicas. La barrera de Nginx permanece independiente del reinicio de la app.

## Verificación

Las pruebas de dominio y contrato cubren elegibilidad, consentimiento, normalización, ventanas y capacidad del limitador. Las de HTTP comprueban errores de persistencia sin datos personales en respuesta o registro. Las de integración usan PostgreSQL para comprobar duplicados simultáneos, conservación de fechas, separación por producto, restricciones de BD, transporte y respuesta 429. Los fixtures se eliminan al terminar.
