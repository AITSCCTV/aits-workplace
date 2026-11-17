import { messagingApi, chatIdentity, cleanChatFiles } from "./messaging.mjs";
import { HttpError } from "./auth.mjs";

// Only invalidation signals travel over sockets. Message content and attachments
// always pass through fresh database-backed authorization on the HTTP API.
export class ChatHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/refresh") {
      for (const ws of this.ctx.getWebSockets())
        try {
          ws.send('{"type":"refresh"}');
        } catch {}
      return Response.json({ ok: true });
    }
    if (url.pathname === "/live") return this.connect(request);
    const operation = async () => {
      try {
        const identity = JSON.parse(
          request.headers.get("X-Chat-Identity") || "null",
        );
        if (!identity) throw new HttpError(403, "Sign-in required.");
        const env = {
          ...this.env,
          CHAT_ONLINE: () => [
            ...new Set(
              this.ctx
                .getWebSockets()
                .filter((ws) => ws.readyState === 1)
                .flatMap((ws) => this.ctx.getTags(ws)),
            ),
          ],
          CHAT_READ: (room, participants) => {
            for (const email of participants)
              for (const ws of this.ctx.getWebSockets(email))
                try {
                  ws.send(JSON.stringify({ type: "receipts", room }));
                } catch {}
          },
          CHAT_TICKET: async () => {
            await chatIdentity(this.env, identity);
            const ticket = crypto.randomUUID() + crypto.randomUUID();
            await this.ctx.storage.put("ticket:" + ticket, {
              expires: Date.now() + 30000,
              email: identity.email,
            });
            if (!(await this.ctx.storage.getAlarm()))
              await this.ctx.storage.setAlarm(Date.now() + 60000);
            return Response.json({ ticket });
          },
        };
        const result = await messagingApi(request, env, identity);
        if (!(await this.ctx.storage.getAlarm()))
          await this.ctx.storage.setAlarm(Date.now() + 60000);
        if (
          request.method === "POST" &&
          ![
            "ticket",
            "read",
            "part",
            "upload-status",
            "upload-start",
            "upload-complete",
          ].includes(url.searchParams.get("action"))
        )
          for (const ws of this.ctx.getWebSockets())
            try {
              ws.send('{"type":"refresh"}');
            } catch {}
        return result;
      } catch (e) {
        return Response.json(
          {
            error:
              e instanceof HttpError
                ? e.message
                : "Unable to complete the chat request.",
          },
          { status: e instanceof HttpError ? e.status : 500 },
        );
      }
    };
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async connect(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const ticket = new URL(request.url).searchParams.get("ticket") || "";
    if (!/^[a-f0-9-]{72}$/.test(ticket))
      return new Response("Invalid ticket", { status: 401 });
    // Consume once in a storage transaction so two handshakes cannot share a ticket.
    const identity = await this.ctx.storage.transaction(async (tx) => {
      const value = await tx.get("ticket:" + ticket);
      await tx.delete("ticket:" + ticket);
      return value;
    });
    if (!identity || identity.expires < Date.now())
      return new Response("Expired ticket", { status: 401 });
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 120)
      return new Response("Connection limit", { status: 429 });
    const same = this.ctx.getWebSockets(identity.email);
    if (same.length >= 4)
      for (const ws of same.slice(0, same.length - 3))
        ws.close(1000, "New connection");
    const pair = new WebSocketPair(),
      client = pair[0],
      server = pair[1];
    this.ctx.acceptWebSocket(server, [identity.email]);
    server.serializeAttachment({ at: Date.now() });
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }
  presence() {
    for (const ws of this.ctx.getWebSockets())
      try {
        ws.send('{"type":"presence"}');
      } catch {}
  }
  webSocketMessage(ws) {
    ws.close(1008, "Use the authenticated HTTP API.");
  }
  webSocketClose(ws, code) {
    ws.close(code);
    this.presence();
  }
  webSocketError(ws) {
    try {
      ws.close(1011, "Reconnect");
    } catch {}
    this.presence();
  }
  async alarm() {
    const clean = async () => {
      const last = (await this.ctx.storage.get("last-clean")) || 0;
      if (Date.now() - last > 3600000) {
        await cleanChatFiles(this.env);
        await this.ctx.storage.put("last-clean", Date.now());
      }
    };
    const cleaning = this.queue.then(clean, clean);
    this.queue = cleaning.catch(() => {});
    await cleaning;
    const entries = await this.ctx.storage.list({ prefix: "ticket:" });
    for (const [key, v] of entries)
      if (v.expires < Date.now()) await this.ctx.storage.delete(key);
    for (const ws of this.ctx.getWebSockets())
      if (Date.now() - (ws.deserializeAttachment()?.at || 0) > 3600000)
        ws.close(1000, "Refresh sign-in");
    await this.ctx.storage.setAlarm(
      Date.now() + (this.ctx.getWebSockets().length ? 60000 : 3600000),
    );
  }
}
