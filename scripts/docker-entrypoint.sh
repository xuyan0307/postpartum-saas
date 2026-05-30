#!/bin/sh
set -e

mkdir -p /app/data

npx prisma generate
npx prisma db push --accept-data-loss
node scripts/seed-if-empty.mjs

npm run start
