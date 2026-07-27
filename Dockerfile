FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS production-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --chown=nextjs:nextjs --from=production-deps /app/node_modules ./node_modules
COPY --chown=nextjs:nextjs --from=build /app/.next ./.next
COPY --chown=nextjs:nextjs package.json ./

EXPOSE 3000

USER nextjs

CMD ["node_modules/.bin/next", "start"]

FROM deps AS migrator

COPY . .

CMD ["pnpm", "db:migrate"]

FROM deps AS worker

ENV NODE_ENV=production

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --chown=nextjs:nextjs . .

USER nextjs
