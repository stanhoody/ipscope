---
name: ipscope
description: Check an image or file for IP infringement risk using the CopySight CopyScore engine. Use whenever a user asks to verify an image, check for IP / copyright / similar trademarks / characters / celebrities / brands / artworks, score the risk of releasing AI-generated content, or get a "CopyScore" / "IP score". Triggers on phrases like "check this image", "is this safe to publish", "scan for IP", "verify before release", "проверь на IP", "это можно публиковать?".
---

# ipscope — IP infringement check

You have access to the CopySight CopyScore engine through the `ipscope` MCP server. Use it whenever the user wants to know whether an image contains protected IP before they publish or ship it.

## Tool

`mcp__ipscope__verify_image`

**Input** — provide ONE of:
- `file_path` — absolute local path to image (jpg/png/gif/webp). Use when the user gives a path.
- `image_url` — public URL or `data:` URI. Use when the user gives a URL.
- `image_base64` + `mime_type` — raw base64 string. Use only when bytes are actually available to you (e.g. you just wrote/loaded the file in this same turn). Most Claude Code clients do NOT surface raw bytes from inline chat attachments to the tool layer, so don't assume this works for drag-and-dropped images.
- `filename` (optional) — override multipart filename.

## What to do when the user attached an image inline to the chat

Most clients (including Claude Code today) do not expose the raw bytes of an inline-attached image to the agent — you can see the image visually but you cannot read `source.data` as a string to forward. **Do not pretend you can.** Instead, ask the user for a path or URL, and tell them the fastest way to produce one. One short, friendly message:

> Картинку в чате я вижу, но MCP-туллу нужны байты на диске. Кинь путь или ссылку — быстрее всего так:
> - в Finder зажми **⌥ Option** и перетащи файл в чат → подставится абсолютный путь
> - или скопируй файл и `pbpaste` -ом сохрани во временный путь (если есть `pngpaste`: `pngpaste /tmp/ipscope.png`)
> - или дай публичный URL

Then wait for the user's reply with a path/URL and run `verify_image`. Do not invent a path.

If the user has clearly already given you a path or URL in the same message (even alongside an inline image), use that and skip the prompt.

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
