#!/bin/bash
set -e

echo "Testing FastAPI Backend /health..."
curl -s http://localhost:8006/health | grep -q "healthy" && echo "[OK] /health is healthy"

echo "Testing FastAPI Backend /api/readiness..."
curl -s http://localhost:8006/api/readiness | grep -q '"ready":true' && echo "[OK] /api/readiness is ready"

echo "Testing FastAPI Backend /schedule..."
curl -s http://localhost:8006/schedule | grep -q "next_update_at" && echo "[OK] /schedule returns data"

echo "Testing Next.js /api/schedule proxy..."
curl -s http://localhost:3000/api/schedule | grep -q "next_update_at" && echo "[OK] Next.js /api/schedule proxy works"

echo "Testing FastAPI Backend Historical Prices (Cannonball)..."
RES=$(curl -s http://localhost:8006/api/prices/historical/2)
if echo "$RES" | grep -q "timestamps"; then
    echo "[OK] Backend historical prices returned data"
else
    echo "[FAIL] Backend historical prices failed: $RES"
    exit 1
fi

echo "Testing Next.js Analytics Proxy (Cannonball)..."
RES2=$(curl -s http://localhost:3000/api/analytics/history/2)
if echo "$RES2" | grep -q "timestamps"; then
    echo "[OK] Next.js Analytics Proxy returned data"
else
    echo "[FAIL] Next.js Analytics Proxy failed: $RES2"
    exit 1
fi

echo "All tests passed successfully!"
