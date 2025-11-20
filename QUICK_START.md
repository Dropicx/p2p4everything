# Quick Start Guide

Get p2p4everything up and running in minutes!

## Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+ (or npm)
- Docker and Docker Compose
- Git

## Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/p2p4everything.git
cd p2p4everything

# Install dependencies
pnpm install
```

## Step 2: Set Up Clerk

1. Create an account at [clerk.com](https://clerk.com)
2. Create a new application
3. Copy your API keys:
   - Publishable Key
   - Secret Key

## Step 3: Configure Environment

Create a `.env` file in the root directory:

```env
# Application
NODE_ENV=development
PORT=3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (will be set by Docker Compose)
DATABASE_URL=postgresql://postgres:password@localhost:5432/p2p4everything

# Redis (will be set by Docker Compose)
REDIS_URL=redis://localhost:6379

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# WebRTC Signaling
SIGNALING_SERVER_URL=ws://localhost:3001
NEXT_PUBLIC_SIGNALING_SERVER_URL=ws://localhost:3001

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_SECRET=your-jwt-secret-key-here
```

Generate encryption keys:
```bash
# Generate encryption key (32 characters)
openssl rand -hex 16

# Generate JWT secret
openssl rand -base64 32
```

## Step 4: Start Services

```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d

# Wait a few seconds for services to start
sleep 5
```

## Step 5: Set Up Database

```bash
# Run database migrations
pnpm db:migrate

# (Optional) Seed database with test data
pnpm db:seed
```

## Step 6: Start Development Servers

```bash
# Start all services in development mode
pnpm dev

# Or start individually:
# pnpm dev:web          # Next.js app
# pnpm dev:signaling    # Signaling server
```

## Step 7: Open in Browser

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Verification Checklist

- [ ] Services are running (check Docker containers)
- [ ] Database connection works
- [ ] Redis connection works
- [ ] Clerk authentication loads
- [ ] Can create an account
- [ ] Can log in
- [ ] WebSocket connection established

## Troubleshooting

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker ps

# Check logs
docker-compose logs postgres

# Restart services
docker-compose restart
```

### Port Already in Use

```bash
# Change PORT in .env file
PORT=3001
```

### Clerk Authentication Issues

- Verify API keys are correct
- Check Clerk dashboard for webhook configuration
- Ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set

### WebSocket Connection Failed

- Verify signaling server is running
- Check `SIGNALING_SERVER_URL` in .env
- Check browser console for errors

## Railway Deployment (Production)

### Quick Deploy to Railway

1. **Install Railway CLI**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Create Railway Project**
   ```bash
   railway init
   railway link
   ```

3. **Add Services**
   - Add PostgreSQL database
   - Add Redis cache
   - Deploy web app service
   - Deploy signaling server service

4. **Set Environment Variables**
   - Use Railway dashboard or CLI
   - Reference database URLs: `${{Postgres.DATABASE_URL}}`
   - Add Clerk keys and other secrets

5. **Deploy**
   ```bash
   railway up
   ```

See [Deployment Guide](./DEPLOYMENT.md) for detailed Railway setup instructions.

## Next Steps

1. Read the [Architecture Documentation](./ARCHITECTURE.md)
2. Explore the [Features](./FEATURES.md)
3. Review the [Tech Stack](./TECH_STACK.md)
4. Check [Deployment Guide](./DEPLOYMENT.md) for Railway production setup

## Development Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:web          # Start web app only
pnpm dev:signaling    # Start signaling server only

# Database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed database
pnpm db:studio        # Open Prisma Studio

# Testing
pnpm test             # Run tests
pnpm test:watch       # Watch mode
pnpm test:e2e         # E2E tests

# Building
pnpm build            # Build all packages
pnpm build:web        # Build web app

# Linting
pnpm lint             # Run linter
pnpm lint:fix         # Fix linting issues

# Type checking
pnpm typecheck        # Check TypeScript types
```

## Project Structure

```
p2p4everything/
├── apps/
│   └── web/              # Next.js application
├── packages/
│   ├── sdk/              # Shared SDK
│   ├── crypto/           # Encryption utilities
│   └── types/            # Shared types
├── services/
│   └── signaling/        # WebSocket server
└── prisma/               # Database schema
```

## Getting Help

- Check [Documentation](./README.md)
- Search [Issues](https://github.com/yourusername/p2p4everything/issues)
- Join our community (if available)

Happy coding! 🚀

