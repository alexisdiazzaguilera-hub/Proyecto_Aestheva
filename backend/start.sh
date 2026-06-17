#!/bin/sh
set -e
echo "Arrancando servidor..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
