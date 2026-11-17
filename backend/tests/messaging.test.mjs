import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  messagingApi,
  FILE_LIMIT,
  PART_SIZE,
  chatIdentity,
  cleanChatFiles,
} from "../messaging.mjs";
const owner = {
  email: "owner@example.com",
  token: "test",
  admin: true,
  owner: true,
};
const alice = { email: "alice@example.com", token: "test", admin: false };
const bob = { email: "bob@example.com", token: "test", admin: false };
function setup() {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0000_flowery_the_professor", "0001_mute_silver_sable"])
    sql.exec(readFileSync("sites/project-board/drizzle/" + f + ".sql", "utf8"));
  for (const f of [
    "members",
    "accounts",
    "remove-members",
    "roles",
    "weeklybrief",
    "messaging",
  ])
    sql.exec(readFileSync("backend/migrations/" + f + ".sql", "utf8"));
  const wrap = (q, a = []) => ({
    bind(...v) {
      return wrap(q, v);
    },
    async first() {
      return sql.prepare(q).get(...a) || null;
    },
    async all() {
      return { results: sql.prepare(q).all(...a) };
    },
    async run() {
      const s = sql.prepare(q);
      return s.columns().length
        ? { results: s.all(...a), meta: { changes: 0 } }
        : { meta: { changes: s.run(...a).changes } };
    },
  });
  const db = {
    sql,
    prepare: (q) => wrap(q),
    async batch(qs) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const q of qs) out.push(await q.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  for (const u of [owner, alice, bob])
    sql
      .prepare(
        "INSERT INTO workspace_members(email,tools,enabled,role,revision,updated_at,updated_by) VALUES(?,'[]',1,'sales',1,'now','owner')",
      )
      .run(u.email);
  sql.exec(
    "INSERT INTO chat_roles VALUES('sales','Sales',0); INSERT INTO chat_roles VALUES('marketing','Marketing',0)",
  );
  const files = new Map(),
    uploads = new Map();
  let puts = 0;
  const BUCKET = {
    async createMultipartUpload(k) {
      const id = crypto.randomUUID();
      uploads.set(id, new Map());
      return { uploadId: id };
    },
    resumeMultipartUpload(k, id) {
      return {
        async uploadPart(n, b) {
          puts++;
          uploads.get(id).set(n, b);
          return { partNumber: n, etag: "part-" + n };
        },
        async complete(parts) {
          let size = 0;
          for (const p of parts)
            size += uploads.get(id).get(p.partNumber).length;
          files.set(k, { size, body: new Uint8Array(Math.min(size, 10)) });
        },
        async abort() {
          uploads.delete(id);
        },
      };
    },
    async head(k) {
      return files.get(k);
    },
    async get(k) {
      return files.get(k);
    },
    async delete(k) {
      files.delete(k);
    },
  };
  return {
    DB_PROJECT_BOARD: db,
    BUCKET,
    files,
    uploads,
    get puts() {
      return puts;
    },
  };
}
async function call(e, u, action, b, query = {}) {
  const req = new Request(
    "https://api/project-board/api/messaging?" +
      new URLSearchParams({ action, ...query }),
    b === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        },
  );
  return (await messagingApi(req, e, u)).json();
}
const reject = (p, status) => assert.rejects(p, (e) => e.status === status);
const send = (e, u, room, body = "Hello", extra = {}) =>
  call(e, u, "send", { room, body, id: crypto.randomUUID(), ...extra });
