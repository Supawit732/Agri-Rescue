#!/usr/bin/env bash
# Idempotent repository bootstrap for the Agri-Rescue Cloud Agent environment.
# Installs Node dependencies, provisions the MySQL app user, and applies the
# dev database schema + seed data. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing server dependencies"
( cd server && npm ci )

echo "==> Installing mobile dependencies"
( cd mobile && npm ci )

echo "==> Ensuring server/.env exists"
if [ ! -f server/.env ]; then
  cat > server/.env <<'ENV'
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=agri
DB_PASSWORD=agri-rescue
DB_NAME=agri_rescue
JWT_SECRET=dev-secret
DEPOT_LAT=13.65
DEPOT_LNG=100.62
ENV
fi

echo "==> Ensuring MySQL server is installed"
if ! command -v mysqld >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
fi

echo "==> Starting MySQL for bootstrap"
sudo service mysql start || true
for _ in $(seq 1 60); do
  if sudo mysqladmin ping >/dev/null 2>&1; then break; fi
  sleep 1
done
sudo mysqladmin ping

echo "==> Provisioning MySQL app user 'agri'"
sudo mysql <<'SQL'
CREATE USER IF NOT EXISTS 'agri'@'localhost' IDENTIFIED WITH mysql_native_password BY 'agri-rescue';
CREATE USER IF NOT EXISTS 'agri'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'agri-rescue';
CREATE USER IF NOT EXISTS 'agri'@'%' IDENTIFIED WITH mysql_native_password BY 'agri-rescue';
GRANT ALL PRIVILEGES ON *.* TO 'agri'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO 'agri'@'127.0.0.1' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO 'agri'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL

echo "==> Applying dev database schema and seed data"
( cd server && npm run migrate && npm run seed )

echo "==> install.sh complete"
