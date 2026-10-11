#!/bin/bash
# Export explanations, build and publish to /opt/claims-lens/site.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 pipeline/export.py
(cd web && npm ci --silent && npx vite build)
rsync -a --delete web/dist/ /opt/claims-lens/site/
docker compose -f deploy/docker-compose.yml up -d
echo "published $(date)"
