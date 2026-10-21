# Lancement local

## Prérequis

- Node.js ≥ 20 (testé avec 22), pnpm 10 (`corepack enable`)
- PostgreSQL 16 et Redis 7 (via `docker compose up -d postgres redis`, ou installés localement)
- Python 3.12+ (optionnel, service de prévision)

## Étapes

```bash
pnpm install                              # node-linker=hoisted (requis par Metro)
cp apps/api/.env.example apps/api/.env    # éditer JWT_ACCESS_SECRET (≥ 32 caractères)
docker compose up -d postgres redis
pnpm build:packages                       # shared, i18n, design-tokens, api-client
pnpm --filter @stockiteasy/api exec prisma migrate deploy
SEED_DEMO_PASSWORD='MonMotDePasseLocal1' pnpm db:seed
pnpm dev:api                              # API : http://localhost:4000 — Swagger : /api/docs
pnpm dev:web                              # Web : http://localhost:3000
```

Le web parle à l'API via sa route proxy `/api/v1/*` (variable `API_URL`, défaut `http://localhost:4000`).

### Service de prévision (optionnel)

```bash
cd services/ai && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt && uvicorn app.main:app --port 8000
# puis dans apps/api/.env : AI_SERVICE_URL=http://localhost:8000
```

Sans ce service, Stock Autopilot utilise le modèle statistique intégré.

### E-mails

Sans `SMTP_HOST`, les e-mails (vérification, réinitialisation, invitation) sont écrits dans les logs de l'API avec leur lien.

### Seed et données de démonstration

- `pnpm db:seed` crée 4 comptes `*@demo.stockiteasy.local` et une supérette de démo avec 45 jours d'historique généré **via le vrai moteur de stock** (coûts, mouvements, ventes cohérents). Le seed refuse de s'exécuter si `NODE_ENV=production` (sauf `ALLOW_DEMO_SEED=true`).
- À l'onboarding, la case « données de démonstration » crée le même jeu pour une nouvelle entreprise. Toutes ces données portent `isDemo` et un badge dans l'interface.

## Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm typecheck` | Vérification TypeScript de tous les workspaces |
| `pnpm test` | Tests unitaires (packages) |
| `pnpm test:e2e` | Tests d'intégration de l'API (base `stockiteasy_test`, recréée) |
| `pnpm --filter @stockiteasy/web test:e2e` | Tests Playwright (API + web + seed lancés) |
| `pnpm --filter @stockiteasy/api openapi` | Régénère `docs/api/openapi.json` |
| `pnpm --filter @stockiteasy/api prisma:migrate` | Nouvelle migration en développement |
