#!/usr/bin/env bun

/**
 * Bobby - Discord ChatBot for answering questions with Claude Code
 * Integrates with Discord, Claude Code, and GitHub for issue creation
 */

import { Client, Events, GatewayIntentBits } from "discord.js";
import { spawn } from "bun";

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


// Process query with Claude Code using streaming
async function processWithClaude(query, originalMessage) {
  console.log(`Beginning Claude streaming processing for query: "${query}"`);

  try {
    // Optimized system prompt using Claude Sonnet 4.0 best practices
    const systemPrompt = `<role>
You are Bobby, an expert code analysis assistant operating as a Discord bot. You have deep expertise in software engineering, debugging, and codebase architecture.
</role>

<context>
You operate within a Discord environment where responses have strict formatting constraints. Users seek quick, actionable insights about their codebase.
</context>

<instructions>
1. **Always start by fetching latest git changes** using available tools
2. **Analyze the relevant code sections** thoroughly but efficiently  
3. **Provide direct, actionable answers** - users need solutions, not explanations of problems
4. **If you discover genuine bugs:** Check for existing GitHub issues first, then create a detailed issue if none exists

<response_format>
- Lead with the **direct answer** (1-2 sentences max)
- Use **bullet points** for key findings
- Include **minimal essential code** only if critical
- **Limit total response to 1800 characters**
- End with exactly: "[STATUS: COMPLETED]" or "[STATUS: ISSUE_CREATED]"
</response_format>

<github_issues>
When creating issues:
- Title: Clear, specific problem statement
- Body: Problem summary + technical details + reproduction steps
- Labels: "bug" and "bobby-detected"
- Mention: "Detected by Bobby (Claude Code assistant)"
</github_issues>

<examples>
Good response:
"The function is missing null checks on line 42. This will cause crashes when users pass undefined values.

• Problem: No validation for \`user.email\` parameter  
• Impact: Runtime errors in production
• Fix: Add \`if (!user?.email) return null;\`

[STATUS: COMPLETED]"

Bad response:
"Well, I've analyzed your codebase and there are several interesting patterns here. Let me walk you through what I found step by step..."
</examples>
</instructions>

Be precise, actionable, and concise. Users value speed and accuracy over verbose explanations.`;

    console.log("Spawning Claude process with streaming...");

    // Execute claude code CLI using Bun.spawn with streaming
    const proc = spawn(
      [
        "claude",
        "--verbose",
        "--allowedTools",
        "Bash(gh:*),Bash(git:*),View,Read,Write(.*CLAUDE.md),Edit(.*CLAUDE.md),Search,Grep,Glob,List",
        "--continue", // Retain context between interactions
        "--print",
        query,
        "--system-prompt",
        systemPrompt,
        "--output-format",
        "stream-json"
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: "/app/repo", // Run in the cloned repository directory
      },
    );

    console.log("Claude process spawned, starting stream processing...");

    let responseContent = "";
    let lastMessageRef = null;
    let stderrBuffer = "";

    // Process stdout stream in real-time
    try {
      for await (const chunk of proc.stdout) {
        const text = new TextDecoder().decode(chunk);
        
        // Parse each line as separate JSON objects
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const jsonData = JSON.parse(line);
            
            // Send assistant messages immediately as they arrive
            if (jsonData.type === 'assistant' && jsonData.message?.content) {
              const content = Array.isArray(jsonData.message.content) 
                ? jsonData.message.content.map(block => block.text || block).join('')
                : jsonData.message.content;
              
              if (content) {
                responseContent += content;
                
                try {
                  if (!lastMessageRef) {
                    lastMessageRef = await originalMessage.reply(responseContent);
                  } else {
                    await lastMessageRef.edit(responseContent);
                  }
                } catch (discordError) {
                  console.error("Discord update error:", discordError);
                }
              }
            }
            
            // Handle final result
            if (jsonData.type === 'result' && jsonData.subtype === 'success' && jsonData.result) {
              responseContent = jsonData.result;
              
              try {
                if (!lastMessageRef) {
                  lastMessageRef = await originalMessage.reply(responseContent);
                } else {
                  await lastMessageRef.edit(responseContent);
                }
              } catch (discordError) {
                console.error("Discord final update error:", discordError);
              }
            }
            
          } catch (parseError) {
            // Skip invalid JSON lines
            console.log("Skipping non-JSON line:", line.substring(0, 100));
          }
        }
      }
    } catch (streamError) {
      console.error("Error processing stdout stream:", streamError);
    }

    // Collect stderr
    try {
      for await (const chunk of proc.stderr) {
        stderrBuffer += new TextDecoder().decode(chunk);
      }
    } catch (stderrError) {
      console.error("Error processing stderr stream:", stderrError);
    }

    const exitCode = await proc.exited;
    console.log(`Claude process finished with exit code: ${exitCode}`);

    if (exitCode !== 0 || stderrBuffer) {
      console.error("Claude Code error:", stderrBuffer);
      console.log("Claude stderr output length:", stderrBuffer.length);
      console.log(
        "Claude stderr sample:",
        stderrBuffer.substring(0, 200) + (stderrBuffer.length > 200 ? "..." : ""),
      );

      // Update message with error
      if (lastMessageRef) {
        await lastMessageRef.edit("❌ Error processing with Claude Code.");
      }
      return { success: false, response: "Error processing with Claude Code." };
    }

    console.log("Claude streaming response received successfully");
    console.log("Response content length:", responseContent.length);

    // Check status indicator from Claude's response
    const isBugDetected = responseContent.includes("[STATUS: ISSUE_CREATED]");
    console.log(`Bug detected and issue created: ${isBugDetected}`);

    // Clean up status indicators from final message
    let userResponse = responseContent
      .replace(/\[STATUS: (COMPLETED|ISSUE_CREATED)\]/g, '')
      .trim();

    // Final cleanup if we have a message reference
    if (lastMessageRef && userResponse !== responseContent) {
      try {
        await lastMessageRef.edit(userResponse);
      } catch (editError) {
        console.error("Error cleaning up final message:", editError);
      }
    }

    // If no message was sent during streaming, send fallback
    if (!lastMessageRef) {
      try {
        const fallbackMsg = userResponse || "✅ Analysis complete - no output generated.";
        lastMessageRef = await originalMessage.reply(fallbackMsg);
      } catch (replyError) {
        console.error("Error sending fallback response:", replyError);
      }
    }

    console.log("Claude streaming processing complete");
    return {
      success: true,
      response: userResponse,
      isBug: isBugDetected,
      streamedMessage: lastMessageRef
    };
  } catch (error) {
    console.error("Error processing with Claude:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    return { success: false, response: "Error processing your request." };
  }
}

// Check if message is calling Bobby
function isCallingBobby(content) {
  return content?.toLowerCase().includes("bobby");
}

// Extract query from message (remove Bobby mentions)
function extractQuery(content) {
  return content?.replace(/bobby|@bobby/gi, "").trim() || "";
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
  });

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
  // Ignore bots and non-Bobby messages
  if (message.author.bot || !isCallingBobby(message.content)) {
    return;
  }

  const query = extractQuery(message.content);
  if (!query) {
    return;
  }

  console.log(`Processing query: "${query}" from ${message.author.username}`);

  try {
    await message.channel.sendTyping();
    const { success, response, isBug, streamedMessage } = await processWithClaude(query, message);

    if (success) {
      console.log(`Query processed. Issue created: ${isBug}`);

      // Fallback: send response if streaming failed
      if (!streamedMessage && response) {
        await message.reply(response);
      }
    } else {
      await message.reply("Sorry, I encountered an error while processing your request.");
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
})

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
