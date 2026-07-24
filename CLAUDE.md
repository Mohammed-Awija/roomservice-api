# CLAUDE.md — serveyce-qr-api

> Context for AI assistants (Claude Code, Cursor, etc.) working in this repository.

---

## What this repo is

This is the **backend API** for **ServeyceQr**, the first product of the Serveyce platform (serveyce.com).

ServeyceQr is a QR-code-based service portal for hospitality operators in Turkey: short-term rental hosts, small hotels, and hostels. Guests scan a QR code in their room, browse services in their language, and submit requests. Staff manage requests in real-time. Admins capture KBS-compliant guest registration data.

The companion frontend repository is `serveyce-qr-web` (Next.js 16, deployed on Vercel).

### Brand context (matters for naming decisions)

Serveyce is a platform brand intended to support multiple verticals over time:
- **ServeyceQr** (this product, V1) — hospitality
- **Serveyce Order** (planned future product) — restaurants, cafés, bars
- Other verticals possible later

Because of this, the **data model uses generic platform names** (`Organization`, not `Hotel`; `Location`, not `Room`; `OfferingType`, not `ServiceType`) so the schema doesn't need rewriting when Serveyce Order ships. The **UI and product surface remain hospitality-specific** for V1 — do not add restaurant features.

When in doubt about a name, ask: "would this still make sense for a restaurant?" If yes, use the generic name. If no, it belongs in a vertical-specific module (like the KBS module).

---

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript (strict mode) | No `any`, no `as` casts unless absolutely necessary |
| Framework | NestJS 11 | Always use `nest g` CLI to generate modules/controllers/services |
| ORM | Prisma **6.x** | **DO NOT upgrade to Prisma 7** — it broke our setup; staying on v6 is intentional |
| Database | PostgreSQL 17 | Local: Docker; Production: Neon |
| Auth | Clerk (not yet wired) | Webhook will create Organization + Membership on signup |
| Validation | class-validator + class-transformer | Used in DTOs |
| Config | @nestjs/config | `.env` loaded as global |
| Package manager | pnpm | Don't suggest npm or yarn alternatives |
| Test runner | Jest (default Nest setup) | Tests are deferred until Phase 7 |
| Deployment | Railway | Configured via `railway.json` |

### Hard rules about dependencies

- **Prisma stays on v6.x.** If you see a "Prisma 7 available" upgrade prompt or v7 docs while building, ignore it. v7 moved connection URLs into a `prisma.config.ts` file, requires a driver adapter, and broke our setup. We re-evaluate v7 in 2026 Q4.
- `prisma` CLI must be in `dependencies`, not `devDependencies`, so Railway production builds can find it.
- `@nestjs/cli` and `typescript` need to be available during production build; the Railway env var `NPM_CONFIG_PRODUCTION=false` ensures this without moving them out of devDependencies.

---

## Folder structure

```
serveyce-qr-api/
├── src/
│   ├── auth/                      # (planned) Clerk JWT guard, tenant interceptor
│   ├── webhooks/                  # (planned) Clerk webhook handler
│   ├── organizations/             # (planned) CRUD for organizations
│   ├── locations/                 # (planned) Location CRUD (rooms/tables/areas)
│   ├── offering-types/            # (planned) What can be requested
│   ├── requests/                  # (planned) Service requests + lifecycle
│   ├── guest-records/             # (planned) KBS module — hospitality-only
│   ├── audit/                     # (planned) Audit log
│   ├── public/                    # (planned) Unauthenticated guest endpoints
│   ├── prisma/                    # PrismaService + PrismaModule (Global)
│   ├── health/                    # Health check endpoint
│   ├── app.module.ts
│   └── main.ts
├── prisma/
│   ├── schema.prisma              # Source of truth for data model
│   ├── migrations/                # Versioned migration history (committed)
│   └── seed.ts                    # Run via `prisma db seed`
├── docker-compose.yml             # Local Postgres on port 6432
├── railway.json                   # Production build/deploy config
├── SPEC.md                        # Full product spec — read this first
└── .env                           # Local secrets (gitignored)
```

---

## Data model (current and planned)

Current schema (in `prisma/schema.prisma`):
- `Organization` — top-level tenant (kind: HOTEL/HOSTEL/SHORT_TERM_RENTAL/etc.)

Planned models (to be added in Sessions 6–8):
- `User` — id matches Clerk user
- `Membership` — links User ↔ Organization with role (OWNER/STAFF)
- `Location` — QR-code-bearing place; kind: ROOM/TABLE/AREA/OTHER
- `OfferingType` — what can be requested; per-org
- `Request` — guest's submitted request; lifecycle PENDING → ACCEPTED → IN_PROGRESS → DONE → CANCELLED
- `GuestRecord` — KBS-mandatory guest registration (hospitality-only)
- `AuditLog` — who did what

