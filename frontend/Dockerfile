ARG BACKEND_URL=http://localhost:8000

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && pnpm --version
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
ARG BACKEND_URL
ARG NEXT_PUBLIC_PADDLE_ENVIRONMENT
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_PADDLE_ENVIRONMENT=$NEXT_PUBLIC_PADDLE_ENVIRONMENT
ENV NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
RUN corepack enable && pnpm --version
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "server.js"]