test("employee authentication, multi-role channels, inherited restrictions and revoked roles", async () => {
  const e = setup();
  await reject(call(e, { ...alice, token: null }, "bootstrap"), 403);
  const group = await call(e, owner, "room", {
    kind: "group",
    name: "Marketing",
    private: true,
    roles: ["marketing"],
  });
  const channel = await call(e, owner, "room", {
    kind: "channel",
    name: "campaigns",
    parentId: group.id,
    roles: [],
  });
  assert.equal(
    (await call(e, alice, "bootstrap")).rooms.some((r) => r.id === channel.id),
    false,
  );
  await reject(send(e, alice, channel.id), 403);
  await reject(
    call(e, alice, "messages", undefined, { room: channel.id }),
    403,
  );
  await call(e, owner, "membership", {
    email: alice.email,
    roles: ["marketing"],
  });
  assert.ok((await chatIdentity(e, alice)).chatRoles.includes("sales"));
  await send(e, alice, channel.id);
  await call(e, owner, "membership", { email: alice.email, roles: [] });
  await reject(
    call(e, alice, "messages", undefined, { room: channel.id }),
    403,
  );
  await reject(
    call(e, alice, "role", { name: "Escalation", manage: true }),
    403,
  );
  e.DB_PROJECT_BOARD.sql
    .prepare("UPDATE workspace_members SET enabled=0 WHERE email=?")
    .run(alice.email);
  await reject(call(e, { ...alice, admin: true }, "bootstrap"), 403);
});
test("DMs are participant-only even for administrators and two-person chats deduplicate", async () => {
  const e = setup(),
    dm = await call(e, alice, "dm", { members: [bob.email] });
  assert.equal(
    (await call(e, bob, "dm", { members: [alice.email] })).id,
    dm.id,
  );
  const m = await send(e, alice, dm.id, "confidential");
  await reject(call(e, owner, "messages", undefined, { room: dm.id }), 403);
  await reject(call(e, owner, "delete", { id: m.id, revision: 1 }), 403);
  assert.equal(
    (await call(e, owner, "bootstrap")).rooms.some((r) => r.id === dm.id),
    false,
  );
  await reject(
    call(e, owner, "room", { id: dm.id, revision: 1, remove: true }),
    403,
  );
  await reject(
    call(e, alice, "dm", { members: ["external@example.com"] }),
    400,
  );
});
test("group creator controls membership and removed members lose history immediately", async () => {
  const e = setup(),
    dm = await call(e, alice, "dm", {
      name: "Team",
      members: [bob.email, owner.email],
    });
  await reject(call(e, bob, "dm", { id: dm.id, members: [alice.email] }), 403);
  await call(e, alice, "dm", {
    id: dm.id,
    name: "Team",
    members: [owner.email],
  });
  await reject(call(e, bob, "messages", undefined, { room: dm.id }), 403);
});
test("message idempotency, author checks, optimistic editing, replies, reactions, pins and search", async () => {
  const e = setup(),
    id = crypto.randomUUID();
  await send(e, alice, "general", "Original", { id });
  await send(e, alice, "general", "Original", { id });
  assert.equal(
    e.DB_PROJECT_BOARD.sql.prepare("SELECT count(*) n FROM chat_messages").get()
      .n,
    1,
  );
  await reject(call(e, bob, "edit", { id, revision: 1, body: "Attack" }), 403);
  await call(e, alice, "edit", { id, revision: 1, body: "Updated" });
  await reject(call(e, alice, "edit", { id, revision: 1, body: "Old" }), 409);
  await call(e, bob, "react", { id, emoji: "👍" });
  await call(e, bob, "pin", { id, revision: 2, pinned: true });
  await send(e, bob, "general", "Reply", { replyId: id });
  let found = await call(e, alice, "messages", undefined, {
    room: "general",
    q: "Updated",
  });
  assert.equal(found.messages.length, 1);
  assert.equal(found.messages[0].reactions[0].n, 1);
  assert.equal(
    (
      await call(e, alice, "messages", undefined, {
        room: "general",
        pins: "1",
      })
    ).messages.length,
    1,
  );
  const dm = await call(e, alice, "dm", { members: [bob.email] });
  await reject(send(e, alice, dm.id, "Reply", { replyId: id }), 400);
  await call(e, alice, "delete", { id, revision: 3 });
  found = await call(e, bob, "messages", undefined, { room: "general" });
  assert.equal(found.messages[0].body, "");
  assert.equal(found.messages[1].reply.body, "");
});
test("history pagination and unread markers do not reveal private channel counts", async () => {
  const e = setup();
  for (let i = 0; i < 55; i++) await send(e, alice, "general", "Message " + i);
  const recent = await call(e, bob, "messages", undefined, { room: "general" });
  assert.equal(recent.messages.length, 50);
  assert.ok(recent.more);
  assert.equal(
    (
      await call(e, bob, "messages", undefined, {
        room: "general",
        before: String(recent.messages[0].seq),
      })
    ).messages.length,
    5,
  );
  assert.equal(
    (await call(e, bob, "bootstrap")).rooms.find((r) => r.id === "general")
      .unread,
    55,
  );
  await call(e, bob, "read", {
    room: "general",
    seq: recent.messages.at(-1).seq,
  });
  assert.equal(
    (await call(e, bob, "bootstrap")).rooms.find((r) => r.id === "general")
      .unread,
    0,
  );
});
async function part(e, u, id, n, bytes) {
  return messagingApi(
    new Request(
      "https://api/project-board/api/messaging?action=part&file=" +
        id +
        "&part=" +
        n,
      { method: "POST", body: bytes },
    ),
    e,
    u,
  );
}
test("multipart upload validates part sizes, resumes, attaches privately and revokes downloads", async () => {
  const e = setup(),
    dm = await call(e, alice, "dm", { members: [bob.email] }),
    f = await call(e, alice, "upload-start", {
      room: dm.id,
      name: "report.pdf",
      size: PART_SIZE + 5,
    });
  await reject(part(e, alice, f.id, 1, new Uint8Array(5)), 400);
  await reject(part(e, bob, f.id, 1, new Uint8Array(PART_SIZE)), 404);
  await part(e, alice, f.id, 1, new Uint8Array(PART_SIZE));
  assert.equal(
    (await call(e, alice, "upload-status", { id: f.id })).parts.length,
    1,
  );
  await reject(call(e, alice, "upload-complete", { id: f.id }), 400);
  await part(e, alice, f.id, 2, new Uint8Array(5));
  await call(e, alice, "upload-complete", { id: f.id });
  await call(e, alice, "upload-complete", { id: f.id });
  const fileReq = new Request(
    "https://api/project-board/api/messaging?action=file&id=" + f.id,
  );
  await reject(messagingApi(fileReq, e, bob), 403);
  await reject(messagingApi(fileReq, e, owner), 403);
  const m = await send(e, alice, dm.id, "Report", { files: [f.id] });
  const response = await messagingApi(fileReq, e, bob);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.ok(
    response.headers.get("Content-Disposition").startsWith("attachment"),
  );
  await call(e, alice, "delete", { id: m.id, revision: 1 });
  await reject(messagingApi(fileReq, e, bob), 404);
});
test("1 GB maximum, shared capacity, monthly upload cap and active upload limits are enforced", async () => {
  const e = setup();
  await reject(
    call(e, alice, "upload-start", {
      room: "general",
      name: "large.zip",
      size: FILE_LIMIT + 1,
    }),
    400,
  );
  const f = await call(e, alice, "upload-start", {
    room: "general",
    name: "large.zip",
    size: FILE_LIMIT,
  });
  assert.ok(f.id);
  e.DB_PROJECT_BOARD.sql
    .prepare("UPDATE chat_files SET size=10000000000 WHERE id=?")
    .run(f.id);
  await reject(
    call(e, bob, "upload-start", { room: "general", name: "x", size: 1 }),
    413,
  );
  await call(e, alice, "upload-abort", { id: f.id });
  e.DB_PROJECT_BOARD.sql
    .prepare("UPDATE chat_usage SET n=10000000000 WHERE kind='upload-bytes'")
    .run();
  await reject(
    call(e, bob, "upload-start", { room: "general", name: "x", size: 1 }),
    429,
  );
});
test("archiving a group blocks descendant content and file access", async () => {
  const e = setup(),
    g = await call(e, owner, "room", {
      name: "Group",
      kind: "group",
      roles: [],
    }),
    c = await call(e, owner, "room", {
      name: "Channel",
      kind: "channel",
      parentId: g.id,
      roles: [],
    });
  await send(e, alice, c.id);
  await call(e, owner, "room", { id: g.id, revision: 1, remove: true });
  await reject(call(e, owner, "messages", undefined, { room: c.id }), 403);
  await reject(call(e, alice, "messages", undefined, { room: c.id }), 403);
});

