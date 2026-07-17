FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS production-deps

COPY package.json pnpm-lock.yaml ./
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
