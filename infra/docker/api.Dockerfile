# syntax=docker/dockerfile:1.7
# StockItEasy API — multi-stage build from the monorepo root:
#   docker build -f infra/docker/api.Dockerfile -t stockiteasy-api .
# Full Debian image: ships OpenSSL and CA certificates required by Prisma's query engine.
FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @stockiteasy/api...
RUN pnpm --filter "./packages/shared" --filter "./packages/i18n" build \
 && pnpm --filter @stockiteasy/api exec prisma generate \
 && pnpm --filter @stockiteasy/api build
RUN pnpm --filter @stockiteasy/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist \
 && cd /out && npx prisma generate

FROM node:22-bookworm AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. Migrations are forward-only and idempotent.
# Run with an init process (docker run --init / compose `init: true`) for clean signal handling.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
