# Installation sous Windows (pas à pas)

Commandes pour **PowerShell** (recommandé). Les commandes « cmd » sont indiquées quand elles diffèrent.

## 1. Installer les outils (une seule fois)

1. **Node.js 22 LTS** : <https://nodejs.org> → installer (cocher « Add to PATH »).
2. **Git** : <https://git-scm.com/download/win>.
3. **Docker Desktop** : <https://www.docker.com/products/docker-desktop/> → l'installer puis **le lancer** (icône baleine active).
   (Alternative sans Docker : installer PostgreSQL 16 depuis <https://www.postgresql.org/download/windows/>.)
4. **Fermer puis rouvrir** PowerShell, puis activer pnpm :

```powershell
node -v            # doit afficher v22.x
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm -v            # doit afficher 10.28.0
```

Si `corepack enable` refuse (droits), ouvrir PowerShell **en administrateur**, ou utiliser : `npm install -g pnpm@10.28.0`.

## 2. Récupérer le code

```powershell
cd $HOME
git clone -b claude/dazzling-albattani-rpqd9k https://github.com/sinox196/StockItEasy.git
cd StockItEasy
```

## 3. Installer et préparer la base

```powershell
pnpm install
docker compose up -d postgres redis
copy apps\api\.env.example apps\api\.env
notepad apps\api\.env
```

Dans le Bloc-notes, remplir au minimum :

```
JWT_ACCESS_SECRET=une-longue-phrase-secrete-d-au-moins-32-caracteres
DATABASE_URL=postgresql://stockiteasy:stockiteasy@localhost:5432/stockiteasy?schema=public
```

Enregistrer, fermer, puis :

```powershell
pnpm build:packages
pnpm --filter @stockiteasy/api exec prisma migrate deploy
$env:SEED_DEMO_PASSWORD = "MonMotDePasse2026"
pnpm db:seed
```

(Avec **cmd** au lieu de PowerShell : `set SEED_DEMO_PASSWORD=MonMotDePasse2026` puis `pnpm db:seed`.)

## 4. Lancer l'application

Ouvrir **deux** fenêtres PowerShell dans le dossier `StockItEasy` :

```powershell
# fenêtre 1 — API (http://localhost:4000/api/docs)
pnpm dev:api
```

```powershell
# fenêtre 2 — site web
pnpm dev:web
```

Ouvrir <http://localhost:3000> et se connecter avec `owner@demo.stockiteasy.local` et le mot de passe choisi à l'étape 3.

## 5. Application mobile (optionnel)

```powershell
copy apps\mobile\.env.example apps\mobile\.env
notepad apps\mobile\.env    # EXPO_PUBLIC_API_URL=http://<IP-de-ton-PC>:4000/api/v1
pnpm dev:mobile
```

Trouver l'IP du PC avec `ipconfig` (ligne « Adresse IPv4 »). Le téléphone doit être sur le même Wi-Fi. Voir [MOBILE.md](MOBILE.md).

## Problèmes fréquents

| Message | Solution |
|---|---|
| `'pnpm' n'est pas reconnu…` | Étape 1 (corepack) puis **rouvrir** le terminal |
| `docker : … n'est pas reconnu` ou `cannot connect to the Docker daemon` | Lancer Docker Desktop et attendre qu'il soit « running » |
| `ERR_PNPM_NO_PKG_MANIFEST` / `No package.json` | Vous n'êtes pas dans le dossier du projet : `cd $HOME\StockItEasy` |
| `Invalid environment configuration` au démarrage de l'API | `apps\api\.env` absent ou `JWT_ACCESS_SECRET` < 32 caractères |
| `P1001: Can't reach database server` | PostgreSQL pas démarré : `docker compose up -d postgres` |
| Port 5432 déjà utilisé | Un autre PostgreSQL tourne : l'arrêter, ou adapter le port dans `docker-compose.yml` et `DATABASE_URL` |
| L'exécution de scripts est désactivée (PowerShell) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
