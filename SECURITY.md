# Security policy

## Reporting a vulnerability

Email **stan@copysight.ai** with the subject line `ipscope security: <short description>`. Do NOT open a public issue for vulnerabilities. Expect an initial reply within 3 business days.

PGP optional, not required.

## Scope

`ipscope` is a thin MCP wrapper around the CopySight CopyScore™ HTTP API. The threat model here covers the wrapper itself, not the upstream CopySight service. For issues with `api.copysight.ai`, contact CopySight directly.

## Threat model

| Vector | Mitigation in code |
|---|---|
| Cross-project image leakage when the no-arg fallback fires | Server scans only `~/.claude/projects/<sanitized-cwd>/*.jsonl`; scoped to the calling project's own session dir |
| Symlink-coerced arbitrary file read | `lstat` on every transcript candidate and `file_path`; non-regular files refused |
| SSRF via `image_url` | http(s)-only allowlist; DNS-resolved hostname checked against private / loopback / link-local / IPv6-ULA / metadata addresses before fetch; `redirect: "error"` blocks redirect-based bypass |
| `COPYSIGHT_API_BASE` redirection → API-key exfiltration | Base is hardcoded to `https://api.copysight.ai/v1`; env override removed |
| Non-image content exfiltrated as "image" (e.g. `~/.ssh/id_rsa` via prompt-injected `file_path`) | Magic-byte sniff (PNG / JPEG / GIF / WEBP) on every input; non-image refused locally |
| Oversize-input DoS | 25 MiB max image size; base64 length pre-check before decode |
| Slow / hung remote | 30 s `AbortSignal.timeout` on every outbound `fetch` |
| API-key leakage | Key is read from process env only; never written to stderr, error messages, or response bodies |

## Out of scope

- Compromise of the host machine, the user's CopySight API key at rest, or the upstream CopySight service.
- Abuse of a legitimate API key by its owner (rate-limit enforcement is CopySight's responsibility).
- Side-channel attacks against the local DNS resolver, network stack, or Node.js runtime.

## Hardening recommendations for users

- Treat `cs_live_…` as a production secret. Don't commit it, share it, or pass it to untrusted MCP configs.
- Mind your loops — every call is a billable check on your CopySight plan.
- Keep Node.js patched (Node 18+ required).
- Periodically run `npm audit` inside the `mcp/` directory.
