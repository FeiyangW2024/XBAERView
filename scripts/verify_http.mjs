import assert from "node:assert/strict";
const root = "http://127.0.0.1:8765";
const cat = await (await fetch(root + "/catalog.json")).json();
const idx = await (await fetch(root + "/" + cat.layers[0].index)).json();
const url = new URL(idx.files[0].file, root + "/" + cat.layers[0].index);
let r = await fetch(url, { headers: { Range: "bytes=0-1023" } });
assert.equal(r.status, 206);
assert.equal((await r.arrayBuffer()).byteLength, 1024);
assert.match(r.headers.get("content-range"), /^bytes 0-1023\//);
r = await fetch(url, { method: "HEAD" });
assert.equal(r.status, 200);
assert.equal((await r.arrayBuffer()).byteLength, 0);
const etag = r.headers.get("etag");
r = await fetch(url, { headers: { "If-None-Match": etag } });
assert.equal(r.status, 304);
r = await fetch(url, { headers: { Range: "bytes=99999999999-" } });
assert.equal(r.status, 416);
r = await fetch(root + "/");
assert.equal(r.status, 403);
r = await fetch(root + "/../no2%20scd/NO2_SCD_20230106_0345.nc");
assert.equal(r.status, 404);
r = await fetch(url, { method: "POST" });
assert.equal(r.status, 405);
console.log(
  "HTTP checks passed: Range, HEAD, ETag, invalid range, directory/source isolation, read-only methods",
);
