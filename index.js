#!/usr/bin/env bun

/**
 * Bobby - Discord ChatBot for answering questions with Claude Code
 * Integrates with Discord, Claude Code, and GitHub for issue creation
 */

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Database } from 'bun:sqlite';
import { spawn } from 'bun';
import { promises as fs } from 'fs';
import path from 'path';

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN environment variable is not set');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
  process.exit(1);
}

if (!GITHUB_REPO) {
  console.error('Error: GITHUB_REPO environment variable is not set');
  process.exit(1);
}

if (!process.env.GH_TOKEN) {
  console.error('Error: GH_TOKEN environment variable is not set');
  process.exit(1);
}

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize SQLite database for rate limiting
const DB_PATH = path.join(process.cwd(), 'bobby.sqlite');
console.log(`Opening SQLite database at: ${DB_PATH}`);

// Set up database connection
let db;
try {
  db = new Database(DB_PATH);
  console.log("Successfully opened SQLite database file");
} catch (err) {
  console.error(`Failed to open SQLite database: ${err.message}`);
  console.error(`Database path: ${DB_PATH}`);
  console.error(`Error code: ${err.code}, errno: ${err.errno}`);
  
  // Create an in-memory database as fallback
  console.log("Falling back to in-memory SQLite database");
  db = new Database(":memory:");
  console.log("In-memory database created successfully");
}

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    user_id TEXT PRIMARY KEY,
    last_request INTEGER,
    request_count INTEGER
  )
`);

// Memory management (docs directory)
const DOCS_DIR = path.join(process.cwd(), 'docs');
const CLAUDE_MD_PATH = path.join(process.cwd(), 'CLAUDE.md');

// Initialize claude.md if it doesn't exist
async function initClaudeMd() {
  try {
    await fs.access(CLAUDE_MD_PATH);
  } catch (err) {
    // File doesn't exist, create it
    await fs.writeFile(
      CLAUDE_MD_PATH,
      '# Bobby Memory Index\n\n' +
      'This file maintains references to Bobby\'s memory documents stored in the docs/ directory.\n\n' +
      '## Memory Access Instructions\n\n' +
      '- Read documents from the docs/ directory to retrieve stored information\n' +
      '- Store new information in topic-specific markdown files in the docs/ directory\n' +
      '- Update this index when creating new documents\n\n' +
      '## Memory Index\n\n' +
      '- No memories stored yet\n'
    );
  }
}

// Check rate limits for a user
function checkRateLimit(userId) {
  const now = Date.now();
  const rateLimit = db.query('SELECT * FROM rate_limits WHERE user_id = ?').get(userId);
  
  // If user doesn't exist in rate limits table or it's been more than 1 hour
  if (!rateLimit || (now - rateLimit.last_request) > 3600000) {
    db.run(
      'INSERT OR REPLACE INTO rate_limits (user_id, last_request, request_count) VALUES (?, ?, ?)',
      [userId, now, 1]
    );
    return true;
  }
  
  // If user has made fewer than 20 requests in the last hour
  if (rateLimit.request_count < 20) {
    db.run(
      'UPDATE rate_limits SET last_request = ?, request_count = ? WHERE user_id = ?',
      [now, rateLimit.request_count + 1, userId]
    );
    return true;
  }
  
  return false;
}

// Save response to memory
async function saveToMemory(query, response, topic) {
  // Clean the topic to create a valid filename
  const safeFilename = topic.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filePath = path.join(DOCS_DIR, `${safeFilename}.md`);
  
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      // File exists, append to it
      const content = await fs.readFile(filePath, 'utf8');
      const updatedContent = `${content}\n\n## Query: ${query}\n\n${response}\n\n---\n`;
      await fs.writeFile(filePath, updatedContent);
    } catch (err) {
      // File doesn't exist, create it
      const content = `# ${topic}\n\n## Query: ${query}\n\n${response}\n\n---\n`;
      await fs.writeFile(filePath, content);
      
      // Update CLAUDE.md index
      const claudeMd = await fs.readFile(CLAUDE_MD_PATH, 'utf8');
      const updatedClaudeMd = claudeMd.replace(
        '- No memories stored yet',
        `- [${topic}](docs/${safeFilename}.md)`
      );
      await fs.writeFile(CLAUDE_MD_PATH, updatedClaudeMd);
    }
    
    return true;
  } catch (err) {
    console.error('Error saving to memory:', err);
    return false;
  }
}

