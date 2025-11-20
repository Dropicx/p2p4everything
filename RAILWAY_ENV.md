# Railway Environment Variables

This document lists all environment variables needed for Railway deployment.

## Web App Service

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://your-app.railway.app

# Database (reference Railway PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (reference Railway Redis service)
REDIS_URL=${{Redis.REDIS_URL}}

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# Clerk Webhook
CLERK_WEBHOOK_SECRET=whsec_...

# WebRTC Signaling
NEXT_PUBLIC_SIGNALING_SERVER_URL=wss://your-signaling.railway.app

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
JWT_SECRET=your-jwt-secret-key
```

## Signaling Server Service

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3001

# Database (reference Railway PostgreSQL service)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (reference Railway Redis service)
REDIS_URL=${{Redis.REDIS_URL}}

# Clerk Authentication (for future auth middleware)
CLERK_SECRET_KEY=sk_live_...

# Encryption
JWT_SECRET=your-jwt-secret-key
```

## How to Set Variables in Railway

1. Go to your Railway project
2. Select the service (Web App or Signaling Server)
3. Click on "Variables" tab
4. Click "New Variable"
5. Add key-value pairs
6. Use `${{ServiceName.VARIABLE}}` syntax to reference other services

## Railway Variable References

Railway allows you to reference variables from other services:

- `${{Postgres.DATABASE_URL}}` - PostgreSQL connection string
- `${{Redis.REDIS_URL}}` - Redis connection string
- `${{ServiceName.RAILWAY_PUBLIC_DOMAIN}}` - Public domain of a service

## Generating Secrets

### Encryption Key (32 characters)
```bash
openssl rand -hex 16
```

### JWT Secret
```bash
openssl rand -base64 32
```

## Clerk Setup

1. Go to [clerk.com](https://clerk.com)
2. Create a new application
3. Get your API keys from the dashboard
4. Set up webhook endpoint: `https://your-app.railway.app/api/webhooks/clerk`
5. Copy the webhook secret to `CLERK_WEBHOOK_SECRET`

