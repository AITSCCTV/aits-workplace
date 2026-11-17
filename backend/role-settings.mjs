import { rolePresets, isPrivilegedRole } from "./roles.mjs";
import { toolsCatalog, ownerEmails } from "./members.mjs";
import { effectiveToolsSql } from "./role-access.mjs";
import { HttpError } from "./auth.mjs";
export async function configuredRoles(db) {
  const rows = (
    await db
      .prepare(
        "SELECT r.*,d.name_en,d.name_th,d.chat_manage,d.channel_id FROM workspace_roles r LEFT JOIN workspace_role_details d ON d.id=r.id",
      )
      .all()
  ).results;
  return [
    ...rolePresets.filter((r) => !r.legacy),
    ...rows
      .filter((r) => !rolePresets.some((p) => p.id === r.id))
      .map((r) => ({
        id: r.id,
        en: r.name_en || r.id,
        th: r.name_th || r.name_en || r.id,
        tools: [],
      })),
  ].map((r) => {
    const row = rows.find((v) => v.id === r.id);
    return {
      ...r,
      tools: isPrivilegedRole(r.id)
        ? toolsCatalog.map((t) => t.id)
        : row
          ? JSON.parse(row.tools)
          : r.tools,
      revision: row?.revision || 0,
      locked: isPrivilegedRole(r.id),
      chatManage: !!row?.chat_manage,
      channelId: row?.channel_id || "role-" + r.id,
    };
  });
}
export async function rolesApi(request, env, user) {
  if (!user.admin || !user.token)
    throw new HttpError(403, "Administrator access is required.");
  const db = env.DB_PROJECT_BOARD,
    owner = ownerEmails(env).includes(user.email);
  if (request.method === "GET") {
    const counts = (
      await db
        .prepare(
          "SELECT a.role_id AS role,count(*) n FROM workspace_member_roles a JOIN workspace_members m ON m.email=a.email WHERE m.removed_at IS NULL GROUP BY a.role_id",
        )
        .all()
    ).results;
    const channels = (
      await db
        .prepare(
          "SELECT id,name,kind,parent_id,private,roles,revision FROM chat_rooms WHERE deleted=0 AND kind IN ('channel','category','group') ORDER BY position,name",
        )
        .all()
    ).results.map((c) => ({ ...c, roles: JSON.parse(c.roles) }));
    return Response.json({
      owner,
      catalog: toolsCatalog,
      channels,
      roles: (await configuredRoles(db)).map((r) => ({
        ...r,
        members: counts.find((c) => c.role === r.id)?.n || 0,
        channels: channels
          .filter((c) => c.roles.includes(r.id))
          .map((c) => c.id),
      })),
    });
  }
  if (request.method !== "POST") throw new HttpError(405, "POST is required.");
  if (!owner)
    throw new HttpError(
      403,
      "Only the workspace owner can edit role permissions.",
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON is required.");
  let b;
  try {
    b = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const creating = !b?.id,
    id = creating ? crypto.randomUUID() : b.id;
  if (
    typeof id !== "string" ||
    !/^[\w-]{1,100}$/.test(id) ||
    isPrivilegedRole(id)
  )
    throw new HttpError(403, "This role is protected.");
  const state = await db
    .prepare("SELECT revision FROM workspace_access_state WHERE id=1")
    .first();
  const before = await db
    .prepare("SELECT * FROM workspace_roles WHERE id=?")
    .bind(id)
    .first();
  if (!creating && (!before || before.revision !== b.revision))
    throw new HttpError(409, "Role changed. Reload and review before saving.");
  const details = await db.prepare('SELECT * FROM workspace_role_details WHERE id=?').bind(id).first();
  const chatManage = typeof b.chatManage === 'boolean' ? b.chatManage : !!details?.chat_manage;
  const preset = rolePresets.find((r) => r.id === id),
    name =
      (typeof b.name === "string" ? b.name.trim().slice(0, 80) : preset?.en || details?.name_en) ||
      "";
  if (creating && !name) throw new HttpError(400, "Enter a role name.");
  if (
    creating &&
    (await db.prepare("SELECT count(*) n FROM workspace_roles").first()).n >= 50
  )
    throw new HttpError(400, "Role limit reached.");
  if (
    !Array.isArray(b.tools) ||
    b.tools.length > toolsCatalog.length ||
    b.tools.some((id) => !toolsCatalog.some((t) => t.id === id))
  )
    throw new HttpError(400, "Invalid role permissions.");
  const selected = [...new Set(b.tools)].sort();
  if (
    toolsCatalog.some(
      (t) =>
        selected.includes(t.id) &&
        t.requires.some((id) => !selected.includes(id)),
    )
  )
    throw new HttpError(
      400,
      "Include the required tools for each selected tool.",
    );
  const channels = (
    await db
      .prepare(
        "SELECT * FROM chat_rooms WHERE deleted=0 AND kind IN ('channel','category','group')",
      )
      .all()
  ).results;
  const chosen =
    b.channels ??
    channels.filter((c) => JSON.parse(c.roles).includes(id)).map((c) => c.id);
  if (
    !Array.isArray(chosen) ||
    chosen.some((cid) => !channels.some((c) => c.id === cid && c.private))
  )
    throw new HttpError(400, "Choose valid private channels.");
  const changed = channels.filter(
    (c) =>
      !!c.private && JSON.parse(c.roles).includes(id) !== chosen.includes(c.id),
  );
  for (const c of changed) {
    if (b.channelRevisions?.[c.id] !== c.revision)
      throw new HttpError(
        409,
        "Channel permissions changed. Reload before saving.",
      );
  }
  // A role must also have access to restricted ancestors to reach its selected channels.
  for (const c of channels.filter((c) => chosen.includes(c.id))) {
    let parent = channels.find((p) => p.id === c.parent_id);
    while (parent) {
      if (parent.private && !chosen.includes(parent.id))
        throw new HttpError(
          400,
          "Include the restricted group/category for each selected channel.",
        );
      parent = channels.find((p) => p.id === parent.parent_id);
    }
  }
  const auditId = crypto.randomUUID(),
    at = new Date().toISOString(),
    tools = JSON.stringify(selected),
    revision = (before?.revision || 0) + 1;
  const queries = [
    db
      .prepare(
        "UPDATE workspace_access_state SET revision=revision+1 WHERE id=1 AND revision=?",
      )
      .bind(state.revision),
    creating
      ? db
          .prepare(
            "INSERT INTO workspace_roles SELECT ?,?,1,?,? WHERE changes()=1",
          )
          .bind(id, tools, at, user.email)
      : db
          .prepare(
            "UPDATE workspace_roles SET tools=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? AND changes()=1",
          )
          .bind(tools, at, user.email, id, b.revision),
    db
      .prepare(
        "INSERT INTO workspace_role_audit SELECT ?,?,?,?,?,? WHERE changes()=1",
      )
      .bind(
        auditId,
        id,
        user.email,
        JSON.stringify(before || {}),
        JSON.stringify({
          tools: selected,
          channels: chosen,
          chatManage,
          revision,
        }),
        at,
      ),
  ];
  const guard = "EXISTS(SELECT 1 FROM workspace_role_audit WHERE id=?)";
  queries.push(
    db
      .prepare(
        `INSERT INTO workspace_role_details(id,name_en,name_th,chat_manage,channel_id) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_th=excluded.name_th,chat_manage=excluded.chat_manage`,
      )
      .bind(
        id,
        name || id,
        preset?.th || name || id,
        +chatManage,
        "role-" + id,
        auditId,
      ),
  );
  if (creating)
    queries.push(
      db
        .prepare(
          `INSERT INTO chat_rooms(id,name,kind,parent_id,private,roles,creator) SELECT ?,?,'channel','role-channels',1,?,? WHERE ${guard}`,
        )
        .bind("role-" + id, name, JSON.stringify([id]), user.email, auditId),
    );
  for (const c of changed) {
    const allowed = JSON.parse(c.roles).filter((r) => r !== id);
    if (chosen.includes(c.id)) allowed.push(id);
    queries.push(
      db
        .prepare(
          `UPDATE chat_rooms SET roles=?,revision=revision+1 WHERE id=? AND ${guard}`,
        )
        .bind(JSON.stringify(allowed), c.id, auditId),
    );
  }
  // Cached member tools and revisions stay current; authorization independently reads the shared roles.
  queries.push(
    db
      .prepare(
        `INSERT INTO workspace_member_audit SELECT ?||':'||email,email,?,json_object('role',role,'tools',json(tools),'revision',revision),json_object('role',role,'tools',json(${effectiveToolsSql}),'revision',revision+1,'roleUpdate',?),? FROM workspace_members WHERE email IN(SELECT email FROM workspace_member_roles WHERE role_id=?) AND removed_at IS NULL AND ${guard}`,
      )
      .bind(auditId, user.email, auditId, at, id, auditId),
  );
  queries.push(
    db
      .prepare(
        `UPDATE workspace_members SET tools=${effectiveToolsSql},revision=revision+1,updated_at=?,updated_by=? WHERE email IN(SELECT email FROM workspace_member_roles WHERE role_id=?) AND removed_at IS NULL AND ${guard}`,
      )
      .bind(at, user.email, id, auditId),
  );
  const result = await db.batch(queries);
  if (!result[1].meta.changes)
    throw new HttpError(409, "Permissions changed. Reload and try again.");
  return Response.json({
    updated: result.at(-1).meta.changes,
    role: { id, tools: selected, revision },
  });
}
