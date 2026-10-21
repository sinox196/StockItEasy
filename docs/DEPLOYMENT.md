# Déploiement

## Images

| Image | Dockerfile | Port | Notes |
|---|---|---|---|
| API | `infra/docker/api.Dockerfile` | 4000 | applique `prisma migrate deploy` au démarrage puis lance Nest |
| Web | `infra/docker/web.Dockerfile` | 3000 | Next.js standalone ; `API_URL` lu à l'exécution par la route proxy |
| IA | `services/ai/Dockerfile` | 8000 | optionnel |

`docker compose up --build` lance l'ensemble (PostgreSQL, Redis, IA, API, web). Pour la production, utiliser des services managés (PostgreSQL avec sauvegardes, Redis) et un reverse proxy TLS.

## Variables d'environnement (API)

Voir `apps/api/.env.example` (documenté, sans secrets). Obligatoires en production : `DATABASE_URL`, `JWT_ACCESS_SECRET` (le démarrage échoue avec la valeur de développement), `WEB_URL`, `CORS_ORIGINS`, `COOKIE_SECURE=true` derrière HTTPS. Recommandé : `REDIS_URL` (tâches nocturnes Stock Autopilot, purge d'idempotence), SMTP.

## Environnements

- **development** : `.env` local, Swagger actif, e-mails dans les logs.
- **staging** : mêmes images que la production, base dédiée, données de démo autorisées (`ALLOW_DEMO_SEED=true` uniquement si voulu).
- **production** : HTTPS obligatoire, `COOKIE_SECURE=true`, Swagger désactivé (sauf `ENABLE_SWAGGER=true`), secrets via le gestionnaire de secrets de l'hébergeur.

## Base de données

- Migrations Prisma versionnées (`apps/api/prisma/migrations`), appliquées par `migrate deploy` (avant le démarrage de la nouvelle version).
- Contraintes CHECK et trigger « journal append-only » dans la migration `constraints`.
- **Sauvegardes** : dump quotidien + rétention, exemple :
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" > backup-$(date +%F).dump
  # restauration
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup-YYYY-MM-DD.dump
  ```
  Tester la restauration régulièrement sur un environnement isolé.

## Observabilité

- Logs JSON par requête (requestId, statut, durée, utilisateur, organisation) sur stdout → agrégateur (Loki, CloudWatch, Datadog…).
- `GET /api/v1/health` (base de données incluse) pour les sondes ; `HEALTHCHECK` dans l'image API.
- L'en-tête `X-Request-Id` est renvoyé et inclus dans les erreurs pour le support.
- À brancher : suivi d'erreurs (Sentry ou équivalent), métriques (Prometheus) — non inclus.

## CI/CD

`.github/workflows/ci.yml` : installation, build des packages, typecheck, tests unitaires, tests d'intégration API (PostgreSQL), build API et web, bundle Android, tests Python, build des images Docker. Le déploiement continu (push d'images, déploiement staging/production) dépend de l'hébergeur choisi et n'est pas configuré.
