#!/usr/bin/env bash
set -euo pipefail

# Install system dependencies required by Fintral backend.
# Run this with sudo on bare-metal / VM deployments.
# Docker deployments get these via the Dockerfile automatically.

echo "Installing Fintral system dependencies..."

# Tesseract OCR + Spanish language pack
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-spa \
    libpq5

echo "✅ System dependencies installed successfully"
echo ""
echo "Tesseract version: $(tesseract --version 2>&1 | head -1)"
echo "Languages: $(tesseract --list-langs 2>&1 | tail -n +2 | tr '\n' ' ')"
