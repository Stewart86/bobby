FROM oven/bun:latest

WORKDIR /app

# Install git and download GitHub CLI binary
RUN apt-get update && \
    apt-get install -y git curl && \
    curl -fsSL https://github.com/cli/cli/releases/download/v2.61.0/gh_2.61.0_linux_amd64.tar.gz | \
    tar -xz -C /tmp && \
    mv /tmp/gh_*/bin/gh /usr/local/bin/ && \
    rm -rf /tmp/gh_* && \
    apt-get remove -y curl && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN bun install -g @anthropic-ai/claude-code
RUN git config --global pull.rebase true

COPY . .

ENV NODE_ENV=production
RUN bun install --production

RUN chmod +x /app/entrypoint.sh

RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV CLAUDE_CONFIG_DIR=/app/data

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "run", "index.js"]
