---
description: Run an IP infringement check on an image (inline attachment, file path, or public URL)
argument-hint: [file_path_or_url — optional if an image is attached inline]
---

The user wants to scan an image for IP infringement. Arguments: **$ARGUMENTS**

Pick the call shape based on what the user supplied:

1. `$ARGUMENTS` starts with `http://` / `https://` / `data:` → call `mcp__ipscope__verify_image` with `image_url=$ARGUMENTS`.
2. `$ARGUMENTS` looks like a local path (starts with `/`, `~`, or `./`) → call with `file_path` (expand `~` first). Strip surrounding quotes.
3. `$ARGUMENTS` empty (typical when the user attached an image inline) → call `mcp__ipscope__verify_image` **with no arguments**. The server will read the active Claude Code session transcript and pull the most recent inline image automatically. Do NOT ask for a path.
4. If the tool returns an error indicating it couldn't find an image, then ask the user for a path or URL.

Call `mcp__ipscope__verify_image` with the chosen field. Then from the structured response, render exactly:

```
<RISK_LEVEL> risk — <N> detection(s)[, contains face]

Top match: <name> · <category> · <owner> · similarity <X.XX>

Detections:
| # | Name | Category | Owner | Similarity |
|---|------|----------|-------|------------|
| 1 | ... | ... | ... | 0.XX |
```

Then add a one-line recommendation:
- HIGH (≥0.7) → "Do not release without explicit license or human IP review."
- MEDIUM (0.4–0.7) → "Review the matched IP; consider licensing or replacement."
- LOW (<0.4) → "Cleared. Weak matches only."

If the tool returns an error, surface the message verbatim and point to the `COPYSIGHT_API_KEY` setup in the plugin README.

No emoji. No fluff.
