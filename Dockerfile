# Stage 1: dependencias y build de la aplicación Astro
FROM node:22.23.4-alpine AS builder

WORKDIR /app
RUN corepack enable

# Copiar manifiestos de dependencias e instalarlas
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copiar el código fuente y construir (landing prerenderizada + servidor Node)
COPY . .
ARG PUBLIC_ANALYTICS_ENV=disabled
ARG PUBLIC_GA4_ID=G-YMMJ7V30SZ
ENV PUBLIC_ANALYTICS_ENV=$PUBLIC_ANALYTICS_ENV PUBLIC_GA4_ID=$PUBLIC_GA4_ID
RUN pnpm build

# Stage 2: solo dependencias de producción
FROM node:22.23.4-alpine AS prod-deps

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Proxy Nginx público (se construye con `target: web` desde docker-compose)
FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Falla la construcción si la configuración de Nginx no es válida (zonas de limit_req, mapas, rutas).
RUN nginx -t
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/api/health || exit 1

# Stage 3: servidor Node de producción (etapa por defecto)
FROM node:22.23.4-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src/data/catalog.json src/data/shipping.json src/data/settings.json ./src/data/

USER node
EXPOSE 4321
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:4321/api/health',{signal:AbortSignal.timeout(4000)}).then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

# Aplica migraciones pendientes, carga el catálogo que falte (no pisa ediciones del admin) y arranca el servidor
CMD ["sh", "-c", "node scripts/validate-env.mjs && node scripts/db/migrate.mjs && node scripts/db/seed.mjs && exec node dist/server/entry.mjs"]
