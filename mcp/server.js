#!/usr/bin/env node
// ipscope — MCP server wrapping the CopySight CopyScore API.
// Single tool: verify_image. Pure ES module JS, no build step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_BASE = process.env.COPYSIGHT_API_BASE ?? "https://api.copysight.ai/v1";
const API_KEY = process.env.COPYSIGHT_API_KEY;

if (!API_KEY) {
  console.error(
    "COPYSIGHT_API_KEY is not set. Get a key from CopySight and pass it via env.\n" +
      'Example: { "mcpServers": { "ipscope": { "command": "node", "args": [...], "env": { "COPYSIGHT_API_KEY": "cs_live_..." } } } }'
  );
  process.exit(1);
}

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

function extByMime(mime) {
  if (!mime) return "bin";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

function decodeBase64ToBlob(raw, mimeHint) {
  let data = raw.trim();
  let mime = mimeHint;
  // strip data URI prefix if present: data:image/png;base64,XXXX
  const m = data.match(/^data:([^;,]+);base64,(.+)$/i);
  if (m) {
    mime = mime || m[1];
    data = m[2];
  }
  // strip any whitespace/newlines
  data = data.replace(/\s+/g, "");
  const buf = Buffer.from(data, "base64");
  return { blob: new Blob([buf], { type: mime ?? undefined }), mime };
}

async function loadImage({ file_path, image_url, image_base64, mime_type, filename }) {
  if (file_path) {
    const buf = await readFile(file_path);
    return { blob: new Blob([buf]), filename: filename ?? basename(file_path) };
  }
  if (image_base64) {
    const { blob, mime } = decodeBase64ToBlob(image_base64, mime_type);
    return { blob, filename: filename ?? `image.${extByMime(mime)}` };
  }
  if (image_url) {
    // also accept data: URLs here, just in case
    if (image_url.startsWith("data:")) {
      const { blob, mime } = decodeBase64ToBlob(image_url, mime_type);
      return { blob, filename: filename ?? `image.${extByMime(mime)}` };
    }
    const res = await fetch(image_url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch image_url (${res.status} ${res.statusText}): ${image_url}`
      );
    }
    const ab = await res.arrayBuffer();
    const url = new URL(image_url);
    const fallback = basename(url.pathname) || "image";
    return {
      blob: new Blob([ab], { type: res.headers.get("content-type") ?? undefined }),
      filename: filename ?? fallback,
    };
  }
  throw new Error("Provide one of: file_path, image_url, or image_base64.");
}

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
    top: sorted.slice(0, 5),
  };
}

const server = new McpServer({ name: "ipscope", version: "0.1.0" });

server.registerTool(
  "verify_image",
  {
    title: "Verify image for IP infringement (CopySight CopyScore)",
    description:
      "Run an image through the CopySight CopyScore engine. Detects protected IP — " +
      "characters, celebrities, trademarks, brand/iconic designs, art/artists — and returns " +
      "each finding with similarity (0..1), owner, author, and a NORMALIZED bounding box " +
      "(x/y/width/height in 0..1 of image dimensions). Also reports contains_face and a " +
      "computed risk_level (HIGH ≥0.7, MEDIUM ≥0.4, else LOW). Provide ONE of: file_path " +
      "(absolute local path), image_url (publicly reachable, or a data: URI), or " +
      "image_base64 (raw base64 string of the image bytes — use this when the user " +
      "attached an image inline to the chat).",
    inputSchema: {
      file_path: z
        .string()
        .optional()
        .describe("Absolute local file path to the image (jpg/png/gif/webp)."),
      image_url: z
        .string()
        .optional()
        .describe(
          "Public URL of the image, OR a data: URI (data:image/png;base64,...). Used if file_path is not provided."
        ),
      image_base64: z
        .string()
        .optional()
        .describe(
          "Raw base64-encoded image data (no data: prefix needed, but data URIs are accepted). " +
            "Use this when the user pasted/attached an image inline to the chat — you can read the " +
            "base64 from the image content block's source.data and pass it here. Set mime_type alongside."
        ),
      mime_type: z
        .string()
        .optional()
        .describe(
          "MIME type for image_base64 (e.g. 'image/png', 'image/jpeg'). Optional but recommended."
        ),
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
      throw new Error("Provide one of: file_path, image_url, or image_base64.");
    }
    const { blob, filename: name } = await loadImage({
      file_path,
      image_url,
      image_base64,
      mime_type,
      filename,
    });
    const form = new FormData();
    form.append("file", blob, name);

    const res = await fetch(`${API_BASE}/verify`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: form,
    });

    const rawText = await res.text();
    if (!res.ok) {
      let detail = rawText;
      try {
        detail = JSON.stringify(JSON.parse(rawText));
      } catch {}
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
console.error(`ipscope MCP connected (base=${API_BASE})`);