test('storage administration excludes other peoples DMs and abandoned uploads are reclaimed', async()=>{
 const e=setup(),dm=await call(e,alice,'dm',{members:[bob.email]});
 const file=await call(e,alice,'upload-start',{room:dm.id,name:'private.zip',size:10});
 assert.equal((await call(e,owner,'files')).files.length,0);
 await reject(call(e,owner,'file-remove',{id:file.id}),403);
 e.DB_PROJECT_BOARD.sql.prepare("UPDATE chat_files SET created='2020-01-01' WHERE id=?").run(file.id);
 await cleanChatFiles(e);
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT status FROM chat_files WHERE id=?').get(file.id).status,'aborted');
 assert.equal(e.uploads.size,0);
});
test('custom messaging administrators cannot gain workspace roles or open other peoples DMs', async()=>{
 const e=setup(),role=await call(e,owner,'role',{name:'Chat moderator',manage:true});
 await call(e,owner,'membership',{email:bob.email,roles:[role.id]});
 const identity=await chatIdentity(e,bob);assert.equal(identity.chatAdmin,true);assert.equal(identity.admin,false);
 const channel=await call(e,bob,'room',{name:'Managed',kind:'channel',parentId:'team',roles:[]});assert.ok(channel.id);
 const dm=await call(e,alice,'dm',{members:[owner.email]});await reject(call(e,bob,'messages',undefined,{room:dm.id}),403);
 assert.equal(e.DB_PROJECT_BOARD.sql.prepare('SELECT role FROM workspace_members WHERE email=?').get(bob.email).role,'sales');
});

test('configured workspace owner is contactable without a separate employee record',async()=>{
 const e=setup();e.ADMIN_EMAILS=owner.email;e.DB_PROJECT_BOARD.sql.prepare('DELETE FROM workspace_members WHERE email=?').run(owner.email);
 assert.ok((await call(e,bob,'bootstrap')).people.some(p=>p.email===owner.email));
 const dm=await call(e,bob,'dm',{members:[owner.email]});assert.ok((await call(e,owner,'messages',undefined,{room:dm.id})).members.includes(owner.email));
});
