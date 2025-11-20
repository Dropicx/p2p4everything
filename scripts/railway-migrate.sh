#!/bin/bash
# Railway migration script
# This script runs database migrations on Railway deployment
# Can be run manually or as a one-time service

set -e

echo "🚀 Starting Railway database migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "✅ DATABASE_URL is set"

# Generate Prisma Client
echo "📦 Generating Prisma Client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Migrations completed successfully!"
echo "🎉 Database is ready!"

