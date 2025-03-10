# Bobby - Discord AI Assistant Bot

Bobby is a Discord chatbot that helps answer questions about your codebase, file bugs, and translate business requirements into technical requirements. Bobby leverages Claude Code to understand your codebase and provide intelligent responses.

## Features

- **AI-Powered Responses**: Uses Claude Code to answer questions about your codebase
- **Bug Detection**: Automatically creates GitHub issues when bugs are detected
- **Memory Management**: Stores responses in a searchable, topic-organized format
- **Rate Limiting**: Prevents abuse with SQLite-based rate limiting
- **Easy Deployment**: Docker support for simple deployment

## Prerequisites

- [Bun](https://bun.sh/) runtime for local development
- [Discord Bot Token](https://discord.com/developers/applications) (see setup instructions below)
- [Anthropic API Key](https://anthropic.com) for Claude (see setup instructions below)
- [GitHub Personal Access Token](https://github.com/settings/tokens) with repo and issue scopes
- GitHub repository name in the format `owner/repo-name`

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

4. Install Claude Code CLI:
   - After obtaining your API key, set it as an environment variable:
     ```bash
     export ANTHROPIC_API_KEY=your_api_key_here
     ```
   - Use Bun to install Claude Code CLI:
     ```bash
     bun install -g @anthropic-ai/claude-code
     ```

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

### Local Development

1. Install dependencies:
   ```bash
   bun install
   ```

2. Install Claude Code CLI:
   ```bash
   bun install -g @anthropic-ai/claude-code
   ```

3. Install GitHub CLI and authenticate:
   ```bash
   # Install GitHub CLI (follow instructions for your OS)
   # https://github.com/cli/cli#installation
   
   # Authenticate with your token
   echo $GH_TOKEN | gh auth login --with-token
   ```

4. Start the development server:
   ```bash
   bun run dev
   ```

### Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t bobby-bot .
   ```

2. Run the container:
   ```bash
   docker run -d \
     --name bobby \
     -e DISCORD_TOKEN=your_discord_bot_token \
     -e ANTHROPIC_API_KEY=your_anthropic_api_key \
     -e GH_TOKEN=your_github_personal_access_token \
     -e GITHUB_REPO=owner/repo-name \
     -v bobby-docs:/app/docs \
     -v bobby-db:/app/bobby.sqlite \
     bobby-bot
   ```

   The container will automatically authenticate with GitHub using your GH_TOKEN before starting the bot.

## Usage

1. Invite the bot to your Discord server
2. Mention "Bobby" in your message followed by your question
   ```
   Hey Bobby, what's the authentication flow in our app?
   ```
3. Bobby will respond with an answer based on your codebase
4. If Bobby detects a bug, it will automatically create a GitHub issue

## Public Bot Deployment

If you're offering Bobby as a service to multiple users or organizations, consider these options for secure configuration management:

### 1. Self-Hosted Web Portal

Create a simple secure web interface where users can:
- Enter their own API keys and tokens
- Select GitHub repositories they want to monitor
- Configure Discord servers to connect to

Store configurations securely:
- Use encrypted database storage with proper authentication
- Implement a multi-tenant architecture with separate instances
- Never expose API keys in logs or client-side code

### 2. Configuration File Wizard

Create a secure configuration wizard script:

```javascript
// config-wizard.js
import { prompt } from 'bun:prompt';
import { write, file } from 'bun';
import { randomBytes, createCipheriv } from 'crypto';

async function configWizard() {
  console.log('Bobby Bot Configuration Wizard');
  
  // Get encryption password
  const password = await prompt('Enter a secure password to encrypt your configuration:', { password: true });
  
  // Collect credentials
  const config = {
    DISCORD_TOKEN: await prompt('Enter your Discord Bot Token:'),
    ANTHROPIC_API_KEY: await prompt('Enter your Anthropic API Key:'),
    GH_TOKEN: await prompt('Enter your GitHub Personal Access Token:'),
    GITHUB_REPO: await prompt('Enter your GitHub Repository (owner/repo-name):')
  };
  
  // Encrypt and save configuration
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', password.substr(0, 32).padEnd(32, '0'), iv);
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  await write('bobby-config.enc', JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted
  }));
  
  console.log('Configuration saved to bobby-config.enc');
  console.log('To start Bobby, run: bun run --env-file-path bobby-config.enc index.js');
}

configWizard();
```

### 3. Multi-Container Deployment

For running multiple instances, create a deployment script:

```bash
#!/bin/bash
# deploy-bobby.sh

if [ -z "$1" ]; then
  echo "Usage: ./deploy-bobby.sh <config-file.env>"
  exit 1
fi

# Extract organization name from config filename
ORG_NAME=$(basename "$1" .env)

# Run container with organization-specific config and volumes
docker run -d \
  --name "bobby-${ORG_NAME}" \
  --env-file "$1" \
  -v "bobby-${ORG_NAME}-docs:/app/docs" \
  -v "bobby-${ORG_NAME}-db:/app/bobby.sqlite" \
  bobby-bot
```

This allows each organization to use their own:
- API keys and tokens
- Memory storage (docs/)
- Rate limiting database

## Project Structure

```
bobby/
├── index.js           # Main application file
├── docs/              # Memory storage directory
├── CLAUDE.md          # Memory index for Claude
├── bobby.sqlite       # Rate limiting database
├── package.json       # Dependency management
├── entrypoint.sh      # Docker container initialization script
├── deploy-bobby.sh    # Multi-instance deployment script
├── config-wizard.js   # Configuration setup wizard
├── Dockerfile         # Docker configuration
└── README.md          # Documentation
```

## Memory Management

Bobby stores information in Markdown files in the `docs/` directory, organized by topic. The `CLAUDE.md` file serves as an index to these memory files, helping Claude find relevant information.

## Rate Limiting

Bobby implements rate limiting to prevent abuse:
- 20 requests per user per hour
- Limits are stored in SQLite database

## License

MIT