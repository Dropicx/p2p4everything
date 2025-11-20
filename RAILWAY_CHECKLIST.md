# Railway Deployment Checklist

Use this checklist to ensure your Railway deployment is complete and working.

## Pre-Deployment

- [ ] Repository is pushed to GitHub
- [ ] All code is committed and pushed to `main` branch
- [ ] Railway account created and logged in
- [ ] Clerk account created and application set up

## Railway Project Setup

- [ ] Created new Railway project
- [ ] Connected GitHub repository
- [ ] Added PostgreSQL database service
- [ ] Added Redis service (optional)
- [ ] Web app service created automatically

## Environment Variables

### Required Variables

- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `DATABASE_URL=${{Postgres.DATABASE_URL}}` (with correct service name)
- [ ] `CLERK_PUBLISHABLE_KEY` (from Clerk dashboard)
- [ ] `CLERK_SECRET_KEY` (from Clerk dashboard)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (same as CLERK_PUBLISHABLE_KEY)
- [ ] `CLERK_WEBHOOK_SECRET` (from Clerk webhook settings)

### Optional Variables

- [ ] `REDIS_URL=${{Redis.REDIS_URL}}` (if using Redis)
- [ ] `NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}`
- [ ] `ENCRYPTION_KEY` (generated)
- [ ] `JWT_SECRET` (generated)
- [ ] `NEXT_PUBLIC_SIGNALING_SERVER_URL` (if deploying signaling server)

## Clerk Configuration

- [ ] Clerk application created
- [ ] API keys obtained (Publishable and Secret)
- [ ] Railway domain generated
- [ ] Clerk webhook endpoint configured:
  - [ ] URL: `https://your-app.railway.app/api/webhooks/clerk`
  - [ ] Events selected: `user.created`, `user.updated`, `user.deleted`
  - [ ] Webhook secret copied to Railway variables

## Database Setup

- [ ] First deployment completed
- [ ] Database migrations run:
  - [ ] Option A: Using Railway CLI (`railway run npx prisma migrate deploy`)
  - [ ] Option B: Using service shell
  - [ ] Option C: One-time migration service
- [ ] Verified migrations succeeded
- [ ] Database connection tested

## Deployment Verification

- [ ] Service is running (check Railway dashboard)
- [ ] Health check endpoint works: `/api/health`
- [ ] Application loads in browser
- [ ] No errors in Railway logs
- [ ] Database connection successful

## Functionality Testing

- [ ] Can access home page
- [ ] Can access sign-in page
- [ ] Can access sign-up page
- [ ] Can create new account (Clerk)
- [ ] Can sign in
- [ ] Redirects to dashboard after sign-in
- [ ] Dashboard loads correctly
- [ ] User data synced to database (check via Prisma Studio or Railway shell)
- [ ] Can access devices page
- [ ] Can access settings page

## Post-Deployment

- [ ] Custom domain configured (optional)
- [ ] SSL certificate active (automatic with Railway)
- [ ] Monitoring set up (Railway provides basic monitoring)
- [ ] Alerts configured (optional)
- [ ] Documentation updated with production URLs

## Troubleshooting Checklist

If something isn't working:

- [ ] Check Railway service logs
- [ ] Verify all environment variables are set
- [ ] Check database connection (verify DATABASE_URL)
- [ ] Verify Clerk webhook is receiving events
- [ ] Check if migrations ran successfully
- [ ] Verify Node.js version (should be 20)
- [ ] Check build logs for errors
- [ ] Verify port configuration (should be 3000)

## Quick Commands

```bash
# Railway CLI - Login and link
railway login
railway link

# Run migrations
railway run npx prisma migrate deploy

# View logs
railway logs

# Open shell
railway shell

# Check variables
railway variables
```

## Next Steps After Deployment

- [ ] Set up staging environment (optional)
- [ ] Configure custom domain
- [ ] Set up CI/CD pipeline
- [ ] Configure backups
- [ ] Set up monitoring and alerts
- [ ] Deploy signaling server (if needed)

