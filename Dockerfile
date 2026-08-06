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
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/worker-domain/package.json ./packages/worker-domain/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS production-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/worker-domain/package.json ./packages/worker-domain/package.json
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --chown=nextjs:nextjs --from=production-deps /app/node_modules ./node_modules
COPY --chown=nextjs:nextjs --from=build /app/apps/web/.next/standalone ./
COPY --chown=nextjs:nextjs --from=build /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

USER nextjs

CMD ["node", "apps/web/server.js"]

# Railway deploys the Nest API separately from the traveler presentation app.
# Select this target for the browser-facing API service.
FROM base AS api-runner

ENV NODE_ENV=production
ENV PORT=3001

RUN groupadd --system api && useradd --system --gid api api

COPY --chown=api:api --from=production-deps /app/node_modules ./node_modules
COPY --chown=api:api --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 3001

USER api

CMD ["node", "apps/api/dist/main.mjs"]

# Admin is a separate Railway presentation service. It intentionally copies
# neither the traveler bundle nor any database package/output.
FROM base AS admin-runner

ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

RUN groupadd --system admin && useradd --system --gid admin admin

COPY --chown=admin:admin --from=production-deps /app/node_modules ./node_modules
COPY --chown=admin:admin --from=build /app/apps/admin/.next/standalone ./
COPY --chown=admin:admin --from=build /app/apps/admin/.next/static ./apps/admin/.next/static

EXPOSE 3003
USER admin
CMD ["node", "apps/admin/server.js"]

FROM deps AS migrator

COPY . .

CMD ["pnpm", "db:migrate"]

FROM build AS worker

ENV NODE_ENV=production
ENV WORKER_PORT=3002

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --chown=nextjs:nextjs . .

EXPOSE 3002

USER nextjs

CMD ["pnpm", "worker"]
