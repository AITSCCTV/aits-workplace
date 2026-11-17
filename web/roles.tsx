import React, { useEffect, useState } from "react";
import "./admin.css";
const t = (th: string, en: string) =>
  (window as any).AITS_I18N.language() === "en" ? en : th;
export function Roles() {
  const [data, setData] = useState<any>(null),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false),
    [, render] = useState(0);
  async function load(id?: string) {
    setBusy(true);
    try {
      await (window as any).AITS_SESSION.ready;
      const r = await fetch("/api/roles"),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
      setForm(d.roles.find((r: any) => r.id === id) || d.roles[0]);
      setError("");
      setConfirm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    const f = () => render((v) => v + 1);
    window.addEventListener("aits-language-change", f);
    return () => window.removeEventListener("aits-language-change", f);
  }, []);
  function toggle(id: string, on: boolean) {
    let tools = on
      ? [
          ...form.tools,
          id,
          ...data.catalog.find((c: any) => c.id === id).requires,
        ]
      : form.tools.filter((v: string) => v !== id);
    tools = [...new Set(tools)].filter((v) =>
      data.catalog
        .find((c: any) => c.id === v)
        .requires.every((d: string) => tools.includes(d)),
    );
    setForm({ ...form, tools });
    setConfirm(false);
    setNotice("");
  }
  function channel(id: string, on: boolean) {
    const selected = new Set<string>(form.channels || []);
    if (on) {
      selected.add(id);
      let c = data.channels.find((c: any) => c.id === id);
      while (c?.parent_id) {
        c = data.channels.find((p: any) => p.id === c.parent_id);
        if (c?.private) selected.add(c.id);
      }
    } else {
      selected.delete(id);
      for (const c of data.channels) {
        let parent = c.parent_id;
        while (parent) {
          if (parent === id) {
            selected.delete(c.id);
            break;
          }
          parent = data.channels.find((p: any) => p.id === parent)?.parent_id;
        }
      }
    }
    setForm({ ...form, channels: [...selected] });
    setConfirm(false);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: form.id,
            name: form.en,
            tools: form.tools,
            revision: form.revision,
            chatManage: form.chatManage,
            channels: form.channels || [],
            channelRevisions: Object.fromEntries(
              data.channels.map((c: any) => [c.id, c.revision]),
            ),
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load(d.role.id);
      setNotice(
        t(
          "อัปเดตสิทธิ์เครื่องมือและแชทแล้ว",
          "Tool and channel access updated.",
        ),
      );
    } catch (e: any) {
      setError(e.message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace-home access-page" data-no-translate>
      <header className="access-heading">
        <h2>{t("บทบาทและสิทธิ์", "Roles and permissions")}</h2>
        {data?.owner && (
          <button
            className="action-dark"
            onClick={() => {
              setForm({
                en: "",
                th: "",
                tools: [],
                channels: [],
                chatManage: false,
                members: 0,
                revision: 0,
              });
              setConfirm(false);
              setError("");
            }}
          >
            {t("สร้างบทบาท", "Create role")} +
          </button>
        )}
      </header>
      {error && (
        <p className="access-alert" role="alert">
          {error}{" "}
          <button onClick={() => load(form?.id)}>
            {t("โหลดใหม่", "Reload")}
          </button>
        </p>
      )}
      {notice && (
        <p className="access-notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <p>{t("กำลังโหลด…", "Loading…")}</p>
      ) : (
        <div className="access-layout">
          <section className="access-list" aria-label={t("บทบาท", "Roles")}>
            {data.roles.map((r: any) => (
              <button
                disabled={busy}
                key={r.id}
                className={
                  "access-member " + (form?.id === r.id ? "selected" : "")
                }
                onClick={() => {
                  setForm(r);
                  setConfirm(false);
                  setNotice("");
                  setError("");
                }}
              >
                <strong>{t(r.th, r.en)}</strong>
                <small>
                  {r.members} {t("คน", "employees")} · {r.tools.length}{" "}
                  {t("เครื่องมือ", "tools")} · {r.channels.length}{" "}
                  {t("ช่อง", "channels")}
                </small>
              </button>
            ))}
          </section>
          {form && (
            <section className="access-editor">
              <h2>
                {form.id ? t(form.th, form.en) : t("บทบาทใหม่", "New role")}
              </h2>
              <p>
                {t(
                  "รวมสิทธิ์จากทุกบทบาทที่พนักงานได้รับ การเปลี่ยนแปลงมีผลกับทั้งเครื่องมือและ Team Chat",
                  "Employees receive the combined access of all their roles, across tools and Team Chat.",
                )}
              </p>
              {form.locked && (
                <p className="access-owner">
                  {t(
                    "เข้าถึงทุกเครื่องมือและช่องของทีม · ไม่รวม DM ของผู้อื่น",
                    "All tools and team channels · Other people’s DMs remain private.",
                  )}
                </p>
              )}
              {!data.owner && (
                <p>
                  {t(
                    "เฉพาะเจ้าของพื้นที่ทำงานแก้ไขบทบาทได้",
                    "Only the workspace owner can edit roles.",
                  )}
                </p>
              )}
              {!form.id && (
                <label>
                  {t("ชื่อบทบาท", "Role name")}
                  <input
                    required
                    maxLength={80}
                    value={form.en}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        en: e.target.value,
                        th: e.target.value,
                      })
                    }
                  />
                  <small>
                    {t(
                      "สร้างช่องส่วนตัวสำหรับบทบาทนี้โดยอัตโนมัติ",
                      "A private channel is created automatically for this role.",
                    )}
                  </small>
                </label>
              )}
              <fieldset disabled={busy || form.locked || !data.owner}>
                <legend>{t("เครื่องมือ", "Tools")}</legend>
                <div className="access-tools">
                  {data.catalog.map((c: any) => (
                    <label key={c.id} className="access-check">
                      <input
                        type="checkbox"
                        checked={form.tools.includes(c.id)}
                        onChange={(e) => toggle(c.id, e.target.checked)}
                      />
                      <span>{t(c.th, c.en)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy || form.locked || !data.owner}>
                <legend>{t("ช่อง Team Chat", "Team Chat channels")}</legend>
                <p className="access-help">
                  {t(
                    "พนักงานทุกคนเข้าถึงช่องสาธารณะได้ ช่องส่วนตัวใช้บทบาทด้านล่าง รวมสิทธิ์ของกลุ่มและหมวดหมู่ที่จำเป็นให้โดยอัตโนมัติ",
                    "Public channels are available to all employees. Select private channels below; required group and category access is included automatically.",
                  )}
                </p>
                <label className="access-check">
                  <input
                    type="checkbox"
                    checked={!!form.chatManage}
                    onChange={(e) =>
                      setForm({ ...form, chatManage: e.target.checked })
                    }
                  />
                  <span>
                    {t(
                      "จัดการช่องและข้อความของทีม",
                      "Manage team channels and messages",
                    )}
                    <small>
                      {t(
                        "ไม่ให้สิทธิ์ผู้ดูแลพื้นที่ทำงานหรือ DM ของผู้อื่น",
                        "Does not grant workspace administration or access to other people’s DMs.",
                      )}
                    </small>
                  </span>
                </label>
                <div className="access-tools">
                  {data.channels
                    .filter((c: any) => !!c.private)
                    .map((c: any) => (
                      <label className="access-check" key={c.id}>
                        <input
                          type="checkbox"
                          checked={(form.channels || []).includes(c.id)}
                          onChange={(e) => channel(c.id, e.target.checked)}
                        />
                        <span>
                          {c.name}
                          <small>
                            {data.channels.find(
                              (p: any) => p.id === c.parent_id,
                            )?.name || c.kind}
                          </small>
                        </span>
                      </label>
                    ))}
                </div>
              </fieldset>
              {!form.locked && data.owner && (
                <footer>
                  {!confirm ? (
                    <button
                      className="action-dark"
                      disabled={busy || (!form.id && !form.en.trim())}
                      onClick={() => setConfirm(true)}
                    >
                      {t("บันทึกสิทธิ์", "Save permissions")}
                    </button>
                  ) : (
                    <div
                      role="group"
                      aria-label={t("ยืนยันการเปลี่ยนแปลง", "Confirm changes")}
                    >
                      <p>
                        {t(
                          "ใช้สิทธิ์นี้กับพนักงานทุกคนในบทบาทนี้?",
                          "Apply these permissions to everyone assigned this role?",
                        )}
                      </p>
                      <button
                        className="action-dark"
                        disabled={busy}
                        onClick={save}
                      >
                        {busy
                          ? t("กำลังบันทึก…", "Saving…")
                          : t("ยืนยัน", "Apply to all")}
                      </button>{" "}
                      <button disabled={busy} onClick={() => setConfirm(false)}>
                        {t("ยกเลิก", "Cancel")}
                      </button>
                    </div>
                  )}
                </footer>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
