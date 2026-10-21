# Journal de développement

## 2026-10-21 — Phase 1 (fondation + MVP) et Autopilot

### Décisions

- **Nom** : la marque des maquettes et du dépôt, *StockItEasy*, est utilisée (le cahier des charges parle de « StockPilot AI », nom provisoire). Le module phare garde le nom *Stock Autopilot*.
- **Versions** : outils stables et éprouvés (TypeScript 5.9, NestJS 11, Prisma 6.19, Next.js 15.5, React 19.1, Tailwind 3.4, Expo SDK 54) plutôt que les toutes dernières majeures, pour limiter le risque.
- **Validation partagée** : schémas Zod dans `packages/shared`, utilisés par l'API (pipes + Swagger) et les clients — une seule définition des règles.
- **i18n maison** (`packages/i18n`) plutôt que next-intl : un seul runtime pour API (e-mails, notifications), web (SSR) et mobile ; catalogues JSON ; fallback FR ; tests de parité des clés.
- **Langue** : cookie pour le premier rendu (français par défaut), puis langue du profil après connexion (synchronisée web/mobile).
- **Décimales** : decimal.js partout ; colonnes `Decimal` ; montants en chaînes dans l'API.
- **Stock** : moteur unique avec verrous de lignes, mouvements append-only (trigger), couches FIFO toujours tenues (bascule de méthode possible), coût moyen mobile sur le produit.
- **Inventaire** : le théorique est figé au moment du comptage de la ligne (gère les ventes entre comptage et validation).
- **Offline** : identifiants d'opération côté client + table `sync_operations` côté serveur ; conflits explicites, jamais d'écrasement silencieux.
- **Web ↔ API** : route proxy Next (`/api/v1/*`) lue à l'exécution ⇒ cookie de refresh first-party ; remplace les rewrites (figées au build).
- **Docker** : image API sur `node:22-bookworm` (OpenSSL et certificats requis par Prisma présents, pas d'apt au build).
- **pnpm `node-linker=hoisted`** : requis pour un bundling Metro fiable en monorepo.
- **Autopilot** : jours de rupture exclus de l'historique (demande censurée) — corrige une sous-estimation observée sur les données de démo ; recommandations seulement pour les dépôts qui stockent le produit (ou dépôt unique).
- **Quotas** : appliqués aux invitations, dépôts et produits ; changement de formule réservé au super admin (pas de paiement intégré).

### Tests exécutés (tous verts)

- `packages/shared` : 21 tests (vitest)
- `packages/i18n` : 13 tests
- `packages/api-client` : 4 tests
- `apps/mobile` (SyncEngine) : 6 tests
- `apps/api` intégration PostgreSQL : 47 tests (jest + supertest)
- `apps/web` Playwright : 3 tests E2E (POS, RTL, rôles)
- `services/ai` : 5 tests (pytest)
- Typecheck : API, web, mobile, packages
- Builds : API (nest), web (next), bundle Android Expo, images Docker API/web (+ démarrage, migrations, santé)
- Vérification visuelle (captures Playwright) : tableau de bord, POS, produits, Autopilot, Trésorerie, utilisateurs, versions FR et derja/RTL

### Limitations connues

Voir [STATUS.md](STATUS.md). Principales : pas de téléversement de fichiers (S3), pas d'export Excel/PDF, pas de push mobile, application mobile non testée sur appareil physique ici, pas de tests de charge, conformité fiscale/légale tunisienne non validée.

### Prochaines étapes proposées

1. Téléversement S3 (images, pièces jointes) + exports Excel/PDF.
2. Devis / commandes clients avec réservation et bons de livraison ; demandes d'achat et comparaison de devis.
3. Notifications push (Expo) et e-mail, préférences par utilisateur.
4. Row-Level Security PostgreSQL, 2FA admin.
5. Phase 2 : saisonnalité tunisienne (événements), détection d'anomalies, assistant IA via outils métier.
