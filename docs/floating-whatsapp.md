# Acceso flotante a WhatsApp

Acceso permanente en la esquina inferior derecha de las páginas públicas. En escritorio muestra «¿Te ayudamos? / WhatsApp»; en móvil, un icono de 56 × 56 px con nombre accesible. No aparece en el panel administrativo.

## Decisiones de experiencia

- La ubicación derecha sigue la convención habitual de atención al cliente, documentada por [Intercom](https://www.intercom.com/help/en/articles/6612597-messenger-faqs).
- El botón no se abre automáticamente, no pulsa ni muestra indicadores de mensajes, disponibilidad o tiempos de respuesta ficticios.
- Incluye foco visible y márgenes para el área segura del dispositivo, sin agregar espacio debajo del footer. La pausa de animaciones queda a la izquierda para evitar superposiciones.
- Se oculta mientras un diálogo está abierto y, en móvil, mientras se enfoca un campo de texto o selector. No se imprime.
- El objetivo táctil de 56 px supera los mínimos de [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## Mensajes

- General: «¡Hola, CodeBrew! Vengo de su web y quisiera hacer una consulta sobre sus cafés o envíos. ¿Me ayudan, por favor?»
- Checkout: «¡Hola, CodeBrew! Estoy completando mi pedido en la web y necesito ayuda para continuar. ¿Me orientan, por favor?»
- Seguimiento/pedido: «¡Hola, CodeBrew! Quisiera ayuda para consultar o dar seguimiento a mi pedido de la web. ¿Me orientan, por favor?»

El mensaje es un borrador editable. El visitante decide si lo envía, según el funcionamiento de [Click to Chat de WhatsApp](https://faq.whatsapp.com/5913398998672934). No se incluyen identificadores de pedido, direcciones, correos, parámetros de la página ni datos del formulario.

## Configuración y funcionamiento

El destino se obtiene del número guardado en `/admin/configuracion`, usando el helper existente `getWhatsAppUrl`. El enlace pasa por `/api/contact/whatsapp`, que responde con una redirección 302 sin caché. Así las páginas prerenderizadas, como el checkout, también utilizan el número configurado en ejecución sin tener que recompilar.

Solo se aceptan los contextos conocidos; cualquier otro usa el mensaje general. No se añade un SDK de terceros ni JavaScript al botón: funciona como enlace nativo incluso sin JavaScript. La configuración conserva su caché de servidor existente, que se invalida al guardar desde el panel.
