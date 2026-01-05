#!/bin/sh
set -e

# Run DB migrations if DATABASE_URL is provided
if [ -n "${DATABASE_URL}" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "DATABASE_URL not set; skipping prisma migrate deploy"
fi

exec "$@"
