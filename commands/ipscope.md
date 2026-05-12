---
description: Run an IP infringement check on an image (inline attachment, file path, or public URL)
argument-hint: [file_path_or_url — optional if an image is attached inline]
---

The user wants to scan an image for IP infringement. Arguments: **$ARGUMENTS**

Pick the call shape based on what the user supplied:

1. `$ARGUMENTS` starts with `http://` / `https://` / `data:` → pass as `image_url`.
2. `$ARGUMENTS` looks like a local path (starts with `/`, `~`, or `./`) → pass as `file_path` (expand `~` first). Strip surrounding quotes.
3. `$ARGUMENTS` empty AND the user attached an image inline to the chat → you can SEE the image but Claude Code does not surface the raw bytes to MCP tools. Reply (one short message, no rendering yet):
   > Картинку вижу, но MCP-туллу нужны байты на диске или публичный URL. Самый быстрый способ: в Finder зажми ⌥ Option и перетащи файл — подставится абсолютный путь. Или дай URL.
   Then wait for the user's next message with a path/URL.
4. `$ARGUMENTS` empty AND no inline image → ask the user for a path or URL.

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
