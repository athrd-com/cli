import { Octokit } from "@octokit/rest";

export interface GitHubUserInfo {
  username: string;
  avatarImage: string;
}

export interface GitHubOrgInfo {
  orgId: number;
  orgName: string;
  orgIcon: string;
}

let cachedUserInfo: GitHubUserInfo | null = null;
let cachedOrgInfo: GitHubOrgInfo | null = null;

/**
 * Fetch authenticated user's GitHub information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubUserInfo(
  octokit: Octokit
): Promise<GitHubUserInfo> {
  if (cachedUserInfo) {
    return cachedUserInfo;
  }

  const response = await octokit.users.getAuthenticated();
  const userInfo: GitHubUserInfo = {
    username: response.data.login,
    avatarImage: response.data.avatar_url,
  };

  cachedUserInfo = userInfo;
  return userInfo;
}

/**
 * Reset cached user info (useful for testing or multiple sessions)
 */
export function resetGitHubUserInfoCache(): void {
  cachedUserInfo = null;
}

/**
 * Fetch GitHub organization information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubOrgInfo(
  octokit: Octokit,
  orgName: string
): Promise<GitHubOrgInfo> {
  if (cachedOrgInfo) {
    return cachedOrgInfo;
  }

  const response = await octokit.orgs.get({ org: orgName });
  const orgInfo: GitHubOrgInfo = {
    orgId: response.data.id,
    orgName: response.data.login,
    orgIcon: response.data.avatar_url,
  };

  cachedOrgInfo = orgInfo;
  return orgInfo;
}

/**
 * Reset cached org info (useful for testing or multiple sessions)
 */
export function resetGitHubOrgInfoCache(): void {
  cachedOrgInfo = null;
}
