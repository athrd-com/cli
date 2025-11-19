import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ChatSession {
  sessionId: string;
  creationDate: number;
  lastMessageDate: number;
  customTitle?: string;
  requestCount: number;
  filePath: string;
  source: "vscode" | "cursor" | "claude-code";
  workspaceName?: string;
  agentFiles?: string[]; // For Claude Code sessions, paths to agent files
}

interface VSCodeChatSessionFile {
  version: number;
  sessionId: string;
  creationDate: number;
  lastMessageDate: number;
  customTitle?: string;
  requests: any[];
}

/**
 * Find chat sessions from VS Code
 */
async function findVSCodeChatSessions(): Promise<ChatSession[]> {
  const workspaceStoragePath = path.join(
    os.homedir(),
    "Library/Application Support/Code/User/workspaceStorage"
  );

  if (!fs.existsSync(workspaceStoragePath)) {
    return [];
  }

  const sessions: ChatSession[] = [];
  const workspaceDirs = fs.readdirSync(workspaceStoragePath);

  for (const workspaceDir of workspaceDirs) {
    const workspaceStorageDir = path.join(workspaceStoragePath, workspaceDir);
    const chatSessionsPath = path.join(workspaceStorageDir, "chatSessions");

    // Try to read workspace name from workspace.json
    let workspaceName: string | undefined;
    try {
      const workspaceJsonPath = path.join(
        workspaceStorageDir,
        "workspace.json"
      );
      if (fs.existsSync(workspaceJsonPath)) {
        const workspaceJson = JSON.parse(
          fs.readFileSync(workspaceJsonPath, "utf-8")
        );
        if (workspaceJson.folder) {
          // Extract folder name from URI like "file:///Users/user/code/project-name"
          const folderUri = workspaceJson.folder;
          const folderPath = folderUri.replace(/^file:\/\//, "");
          workspaceName = path.basename(folderPath);
        }
      }
    } catch (error) {
      // Ignore errors reading workspace.json
    }

    if (
      fs.existsSync(chatSessionsPath) &&
      fs.statSync(chatSessionsPath).isDirectory()
    ) {
      const chatFiles = fs.readdirSync(chatSessionsPath);

      for (const chatFile of chatFiles) {
        if (chatFile.endsWith(".json")) {
          try {
            const filePath = path.join(chatSessionsPath, chatFile);
            const content = fs.readFileSync(filePath, "utf-8");
            const session: VSCodeChatSessionFile = JSON.parse(content);

            const requestCount = session.requests?.length || 0;

            // Skip chats with zero messages
            if (requestCount === 0) {
              continue;
            }

            sessions.push({
              sessionId: session.sessionId,
              creationDate: session.creationDate,
              lastMessageDate: session.lastMessageDate,
              customTitle: session.customTitle,
              requestCount,
              filePath,
              source: "vscode",
              workspaceName,
            });
          } catch (error) {
            // Skip invalid JSON files
            continue;
          }
        }
      }
    }
  }

  return sessions;
}

/**
 * Find chat sessions from Cursor
 * TODO: Implement Cursor chat discovery
 */
async function findCursorChatSessions(): Promise<ChatSession[]> {
  // Cursor typically stores data in a similar location
  // const workspaceStoragePath = path.join(
  //   os.homedir(),
  //   "Library/Application Support/Cursor/User/workspaceStorage"
  // );

  return [];
}

/**
 * Find chat sessions from Claude Code (Claude CLI)
 * Claude stores conversations in ~/.claude/projects/<encoded-project-path>/
 * Each session is a UUID-named JSONL file
 */
async function findClaudeCodeChatSessions(): Promise<ChatSession[]> {
  const claudeProjectsPath = path.join(os.homedir(), ".claude", "projects");

  if (!fs.existsSync(claudeProjectsPath)) {
    return [];
  }

  const sessions: ChatSession[] = [];

  try {
    const projectDirs = fs.readdirSync(claudeProjectsPath);

    for (const projectDir of projectDirs) {
      const projectPath = path.join(claudeProjectsPath, projectDir);

      // Skip if not a directory
      if (!fs.statSync(projectPath).isDirectory()) {
        continue;
      }

      // List all JSONL files in the project directory
      const files = fs.readdirSync(projectPath);
      const agentFiles: Map<string, string[]> = new Map(); // sessionId -> agent file paths

      for (const file of files) {
        // UUID files are session files (look for UUID pattern: 8-4-4-4-12 hex digits)
        if (file.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i)) {
          const filePath = path.join(projectPath, file);

          try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const lines = fileContent.split("\n");

            // Parse JSONL to find session metadata
            let summary: string | undefined;
            let lastMessageDate: number = 0;
            let messageCount = 0;
            let firstUserMessage: string | undefined;

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const entry = JSON.parse(line);

                  // Get summary if available
                  if (entry.type === "summary" && !summary) {
                    summary = entry.summary;
                  }

                  // Capture first user message as fallback for title
                  if (entry.type === "user" && !firstUserMessage) {
                    const message = entry.message;
                    if (message && message.content) {
                      firstUserMessage = message.content.substring(0, 60);
                    }
                  }

                  // Count messages and track latest timestamp
                  if (entry.type === "user" || entry.type === "assistant") {
                    messageCount++;
                    if (entry.timestamp) {
                      const timestamp = new Date(entry.timestamp).getTime();
                      lastMessageDate = Math.max(lastMessageDate, timestamp);
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                  continue;
                }
              }
            }

            // Skip sessions with no messages
            if (messageCount === 0) {
              continue;
            }

            // Use the project directory name as workspace
            const workspaceName = projectDir
              .split("-")
              .slice(-1)[0]
              .split("/")
              .pop();

            // Use summary if available, otherwise use first user message, otherwise default
            const title = summary || firstUserMessage || "Claude Chat";

            sessions.push({
              sessionId: file.replace(".jsonl", ""),
              creationDate: lastMessageDate,
              lastMessageDate,
              customTitle: title,
              requestCount: messageCount,
              filePath,
              source: "claude-code",
              workspaceName,
              agentFiles: agentFiles.get(file.replace(".jsonl", "")) || [],
            });
          } catch (error) {
            // Skip files that can't be parsed
            continue;
          }
        }

        // Agent files (look for agent-XXXXXXXX pattern)
        if (file.match(/^agent-[0-9a-f]{8}\.jsonl$/i)) {
          const filePath = path.join(projectPath, file);
          try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const lines = fileContent.split("\n");

            // Find which session this agent belongs to
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const entry = JSON.parse(line);
                  if (entry.sessionId) {
                    if (!agentFiles.has(entry.sessionId)) {
                      agentFiles.set(entry.sessionId, []);
                    }
                    agentFiles.get(entry.sessionId)!.push(filePath);
                    break; // Only need first entry to get sessionId
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }

      // Add agent files to sessions they belong to
      for (const session of sessions) {
        const sessionAgents = agentFiles.get(session.sessionId);
        if (sessionAgents) {
          session.agentFiles = [...new Set(sessionAgents)]; // Remove duplicates
        }
      }
    }
  } catch (error) {
    // Ignore errors reading Claude projects directory
  }

  return sessions;
}

