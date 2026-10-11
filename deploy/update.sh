#!/bin/bash
# Rebuild and restart the app (and the database if needed). Run from the repo checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 pipeline/export.py
docker compose --env-file /opt/claims-lens/.env.prod -f deploy/docker-compose.yml up -d --build
echo "published $(date)"
