# Quick Start Guide

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Build the project:**

   ```bash
   npm run build
   ```

3. **Link CLI globally (for development):**
   ```bash
   npm link
   ```

## First Steps

1. **Authenticate with GitHub:**

   ```bash
   athrd auth
   ```

   Choose "Personal Access Token" and enter your GitHub token.

   To create a token: https://github.com/settings/tokens/new

   - Select scopes as needed for your project

2. **Try the commands:**

   ```bash
   # List items
   athrd list

   # Create an item
   athrd create

   # Get help
   athrd help
   ```

3. **Log out when done:**
   ```bash
   athrd logout
   ```

## Development

- **Watch mode:** Rebuild on file changes and test

  ```bash
  npm run build && athrd <command>
  ```

- **Check for errors:**
  ```bash
  npm run build
  ```

## Next Steps

- Implement the backend integration in the command files
- Add API client for your service
- Customize the prompts and options
- Add more commands as needed
