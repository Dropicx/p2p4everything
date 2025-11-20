# Railway Setup Guide

Complete guide for deploying p2p4everything on Railway.

## Overview

Railway is our recommended hosting platform because it provides:
- All services in one place (web app, signaling server, databases)
- Automatic deployments from GitHub
- Built-in PostgreSQL and Redis
- SSL certificates included
- Simple environment variable management
- Great developer experience

## Architecture on Railway

```
Railway Project: p2p4everything
├── Service: Web App (Next.js)
│   ├── Port: 3000
│   └── Domain: app.railway.app (or custom)
│
├── Service: Signaling Server
│   ├── Port: 3001
│   └── Domain: signaling.railway.app (or custom)
│
├── Database: PostgreSQL
│   └── Auto-generated DATABASE_URL
│
└── Database: Redis
    └── Auto-generated REDIS_URL
```

## Step-by-Step Setup

### 1. Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended) or email
3. Verify your account

### 2. Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `p2p4everything` repository
4. Railway will create a new project

### 3. Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Railway automatically:
   - Creates the database
   - Generates `DATABASE_URL` environment variable
   - Makes it available to all services

### 4. Add Redis Cache

1. Click "New" again
2. Select "Database" → "Add Redis"
3. Railway automatically:
   - Creates Redis instance
   - Generates `REDIS_URL` environment variable
   - Makes it available to all services

### 5. Deploy Next.js Web App

1. Click "New" → "GitHub Repo"
2. Select your `p2p4everything` repository
3. Railway will detect it's a Next.js app
4. Configure the service:
   - **Name**: `web-app` (or `p2p4everything-web`)
   - **Root Directory**: `apps/web` (if monorepo) or `.` (if single app)
   - **Build Command**: `pnpm build` or `npm run build`
   - **Start Command**: `pnpm start` or `npm start`
   - **Port**: `3000` (Railway auto-detects)

5. Railway will automatically:
   - Install dependencies
   - Build the application
   - Deploy it
   - Generate a public URL

### 6. Deploy Signaling Server

1. Click "New" → "GitHub Repo"
2. Select your `p2p4everything` repository again
3. Configure the service:
   - **Name**: `signaling-server`
   - **Root Directory**: `services/signaling`
   - **Build Command**: `pnpm build` or `npm run build`
   - **Start Command**: `pnpm start` or `npm start`
   - **Port**: `3001`

### 7. Configure Environment Variables

#### For Web App Service

Go to the web app service → "Variables" tab:

```env
# Application
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# Database (reference Railway's PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (reference Railway's Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# WebRTC Signaling
NEXT_PUBLIC_SIGNALING_SERVER_URL=wss://${{Signaling.RAILWAY_PUBLIC_DOMAIN}}

# Encryption
ENCRYPTION_KEY=your-32-character-key
JWT_SECRET=your-jwt-secret
```

#### For Signaling Server Service

Go to the signaling server service → "Variables" tab:

```env
# Application
NODE_ENV=production
PORT=3001

# Database (reference Railway's PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (reference Railway's Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_...

# Encryption
JWT_SECRET=your-jwt-secret
```

**Note**: Railway's `${{ServiceName.VARIABLE}}` syntax allows you to reference variables from other services.

### 8. Set Up Clerk

