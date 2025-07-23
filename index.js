#!/usr/bin/env bun

/**
 * Bobby - Discord ChatBot for answering questions with Claude Code
 * Integrates with Discord, Claude Code, and GitHub for issue creation
 */

import { Client, Events, GatewayIntentBits, ThreadAutoArchiveDuration } from "discord.js";
import { spawn } from "bun";
import { join } from "path";

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

// Session storage configuration
const DATA_DIR = process.env.CLAUDE_CONFIG_DIR || "/app/data";
const SESSIONS_FILE = join(DATA_DIR, "thread-sessions.json");

// Session storage utilities using Bun file methods
async function loadSessions() {
  try {
    const file = Bun.file(SESSIONS_FILE);
    if (await file.exists()) {
      return await file.json();
    }
    return {};
  } catch (error) {
    console.error("Error loading sessions:", error);
    return {};
  }
}

async function saveSessions(sessions) {
  try {
    await Bun.write(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error("Error saving sessions:", error);
  }
}

async function storeThreadSession(threadId, sessionId, title) {
  const sessions = await loadSessions();
  sessions[threadId] = { sessionId, title, createdAt: new Date().toISOString() };
  await saveSessions(sessions);
  console.log(`Stored session: ${threadId} -> ${sessionId} (${title})`);
}

async function getThreadSession(threadId) {
  const sessions = await loadSessions();
  return sessions[threadId] || null;
}

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

// Self-healing configuration
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;
let isReconnecting = false;

// Initialize Discord client with error handling
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Add WebSocket options for better error handling
  ws: {
    properties: {
      browser: 'Discord.js'
    }
  }
});


