# Bobby - Discord AI Assistant Bot

Bobby is a Discord chatbot that helps answer questions about your codebase, file bugs, and translate business requirements into technical requirements. Bobby leverages Claude Code to understand your codebase and provide intelligent responses.

## Quick Start with Docker

Get Bobby running in under 1 minute:

```bash
# Run Bobby with your credentials (pre-built image from Docker Hub)
docker run -d \
  --name bobby \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -e ANTHROPIC_API_KEY=your_anthropic_api_key \
  -e GH_TOKEN=your_github_personal_access_token \
  -e GITHUB_REPO=owner/repo-name \
  -v bobby-data:/app/data \
  stewart86/bobby:latest
```

That's it! Bobby will automatically:

- Install and configure Claude Code CLI
- Authenticate with GitHub
- Clone your repository
- Start monitoring Discord for mentions

**Privacy & Security**: You create your own Discord bot and run Bobby in your own isolated Docker container. Your code, conversations, and API keys never leave your environment.

## Features

- **AI-Powered Responses**: Uses Claude Code to answer questions about your codebase
- **Bug Detection**: Automatically creates GitHub issues when bugs are detected
- **Thread-Based Sessions**: Each conversation maintains context in Discord threads
- **Read-Only Design**: Analyzes code without making changes
- **Privacy-First**: Your own Discord bot and isolated Docker container
- **Easy Deployment**: Complete Docker support with automated setup

## How It Works

Bobby uses Discord threads for session management:

1. **Start a conversation**: Mention Bobby in any channel to create a new thread
2. **Continue chatting**: Type in the thread (no need to mention Bobby again)
3. **Each thread maintains context**: Bobby remembers your conversation history
4. **Auto-organization**: Threads are named based on your questions

Bobby can:

- ✅ Analyze and explore your codebase
- ✅ Answer questions about code functionality
- ✅ Detect bugs and create GitHub issues
- ✅ Provide code recommendations
- ❌ Cannot modify or write code files (read-only by design)

**Why Self-Host Bobby?**

- 🔒 **Complete Privacy**: Your code never leaves your infrastructure
- 🏠 **Your Own Bot**: Create and control your own Discord bot
- 🐳 **Isolated Environment**: Runs in your own Docker container
- 🔑 **Your API Keys**: Direct relationship with Anthropic and GitHub
- 🛡️ **Zero Trust**: No third-party services handling your sensitive data

## Prerequisites

