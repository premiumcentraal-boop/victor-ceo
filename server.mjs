import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const distDir = path.resolve("dist");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

// Text formats compress well. Images and fonts are already compressed, so they are sent as they are.
const compressibleExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".webmanifest"]);
const compressedCache = new Map();

function resolveRequestPath(urlPathname) {
  const cleanPath = decodeURIComponent(urlPathname.split("?")[0]);
  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const candidatePath = path.resolve(distDir, `.${requestedPath}`);

  if (!candidatePath.startsWith(distDir)) {
    return null;
  }

  return candidatePath;
}

function pickEncoding(acceptEncoding = "") {
  if (/\bbr\b/.test(acceptEncoding)) return "br";
  if (/\bgzip\b/.test(acceptEncoding)) return "gzip";
  return null;
}

function compress(filePath, file, encoding) {
  const key = `${filePath}:${encoding}`;
  if (!compressedCache.has(key)) {
    const body = encoding === "br"
      ? zlib.brotliCompressSync(file, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
      : zlib.gzipSync(file, { level: 9 });
    compressedCache.set(key, body);
  }
  return compressedCache.get(key);
}

async function serveFile(filePath, request, response) {
  const ext = path.extname(filePath);
  const file = await readFile(filePath);
  const headers = {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  };
  let body = file;

  if (compressibleExtensions.has(ext)) {
    headers.Vary = "Accept-Encoding";
    const encoding = pickEncoding(request.headers["accept-encoding"]);
    if (encoding) {
      body = compress(filePath, file, encoding);
      headers["Content-Encoding"] = encoding;
    }
  }

  headers["Content-Length"] = body.length;
  response.writeHead(200, headers);
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url || "/");

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (fileInfo.isFile()) {
      await serveFile(filePath, request, response);
      return;
    }
  } catch {
    // Fall back to the SPA entrypoint below.
  }

  try {
    await serveFile(path.join(distDir, "index.html"), request, response);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build output not found. Run `npm run build` first.");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving dist on http://0.0.0.0:${port}`);
});
