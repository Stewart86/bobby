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
  git pull
  cd /app
fi

# Create a symlink to the repo in home directory for Claude to access
ln -sf /app/repo ~/repo

# Ensure Claude CLI doesn't require onboarding
if [ -f ~/.claude.json ]; then
  echo "Setting hasCompletedOnboarding to true in ~/.claude.json"
  sed -i 's/"hasCompletedOnboarding": false/"hasCompletedOnboarding": true/g' ~/.claude.json
else
  echo "Creating ~/.claude.json with hasCompletedOnboarding set to true"
  echo '{"hasCompletedOnboarding": true}' > ~/.claude.json
fi

# Ensure needed directories exist
mkdir -p /app/docs
mkdir -p /app/data

# Make sure SQLite database is accessible
if [ -f "/app/data/bobby.sqlite" ]; then
  echo "Ensuring SQLite database is writable..."
  chmod 666 /app/data/bobby.sqlite
else
  echo "Creating new SQLite database file..."
  touch /app/data/bobby.sqlite
  chmod 666 /app/data/bobby.sqlite
fi

# Setup CLAUDE.md if it doesn't exist
if [ ! -f "/app/CLAUDE.md" ]; then
  echo "# Bobby Memory Index

This file maintains references to Bobby's memory documents stored in the docs/ directory.

## Memory Access Instructions

- Read documents from the docs/ directory to retrieve stored information
- Store new information in topic-specific markdown files in the docs/ directory
- Update this index when creating new documents

## Memory Index

- No memories stored yet" > /app/CLAUDE.md
  echo "Created CLAUDE.md file for memory index"
fi

echo "Bobby initialization complete!"
echo "Starting Bobby Discord Bot..."

exec "$@"