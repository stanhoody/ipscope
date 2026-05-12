#!/usr/bin/env node
// ipscope — MCP server wrapping the CopySight CopyScore™ API.
// Single tool: verify_image. Pure ES module JS, no build step.
// See SECURITY.md for the threat model these defenses target.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, readdir, lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import dns from "node:dns/promises";
import net from "node:net";

// ────────────────────────────────────────────────────────────────────────────
// Config — API base is pinned. Override only via explicit CLI override file or
// re-publish. We refuse to read it from env because env is trivially attacker-
// influenced and an alternate base + a valid X-API-Key = key exfiltration.
const API_BASE = "https://api.copysight.ai/v1";
const API_KEY = process.env.COPYSIGHT_API_KEY;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MiB
const FETCH_TIMEOUT_MS = 30_000;

if (!API_KEY) {
  console.error(
    "ipscope: COPYSIGHT_API_KEY is not set. Register the server with your key:\n" +
      "  claude mcp add ipscope -s user -e COPYSIGHT_API_KEY=cs_live_... -- node /abs/path/mcp/server.js"
  );
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Schemas

const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const Detection = z.object({
  category: z.string(),
  name: z.string(),
  author: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  bounding_box: BoundingBox.nullable().optional(),
  similarity: z.number(),
});

const VerifyResponse = z.object({
  contains_face: z.boolean().optional(),
  detected_ips: z.array(Detection),
});

// ────────────────────────────────────────────────────────────────────────────
// Image magic-byte sniff. Refuses non-image content so a prompt-injected
// `file_path: ~/.ssh/id_rsa` (or transcript-loaded /etc/passwd via symlink)
// can't be exfiltrated to CopySight as "an image".

function sniffImageMime(bytes) {
  if (bytes.length < 12) return null;
  // PNG  89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  // JPEG  FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  // GIF  47 49 46 38 (3|5) 61
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  )
    return "image/gif";
  // WEBP  "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

function extFromSniff(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function expandHome(p) {
  if (typeof p !== "string") return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

// ────────────────────────────────────────────────────────────────────────────
// SSRF guard for image_url. http(s) only; rejects loopback / private /
// link-local / IPv6 unique-local & link-local. Done after DNS resolve so an
// attacker can't bypass with `evil.example.com → 127.0.0.1`.

function isBlockedIp(ip) {
  if (!net.isIP(ip)) return true; // unparseable → refuse
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map((n) => parseInt(n, 10));
    if (a === 10) return true;                              // 10/8
    if (a === 127) return true;                             // loopback
    if (a === 0) return true;                               // 0/8
    if (a === 169 && b === 254) return true;                // link-local / IMDS
    if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16/12
    if (a === 192 && b === 168) return true;                // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT 100.64/10
    if (a === 224) return true;                             // multicast (rough)
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;               // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true;                  // multicast
  if (lower.startsWith("::ffff:")) {                        // IPv4-mapped
    return isBlockedIp(lower.replace("::ffff:", ""));
  }
  return false;
}

async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`image_url is not a valid URL: ${rawUrl}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(
      `image_url scheme not allowed (${u.protocol}). Only http(s) URLs are accepted.`
    );
  }
  const host = u.hostname;
  // Allow direct IPs to fall through to the IP check; resolve hostnames first.
  let ips;
  if (net.isIP(host)) {
    ips = [host];
  } else {
    try {
      const records = await dns.lookup(host, { all: true });
      ips = records.map((r) => r.address);
    } catch (e) {
      throw new Error(`Cannot resolve image_url host '${host}': ${e.message}`);
    }
  }
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(
        `image_url '${host}' resolves to a blocked address (${ip}). ` +
          "Private/loopback/link-local destinations are rejected to prevent SSRF."
      );
    }
  }
}

async function fetchImageUrlSafe(rawUrl) {
  await assertSafeUrl(rawUrl);
  const ctrl = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const res = await fetch(rawUrl, { signal: ctrl, redirect: "error" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch image_url (${res.status} ${res.statusText}): ${rawUrl}`
    );
  }
  // Size guard via Content-Length when present.
  const cl = res.headers.get("content-length");
  if (cl && Number(cl) > MAX_IMAGE_BYTES) {
    throw new Error(
      `Refused: image_url advertises ${cl} bytes, exceeds limit (${MAX_IMAGE_BYTES}).`
    );
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `Refused: downloaded image is ${ab.byteLength} bytes, exceeds limit (${MAX_IMAGE_BYTES}).`
    );
  }
  return { bytes: Buffer.from(ab), contentType: res.headers.get("content-type") };
}

// ────────────────────────────────────────────────────────────────────────────
// Transcript fallback.
//
// The MCP server is spawned by Claude Code with cwd = the project root. We map
// cwd to the same sanitization Claude Code uses for `~/.claude/projects/` dir
// names (full path with all `/` → `-`) and ONLY look at JSONLs under that
// project's own session dir. This blocks cross-project leakage.
//
// All candidate files are lstat'd; symlinks and non-regular files are skipped
// so a malicious symlink can't be coerced into shipping arbitrary files to
// CopySight as "an image".

