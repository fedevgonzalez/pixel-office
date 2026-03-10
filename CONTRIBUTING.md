# Contributing to Pixel Office

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Clone the repo and install dependencies:

```sh
git clone https://github.com/fedevgonzalez/pixel-office.git
cd pixel-office
npm install
cd webview-ui && npm install && cd ..
```

2. Build the webview:

```sh
npm run build
```

3. Run the server:

```sh
node standalone-server.js
```

Open http://localhost:3300 to see the app.

## Code Style

- **TypeScript** for all webview code (`webview-ui/src/`)
- **No `enum`** — use `as const` objects instead
- **`import type`** for type-only imports
- **No unused locals or parameters** (`noUnusedLocals` / `noUnusedParameters` are enforced)
- **No magic numbers** — centralize constants in `webview-ui/src/constants.ts` or CSS `:root` variables
- See `CLAUDE.md` for the full set of conventions

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes and verify the build passes (`npm run build`)
4. Commit with a clear message describing the change
5. Push to your fork and open a Pull Request against `master`

Keep PRs focused on a single change. If you're fixing a bug and adding a feature, send them as separate PRs.

## Reporting Issues

Open a GitHub Issue with a clear description, steps to reproduce, and (if applicable) screenshots or browser console output.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
