#!/bin/bash
set -e

if [ "$RUN_MIGRATIONS" = "1" ]; then
  echo "Running migrations..."
  alembic upgrade head
fi

echo "Starting server with 1 worker (RaceEngine isolation)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
