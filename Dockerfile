FROM ghcr.io/cli/cli:latest AS gh-cli
FROM alpine/git:latest AS git-alpine
FROM oven/bun:latest

WORKDIR /app

# Copy GitHub CLI and git from official images
COPY --from=gh-cli /usr/local/bin/gh /usr/local/bin/gh
COPY --from=git-alpine /usr/bin/git /usr/local/bin/git

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
