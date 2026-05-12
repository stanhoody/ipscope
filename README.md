# ipscope

**Claude Code plugin for IP infringement checks.** Drop an image (file path or URL), get back a list of detected protected IP — characters, celebrities, trademarks, brand/iconic designs, artworks — each with a similarity score (0..1), owner, author, and bounding box. The plugin computes a risk level (HIGH / MEDIUM / LOW) so you know whether the asset is safe to release.

Powered by the [CopySight](https://copysight.ai) CopyScore engine. **Bring your own API key.**

## What you get

- **Slash command** — `/ipscope <file_or_url>` — explicit, scriptable.
- **Skill** — auto-triggers when you ask "check this image for IP", "is this safe to publish", "scan for trademarks", etc.
- **MCP tool** — `mcp__ipscope__verify_image` — directly callable from any Claude Code session.

## Install

```bash
# 1. Clone (anywhere — ~/Documents/Code/ is a good default)
git clone https://github.com/stanhoody/ipscope.git ~/Documents/Code/ipscope

# 2. Install MCP server deps
cd ~/Documents/Code/ipscope/mcp && npm install

# 3. Register the MCP server with Claude Code (user-scoped, with your API key)
claude mcp add ipscope -s user \
  -e COPYSIGHT_API_KEY=cs_live_xxxxxxxxxxxxxxxx \
  -- node ~/Documents/Code/ipscope/mcp/server.js

# 4. Verify
claude mcp list | grep ipscope
# expected:  ipscope: node ... - ✓ Connected
```

Restart Claude Code if it was already running. The MCP tool `mcp__ipscope__verify_image` is now available in every session.

### Also install the skill + slash command (optional but recommended)

The MCP tool is enough to call from prompts. To get the auto-triggering skill and the `/ipscope <file>` slash command, copy them into your Claude Code config tree:

```bash
mkdir -p ~/.claude/skills ~/.claude/commands
cp -R ~/Documents/Code/ipscope/skills/ipscope ~/.claude/skills/
cp    ~/Documents/Code/ipscope/commands/ipscope.md ~/.claude/commands/
```

(If you prefer plugin-style installation, the `.claude-plugin/plugin.json` manifest in this repo works with `/plugin install` — see Claude Code's plugin docs.)

## Get a CopySight API key

CopySight sells API access to enterprises and AI platforms — pricing is volume-based with Evaluation and Pilot tiers for trial accounts. Contact <https://copysight.ai/contact> or talk to your account manager. Keys look like `cs_live_xxxxxxxxxxxxxxxx`.

## Usage

### Slash command

```
/ipscope /Users/me/Downloads/cover.jpg
/ipscope https://cdn.example.com/poster.png
```

### Natural language

```
> check this image for IP: ~/Downloads/cover.jpg
> is this AI image safe to publish? https://i.imgur.com/abcd.png
> проверь на копирайт-риски /tmp/render.jpg
```

The skill picks it up automatically.

### Direct MCP call

```
Tool: mcp__ipscope__verify_image
Args: { "file_path": "/abs/path/to/image.png" }
```

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

## Errors

| Status | Meaning                                                                |
|--------|------------------------------------------------------------------------|
| 401    | `COPYSIGHT_API_KEY` missing or invalid.                                |
| 400    | Unsupported / corrupted file. Images + GIF only (video API in beta).   |
| 429    | Rate limit exceeded. Honor the `retry-after` seconds.                  |

## Limitations

- **Images only** today. Video is in beta on CopySight's side — not wired into this plugin yet.
- **One image per call.** Batch via your own loop or scripting.
- **Public docs at <https://copysight.ai/docs> are stale** — the live API returns `{contains_face, detected_ips[]}` with `similarity` (0..1) and normalized bounding boxes. This plugin uses the live shape, not the documented one.

## Requirements

- Node.js 18+
- Claude Code (plugin install) or any MCP-compatible client
- A CopySight API key

## Local development

```
cd mcp
npm install
COPYSIGHT_API_KEY=cs_live_xxx npm run inspect    # opens MCP Inspector
```

To smoke-test against a real image:

```
COPYSIGHT_API_KEY=cs_live_xxx node -e '
import("./mcp/server.js");
' &
# Then send JSON-RPC over stdio — or just use Inspector.
```

## License

MIT — see [LICENSE](./LICENSE).

`ipscope` wraps the CopySight API; the underlying CopyScore engine, the trained models, and the IP catalog belong to CopySight AI, Inc. This plugin is open-source glue.

## Credits

Built by [Stan Hoody](https://github.com/stanhoody) using Claude Code. CopyScore engine by [CopySight](https://copysight.ai).
