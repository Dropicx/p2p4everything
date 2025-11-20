# Deployment Guide

## Overview

This guide covers deployment strategies for p2p4everything, focusing on scalability, ease of setup, and cost-effectiveness.

## Recommended Hosting Setup

### Option 1: Railway (Recommended - All-in-One)

**Best for**: Quick start, automatic scaling, managed services, unified platform

#### Architecture
```
┌─────────────────────────────────────┐
│            Railway Platform          │
│  ┌──────────────┐  ┌──────────────┐ │
│  │  Next.js App │  │  Signaling   │ │
│  │  (Web App)   │  │   Server     │ │
│  └──────┬───────┘  └──────┬───────┘ │
│         │                 │          │
│  ┌──────▼───────┐  ┌──────▼───────┐ │
│  │  PostgreSQL  │  │    Redis     │ │
│  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────┘
         │
    ┌────▼────────┐
    │   Clerk     │  (External Auth Service)
    │   (Auth)    │
    └─────────────┘
```

#### Setup Steps

1. **Railway Setup**
   - Create account at [railway.app](https://railway.app)
   - Create new project
   - Connect your GitHub repository (or deploy from CLI)
   - Railway will auto-detect your project structure

2. **Add Services to Railway Project**
   
   **PostgreSQL Database:**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway automatically creates `DATABASE_URL` environment variable
   - Note the connection string for local development

   **Redis Cache:**
   - Click "New" → "Database" → "Add Redis"
   - Railway automatically creates `REDIS_URL` environment variable

   **Next.js Web App:**
   - Click "New" → "GitHub Repo" (or "Empty Service")
   - Select your repository
   - Railway auto-detects Next.js and sets up build
   - Set root directory to `apps/web` (if using monorepo)
   - Configure build command: `pnpm build` or `npm run build`
   - Configure start command: `pnpm start` or `npm start`

   **Signaling Server:**
   - Click "New" → "GitHub Repo" (or "Empty Service")
   - Select your repository
   - Set root directory to `services/signaling` (if using monorepo)
   - Configure build command: `pnpm build` or `npm run build`
   - Configure start command: `pnpm start` or `npm start`

3. **Clerk Setup**
   - Create account at [clerk.com](https://clerk.com)
   - Create a new application
   - Configure OAuth providers (optional)
   - Get API keys:
     - Publishable Key (`pk_...`)
     - Secret Key (`sk_...`)

4. **Configure Environment Variables in Railway**
   
   For **Next.js Web App** service:
   ```env
   NODE_ENV=production
   PORT=3000
   NEXT_PUBLIC_APP_URL=https://your-app.railway.app
   
   # Database (use Railway's DATABASE_URL reference)
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   
   # Redis (use Railway's REDIS_URL reference)
   REDIS_URL=${{Redis.REDIS_URL}}
   
   # Clerk Authentication
   CLERK_PUBLISHABLE_KEY=pk_live_...
   CLERK_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
   
   # WebRTC Signaling
   NEXT_PUBLIC_SIGNALING_SERVER_URL=wss://your-signaling.railway.app
   
   # Encryption
   ENCRYPTION_KEY=your-32-character-encryption-key
   JWT_SECRET=your-jwt-secret-key
   ```
   
   For **Signaling Server** service:
   ```env
   NODE_ENV=production
   PORT=3001
   
   # Database (use Railway's DATABASE_URL reference)
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   
   # Redis (use Railway's REDIS_URL reference)
   REDIS_URL=${{Redis.REDIS_URL}}
   
   # Clerk Authentication
   CLERK_SECRET_KEY=sk_live_...
   
   # Encryption
   JWT_SECRET=your-jwt-secret-key
   ```

5. **Configure Custom Domains (Optional)**
   - In Railway, go to your service settings
   - Click "Settings" → "Networking"
   - Add custom domain (e.g., `app.yourdomain.com`)
   - Railway provides SSL certificates automatically

6. **Deploy**
   - Railway automatically deploys on every push to main branch
   - Or deploy manually via Railway dashboard
   - Or use Railway CLI: `railway up`

#### Railway CLI Deployment (Alternative)

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
```

#### Costs (Estimated)
- Railway: 
  - Free tier: $5 credit/month
  - Hobby plan: ~$5-20/month (PostgreSQL + Redis + 2 services)
  - Pro plan: ~$20-50/month (with more resources)
- Clerk: Free tier or $25/month (pro)
- **Total**: ~$0-50/month for small to medium scale

#### Benefits of Railway
- ✅ All services in one platform
- ✅ Automatic SSL certificates
- ✅ Easy environment variable management
- ✅ Built-in PostgreSQL and Redis
- ✅ Automatic deployments from GitHub
- ✅ Simple scaling
- ✅ Great developer experience
- ✅ Generous free tier

### Option 2: Self-Hosted (Docker Compose)

**Best for**: Full control, cost optimization, on-premise

#### Architecture
```
┌─────────────────────────────────────┐
│         Docker Compose              │
│  ┌──────────┐  ┌──────────┐        │
│  │  Next.js │  │Signaling │        │
│  │   App    │  │  Server  │        │
│  └────┬─────┘  └────┬─────┘        │
│       │             │               │
│  ┌────▼─────┐  ┌───▼──────┐        │
│  │PostgreSQL│  │  Redis   │        │
│  └──────────┘  └──────────┘        │
└─────────────────────────────────────┘
```

#### Setup Steps

1. **Server Requirements**
   - Ubuntu 22.04 LTS or similar
   - 2+ CPU cores
   - 4GB+ RAM
   - 20GB+ storage
   - Docker & Docker Compose installed

2. **Deploy**
   ```bash
   git clone <repo>
   cd p2p4everything
   cp .env.example .env
   # Edit .env with your values
   docker-compose up -d
   ```

3. **Reverse Proxy (Nginx)**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

#### Costs
- VPS: $5-20/month (DigitalOcean, Linode, Hetzner)
- Domain: $10-15/year
- **Total**: ~$5-20/month

### Option 3: Kubernetes (Production Scale)

**Best for**: Large scale, high availability, enterprise

#### Architecture
```
┌─────────────────────────────────────┐
│      Kubernetes Cluster             │
│  ┌──────────┐  ┌──────────┐        │
│  │  Ingress │  │  Service │        │
│  │ (Nginx)  │  │  Mesh    │        │
│  └────┬─────┘  └────┬─────┘        │
│       │             │               │
│  ┌────▼─────┐  ┌───▼──────┐        │
│  │  Next.js │  │Signaling │        │
│  │   Pods   │  │  Pods    │        │
│  └────┬─────┘  └────┬─────┘        │
│       │             │               │
│  ┌────▼─────┐  ┌───▼──────┐        │
│  │PostgreSQL│  │  Redis   │        │
│  │  Stateful│  │  Cache   │        │
│  └──────────┘  └──────────┘        │
└─────────────────────────────────────┘
```

#### Setup
- Use managed Kubernetes (GKE, EKS, AKS)
- Or self-hosted with k3s/k0s
- Helm charts for deployment
- Auto-scaling configured

## Database Setup

### PostgreSQL Configuration

#### Development (Local)
```bash
# Using Docker
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=p2p4everything \
  -p 5432:5432 \
  postgres:15
```

#### Production (Railway/Supabase/Neon)

**Railway:**
- Create PostgreSQL service
- Get connection string
- Run migrations: `npx prisma migrate deploy`

**Supabase:**
- Create project
- Use connection pooler for better performance
- Enable Row Level Security (RLS) if needed

**Neon:**
- Create project
- Serverless PostgreSQL
- Automatic scaling
- Branching for dev/staging

#### Database Migrations
```bash
# Generate migration
npx prisma migrate dev --name init

# Apply to production
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### Redis Configuration

#### Development (Local)
```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### Production Options

**Upstash (Recommended)**
- Serverless Redis
- Global replication
- Free tier available
- REST API support

**Railway Redis**
- Managed Redis
- Simple setup
- Included in Railway plan

**Self-Hosted**
- Redis on VPS
- Redis Sentinel for HA
- Redis Cluster for scale

## Environment Variables

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis
REDIS_URL=redis://host:6379
# Or for Upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# Encryption
ENCRYPTION_KEY=... # For server-side encryption (if needed)
JWT_SECRET=... # For API authentication

# WebRTC Signaling
SIGNALING_SERVER_URL=wss://signaling.yourdomain.com

# Optional: File Storage
IPFS_GATEWAY_URL=https://ipfs.io/ipfs/
S3_BUCKET_NAME=... # If using S3
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Redis connection tested
- [ ] Clerk webhooks configured
- [ ] SSL certificates configured
- [ ] Domain DNS configured
- [ ] Error tracking (Sentry) configured
- [ ] Analytics configured
- [ ] Backup strategy in place

### Post-Deployment
- [ ] Health checks passing
- [ ] Database connections working
- [ ] Authentication flow tested
- [ ] WebRTC connections working
- [ ] File transfers tested
- [ ] Monitoring alerts configured
- [ ] Logs accessible
- [ ] Performance metrics baseline

## Scaling Strategy

### Horizontal Scaling

**Frontend/API (Railway)**
- Automatic scaling based on traffic
- Railway handles load balancing
- Can scale services independently
- Configure resource limits per service

**Signaling Server**
- Stateless design
- Multiple instances behind load balancer
- Redis pub/sub for coordination
- Sticky sessions for WebSocket

**Database**
- Read replicas for read-heavy workloads
- Connection pooling (PgBouncer)
- Query optimization
- Indexing strategy

### Vertical Scaling

- Upgrade database instance size
- Increase Redis memory
- Add more CPU/RAM to servers

### Caching Strategy

- Redis for session data
- Redis for presence/online status
- CDN for static assets
- Application-level caching

## Monitoring & Observability

### Application Monitoring

**Railway Metrics**
- Built-in metrics dashboard
- CPU, memory, and network usage
- Request logs and error tracking
- Real-time service health

**Sentry**
- Error tracking
- Performance monitoring
- Release tracking

**Uptime Monitoring**
- UptimeRobot (free tier)
- Pingdom
- StatusCake

### Infrastructure Monitoring

**Database**
- Query performance
- Connection pool usage
- Slow query logs

**Redis**
- Memory usage
- Hit/miss rates
- Connection count

**Server**
- CPU/Memory usage
- Disk I/O
- Network traffic

## Backup Strategy

### Database Backups

**Automated Backups**
- Daily automated backups
- Point-in-time recovery
- Backup retention (30 days)

**Manual Backups**
```bash
pg_dump -h host -U user -d database > backup.sql
```

### Redis Backups
- RDB snapshots
- AOF persistence
- Regular exports

### Application Backups
- Environment variables backup
- Configuration files
- SSL certificates

## Security Considerations

### SSL/TLS
- HTTPS everywhere
- HSTS headers
- Certificate auto-renewal (Let's Encrypt)

### Database Security
- Encrypted connections
- Strong passwords
- IP whitelisting (if possible)
- Regular security updates

### Application Security
- Environment variables secured
- No secrets in code
- Rate limiting
- CORS configuration
- Content Security Policy

## Cost Optimization

### Development/Staging
- Use free tiers where possible
- Smaller instance sizes
- Shared resources

### Production
- Right-size instances
- Use reserved instances (if applicable)
- Monitor and optimize queries
- Cache aggressively
- Use CDN for static assets

## Disaster Recovery

### Recovery Plan
1. Database restore procedure
2. Application rollback process
3. DNS failover (if applicable)
4. Communication plan

### RTO/RPO Targets
- RTO (Recovery Time Objective): < 1 hour
- RPO (Recovery Point Objective): < 15 minutes

## Quick Start Commands

```bash
# Local development
docker-compose up -d
npm run dev

# Production deployment (Railway)
railway up
# Or push to main branch for auto-deploy

# Database migration (run in Railway service or locally)
npx prisma migrate deploy

# Health check
curl https://your-app.railway.app/api/health
```

## Support & Troubleshooting

### Common Issues

**Database Connection Errors**
- Check connection string
- Verify network access
- Check firewall rules

**WebSocket Connection Issues**
- Verify signaling server URL
- Check CORS configuration
- Verify SSL certificates

**Performance Issues**
- Check database query performance
- Monitor Redis usage
- Review application logs
- Check CDN cache hit rates