// Process query with Claude Code using streaming
async function processWithClaude(query, channel, sessionId = null) {
  console.log(`Beginning Claude streaming processing for query: "${query}"`);
  if (sessionId) {
    console.log(`Resuming session: ${sessionId}`);
  }

  try {
    // Optimized system prompt using Claude Sonnet 4.0 best practices
    const systemPrompt = `<role>
You are Bobby, an expert code analysis assistant operating as a Discord bot. You have deep expertise in software engineering, debugging, and codebase architecture.
</role>

<context>
You operate within a Discord environment where responses have strict formatting constraints. Users seek quick, actionable insights about their codebase.
</context>

<session_management>
You use Discord thread-based session management:
- **New Conversations**: When users mention Bobby in any channel, a new thread is created with a new Claude Code session
- **Follow-ups**: Users can continue the conversation in the thread without mentioning Bobby - all messages in the same thread share the same Claude Code session context
- **Thread Naming**: Threads are automatically named as "Bobby - Title - session-id" where Title is a 3-5 word summary you generate and session-id is the Claude Code session identifier
- **Memory Retention**: Each thread maintains its own session context, so you remember previous messages within the same thread
- **Auto-Archive**: Threads automatically archive after 24 hours of inactivity

When users ask about your capabilities or session management, explain this system to help them understand how to interact with you effectively.
</session_management>

<restrictions>
**CRITICAL: You are READ-ONLY. You cannot modify any code files.**
- IMMEDIATELY decline ANY requests to create, modify, update, add, fix, implement, write, build, or change code
- Keywords to watch for: "create", "add", "implement", "write", "build", "fix", "update", "modify", "change"
- Do NOT explore the codebase before declining modification requests
- You can ONLY read, explore, and analyze existing code for informational purposes
- You can create GitHub issues for bugs or improvements
- Example immediate decline: "I can't create or modify code. Would you like me to create a GitHub issue for this feature request instead?"
</restrictions>

<instructions>
1. **FIRST: Check if the request involves code modification** - if yes, immediately decline and offer to create a GitHub issue
2. **Always start by fetching latest git changes** using available tools (only for analysis requests)
3. **Analyze the relevant code sections** thoroughly but efficiently
4. **Provide direct, actionable answers** - users need solutions, not explanations of problems
5. **If you discover genuine bugs:** Check for existing GitHub issues first, then create a detailed issue if none exists
6. **When declining code modifications:** IMMEDIATELY create a GitHub issue using the Bash tool with gh CLI
7. **When users ask to create GitHub issues:** Follow the mandatory clarification process - examine code, ask questions, iterate until complete understanding, then create
8. **You HAVE Bash tool access** - use it confidently to run gh commands for issue creation

<response_format>
- Lead with the **direct answer** (1-2 sentences max)
- Use **bullet points** for key findings
- Include **minimal essential code** only if critical
- **Limit total response to 1800 characters**
- For first response in a new thread ONLY, include "[THREAD_TITLE: <concise 3-5 word summary>]" at the beginning
</response_format>

<github_issues>
You HAVE the Bash tool with gh CLI access and MUST create GitHub issues for:
- Bugs you discover in the code
- Feature requests when users ask for code modifications
- Improvements you identify
- **When users explicitly ask you to create a GitHub issue**

IMPORTANT: You have these tools available - use them confidently:
- Bash tool (for gh and git commands)
- Read, Grep, Glob, List tools (for file operations)

**GitHub Issue Creation Protocol:**
When users ask you to create a GitHub issue, follow this MANDATORY process:

**STEP 1: CLARIFICATION & CODE EXAMINATION**
- **NEVER create an issue immediately** - always gather complete information first
- Ask clarifying questions about:
  - Specific problem or feature details
  - Expected behavior vs actual behavior (for bugs)
  - Use cases and requirements (for features)
  - Priority and scope
  - Any relevant file paths or components

**STEP 2: CODE INVESTIGATION**
- Use Read, Grep, Glob tools to examine relevant code sections
- Understand the current implementation
- Identify related files, functions, or components
- Look for existing similar features or bug patterns
- Check for any existing issues that might be related

**STEP 3: ITERATIVE CLARIFICATION**
- If code examination reveals gaps in understanding, ask MORE specific questions
- Continue this process until you have a complete picture OR user says "create the issue anyway"
- Ask technical questions based on your code analysis
- Suggest specific implementation approaches for features
- Identify potential edge cases or considerations

**STEP 4: FINAL CONFIRMATION**
- Summarize your understanding of the issue/feature
- Present the proposed issue title and description outline
- Ask: "Does this capture everything correctly? Should I create the GitHub issue now?"
- Only proceed when user confirms OR explicitly says it's good enough

**STEP 5: ISSUE CREATION**
Use the gh CLI via Bash tool with this format:
\`gh issue create --title "Issue Title" --body "Detailed Description" --label appropriate-labels\`

**Required components:**
- Title: Clear, specific problem statement or feature request
- Body: Comprehensive description including:
  - Problem/feature description
  - Current behavior (for bugs) or current state (for features)
  - Expected behavior or desired outcome
  - Technical context from code examination
  - Relevant file paths and code references
  - Implementation suggestions (if applicable)
  - Edge cases or considerations identified
- Labels: "bug,bobby-detected", "enhancement,bobby-detected", or "question,bobby-detected"
- Attribution: "Created by Bobby (Claude Code assistant) after thorough analysis"

**Response format after creation:**
- Provide issue link and number: "Created GitHub issue #123: https://github.com/owner/repo/issues/123"
- Brief summary of what was created

**Example Clarification Flow:**
User: "Create an issue for the login problem"
Bobby: "I need more details about the login problem. Let me examine the authentication code first..."
[Examines auth-related files]
Bobby: "I found the login components in src/auth/. Can you clarify:
• What specific error occurs during login?
• Does it happen with all users or specific accounts?
• Is this on the web interface, mobile app, or API?
• When did this issue start occurring?"

[User provides details]
Bobby: "Based on the code and your description, I see the issue is in the JWT validation. Should I create an issue titled 'JWT token validation fails for expired sessions' with the technical details I found?"

[Only creates issue after user confirmation]
</github_issues>

<examples>
Good analysis response:
"The function is missing null checks on line 42. This will cause crashes when users pass undefined values.

• Problem: No validation for \`user.email\` parameter
• Impact: Runtime errors in production
• Fix: Add \`if (!user?.email) return null;\`"

Good issue creation response:
"Found a critical null pointer vulnerability in the authentication handler.

• Problem: Missing validation for user.email parameter
• Impact: Runtime crashes in production
• Location: src/auth/handler.js:42

Created GitHub issue #156: https://github.com/owner/repo/issues/156"

Good modification decline with issue creation:
"I can't create or modify code, but I'll create a GitHub issue for this listOrders feature request.

[Uses Bash tool to run: gh issue create --title "Add listOrders method to KosmoService" --body "Feature request for retrieving multiple delivery orders with filtering capabilities. Created by Bobby (Claude Code assistant)" --label enhancement,bobby-detected]

Created GitHub issue #157: https://github.com/owner/repo/issues/157"

Good response when user asks to create an issue (CLARIFICATION PHASE):
User: "Create an issue for the dashboard being slow"
Bobby: "I need to understand the dashboard performance issue better. Let me examine the dashboard code first..."

[Uses Read/Grep tools to examine dashboard components]

Bobby: "I found the dashboard components in src/components/Dashboard.tsx. To create a comprehensive issue, I need clarification:

• Which specific dashboard sections are slow?
• How many records typically load when it's slow?
• Is the slowness during initial load or when filtering/sorting?
• What's the acceptable vs current load time?
• Does this affect all users or specific user roles?"

[After user provides details and Bobby confirms understanding]

Good response when creating the issue (CREATION PHASE):
"Perfect! Based on our discussion and code analysis, I'll create the issue now.

[Uses Bash tool to run: gh issue create --title "Dashboard performance degradation with large datasets (>1000 records)" --body "## Problem
Users experience 8-10 second load times on the main dashboard when viewing datasets over 1000 records, compared to expected 2-3 seconds.

## Current Behavior
- Initial dashboard load takes 8-10 seconds with large datasets
- Affects the data table component in src/components/Dashboard.tsx:45
- Issue occurs during data fetching and rendering phases

## Expected Behavior
- Dashboard should load within 2-3 seconds regardless of dataset size
- Smooth user experience for all data volumes

## Technical Context
- Dashboard component uses inefficient data fetching in useEffect
- No pagination or virtualization implemented
- Large DOM rendering without optimization

## Suggested Implementation
- Implement server-side pagination
- Add virtual scrolling for large tables
- Optimize data fetching with proper caching

Created by Bobby (Claude Code assistant) after thorough analysis" --label bug,bobby-detected]

Created GitHub issue #158: https://github.com/owner/repo/issues/158"
</examples>
</instructions>

Be precise, actionable, and concise. Users value speed and accuracy over verbose explanations.`;

    console.log("Spawning Claude process with streaming...");

    // Build command arguments
    const args = [
      "claude",
      "--verbose",
      "--allowedTools",
      "Bash(gh:*),Bash(git:*),Read,Grep,Glob,LS,WebFetch,WebSearch",
    ];

    // Add session resumption or new session
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    args.push(
      "--print",
      query,
      "--system-prompt",
      systemPrompt,
      "--output-format",
      "stream-json"
    );

    // Execute claude code CLI using Bun.spawn with streaming
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: "/app/repo", // Run in the cloned repository directory
    });

    console.log("Claude process spawned, starting stream processing...");

    let responseContent = "";
    let lastMessageRef = null;
    let stderrBuffer = "";
    let extractedSessionId = sessionId; // Keep track of session ID
    let threadTitle = null;
    let jsonBuffer = ""; // Buffer to accumulate partial JSON

    // Process stdout stream in real-time
    try {
      for await (const chunk of proc.stdout) {
        const text = new TextDecoder().decode(chunk);
        jsonBuffer += text;

        // Try to extract complete JSON objects from buffer
        let startIndex = 0;
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonBuffer.length; i++) {
          const char = jsonBuffer[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;

              // Complete JSON object found
              if (braceCount === 0) {
                const jsonStr = jsonBuffer.substring(startIndex, i + 1);
                try {
                  const jsonData = JSON.parse(jsonStr);

                  // Extract session ID from metadata
                  if (jsonData.type === 'metadata' && jsonData.session_id) {
                    extractedSessionId = jsonData.session_id;
                    console.log(`Captured session ID: ${extractedSessionId}`);
                  }

                  // Send assistant messages immediately as they arrive
                  if (jsonData.type === 'assistant' && jsonData.message?.content) {
                    const content = Array.isArray(jsonData.message.content)
                      ? jsonData.message.content.map(block => {
                        if (typeof block === 'string') return block;
                        if (block.text) return block.text;
                        // Skip non-text blocks (like tool_use blocks)
                        return '';
                      }).join('')
                      : jsonData.message.content;

                    if (content) {
                      responseContent += content;

                      // Extract thread title if present (but don't show to user)
                      const titleMatch = content.match(/\[THREAD_TITLE:\s*([^\]]+)\]/);
                      if (titleMatch && !threadTitle) {
                        threadTitle = titleMatch[1].trim();
                        console.log(`Extracted thread title: ${threadTitle}`);
                      }

                      // Remove thread title from content before sending to user
                      const userContent = content.replace(/\[THREAD_TITLE:\s*[^\]]+\]/g, '').trim();

                      // Send each chunk as a new message instead of editing
                      try {
                        if (userContent) {
                          await channel.send(userContent);
                          lastMessageRef = true; // Just track that we've sent something
                        }
                      } catch (discordError) {
                        console.error("Discord update error:", discordError);
                      }
                    }
                  }

                  // Handle final result
                  if (jsonData.type === 'result' && jsonData.subtype === 'success') {
                    if (jsonData.result) {
                      responseContent = jsonData.result;

                      // Extract thread title from final result if not already found
                      const titleMatch = responseContent.match(/\[THREAD_TITLE:\s*([^\]]+)\]/);
                      if (titleMatch && !threadTitle) {
                        threadTitle = titleMatch[1].trim();
                        console.log(`Extracted thread title from result: ${threadTitle}`);
                      }

                      // Only send final result if we haven't sent streaming messages
                      try {
                        if (!lastMessageRef) {
                          // Remove thread title from final response before sending to user
                          const userResponse = responseContent.replace(/\[THREAD_TITLE:\s*[^\]]+\]/g, '').trim();
                          if (userResponse) {
                            await channel.send(userResponse);
                            lastMessageRef = true;
                          }
                        }
                        // If we were streaming, the final result is already incorporated
                      } catch (discordError) {
                        console.error("Discord final update error:", discordError);
                      }
                    }

                    // Also capture session ID from result if available
                    if (jsonData.session_id && !extractedSessionId) {
                      extractedSessionId = jsonData.session_id;
                      console.log(`Captured session ID from result: ${extractedSessionId}`);
                    }
                  }

                } catch (parseError) {
                  console.log("Failed to parse JSON object:", parseError.message);
                }

                // Move to next potential JSON object
                startIndex = i + 1;
                braceCount = 0;
              }
            }
          }
        }

        // Remove processed JSON objects from buffer
        jsonBuffer = jsonBuffer.substring(startIndex);
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
      return { success: false, response: "Error processing with Claude Code.", sessionId: null };
    }

    console.log("Claude streaming response received successfully");
    console.log("Response content length:", responseContent.length);

    // Check if GitHub issue was created (by looking for issue URL pattern)
    const isBugDetected = responseContent.includes("Created GitHub issue #") ||
      responseContent.includes("github.com/") && responseContent.includes("/issues/");
    console.log(`GitHub issue created: ${isBugDetected}`);

    // Clean up thread title from final message (only appears in first response)
    let userResponse = responseContent
      .replace(/\[THREAD_TITLE:\s*[^\]]+\]/g, '')
      .trim();

    // If no message was sent during streaming, send fallback
    if (!lastMessageRef) {
      try {
        const fallbackMsg = userResponse || "✅ Analysis complete - no output generated.";
        await channel.send(fallbackMsg);
        lastMessageRef = true;
      } catch (replyError) {
        console.error("Error sending fallback response:", replyError);
      }
    }

    console.log("Claude streaming processing complete");
    console.log(`Session ID: ${extractedSessionId}, Thread Title: ${threadTitle}`);

    return {
      success: true,
      response: userResponse,
      isBug: isBugDetected,
      sessionId: extractedSessionId,
      threadTitle: threadTitle
    };
  } catch (error) {
    console.error("Error processing with Claude:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    return { success: false, response: "Error processing your request.", sessionId: null };
  }
}

