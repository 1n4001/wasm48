import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../dist-pages/", import.meta.url);
const dir = fileURL(root);

function fileURL(url) {
  return decodeURIComponent(url.pathname);
}

function walk(current) {
  const files = [];
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (name !== "sw.js") files.push(path);
  }
  return files;
}

const base = "/wasm48/";
const precache = walk(dir).map((path) => base + relative(dir, path).split("\\").join("/"));
const source = `const CACHE = "wasm48-${Date.now()}";
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
`;

writeFileSync(join(dir, "sw.js"), source);
writeFileSync(join(dir, ".nojekyll"), "");
console.log(`cached ${precache.length} files`);
