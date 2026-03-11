# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Pixel Office, please report it responsibly.

**Email:** [Open a private security advisory](https://github.com/fedevgonzalez/pixel-office/security/advisories/new) on GitHub.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

I'll acknowledge your report within 48 hours and work on a fix.

## Scope

Pixel Office is a local visualization tool. The main security surface is:
- **standalone-server.js** — HTTP + WebSocket server (binds to `0.0.0.0` by default)
- **WebSocket protocol** — accepts reporter connections and browser clients
- **File system access** — reads `~/.claude/projects/` JSONL files and `~/.pixel-office/layout.json`

## Best Practices

- Run the server on a trusted network (LAN). It has no authentication.
- If exposing to the internet, put it behind a reverse proxy with auth (e.g., Caddy, nginx).
- Keep your `.env` file out of version control (it's in `.gitignore`).
