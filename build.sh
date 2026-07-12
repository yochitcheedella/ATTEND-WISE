#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

echo "Installing Node dependencies..."
npm install

echo "Building Frontend via Vite..."
npm run build

echo "Build complete!"
