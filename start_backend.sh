#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

export PYTHONPATH=.

echo "=================================================="
echo "🚀 Starting Agentic Reimbursement Python Backend"
echo "🌐 API URL: http://127.0.0.1:8000"
echo "📖 Swagger Docs: http://127.0.0.1:8000/docs"
echo "=================================================="

./venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
