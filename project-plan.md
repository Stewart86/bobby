# Bobby

Bobby is a Discord ChatBot that helps answer stakeholder questions, file bugs and features, and translate business requirements into technical requirements.
Bobby has access to the entire codebase, but favors reading documentation to answer user questions. When Bobby cannot find the answer in documentation or memory, he will dive deep into the codebase to find the answer.

## Technical Architecture

### Single Script Approach
- One main script handling Discord integration, Claude Code interaction, and memory management
- Modular code organization within the single file

## Technical Requirements

**Runtime**: `bun`
**Dependencies**: 
- `discord.js` - Discord bot integration
- Claude Code CLI - AI assistance
- `gh` CLI - GitHub issue management

## Setup & Deployment

### Development Environment
- Install Bun runtime
- Install Claude Code CLI via Bun: `bun install -g @anthropic-ai/claude-code`
- Set `ANTHROPIC_API_KEY` environment variable
- Install GitHub CLI

### Docker Deployment
- Dockerfile included for containerized deployment
- Multi-stage build for minimal image size
- Environment variables for configuration:
  - `DISCORD_TOKEN` - Discord bot authentication
  - `ANTHROPIC_API_KEY` - Claude API authentication
  - `GH_TOKEN` - GitHub Personal Access Token with appropriate repo and issue scopes
- Automatic GitHub CLI authentication using GH_TOKEN
- Access to private GitHub repositories via token
- Volume mount for persistent memory storage

### GitHub Integration
- Use Personal Access Token with limited scope permissions
- Authenticate GitHub CLI non-interactively: `echo $GH_TOKEN | gh auth login --with-token`
- Clone private repos using: `gh repo clone owner/repo-name`
- Set proper access scopes for issue creation

## Implementation Flow

### Discord Integration
- Initialize Discord bot with proper permissions
- Listen for messages that mention or call for Bobby
- Parse and process user queries

### Query Processing
- Use AI to determine if query refinement is needed before passing to Claude Code
- Execute `claude -p "prompt"` to query Claude Code
- Process and format Claude's response for Discord

### Memory Management
- Store relevant queries and responses for future reference
- Implement simple persistence mechanism

### GitHub Integration
- When a bug is detected, use GitHub CLI to file a detailed issue
- Format issues with proper labels, descriptions, and context
- Claude Code should NEVER modify any code directly

## Security Considerations
- Secure storage of API tokens and credentials
- Input validation and sanitization
- Rate limiting to prevent abuse
