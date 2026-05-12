---
description: Run an IP infringement check on an image (inline attachment, file path, or public URL)
argument-hint: [file_path_or_url — optional if an image is attached inline]
---

The user wants to scan an image for IP infringement. Arguments: **$ARGUMENTS**

Pick the call shape based on what the user supplied:

1. **Image attached inline in the chat** (image content block in the recent messages) — read the base64 from the image's `source.data` and pass it to the tool as `image_base64`. Also pass `mime_type` (e.g. `"image/jpeg"`, `"image/png"`) from the image's `source.media_type`. Do NOT ask the user for a file path; the image is already here.
2. `$ARGUMENTS` starts with `http://` / `https://` / `data:` → pass as `image_url`.
3. `$ARGUMENTS` looks like a local path (starts with `/`, `~`, or `./`) → pass as `file_path` (expand `~` first). Strip surrounding quotes.
4. `$ARGUMENTS` empty AND no inline image → ask the user to either drop the image into the chat or give a path/URL.

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
