FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG BACKEND_INTERNAL_URL=http://backend:3011
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_REALTIME_URL
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ARG BACKEND_INTERNAL_URL=http://backend:3011
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3010
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs scripts/start.sh ./start.sh
USER nextjs
EXPOSE 3010
CMD ["sh", "./start.sh"]
