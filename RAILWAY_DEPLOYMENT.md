# Railway Deployment Guide

Complete step-by-step guide to deploy p2p4everything on Railway with automatic builds and deployments.

## 🚀 Quick Start

This guide will help you deploy your app to Railway with automatic deployments from GitHub.

## Prerequisites

- GitHub account with your repository
- Railway account (sign up at [railway.app](https://railway.app))
- Clerk account (for authentication)

## Step 1: Prepare Your Repository

Your repository is already configured for Railway! The following files are in place:

- ✅ `railway.json` - Railway build configuration
- ✅ `.nvmrc` - Node.js version specification (20)
- ✅ `package.json` - Build scripts configured
- ✅ Migration script ready

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account (if first time)
5. Select your `p2p4everything` repository
6. Railway will automatically create a new project

## Step 3: Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically:
   - Create a PostgreSQL database
   - Generate `DATABASE_URL` environment variable
   - Make it available to all services

**Note:** Railway will name the service something like "Postgres" - remember this name for variable references.

## Step 4: Add Redis (Optional but Recommended)

1. Click **"New"** again
2. Select **"Database"** → **"Add Redis"**
3. Railway will automatically create Redis and generate `REDIS_URL`

## Step 5: Configure Web App Service

Railway should have automatically created a service from your GitHub repo. If not:

1. Click **"New"** → **"GitHub Repo"**
2. Select your `p2p4everything` repository
3. Railway will detect it's a Next.js app

### Service Configuration

Railway should auto-detect:
- **Root Directory**: `.` (root)
- **Build Command**: `npm run build` (from railway.json)
- **Start Command**: `npm start` (from railway.json)
- **Port**: `3000` (auto-detected)

Verify these in: Service → **Settings** → **Deploy**

## Step 6: Set Up Clerk Authentication

1. Go to [clerk.com](https://clerk.com) and sign in
2. Create a new application (or use existing)
3. Get your API keys from **Dashboard** → **API Keys**:
   - **Publishable Key** (`pk_live_...` or `pk_test_...`)
   - **Secret Key** (`sk_live_...` or `sk_test_...`)

4. Set up webhook (we'll configure this after deployment):
   - Go to **Webhooks** in Clerk dashboard
   - Click **"Add Endpoint"**
   - We'll add the URL after we get the Railway domain

## Step 7: Configure Environment Variables

Go to your **Web App** service → **Variables** tab and add:

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000

# Database (reference Railway PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (if you added Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_live_... (or pk_test_...)
CLERK_SECRET_KEY=sk_live_... (or sk_test_...)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... (same as CLERK_PUBLISHABLE_KEY)

# Clerk Webhook (we'll update this after getting the domain)
CLERK_WEBHOOK_SECRET=whsec_... (from Clerk webhook settings)

# Application URL (will be set automatically, but you can override)
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

### Optional Variables

```env
# Encryption Keys (generate these)
ENCRYPTION_KEY=your-32-character-key
JWT_SECRET=your-jwt-secret

# Signaling Server (if deploying separately)
NEXT_PUBLIC_SIGNALING_SERVER_URL=wss://your-signaling.railway.app
```

### Generating Secrets

Run these commands locally to generate secure keys:

```bash
# Generate encryption key (32 characters)
openssl rand -hex 16

# Generate JWT secret
openssl rand -base64 32
```

### Railway Variable References

Railway uses `${{ServiceName.VARIABLE}}` syntax to reference other services:

- `${{Postgres.DATABASE_URL}}` - PostgreSQL connection (replace "Postgres" with your actual service name)
- `${{Redis.REDIS_URL}}` - Redis connection (if added)
- `${{RAILWAY_PUBLIC_DOMAIN}}` - Your service's public domain

**Important:** Replace "Postgres" and "Redis" with your actual service names from Railway!

## Step 8: Generate Public Domain

1. Go to your **Web App** service → **Settings** → **Networking**
2. Click **"Generate Domain"**
3. Railway will create a domain like: `your-app-name.up.railway.app`
4. Copy this domain - you'll need it for Clerk webhook

## Step 9: Configure Clerk Webhook

1. Go back to Clerk Dashboard → **Webhooks**
2. Click **"Add Endpoint"**
3. Enter your Railway domain: `https://your-app-name.up.railway.app/api/webhooks/clerk`
4. Select events to listen to:
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`
5. Click **"Create"**
6. Copy the **Signing Secret** (starts with `whsec_...`)
7. Go back to Railway → **Variables** → Add/Update:
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   ```

## Step 10: Run Database Migrations

After the first deployment, you need to run database migrations:

### Option A: Railway CLI (Recommended)

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login and link:
   ```bash
   railway login
   railway link
   ```

3. Run migrations:
   ```bash
   railway run npx prisma migrate deploy
   ```

### Option B: Railway Service Shell

1. Go to your service → **Deployments** → Latest deployment
2. Click **"View Logs"** or use the shell
3. Run:
   ```bash
   npx prisma migrate deploy
   ```

### Option C: One-Time Migration Service

1. Create a temporary service in Railway
2. Use the same GitHub repo
3. Set environment variables (especially `DATABASE_URL`)
4. Set start command to: `npx prisma migrate deploy && exit`
5. Deploy and wait for completion
6. Delete the service after migration

## Step 11: Verify Deployment

1. **Check Service Health**
   - Visit your Railway domain
   - Should see the app loading
   - Check `/api/health` endpoint

2. **Check Logs**
   - Go to service → **Deployments** → Latest → **View Logs**
   - Look for any errors

3. **Test Authentication**
   - Try signing up/logging in
   - Verify Clerk integration works
   - Check if user is created in database

4. **Test Database**
   - Verify migrations ran successfully
   - Check if you can access dashboard

## Step 12: Automatic Deployments

Railway automatically deploys when you push to your connected branch (usually `main`):

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Railway will:**
   - Detect the push
   - Start a new build
   - Run `npm install`
   - Run `npm run build` (which includes `prisma generate`)
   - Deploy the new version
   - Restart the service

3. **Monitor Deployments:**
   - Go to service → **Deployments**
   - See build progress in real-time
   - View logs for any issues

## Troubleshooting

### Build Fails

1. **Check Build Logs:**
   - Service → **Deployments** → Failed deployment → **View Logs**
   - Look for error messages

2. **Common Issues:**
   - Missing environment variables
   - Database connection issues
   - Prisma client not generated (should be automatic in build)

### Service Won't Start

1. **Check Start Logs:**
   - Service → **Deployments** → Latest → **View Logs**
   - Look for startup errors

2. **Verify:**
   - Port is set to `3000`
   - `DATABASE_URL` is correct
   - All required env vars are set

### Database Connection Errors

1. **Verify `DATABASE_URL`:**
   - Check it's set correctly
   - Use Railway's variable reference: `${{Postgres.DATABASE_URL}}`
   - Make sure service name matches

2. **Check Database Status:**
   - Go to PostgreSQL service
   - Verify it's running
   - Check connection logs

### Migrations Not Running

1. **Run Manually:**
   ```bash
   railway run npx prisma migrate deploy
   ```

2. **Check Prisma Schema:**
   - Verify `schema.prisma` is correct
   - Check migration files exist

### Clerk Webhook Not Working

1. **Verify Webhook URL:**
   - Check it matches your Railway domain
   - Must be `https://` (not `http://`)

2. **Check Webhook Secret:**
   - Verify `CLERK_WEBHOOK_SECRET` is set correctly
   - Must match Clerk dashboard

3. **Test Webhook:**
   - Create a test user in Clerk
   - Check Railway logs for webhook events
   - Check database for new user

## Environment-Specific Setup

### Development Environment

Create a separate Railway project for development:

1. Create new project: "p2p4everything-dev"
2. Use test Clerk keys (`pk_test_...`, `sk_test_...`)
3. Use separate database
4. Set `NODE_ENV=development`

### Production Environment

1. Use production Clerk keys (`pk_live_...`, `sk_live_...`)
2. Set `NODE_ENV=production`
3. Use custom domain (optional)
4. Enable monitoring and alerts

## Next Steps

- [ ] Set up custom domain
- [ ] Configure monitoring and alerts
- [ ] Set up staging environment
- [ ] Deploy signaling server (if needed)
- [ ] Set up CI/CD with GitHub Actions
- [ ] Configure backups

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Clerk Documentation](https://clerk.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)

## Support

If you encounter issues:
1. Check Railway logs
2. Check Clerk dashboard
3. Review this guide
4. Check [Railway Discord](https://discord.gg/railway) or [GitHub Issues](https://github.com/railwayapp/railway/issues)

