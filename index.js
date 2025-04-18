#!/usr/bin/env bun

/**
 * Bobby - Discord ChatBot for answering questions with Claude Code
 * Integrates with Discord, Claude Code, and GitHub for issue creation
 */

import { Client, Events, GatewayIntentBits } from "discord.js";
import { Database } from "bun:sqlite";
import { spawn } from "bun";
import { promises as fs } from "fs";
import path from "path";

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!DISCORD_TOKEN) {
  console.error("Error: DISCORD_TOKEN environment variable is not set");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
  process.exit(1);
}

if (!GITHUB_REPO) {
  console.error("Error: GITHUB_REPO environment variable is not set");
  process.exit(1);
}

if (!process.env.GH_TOKEN) {
  console.error("Error: GH_TOKEN environment variable is not set");
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
const DB_PATH = path.join(process.cwd(), "data", "bobby.sqlite");
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
const DOCS_DIR = path.join(process.cwd(), "docs");
const CLAUDE_MD_PATH = path.join(process.cwd(), "CLAUDE.md");

// Initialize claude.md if it doesn't exist
async function initClaudeMd() {
  try {
    await fs.access(CLAUDE_MD_PATH);
  } catch (err) {
    // File doesn't exist, create it
    await fs.writeFile(
      CLAUDE_MD_PATH,
      "# Bobby Memory Index\n\n" +
        "This file maintains references to Bobby's memory documents stored in the docs/ directory.\n\n" +
        "## Memory Access Instructions\n\n" +
        "- Read documents from the docs/ directory to retrieve stored information\n" +
        "- Store new information in topic-specific markdown files in the docs/ directory\n" +
        "- Update this index when creating new documents\n\n" +
        "## Memory Index\n\n" +
        "- No memories stored yet\n",
    );
  }
}

// Check rate limits for a user
function checkRateLimit(userId) {
  const now = Date.now();
  const rateLimit = db
    .query("SELECT * FROM rate_limits WHERE user_id = ?")
    .get(userId);

  // If user doesn't exist in rate limits table or it's been more than 1 hour
  if (!rateLimit || now - rateLimit.last_request > 3600000) {
    db.run(
      "INSERT OR REPLACE INTO rate_limits (user_id, last_request, request_count) VALUES (?, ?, ?)",
      [userId, now, 1],
    );
    return true;
  }

  // If user has made fewer than 20 requests in the last hour
  if (rateLimit.request_count < 20) {
    db.run(
      "UPDATE rate_limits SET last_request = ?, request_count = ? WHERE user_id = ?",
      [now, rateLimit.request_count + 1, userId],
    );
    return true;
  }

  return false;
}

// Save response to memory
async function saveToMemory(query, response, topic) {
  // Clean the topic to create a valid filename
  const safeFilename = topic.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const filePath = path.join(DOCS_DIR, `${safeFilename}.md`);

  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      // File exists, append to it
      const content = await fs.readFile(filePath, "utf8");
      const updatedContent = `${content}\n\n## Query: ${query}\n\n${response}\n\n---\n`;
      await fs.writeFile(filePath, updatedContent);
    } catch (err) {
      // File doesn't exist, create it
      const content = `# ${topic}\n\n## Query: ${query}\n\n${response}\n\n---\n`;
      await fs.writeFile(filePath, content);

      // Update CLAUDE.md index
      const claudeMd = await fs.readFile(CLAUDE_MD_PATH, "utf8");
      const updatedClaudeMd = claudeMd.replace(
        "- No memories stored yet",
        `- [${topic}](docs/${safeFilename}.md)`,
      );
      await fs.writeFile(CLAUDE_MD_PATH, updatedClaudeMd);
    }

    return true;
  } catch (err) {
    console.error("Error saving to memory:", err);
    return false;
  }
}

