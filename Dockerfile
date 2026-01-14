FROM node:20-alpine

WORKDIR /app

# Prisma on alpine needs openssl + libc compatibility
RUN apk add --no-cache libc6-compat openssl

# Copy package files and Prisma schema before installing so `prisma generate` (postinstall) works
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies (use ci for reproducible installs)
RUN npm ci --legacy-peer-deps

# Copy the rest of the app and build
COPY . .
RUN npm run build

# Ensure `start.sh` exists and has the expected content (some build contexts may produce an empty file)
RUN if [ ! -s ./start.sh ]; then \
	echo '#!/bin/sh' > ./start.sh && \
	echo 'set -e' >> ./start.sh && \
	echo '' >> ./start.sh && \
	echo 'echo "Waiting for database..."' >> ./start.sh && \
	echo 'sleep 5' >> ./start.sh && \
	echo '' >> ./start.sh && \
	echo 'echo "Running migrations..."' >> ./start.sh && \
	echo 'npm run db:migrate' >> ./start.sh && \
	echo '' >> ./start.sh && \
	echo 'echo "Running seed..."' >> ./start.sh && \
	echo 'npm run db:seed' >> ./start.sh && \
	echo '' >> ./start.sh && \
	echo 'echo "Starting application..."' >> ./start.sh && \
	echo 'npm start' >> ./start.sh && \
	chmod +x ./start.sh; \
fi

RUN chmod +x ./start.sh || true
ENV PORT=9002
EXPOSE 9002

CMD ["sh", "./start.sh"]