1. Go to [clerk.com](https://clerk.com)
2. Create a new application
3. Configure authentication methods:
   - Email/Password
   - OAuth providers (Google, GitHub, etc.)
4. Get your API keys:
   - Publishable Key (`pk_live_...` or `pk_test_...`)
   - Secret Key (`sk_live_...` or `sk_test_...`)
5. Configure webhooks (optional):
   - Webhook URL: `https://your-app.railway.app/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`

### 9. Configure Custom Domains (Optional)

#### For Web App

1. Go to web app service → "Settings" → "Networking"
2. Click "Generate Domain" or "Add Custom Domain"
3. For custom domain:
   - Add your domain (e.g., `app.yourdomain.com`)
   - Add CNAME record in your DNS:
     ```
     app.yourdomain.com → your-app.railway.app
     ```
4. Railway automatically provisions SSL certificate

#### For Signaling Server

1. Go to signaling server service → "Settings" → "Networking"
2. Add custom domain (e.g., `signaling.yourdomain.com`)
3. Update `NEXT_PUBLIC_SIGNALING_SERVER_URL` in web app to use custom domain

### 10. Run Database Migrations

You can run migrations in several ways:

#### Option A: Railway Service Shell

1. Go to web app service
2. Click "Deployments" → Latest deployment → "View Logs"
3. Or use Railway CLI:
   ```bash
   railway run --service web-app npx prisma migrate deploy
   ```

#### Option B: Local Connection

1. Get database connection string from Railway
2. Run locally:
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

#### Option C: One-Time Migration Service

1. Create a temporary service in Railway
2. Use a script that runs migrations and exits
3. Delete the service after migration completes

### 11. Verify Deployment

1. **Check Service Health**
   - Visit your web app URL
   - Should see the application loading

2. **Check Database Connection**
   - Check Railway logs for database connection errors
   - Verify migrations ran successfully

3. **Test Authentication**
   - Try signing up/logging in
   - Verify Clerk integration works

4. **Test WebSocket**
   - Open browser console
   - Check for WebSocket connection to signaling server

## Railway CLI Setup (Alternative)

If you prefer CLI over dashboard:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# Set environment variables
railway variables set CLERK_PUBLISHABLE_KEY=pk_live_...
railway variables set CLERK_SECRET_KEY=sk_live_...

# Deploy
railway up

# View logs
railway logs

# Open service shell
railway shell
```

## Environment Variable Management

### Using Railway Dashboard

1. Go to service → "Variables" tab
2. Click "New Variable"
3. Add key-value pairs
4. Variables are automatically available to the service

### Using Railway CLI

```bash
# Set variable
railway variables set KEY=value

# Get variable
railway variables get KEY

# List all variables
railway variables

# Delete variable
railway variables delete KEY
```

### Referencing Other Services

Railway allows referencing variables from other services:

```env
# Reference PostgreSQL database URL
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Reference Redis URL
REDIS_URL=${{Redis.REDIS_URL}}

# Reference another service's public domain
SIGNALING_URL=https://${{Signaling.RAILWAY_PUBLIC_DOMAIN}}
```

## Monitoring and Logs

### View Logs

1. **Dashboard**: Go to service → "Deployments" → Click deployment → "View Logs"
2. **CLI**: `railway logs --service web-app`

### Metrics

Railway provides built-in metrics:
- CPU usage
- Memory usage
- Network I/O
- Request count
- Error rate

Access via: Service → "Metrics" tab

## Scaling

### Vertical Scaling

1. Go to service → "Settings"
2. Adjust resource limits:
   - CPU: 0.5 vCPU to 8 vCPU
   - Memory: 512 MB to 16 GB

### Horizontal Scaling

Railway automatically handles:
- Load balancing
- Request distribution
- Health checks

For manual scaling, you can:
- Deploy multiple instances (future feature)
- Use Railway's auto-scaling (if available)

## Cost Management

### Free Tier

Railway provides:
- $5 credit per month
- Enough for small projects
- PostgreSQL and Redis included

### Hobby Plan (~$5-20/month)

- Pay-as-you-go pricing
- ~$0.000463 per GB-hour
- ~$0.000231 per GB of bandwidth
- PostgreSQL: ~$5/month
- Redis: ~$5/month

### Cost Optimization Tips

1. **Use Railway's free tier** for development
2. **Monitor usage** in Railway dashboard
3. **Set resource limits** to prevent overages
4. **Use Railway's sleep mode** for dev environments
5. **Optimize builds** to reduce build time

## Troubleshooting

### Service Won't Start

1. Check logs: `railway logs`
2. Verify environment variables are set
3. Check build logs for errors
4. Verify port configuration

### Database Connection Issues

1. Verify `DATABASE_URL` is set correctly
2. Check if database service is running
3. Verify network connectivity
4. Check database logs

### WebSocket Connection Failed

1. Verify signaling server URL is correct
2. Check if signaling server is running
3. Verify CORS configuration
4. Check Railway networking settings

### Build Failures

1. Check build logs in Railway
2. Verify build command is correct
3. Check for dependency issues
4. Verify Node.js version compatibility

## Best Practices

1. **Use Railway's variable references** instead of hardcoding
2. **Set up custom domains** for production
3. **Enable Railway's monitoring** for production
4. **Use separate projects** for dev/staging/prod
5. **Backup database** regularly (Railway provides backups)
6. **Monitor costs** in Railway dashboard
7. **Use Railway's sleep mode** for dev environments

## Next Steps

- Set up CI/CD with GitHub Actions
- Configure monitoring and alerts
- Set up staging environment
- Review [Deployment Guide](./DEPLOYMENT.md) for more details

