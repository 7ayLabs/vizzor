FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app
ENV HUSKY=0

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# --- Build ---
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsup.config.ts ./
COPY src/ src/
RUN pnpm build

# --- Runtime ---
FROM node:20-alpine AS runtime
RUN addgroup -S vizzor && adduser -S vizzor -G vizzor
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY src/data/migrations/ src/data/migrations/

USER vizzor
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
CMD ["serve", "--port", "3000"]
