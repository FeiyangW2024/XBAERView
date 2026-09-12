import http from "node:http";
import { stat, realpath, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
const configPath = path.resolve(process.env.DEPLOYMENT_CONFIG || 'config/deployment.local.json');
const deployment = JSON.parse(await readFile(configPath, 'utf8'));
const resolveRoot = value => path.resolve(path.dirname(configPath), value);
// Vite strips /data from the URL; map only explicitly configured publish roots.
const mounts = await Promise.all([...Object.values(deployment.members).map(m => [m.publishUrl, m.publishRoot]), [deployment.basemap.url, deployment.basemap.publishRoot]].map(async ([url, folder]) => {
  if (!url.startsWith('/data/')) throw Error('Local proxy requires /data/ URLs');
  return { prefix: url.slice(5), root: await realpath(resolveRoot(folder)) };
}));
mounts.sort((a,b) => b.prefix.length-a.prefix.length);
const port = Number(process.env.DATA_PORT || 8765);
http
  .createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        return res.end();
      }
      const pathname = decodeURIComponent(
        new URL(req.url, "http://local").pathname,
      );
      if (process.env.DATA_ACCESS_LOG)
        console.log(req.method, pathname, req.headers.range || "full");
      const mount = mounts.find(m => pathname.startsWith(m.prefix));
      if (!mount) throw Error('Unmapped URL');
      const root = mount.root;
      const file = await realpath(path.resolve(root, pathname.slice(mount.prefix.length)));
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      const s = await stat(file);
      if (!s.isFile()) throw Error("not file");
      const etag = `"${s.size}-${s.mtimeMs}"`;
      const headers = {
        "Accept-Ranges": "bytes",
        "Content-Type":
          file.endsWith(".json") || file.endsWith(".geojson")
            ? "application/json"
            : file.endsWith(".tif")
              ? "image/tiff"
              : "application/octet-stream",
        "Cache-Control": file.endsWith(".tif")
          ? "public, max-age=3600"
          : "no-cache",
        ETag: etag,
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        return res.end();
      }
      let start = 0,
        end = s.size - 1,
        status = 200;
      if (req.headers.range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!m || (!m[1] && !m[2])) {
          res.writeHead(416, { "Content-Range": `bytes */${s.size}` });
          return res.end();
        }
        if (m[1]) {
          start = Number(m[1]);
          end = m[2] ? Math.min(Number(m[2]), end) : end;
        } else start = Math.max(0, s.size - Number(m[2]));
        if (start > end || start >= s.size) {
          res.writeHead(416, { "Content-Range": `bytes */${s.size}` });
          return res.end();
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${s.size}`;
      }
      headers["Content-Length"] = end - start + 1;
      res.writeHead(status, headers);
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(file, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Publish service: http://127.0.0.1:${port}`),
  );
