# Application mobile (Android / iOS)

Expo SDK 54 · React Native 0.81 · Expo Router. Code : `apps/mobile`.

## Configuration

```bash
cp apps/mobile/.env.example apps/mobile/.env
# EXPO_PUBLIC_API_URL doit être joignable depuis l'appareil :
#   émulateur Android : http://10.0.2.2:4000/api/v1
#   simulateur iOS    : http://localhost:4000/api/v1
#   appareil physique : http://<IP-du-poste>:4000/api/v1  (et ajouter l'origine à CORS_ORIGINS si besoin)
```

## Lancer en développement

```bash
pnpm build:packages
pnpm dev:mobile            # expo start
```

- **Android** : `a` dans le terminal Expo (émulateur) ou Expo Go / development build sur un appareil.
- **iOS** (macOS + Xcode) : `i` dans le terminal Expo.
- La caméra (scan) nécessite un appareil réel ou un émulateur avec caméra virtuelle. Saisie manuelle toujours disponible.

## Builds natifs

```bash
cd apps/mobile
npx expo prebuild                 # génère android/ et ios/ (non versionnés)
npx expo run:android              # ou run:ios
# Distribution : EAS Build (eas build -p android|ios) — compte Expo requis, non configuré ici.
```

Identifiants : `tn.stockiteasy.app` (Android package / iOS bundle id), à adapter avant publication.

## Fonctionnement hors ligne

1. À la connexion (et à chaque retour réseau), l'app télécharge `GET /sync/snapshot` : catalogue (codes-barres, conditionnements, soldes) et inventaires ouverts.
2. Hors ligne, scans et ajustements sont enregistrés dans SQLite avec un identifiant client unique (bandeau « Hors ligne », compteur d'opérations en attente).
3. Au retour du réseau / au premier plan, `POST /sync/push` envoie la file dans l'ordre. Une opération déjà appliquée est reconnue (`DUPLICATE`), jamais rejouée.
4. Conflits (un collègue a compté la même ligne) et refus (ex. stock insuffisant) restent dans **Synchronisation** jusqu'à décision explicite : « Garder mon comptage » ou « Abandonner ».
5. Si la session a expiré, la file est conservée ; elle repart après reconnexion.

Le refresh token est stocké dans le trousseau (SecureStore) ; la base SQLite ne contient ni jeton ni mot de passe.

## Vérification sans appareil

`pnpm --filter @stockiteasy/mobile bundle:check` produit le bundle Android Hermes avec Metro (utilisé en CI).
