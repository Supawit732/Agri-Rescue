# Deploying to the university server

Target: `119.59.102.161`, SSH user `std6730202700`, home dir `/app` (contains
an old Inventory app — **never touch anything outside `/app/agri-rescue`**).
Node v24 and pm2 are already installed. Public port `3064` is the only one
opened for you: **http://119.59.102.161:3064**.

MySQL runs on the same machine (`DB_HOST=localhost`, `DB_NAME=ip_std6730202700`,
user `std6730202700`, no `REFERENCES` privilege — this project never issues
`FOREIGN KEY` DDL, so that's not a blocker). The database already has all 27
Agri-Rescue tables, imported by hand from `docs/database/schema.sql`. There is
**no `schema_migrations` table yet** — step 5 below creates one and marks
every existing migration file as already applied, so a later `npm run migrate`
only runs migrations that are actually new, instead of re-running everything
against tables that already exist.

All commands below run **on the server**, over your own SSH session.

## 1. Get the code onto the server

**If the server has GitHub access:**

```bash
mkdir -p /app/agri-rescue
cd /app/agri-rescue
git clone https://github.com/Supawit732/Agri-Rescue.git .
git checkout main   # or whichever branch you want live
```

**If it doesn't** (common on locked-down student hosts): build a clean zip
locally (excluding `node_modules`, `dist`, `mobile`, `.git`, `server/uploads`,
`server/.env*`) and upload it with FileZilla (SFTP, port 22) into
`/app/agri-rescue`, then unzip on the server:

```bash
# locally
cd /Users/pandoda/development/agri-rescue
zip -r /tmp/agri-rescue.zip . -x "node_modules/*" "*/node_modules/*" ".git/*" \
  "server/dist/*" "server/uploads/*" "server/.env*" "mobile/*"
# upload /tmp/agri-rescue.zip via FileZilla to /app/agri-rescue/

# on the server
cd /app/agri-rescue
unzip agri-rescue.zip && rm agri-rescue.zip
```

Only `server/` is needed on the server — `mobile/` runs on your own machine
via Expo Go (see step 8).

## 2. Install dependencies

```bash
cd /app/agri-rescue/server
npm ci
```

## 3. Create the production `.env`

```bash
cp .env.production.example .env
nano .env   # or vi
```

Fill in at minimum:
- `DB_PASSWORD` — your MySQL password (`DB_HOST`/`DB_USER`/`DB_NAME` are
  already correct for this host in the example file)
- `JWT_SECRET` — a long random string, not the placeholder
- `PORT` should stay `3064`

Leave `AI_VISION_*` blank if you don't have a vision API key — the feature
degrades gracefully. See the comments in `.env.production.example` for why
there's no `PUBLIC_URL`/`CORS_ORIGIN`/`UPLOAD_DIR` var: uploads are served as
relative paths and CORS already allows any origin, so nothing to configure.

## 4. Build

```bash
npm run build
```

This runs `tsc` and copies `src/db/migrations/*.sql` into `dist/db/migrations`
(the migration runner reads `.sql` files at runtime, which `tsc` alone
wouldn't carry over). If the build fails for any reason, you can run the app
directly from source instead — see the commented-out fallback lines in
`ecosystem.config.cjs`.

## 5. Mark existing migrations as applied

Dry run first — this only prints what it *would* insert, it writes nothing:

```bash
npm run migrate:mark-applied
```

Review the list, then actually write it:

```bash
npm run migrate:mark-applied -- --apply
```

From now on, `npm run migrate` will only run migration files added after
today, not re-run the 34 already reflected in the manually-imported schema.

## 6. Start with pm2

```bash
cd /app/agri-rescue/server
pm2 start ecosystem.config.cjs
pm2 save
```

`pm2 save` persists the process list so pm2 can restore it after a reboot (if
you also run `pm2 startup` and it's supported on your account — optional,
skip if you don't have the permissions for it).

## 7. Verify

```bash
pm2 logs agri-rescue --lines 50
curl http://localhost:3064/health
# from your own machine:
curl http://119.59.102.161:3064/health
```

Both should return `{"ok":true}`.

## 8. Point the mobile app at the server (Expo Go)

On your own machine, in `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://119.59.102.161:3064
```

Then `npx expo start` and open in Expo Go as usual — `mobile/src/api/config.ts`
already reads this var (falls back to `http://localhost:3000` if unset), and
`mobile/src/lib/media.ts` resolves photo URLs returned by the API (e.g.
`/uploads/lots/xyz.jpg`) against the same base URL, so uploaded photos load
from the server automatically.

**HTTP (non-HTTPS) caveat:** Expo Go itself allows plain `http://` connections
for dev/testing (its own iOS Info.plist and Android manifest already permit
arbitrary loads), so this works with **no extra config** while testing in Expo
Go. This only becomes a problem if you later create a **standalone build**
(`eas build`) — iOS App Transport Security and Android's cleartext-traffic
policy both block plain HTTP by default in a standalone app, and you'd need
an ATS exception / `usesCleartextTraffic` override, or (better) put the API
behind HTTPS.

## 9. Updating later

```bash
cd /app/agri-rescue
git pull                 # or re-upload + unzip via FileZilla
cd server
npm ci                   # only if dependencies changed
npm run build
pm2 restart agri-rescue
pm2 logs agri-rescue --lines 30   # confirm it came back up
```

If a new migration file was added since the last deploy, run
`npm run migrate` (not `migrate:mark-applied`) before restarting — it will
skip everything already marked applied and only run the new one(s).
