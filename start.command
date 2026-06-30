#!/bin/bash
# Move to the directory containing this script
cd "$(dirname "$0")"

echo "===================================================="
echo "🚀 Launching XYZ Sales Outreach Command Center..."
echo "===================================================="
echo ""
echo "[1/2] Opening your web browser..."
open http://localhost:8000
echo ""
echo "[2/2] Starting the local web server..."
echo "(Keep this window open while using the application)"
echo ""
python3 -m http.server 8000