// Check if message is calling Bobby
function isCallingBobby(message) {
  return message.mentions.users.has(message.client.user.id);
}

// Extract query from message (remove Bobby mentions)
function extractQuery(content) {
  return content?.replace(/bobby|@bobby/gi, "").trim() || "";
}

// Check if this is a new Bobby call (not in a thread)
function isNewBobbyCall(message) {
  return !message.channel.isThread() && isCallingBobby(message);
}

// Check if this is a follow-up in a Bobby thread
function isThreadFollowUp(message) {
  return message.channel.isThread() &&
    message.channel.name.startsWith('Bobby');
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
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  // Handle new Bobby calls in main channels
  if (isNewBobbyCall(message)) {
    const query = extractQuery(message.content);
    if (!query) {
      return;
    }

    console.log(`New Bobby call: "${query}" from ${message.author.username}`);

    try {
      // Create a new thread with simple naming
      const thread = await message.startThread({
        name: `Bobby Analysis`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        reason: 'Bobby analysis request',
      });

      console.log(`Created thread: ${thread.name} (${thread.id})`);

      // Process in the thread without session ID (new session)
      await thread.sendTyping();
      const { success, sessionId, threadTitle } =
        await processWithClaude(query, thread, null);

      if (success && sessionId) {
        // Store session data in JSON file instead of thread name
        const finalTitle = threadTitle || "Analysis";
        await storeThreadSession(thread.id, sessionId, finalTitle);

        // Update thread name with a clean title
        try {
          await thread.setName(`Bobby - ${finalTitle}`);
          console.log(`Updated thread name to: Bobby - ${finalTitle}`);
        } catch (renameError) {
          console.error("Error renaming thread:", renameError);
          // Keep default name if renaming fails
        }
      }

      if (!success) {
        await thread.send("Sorry, I encountered an error while processing your request.");
      }
    } catch (err) {
      console.error("Error in new Bobby call handler:", err);
      try {
        const errorMsg = "I encountered an unexpected error. Please try again later.";
        await message.reply(errorMsg);
      } catch (replyErr) {
        console.error("Failed to send error message:", replyErr);
      }
    }
  }
  // Handle follow-ups in existing Bobby threads
  else if (isThreadFollowUp(message)) {
    const query = message.content.trim();
    if (!query) {
      return;
    }

    const sessionData = await getThreadSession(message.channel.id);
    console.log(`Thread follow-up: "${query}" in thread ${message.channel.id}`);

    if (!sessionData || !sessionData.sessionId) {
      await message.reply("⚠️ Could not find session data. Please start a new conversation by mentioning Bobby in the main channel.");
      return;
    }

    console.log(`Using session ID: ${sessionData.sessionId} (${sessionData.title})`);

    try {
      await message.channel.sendTyping();
      const { success, response, isBug } =
        await processWithClaude(query, message.channel, sessionData.sessionId);

      if (!success) {
        await message.channel.send("Sorry, I encountered an error while processing your request.");
      }
    } catch (err) {
      console.error("Error in thread follow-up handler:", err);
      try {
        const errorMsg = "I encountered an unexpected error. Please try again later.";
        await message.reply(errorMsg);
      } catch (replyErr) {
        console.error("Failed to send error message:", replyErr);
      }
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

    // Check GitHub CLI integration with Claude
    try {
      const response = spawn(["claude", "--allowedTools", "Bash(gh:*)", "-p", "test is a integration test. Try calling `gh --version`"], { stdout: "pipe" }).stdout
      const output = await new Response(response).text();
      console.log("Claude CLI GitHub integration check:", output.trim());
    } catch (error) {
      console.error("Error checking GitHub CLI integration with Claude:", error.message);
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