/**
 * Find all chat sessions from all supported providers
 */
export async function findAllChatSessions(): Promise<ChatSession[]> {
  const [vscodeSessions, cursorSessions, claudeCodeSessions] =
    await Promise.all([
      findVSCodeChatSessions(),
      findCursorChatSessions(),
      findClaudeCodeChatSessions(),
    ]);

  return [...vscodeSessions, ...cursorSessions, ...claudeCodeSessions];
}

/**
 * Format a timestamp into a human-readable date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return (
      "Today " +
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } else if (diffDays === 1) {
    return (
      "Yesterday " +
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

/**
 * Convert source to simple IDE name
 */
export function getIDEName(source: ChatSession["source"]): string {
  switch (source) {
    case "vscode":
      return "vscode";
    case "cursor":
      return "cursor";
    case "claude-code":
      return "claude";
    default:
      return "unknown";
  }
}

/**
 * Parse a JSONL (JSON Lines) file into an array of objects
 */
export function parseJSONL(fileContent: string): any[] {
  const lines = fileContent.split("\n");
  const result: any[] = [];

  for (const line of lines) {
    if (line.trim()) {
      try {
        const entry = JSON.parse(line);
        result.push(entry);
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }
  }

  return result;
}

/**
 * Convert Claude CLI JSONL session into a standard format for gist upload
 * Extracts messages and organizes them similarly to VS Code format
 */
export function parseClaudeCodeSession(jsonlEntries: any[]): any {
  const requests: any[] = [];
  let sessionId = "unknown";

  // Extract user and assistant messages
  for (const entry of jsonlEntries) {
    if (entry.type === "user" || entry.type === "assistant") {
      if (!sessionId || sessionId === "unknown") {
        sessionId = entry.sessionId || "unknown";
      }
      requests.push({
        id: entry.uuid || entry.id,
        type: entry.type,
        message: entry.message,
        timestamp: entry.timestamp,
      });
    }
  }

  return {
    sessionId,
    requests,
  };
}

/**
 * Merge agent files into session data for Claude Code sessions
 * Creates a unified JSON object containing both session and all agent transcripts
 */
export async function mergeAgentFilesIntoSession(
  sessionData: any,
  agentFilePaths: string[] | undefined
): Promise<any> {
  if (!agentFilePaths || agentFilePaths.length === 0) {
    return sessionData;
  }

  const agents: { [agentId: string]: any[] } = {};

  // Parse each agent file and organize by agent ID
  for (const agentFilePath of agentFilePaths) {
    try {
      const fileContent = fs.readFileSync(agentFilePath, "utf-8");
      const entries = parseJSONL(fileContent);
      const fileName = path.basename(agentFilePath);
      const agentId = fileName.replace("agent-", "").replace(".jsonl", "");

      agents[agentId] = entries;
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  // Return merged data
  return {
    ...sessionData,
    __agents: agents,
  };
}