// Process query with Claude Code
async function processWithClaude(query) {
  console.log(`Beginning Claude processing for query: "${query}"`);

  try {
    // Prompt for Claude to both answer the query and analyze for bugs
    const prompt = `
${query}

Please follow these steps to answer the user's question:
1. always fetch the latest git changes before running any commands.
2. be sure to read from CLAUDE.md to access the memory / knowledge base. or under the docs/ directory for topic-specific information.
3. explore the code to understand the structure and implementation details.
4. update the memory with the response to this query in the appropriate topic into CLAUDE.md and docs/ folder.
5. Then provide a comprehensive and accurate answer to the question.

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

Your response to should focus on answering their question clearly. Only create an issue if 
you're confident there's a genuine bug that needs attention.

You DO NOT need to inform the user about updating the memory or koledge base, or docs/ directory.

`;

    console.log("Spawning Claude process with prompt...");
    console.log(
      `Running command in repo directory: cd /app/repo && claude --allowedTools "Bash,View,Read,Write,Edit,Search,GrepTool,GlobTool,LS" -p "${prompt.substring(0, 50)}..."`,
    );

    // Execute claude code CLI using Bun.spawn
    // Claude CLI expects proper argument ordering
    const proc = spawn(
      [
        "claude",
        "--allowedTools",
        "Bash,View,Read,Write,Edit,Search,GrepTool,GlobTool,LS",
        "-p",
        prompt,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: "/app/repo", // Run in the cloned repository directory
      },
    );

    console.log("Claude process spawned, waiting for response...");

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    console.log(`Claude process finished with exit code: ${exitCode}`);

    if (exitCode !== 0 || stderr) {
      console.error("Claude Code error:", stderr);
      console.log("Claude stderr output length:", stderr.length);
      console.log(
        "Claude stderr sample:",
        stderr.substring(0, 200) + (stderr.length > 200 ? "..." : ""),
      );
      return { success: false, response: "Error processing with Claude Code." };
    }

    console.log("Claude response received successfully");
    console.log("Claude stdout output length:", stdout.length);
    console.log(
      "Claude stdout sample:",
      stdout.substring(0, 200) + (stdout.length > 200 ? "..." : ""),
    );

    // Check if the response mentions creating a GitHub issue
    const createdIssueMatch = stdout.match(
      /created (an? )?issue|issue created|created github issue/i,
    );
    const isBugDetected = createdIssueMatch !== null;
    console.log(`Bug detected in Claude response: ${isBugDetected}`);

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
        "Based on my analysis, there's a bug",
      ];

      console.log("Processing bug detection markers...");
      for (const marker of issueCreationMarkers) {
        const markerIndex = userResponse.indexOf(marker);
        if (markerIndex > 0) {
          console.log(
            `Found issue marker: "${marker}" at position ${markerIndex}`,
          );
          // Add a note about issue creation but remove the details
          userResponse =
            userResponse.substring(0, markerIndex) +
            "\n\n---\n\nI've identified a bug related to this and created a GitHub issue to track it.";
          console.log("Trimmed response to remove issue creation details");
          break;
        }
      }
    }

    console.log("Claude processing complete, returning response");
    return {
      success: true,
      response: userResponse,
      isBug: isBugDetected,
    };
  } catch (error) {
    console.error("Error processing with Claude:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    return { success: false, response: "Error processing your request." };
  }
}

// Determine if a message is calling for Bobby
function isCallingBobby(content) {
  if (!content) {
    console.log("Message content is empty or undefined");
    return false;
  }

  const lowerContent = content.toLowerCase();
  const containsBobby = lowerContent.includes("bobby");
  const containsAtBobby = lowerContent.includes("@bobby");

  console.log(`Message content: "${content}"`);
  console.log(`Contains "bobby": ${containsBobby}`);
  console.log(`Contains "@bobby": ${containsAtBobby}`);

  return containsBobby || containsAtBobby;
}

// Extract query from message
function extractQuery(content) {
  if (!content) {
    console.log("Cannot extract query from empty content");
    return "";
  }

  // Remove "bobby" or "@bobby" from the message
  const result = content.replace(/bobby|@bobby/gi, "").trim();
  console.log(`Original content: "${content}"`);
  console.log(`Extracted query: "${result}"`);

  return result;
}

