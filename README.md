# ATHRD CLI

A command-line interface tool built with Commander and Inquirer.

## Installation

```bash
npm install
npm run build
npm link
```

## Usage

### Authentication

Authenticate with GitHub:

```bash
athrd auth
```

The CLI will prompt you to choose an authentication method:

- **Personal Access Token**: Enter your GitHub PAT directly
- **Device Flow**: OAuth device flow (requires OAuth app setup)

Credentials are stored securely in `~/.athrd/credentials.json`.

### Commands

#### `athrd auth`

Authenticate with GitHub using a Personal Access Token or Device Flow.

#### `athrd logout`

Log out and clear stored credentials.

#### `athrd list`

List items (requires authentication).

Options:

- `-t, --type <type>`: Filter by item type

#### `athrd create`

Create a new item interactively (requires authentication).

The CLI will prompt you for:

- Item name
- Description (optional)
- Type selection
- Confirmation

#### `athrd help`

Display help information for all commands.

Use `athrd [command] --help` for help on a specific command.

## Development

### Build

```bash
npm run build
```

### Run locally

```bash
npm run dev
```

### Project Structure

```
src/
├── index.ts              # Main entry point
├── commands/
│   ├── auth.ts          # Authentication command
│   ├── logout.ts        # Logout command
│   ├── list.ts          # List command
│   └── create.ts        # Create command
└── utils/
    ├── auth.ts          # Authentication utilities
    └── credentials.ts   # Credential management
```

## Features

- ✅ GitHub authentication
- ✅ Interactive prompts with Inquirer
- ✅ Secure credential storage
- ✅ Color-coded output with Chalk
- ✅ TypeScript support
- ✅ Modular command structure

## License

ISC
