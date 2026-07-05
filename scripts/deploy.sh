#!/bin/bash
# Deploy: GitHub (elitelearning-PRO) + Vercel
set -euo pipefail

GITHUB_USER="elitelearning-PRO"
REPO="east-asia-railway-map"
REMOTE="https://github.com/${GITHUB_USER}/${REPO}.git"

echo "GitHub: ${REMOTE}"
git remote set-url origin "$REMOTE"
git push -u origin main

npx vercel git connect "$REMOTE" --yes || true
npx vercel deploy --prod --yes

echo "Done: https://east-asia-railway-map-phi.vercel.app"
