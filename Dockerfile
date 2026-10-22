# syntax=docker/dockerfile:1.7
# Corporate knowledge base — production image (server + built web UI + backup tooling).
#
#   docker build -t kb:$(git rev-parse --short HEAD) .
#   docker run --env-file deploy/.env -p 8080:8080 -v kb-data:/var/lib/kb kb:<tag>
#
# The same image runs the backup sidecar (scripts/backup/*.sh need pg_dump/psql 16, jq, node for
# check-docs.mjs) — see deploy/docker-compose.yml.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV CI=1 NPM_CONFIG_UPDATE_NOTIFIER=false PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Manifests first for layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN npx tsc -b packages/shared \
 && npm run build -w @kb/server \
 && npm run build -w @kb/web \
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf apps/web/src apps/web/node_modules/.vite

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime
ARG PG_MAJOR=16
# postgresql-client-16 comes from the PGDG repository (bookworm ships 15; pg_dump must be >= server major).
# Chromium for PDF export is NOT installed by default (≈400 MB): set CHROMIUM_PATH to a browser available
# in the image, or build with --build-arg INSTALL_CHROMIUM=1 to add Debian's chromium package.
ARG INSTALL_CHROMIUM=0
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg tini jq tzdata; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-${PG_MAJOR}; \
    if [ "$INSTALL_CHROMIUM" = "1" ]; then apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation; fi; \
    apt-get purge -y gnupg; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    KB_DATA_DIR=/var/lib/kb \
    WEB_DIST=/app/apps/web/dist \
    TESSDATA_DIR=/var/lib/kb/tessdata \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=build --chown=root:root /src/package.json /src/package-lock.json ./
COPY --from=build --chown=root:root /src/node_modules ./node_modules
COPY --from=build --chown=root:root /src/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=root:root /src/packages/shared/dist packages/shared/dist
COPY --from=build --chown=root:root /src/apps/server/package.json apps/server/package.json
COPY --from=build --chown=root:root /src/apps/server/dist apps/server/dist
COPY --from=build --chown=root:root /src/apps/server/migrations apps/server/migrations
COPY --from=build --chown=root:root /src/apps/web/dist apps/web/dist
COPY --chown=root:root scripts/backup scripts/backup
# Code is root-owned and read-only for the service user; only the data directory is writable.
# OCR language data (rus+eng) ships in node_modules and is copied to TESSDATA_DIR on first use (offline).
RUN chmod 0755 scripts/backup/*.sh scripts/backup/check-docs.mjs \
 && install -d -o node -g node -m 0750 /var/lib/kb /var/lib/kb/objects /var/lib/kb/tessdata /backups
USER node
VOLUME ["/var/lib/kb"]
EXPOSE 8080
# Liveness only (process answers). Orchestrators should use /readyz for traffic routing.
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Migrations are applied automatically at start (advisory lock: safe with several replicas).
CMD ["node", "apps/server/dist/main.js"]
