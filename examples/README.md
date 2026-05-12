# ipscope smoke tests

Quick ways to confirm your install works end-to-end without uploading your own image.

## 1. Public-domain trademark

In Claude Code:

```
/ipscope https://upload.wikimedia.org/wikipedia/commons/3/36/AT%26T_logo_2016.svg.png
```

Expected: `HIGH risk — AT&T Logo — Trademarks — sim ~1.00`. Confirms the wrapper, your API key, and the CopySight API are all wired up.

## 2. Inline attachment (the killer feature)

Drag any image into the chat. Then:

```
/ipscope
```

No arguments. The MCP server reads the latest user-attached image from this project's Claude Code session transcript at `~/.claude/projects/<sanitized-cwd>/*.jsonl` and runs it. Should return a verdict within ~2 seconds.

## 3. Local file

```
/ipscope ~/Downloads/whatever.jpg
```

`~/` is expanded; symlinks are refused; non-image files are refused.

## Reading the result

- `risk_level: HIGH` — sim ≥ 0.7 anywhere; do not release without licensing.
- `risk_level: MEDIUM` — 0.4 ≤ sim < 0.7; check the specific match.
- `risk_level: LOW` — sim < 0.4 or zero detections; cleared.
- `bounding_box` values are **normalized** (0..1 of image dimensions). Multiply by width/height for pixels.
- `contains_face: true` means there's a human face in the frame — useful for "is this a real person?" gating even when no specific celebrity is matched.

## Troubleshooting

- `401 Unauthorized`: `COPYSIGHT_API_KEY` missing or invalid. Re-run `claude mcp add ipscope -s user -e COPYSIGHT_API_KEY=cs_live_…`.
- `400 Bad Request`: file isn't an image CopySight accepts. PNG / JPEG / GIF / WEBP only.
- `429 Too Many Requests`: you hit your plan's rate limit. Honor the `retry-after` seconds.
- `Input is not a recognised image`: ipscope's local magic-byte check refused the file before sending. That's a feature, not a bug — verify you're pointing at a real image.
