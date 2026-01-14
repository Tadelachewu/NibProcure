#!/bin/sh
set -e

echo "DATABASE_URL=${DATABASE_URL:-not-set}"

echo "Waiting for database to become available..."
# Parse host and port from DATABASE_URL if present, fallback to localhost:5432
DB_HOST=localhost
DB_PORT=5432
if [ -n "${DATABASE_URL}" ]; then
	HOSTPORT=$(echo "$DATABASE_URL" | sed -E 's#^.*@([^/:]+)(:([0-9]+))?/.*$#\1:\3#')
	if echo "$HOSTPORT" | grep -q ':'; then
		DB_HOST=$(echo "$HOSTPORT" | cut -d: -f1)
		PORT_PART=$(echo "$HOSTPORT" | cut -d: -f2)
		if [ -n "$PORT_PART" ]; then DB_PORT=$PORT_PART; fi
	else
		DB_HOST="$HOSTPORT"
	fi
fi

echo "Checking TCP $DB_HOST:$DB_PORT"
for i in 1 2 3 4 5 6 7 8 9 10; do
	if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
		echo "Database reachable at $DB_HOST:$DB_PORT"
		break
	fi
	echo "Waiting for $DB_HOST:$DB_PORT ($i/10)"
	sleep 2
done

echo "Applying migrations (prisma migrate deploy)"
# If migrations exist, try deploy with retries; otherwise use db push
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null || true)" != "" ]; then
	retries=0
	until npx prisma migrate deploy; do
		retries=$((retries+1))
		echo "prisma migrate deploy failed, retrying (${retries}/10)"
		if [ "$retries" -ge 10 ]; then
			echo "prisma migrate deploy failed after retries"
			break
		fi
		sleep 2
	done
else
	echo "No migration files found; using prisma db push to create schema"
	if ! npx prisma db push; then
		echo "prisma db push failed — continuing and attempting seed/start"
	fi
fi

echo "Running seed (errors ignored)"
npm run db:seed || echo "db:seed failed — continuing"

echo "Starting application..."
# Ensure Next.js listens on all interfaces so docker port mapping works
npm run start -- -H 0.0.0.0
