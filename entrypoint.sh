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

# Ensure Claude can access needed directories
mkdir -p /app/docs

# Create empty SQLite database if it doesn't exist
touch /app/bobby.sqlite
chmod 666 /app/bobby.sqlite

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