// Discord client ready event
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Client ID: ${client.user.id}`);
  console.log(
    "Client permissions:",
    client.user.permissions
      ? client.user.permissions.toArray()
      : "No permissions data",
  );
  console.log(`Connected to ${client.guilds.cache.size} servers`);

  // Log server info
  client.guilds.cache.forEach((guild) => {
    console.log(`Connected to server: ${guild.name} (${guild.id})`);
    console.log(`Server owner: ${guild.ownerId}`);
    console.log(`Member count: ${guild.memberCount}`);
  });

  // Initialize CLAUDE.md
  await initClaudeMd();

  console.log("Bobby is now ready to answer queries!");
});

// Security: Handle joining a new server (guild)
client.on("guildCreate", async (guild) => {
  // List of allowed server IDs - read from environment variable if available
  // Format: comma-separated list of server IDs (e.g. "123456789,987654321")
  const allowedServersEnv = process.env.ALLOWED_DISCORD_SERVERS || "";
  const allowedServers = allowedServersEnv
    .split(",")
    .filter((id) => id.trim() !== "");

  // If no allowed servers are specified, accept all servers (for development)
  if (allowedServers.length === 0) {
    console.log(`Joined server: ${guild.name} (${guild.id})`);
    console.log(
      "Warning: No allowed servers configured. Set ALLOWED_DISCORD_SERVERS env variable for production.",
    );
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
client.on(Events.MessageCreate, async (message) => {
  console.log(
    `Message received: "${message.content}" from ${message.author.username}`,
  );

  // Ignore messages from bots
  if (message.author.bot) {
    console.log("Ignoring message from bot");
    return;
  }

  // Check if the message is calling for Bobby
  const isCalling = isCallingBobby(message.content);
  console.log(`Is message calling Bobby? ${isCalling}`);

  if (isCalling) {
    // Extract query
    const query = extractQuery(message.content);
    console.log(`Extracted query: "${query}"`);

    // Skip if query is empty
    if (!query) {
      console.log("Query is empty, skipping");
      return;
    }

    try {
      // Array of possible acknowledgment messages
      const acknowledgmentMessages = [
        "I'm looking into that for you. Give me a moment to search the codebase...",
        "Bobby on the case! Searching through the code now...",
        "Let me check that out for you. Just a moment while I search...",
        "Bobby's on it! Give me a moment to analyze the repository...",
        "Scanning the codebase now. I'll have an answer for you shortly...",
        "Leave it to Bobby! Checking the code for you now...",
        "Working on your request now. This will just take a moment...",
        "This looks like a job for Bobby! Searching now...",
        "Analyzing your question. I'll have a response for you soon...",
        "On it! Digging into the code for you..."
      ];
      
      // Select a random acknowledgment message
      const randomIndex = Math.floor(Math.random() * acknowledgmentMessages.length);
      const acknowledgment = acknowledgmentMessages[randomIndex];
      
      // Send acknowledgment immediately
      await message.reply(acknowledgment);
      console.log("Sent acknowledgment message");

      // Check rate limit
      if (!checkRateLimit(message.author.id)) {
        console.log(`Rate limit exceeded for user ${message.author.username}`);
        await message.reply(
          "You have exceeded the rate limit. Please try again later.",
        );
        return;
      }

      // Send typing indicator
      await message.channel.sendTyping();
      console.log("Sent typing indicator");

      console.log(`Processing query with Claude: "${query}"`);
      // Process query with Claude
      const { success, response, isBug } = await processWithClaude(query);
      console.log(
        `Claude processing complete. Success: ${success}, Is bug: ${isBug}`,
      );

      if (success) {
        // Determine appropriate topic based on query
        const topic = isBug ? "Bugs" : "General Queries";
        console.log(`Saving response to memory under topic: ${topic}`);

        // Save to memory
        await saveToMemory(query, response, topic);

        // Send response (handle >2000 characters with multipart messages)
        console.log("Sending response to user");
        if (response.length <= 2000) {
          await message.reply(response);
        } else {
          // Split response into parts of 2000 or fewer characters
          console.log(`Response exceeds 2000 characters (${response.length}), sending in parts`);
          const parts = [];
          let remaining = response;
          
          while (remaining.length > 0) {
            // Find a good break point (end of sentence or paragraph) within first 1900 chars
            // This gives some buffer for "Part X/Y: " prefix
            let breakPoint = 1900;
            if (remaining.length > 1900) {
              // Try to find paragraph break
              const paraBreak = remaining.lastIndexOf('\n\n', 1900);
              if (paraBreak > 1500) {
                breakPoint = paraBreak + 2; // Include the paragraph break
              } else {
                // Try to find sentence break (period followed by space)
                const sentenceBreak = remaining.lastIndexOf('. ', 1900);
                if (sentenceBreak > 1500) {
                  breakPoint = sentenceBreak + 2; // Include the period and space
                }
              }
            } else {
              breakPoint = remaining.length;
            }
            
            parts.push(remaining.substring(0, breakPoint));
            remaining = remaining.substring(breakPoint).trim();
          }
          
          console.log(`Split response into ${parts.length} parts`);
          
          // Send each part
          for (let i = 0; i < parts.length; i++) {
            const partHeader = `Part ${i+1}/${parts.length}: `;
            await message.reply(partHeader + parts[i]);
          }
        }
      } else {
        console.log("Claude processing failed, sending error message");
        await message.reply(
          "Sorry, I encountered an error while processing your request.",
        );
      }
    } catch (err) {
      console.error("Error in message handler:", err);
      try {
        const errorMsg = "I encountered an unexpected error. Please try again later.";
        await message.reply(errorMsg);
      } catch (replyErr) {
        console.error("Failed to send error message:", replyErr);
      }
    }
  }
});

// Main function
async function main() {
  try {
    console.log("Bobby starting up...");
    console.log("Environment check:");
    console.log(
      `- DISCORD_TOKEN: ${DISCORD_TOKEN ? "Set (length: " + DISCORD_TOKEN.length + ")" : "Not set"}`,
    );
    console.log(
      `- ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "Set (length: " + process.env.ANTHROPIC_API_KEY.length + ")" : "Not set"}`,
    );
    console.log(
      `- GH_TOKEN: ${process.env.GH_TOKEN ? "Set (length: " + process.env.GH_TOKEN.length + ")" : "Not set"}`,
    );
    console.log(`- GITHUB_REPO: ${GITHUB_REPO ? GITHUB_REPO : "Not set"}`);
    console.log(
      `- ALLOWED_DISCORD_SERVERS: ${process.env.ALLOWED_DISCORD_SERVERS || "Not set"}`,
    );

    // Check Claude installation
    try {
      const claudeVersion = await new Response(
        spawn(["claude", "--version"], { stdout: "pipe" }).stdout,
      ).text();
      console.log(`Claude CLI found: ${claudeVersion.trim()}`);
    } catch (error) {
      console.error("Error checking Claude CLI installation:", error.message);
    }

    console.log("Logging into Discord...");

    // Log in to Discord
    await client.login(DISCORD_TOKEN);
    console.log("Discord login successful");
  } catch (error) {
    console.error("Error starting Bobby:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    process.exit(1);
  }
}

// Start the bot
main();
