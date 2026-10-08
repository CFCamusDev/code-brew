# Stage 1: Build de la aplicación Astro
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifiestos de dependencias e instalarlas
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el código fuente y construir la versión estática
COPY . .
RUN npm run build

# Stage 2: Servidor web ultraligero Nginx para producción
FROM nginx:alpine AS runner

# Copiar configuración optimizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar salida compilada de Astro desde el builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer el puerto interno 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
