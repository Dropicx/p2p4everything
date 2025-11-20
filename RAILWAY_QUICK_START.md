# Railway Quick Start Guide

Get your app deployed on Railway in 10 minutes!

## 🎯 What's Already Configured

Your repository is ready for Railway deployment:

✅ **railway.json** - Build and deploy configuration  
✅ **.nvmrc** - Node.js 20 specified  
✅ **package.json** - Build scripts configured  
✅ **Migration scripts** - Database setup ready  

## 🚀 Deployment Steps

### 1. Create Railway Project (2 min)

1. Go to [railway.app](https://railway.app) → Sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `p2p4everything` repository
4. Railway auto-creates a service

### 2. Add Database (1 min)

1. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway auto-generates `DATABASE_URL`

### 3. Set Environment Variables (3 min)

Go to your service → **Variables** tab → Add these:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

**Important:** Replace `Postgres` with your actual database service name!

### 4. Get Clerk Keys (2 min)

1. Go to [clerk.com](https://clerk.com) → Dashboard
2. Create application (if needed)
3. Copy **Publishable Key** and **Secret Key**
4. Add to Railway variables

### 5. Generate Domain & Configure Webhook (2 min)

1. Service → **Settings** → **Networking** → **"Generate Domain"**
2. Copy the domain (e.g., `your-app.up.railway.app`)
3. Go to Clerk → **Webhooks** → **"Add Endpoint"**
4. URL: `https://your-app.up.railway.app/api/webhooks/clerk`
5. Events: `user.created`, `user.updated`, `user.deleted`
6. Copy **Signing Secret** → Add to Railway as `CLERK_WEBHOOK_SECRET`

### 6. Run Migrations (1 min)

After first deployment, run:

```bash
# Install Railway CLI (one time)
npm i -g @railway/cli

# Login and link
railway login
railway link

# Run migrations
railway run npx prisma migrate deploy
```

### 7. Verify (1 min)

1. Visit your Railway domain
2. Test sign-up/sign-in
3. Check dashboard loads

## ✅ Done!

Your app is now live on Railway with automatic deployments!

## 📚 Need More Details?

- **Full Guide**: See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)
- **Checklist**: See [RAILWAY_CHECKLIST.md](./RAILWAY_CHECKLIST.md)
- **Environment Variables**: See [RAILWAY_ENV.md](./RAILWAY_ENV.md)

## 🔄 Automatic Deployments

Railway automatically deploys when you push to `main`:

```bash
git push origin main
```

Railway will:
1. Detect the push
2. Build your app (`npm run build`)
3. Deploy automatically
4. Restart the service

## 🆘 Troubleshooting

**Build fails?**
- Check build logs in Railway dashboard
- Verify all environment variables are set

**Service won't start?**
- Check start logs
- Verify `DATABASE_URL` is correct
- Ensure port is `3000`

**Database errors?**
- Run migrations: `railway run npx prisma migrate deploy`
- Verify `DATABASE_URL` uses correct service name

## 📞 Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