function sanitizeProjectDirName(absDir) {
  return absDir.replace(/\//g, "-");
}

async function findActiveTranscript() {
  const projectDir = process.cwd();
  const sanitized = sanitizeProjectDirName(projectDir);
  const sessionDir = join(homedir(), ".claude", "projects", sanitized);

  let entries;
  try {
    entries = await readdir(sessionDir);
  } catch {
    return null;
  }
  let best = null;
  for (const f of entries) {
    if (!f.endsWith(".jsonl")) continue;
    const fp = join(sessionDir, f);
    const s = await lstat(fp).catch(() => null);
    if (!s || !s.isFile()) continue; // regular files only — refuses symlinks
    if (!best || s.mtimeMs > best.mtime) best = { fp, mtime: s.mtimeMs };
  }
  return best?.fp ?? null;
}

async function findLatestUserImage(transcriptPath) {
  const raw = await readFile(transcriptPath, "utf8");
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Strict: top-level type AND message.role must both be "user". The two
    // fields encode different things in CC's JSONL format; AND-ing avoids
    // matching tool-result rows or future format variations.
    if (entry?.type !== "user") continue;
    if (entry?.message?.role !== "user") continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const blk = content[j];
      if (
        blk?.type === "image" &&
        blk?.source?.type === "base64" &&
        typeof blk.source.data === "string" &&
        blk.source.data.length > 0
      ) {
        return { base64: blk.source.data, mime: blk.source.media_type };
      }
    }
  }
  return null;
}

async function loadFromActiveChat() {
  const tp = await findActiveTranscript();
  if (!tp) {
    throw new Error(
      "No Claude Code session transcript found for this project " +
        `(cwd=${process.cwd()}). Provide file_path, image_url, or image_base64 explicitly.`
    );
  }
  const found = await findLatestUserImage(tp);
  if (!found) {
    throw new Error(
      `No inline image attachment found in the active session transcript (${tp}). ` +
        "Attach an image to the chat, or provide file_path / image_url."
    );
  }
  return found;
}

// ────────────────────────────────────────────────────────────────────────────
// Input loaders — every path returns raw bytes + a hinted filename. Sniffing
// happens once, downstream, so a non-image is rejected regardless of source.

function decodeBase64ToBytes(raw, mimeHint) {
  let data = raw.trim();
  let mime = mimeHint;
  const m = data.match(/^data:([^;,]+);base64,(.+)$/i);
  if (m) {
    mime = mime || m[1];
    data = m[2];
  }
  data = data.replace(/\s+/g, "");
  // Cheap upper bound: base64 expands by ~4/3. Refuse oversize early.
  if (data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 16) {
    throw new Error(
      `image_base64 is too large (${data.length} chars; limit ~${MAX_IMAGE_BYTES} bytes).`
    );
  }
  const buf = Buffer.from(data, "base64");
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`Decoded image_base64 exceeds limit (${buf.length} bytes).`);
  }
  return { bytes: buf, contentType: mime };
}

async function loadImageBytes({ file_path, image_url, image_base64, mime_type }) {
  if (file_path) {
    const fp = expandHome(file_path);
    const s = await lstat(fp).catch((e) => {
      throw new Error(`Cannot stat file_path '${fp}': ${e.message}`);
    });
    if (!s.isFile()) {
      throw new Error(`file_path '${fp}' is not a regular file (symlinks refused).`);
    }
    if (s.size > MAX_IMAGE_BYTES) {
      throw new Error(`file_path '${fp}' exceeds size limit (${s.size} bytes).`);
    }
    const bytes = await readFile(fp);
    return { bytes, contentType: null, suggestedName: basename(fp) };
  }
  if (image_base64) {
    const { bytes, contentType } = decodeBase64ToBytes(image_base64, mime_type);
    return { bytes, contentType, suggestedName: null };
  }
  if (image_url) {
    if (image_url.startsWith("data:")) {
      const { bytes, contentType } = decodeBase64ToBytes(image_url, mime_type);
      return { bytes, contentType, suggestedName: null };
    }
    const { bytes, contentType } = await fetchImageUrlSafe(image_url);
    let suggestedName;
    try {
      suggestedName = basename(new URL(image_url).pathname) || null;
    } catch {
      suggestedName = null;
    }
    return { bytes, contentType, suggestedName };
  }
  throw new Error("Provide one of: file_path, image_url, or image_base64.");
}

// ────────────────────────────────────────────────────────────────────────────
// Result shaping

function riskLevel(maxSimilarity) {
  if (maxSimilarity >= 0.7) return "HIGH";
  if (maxSimilarity >= 0.4) return "MEDIUM";
  return "LOW";
}

