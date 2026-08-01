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
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/worker-domain/package.json ./packages/worker-domain/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS production-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/worker-domain/package.json ./packages/worker-domain/package.json
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

# Railway deploys the Nest API separately from the Next BFF. Select this target
# for the private API service so its build output and port are not coupled to web.
FROM base AS api-runner

ENV NODE_ENV=production
ENV PORT=3001
ENV SCHEMA_RELEASE_MATRIX_DIRECTORY=/app/docs/release-matrices

RUN groupadd --system api && useradd --system --gid api api

COPY --chown=api:api --from=production-deps /app/node_modules ./node_modules
COPY --chown=api:api --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=api:api --from=build /app/docs/release-matrices ./docs/release-matrices

EXPOSE 3001

USER api

CMD ["node", "apps/api/dist/main.mjs"]

FROM deps AS migrator

COPY . .

CMD ["pnpm", "db:migrate"]

FROM build AS worker

ENV NODE_ENV=production
ENV WORKER_PORT=3002
ENV SCHEMA_RELEASE_MATRIX_DIRECTORY=/app/docs/release-matrices

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --chown=nextjs:nextjs . .

EXPOSE 3002

USER nextjs

CMD ["pnpm", "worker"]
