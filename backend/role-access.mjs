import { rolePresets, isPrivilegedRole } from "./roles.mjs";

export async function memberRoleIds(db, email, primary) {
  const rows = (
    await db
      .prepare(
        "SELECT role_id FROM workspace_member_roles WHERE email=? ORDER BY role_id",
      )
      .bind(email)
      .all()
  ).results;
  return rows.length ? rows.map((r) => r.role_id) : primary ? [primary] : [];
}
export async function effectiveAccess(db, member) {
  const roles = await memberRoleIds(db, member.email, member.role);
  const configured = (
    await db.prepare("SELECT id,tools FROM workspace_roles").all()
  ).results;
  const tools = [
    ...new Set(
      roles.flatMap((id) => {
        const r = configured.find((r) => r.id === id);
        if (r) return JSON.parse(r.tools);
        const p = rolePresets.find((r) => r.id === id);
        return p?.legacy ? JSON.parse(member.tools || "[]") : p?.tools || [];
      }),
    ),
  ];
  return { roles, tools, admin: roles.some(isPrivilegedRole) };
}
export const effectiveToolsSql = `coalesce((SELECT json_group_array(value) FROM (SELECT DISTINCT j.value FROM workspace_member_roles a JOIN workspace_roles r ON r.id=a.role_id JOIN json_each(r.tools) j WHERE a.email=workspace_members.email)), '[]')`;
