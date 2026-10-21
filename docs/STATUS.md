# État réel des fonctionnalités

Légende : ✅ implémenté et testé · 🟡 partiel (limites indiquées) · ⏳ planifié (non implémenté — aucune fonctionnalité fictive dans l'application)

## Phase 1 — Fondation & MVP

| Fonctionnalité | État | Détails |
|---|---|---|
| Monorepo, Docker, CI | ✅ | pnpm workspaces, images API/web/IA construites et démarrées, workflow GitHub Actions |
| Authentification (inscription, connexion, déconnexion, mot de passe oublié, vérification e-mail, sessions) | ✅ | rotation des refresh tokens, révocation, verrouillage ; e-mails via SMTP ou logs |
| Multi-tenant, plusieurs entreprises par utilisateur | ✅ | sélecteur d'entreprise web et mobile |
| Magasins, dépôts, emplacements | ✅ | emplacements zone/rayon/étagère/bac (référentiel ; stock non encore ventilé par emplacement) |
| RBAC 9 rôles + matrice modifiable + rôles personnalisés | ✅ | |
| Invitations de collaborateurs | ✅ | e-mail + acceptation (nouveau compte ou compte existant) |
| Journal d'audit / journal de sécurité | ✅ | |
| Quotas par formule (Starter/Business/Pro AI/Enterprise) | ✅ | sans tarif ni paiement (non validés) |
| i18n FR (défaut) / EN / Derja + RTL | ✅ | web et mobile ; 3 catalogues complets (vérifiés par test) ; e-mails traduits |
| Design system clair/sombre | ✅ | tokens partagés web/mobile |
| Produits : SKU unique, codes-barres EAN/UPC, code interne EAN-13, étiquettes, conditionnements, prix/marges, min/max, fournisseurs, statut, archivage | ✅ | |
| Import CSV (aperçu + import) / export CSV | ✅ | Excel/PDF : ⏳ (impression navigateur disponible) |
| Variantes | 🟡 | modèle parent/attributs dans l'API ; pas d'éditeur de variantes dans l'UI |
| Kits / bundles | ⏳ | |
| Images produits | 🟡 | URL uniquement ; téléversement S3 ⏳ |
| Lots, dates d'expiration, FEFO | ✅ | |
| Numéros de série | 🟡 | modèle de données présent ; saisie/traçage des numéros ⏳ |
| Mouvements, ajustements motivés, blocage/quarantaine, réservations | ✅ | |
| Transferts inter-dépôts (statuts, écarts, annulation) | ✅ | |
| Inventaires complets/partiels/tournants, comptage par scan, validation des écarts | ✅ | |
| Coût moyen pondéré / FIFO | ✅ | paramètre entreprise |
| Stock négatif interdit, idempotence, transactions, journal append-only | ✅ | |
| Fournisseurs, catalogue fournisseur, historique des prix, score explicable | ✅ | |
| Commandes fournisseurs (workflow de validation, réceptions partielles, annulation de réception) | ✅ | |
| Demandes d'achat, demandes/comparaison de devis, retours fournisseurs, paiements fournisseurs, pièces jointes | ⏳ | |
| Ventes / POS tactile (scan, panier, espèces/carte/mixte/crédit), clients, crédit, retours, avoirs, annulation | ✅ | ticket imprimable |
| Devis, commandes clients avec réservation, bons de livraison, promotions | ⏳ | réservations disponibles via l'API |
| Moteur de documents commerciaux tunisiens (factures conformes) | ⏳ | à valider avec un expert-comptable |
| Dashboard (14 KPI, graphiques, filtres période/dépôt) | ✅ | filtres catégorie/fournisseur/produit côté API partiellement (catégorie) |
| Rapports : valorisation, ABC, stock dormant, ventes & marges, mouvements | ✅ | export CSV ; PDF/Excel et rapports programmés ⏳ |
| Notifications in-app (stock faible, rupture, validation requise, transfert, recommandations) | ✅ | dédupliquées |
| Push mobile, e-mail d'alertes, préférences de notification | ⏳ | |
| Application mobile : connexion, accueil, produits, scanner, ajustement rapide, comptage, transfert, réception, alertes, Autopilot, rapports, synchronisation, profil, langue | ✅ | bundle Android vérifié ; pas testée sur appareil physique dans cet environnement |
| Mode offline (comptages, ajustements), conflits explicites | ✅ | transferts/réceptions mobiles nécessitent le réseau |
| Console Super Admin (entreprises, formules, statistiques) | 🟡 | facturation SaaS, support, état des services ⏳ |
| Pages publiques (accueil, fonctionnalités, formules, FAQ, contact) | ✅ | une page avec sections ; e-mail de contact via `NEXT_PUBLIC_CONTACT_EMAIL` |

## Phase 2 — Intelligence (anticipée partiellement car présente dans les maquettes)

| Fonctionnalité | État | Détails |
|---|---|---|
| Stock Autopilot (prévision, date de rupture, stock de sécurité, quantité, priorité, confiance, motifs, approuver/modifier/rejeter → brouillon de commande) | ✅ | statistique ; jamais d'envoi automatique |
| Trésorerie & achats (budget, financé/reporté, impact) | ✅ | projections affichées comme telles |
| Service Python de prévision (saisonnalité hebdomadaire démontrée) | ✅ | optionnel, repli automatique |
| Saisonnalité tunisienne (Ramadan, Aïd, rentrée…), événements manuels | ⏳ | |
| Assistant IA multilingue (texte, derja latine) | ⏳ | nécessitera des outils métier autorisés, jamais de SQL libre |
| Détection d'anomalies | ⏳ | |
| Promotions intelligentes | ⏳ | stock dormant déjà calculé |
| Score fournisseur | ✅ | |

## Phase 3 — Connectivité

WhatsApp fournisseurs (copie du message ✅, API ⏳), caméra IA / lecture de documents ⏳, assistant vocal ⏳, e-commerce (WooCommerce/Shopify) et transporteurs ⏳, retours COD ⏳, Digital Twin ⏳, réseau B2B / achats groupés ⏳.
