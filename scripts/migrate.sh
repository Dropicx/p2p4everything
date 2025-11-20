#!/bin/bash
# Railway migration script
# This script runs database migrations on Railway deployment

set -e

echo "Running database migrations..."

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

echo "Migrations completed successfully!"

