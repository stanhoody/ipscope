# Contributing to ipscope

Thanks for the interest. This is a small, opinionated plugin — keep PRs small and surgical.

## Ground rules

- **Minimum surface.** Don't add features beyond what's explicitly needed. The whole MCP is one tool. Keep it that way unless CopySight ships new endpoints worth wrapping.
- **No build step.** Pure ES module JS in `mcp/server.js`. No TypeScript, no bundler. If you want TS for editing, use JSDoc.
- **No new dependencies** without a strong reason. Today: `@modelcontextprotocol/sdk` + `zod`. Adding a third dep needs a justification in the PR description.
- **Security first.** Anything that touches the filesystem or the network goes through the existing guards (`lstat`, magic-byte sniff, SSRF allowlist). If you're adding a new input path, audit it against [SECURITY.md](./SECURITY.md).
- **Match the existing style.** Single-file server, helpers grouped at top, registered tool at bottom. No emoji in commits, code, or docs.

## Development

```bash
git clone https://github.com/stanhoody/ipscope.git
cd ipscope/mcp
npm install
COPYSIGHT_API_KEY=cs_live_xxx npm run inspect    # MCP Inspector UI
```

## PR checklist

- [ ] One concern per PR. Refactors land separately from features.
- [ ] Updated `CHANGELOG.md` under an `[Unreleased]` heading (or named version if you're cutting one).
- [ ] If you touched `mcp/server.js`, smoke-tested with at least one real call (a public image URL or a local file).
- [ ] If you added an input path, you also added a magic-byte / size / source guard.
- [ ] `README.md` reflects the change.
- [ ] Commit messages explain *why*, not *what*.

## Filing issues

- Bugs: include OS, Node version, Claude Code version, and the exact `claude mcp add` command you used.
- Security issues: see [SECURITY.md](./SECURITY.md). Do NOT open public issues for those.
- Feature requests: tell us the use case, not the design. We may say no.

## Release process

1. Bump versions in `mcp/package.json` and the `McpServer({ version: ... })` call in `mcp/server.js`.
2. Add the changelog entry.
3. Smoke-test against a real CopySight key.
4. `git tag vX.Y.Z`, push tag, draft a GitHub release with the changelog body.

## License

Contributions land under the MIT license of this repository. See [LICENSE](./LICENSE).