All tenant-owned tables carry `organizationId` and queries must be scoped to it.

Full data model details are in `SPEC.md`.

---

## Architectural conventions

### Multi-tenancy

Every tenant-owned table includes `organizationId`. Enforcement happens in two layers:

1. **AuthGuard** verifies the Clerk JWT and extracts `userId`.
2. **TenantInterceptor** looks up the user's active `Membership`, attaches `organizationId` to the request context.
3. **Prisma extension or wrapping service** auto-injects `where: { organizationId }` into queries.

When implementing a new feature involving tenant data: **never** trust a `organizationId` passed in a request body or URL parameter. Always derive it from the authenticated user's membership.

### NestJS patterns

- Use `nest g module <name>` and `nest g controller <name>` — don't create files by hand
- Modules are feature-oriented: `organizations/`, `requests/`, etc.
- Controllers handle HTTP; services handle business logic; never put business logic in controllers
- DTOs go in `<feature>/dto/`; use `class-validator` decorators
- Use `@Injectable()` for services; constructor injection only

### Public vs authenticated endpoints

The guest-facing QR code page (`serveyce-qr-web`'s `/o/[slug]/l/[locationId]`) calls **unauthenticated** API endpoints in `src/public/`. These:
- Resolve `orgSlug` → `organizationId` server-side
- Validate the location belongs to that org
- Rate-limit by IP
- Never require a user account

All other endpoints are authenticated and tenant-scoped.

---

## Local development

### Common commands

```bash
# Start local Postgres
docker compose up -d

# Stop local Postgres
docker compose down              # keeps data
docker compose down -v           # WIPES the data volume

# Start the dev server
pnpm start:dev                   # serves on http://localhost:3001

# Database
npx prisma migrate dev --name <descriptive_name>   # creates new migration
npx prisma migrate reset                            # nuke + re-run migrations + re-seed
npx prisma db seed                                  # run seed only
npx prisma studio                                   # GUI database explorer

# Generate Prisma Client (usually automatic; force-run after schema changes)
npx prisma generate
```

### Ports

- **3001** — NestJS dev server
- **6432** — local Postgres (mapped from container's 5432; 5432 conflicts with native Mac installs)

### Critical env vars (in `.env`)

```
DATABASE_URL=postgresql://serveyce:dev_password_change_me@localhost:6432/serveyce?schema=public
CORS_ORIGINS=http://localhost:3000
PORT=3001
```

`.env` is gitignored. `.env.example` is committed with placeholder values.

---

## Production

Deployed to **Railway**. Configuration is in `railway.json`:
- **Build:** `pnpm install && pnpm prisma generate && pnpm build`
- **Pre-deploy:** `pnpm prisma migrate deploy` — applies new migrations to Neon
- **Start:** `node dist/main`
- **Healthcheck:** `/api/health`

Railway env vars (set in dashboard, NOT in any file):
- `DATABASE_URL` — Neon Postgres connection string with `?sslmode=require`
- `CORS_ORIGINS` — comma-separated, includes the Vercel production URL
- `NPM_CONFIG_PRODUCTION=false` — required so `nest build` and `prisma` CLI are available during build

Pushes to `main` auto-deploy. No staging environment yet.

---

## Commit conventions

Use Conventional Commits:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change that's neither feat nor fix
- `chore:` — tooling, deps, config
- `docs:` — documentation only
- `test:` — tests only

Examples:
```
feat: add Organization CRUD endpoints
fix: tenant guard rejects requests with no membership
refactor: extract KBS submission into dedicated service
chore: pin prisma to v6 in package.json
```

---

## Things NOT to do (avoid common mistakes)

- Don't upgrade Prisma to v7
- Don't introduce a second ORM
- Don't trust `organizationId` from request input
- Don't add restaurant-specific features in V1 (despite the multi-vertical data model)
- Don't add WebSockets — V1 ships with polling, documented as a deliberate trade-off
- Don't add payment processing in V1
- Don't write tests yet — that's Phase 7 work, not pre-V1
- Don't add `migrate dev` to production scripts — production uses `migrate deploy`
- Don't commit `.env`, `dist/`, `node_modules/`, or `*.log` files

---

## Reference

- **Full product spec:** `SPEC.md` in this repo
- **Frontend repo:** `serveyce-qr-web` (separate GitHub repo, deployed to Vercel)
- **Brand site (planned):** serveyce.com
- **Production API:** Railway-hosted (URL in `serveyce-qr-web/.env.example`)
- **Production DB:** Neon (Frankfurt region)
