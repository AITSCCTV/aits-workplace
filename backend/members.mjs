import { effectiveAccess, memberRoleIds } from "./role-access.mjs";
import { configuredRoles } from "./role-settings.mjs";
import { rolePresets, isPrivilegedRole } from "./roles.mjs";
import { HttpError } from "./auth.mjs";
export const toolsCatalog = [
  [
    "weeklybrief",
    "สรุปประชุมประจำสัปดาห์",
    "WeeklyBrief AI",
    ["tasks", "line", "calendar"],
  ],
  ["assistant", "ผู้ช่วย AI", "AI assistant", []],
  ["crm", "ข้อมูลลูกค้า AI", "AI customer records", []],
  ["prices", "ราคาสินค้า AI", "AI price list", []],
  ["quotations", "ใบเสนอราคา AI", "AI quotations", []],
  [
    "calendar-write",
    "สร้างกิจกรรมผ่าน AI",
    "Create calendar events",
    ["calendar"],
  ],
  ["tasks", "บอร์ดงาน", "Task board", []],
  ["projects", "โครงการ", "Projects", []],
  ["calendar", "ปฏิทิน", "Calendar", []],
  ["line", "บทสนทนา LINE", "LINE conversations", []],
  ["line-send", "ตอบกลับ LINE", "Reply to LINE", ["line"]],
  [
    "review",
    "ตรวจและอนุมัติข้อเสนอ LINE",
    "Review and apply LINE suggestions",
    ["tasks", "projects", "line"],
  ],
  ["design-studio", "สตูดิโอออกแบบ", "Design Studio", []],
  ["floorplan-studio", "สตูดิโอแปลน", "Floorplan Studio", []],
  ["content-studio", "สตูดิโอคอนเทนต์", "Content Studio", []],
  ["inventory", "คลังอุปกรณ์", "Inventory", []],
  ["service", "บริการและประกัน", "Service & warranty", []],
  [
    "forms",
    "รับความต้องการและสำรวจหน้างาน",
    "Customer brief & site survey",
    [],
  ],
].map(([id, th, en, requires]) => ({ id, th, en, requires }));
export const ownerEmails = (env) =>
  (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
export const hasTool = (user, tool) => user.admin || user.tools?.includes(tool);
export function sessionInfo(user) {
  return {
    email: user.email,
    admin: user.admin,
    owner: !!user.owner,
    roles: user.roles || [],
    role: user.role || (user.admin ? "owner" : "custom"),
    mustChangePassword: !!user.mustChangePassword,
    passwordLogin: !!user.sessionHash,
    tools: [
      ...new Set([
        ...(user.admin ? toolsCatalog.map((t) => t.id) : user.tools || []),
        ...(user.admin || user.employee
          ? ["project-management", "messaging"]
          : []),
      ]),
    ],
  };
}
const decode = (row) => ({
  ...row,
  tools: JSON.parse(row.tools),
  enabled: !!row.enabled,
});
export async function membersApi(request, env, user) {
  if (!user.admin || !user.token)
    throw new HttpError(
      403,
      "Only the workspace owner can manage employee access.",
    );
  const db = env.DB_PROJECT_BOARD,
    owner = ownerEmails(env).includes(user.email);

  if (request.method === "GET")
    return Response.json({
      owner,
      passwordLoginEnabled: env.PASSWORD_LOGIN_ENABLED === "true",
      roles: (await configuredRoles(db)).filter(
        (r) => owner || !isPrivilegedRole(r.id),
      ),
      loginReady: env.EMPLOYEE_LOGIN_READY === "true",
      owners: ownerEmails(env),
      catalog: toolsCatalog,
      members: await Promise.all(
        (
          await db
            .prepare(
              "SELECT * FROM workspace_members WHERE removed_at IS NULL ORDER BY email LIMIT 501",
            )
            .all()
        ).results.map(async (row) => ({
          ...decode(row),
          ...(await effectiveAccess(db, row)),
        })),
      ),
    });
  if (request.method !== "POST") throw new HttpError(405, "POST is required.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON is required.");
  let b;
  try {
    b = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const email =
    typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, "Enter a valid employee email.");
  if (ownerEmails(env).includes(email))
    throw new HttpError(403, "Owner access cannot be changed here.");
  const accessState = await db
    .prepare("SELECT revision FROM workspace_access_state WHERE id=1")
    .first();
  const lock = () =>
    db
      .prepare(
        "UPDATE workspace_access_state SET revision=revision+1 WHERE id=1 AND revision=?",
      )
      .bind(accessState.revision);
  const before = await db
    .prepare("SELECT * FROM workspace_members WHERE email=?")
    .bind(email)
    .first();
  const priorRoles = await memberRoleIds(db, email, before?.role);
  if (!owner && (priorRoles.some(isPrivilegedRole) || email === user.email))
    throw new HttpError(
      403,
      "Only the owner can change administrator accounts.",
    );
  if (b.action === "remove") {
    if (
      !Number.isInteger(b.revision) ||
      !before ||
      before.removed_at ||
      before.revision !== b.revision
    )
      throw new HttpError(
        409,
        "Access changed. Reload and review before removing.",
      );
    const at = new Date().toISOString(),
      auditId = crypto.randomUUID();
    const result = await db.batch([
      lock(),
      db
        .prepare(
          "UPDATE workspace_members SET enabled=0,tools='[]',removed_at=?,revoked_before=?,revision=revision+1,updated_at=?,updated_by=? WHERE email=? AND revision=? AND removed_at IS NULL AND changes()=1",
        )
        .bind(
          at,
          Math.floor(Date.now() / 1000),
          at,
          user.email,
          email,
          b.revision,
        ),
      db
        .prepare(
          "INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1",
        )
        .bind(
          auditId,
          email,
          user.email,
          JSON.stringify(decode(before)),
          JSON.stringify({ email, removed: true }),
          at,
        ),
      db
        .prepare(
          "DELETE FROM workspace_passwords WHERE email=? AND EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)",
        )
        .bind(email, auditId),
      db
        .prepare(
          "DELETE FROM workspace_sessions WHERE email=? AND EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)",
        )
        .bind(email, auditId),
    ]);
    if (!result[1].meta.changes)
      throw new HttpError(
        409,
        "Access changed. Reload and review before removing.",
      );
    return Response.json({ removed: true, email });
  }
  if (b.action !== undefined)
    throw new HttpError(400, "Unknown account action.");
  if (
    typeof b.enabled !== "boolean" ||
    !Number.isInteger(b.revision) ||
    b.revision < 0 ||
    !Array.isArray(b.tools) ||
    b.tools.length > toolsCatalog.length ||
    b.tools.some((t) => !toolsCatalog.some((c) => c.id === t))
  )
    throw new HttpError(400, "Invalid permissions.");
  const roles = [...new Set(b.roles || [b.role || "custom"])];
  const configuredRolesList = await configuredRoles(db);
  if (
    !Array.isArray(b.roles ?? roles) ||
    !roles.length ||
    roles.length > 50 ||
    roles.some(
      (id) =>
        !configuredRolesList.some((r) => r.id === id) &&
        !rolePresets.some((r) => r.id === id && r.legacy),
    )
  )
    throw new HttpError(400, "Choose at least one valid role.");
  if (!owner && roles.some(isPrivilegedRole))
    throw new HttpError(403, "Only the owner can assign administrators.");
  const role = roles.find(isPrivilegedRole) || roles[0];
  const selected = roles.some(isPrivilegedRole)
    ? toolsCatalog.map((t) => t.id)
    : [
        ...new Set(
          roles.flatMap(
            (id) =>
              configuredRolesList.find((r) => r.id === id)?.tools || b.tools,
          ),
        ),
      ];
  if (
    toolsCatalog.some(
      (t) =>
        selected.includes(t.id) &&
        t.requires.some((id) => !selected.includes(id)),
    )
  )
    throw new HttpError(
      400,
      "LINE review also requires Task board, Projects and LINE archive.",
    );
  if ((before && !before.removed_at ? before.revision : 0) !== b.revision)
    throw new HttpError(
      409,
      "Access changed. Reload and review before saving.",
    );
  if (
    (!before || before.removed_at) &&
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM workspace_members WHERE removed_at IS NULL",
        )
        .first()
    ).n >= 500
  )
    throw new HttpError(400, "Employee limit reached.");
  const revision = before?.revision || 0,
    at = new Date().toISOString(),
    tools = JSON.stringify(selected),
    next = {
      email,
      role,
      roles,
      tools: selected,
      enabled: b.enabled,
      revision: revision + 1,
    };
  const mutation = before
    ? db
        .prepare(
          "UPDATE workspace_members SET tools=?,enabled=?,role=?,removed_at=NULL,revision=revision+1,updated_at=?,updated_by=? WHERE email=? AND revision=? AND changes()=1",
        )
        .bind(tools, +b.enabled, role, at, user.email, email, revision)
    : db
        .prepare(
          "INSERT OR IGNORE INTO workspace_members(email,tools,enabled,role,revision,updated_at,updated_by) SELECT ?,?,?,?,1,?,? WHERE changes()=1",
        )
        .bind(email, tools, +b.enabled, role, at, user.email);
  const auditId = crypto.randomUUID();
  const result = await db.batch([
    lock(),
    mutation,
    db
      .prepare(
        "INSERT INTO workspace_member_audit(id,email,actor,before_data,after_data,at) SELECT ?,?,?,?,?,? WHERE changes()=1",
      )
      .bind(
        auditId,
        email,
        user.email,
        before
          ? JSON.stringify({ ...decode(before), roles: priorRoles })
          : null,
        JSON.stringify(next),
        at,
      ),
    db
      .prepare(
        "DELETE FROM workspace_member_roles WHERE email=? AND EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)",
      )
      .bind(email, auditId),
    ...roles.map((id) =>
      db
        .prepare(
          "INSERT INTO workspace_member_roles SELECT ?,? WHERE EXISTS(SELECT 1 FROM workspace_member_audit WHERE id=?)",
        )
        .bind(email, id, auditId),
    ),
  ]);
  if (!result[1].meta.changes)
    throw new HttpError(
      409,
      "Access changed. Reload and review before saving.",
    );
  return Response.json({ member: next });
}
