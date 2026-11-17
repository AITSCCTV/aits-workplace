// Short-lived in-memory download capabilities. No credentials are persisted.
const files = new Map();
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "chat-clear") { files.clear(); return; }
  if (data?.type !== "chat-file" || !event.ports[0]) return;
  const target = new URL(data.url);
  if (
    target.origin !== "https://aits-workplace-api.aits-api.workers.dev" ||
    target.pathname !== "/project-board/api/messaging" ||
    target.searchParams.get("action") !== "file"
  )
    return;
  const id = crypto.randomUUID();
  files.set(id, { ...data, expires: Date.now() + 300000 });
  for (const [k, v] of files) if (v.expires < Date.now()) files.delete(k);
  event.ports[0].postMessage({
    url: self.registration.scope + "attachment/" + id,
  });
});
self.addEventListener("fetch", (event) => {
  const prefix = self.registration.scope + "attachment/";
  if (!event.request.url.startsWith(prefix)) return;
  event.respondWith(
    (async () => {
      const entry = files.get(event.request.url.slice(prefix.length));
      if (!entry || entry.expires < Date.now())
        return new Response("Download expired. Open the attachment again.", {
          status: 401,
        });
      const headers = { Authorization: "Bearer " + entry.token };
      if (event.request.headers.has("Range"))
        headers.Range = event.request.headers.get("Range");
      const response = await fetch(entry.url, {
          headers,
          credentials: "omit",
          redirect: "error",
        }),
        h = new Headers(response.headers);
      if (response.ok) {
        const inline =
          entry.inline &&
          /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|application\/pdf)$/.test(
            h.get("Content-Type") || "",
          );
        h.set(
          "Content-Disposition",
          (inline ? "inline" : "attachment") +
            "; filename*=UTF-8''" +
            encodeURIComponent(entry.name).replace(/'/g, "%27"),
        );
        h.set(
          "Content-Security-Policy",
          "default-src 'none'; sandbox allow-downloads",
        );
        h.set("Cache-Control", "no-store");
        h.set("X-Content-Type-Options", "nosniff");
      }
      return new Response(response.body, {
        status: response.status,
        headers: h,
      });
    })(),
  );
});
