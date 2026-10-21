# Règles métier

Toutes ces règles sont appliquées **côté serveur** ; les clients les reproduisent uniquement pour l'affichage.

## Quantités, montants, unités

- Montants : `Decimal(14,3)` (millimes TND). Coûts unitaires : `Decimal(18,6)`. Quantités : `Decimal(18,3)`. Jamais de flottants pour la comptabilité (decimal.js partout).
- Le stock est toujours exprimé dans l'**unité de base** du produit. Un conditionnement vaut `facteur × unité de base` (ex. carton = 24 pièces). Un code-barres peut être rattaché à un conditionnement : scanner le code du carton ajoute 24 pièces.
- Un produit sans « quantités décimales » refuse les quantités fractionnaires.

## Stock

- `disponible = physique − réservé − bloqué`.
- **Stock négatif interdit par défaut** (paramètre entreprise). Toute sortie au-delà du disponible échoue avec `INSUFFICIENT_STOCK` et le disponible réel.
- **Toute variation produit un mouvement** append-only (type, quantité signée, coût, stock après, motif, utilisateur, référence du document). Le journal ne peut être ni modifié ni supprimé (trigger base de données).
- Les ajustements manuels exigent un motif codé (endommagé, expiré, perdu, disparition inexpliquée, retrouvé, correction, usage interne, échantillon, autre). « Disparition inexpliquée » ne désigne personne : aucune accusation automatique.
- Blocage (endommagé / quarantaine) : le stock reste physique mais sort du disponible ; déblocage inverse.
- Réservations : diminuent le disponible ; libération explicite.
- Produits avec date d'expiration ⇒ suivi par lot obligatoire ; entrée avec n° de lot (et date pour réceptions/stock initial) ; sortie **FEFO** (expiration la plus proche d'abord).
- Produits ayant un historique : **archivage** uniquement (jamais de suppression).
- Modification concurrente d'une fiche produit : jeton `version`, conflit `CONFLICT` si la fiche a changé.

## Valorisation

- **Coût moyen pondéré mobile** (défaut) : recalculé à chaque entrée valorisée sur le stock total du produit ; les sorties sont valorisées au coût moyen courant. Une annulation de réception retire sa contribution au coût moyen.
- **FIFO** (paramètre entreprise) : chaque entrée crée une couche de coût par dépôt ; les sorties consomment les couches les plus anciennes ; le COGS de la vente est la somme des couches consommées.
- Marge brute = CA HT − COGS (ligne et document) ; les retours déduisent la part retournée.

## Transferts

`BROUILLON → EN TRANSIT → REÇU` ou `ANNULÉ`. L'expédition sort le stock du dépôt de départ ; la réception l'entre au dépôt d'arrivée au coût de sortie ; une réception inférieure à l'envoi enregistre l'écart (audit). Annuler un transfert en transit **réintègre** le stock au départ. Chaque transition est conditionnelle (double clic ⇒ `INVALID_STATE`).

## Inventaires physiques

- Complet (tous les produits actifs), partiel (sélection/catégorie), tournant (25 produits les plus valorisés non comptés depuis 30 jours).
- Au moment où une ligne est comptée, son **théorique** est figé au physique courant ; la validation poste `compté − théorique` en mouvements `COUNT_ADJUSTMENT`. Les lignes non comptées sont ignorées.
- Les scans ajoutent (`add`) ; une saisie de total (`replace`) envoyée par un appareil hors ligne porte la version vue : si un collègue a compté entre-temps, le serveur renvoie un **conflit** au lieu d'écraser.

## Achats

