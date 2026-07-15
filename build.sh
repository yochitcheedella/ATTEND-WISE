#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

echo "Installing Node dependencies..."
npm install

echo "Building Frontend via Vite (production mode)..."
npx vite build --mode production

echo "Build complete!"
