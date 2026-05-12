---
name: ipscope
description: Check an image or file for IP infringement risk using the CopySight CopyScore engine. Use whenever a user asks to verify an image, check for IP / copyright / similar trademarks / characters / celebrities / brands / artworks, score the risk of releasing AI-generated content, or get a "CopyScore" / "IP score". Triggers on phrases like "check this image", "is this safe to publish", "scan for IP", "verify before release", "проверь на IP", "это можно публиковать?".
---

# ipscope — IP infringement check

You have access to the CopySight CopyScore engine through the `ipscope` MCP server. Use it whenever the user wants to know whether an image contains protected IP before they publish or ship it.

## Tool

`mcp__ipscope__verify_image`

**Inputs** — provide ONE, or NONE:
- `file_path` — absolute local path to image (jpg/png/gif/webp). Use when the user gives a path.
- `image_url` — public URL or `data:` URI. Use when the user gives a URL.
- `image_base64` + `mime_type` — raw base64 string. Rarely needed; the auto-pull below covers most cases.
- (no args) — the server auto-pulls the most recent inline image from the active Claude Code session transcript (`~/.claude/projects/.../*.jsonl`). Use this when the user attached an image inline to the chat.
- `filename` (optional) — override multipart filename.

## Decision rule

1. User attached an image inline to the chat (image content block) → call `mcp__ipscope__verify_image` with **no arguments**. The server will find the image and run it. Don't ask for a path.
2. User gave a URL → call with `image_url`.
3. User gave a path → call with `file_path` (expand `~`).
4. Nothing — neither inline image nor path/URL → ask the user to drop the image into chat or give a path/URL.

Never invent a path. If the auto-pull fails because no transcript image is found, the server returns a clear error — surface it to the user.

**Output** (structured):
- `contains_face` (bool) — image contains a human face.
- `detections[]` — each: `category`, `name`, `owner`, `author`, `similarity` (0..1), `bounding_box` (normalized 0..1).
- `summary` — `total`, `max_similarity`, `risk_level` (HIGH ≥0.7 / MEDIUM ≥0.4 / LOW), `by_category`, `top` (5 highest similarity).

Categories observed: `Trademarks`, `Brand and iconic designs`, `Characters`, `Celebrities and famous people`, `Art and artists`.

## How to present results

1. **Lead with risk level.** One line: `<RISK_LEVEL> risk — N detection(s). Top: <name> (<category>, sim <X.XX>).`
2. **Compact table of all detections** (name, category, owner, similarity).
3. **Bounding boxes** — only mention if user asks. They're normalized 0..1; multiply by image dimensions for pixels.
4. **Contains_face** — mention only if true.
5. **Recommendation** when relevant:
   - HIGH → recommend not publishing without licensing / human IP review.
   - MEDIUM → flag the specific match, suggest checking license / fair use.
   - LOW → cleared, mention top weak matches only if user asks for detail.

Keep it tight. No emoji unless the user asked for them.

## Errors

- `401 Unauthorized` → `COPYSIGHT_API_KEY` missing/invalid. Tell user to set it (see README).
- `400 Bad Request` → unsupported file format (images + GIF only; video beta not yet exposed).
- `429 Too Many Requests` → rate-limited; honor `retry-after`.

## Setup check

If the tool returns a 401 or never registers, the user hasn't set their API key. Walk them through: get a key from CopySight, set `COPYSIGHT_API_KEY` in their Claude Code MCP server config's `env`.
