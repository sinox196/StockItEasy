<p align="center"><img src="docs/assets/logo.png" alt="StockItEasy" width="260"></p>

# StockItEasy — gestion de stock intelligente

> *StockItEasy ne se contente pas de gérer ton stock : il t'aide à anticiper tes besoins, préserver ta trésorerie et prendre de meilleures décisions commerciales.*

SaaS de gestion de stock multi-entreprise pour le marché tunisien (extensible), en **français (défaut)**, **anglais** et **derja tunisienne (RTL)**, sur **Web**, **Android** et **iOS**. (Nom de travail dans le cahier des charges : *StockPilot AI* ; la marque du dépôt et des maquettes, **StockItEasy**, est utilisée partout.)

| Couche | Technologie | Dossier |
|---|---|---|
| API | NestJS 11, Prisma 6, PostgreSQL 16, Redis + BullMQ, OpenAPI | `apps/api` |
| Web | Next.js 15 (App Router), React 19, Tailwind, Radix, TanStack Query, Recharts | `apps/web` |
| Mobile | Expo SDK 54, React Native 0.81, Expo Router, expo-camera, expo-sqlite, SecureStore | `apps/mobile` |
| IA (prévision) | Python FastAPI, NumPy/SciPy | `services/ai` |
| Partagé | règles métier, schémas Zod, i18n, design tokens, client API typé | `packages/*` |

## Démarrage rapide (local)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # renseigner JWT_ACCESS_SECRET
docker compose up -d postgres redis             # ou vos propres PostgreSQL/Redis
pnpm build:packages
pnpm --filter @stockiteasy/api exec prisma migrate deploy
SEED_DEMO_PASSWORD='ChoisirUnMotDePasse1' pnpm db:seed   # comptes et données de DÉMO
pnpm dev:api        # http://localhost:4000/api/docs
pnpm dev:web        # http://localhost:3000
pnpm dev:mobile     # Expo (voir docs/MOBILE.md)
```

Tout-en-un avec Docker : `cp .env.example .env` (définir `JWT_ACCESS_SECRET`) puis `docker compose up --build`.

Comptes de démonstration créés par le seed local (mot de passe = `SEED_DEMO_PASSWORD`, ou affiché une fois s'il est généré) :
`owner@demo.stockiteasy.local` (propriétaire), `cashier@demo.stockiteasy.local` (caissier), `stock@demo.stockiteasy.local` (magasinier), `admin@demo.stockiteasy.local` (super admin SaaS). Toutes les données du seed sont marquées **démo** dans l'interface.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Règles métier](docs/BUSINESS_RULES.md) · [API (OpenAPI)](docs/API.md)
- [Lancement local](docs/LOCAL_SETUP.md) · [Mobile Android/iOS](docs/MOBILE.md) · [Déploiement](docs/DEPLOYMENT.md)
- [Tests](docs/TESTING.md) · [Sécurité & conformité](docs/SECURITY.md)
- **[État réel des fonctionnalités](docs/STATUS.md)** · [Journal de développement](docs/DEVLOG.md)
