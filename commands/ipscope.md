---
description: Run an IP infringement check on an image (file path or public URL)
argument-hint: <file_path_or_url>
---

The user wants to scan this for IP infringement: **$ARGUMENTS**

1. Decide whether `$ARGUMENTS` is a URL (starts with `http://` or `https://`) or a local path. Strip surrounding quotes.
2. Call `mcp__ipscope__verify_image`:
   - URL → `image_url`
   - Path → `file_path`
3. From the structured response, render exactly:

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
