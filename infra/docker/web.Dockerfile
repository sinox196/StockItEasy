# syntax=docker/dockerfile:1.7
# StockItEasy web — Next.js standalone build from the monorepo root:
#   docker build -f infra/docker/web.Dockerfile -t stockiteasy-web .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @stockiteasy/web...
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "./packages/*" build && pnpm --filter @stockiteasy/web build

FROM node:22-bookworm-slim AS runtime
# API_URL (read at request time by the /api/v1 proxy route) points to the NestJS API.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 API_URL=http://api:4000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
