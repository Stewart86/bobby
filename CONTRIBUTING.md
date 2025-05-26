# Contributing to Bobby

Thank you for your interest in contributing to Bobby! This document provides guidelines for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Architecture](#code-architecture)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Bug Reports](#bug-reports)
- [Feature Requests](#feature-requests)

## Getting Started

Bobby is a Discord bot that uses Claude Code to analyze codebases and answer questions. It's built with:

- **Bun**: Fast JavaScript runtime
- **Discord.js**: Discord bot framework
- **Claude Code CLI**: AI-powered code analysis
- **GitHub CLI**: Automated issue creation

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Discord Bot Token (see README.md for setup)
- Anthropic API Key
- GitHub Personal Access Token

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/bobby.git
   cd bobby
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Install required CLI tools**:
   ```bash
   # Install Claude Code CLI
   bun install -g @anthropic-ai/claude-code
   
   # Install GitHub CLI (platform specific)
   # See: https://github.com/cli/cli#installation
   ```

4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your tokens and configuration
   ```

5. **Run the development server**:
   ```bash
   bun run dev
   ```

### Docker Development

For testing the full Docker setup:

```bash
# Build the image
docker build -t bobby-bot .

# Run with your configuration
docker run --env-file .env bobby-bot
```

## Code Architecture

### Core Components

#### `index.js` - Main Application
- **Discord Client Setup**: Initializes Discord.js client with required intents
- **Message Handling**: Processes mentions and thread-based conversations
- **Session Management**: Manages Claude Code sessions per Discord thread
- **Streaming Responses**: Real-time response streaming from Claude Code

#### `entrypoint.sh` - Docker Initialization
- Environment validation
- GitHub authentication
- Repository cloning and syncing
- Service startup

### Key Functions

#### `processWithClaude(query, channel, sessionId)`
Handles the core interaction with Claude Code CLI:
- Spawns Claude Code process with streaming output
- Manages session continuity across thread conversations
- Processes real-time JSON responses
- Handles error cases and fallbacks

#### Thread Management
- `isNewBobbyCall()`: Detects new mentions in channels
- `isThreadFollowUp()`: Identifies follow-up messages in threads
- `extractSessionId()`: Extracts session ID from thread names
- Thread naming: `Bobby - Title - session-id`

#### Security Features
- Server whitelist validation (`guildCreate` event)
- Environment variable validation
- Token masking in logs

### Data Flow

1. **New Conversation**:
   ```
   User mentions Bobby → Create thread → Start new Claude session → Stream response → Update thread name
   ```

2. **Thread Follow-up**:
   ```
   User message in thread → Extract session ID → Resume Claude session → Stream response
   ```

3. **Bug Detection**:
   ```
   Claude detects issue → Creates GitHub issue → Returns issue link in response
   ```

## Contributing Guidelines

### Code Style

- Use modern JavaScript (ES6+)
- Follow existing formatting patterns
- Add comments for complex logic
- Use descriptive variable names

### Commit Messages

Use conventional commit format:
```
type(scope): description

feat(discord): add thread-based session management
fix(claude): handle streaming response edge cases
docs(readme): update Docker setup instructions
```

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Testing

- Test Discord bot functionality in a development server
- Verify Claude Code integration with different query types
- Test Docker deployment with environment variable variations
- Validate GitHub issue creation workflow

## Pull Request Process

1. **Fork the repository** and create your feature branch
2. **Make your changes** following the guidelines above
3. **Test thoroughly** - ensure no regressions
4. **Update documentation** if needed
5. **Submit a pull request** with:
   - Clear description of changes
   - Link to any related issues
   - Screenshots/demos for UI changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Tested locally
- [ ] Tested in Docker
- [ ] Discord integration verified
- [ ] Claude Code integration verified

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No sensitive information exposed
```

## Bug Reports

When reporting bugs, include:

1. **Environment details**:
   - Operating system
   - Bun version
   - Docker version (if applicable)

2. **Steps to reproduce**:
   - Exact Discord commands used
   - Expected vs actual behavior
   - Error messages or logs

3. **Configuration**:
   - Environment variables (without sensitive values)
   - Discord server setup
   - Repository configuration

## Feature Requests

For new features:

1. **Use case description**: Why is this feature needed?
2. **Proposed solution**: How should it work?
3. **Alternatives considered**: Other approaches you've thought about
4. **Implementation details**: Technical considerations (if applicable)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers learn and contribute
- Keep discussions relevant and professional

## Getting Help

- **Issues**: Create a GitHub issue for bugs or questions
- **Discussions**: Use GitHub Discussions for general questions
- **Discord**: Join our development Discord server (link in README)

## Security

If you find security vulnerabilities:

1. **DO NOT** create a public issue
2. Email security concerns to [security email]
3. Allow time for fixing before public disclosure

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- Special thanks for first-time contributors

Thank you for contributing to Bobby! 🤖