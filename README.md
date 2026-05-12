# ipscope

> Drop an AI-generated image into Claude Code. Get back who owns what's in it — with a risk score, owner names, and bounding boxes — in 2 seconds.

A Claude Code plugin that wraps the **CopySight CopyScore™** engine. Detects characters, celebrities, trademarks, brand designs, and artworks in any image. Returns a similarity score (0..1), the owner, the author, and a normalized bounding box for each match — plus a HIGH / MEDIUM / LOW risk verdict.

**Bring your own CopySight API key** (`cs_live_…`). MIT-licensed open-source glue; the underlying CopyScore™ engine, models, and IP catalog belong to CopySight AI, Inc.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE) ![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen) [![GitHub stars](https://img.shields.io/github/stars/stanhoody/ipscope?style=social)](https://github.com/stanhoody/ipscope)

## Three ways to invoke

```text
1. Drop an image into chat   →   /ipscope                  ← no args, server auto-pulls from chat
2. Path                       →   /ipscope ~/poster.png
3. URL                        →   /ipscope https://i.imgur.com/abc.png
```

Or just talk to Claude: *"check this for IP"*, *"проверь это"*, *"is this safe to publish"* — the skill auto-triggers.

## Install

```bash
git clone https://github.com/stanhoody/ipscope.git ~/Documents/Code/ipscope
cd ~/Documents/Code/ipscope/mcp && npm install

claude mcp add ipscope -s user \
  -e COPYSIGHT_API_KEY=cs_live_REPLACE_ME \
  -- node ~/Documents/Code/ipscope/mcp/server.js

claude mcp list | grep ipscope     # expect ✓ Connected

mkdir -p ~/.claude/skills ~/.claude/commands
cp -R ~/Documents/Code/ipscope/skills/ipscope ~/.claude/skills/
cp    ~/Documents/Code/ipscope/commands/ipscope.md ~/.claude/commands/
```

Restart Claude Code if it was already running. The MCP tool `mcp__ipscope__verify_image`, the skill, and the slash command are now available globally.

### Windows / PowerShell

Use `$HOME` instead of `~`, `New-Item -ItemType Directory -Force` instead of `mkdir -p`, `Copy-Item -Recurse` instead of `cp -R`. Replace the trailing `\` line continuations with backtick `` ` `` continuations.

### Get a CopySight API key

CopySight sells API access — Evaluation, Pilot, and Enterprise tiers — and bills per check. Contact <https://copysight.ai/contact>. Each API call is a billable check on your plan — **mind your loops**.

## What you get

| | |
|---|---|
| **MCP tool** | `mcp__ipscope__verify_image` — direct from any Claude Code session |
| **Slash command** | `/ipscope [file_or_url]` |
| **Skill** | Auto-triggers on natural-language IP-check requests (EN + RU) |

## Smoke test

After install, in Claude Code:

```
/ipscope https://upload.wikimedia.org/wikipedia/commons/3/36/AT%26T_logo_2016.svg.png
```

Expected output (truncated): `HIGH risk — AT&T Logo — Trademarks — sim ~1.00`.

Or drop any image into chat and type `/ipscope`.

## Output shape

```jsonc
{
  "contains_face": false,
  "detections": [
    {
      "category": "Trademarks",
      "name": "Warner Bros. Logo",
      "author": "Warner Bros. Entertainment Inc.",
      "owner": "Warner Bros. Discovery",
      "bounding_box": { "x": 0.294, "y": 0.172, "width": 0.412, "height": 0.656 },
      "similarity": 1.0
    }
  ],
  "summary": {
    "total": 1,
    "max_similarity": 1.0,
    "risk_level": "HIGH",
    "by_category": { "Trademarks": 1 },
    "top": [/* up to 5 highest-similarity */]
  }
}
```

- `similarity` — 0..1 (1.0 = perfect match).
- `bounding_box` — **normalized** 0..1 of image dimensions. Multiply by width/height for pixels.
- `risk_level` — derived from `max_similarity`: HIGH (≥0.7), MEDIUM (≥0.4), LOW (<0.4).

Categories observed: `Trademarks`, `Brand and iconic designs`, `Characters`, `Celebrities and famous people`, `Art and artists`.

## Direct MCP call

```jsonc
{ }                                                      // auto-pull from chat
{ "file_path": "/abs/path/to/image.png" }
{ "image_url": "https://..." }
{ "image_base64": "<base64>", "mime_type": "image/png" }
```

## Privacy & data handling

- **Where bytes go:** every call sends one image to `https://api.copysight.ai/v1/verify` over HTTPS, with your `cs_live_…` key in `X-API-Key`. Nothing is sent anywhere else.
- **What the server reads locally:** when called with no arguments, the server reads ONLY this project's own Claude Code session transcript at `~/.claude/projects/<sanitized-cwd>/*.jsonl` to find the latest inline image you attached. It does NOT scan other projects, other sessions, or any file outside that directory.
- **What's blocked:** symlinks (refused), non-image files (refused via magic-byte sniff), private/loopback/link-local URLs (SSRF guard), images larger than 25 MiB (refused).
- **Logs:** the server prints only the API base and version to stderr. No key, no image bytes, no request bodies are logged.

See [SECURITY.md](./SECURITY.md) for the full threat model.

## Errors

| Status | Meaning                                                                |
|--------|------------------------------------------------------------------------|
| 401    | `COPYSIGHT_API_KEY` missing or invalid.                                |
| 400    | Unsupported / corrupted file. Images + GIF only (video API in beta).   |
| 429    | Rate limit exceeded. Honor the `retry-after` seconds.                  |

## Limitations

- **Images only.** Video is in beta on CopySight's side, not exposed here yet.
- **One image per call.** Batch via your own loop. Each call is a billable check.
- **Public docs at <https://copysight.ai/docs> are catching up** — this plugin is built against the live v1 response shape (`{contains_face, detected_ips[]}` with `similarity` 0..1 and normalized bboxes), not the older shape the public docs still describe.

## Requirements

- Node.js 18+
- Claude Code
- A CopySight API key (Evaluation / Pilot / Enterprise)

## Local development

```bash
cd mcp
npm install
COPYSIGHT_API_KEY=cs_live_xxx npm run inspect    # opens MCP Inspector
```

## License & trademarks

[MIT](./LICENSE) for the wrapper code in this repo.

The CopyScore™ engine, models, IP catalog, and HTTP API at `api.copysight.ai` are the property of **CopySight AI, Inc.** and are NOT covered by this license. See [NOTICE](./NOTICE) for the full attribution.

"CopySight" and "CopyScore" are trademarks of CopySight AI, Inc., used here as nominative attribution.

## Credits

Built by [Stan Hoody](https://github.com/stanhoody) using Claude Code. CopyScore™ engine by [CopySight](https://copysight.ai).
