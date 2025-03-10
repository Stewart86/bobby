#!/bin/bash

# Bobby Bot Multi-Instance Deployment Script
# This script deploys Bobby Bot Docker containers for multiple users/organizations

set -e

# Check if an env file was provided
if [ -z "$1" ]; then
  echo "Usage: ./deploy-bobby.sh <config-file.env> [container-name]"
  echo ""
  echo "Examples:"
  echo "  ./deploy-bobby.sh team1.env              # Creates container named bobby-team1"
  echo "  ./deploy-bobby.sh team1.env custom-name  # Creates container named custom-name"
  exit 1
fi

# Get env file path
ENV_FILE="$1"

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Config file $ENV_FILE not found"
  exit 1
fi

# Verify the env file has required variables
echo "Verifying configuration file..."
MISSING_VARS=""
for var in DISCORD_TOKEN ANTHROPIC_API_KEY GH_TOKEN GITHUB_REPO; do
  if ! grep -q "^$var=" "$ENV_FILE"; then
    MISSING_VARS="$MISSING_VARS $var"
  fi
done

if [ -n "$MISSING_VARS" ]; then
  echo "Error: Missing required variables in $ENV_FILE:$MISSING_VARS"
  echo "Please update the config file to include all required variables."
  exit 1
fi

# Extract container name
if [ -z "$2" ]; then
  # Use filename without extension as container name
  CONTAINER_NAME="bobby-$(basename "$ENV_FILE" .env)"
else
  CONTAINER_NAME="$2"
fi

echo "=== Deploying Bobby Bot ==="
echo "Configuration: $ENV_FILE"
echo "Container name: $CONTAINER_NAME"

# Check if the bobby-bot image exists
if ! docker image inspect bobby-bot >/dev/null 2>&1; then
  echo "Building bobby-bot image..."
  docker build -t bobby-bot .
fi

# Check if a container with this name already exists
if docker ps -a | grep -q "$CONTAINER_NAME"; then
  echo "Warning: Container $CONTAINER_NAME already exists"
  read -p "Do you want to stop and remove it? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Stopping and removing existing container..."
    docker stop "$CONTAINER_NAME" || true
    docker rm "$CONTAINER_NAME" || true
  else
    echo "Deployment aborted"
    exit 1
  fi
fi

# Deploy the container
echo "Deploying new container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -v "${CONTAINER_NAME}-docs:/app/docs" \
  -v "${CONTAINER_NAME}-db:/app/bobby.sqlite" \
  bobby-bot

echo ""
echo "=== Deployment Complete ==="
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop the container: docker stop $CONTAINER_NAME"
echo "To start the container: docker start $CONTAINER_NAME"
echo "To remove the container: docker rm $CONTAINER_NAME"