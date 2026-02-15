# CiNect Nest Backend

Cinema booking platform backend built with NestJS, TypeScript, PostgreSQL (Prisma), JWT authentication, and WebSockets.

## Prerequisites

- **Node.js 20+**
- **PostgreSQL 16+**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment example and adjust values:

   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL, JWT_SECRET, etc.
   ```

3. Generate Prisma client and run migrations:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

4. Seed the database (roles + membership tiers):

   ```bash
   npx prisma db seed
   ```

5. Start the application:

   ```bash
   npm run start:dev
   ```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/cinect_node` |
| `JWT_SECRET` | JWT signing key (min 256 bits) | - |
| `JWT_ACCESS_SECONDS` | Access token expiry (seconds) | `900` (15 min) |
| `JWT_REFRESH_SECONDS` | Refresh token expiry (seconds) | `604800` (7 days) |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:3000` |
| `PORT` | Server port | `3001` |
| `HOLD_TTL_MINUTES` | Seat hold TTL (minutes) | `10` |
| `PAYMENT_TIMEOUT_MINUTES` | Payment timeout (minutes) | `2` |
| `POINTS_PER_BOOKING` | Loyalty points per booking | `10` |
| `MAINTENANCE_MODE` | Enable maintenance mode | `false` |

## Run Commands

**Development:**
```bash
npm run start:dev
```

**Production build:**
```bash
npm run build
npm run start:prod
```

**Prisma:**
```bash
npx prisma generate
npx prisma migrate dev
npx prisma migrate deploy   # production
npx prisma studio
npx prisma db seed
```

**Docker:**
```bash
docker build -t cinect-nest-backend .
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/cinect_node \
  -e JWT_SECRET=your-jwt-secret-key \
  cinect-nest-backend
```

Or use the project root `docker-compose.yml`:

```bash
cd ..
docker compose up -d
```

## API Documentation

- **Base URL:** `http://localhost:3001/api/v1`
- **Swagger UI:** `http://localhost:3001/api/docs`

## Tech Stack

- NestJS 11, TypeScript
- Prisma ORM, PostgreSQL
- JWT (Passport), Socket.io
- Swagger/OpenAPI, class-validator
- Rate limiting (Throttler), Scheduling
