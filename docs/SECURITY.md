# Sécurité, fiabilité et conformité

## Mesures en place

| Domaine | Mesure |
|---|---|
| Mots de passe | argon2id (19 MiB, t=2), complexité minimale, verrouillage après 5 échecs (15 min), réponses identiques pour e-mail inconnu / mauvais mot de passe |
| Sessions | JWT d'accès 15 min ; refresh opaque haché, rotation à chaque usage, détection de rejeu ⇒ révocation de la famille ; liste et révocation des sessions ; réinitialisation/changement de mot de passe ⇒ fin des autres sessions |
| Stockage des jetons | Web : jeton d'accès en mémoire, refresh en cookie `httpOnly; SameSite=Lax; Secure` (production) limité à `/api/v1/auth`. Mobile : SecureStore (trousseau/keystore) |
| Autorisation | Vérifiée côté serveur à chaque requête (appartenance active + permission). Le client ne fait que masquer l'interface |
| Isolation | `organizationId` sur chaque requête et chaque référence ; tests d'isolation automatisés |
| Entrées | Validation Zod de tous les corps et paramètres ; UUID validés ; tailles bornées |
| Abus | Limitation de débit globale et renforcée sur l'authentification |
| En-têtes | Helmet (API) ; `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (web) |
| CORS | Liste blanche d'origines (`CORS_ORIGINS`) avec credentials |
| Intégrité | Transactions, verrous de lignes, contraintes CHECK, journal de stock append-only (trigger), idempotence des écritures |
| Audit | Connexions (réussies/échouées), rejeu de jeton, ajustements, documents, changements de rôles/permissions, paramètres, plans |
| Secrets | Hors du code ; `.env.example` sans secret ; `JWT_ACCESS_SECRET` obligatoire en production |
| SQL | Prisma et requêtes paramétrées uniquement (aucune concaténation de SQL) |

## À compléter avant une mise en production réelle

- **Fichiers téléversés** : le stockage S3 (images produits, pièces jointes) n'est pas encore implémenté ; les images sont des URL. Lors de l'implémentation : contrôle du type MIME réel, taille maximale, antivirus, URL signées.
- **Row-Level Security PostgreSQL** comme seconde barrière d'isolation.
- **Vérification e-mail obligatoire** pour certaines actions (aujourd'hui : bannière d'incitation).
- **2FA** pour les rôles propriétaire/administrateur et le super admin.
- Politique de conservation et purge (journaux d'audit, sessions expirées, opérations de synchronisation), export et suppression des données d'une entreprise sur demande.
- Tests d'intrusion et revue de dépendances (`pnpm audit`, Dependabot).

## Conformité légale (à valider — aucune conformité n'est revendiquée)

- **Données personnelles (Tunisie)** : la loi organique n° 2004-63 du 27 juillet 2004 et l'autorité INPDP encadrent le traitement des données personnelles (déclarations/autorisations préalables, droits des personnes, transferts hors de Tunisie). L'applicabilité exacte à ce SaaS (hébergement, sous-traitance, transferts) doit être **validée par un juriste** ; un projet de réforme a été discuté, vérifier le texte en vigueur.
- **Documents commerciaux et fiscalité** : TVA (taux configurables par produit), timbre fiscal, mentions obligatoires des factures, numérotation, facturation électronique (TEIF/TTN) — **non implémentés comme « conformes »** ; le moteur de numérotation et de calcul est prêt à être paramétré après validation par un expert-comptable.
- **Canaux externes** (WhatsApp, SMS, e-mail marketing) : consentement explicite des destinataires et respect des conditions des plateformes avant toute intégration (phase 3).
- Rédiger et publier politique de confidentialité, CGU et contrat de sous-traitance (DPA) ; la case « J'accepte les conditions » de l'inscription y renvoie.
