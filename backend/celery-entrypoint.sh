#!/usr/bin/env sh
set -e

exec celery -A config worker \
  -l "${CELERY_LOG_LEVEL:-info}" \
  -Q ai,default \
  --concurrency "${CELERY_CONCURRENCY:-4}"
