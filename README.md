# XUYENVIET

XUYENVIET is a travel planning platform for road trips across Vietnam. The initial product is a web app, with a mobile app planned later.

## Purpose

More people in Vietnam are traveling by car, which creates a growing need for better trip planning and more reliable travel information. Existing information is often scattered across social groups and outdated by the time someone finds it.

This project aims to make trip planning easier by collecting travel data from multiple sources and using AI as an assistant and agent that helps users plan, prepare, and manage every part of a road trip.

## What it should help with

- Building trip plans, including destinations, routes, and trip duration
- Helping users find hotels, sightseeing spots, charging stations, rest stops, and other useful places
- Acting as a trip assistant that can suggest, organize, and adapt plans based on user needs
- Collecting and organizing shared travel knowledge in one place
- Keeping travel information easier to search and more up to date

## Product direction

The long-term idea is for the AI assistant and agent to combine:

- information gathered from the internet
- curated data stored in the database
- user preferences and trip context

This should create a more personalized travel experience than searching through scattered posts or static lists, while helping users throughout the full road trip workflow from inspiration to planning to on-the-road decisions.

## Vision

XUYENVIET should become a practical AI trip companion for people traveling through Vietnam by car, helping them plan smarter, adapt faster, and discover better options with less effort.

## Local development

This repository now contains the public MVP web app foundation.

Requirements:

- Node.js 20.9 or newer
- pnpm 10.x
- PostgreSQL connection string for database migration commands
- OpenAI-compatible AI Gateway URL and API key for future AI provider calls

Setup:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Database scripts:

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` and `db:migrate` use `drizzle.config.ts` and `DATABASE_URL`. Story 1.1 intentionally configures Drizzle without adding domain tables.
