# Stage 1: Build unkayOS 2.0 Web distribution
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/sync-vendor.mjs ./scripts/sync-vendor.mjs
RUN npm ci
COPY . .
ARG UNKAYOS_REVISION=unknown
ENV UNKAYOS_REVISION=$UNKAYOS_REVISION
RUN npm run build:dist

# Stage 2: Hardened Nginx runtime with Wasm & COOP/COEP headers
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/40-unkayos-config.sh /docker-entrypoint.d/40-unkayos-config.sh

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
