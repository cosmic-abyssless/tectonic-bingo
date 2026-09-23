# syntax=docker/dockerfile:1.7

# One image, several roles. The entrypoint (docker-entrypoint.sh) picks what a container does from its first argument:
#   api      apply pending migrations, then serve the site
#   migrate  apply pending migrations and exit (what a zero-downtime deploy runs before switching over)
#   ocr      the screenshot-reading service the api calls over HTTP (OCR_URL), with its own CPU reservation
#   verify-db  read-only health report on a database file (used to prove a restored backup is real)
# Built once per commit and run unchanged in staging and production: everything that differs (the Sentry environment,
# DSNs, secrets, data directories) arrives at runtime, never at build time.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# onnxruntime-node's install step would otherwise download its CUDA/TensorRT GPU providers from NuGet: large, unused
# (the OCR runs on the CPU runtime the npm package already ships), and a network call that can fail the build.
ENV ONNXRUNTIME_NODE_INSTALL=skip

# ---- every dependency, for building -------------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build the server (tsc) and the client (tsc + vite) -------------------------------------------------------------
FROM deps AS build
# The commit being built: the Sentry release the client's source maps are uploaded under.
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
COPY shared shared
COPY server server
COPY client client
# The Sentry auth token is a build secret, never a build arg (which would end up in the image's history). When it is
# absent no source maps are made or uploaded (see client/vite.config.ts).
RUN --mount=type=secret,id=sentry_auth_token \
    if [ -s /run/secrets/sentry_auth_token ]; then export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; fi; \
    npm run build

# ---- only what the server needs to run ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace=server --workspace=shared

# ---- the OCR models, downloaded once at build time --------------------------------------------------------------------
# The engine fetches ~30 MB of models on first use and caches them under the user's home. Fetching them here means a
# container never depends on the network to become ready, and a deploy never re-downloads them. This stage depends only
# on the production dependencies, so it is rebuilt when those change, not on every commit.
FROM prod-deps AS ocr-models
RUN node -e "import('ppu-paddle-ocr').then(async ({ PaddleOcrService, V6_SMALL_MODEL }) => { await new PaddleOcrService({ model: V6_SMALL_MODEL }).initialize(); })" \
    && test -n "$(find /root/.cache/ppu-paddle-ocr -type f)"

# ---- runtime ----------------------------------------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules node_modules
COPY package.json ./
# @bingo/shared is consumed as TypeScript source (its package.json points at src/index.ts); Node strips the types.
COPY shared/package.json shared/
COPY shared/src shared/src
COPY server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/client/dist client/dist
COPY --from=ocr-models --chown=node:node /root/.cache/ppu-paddle-ocr /home/node/.cache/ppu-paddle-ocr
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The data directories are bind-mounted from the host; created here so an unmounted container still starts.
RUN mkdir -p /data/sqlite /data/uploads && chown -R node:node /data && chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
ENV PORT=8080 DB_PATH=/data/sqlite/bingo.db UPLOADS_DIR=/data/uploads
EXPOSE 8080

# The release is a property of the build, not of where it runs: the server reports it as its Sentry release and injects
# it into the page, matching the release the client's source maps were uploaded under.
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
LABEL org.opencontainers.image.revision=${SENTRY_RELEASE}

# `init: true` in Compose reaps zombies and forwards signals; the entrypoint then execs node, so node is what receives
# SIGTERM and can shut down cleanly.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["api"]
