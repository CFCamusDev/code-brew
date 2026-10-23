# Stage 1: dependencias y build de la aplicación Astro
FROM node:22-alpine AS builder

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
FROM node:22-alpine AS prod-deps

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Proxy Nginx público (se construye con `target: web` desde docker-compose)
FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Stage 3: servidor Node de producción (etapa por defecto)
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src/data/catalog.json src/data/shipping.json ./src/data/

USER node
EXPOSE 4321

# Aplica migraciones pendientes, carga el catálogo que falte (no pisa ediciones del admin) y arranca el servidor
CMD ["sh", "-c", "node scripts/db/migrate.mjs && node scripts/db/seed.mjs && node dist/server/entry.mjs"]