- [Discord Bot Token](https://discord.com/developers/applications) (see setup instructions below)
- [Anthropic API Key](https://anthropic.com) for Claude (see setup instructions below)
- [GitHub Personal Access Token](https://github.com/settings/tokens) with repo and issue scopes
- GitHub repository name in the format `owner/repo-name`
- [Bun](https://bun.sh/) runtime (for local development only)

## Discord Bot Setup

### Creating a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give your bot a name (e.g., "Bobby")
3. Go to the "Bot" tab and click "Add Bot"
4. Configure your bot settings:
   - Set the bot's username and avatar
   - In the "Privileged Gateway Intents" section, enable:
     - **Message Content Intent** (required to read message content)
     - **Server Members Intent**
     - **Presence Intent**
   - **IMPORTANT**: Under "Authorization Flow", disable the "Public Bot" toggle to make your bot private
   - Save your changes

### Getting Your Bot Token

1. In the Bot tab, under the "Token" section, click "Reset Token"
2. Copy the token that appears (this is your `DISCORD_TOKEN`)
3. **IMPORTANT**: Keep this token secure and never share it publicly!

### Adding Bot to Your Server

1. Go to the "OAuth2" > "URL Generator" tab
2. Select the following scopes:
   - `bot`
   - `applications.commands`
3. In the Bot Permissions section, select:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
   - Use Slash Commands
   - Add Reactions
4. Copy the generated URL and open it in your browser
5. Select the server you want to add the bot to and follow the prompts
6. Authorize the bot with the selected permissions

### Getting Your Server ID

To get your Discord server ID (needed for the server whitelist):

1.  Enable Developer Mode:

    - Open Discord and go to User Settings (gear icon)
    - Navigate to App Settings > Advanced
    - Toggle on Developer Mode

2.  Get the Server ID:
    - Right-click on your server icon in the left sidebar
    - Select "Copy ID" from the menu
    - The server ID is now in your clipboard

### Securing Your Bot (Important)

To keep your bot private and prevent unauthorized access:

1. **Disable Public Bot Setting**: In the Discord Developer Portal under the "Bot" tab, make sure "Public Bot" is disabled. This prevents anyone with your client ID from adding the bot to their server.

2. **Server Whitelist**: Bobby automatically implements server whitelisting when you provide the `ALLOWED_DISCORD_SERVERS` environment variable with comma-separated server IDs.

3. **Use Environment Variables**: Bobby automatically handles server whitelisting via the `ALLOWED_DISCORD_SERVERS` environment variable.

4. **Use Minimal Permissions**: Only request the permissions your bot actually needs to function.

5. **Regularly Audit Servers**: Periodically check which servers your bot has joined and remove it from any unauthorized ones.

## Anthropic API Key Setup

1. Create an Anthropic account:

   - Go to [Anthropic's website](https://www.anthropic.com)
   - Click "Sign Up" and follow the prompts to create an account

2. Access the API Console:

   - Log in to your Anthropic account
   - Navigate to the API Console section

3. Generate an API Key:

   - In the API Console, locate the "API Keys" section
   - Click "Create New API Key"
   - Give your key a descriptive name (e.g., "Bobby Bot")
   - Copy and securely store the generated API key immediately (this is your `ANTHROPIC_API_KEY`)
   - **IMPORTANT**: This key will not be shown again and grants access to paid API usage

**Note**: When using Docker (recommended), the Claude Code CLI is automatically installed and configured. Manual installation is only needed for local development.

## GitHub Personal Access Token Setup

1. Go to [GitHub's Personal Access Tokens page](https://github.com/settings/tokens)
2. Click "Generate new token" > "Generate new token (classic)"
3. Give your token a descriptive name (e.g., "Bobby Bot")
4. Set an expiration date (or select "No expiration" for persistent use)
5. Select the following scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (if your repositories are within an organization)
6. Click "Generate token"
7. Copy and securely store the generated token (this is your `GH_TOKEN`)
   - **IMPORTANT**: This token will not be shown again and grants access to your repositories

## Setup

### Environment Variables

Create a `.env` file with the following variables:

```
DISCORD_TOKEN=your_discord_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
GH_TOKEN=your_github_personal_access_token
GITHUB_REPO=owner/repo-name
```

### Local Development (Optional)

**Note**: Docker deployment is recommended. Local development requires additional setup:

1. Install dependencies: `bun install`
2. Install Claude Code CLI: `bun install -g @anthropic-ai/claude-code`
3. Install and authenticate GitHub CLI
4. Start development server: `bun run dev`

For detailed local setup, see the Docker option above which handles all dependencies automatically.

### Docker Deployment

**Option 1: Pre-built Image (Recommended)**

Use the official pre-built image from Docker Hub:

```bash
docker run -d \
  --name bobby \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -e ANTHROPIC_API_KEY=your_anthropic_api_key \
  -e GH_TOKEN=your_github_personal_access_token \
  -e GITHUB_REPO=owner/repo-name \
  -e ALLOWED_DISCORD_SERVERS=123456789012345678,987654321098765432 \
  -v bobby-data:/app/data \
  stewart86/bobby:latest
```

**Option 2: Build from Source**

If you want to build from source or make modifications:

```bash
# 1. Clone the repository
git clone https://github.com/Stewart86/bobby.git
cd bobby

# 2. Build the Docker image
docker build -t bobby-bot .

# 3. Run the container
docker run -d \
  --name bobby \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -e ANTHROPIC_API_KEY=your_anthropic_api_key \
  -e GH_TOKEN=your_github_personal_access_token \
  -e GITHUB_REPO=owner/repo-name \
  -e ALLOWED_DISCORD_SERVERS=123456789012345678,987654321098765432 \
  -v bobby-data:/app/data \
  bobby-bot
```

The container will automatically authenticate with GitHub using your GH_TOKEN before starting the bot.

**Security Note**: The `ALLOWED_DISCORD_SERVERS` environment variable controls which Discord servers can use your bot. If not specified, all servers will be allowed (not recommended for production).

## Usage

1. Invite the bot to your Discord server
2. Mention Bobby (@Bobby) in your message followed by your question
   ```
   @Bobby what's the authentication flow in our app?
   ```
3. Bobby will respond with an answer based on your codebase
4. If Bobby detects a bug, it will automatically create a GitHub issue

## Multi-Instance Deployment

To run Bobby for multiple repositories or organizations, use separate containers:

```bash
# Deploy for different repositories
docker run -d --name bobby-repo1 \
  -e GITHUB_REPO=org/repo1 \
  [other env vars] \
  -v bobby-repo1-data:/app/data \
  stewart86/bobby:latest

docker run -d --name bobby-repo2 \
  -e GITHUB_REPO=org/repo2 \
  [other env vars] \
  -v bobby-repo2-data:/app/data \
  stewart86/bobby:latest
```

Each instance maintains separate data storage and session management.

## Docker Hub

Bobby is automatically published to Docker Hub with every release:

- **Repository**: [`stewart86/bobby`](https://hub.docker.com/r/stewart86/bobby)
- **Latest stable**: `stewart86/bobby:latest`
- **Specific versions**: `stewart86/bobby:v1.0.0`

### Automated Publishing

GitHub Actions automatically builds and publishes Docker images:

- ✅ **On every commit to main**: Updates `latest` tag
- ✅ **On version tags**: Creates versioned releases (e.g., `v1.0.0`)
- ✅ **Multi-platform support**: Built for `linux/amd64`
- ✅ **Description sync**: README automatically synced to Docker Hub

## Project Structure

```
bobby/
├── index.js           # Main application file
├── CLAUDE.md          # Claude Code instructions and memory index
├── package.json       # Dependencies and scripts
├── entrypoint.sh      # Docker container initialization script
├── Dockerfile         # Docker configuration
├── CONTRIBUTING.md    # Contribution guidelines
├── LICENSE            # MIT license
├── .env.example       # Environment variables template
├── .github/           # GitHub Actions workflows
│   └── workflows/
│       └── docker-publish.yml
└── README.md          # Documentation
```

## Contributing

Bobby is built with modern JavaScript and Bun runtime. Key components:

- **Discord.js**: Handles Discord bot interactions and thread management
- **Claude Code CLI**: Powers AI analysis of codebases
- **GitHub CLI**: Creates issues automatically when bugs are detected
- **Bun**: Fast JavaScript runtime for better performance

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines, code architecture, and how to contribute to the project.

## Memory Management

Bobby uses the `CLAUDE.md` file for storing project instructions and context that helps Claude understand the codebase and provide better responses during conversations.

## Troubleshooting

### Claude API Authentication Issues

If you encounter authentication errors with Claude, this is a known issue tracked in the [Claude Code repository](https://github.com/anthropics/claude-code/issues).

**Error symptoms:**

- Bobby fails to start with Claude authentication errors
- API key authentication failures in container logs

**Workaround:**

1. Access the running Docker container:

   ```bash
   docker exec -it bobby /bin/sh
   ```

2. Manually authenticate Claude Code CLI:

   ```bash
   claude
   # Follow the interactive prompts to authenticate
   ```

3. Exit the container - Bobby should now work properly:
   ```bash
   exit
   ```

This issue typically resolves itself once Claude Code CLI is manually authenticated within the container environment.

## License

MIT License - see [LICENSE](LICENSE) file for details.
