# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app

# Prisma on alpine needs openssl + libc compatibility
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate prisma client and build Next.js
RUN npm run postinstall
RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs; adduser -S nextjs -u 1001

# Copy package manifests for runtime tooling (npx prisma)
COPY --from=builder /app/package.json /app/package-lock.json* ./

# Copy built app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Prisma runtime needs schema + migrations
COPY --from=builder /app/prisma ./prisma

# Install only production deps
RUN npm ci --omit=dev

# Entrypoint runs prisma migrate deploy then starts Next
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs
EXPOSE 9002
ENV PORT=9002

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start"]
