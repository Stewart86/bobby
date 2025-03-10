# Multi-stage build for Bobby Discord Bot
FROM oven/bun:latest as builder

# Install GitHub CLI
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh

# Install Claude Code CLI
RUN bun install -g @anthropic-ai/claude-code

# Final stage
FROM oven/bun:latest

WORKDIR /app

# Install GitHub CLI and dependencies
RUN apt-get update && \
    apt-get install -y curl gnupg git && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code in the final image directly
RUN bun install -g @anthropic-ai/claude-code

# Copy all application files
COPY . .

# Install dependencies
RUN bun install --production

# Set required environment variables
ENV NODE_ENV=production

# Ensure entrypoint script is executable
RUN chmod +x /app/entrypoint.sh

# Create directory for persistent storage
RUN mkdir -p /app/docs && \
    mkdir -p /app/data && \
    chmod 777 /app/docs && \
    chmod 777 /app/data

# Volume for persistent storage
VOLUME ["/app/docs", "/app/data"]

# Required environment variables:
# - DISCORD_TOKEN: Discord bot token
# - ANTHROPIC_API_KEY: Claude API key
# - GH_TOKEN: GitHub personal access token with repo and issue scopes
# - GITHUB_REPO: GitHub repository in format "owner/repo-name"

# Use entrypoint script for full setup
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "run", "index.js"]