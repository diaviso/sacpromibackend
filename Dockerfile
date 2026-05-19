# syntax=docker/dockerfile:1.7
# ============================================================
# SACPROMI Backend — Dockerfile multi-stage (Node 22 alpine)
# Optimisé pour Railway (utilise PORT injecté par la plateforme)
# ============================================================

# ---------- Stage 1 : deps ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Outils nécessaires pour bcrypt + Prisma sur Alpine
RUN apk add --no-cache python3 make g++ openssl libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma

# Installation complète (dev + prod) pour pouvoir builder
# postinstall = prisma generate (utilise prisma/schema.prisma copié au-dessus)
RUN npm ci --no-audit --no-fund

# ---------- Stage 2 : build ----------
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

RUN npm run build \
 && npm prune --omit=dev \
 && npx prisma generate

# ---------- Stage 3 : runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat tini \
 && addgroup -S nodejs \
 && adduser -S nestjs -G nodejs

ENV NODE_ENV=production
ENV TZ=Africa/Dakar

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3070

# Tini comme init pour propager SIGTERM proprement (Railway l'envoie au déploiement)
ENTRYPOINT ["/sbin/tini", "--"]

# `release` = prisma migrate deploy && node dist/src/main
CMD ["npm", "run", "release"]
