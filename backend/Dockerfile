FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3011
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Sem output: standalone (ver next.config.ts) — o custom server (server.ts)
# roda a partir do build normal, então a imagem final carrega node_modules
# de produção + o build do Next + o código-fonte que o server.ts importa
# diretamente (tsx transpila em tempo de execução, não passa pelo bundler
# do Next).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --chown=nextjs:nodejs server.ts next.config.ts tsconfig.json ./
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs db/certs ./db/certs
USER nextjs
EXPOSE 3011
CMD ["npm", "start"]
