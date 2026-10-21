# Tests

| Suite | Commande | Contenu |
|---|---|---|
| Règles métier partagées | `pnpm --filter @stockiteasy/shared test` | conversions d'unités, coût moyen pondéré, FIFO, marges, TVA/millimes, prévision (sans données ⇒ pas de prévision), réapprovisionnement (MOQ, conditionnement, commandes ouvertes), allocation budgétaire, EAN-13, rôles |
| i18n | `pnpm --filter @stockiteasy/i18n test` | les 3 catalogues ont exactement les mêmes clés et paramètres ; fallback FR ; RTL ; TND à 3 décimales ; chiffres latins en arabe ; fuseau Tunis |
| Client API | `pnpm --filter @stockiteasy/api-client test` | en-têtes, refresh unique sur 401 concurrents, erreurs typées |
| Sync mobile | `pnpm --filter @stockiteasy/mobile test` | file offline : reconnexion, réponse perdue (pas de double application), conflits, rejets, session expirée pendant la synchro, exécution unique |
| API (intégration) | `pnpm test:e2e` | 47 tests sur PostgreSQL réel |
| Web (E2E) | `pnpm --filter @stockiteasy/web test:e2e` | Playwright : vente POS ⇒ stock décrémenté, bascule derja/RTL enregistrée, menus selon le rôle |
| IA | `cd services/ai && pytest` | pas de prévision sans données, saisonnalité uniquement si significative, contrat HTTP |

## Cas critiques couverts (API)

- Deux (trois) ventes simultanées de la dernière unité : une seule réussit.
- Réception partielle puis annulation ; annulation refusée si la marchandise est vendue.
- Transfert interrompu (annulé en transit) : stock rendu au départ.
- Reconnexion après comptage offline : rejeu sans double application, conflit signalé, choix explicite.
- Commande fournisseur marquée envoyée deux fois : refusé.
- Accès au stock d'une autre entreprise : 403 / 404, aucune fuite (listes, recherche par code-barres, mouvements, soldes).
- Jeton expiré/forgé pendant une synchronisation : 401 sans perte (côté mobile, file conservée).
- Changement de langue en cours de session : enregistré dans le profil.
- Idempotence : rejeu, conflit de clé, clé libérée après échec.
- Journal de stock non modifiable en base, quotas de formule, invitation, dernier propriétaire, version de fiche produit.

## Lancer les E2E web

API (avec seed) et web démarrés, puis :
```bash
E2E_PASSWORD='<SEED_DEMO_PASSWORD>' pnpm --filter @stockiteasy/web test:e2e
```

## Non couvert à ce stade

Tests de charge (prévoir k6 sur `/sales`, `/inventory/adjustments`, `/sync/push`), tests d'interface mobile sur appareil (Maestro/Detox), tests visuels de régression.