function summarize(detections) {
  if (detections.length === 0) {
    return { total: 0, max_similarity: 0, risk_level: "LOW", by_category: {}, top: [] };
  }
  const by_category = {};
  for (const d of detections) by_category[d.category] = (by_category[d.category] ?? 0) + 1;
  const sorted = [...detections].sort((a, b) => b.similarity - a.similarity);
  const max_similarity = sorted[0].similarity;
  return {
    total: detections.length,
    max_similarity,
    risk_level: riskLevel(max_similarity),
    by_category,
    top: sorted.slice(0, 5).map((d) => ({ ...d })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Server

const server = new McpServer({ name: "ipscope", version: "0.2.0" });

server.registerTool(
  "verify_image",
  {
    title: "Verify image for IP infringement (CopySight CopyScore™)",
    description:
      "Run an image through the CopySight CopyScore™ engine. Detects protected IP — " +
      "characters, celebrities, trademarks, brand/iconic designs, art/artists — and " +
      "returns each finding with similarity (0..1), owner, author, and a NORMALIZED " +
      "bounding box (x/y/width/height in 0..1 of image dimensions). Also reports " +
      "contains_face and a computed risk_level (HIGH ≥0.7, MEDIUM ≥0.4, else LOW). " +
      "Inputs (provide ONE, or NONE to auto-pull from chat): file_path (absolute), " +
      "image_url (public http(s) URL or data: URI), image_base64 (+ mime_type). With " +
      "no args, the server reads ONLY this project's own Claude Code session " +
      "transcript (~/.claude/projects/<this-project>/*.jsonl), extracts the latest " +
      "inline image the user attached, and runs it. Non-image content is refused.",
    inputSchema: {
      file_path: z
        .string()
        .optional()
        .describe("Absolute local file path to the image (jpg/png/gif/webp). `~/` is expanded."),
      image_url: z
        .string()
        .optional()
        .describe(
          "Public http(s) URL of the image, OR a data: URI (data:image/png;base64,...). " +
            "Private, loopback, link-local and metadata addresses are refused."
        ),
      image_base64: z
        .string()
        .optional()
        .describe(
          "Raw base64-encoded image data (data: prefix accepted). Set mime_type alongside."
        ),
      mime_type: z
        .string()
        .optional()
        .describe("MIME type hint for image_base64 (e.g. 'image/png')."),
      filename: z
        .string()
        .optional()
        .describe("Override the filename sent in multipart upload."),
    },
    outputSchema: {
      contains_face: z.boolean(),
      detections: z.array(Detection),
      summary: z.object({
        total: z.number(),
        max_similarity: z.number(),
        risk_level: z.enum(["HIGH", "MEDIUM", "LOW"]),
        by_category: z.record(z.number()),
        top: z.array(Detection),
      }),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ file_path, image_url, image_base64, mime_type, filename }) => {
    if (!file_path && !image_url && !image_base64) {
      const fromChat = await loadFromActiveChat();
      image_base64 = fromChat.base64;
      mime_type = mime_type ?? fromChat.mime;
    }

    const { bytes, contentType, suggestedName } = await loadImageBytes({
      file_path,
      image_url,
      image_base64,
      mime_type,
    });

    // Magic-byte sniff — refuses non-image content regardless of source.
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      throw new Error(
        "Input is not a recognised image (expected PNG/JPEG/GIF/WEBP magic bytes)."
      );
    }
    const finalMime = contentType ?? sniffed;
    const finalName =
      filename ?? suggestedName ?? `image.${extFromSniff(sniffed)}`;

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: finalMime }), finalName);

    const res = await fetch(`${API_BASE}/verify`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: form,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const rawText = await res.text();
    if (!res.ok) {
      const detail = rawText.slice(0, 500);
      if (res.status === 401) {
        throw new Error(`401 Unauthorized — check COPYSIGHT_API_KEY. ${detail}`);
      }
      if (res.status === 400) {
        throw new Error(`400 Bad Request — unsupported or corrupted file. ${detail}`);
      }
      if (res.status === 429) {
        const retry = res.headers.get("retry-after");
        throw new Error(
          `429 Too Many Requests — rate limit exceeded${retry ? ` (retry after ${retry}s)` : ""}. ${detail}`
        );
      }
      throw new Error(`CopySight API error ${res.status}: ${detail}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error(`CopySight returned non-JSON response: ${rawText.slice(0, 300)}`);
    }
    const body = VerifyResponse.parse(parsed);
    const detections = body.detected_ips;
    const contains_face = body.contains_face ?? false;
    const summary = summarize(detections);

    const headline =
      detections.length === 0
        ? `No protected IP detected.${contains_face ? " Contains face." : ""}`
        : `${summary.risk_level} risk — detected ${detections.length} item(s)${contains_face ? " (contains face)" : ""}. Top: ${summary.top
            .map((d) => `${d.name} — ${d.category} (sim ${d.similarity.toFixed(2)})`)
            .join("; ")}.`;

    return {
      content: [
        { type: "text", text: headline },
        {
          type: "text",
          text:
            "```json\n" +
            JSON.stringify({ contains_face, summary, detections }, null, 2) +
            "\n```",
        },
      ],
      structuredContent: { contains_face, detections, summary },
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`ipscope MCP v0.2.0 connected (base=${API_BASE})`);
