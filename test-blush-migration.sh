#!/bin/bash

echo "Testing migration of BLUSH model (ID: o8U54bIP)"
echo "============================================"

# Call the migration API directly
curl -X POST https://v0-new-furniture-live-git-aws-migration-v2-jl-1e02ddd7.vercel.app/api/migrate-single-model \
  -H "Content-Type: application/json" \
  -d '{"modelId": "o8U54bIP"}' \
  | python3 -m json.tool

echo ""
echo "Migration request sent!"