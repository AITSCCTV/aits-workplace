import React from "react";
const w = window as any;
const t = (th: string, en: string) =>
  w.AITS_I18N.language() === "en" ? en : th;
export function EmployeeAvatar({ person }: { person: any }) {
  return (
    <span className="chat-person-avatar" aria-hidden="true">
      {(person?.name || person?.email || "?").slice(0, 2)}
      <i className={person?.online ? "online" : ""} />
    </span>
  );
}
export function employeeRoles(person: any, roles: any[]) {
  return (person?.roles || [person?.role])
    .filter(Boolean)
    .map((id: string) => {
      const role = roles.find((r) => r.id === id);
      return role
        ? w.AITS_I18N.language() === "en"
          ? role.name
          : role.nameTh || role.name
        : id === "owner"
          ? t("เจ้าของพื้นที่ทำงาน", "Workspace owner")
          : id;
    })
    .join(" · ");
}
export function DirectSidebar({
  data,
  room,
  query,
  onOpen,
  onStart,
  busy,
}: any) {
  const people = data.people.filter((p: any) => p.email !== data.email);
  const matches = (p: any) =>
    [p?.name, p?.email, employeeRoles(p, data.roles)]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const personFor = (r: any) =>
    people.find((p: any) => r.members?.includes(p.email));
  const recent = data.rooms
    .filter((r: any) => r.kind === "dm" && matches(personFor(r)))
    .sort(
      (a: any, b: any) => (b.lastMessage?.seq || 0) - (a.lastMessage?.seq || 0),
    );
  return (
    <div className="chat-direct-directory">
      <h3>{t("ล่าสุด", "Recent conversations")}</h3>
      {!recent.length && (
        <p className="chat-directory-empty">
          {t("ยังไม่มีบทสนทนา", "No conversations yet")}
        </p>
      )}
      {recent.map((r: any) => {
        const p = personFor(r),
          last = r.lastMessage;
        return (
          <button
            key={r.id}
            className={"chat-person-row " + (room === r.id ? "selected" : "")}
            onClick={() => onOpen(r.id)}
          >
            <EmployeeAvatar person={p} />
            <span className="chat-person-copy">
              <strong>{p?.name || p?.email || t("พนักงาน", "Employee")}</strong>
              <small>
                {last
                  ? last.body || t("ไฟล์แนบ", "Attachment")
                  : t("เริ่มบทสนทนา", "Start a conversation")}
              </small>
            </span>
            <span className="chat-person-meta">
              {last && (
                <time dateTime={last.created}>
                  {new Date(last.created).toLocaleDateString(
                    w.AITS_I18N.locale(),
                    { month: "short", day: "numeric" },
                  )}
                  <br />
                  {new Date(last.created).toLocaleTimeString(
                    w.AITS_I18N.locale(),
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </time>
              )}
              {r.unread > 0 && (
                <b aria-label={t("ข้อความที่ยังไม่อ่าน", "Unread messages")}>
                  {r.unread > 99 ? "99+" : r.unread}
                </b>
              )}
            </span>
          </button>
        );
      })}
      <h3>{t("พนักงานทั้งหมด", "All employees")}</h3>
      {people.filter(matches).map((p: any) => (
        <button
          disabled={busy}
          key={p.email}
          className="chat-person-row employee"
          onClick={() => onStart(p.email)}
          aria-label={t("ส่งข้อความถึง ", "Message ") + p.name}
        >
          <EmployeeAvatar person={p} />
          <span className="chat-person-copy">
            <strong>{p.name}</strong>
            <small>{p.email}</small>
            <small className="chat-person-roles">
              {employeeRoles(p, data.roles)}
            </small>
            <small className={p.online ? "chat-person-online" : ""}>
              {p.online ? t("ออนไลน์", "Online") : t("ออฟไลน์", "Offline")}
            </small>
          </span>
        </button>
      ))}
      {!people.filter(matches).length && (
        <p className="chat-directory-empty">
          {t("ไม่พบพนักงาน", "No matching employees")}
        </p>
      )}
    </div>
  );
}
