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
COPY --from=builder /usr/bin/gh /usr/bin/gh
COPY --from=builder /usr/share/keyrings/githubcli-archive-keyring.gpg /usr/share/keyrings/
COPY --from=builder /etc/apt/sources.list.d/github-cli.list /etc/apt/sources.list.d/
RUN apt-get update && \
    apt-get install -y gh git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy Claude Code installation from builder
COPY --from=builder /root/.bun/bin/claude /usr/local/bin/claude

# Copy all application files
COPY . .

# Install dependencies
RUN bun install --production

# Set required environment variables
ENV NODE_ENV=production

# Ensure entrypoint script is executable
RUN chmod +x /app/entrypoint.sh

# Volume for persistent storage
VOLUME ["/app/docs", "/app/bobby.sqlite"]

# Required environment variables:
# - DISCORD_TOKEN: Discord bot token
# - ANTHROPIC_API_KEY: Claude API key
# - GH_TOKEN: GitHub personal access token with repo and issue scopes
# - GITHUB_REPO: GitHub repository in format "owner/repo-name"

# Use entrypoint script for full setup
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "run", "index.js"]