// Process query with Claude Code
async function processWithClaude(query) {
  try {
    // Prompt for Claude to both answer the query and analyze for bugs
    const prompt = `
Question from user: "${query}"

Please answer this question based on the codebase. 

If you identify that there might be a bug or issue in the code related to this question, 
please do the following after answering the user's question:

1. Determine if there's a genuine bug or issue that warrants creating a GitHub issue
2. If a bug exists, use the GitHub CLI (gh) to create a detailed issue in the repository ${GITHUB_REPO}

When creating an issue, please:
- Use a clear, descriptive title
- Include a detailed description with:
  - Summary of the problem
  - Technical details about the issue
  - Steps to reproduce if applicable
  - Potential solutions if known
  - Impact on functionality
- Add labels: "bug" and "bobby-detected"
- Mention that it was detected by Bobby (Claude Code)

Your response to the user should focus on answering their question clearly. Only create an issue if 
you're confident there's a genuine bug that needs attention.
`;
    
    // Execute claude code CLI using Bun.spawn
    const proc = spawn(['claude', '-p', prompt], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    
    if (exitCode !== 0 || stderr) {
      console.error('Claude Code error:', stderr);
      return { success: false, response: 'Error processing with Claude Code.' };
    }
    
    // Check if the response mentions creating a GitHub issue
    const createdIssueMatch = stdout.match(/created (an? )?issue|issue created|created github issue/i);
    const isBugDetected = createdIssueMatch !== null;
    
    // Format response to exclude GitHub issue creation details if present
    let userResponse = stdout;
    if (isBugDetected) {
      // Simple heuristic to try to extract just the user-facing answer part
      // Looking for markers that might indicate the start of issue creation
      const issueCreationMarkers = [
        "I've identified a bug",
        "I've created an issue",
        "I'll create a GitHub issue",
        "Creating a GitHub issue",
        "I'll file an issue",
        "Based on my analysis, there's a bug"
      ];
      
      for (const marker of issueCreationMarkers) {
        const markerIndex = userResponse.indexOf(marker);
        if (markerIndex > 0) {
          // Add a note about issue creation but remove the details
          userResponse = userResponse.substring(0, markerIndex) + 
            "\n\n---\n\nI've identified a bug related to this and created a GitHub issue to track it.";
          break;
        }
      }
    }
    
    return { 
      success: true, 
      response: userResponse, 
      isBug: isBugDetected 
    };
  } catch (error) {
    console.error('Error processing with Claude:', error);
    return { success: false, response: 'Error processing your request.' };
  }
}

// Determine if a message is calling for Bobby
function isCallingBobby(content) {
  const lowerContent = content.toLowerCase();
  return lowerContent.includes('bobby') || lowerContent.includes('@bobby');
}

// Extract query from message
function extractQuery(content) {
  // Remove "bobby" or "@bobby" from the message
  return content.replace(/bobby|@bobby/gi, '').trim();
}

// Discord client ready event
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Initialize CLAUDE.md
  await initClaudeMd();
  
  console.log('Bobby is now ready to answer queries!');
});

// Security: Handle joining a new server (guild)
client.on('guildCreate', async (guild) => {
  // List of allowed server IDs - read from environment variable if available
  // Format: comma-separated list of server IDs (e.g. "123456789,987654321")
  const allowedServersEnv = process.env.ALLOWED_DISCORD_SERVERS || '';
  const allowedServers = allowedServersEnv.split(',').filter(id => id.trim() !== '');
  
  // If no allowed servers are specified, accept all servers (for development)
  if (allowedServers.length === 0) {
    console.log(`Joined server: ${guild.name} (${guild.id})`);
    console.log('Warning: No allowed servers configured. Set ALLOWED_DISCORD_SERVERS env variable for production.');
    return;
  }
  
  // Check if the server is authorized
  if (!allowedServers.includes(guild.id)) {
    console.log(`Leaving unauthorized server: ${guild.name} (${guild.id})`);
    await guild.leave();
  } else {
    console.log(`Joined authorized server: ${guild.name} (${guild.id})`);
  }
});

// Discord message event
client.on(Events.MessageCreate, async message => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check if the message is calling for Bobby
  if (isCallingBobby(message.content)) {
    // Extract query
    const query = extractQuery(message.content);
    
    // Skip if query is empty
    if (!query) return;
    
    // Check rate limit
    if (!checkRateLimit(message.author.id)) {
      await message.reply('You have exceeded the rate limit. Please try again later.');
      return;
    }
    
    // Send typing indicator
    await message.channel.sendTyping();
    
    // Process query with Claude
    const { success, response, isBug } = await processWithClaude(query);
    
    if (success) {
      // Determine appropriate topic based on query
      const topic = isBug ? 'Bugs' : 'General Queries';
      
      // Save to memory
      await saveToMemory(query, response, topic);
      
      // Send response
      await message.reply(response);
    } else {
      await message.reply('Sorry, I encountered an error while processing your request.');
    }
  }
});

// Main function
async function main() {
  try {
    // Log in to Discord
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error('Error starting Bobby:', error);
    process.exit(1);
  }
}

// Start the bot
main();