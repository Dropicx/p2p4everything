# Development Guide

This guide covers the development setup and workflow for p2p4everything.

## Project Structure

The project uses a single Next.js application structure (not a monorepo yet):

```
p2p4everything/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard pages
│   ├── sign-in/          # Auth pages
│   ├── sign-up/          # Auth pages
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page (redirects)
│   └── globals.css       # Global styles
├── components/            # React components
│   ├── ui/               # UI components (Button, Card, etc.)
│   └── layout/           # Layout components (Navbar, etc.)
├── lib/                   # Utilities and configs
│   ├── clerk.ts          # Clerk configuration
│   └── db.ts             # Prisma client
├── prisma/                # Database schema
│   └── schema.prisma     # Prisma schema
├── services/              # Backend services
│   └── signaling/        # WebSocket signaling server
├── scripts/               # Utility scripts
└── package.json          # Dependencies
```

## Local Development Setup

### Prerequisites

- Node.js 20+ (LTS)
- npm or pnpm
- Docker and Docker Compose (for local PostgreSQL and Redis)
- Clerk account

### Setup Steps

1. **Clone and Install**
   ```bash
   git clone <repo-url>
   cd p2p4everything
   npm install
   ```

2. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start Local Services**
   ```bash
   docker-compose up -d
   ```

4. **Run Database Migrations**
   ```bash
   npm run db:migrate
   ```

5. **Start Development Servers**
   ```bash
   # Terminal 1: Next.js app
   npm run dev
   
   # Terminal 2: Signaling server (optional)
   npm run signaling:dev
   ```

6. **Open in Browser**
   - Web app: http://localhost:3000
   - Signaling server: ws://localhost:3001

## Railway-First Development

This project is configured for Railway-first deployment. You can develop directly on Railway:

### Railway Development Workflow

1. **Push to GitHub**
   - Railway automatically deploys on push to main branch
   - Or create a feature branch and deploy manually

2. **View Logs**
   - Use Railway dashboard → Service → Logs
   - Or Railway CLI: `railway logs`

3. **Run Migrations**
   ```bash
   railway run --service web-app npx prisma migrate deploy
   ```

4. **Access Services**
   - Web app: Railway provides a public URL
   - Signaling server: Railway provides a public URL

## Development Commands

### Application
- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Type check without emitting

### Database
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Create and apply migrations
- `npm run db:migrate:deploy` - Apply migrations (production)
- `npm run db:studio` - Open Prisma Studio

### Signaling Server
- `npm run signaling:dev` - Start signaling server in dev mode
- `npm run signaling:build` - Build signaling server
- `npm run signaling:start` - Start signaling server

## Code Organization

### API Routes

API routes are in `app/api/`:
- `app/api/users/` - User management
- `app/api/devices/` - Device management
- `app/api/webhooks/clerk/` - Clerk webhook handler
- `app/api/health/` - Health check endpoint

### Components

- `components/ui/` - Reusable UI components
- `components/layout/` - Layout components

### Database

- `prisma/schema.prisma` - Database schema
- `lib/db.ts` - Prisma client instance

## Testing

### Manual Testing

1. **Authentication Flow**
   - Sign up with Clerk
   - Sign in
   - Check user sync to database

2. **API Endpoints**
   - Test `/api/users/me`
   - Test `/api/devices/register`
   - Test device listing

3. **WebSocket**
   - Connect to signaling server
   - Test room joining
   - Test message routing

## Migration to Monorepo

This project starts as a single Next.js app. Future migration to monorepo structure:

1. Create `apps/web/` directory
2. Move current app structure there
3. Create `packages/` for shared code
4. Update build scripts
5. Update Railway configuration

## Railway-Specific Notes

### Build Process

Railway uses Nixpacks to detect and build:
- Next.js app: Auto-detected from `package.json`
- Signaling server: Configured in `services/signaling/railway.json`

### Environment Variables

- Use Railway's variable references: `${{ServiceName.VARIABLE}}`
- See [RAILWAY_ENV.md](./RAILWAY_ENV.md) for complete list

### Database Migrations

Migrations should run on deployment:
- Option 1: Add as Railway deployment hook
- Option 2: Run manually after first deploy
- Option 3: Use Railway CLI in service shell

## Troubleshooting

### Database Connection Issues

- Verify `DATABASE_URL` is set correctly
- Check Railway PostgreSQL service is running
- Test connection: `railway run --service web-app npx prisma db pull`

### Build Failures

- Check Railway logs for errors
- Verify all dependencies in `package.json`
- Check Node.js version compatibility

### WebSocket Issues

- Verify signaling server URL is correct
- Check CORS configuration
- Verify WebSocket upgrade headers

## Next Steps

- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Set up CI/CD pipeline
- [ ] Add error tracking (Sentry)
- [ ] Add monitoring and analytics

