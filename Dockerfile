# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV FORGE_DB_PATH=/data/forge.db
ENV FORGE_CLIENT_DIR=/app/dist/client
ENV PORT=8080
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY package.json ./
VOLUME ["/data"]
EXPOSE 8080
CMD ["bun", "dist/server/index.js"]
