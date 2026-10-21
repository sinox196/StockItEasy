# Architecture

## Vue d'ensemble

```
            ┌──────────────┐        ┌──────────────┐
 Navigateur │  apps/web     │        │  apps/mobile  │  Android / iOS (Expo)
            │  Next.js 15   │        │  Expo Router  │  SQLite (file d'attente offline)
            └──────┬───────┘        └──────┬───────┘  SecureStore (refresh token)
     /api/v1 proxy │ (même origine,          │ Bearer + refresh dans le corps
      cookie httpOnly)                        │
                   ▼                          ▼
            ┌──────────────────────────────────────┐
            │  apps/api — NestJS 11 (REST /api/v1)  │──► services/ai (FastAPI, optionnel)
            │  Auth · RBAC · Tenancy · Idempotence  │
            │  Moteur de stock (transactions SQL)   │──► Redis / BullMQ (tâches planifiées)
            └──────────────────┬───────────────────┘
                               ▼
                       PostgreSQL 16 (Prisma)
```

Le **backend est la seule source de vérité de l'inventaire** : ni le web ni le mobile ne calculent de stock ; ils affichent ce que l'API renvoie (le mobile affiche en plus ses opérations locales non encore confirmées, clairement marquées).

## Monorepo (pnpm workspaces)

| Dossier | Rôle |
|---|---|
| `apps/api` | API NestJS, Prisma (schéma + migrations), seed de démo, tests d'intégration |
| `apps/web` | Application web Next.js (App Router) + tests Playwright |
| `apps/mobile` | Application Expo (Android/iOS), moteur de synchronisation offline testé |
| `services/ai` | Service Python FastAPI de prévision (saisonnalité hebdomadaire démontrée statistiquement) |
| `packages/shared` | Enums, matrice RBAC, schémas Zod (validation identique client/serveur), arithmétique décimale, coût moyen/FIFO, prix/TVA, conversions d'unités, prévision et réapprovisionnement |
| `packages/i18n` | Catalogues `fr-TN` (défaut), `en`, `ar-TN` + formatage (TND à 3 décimales, chiffres latins, fuseau Africa/Tunis) |
| `packages/design-tokens` | Palette, thèmes clair/sombre, preset Tailwind, tokens RN |
| `packages/api-client` | Client HTTP typé partagé web/mobile (refresh unique, clés d'idempotence) |
| `infra/docker` | Dockerfiles API et web |
| `docs` | Documentation |

## API — principes

- **Modules** : auth, organizations (rôles, invitations, quotas), catalog (produits, catégories), warehouses (magasins, dépôts, emplacements), inventory (moteur, mouvements, ajustements, blocages, réservations, lots), transfers, counts (inventaires), purchasing (fournisseurs, commandes, réceptions), sales (ventes, POS, clients, retours), autopilot (recommandations, budget), dashboard (KPI, rapports), platform (notifications, audit, santé), sync (mobile), admin (super admin), jobs (BullMQ).
- **Garde globale** : jeton d'accès vérifié + session non révoquée ; pour les routes « tenant », chargement de l'appartenance à `X-Organization-Id` et vérification de la permission (`@RequirePermission('products.create')`).
- **Validation** : schémas Zod de `packages/shared` (mêmes règles que le web/mobile) ; Swagger généré depuis ces schémas.
- **Erreurs** : `{ statusCode, code, message, details }` — `code` est une clé stable traduite côté client (`errors.<CODE>`).
- **Idempotence** : en-tête `Idempotency-Key` sur les écritures (POS, réceptions, ajustements) ; réponse rejouée, clé réutilisée avec un autre contenu refusée.
- **Logs** : une ligne JSON par requête (requestId, statut, durée, utilisateur, organisation).

## Moteur de stock

`InventoryEngine.apply()` est l'unique point d'entrée de toute variation de stock :

1. verrouillage `SELECT … FOR UPDATE` du produit puis du solde (dépôt) dans la transaction du document ;
2. contrôle de disponibilité (`physique − réservé − bloqué`) sauf si l'entreprise autorise le stock négatif ;
3. valorisation : coût moyen pondéré mobile sur le produit + couches FIFO par dépôt (utilisées pour le COGS si l'entreprise est en FIFO) ;
4. lots : numéro de lot exigé à l'entrée pour les produits tracés, consommation FEFO à la sortie ;
5. écriture d'un mouvement **append-only** (trigger PostgreSQL interdisant UPDATE/DELETE) avec le stock après mouvement ;
6. alertes stock faible / rupture dédupliquées.

Les documents multi-lignes trient leurs lignes par produit pour garder un ordre de verrouillage constant (pas d'interblocage).

## Multi-tenancy

Chaque table métier porte `organizationId` ; chaque requête filtre dessus et chaque référence entrante (produit, dépôt, fournisseur…) est revérifiée dans l'organisation courante. L'isolation est couverte par `apps/api/test/tenancy.e2e-spec.ts`. Évolution prévue : Row-Level Security PostgreSQL en défense supplémentaire.

## Authentification

- Mots de passe : argon2id (paramètres OWASP), verrouillage 15 min après 5 échecs, limitation de débit sur les routes d'auth.
- Jeton d'accès JWT 15 min (mémoire uniquement côté web) ; refresh token opaque haché en base, **rotation à chaque usage** et **révocation de toute la famille** si un jeton déjà utilisé est rejoué.
- Web : refresh token en cookie `httpOnly; SameSite=Lax; path=/api/v1/auth`, servi en même origine via la route proxy `apps/web/src/app/api/v1/[...path]`.
- Mobile : refresh token dans le trousseau (SecureStore).

## Web

App Router, composants client, TanStack Query. Locale et thème lus côté serveur depuis des cookies (`lang`/`dir` corrects au premier rendu), puis la langue du profil s'applique après connexion. RTL via propriétés logiques Tailwind (`ms-`, `ps-`, `start-`…), icônes directionnelles inversées, montants/SKU/téléphones isolés en `<bdi dir="ltr">`.

## Mobile & offline

`SyncEngine` (`apps/mobile/src/lib/sync-core.ts`, testé) : chaque opération reçoit un identifiant client, est stockée en SQLite et poussée vers `/api/v1/sync/push`. Le serveur applique un identifiant au plus une fois, renvoie APPLIED / DUPLICATE / CONFLICT / REJECTED ; rien ne quitte la file sans confirmation serveur ou décision explicite de l'utilisateur. Le catalogue et les inventaires ouverts sont téléchargés (`/sync/snapshot`) pour scanner hors ligne.

## Stock Autopilot

Série de demande journalière nette par produit/dépôt (fuseau Tunis), jours de rupture exclus (demande censurée), lissage exponentiel → stock de sécurité, point de commande, quantité cible, arrondis MOQ/conditionnement, priorité et confiance. Service Python optionnel (`AI_SERVICE_URL`) pour la saisonnalité hebdomadaire statistiquement démontrée ; repli automatique sur le modèle intégré. Aucune commande n'est envoyée : l'approbation crée un **brouillon** de bon de commande.
