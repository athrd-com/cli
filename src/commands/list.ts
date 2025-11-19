import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import inquirer from "inquirer";
import { requireAuth } from "../utils/auth.js";
import {
  findAllChatSessions,
  formatDate,
  getIDEName,
  mergeAgentFilesIntoSession,
  parseJSONL,
  parseClaudeCodeSession,
  type ChatSession,
} from "../utils/chatProviders.js";
import { getGitHubUserInfo, getGitHubOrgInfo } from "../utils/github.js";
import { getGitHubRepo } from "../utils/git.js";

export function listCommand(program: Command) {
  program
    .command("list")
    .description("List AI chat threads from VS Code, Cursor, and more")
    .option("-n, --number <count>", "Number of chats to display", "20")
    .action(async (options) => {
      try {
        console.log(chalk.blue("📋 Finding AI chat threads...\n"));

        const sessions = await findAllChatSessions();

        if (sessions.length === 0) {
          console.log(chalk.yellow("No chat sessions found."));
          return;
        }

        // Sort by most recent lastMessageDate
        sessions.sort(
          (a: ChatSession, b: ChatSession) =>
            b.lastMessageDate - a.lastMessageDate
        );

        // Limit to requested number
        const limit = parseInt(options.number) || 20;
        const displaySessions = sessions.slice(0, limit);

        console.log(
          chalk.cyan(
            `Found ${sessions.length} chat sessions. Showing ${displaySessions.length} most recent:\n`
          )
        );

        // Create choices for multi-select
        const choices = displaySessions.map((session: ChatSession) => {
          const title = session.customTitle || "Untitled Chat";
          const date = formatDate(session.lastMessageDate);
          const messages = chalk.dim(`${session.requestCount} messages`);
          const dateStr = chalk.dim(date);
          const workspace = session.workspaceName
            ? chalk.dim(`[${session.workspaceName}]`)
            : "";
          const sourceLabel = chalk.dim(
            `(${getIDEName(session.source)})`
          );

          return {
            name: `${title} ${workspace} ${sourceLabel} ${dateStr} ${messages}`,
            value: session,
            short: title,
          };
        });

        // Show multi-select prompt
        const answers = await inquirer.prompt([
          {
            type: "checkbox",
            name: "selectedSessions",
            message:
              "Select chat threads (use Space to select, Enter to confirm):",
            choices,
            pageSize: 15,
          },
        ]);

        if (answers.selectedSessions.length === 0) {
          console.log(chalk.yellow("\nNo chats selected."));
          return;
        }

        console.log(
          chalk.green(
            `\n✓ Selected ${answers.selectedSessions.length} chat thread(s):`
          )
        );

        answers.selectedSessions.forEach((session: ChatSession) => {
          console.log(
            chalk.cyan(`  • ${session.customTitle || "Untitled Chat"}`)
          );
          console.log(chalk.dim(`    ID: ${session.sessionId}`));
          console.log(chalk.dim(`    Path: ${session.filePath}`));
        });

        // Upload to private gists
        console.log(chalk.blue("\n📤 Uploading to private gists..."));

        try {
          const token = await requireAuth();
          const octokit = new Octokit({ auth: token });

          // Fetch GitHub user info and repo once
          const userInfo = await getGitHubUserInfo(octokit);
          const githubRepo = getGitHubRepo();

          // Extract organization name from repo (format: "org/repo")
          const orgName = githubRepo?.split("/")[0];
          const orgInfo = orgName ? await getGitHubOrgInfo(octokit, orgName) : null;

          const gistUrls: string[] = [];

          for (const session of answers.selectedSessions) {
            let sessionData: any;

            // Parse the session file based on format (JSONL for Claude Code, JSON for others)
            if (session.source === "claude-code") {
              // Claude Code sessions are in JSONL format
              const fileContent = fsSync.readFileSync(session.filePath, "utf-8");
              const jsonlEntries = parseJSONL(fileContent);
              sessionData = parseClaudeCodeSession(jsonlEntries);

              // Merge agent files into the session data
              if (session.agentFiles) {
                sessionData = await mergeAgentFilesIntoSession(
                  sessionData,
                  session.agentFiles
                );
              }
            } else {
              // VS Code and Cursor sessions are in regular JSON format
              const fileContent = await fs.readFile(session.filePath, "utf-8");
              sessionData = JSON.parse(fileContent);
            }

            // Add __athrd metadata to the session data
            const enrichedData = {
              __athrd: {
                githubUsername: userInfo.username,
                githubRepo: githubRepo,
                avatarImage: userInfo.avatarImage,
                ide: getIDEName(session.source),
                ...(orgInfo && {
                  orgId: orgInfo.orgId,
                  orgName: orgInfo.orgName,
                  orgIcon: orgInfo.orgIcon,
                }),
              },
              ...sessionData,
            };

            const content = JSON.stringify(enrichedData, null, 2);
            const fileName = `athrd-${session.sessionId}.json`;

            const response = await octokit.gists.create({
              files: {
                [fileName]: { content },
              },
              description: `athrd-${session.sessionId}`,
              public: false,
            });

            gistUrls.push(response.data.html_url || "");
            console.log(
              chalk.green(
                `✓ ${session.customTitle || "Untitled Chat"}: ${
                  response.data.html_url
                }`
              )
            );
          }

          console.log(
            chalk.green(
              `\n✅ Successfully uploaded ${gistUrls.length} gist(s)!`
            )
          );
        } catch (error) {
          console.error(chalk.red("\n❌ Failed to upload to gist:"), error);
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red("List command failed:"), error);
        process.exit(1);
      }
    });
}
