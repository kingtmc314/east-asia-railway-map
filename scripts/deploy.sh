#!/bin/bash
# Deploy: GitHub (kingtmc314) + Vercel
set -euo pipefail

GITHUB_USER="kingtmc314"
REPO="east-asia-railway-map"
REMOTE="https://github.com/${GITHUB_USER}/${REPO}.git"

echo "GitHub: ${REMOTE}"
git remote set-url origin "$REMOTE"
git push -u origin main

npx vercel git connect "$REMOTE" --yes || true
npx vercel deploy --prod --yes

echo "Done: https://github.com/${GITHUB_USER}/${REPO}"
