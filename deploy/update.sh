#!/bin/bash
# Rebuild and restart the app (and the database if needed). Run from the repo checkout.
# Code explanations are committed in web/public/data; rebuild them with pipeline/ first if needed.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose --env-file /opt/claims-lens/.env.prod -f deploy/docker-compose.yml up -d --build
echo "published $(date)"
