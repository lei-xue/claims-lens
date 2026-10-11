# Build the SPA and bundle the API into a single file, then ship a slim runtime.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build \
 && npx esbuild server/index.ts server/seed.ts server/migrate.ts --bundle --platform=node --target=node22 --format=cjs \
      --outdir=dist-server --out-extension:.js=.cjs --external:pg-native --log-level=warning

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80 MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/server/db/migrations ./migrations
USER node
EXPOSE 80
# apply migrations, then serve
CMD ["sh", "-c", "node dist-server/migrate.cjs && node dist-server/index.cjs"]
