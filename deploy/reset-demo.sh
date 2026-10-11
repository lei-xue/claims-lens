#!/bin/bash
# Nightly demo reset: rebuild ~200 days of fictional data dated up to today.
set -euo pipefail
docker compose -p claims-lens exec -T app node dist-server/seed.cjs
