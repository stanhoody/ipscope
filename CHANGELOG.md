# Changelog

All notable changes to **ipscope** are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [0.2.0] — 2026-05-12

### Security
- **Scoped transcript scan** — when called with no arguments, the server now reads ONLY the calling project's own session transcript (`~/.claude/projects/<sanitized-cwd>/*.jsonl`) instead of walking all projects globally. Eliminates cross-project image leakage when multiple Claude Code windows are open.
- **Symlink rejection** — both transcript candidates and `file_path` inputs are now `lstat`'d; only regular files are accepted. Refuses planted symlinks aimed at exfiltrating arbitrary user files as "images".
- **SSRF guard on `image_url`** — http(s) only, hostnames are DNS-resolved before fetch, and private / loopback / link-local / IPv6-ULA / metadata (`169.254.169.254`) destinations are rejected with a clear error.
- **Magic-byte image sniff** — every input (file_path, image_url, image_base64) is checked for PNG/JPEG/GIF/WEBP magic bytes before upload. Non-image content is refused locally, never reaching CopySight.
- **API base hardcoded** — `COPYSIGHT_API_BASE` env override removed. The base is pinned to `https://api.copysight.ai/v1` so an attacker-influenced env can't redirect calls to an arbitrary host (which would have leaked the `X-API-Key`).
- **Fetch hardening** — 30 s timeout via `AbortSignal`, 25 MiB max image size, `redirect: "error"` to block redirect-based SSRF.

### Added
- `~/` is expanded in `file_path`.
- Strict transcript parsing: requires both `entry.type === "user"` AND `entry.message.role === "user"`.
- `examples/` smoke-test instructions in the README.
- `NOTICE` file with trademark attribution.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, this changelog.
- `package.json` repository / author / bugs metadata.
- `package-lock.json` committed for reproducible installs.

### Changed
- Bumped `@modelcontextprotocol/sdk` 1.0.4 → 1.20.x (~tilde-pinned).
- Bumped `zod` 3.23 → 3.24 (~tilde-pinned).
- README: hero rewritten; added Privacy & data, Trademarks, and Smoke-test sections; cross-platform notes for Windows/PowerShell; cost-exposure warning; stale `node -e` local-dev snippet removed.
- LICENSE: restored to byte-identical OSI MIT; CopySight attribution moved to `NOTICE`.
- All references to CopyScore now carry the ™ symbol.

### Fixed
- `summary.top` now contains copies of the detection objects, not references, so callers can mutate them safely.

## [0.1.0] — 2026-05-12

Initial release. Single MCP tool `verify_image` posting images to `api.copysight.ai/v1/verify`. Auto-pull of inline chat attachments from session JSONL transcripts. Skill + slash command + plugin manifest.
