# API

- Swagger UI : `http://localhost:4000/api/docs` (désactivé en production sauf `ENABLE_SWAGGER=true`).
- Document OpenAPI versionné : [`docs/api/openapi.json`](api/openapi.json) (régénérer avec `pnpm --filter @stockiteasy/api openapi`).
- Client typé : `packages/api-client` (utilisé par le web et le mobile).

## Conventions

- Préfixe versionné `/api/v1`.
- Authentification : `Authorization: Bearer <accessToken>` ; routes d'entreprise : `X-Organization-Id: <uuid>`.
- Écritures rejouables : `Idempotency-Key: <uuid>` (réponse rejouée avec `Idempotent-Replayed: true`).
- Pagination : `page`, `pageSize` (≤ 200), `search`, `sort`, `order` → `{ items, total, page, pageSize }`.
- Montants/quantités : chaînes décimales.
- Erreurs : `{ statusCode, code, message, details?, requestId }` ; `code` ∈ clés `errors.*` de `packages/i18n`.
- Limitation de débit : globale (`RATE_LIMIT_PER_MINUTE`) et renforcée sur l'authentification.

## Ressources

`/auth`, `/me`, `/organizations`, `/invitations`, `/products`, `/categories`, `/stores`, `/warehouses`, `/inventory` (balances, movements, adjustments, blocks, reservations, lots), `/transfers`, `/stock-counts`, `/suppliers`, `/purchases`, `/sales`, `/customers`, `/replenishment` (recommendations, run, decision, budget-plan), `/dashboard`, `/reports`, `/notifications`, `/audit-logs`, `/sync` (snapshot, push), `/admin`, `/health`.
