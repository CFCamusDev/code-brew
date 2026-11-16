# Contratos (`src/contracts`)

Un solo esquema zod por entrada y salida de cada endpoint público, compartido por la API (`src/pages/api`) y por las islas del navegador (ADR 0002). Así el formulario valida igual que el servidor y un cambio en la respuesta rompe el typecheck en los dos lados.

| Archivo | Endpoints |
|---|---|
| `cart.ts` | `POST /api/cart/quote` (entrada, respuesta) y el error 409 con `issues` |
| `checkout.ts` | `POST /api/orders` (entrada, respuesta 201) y los datos del cliente |
| `orders.ts` | `POST /api/orders/[id]/items` (entrada, respuesta) |
| `limits.ts` | Topes del carrito, **sin zod** |

## Reglas

- Los contratos solo dependen de zod y entre sí: nada de `src/lib/server`, `src/server`, Astro ni React.
- Las islas importan **tipos** con `import type` y solo los esquemas que validan en el navegador. `limits.ts` no importa zod para que la landing y el carrito no carguen la librería de validación.
- Se importa el archivo concreto (`contracts/cart`), no un índice, para no arrastrar esquemas que la página no usa.
- El servidor calcula con los tipos de su dominio (`src/server/modules/*/domain`) y comprueba al compilar que su respuesta cumple el contrato con `satisfies`. Si el dominio cambia un campo y el contrato no, el typecheck falla.

## Cómo agregar un contrato

1. Elige el archivo del tema, o crea uno nuevo si es un recurso distinto.
2. Define la entrada como `<accion>RequestSchema` y la salida como `<accion>ResponseSchema`. Los tipos salen de `z.infer`; usa `z.input` y `z.output` cuando el esquema transforma valores.
3. En el endpoint, valida la entrada con `safeParse` y declara la respuesta con `satisfies <Tipo>Response` antes de `Response.json(...)`.
4. En la isla, tipa el `fetch` con el mismo tipo (`(await response.json()) as <Tipo>Response`).
5. Agrega una prueba en `tests/unit/contracts.test.ts` si la entrada tiene reglas propias (normalización, mensajes).