- `BROUILLON → (EN ATTENTE DE VALIDATION) → APPROUVÉE → ENVOYÉE → PARTIELLEMENT REÇUE → REÇUE` ou `ANNULÉE`. Un utilisateur avec `purchases.approve` peut approuver directement un brouillon.
- « Envoyée » enregistre que l'acheteur a transmis la commande (le message fournisseur est copiable pour WhatsApp/e-mail) ; **aucun envoi automatique**. Marquer deux fois ⇒ `INVALID_STATE`.
- Réceptions partielles multiples ; dépassement de la quantité commandée refusé (`OVER_RECEIPT`) ; le bon est verrouillé pendant la réception (pas de double réception concurrente).
- Annuler une réception inverse ses mouvements ; impossible si la marchandise a déjà été vendue/déplacée (`INSUFFICIENT_STOCK`).
- Historique des prix fournisseur : catalogue, commande envoyée, réception à un prix différent.
- Score fournisseur (si ≥ 3 commandes reçues) : 40 % ponctualité (réception ≤ date prévue + 1 j), 35 % taux de réception conforme, 25 % indice prix (prix le plus bas connu / prix du fournisseur). Composantes absentes ⇒ non comptées et affichées « — ».

## Ventes / POS

- Prix stockés HT ; TVA par produit (19/13/7/0 % proposés, configurable). Lignes arrondies au millime, totaux = somme des lignes.
- Remise par ligne ; un prix net sous le **prix minimum** exige `sales.approve`.
- Paiements : espèces, carte, mixte (plusieurs paiements), crédit client. Un reste dû exige un client et respecte son **plafond de crédit**. Paiement supérieur au total refusé.
- Le POS envoie une **clé d'idempotence par panier** : une validation répétée (double tap, réseau) ne crée jamais deux ventes.
- Deux caisses vendant la dernière unité en même temps : une seule réussit (`INSUFFICIENT_STOCK` pour l'autre).
- Retour client : quantité ≤ vendue − déjà retournée ; remise en stock vendable ou **blocage pour inspection** ; remboursement d'abord sur le dû du client, puis par le moyen choisi.
- Annulation d'une vente terminée (permission `sales.approve`) : mouvements `SALE_REVERSAL`, remboursement enregistré.
- La conformité fiscale tunisienne (mentions de facture, timbre fiscal, numérotation légale) **n'est pas revendiquée** : à valider avec un expert-comptable (voir SECURITY.md).

## Stock Autopilot

- Données : ventes nettes par jour (retours déduits) sur 90 j max, depuis le premier mouvement du produit dans le dépôt ; jours débutant avec un stock nul et sans vente exclus (demande non observable).
- Pas de prévision si < 14 jours d'historique ou < 3 jours avec ventes : la recommandation repose alors **uniquement** sur le stock minimum (méthode affichée, confiance faible, pas de date de rupture).
- Stock de sécurité = z × σ × √délai ; point de commande = demande × délai + sécurité (≥ minimum) ; cible = demande × (délai + période de revue) + sécurité (≥ minimum, ≤ maximum) ; quantité = cible − (disponible + commandes ouvertes), arrondie au MOQ puis au conditionnement.
- Priorité : critique si rupture avant livraison ou déjà en rupture ; recommandé sous le point de commande ; reportable si seul le minimum est franchi avec une couverture > délai + revue.
- Chaque recommandation stocke motifs et hypothèses (affichés) ; approuver/modifier crée un **brouillon** de commande ; rejeter enregistre la décision.
- Budget : allocation gloutonne par priorité puis couverture ; achats financés, reportés (avec date de rupture probable si connue), budget restant et besoin non couvert — **affichés comme projections**.

## Notifications

Alertes stock faible et rupture générées par le moteur et **dédupliquées** (une seule alerte tant que la condition dure, réarmée après retour au-dessus du seuil). Validation de commande requise, transfert en attente, recommandations critiques du jour.

## RBAC

Permissions `module.action` (lecture, création, modification, suppression, validation, export). 9 rôles système modifiables par entreprise (le rôle Propriétaire garde toujours tout) + rôles personnalisés. Une entreprise garde au moins un propriétaire actif. Quotas par formule (utilisateurs, dépôts, produits) — formules Starter / Business / Pro AI / Enterprise, **sans tarif ni prestataire de paiement**.
