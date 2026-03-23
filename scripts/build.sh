#!/usr/bin/env bash

set -e

export NODE_OPTIONS='--max-old-space-size=1536'
mastra build
cp scripts/production-wrapper.mjs .mastra/output/production-wrapper.mjs
cp scripts/seed-production.mjs .mastra/output/seed-production.mjs
echo "Build complete. Wrapper and seed copied."
