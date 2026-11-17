import { HttpError } from "./auth.mjs";
export const FILE_LIMIT = 1_000_000_000,
  PART_SIZE = 8 * 1024 * 1024,
  STORAGE_LIMIT = 10_000_000_000;
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v) => {
  try {
    return JSON.parse(v || "[]");
  } catch {
    return [];
  }
};
const now = () => new Date().toISOString();
const rows = async (db, q, ...args) =>
  (
    await db
      .prepare(q)
      .bind(...args)
      .all()
  ).results;
const one = (db, q, ...args) =>
  db
    .prepare(q)
    .bind(...args)
    .first();
const run = (db, q, ...args) =>
  db
    .prepare(q)
    .bind(...args)
    .run();
const key = (id) => "team-chat/" + id;

export async function chatIdentity(env, user) {
  if (!user.token) fail(403, "Employee sign-in required.");
  const db = env.DB_PROJECT_BOARD,
    member = await one(
      db,
      "SELECT * FROM workspace_members WHERE email=?",
      user.email,
    );
  if (!user.owner && (!member?.enabled || member.removed_at))
    fail(403, "An enabled employee account is required.");
  const roles = await rows(
    db,
    "SELECT r.* FROM chat_roles r JOIN chat_user_roles u ON u.role_id=r.id WHERE u.email=?",
    user.email,
  );
  // The primary workspace role is inherited; extra chat roles never grant workspace administration.
  const inherited = member?.role
    ? await one(db, "SELECT * FROM chat_roles WHERE id=?", member.role)
    : null;
  if (inherited && !roles.some((r) => r.id === inherited.id))
    roles.push(inherited);
  return {
    ...user,
    chatAdmin: !!user.admin || roles.some((r) => r.manage === 1),
    chatRoles: roles.map((r) => r.id),
  };
}
export async function roomAccess(db, user, id) {
  const room = await one(
    db,
    "SELECT * FROM chat_rooms WHERE id=? AND deleted=0",
    id,
  );
  if (!room) fail(404, "Conversation not found.");
  if (["dm", "groupdm"].includes(room.kind)) {
    if (
      !(await one(
        db,
        "SELECT email FROM chat_members WHERE room_id=? AND email=?",
        id,
        user.email,
      ))
    )
      fail(403, "This is a private conversation.");
    return room;
  }
  let node = room;
  const seen = new Set();
  while (node) {
    if (node.deleted || seen.has(node.id)) fail(403, "Channel unavailable.");
    seen.add(node.id);
    if (
      node.private &&
      !user.chatAdmin &&
      !list(node.roles).some((r) => user.chatRoles.includes(r))
    )
      fail(403, "You do not have access to this channel.");
    if (!node.parent_id) break;
    node = await one(db, "SELECT * FROM chat_rooms WHERE id=?", node.parent_id);
    if (!node) fail(403, "Channel unavailable.");
  }
  return room;
}
async function charge(db, kind, amount, limit, period = now().slice(0, 7)) {
  const r = await run(
    db,
    "INSERT INTO chat_usage(period,kind,n) VALUES(?,?,?) ON CONFLICT(period,kind) DO UPDATE SET n=n+excluded.n WHERE n+excluded.n<=?",
    period,
    kind,
    amount,
    limit,
  );
  if (!r.meta.changes)
    fail(
      429,
      "Team Chat usage limit reached. Please contact an administrator.",
    );
}
async function message(db, user, id) {
  const m = await one(db, "SELECT * FROM chat_messages WHERE id=?", id);
  if (!m) fail(404, "Message not found.");
  await roomAccess(db, user, m.room_id);
  return m;
}
async function audit(db, user, action, target) {
  await run(
    db,
    "INSERT INTO chat_audit VALUES(?,?,?,?,?)",
    crypto.randomUUID(),
    user.email,
    action,
    target,
    now(),
  );
}
async function visibleRooms(db, user) {
  const all = await rows(
      db,
      "SELECT * FROM chat_rooms WHERE deleted=0 ORDER BY position,name",
    ),
    out = [];
  for (const room of all) {
    try {
      await roomAccess(db, user, room.id);
      out.push(room);
    } catch (e) {
      if (![403, 404].includes(e.status)) throw e;
    }
  }
  return out;
}
async function employees(db, env) {
  const people = await rows(
    db,
    "SELECT m.email,coalesce(p.label,m.email) AS name,m.role FROM workspace_members m LEFT JOIN weeklybrief_people p ON p.email=m.email WHERE m.enabled=1 AND m.removed_at IS NULL ORDER BY name",
  );
  for (const email of (env.ADMIN_EMAILS || '').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean)) {
    const found=people.find(p=>p.email===email);
    if(found)found.role='owner';
    else people.push({email,name:email,role:'owner'});
  }
  return people;
}
function validId(value) {
  if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value))
    fail(400, "Invalid identifier.");
  return value;
}
async function selectedPeople(db, v, env) {
  const people = await employees(db, env);
  if (
    !Array.isArray(v) ||
    v.length > 50 ||
    v.some((e) => !people.some((p) => p.email === e))
  )
    fail(400, "Choose enabled employees.");
  return [...new Set(v)];
}
async function selectedRoles(db, v) {
  const roles = await rows(db, "SELECT id FROM chat_roles");
  if (
    !Array.isArray(v) ||
    v.length > 50 ||
    v.some((id) => !roles.some((r) => r.id === id))
  )
    fail(400, "Choose valid roles.");
  return [...new Set(v)];
}
export async function messagingApi(request, env, identity) {
  const db = env.DB_PROJECT_BOARD,
    user = await chatIdentity(env, identity),
    url = new URL(request.url);
  const action = url.searchParams.get("action") || "bootstrap";
  if (request.method === "GET") {
    if (action === "bootstrap") {
      const rooms = await visibleRooms(db, user);
      for (const r of rooms) {
        if (["channel", "dm", "groupdm"].includes(r.kind)) {
          const unread = await one(
            db,
            "SELECT count(*) n FROM chat_messages WHERE room_id=? AND seq>coalesce((SELECT seq FROM chat_reads WHERE room_id=? AND email=?),0) AND author<>? AND deleted=0",
            r.id,
            r.id,
            user.email,
            user.email,
          );
          r.unread = unread.n;
        }
        if (["dm", "groupdm"].includes(r.kind))
          r.members = (
            await rows(
              db,
              "SELECT email FROM chat_members WHERE room_id=?",
              r.id,
            )
          ).map((m) => m.email);
      }
      return Response.json({
        email: user.email,
        admin: user.chatAdmin,
        rooms,
        people: await employees(db, env),
        roles: await rows(db, "SELECT * FROM chat_roles ORDER BY name"),
        assignments: user.chatAdmin
          ? await rows(db, "SELECT * FROM chat_user_roles")
          : [],
        limits: { fileBytes: FILE_LIMIT, storageBytes: STORAGE_LIMIT },
        storage: user.chatAdmin
          ? (
              await one(
                db,
                "SELECT coalesce(sum(size),0) n FROM chat_files WHERE status<>'aborted'",
              )
            ).n
          : null,
      });
    }
    if (action === "messages") {
      const room = await roomAccess(db, user, url.searchParams.get("room"));
      const q = text(url.searchParams.get("q"), 100),
        before =
          Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
      const found = await rows(
        db,
        `SELECT * FROM chat_messages WHERE room_id=? AND seq<? ${q ? "AND instr(lower(body),lower(?))>0 AND deleted=0" : ""} ${url.searchParams.get("pins") === "1" ? "AND pinned=1 AND deleted=0" : ""} ORDER BY seq DESC LIMIT 51`,
        room.id,
        before,
        ...(q ? [q] : []),
      );
      const more = found.length > 50;
      found.splice(50);
      for (const m of found) {
        m.files = m.deleted
          ? []
          : await rows(
              db,
              "SELECT id,name,mime,size FROM chat_files WHERE message_id=? AND status='ready'",
              m.id,
            );
        m.reactions = m.deleted
          ? []
          : await rows(
              db,
              "SELECT emoji,count(*) n,max(email=?) mine FROM chat_reactions WHERE message_id=? GROUP BY emoji",
              user.email,
              m.id,
            );
        if (m.deleted) m.body = "";
        if (m.reply_id) {
          const reply = await one(
            db,
            "SELECT id,author,body,deleted FROM chat_messages WHERE id=? AND room_id=?",
            m.reply_id,
            room.id,
          );
          m.reply = reply
            ? {
                id: reply.id,
                author: reply.author,
                body: reply.deleted ? "" : reply.body.slice(0, 200),
              }
            : null;
        }
      }
      const people = await employees(db, env),
        members = [];
      for (const p of people) {
        try {
          const u = await chatIdentity(env, {
            email: p.email,
            token: "internal",
            role: p.role,
            owner: p.role === 'owner',
            admin: ["managing-director", "admin", "owner"].includes(p.role),
          });
          await roomAccess(db, u, room.id);
          members.push(p.email);
        } catch (e) {
          if (![403, 404].includes(e.status)) throw e;
        }
      }
      return Response.json({ messages: found.reverse(), more, members });
    }
    if (action === "file") return downloadFile(request, env, user);
    if (action === "files") {
      if (!user.chatAdmin) fail(403, "Messaging administrator required.");
      const visible = new Set((await visibleRooms(db, user)).map((r) => r.id));
      const files = await rows(
        db,
        "SELECT id,room_id,name,size,owner,status,created FROM chat_files WHERE status<>'aborted' ORDER BY created DESC LIMIT 1000",
      );
      return Response.json({
        files: files.filter((f) => visible.has(f.room_id)),
      });
    }
    fail(400, "Unknown request.");
  }
  if (request.method !== "POST") fail(405, "POST is required.");
  if (action === "part") return uploadPart(request, env, user);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "JSON required.");
  const raw = await request.text();
  if (raw.length > 32000) fail(413, "Request too large.");
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    fail(400, "Invalid JSON.");
  }
  if (!b || typeof b !== "object") fail(400, "Invalid request.");
  await charge(db, "requests:" + user.email, 1, 1200, now().slice(0, 13));
  if (action === "ticket") {
    if (!env.CHAT_TICKET) fail(503, "Live connection unavailable.");
    return env.CHAT_TICKET();
  }
  if (action === "room") {
    if (!user.chatAdmin) fail(403, "Messaging administrator required.");
    const id = b.id ? validId(b.id) : crypto.randomUUID(),
      old = await one(db, "SELECT * FROM chat_rooms WHERE id=?", id);
    if (old && ["dm", "groupdm"].includes(old.kind))
      fail(403, "Direct conversations are managed by their participants.");
    if (old && (b.revision !== old.revision || old.deleted))
      fail(409, "Channel changed. Reload before saving.");
    if (b.remove) {
      if (!old) fail(404, "Channel not found.");
      await run(
        db,
        "UPDATE chat_rooms SET deleted=1,revision=revision+1 WHERE id=?",
        id,
      );
      await audit(db, user, "archive-room", id);
      return Response.json({ id });
    }
    const name = text(b.name, 80),
      kind = old?.kind || b.kind,
      parent = text(b.parentId, 100),
      privateRoom = !!b.private,
      roles = await selectedRoles(db, b.roles || []);
    if (!name || !["group", "category", "channel"].includes(kind))
      fail(400, "Enter a name and valid channel type.");
    if (privateRoom && !roles.length)
      fail(400, "Select at least one role for a private channel.");
    if (kind === "group" && parent) fail(400, "Groups cannot have a parent.");
    if (kind !== "group") {
      const p = await one(
        db,
        "SELECT * FROM chat_rooms WHERE id=? AND deleted=0",
        parent,
      );
      if (
        !p ||
        (kind === "category"
          ? p.kind !== "group"
          : !["group", "category"].includes(p.kind))
      )
        fail(400, "Select a valid group or category.");
    }
    if (
      !old &&
      (await one(db, "SELECT count(*) n FROM chat_rooms WHERE deleted=0")).n >=
        300
    )
      fail(400, "Channel limit reached.");
    await run(
      db,
      "INSERT INTO chat_rooms(id,name,kind,parent_id,private,roles,position,creator) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,private=excluded.private,roles=excluded.roles,position=excluded.position,revision=revision+1",
      id,
      name,
      kind,
      parent,
      +privateRoom,
      JSON.stringify(roles),
      Math.min(9999, Math.max(0, Number(b.position) || 0)),
      user.email,
    );
    await audit(db, user, "save-room", id);
    return Response.json({ id });
  }
  if (action === "role") {
    if (!user.chatAdmin) fail(403, "Messaging administrator required.");
    const id = b.id ? validId(b.id) : crypto.randomUUID();
    if (b.remove) {
      if (await one(db, "SELECT id FROM workspace_roles WHERE id=?", id))
        fail(400, "Inherited workspace roles cannot be removed here.");
      const rooms = await rows(
        db,
        "SELECT roles FROM chat_rooms WHERE private=1 AND deleted=0",
      );
      if (rooms.some((r) => list(r.roles).includes(id)))
        fail(400, "Remove this role from private channels first.");
      await db.batch([
        db.prepare("DELETE FROM chat_user_roles WHERE role_id=?").bind(id),
        db.prepare("DELETE FROM chat_roles WHERE id=?").bind(id),
      ]);
    } else {
      const name = text(b.name, 80);
      if (!name) fail(400, "Enter a role name.");
      if (!b.id && (await one(db, "SELECT count(*) n FROM chat_roles")).n >= 50)
        fail(400, "Role limit reached.");
      await run(
        db,
        "INSERT INTO chat_roles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,manage=excluded.manage",
        id,
        name,
        +!!b.manage,
      );
    }
    await audit(db, user, b.remove ? "delete-role" : "save-role", id);
    return Response.json({ id });
  }
  if (action === "membership") {
    if (!user.chatAdmin) fail(403, "Messaging administrator required.");
    await selectedPeople(db, [b.email], env);
    const roles = await selectedRoles(db, b.roles);
    await db.batch([
      db.prepare("DELETE FROM chat_user_roles WHERE email=?").bind(b.email),
      ...roles.map((id) =>
        db.prepare("INSERT INTO chat_user_roles VALUES(?,?)").bind(b.email, id),
      ),
    ]);
    await audit(db, user, "assign-roles", b.email);
    return Response.json({ ok: true });
  }
  if (action === "dm") {
    const members = [
      ...new Set([user.email, ...(await selectedPeople(db, b.members || [], env))]),
    ].sort();
    if (members.length < 2) fail(400, "Select another employee.");
    const old = b.id ? await roomAccess(db, user, b.id) : null;
    if (old && (old.kind !== "groupdm" || old.creator !== user.email))
      fail(403, "Only the group creator can edit group membership.");
    if (members.length === 2 && !old) {
      const existing = await rows(
        db,
        "SELECT r.id FROM chat_rooms r JOIN chat_members m ON m.room_id=r.id WHERE r.kind='dm' AND r.deleted=0 AND m.email=?",
        user.email,
      );
      for (const r of existing) {
        const emails = (
          await rows(
            db,
            "SELECT email FROM chat_members WHERE room_id=? ORDER BY email",
            r.id,
          )
        ).map((m) => m.email);
        if (JSON.stringify(emails) === JSON.stringify(members))
          return Response.json({ id: r.id });
      }
    }
    const id = old?.id || crypto.randomUUID(),
      name = text(b.name, 80) || "Direct messages";
    if (
      !old &&
      (
        await one(
          db,
          "SELECT count(*) n FROM chat_members WHERE email=?",
          user.email,
        )
      ).n >= 200
    )
      fail(400, "Conversation limit reached.");
    await db.batch([
      db
        .prepare(
          "INSERT INTO chat_rooms(id,name,kind,creator) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=revision+1",
        )
        .bind(
          id,
          name,
          members.length === 2 && !old ? "dm" : "groupdm",
          user.email,
        ),
      db.prepare("DELETE FROM chat_members WHERE room_id=?").bind(id),
      ...members.map((e) =>
        db.prepare("INSERT INTO chat_members VALUES(?,?)").bind(id, e),
      ),
    ]);
    await audit(db, user, "save-conversation", id);
    return Response.json({ id });
  }
  if (action === "send") {
    const room = await roomAccess(db, user, b.room);
    if (!["channel", "dm", "groupdm"].includes(room.kind))
      fail(400, "Choose a text channel.");
    const id = validId(b.id),
      body = text(b.body, 8000),
      files = Array.isArray(b.files) ? [...new Set(b.files)] : [];
    if (files.length > 10 || (!body && !files.length))
      fail(400, "Write a message or attach a file.");
    const existing = await one(
      db,
      "SELECT * FROM chat_messages WHERE id=?",
      id,
    );
    if (existing) {
      if (existing.author !== user.email || existing.room_id !== room.id)
        fail(409, "Message identifier already exists.");
      return Response.json({ id });
    }
    if (b.replyId) {
      const reply = await message(db, user, b.replyId);
      if (reply.room_id !== room.id)
        fail(400, "Reply must be in this conversation.");
    }
    for (const f of files) {
      const file = await one(
        db,
        "SELECT * FROM chat_files WHERE id=? AND status='ready'",
        f,
      );
      if (
        !file ||
        file.owner !== user.email ||
        file.room_id !== room.id ||
        file.message_id
      )
        fail(400, "Attachment is not available.");
    }
    await charge(db, "messages", 1, 100000);
    await db.batch([
      db
        .prepare(
          "INSERT INTO chat_messages(id,room_id,author,body,reply_id,created) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, room.id, user.email, body, b.replyId || null, now()),
      ...files.map((f) =>
        db.prepare("UPDATE chat_files SET message_id=? WHERE id=?").bind(id, f),
      ),
    ]);
    return Response.json({ id });
  }
  if (["edit", "delete", "pin", "react"].includes(action)) {
    const m = await message(db, user, b.id);
    if (m.deleted) fail(410, "Message was deleted.");
    if (action === "react") {
      if (!["👍", "❤️", "✅", "🎉", "👀", "🙏", "😂", "❗"].includes(b.emoji))
        fail(400, "Unsupported reaction.");
      if (
        await one(
          db,
          "SELECT emoji FROM chat_reactions WHERE message_id=? AND email=? AND emoji=?",
          m.id,
          user.email,
          b.emoji,
        )
      )
        await run(
          db,
          "DELETE FROM chat_reactions WHERE message_id=? AND email=? AND emoji=?",
          m.id,
          user.email,
          b.emoji,
        );
      else
        await run(
          db,
          "INSERT INTO chat_reactions VALUES(?,?,?)",
          m.id,
          user.email,
          b.emoji,
        );
    } else {
      if (
        action !== "pin" &&
        m.author !== user.email &&
        !(action === "delete" && user.chatAdmin)
      )
        fail(403, "Only the author may edit this message.");
      if (b.revision !== m.revision)
        fail(409, "Message changed. Reload and try again.");
      if (action === "edit") {
        const body = text(b.body, 8000);
        if (!body) fail(400, "Enter message text.");
        await run(
          db,
          "UPDATE chat_messages SET body=?,edited=?,revision=revision+1 WHERE id=?",
          body,
          now(),
          m.id,
        );
      }
      if (action === "pin")
        await run(
          db,
          "UPDATE chat_messages SET pinned=?,revision=revision+1 WHERE id=?",
          +!!b.pinned,
          m.id,
        );
      if (action === "delete") {
        await run(
          db,
          "UPDATE chat_messages SET body='',deleted=1,pinned=0,revision=revision+1 WHERE id=?",
          m.id,
        );
        await audit(db, user, "delete-message", m.id);
      }
    }
    return Response.json({ ok: true });
  }
  if (action === "read") {
    await roomAccess(db, user, b.room);
    const seq = Math.max(
      0,
      Math.min(
        Number(b.seq) || 0,
        (
          await one(
            db,
            "SELECT coalesce(max(seq),0) n FROM chat_messages WHERE room_id=?",
            b.room,
          )
        ).n,
      ),
    );
    await run(
      db,
      "INSERT INTO chat_reads VALUES(?,?,?) ON CONFLICT(room_id,email) DO UPDATE SET seq=max(seq,excluded.seq)",
      b.room,
      user.email,
      seq,
    );
    return Response.json({ ok: true });
  }
  if (action === "upload-start") {
    const room = await roomAccess(db, user, b.room);
    if (!["channel", "dm", "groupdm"].includes(room.kind))
      fail(400, "Choose a conversation.");
    const name = text(b.name, 200).replace(/[\x00-\x1f\/\\]/g, "_"),
      size = Number(b.size);
    if (!name || !Number.isInteger(size) || size <= 0 || size > FILE_LIMIT)
      fail(400, "Files must be between 1 byte and 1 GB.");
    const used = (
      await one(
        db,
        "SELECT coalesce(sum(size),0) n FROM chat_files WHERE status<>'aborted'",
      )
    ).n;
    if (used + size > STORAGE_LIMIT)
      fail(
        413,
        "Shared 10 GB storage allowance reached. Ask an administrator to remove old attachments.",
      );
    const pending = (
      await one(
        db,
        "SELECT count(*) n FROM chat_files WHERE owner=? AND status='pending'",
        user.email,
      )
    ).n;
    if (pending >= 10) fail(400, "Finish or cancel existing uploads first.");
    await charge(db, "upload-bytes", size, STORAGE_LIMIT);
    const id = crypto.randomUUID();
    await run(
      db,
      "INSERT INTO chat_files(id,room_id,owner,name,mime,size,created) VALUES(?,?,?,?,?,?,?)",
      id,
      room.id,
      user.email,
      name,
      safeMime(name),
      size,
      now(),
    );
    try {
      const upload = await env.BUCKET.createMultipartUpload(key(id), {
        httpMetadata: { contentType: safeMime(name) },
      });
      await run(
        db,
        "UPDATE chat_files SET upload_id=? WHERE id=?",
        upload.uploadId,
        id,
      );
    } catch (e) {
      await run(db, "UPDATE chat_files SET status='aborted' WHERE id=?", id);
      throw e;
    }
    return Response.json({ id, partSize: PART_SIZE, parts: [] });
  }
  if (
    [
      "upload-status",
      "upload-complete",
      "upload-abort",
      "file-remove",
    ].includes(action)
  ) {
    const file = await one(db, "SELECT * FROM chat_files WHERE id=?", b.id);
    if (!file) fail(404, "File not found.");
    await roomAccess(db, user, file.room_id);
    if (
      file.owner !== user.email &&
      !(action === "file-remove" && user.chatAdmin)
    )
      fail(403, "Only the uploader can manage this upload.");
    if (action === "upload-status")
      return Response.json({
        id: file.id,
        status: file.status,
        size: file.size,
        name: file.name,
        partSize: PART_SIZE,
        parts: await rows(
          db,
          "SELECT part,etag FROM chat_parts WHERE file_id=? ORDER BY part",
          file.id,
        ),
      });
    if (action === "upload-complete") {
      if (file.status === "ready") return Response.json({ id: file.id });
      if (file.status !== "pending") fail(400, "Upload is not pending.");
      const parts = await rows(
        db,
        "SELECT part AS partNumber,etag FROM chat_parts WHERE file_id=? ORDER BY part",
        file.id,
      );
      if (parts.length !== Math.ceil(file.size / PART_SIZE))
        fail(400, "Upload all file parts first.");
      // Recover a completion whose response was lost without reuploading the file.
      const existing = await env.BUCKET.head(key(file.id));
      if (!existing)
        await env.BUCKET.resumeMultipartUpload(
          key(file.id),
          file.upload_id,
        ).complete(parts);
      await run(db, "UPDATE chat_files SET status='ready' WHERE id=?", file.id);
      return Response.json({ id: file.id });
    }
    if (file.status === "pending")
      await env.BUCKET.resumeMultipartUpload(
        key(file.id),
        file.upload_id,
      ).abort();
    else if (file.status === "ready") await env.BUCKET.delete(key(file.id));
    await run(db, "UPDATE chat_files SET status='aborted' WHERE id=?", file.id);
    await audit(db, user, "remove-file", file.id);
    return Response.json({ ok: true });
  }
  fail(400, "Unknown request.");
}
function safeMime(name) {
  const ext = name.split(".").pop().toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      mp4: "video/mp4",
      webm: "video/webm",
      pdf: "application/pdf",
    }[ext] || "application/octet-stream"
  );
}
async function uploadPart(request, env, user) {
  const url = new URL(request.url),
    db = env.DB_PROJECT_BOARD,
    id = url.searchParams.get("file"),
    part = Number(url.searchParams.get("part"));
  const f = await one(
    db,
    "SELECT * FROM chat_files WHERE id=? AND status='pending'",
    id,
  );
  if (!f || f.owner !== user.email) fail(404, "Upload not found.");
  await roomAccess(db, user, f.room_id);
  const count = Math.ceil(f.size / PART_SIZE);
  if (!Number.isInteger(part) || part < 1 || part > count)
    fail(400, "Invalid file part.");
  const expected = part === count ? f.size - PART_SIZE * (part - 1) : PART_SIZE,
    reader = request.body?.getReader();
  if (!reader) fail(400, "File part is empty.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > expected) {
      await reader.cancel();
      fail(413, "File part is too large.");
    }
    chunks.push(value);
  }
  if (size !== expected) fail(400, "File part length is incorrect.");
  await charge(db, "upload-parts", 1, 6000);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  const result = await env.BUCKET.resumeMultipartUpload(
    key(id),
    f.upload_id,
  ).uploadPart(part, bytes);
  await run(
    db,
    "INSERT INTO chat_parts VALUES(?,?,?) ON CONFLICT(file_id,part) DO UPDATE SET etag=excluded.etag",
    id,
    part,
    result.etag,
  );
  return Response.json(result);
}
async function downloadFile(request, env, user) {
  const db = env.DB_PROJECT_BOARD,
    url = new URL(request.url),
    file = await one(
      db,
      "SELECT * FROM chat_files WHERE id=? AND status='ready'",
      url.searchParams.get("id"),
    );
  if (!file) fail(404, "File not found.");
  await roomAccess(db, user, file.room_id);
  if (file.message_id) {
    const m = await one(
      db,
      "SELECT deleted FROM chat_messages WHERE id=?",
      file.message_id,
    );
    if (!m || m.deleted) fail(404, "Attachment is no longer available.");
  } else if (file.owner !== user.email)
    fail(403, "Upload is private until shared.");
  const range = request.headers.get("range");
  let opts = {},
    start = 0,
    end = file.size - 1;
  if (range) {
    const m = range.match(/^bytes=(\d+)-(\d*)$/);
    if (!m) fail(416, "Invalid range.");
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), end) : end;
    if (start > end || start >= file.size) fail(416, "Invalid range.");
    opts = { range: { offset: start, length: end - start + 1 } };
  }
  const object = await env.BUCKET.get(key(file.id), opts);
  if (!object) fail(404, "File not found.");
  return new Response(object.body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${file.size}` }
        : {}),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

// Abandoned uploads and removed messages must not silently consume the allowance.
export async function cleanChatFiles(env) {
  const db = env.DB_PROJECT_BOARD,
    cutoff = new Date(Date.now() - 86400000).toISOString();
  const candidates = await rows(
    db,
    `SELECT f.* FROM chat_files f LEFT JOIN chat_messages m ON m.id=f.message_id LEFT JOIN chat_rooms r ON r.id=f.room_id LEFT JOIN chat_rooms p ON p.id=r.parent_id LEFT JOIN chat_rooms g ON g.id=p.parent_id WHERE f.status<>'aborted' AND ((f.message_id IS NULL AND f.created<?) OR m.deleted=1 OR r.deleted=1 OR p.deleted=1 OR g.deleted=1) LIMIT 20`,
    cutoff,
  );
  for (const f of candidates) {
    try {
      if (f.status === "pending" && f.upload_id) {
        try {
          await env.BUCKET.resumeMultipartUpload(
            key(f.id),
            f.upload_id,
          ).abort();
        } catch (e) {
          if (!/not exist|not found|NoSuchUpload|10024/i.test(e.message))
            throw e;
        }
      }
      await env.BUCKET.delete(key(f.id));
      await run(db, "UPDATE chat_files SET status='aborted' WHERE id=?", f.id);
    } catch {
      /* Retry on the next maintenance pass without hiding live files. */
    }
  }
  return candidates.length;
}
