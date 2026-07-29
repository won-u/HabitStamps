# Build context is the repo root (see docker-compose.yml) because this is a
# pnpm workspace package that depends on @habit-tracker/core via workspace:*.
FROM node:20-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

COPY packages/core packages/core
COPY apps/backend apps/backend

WORKDIR /app/apps/backend
EXPOSE 4000
CMD ["pnpm", "start"]
