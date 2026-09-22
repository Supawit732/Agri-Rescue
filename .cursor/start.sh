#!/usr/bin/env bash
# Per-boot startup for the Agri-Rescue Cloud Agent environment.
# Starts the MySQL daemon and waits until it accepts connections so the
# server-api terminal can connect. Idempotent and safe across restarts.
set -euo pipefail

echo "==> Starting MySQL"
sudo service mysql start || true

echo "==> Waiting for MySQL to accept connections"
for _ in $(seq 1 60); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    echo "MySQL is ready"
    exit 0
  fi
  sleep 1
done

echo "MySQL did not become ready in time" >&2
exit 1
