#!/bin/sh
set -e

# Check required environment variables
if [ -z "$DISCORD_TOKEN" ]; then
  echo "Error: DISCORD_TOKEN environment variable is not set"
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set"
  exit 1
fi

if [ -z "$GH_TOKEN" ]; then
  echo "Error: GH_TOKEN environment variable is not set"
  exit 1
fi

if [ -z "$GITHUB_REPO" ]; then
  echo "Error: GITHUB_REPO environment variable is not set"
  exit 1
fi

# Setup GitHub authentication
echo "Authenticating with GitHub..."
echo "$GH_TOKEN" | gh auth login --with-token || true
echo "GitHub authentication completed, continuing startup..."

# Clone the target repository
if [ ! -d "/app/repo" ]; then
  echo "Cloning target repository: $GITHUB_REPO..."
  mkdir -p /app/repo
  gh repo clone "$GITHUB_REPO" /app/repo
else
  echo "Repository directory exists, pulling latest changes..."
  cd /app/repo
  git reset --hard
  git clean -fd
  git pull --rebase
  cd /app
fi

# Create a symlink to the repo in home directory for Claude to access
ln -sf /app/repo ~/repo

# Ensure needed directories exist
mkdir -p /app/docs
mkdir -p /app/data

echo "Bobby initialization complete!"
echo "Starting Bobby Discord Bot..."

exec "$@"
