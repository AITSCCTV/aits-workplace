import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./messaging.css";
import { documentPreview } from "./chat-document-preview";
const w = window as any;
const t = (th: string, en: string) =>
  w.AITS_I18N.language() === "en" ? en : th;
const bytes = (n: number) =>
  n >= 1e9
    ? (n / 1e9).toFixed(2) + " GB"
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + " MB"
      : Math.ceil(n / 1e3) + " KB";
const endpoint = "/api/messaging";
async function api(action: string, data?: any, query: any = {}) {
  const r = await fetch(
    endpoint + "?" + new URLSearchParams({ action, ...query }),
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const v = await r.json();
  if (!r.ok) throw Error(v.error || "Unable to load Team Chat");
  return v;
}
const icons: any = {
  chat: "M4 4h16v13H9l-5 4zM8 9h8m-8 4h5",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  people: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  send: "m3 3 18 9-18 9 4-9zM7 12h14",
  clip: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2",
  pin: "m8 3 8 0-1 7 4 4H5l4-4zM12 14v8",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4",
  close: "m5 5 14 14M5 19 19 5",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  menu: "M4 6h16M4 12h16M4 18h16",
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name] || icons.chat} />
    </svg>
  );
}
function Button({ icon, label, onClick, active = false }: any) {
  return (
    <button
      type="button"
      className={"chat-icon " + (active ? "active" : "")}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
function Dialog({ title, close, children }: any) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="chat-dialog" onCancel={close}>
      <header>
        <h2>{title}</h2>
        <Button icon="close" label={t("ปิด", "Close")} onClick={close} />
      </header>
      {children}
    </dialog>
  );
}
function Chat() {
  const [data, setData] = useState<any>({
      rooms: [],
      people: [],
      roles: [],
      assignments: [],
    }),
    [room, setRoom] = useState(""),
    [messages, setMessages] = useState<any[]>([]),
    [members, setMembers] = useState<string[]>([]),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<any>(null),
    [edit, setEdit] = useState<any>(null),
    [draftFiles, setDraftFiles] = useState<any[]>([]),
    [upload, setUpload] = useState<any>(null),
    [pending, setPending] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [dialog, setDialog] = useState<any>(null),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [pins, setPins] = useState(false),
    [live, setLive] = useState("connecting"),
    [memberPanel, setMemberPanel] = useState(false),
    [nav, setNav] = useState(false),
    [group, setGroup] = useState("all"),
    [, language] = useState(0);
  const current = useRef({ room: "", search: "", pins: false }),
    loadId = useRef(0),
    bottom = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null),
    cancelUpload = useRef(false),
    state = useRef<any>(data),
    initialized = useRef(false),
    notifyEnabled = useRef(false),
    lastUnread = useRef(new Map()),
    reconnect = useRef<any>(null),
    draftRoom = useRef("");
  state.current = data;
  current.current = { room, search, pins };
  const name = (email: string) =>
    data.people.find((p: any) => p.email === email)?.name || email;
  const title = (r: any) =>
    r?.kind === "dm"
      ? (r.members || [])
          .filter((e: string) => e !== data.email)
          .map(name)
          .join(", ") || r.name
      : r?.name || t("แชททีม", "Team Chat");
  async function bootstrap() {
    const d = await api("bootstrap");
    if (notifyEnabled.current && initialized.current && document.hidden) {
      const changed = d.rooms.filter(
        (r: any) => r.unread > (lastUnread.current.get(r.id) || 0),
      );
      if (
        changed.length &&
        "Notification" in window &&
        Notification.permission === "granted"
      )
        new Notification(t("ข้อความใหม่ใน AITS", "New AITS messages"), {
          body: t("เปิดแชททีมเพื่ออ่าน", "Open Team Chat to read"),
          tag: "aits-team-chat",
        });
    }
    lastUnread.current = new Map(
      d.rooms.map((r: any) => [r.id, r.unread || 0]),
    );
    initialized.current = true;
    setData(d);
    if (
      current.current.room &&
      !d.rooms.some((r: any) => r.id === current.current.room)
    ) {
      setRoom("");
      setMessages([]);
    }
    return d;
  }
  async function history(older = false) {
    const c = { ...current.current };
    if (!c.room) return;
    const id = ++loadId.current;
    const v = await api("messages", undefined, {
      room: c.room,
      ...(c.search ? { q: c.search } : {}),
      ...(c.pins ? { pins: "1" } : {}),
      ...(older && messages.length ? { before: String(messages[0].seq) } : {}),
    });
    if (id !== loadId.current || current.current.room !== c.room) return;
    setMessages((prev) => (older ? [...v.messages, ...prev] : v.messages));
    setMembers(v.members);
    setMore(v.more);
    if (
      !older &&
      !c.search &&
      !c.pins &&
      v.messages.length &&
      !document.hidden
    ) {
      await api("read", { room: c.room, seq: v.messages.at(-1).seq });
      setData((d: any) => ({
        ...d,
        rooms: d.rooms.map((r: any) =>
          r.id === c.room ? { ...r, unread: 0 } : r,
        ),
      }));
    }
  }
  async function refresh() {
    try {
      await bootstrap();
      await history();
    } catch (e: any) {
      setError(e.message);
      if (/access|private|enabled|Sign|expired/i.test(e.message)) {
        setMessages([]);
        setMembers([]);
      }
    }
  }
  useEffect(() => {
    let stopped = false,
      socket: WebSocket | undefined,
      timer: any;
    const connect = async () => {
      try {
        const token = await api("ticket", {});
        if (stopped) return;
        const origin = new URL(w.AITS_CONFIG.apiOrigin).origin.replace(
          /^http/,
          "ws",
        );
        socket = new WebSocket(
          origin +
            "/project-board/api/messaging/live?ticket=" +
            encodeURIComponent(token.ticket),
        );
        socket.onopen = () => {
          setLive("live");
          refresh();
        };
        socket.onmessage = () => {
          clearTimeout(timer);
          timer = setTimeout(refresh, 250);
        };
        socket.onerror = () => setLive("reconnecting");
        socket.onclose = () => {
          setLive("reconnecting");
          if (!stopped) reconnect.current = setTimeout(connect, 5000);
        };
      } catch (e: any) {
        setLive("offline");
        if (!stopped) reconnect.current = setTimeout(connect, 15000);
      }
    };
    w.AITS_SESSION.ready.then(async () => {
      if (stopped) return;
      try {
        const d = await bootstrap();
        if (stopped) return;
        setRoom(
          (
            d.rooms.find((r: any) => r.id === "general") ||
            d.rooms.find((r: any) => r.kind === "channel")
          )?.id || "",
        );
        await connect();
      } catch (e: any) {
        setError(e.message);
      }
    });
    const fallback = setInterval(() => {
      if (!document.hidden) refresh();
    }, 60000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const lang = () => language((n) => n + 1);
    window.addEventListener("aits-language-change", lang);
    return () => {
      stopped = true;
      socket?.close();
      clearTimeout(reconnect.current);
      clearTimeout(timer);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("aits-language-change", lang);
    };
  }, []);
  useEffect(() => {
    setMessages([]);
    setReply(null);
    setEdit(null);
    setBody("");
    setDraftFiles([]);
    draftRoom.current = room;
    let stored;
    try {
      stored = JSON.parse(
        sessionStorage.getItem("aits-chat-upload:" + data.email + ":" + room) ||
          "null",
      );
    } catch {}
    setPending(stored);
    history().catch((e: any) => setError(e.message));
  }, [room]);
  useEffect(() => {
    const timer = setTimeout(
      () => history().catch((e: any) => setError(e.message)),
      250,
    );
    return () => clearTimeout(timer);
  }, [search, pins]);
  useEffect(() => {
    if (!search && !pins)
      bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.at(-1)?.id, room]);
  async function action(fn: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: any) {
    e.preventDefault();
    const text = body,
      attached = draftFiles,
      editing = edit,
      responding = reply,
      selected = room;
    await action(async () => {
      if (editing)
        await api("edit", {
          id: editing.id,
          revision: editing.revision,
          body: text,
        });
      else
        await api("send", {
          id: crypto.randomUUID(),
          room: selected,
          body: text,
          replyId: responding?.id,
          files: attached.map((f) => f.id),
        });
      setBody("");
      setReply(null);
      setEdit(null);
      setDraftFiles([]);
    });
  }
  function switchRoom(id: string) {
    if (upload) {
      setError(
        t("หยุดหรืออัปโหลดให้เสร็จก่อน", "Pause or finish the upload first."),
      );
      return;
    }
    setRoom(id);
    setSearch("");
    setPins(false);
    setNav(false);
  }
  function remember(v: any) {
    const k = "aits-chat-upload:" + data.email + ":" + room;
    v
      ? sessionStorage.setItem(k, JSON.stringify(v))
      : sessionStorage.removeItem(k);
    setPending(v);
  }
  async function uploadFile(file: File, resume = false) {
    setError("");
    cancelUpload.current = false;
    setUpload({ name: file.name, progress: 0 });
    const selected = room;
    try {
      if (file.size > 1e9)
        throw Error(
          t("ไฟล์ต้องไม่เกิน 1 GB", "Files must be no larger than 1 GB."),
        );
      let item = resume ? pending : null;
      if (
        item &&
        (item.name !== file.name ||
          item.size !== file.size ||
          item.lastModified !== file.lastModified)
      )
        throw Error(
          t(
            "เลือกไฟล์เดิมเพื่ออัปโหลดต่อ",
            "Choose the original file to resume.",
          ),
        );
      let status = item
        ? await api("upload-status", { id: item.id })
        : await api("upload-start", { room, name: file.name, size: file.size });
      item = {
        id: status.id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      };
      remember(item);
      const done = new Set((status.parts || []).map((p: any) => p.part)),
        count = Math.ceil(file.size / status.partSize);
      for (let part = 1; part <= count; part++) {
        if (cancelUpload.current) break;
        if (done.has(part)) continue;
        setUpload({
          name: file.name,
          progress: Math.round(((part - 1) / count) * 100),
        });
        let success = false;
        for (let retry = 0; retry < 3 && !success; retry++) {
          const response = await fetch(
            endpoint + "?action=part&file=" + item.id + "&part=" + part,
            {
              method: "POST",
              body: file.slice(
                (part - 1) * status.partSize,
                Math.min(part * status.partSize, file.size),
              ),
            },
          );
          if (response.ok) success = true;
          else {
            const detail = await response.json();
            if (response.status < 500 || retry === 2)
              throw Error(detail.error || "Upload failed.");
            await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
          }
        }
      }
      if (cancelUpload.current) return;
      await api("upload-complete", { id: item.id });
      if (current.current.room === selected) setDraftFiles((v) => [...v, item]);
      remember(null);
      await bootstrap();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpload(null);
      if (picker.current) picker.current.value = "";
    }
  }
  async function fileURL(file: any, inline = false) {
    return w.AITS_SESSION.attachment({
      id: file.id,
      name: file.name,
      mime: file.mime,
      inline,
      scope: w.AITS_CONFIG.base + "messaging/",
    });
  }
  async function openFile(file: any, inline = false) {
    try {
      if (inline && !/^(image|video)\/|application\/pdf/.test(file.mime)) {
        setPreview({ ...file, text: await documentPreview(file) });
        return;
      }
      const url = await fileURL(file, inline);
      if (inline) setPreview({ ...file, url });
      else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.append(a);
        a.click();
        a.remove();
      }
    } catch (e: any) {
      setError(e.message);
    }
  }
  function rolesPicker(value: string[], onChange: (v: string[]) => void) {
    return (
      <div className="chat-checks">
        {data.roles.map((r: any) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={value.includes(r.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, r.id]
                    : value.filter((v) => v !== r.id),
                )
              }
            />
            {r.name}
          </label>
        ))}
      </div>
    );
  }
  function peoplePicker(value: string[], onChange: (v: string[]) => void) {
    return (
      <div className="chat-checks">
        {data.people
          .filter((p: any) => p.email !== data.email)
          .map((p: any) => (
            <label key={p.email}>
              <input
                type="checkbox"
                checked={value.includes(p.email)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, p.email]
                      : value.filter((v) => v !== p.email),
                  )
                }
              />
              {p.name}
            </label>
          ))}
      </div>
    );
  }
  const selected = data.rooms.find((r: any) => r.id === room),
    groups = data.rooms.filter((r: any) => r.kind === "group"),
    dms = data.rooms.filter((r: any) => ["dm", "groupdm"].includes(r.kind));
  const editRoom = (r?: any) =>
    setDialog({
      type: "room",
      id: r?.id,
      revision: r?.revision,
      name: r?.name || "",
      kind: r?.kind || "channel",
      parentId: r?.parent_id || groups[0]?.id || "",
      private: !!r?.private,
      roles: r ? JSON.parse(r.roles) : [],
      position: r?.position || 0,
    });
  const patch = (v: any) => setDialog((d: any) => ({ ...d, ...v }));
  function channelButton(r: any) {
    return (
      <button
        key={r.id}
        className={"chat-channel " + (room === r.id ? "selected" : "")}
        onClick={() => switchRoom(r.id)}
      >
        {r.private ? (
          <Icon name="lock" />
        ) : (
          <span className="chat-hash">#</span>
        )}
        <span>{title(r)}</span>
        {r.unread > 0 && <b>{r.unread > 99 ? "99+" : r.unread}</b>}
      </button>
    );
  }
  function content(text: string) {
    return text
      .split(/(@[^\s@]+@[^\s@]+\.[^\s@]+)/g)
      .map((part, i) =>
        part.startsWith("@") ? <mark key={i}>{part}</mark> : part,
      );
  }
  return (
    <main className="chat-app" data-no-translate="">
      <aside className={"chat-rooms " + (nav ? "open" : "")}>
        <header>
          <div className="chat-brand">
            <Icon name="chat" />
            <strong>{t("แชททีม", "Team Chat")}</strong>
          </div>
          <Button
            icon="plus"
            label={t("ข้อความใหม่", "New conversation")}
            onClick={() => setDialog({ type: "dm", name: "", members: [] })}
          />
        </header>
        <div className="chat-room-filter">
          <Icon name="search" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("ค้นหาช่อง", "Find a channel")}
            aria-label={t("ค้นหาช่อง", "Find a channel")}
          />
        </div>
        <div className="chat-group-picker">
          <button
            className={group === "all" ? "active" : ""}
            onClick={() => setGroup("all")}
          >
            {t("ทั้งหมด", "All")}
          </button>
          {groups.map((g: any) => (
            <button
              key={g.id}
              title={g.name}
              className={group === g.id ? "active" : ""}
              onClick={() => setGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="chat-channel-scroll">
          {groups
            .filter((g: any) => group === "all" || group === g.id)
            .map((g: any) => (
              <section key={g.id}>
                <h3>
                  {g.name}
                  {data.admin && (
                    <Button
                      icon="settings"
                      label={t("แก้ไขกลุ่ม", "Edit group")}
                      onClick={() => editRoom(g)}
                    />
                  )}
                </h3>
                {data.rooms
                  .filter(
                    (r: any) =>
                      r.parent_id === g.id &&
                      r.kind === "channel" &&
                      r.name.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map(channelButton)}
                {data.rooms
                  .filter(
                    (r: any) => r.parent_id === g.id && r.kind === "category",
                  )
                  .map((c: any) => (
                    <div key={c.id}>
                      <h4>
                        {c.name}
                        {data.admin && (
                          <Button
                            icon="settings"
                            label={t("แก้ไขหมวดหมู่", "Edit category")}
                            onClick={() => editRoom(c)}
                          />
                        )}
                      </h4>
                      {data.rooms
                        .filter(
                          (r: any) =>
                            r.parent_id === c.id &&
                            r.name.toLowerCase().includes(filter.toLowerCase()),
                        )
                        .map(channelButton)}
                    </div>
                  ))}
              </section>
            ))}
          <h3>{t("ข้อความส่วนตัว", "Direct messages")}</h3>
          {dms
            .filter((r: any) =>
              title(r).toLowerCase().includes(filter.toLowerCase()),
            )
            .map(channelButton)}
        </div>
        <footer>
          <span className={"chat-connection " + live}>
            <i />
            {live === "live"
              ? t("เชื่อมต่อแล้ว", "Live")
              : live === "offline"
                ? t("ออฟไลน์", "Offline")
                : t("กำลังเชื่อมต่อ", "Connecting")}
          </span>
          {data.admin && (
            <Button
              icon="settings"
              label={t("จัดการแชท", "Chat administration")}
              onClick={() => setDialog({ type: "admin" })}
            />
          )}
        </footer>
      </aside>
      <section className="chat-main">
        <header className="chat-top">
          <Button
            icon="menu"
            label={t("ช่องสนทนา", "Channels")}
            onClick={() => setNav(!nav)}
          />
          <div>
            <h1>
              {!!selected?.private && <Icon name="lock" />}
              {title(selected)}
            </h1>
            <small>
              {selected
                ? t(
                    "พื้นที่ทำงานร่วมกันของทีม",
                    "A place for your team to connect",
                  )
                : t(
                    "เลือกช่องเพื่อเริ่มสนทนา",
                    "Choose a conversation to get started",
                  )}
            </small>
          </div>
          <div className="chat-toolbar">
            <Button
              icon="pin"
              active={pins}
              label={t("ข้อความปักหมุด", "Pinned messages")}
              onClick={() => setPins(!pins)}
            />
            <Button
              icon="bell"
              label={t("เปิดการแจ้งเตือน", "Enable notifications")}
              onClick={async () => {
                if (!("Notification" in window)) {
                  setError(
                    t(
                      "เบราว์เซอร์ไม่รองรับ",
                      "Notifications are not supported in this browser.",
                    ),
                  );
                  return;
                }
                const p = await Notification.requestPermission();
                notifyEnabled.current = p === "granted";
                setError(
                  p === "granted"
                    ? t(
                        "เปิดแจ้งเตือนเมื่อแท็บแชทอยู่เบื้องหลังแล้ว",
                        "Notifications enabled while Team Chat is open in the background.",
                      )
                    : t(
                        "อนุญาตแจ้งเตือนในการตั้งค่าเบราว์เซอร์",
                        "Allow notifications in browser settings.",
                      ),
                );
              }}
            />
            <Button
              icon="people"
              active={memberPanel}
              label={t("สมาชิก", "Members")}
              onClick={() => setMemberPanel(!memberPanel)}
            />
            {selected &&
              data.admin &&
              !["dm", "groupdm"].includes(selected.kind) && (
                <Button
                  icon="settings"
                  label={t("ตั้งค่าช่อง", "Channel settings")}
                  onClick={() => editRoom(selected)}
                />
              )}{" "}
            {selected?.kind === "groupdm" &&
              selected.creator === data.email && (
                <Button
                  icon="settings"
                  label={t("สมาชิกกลุ่ม", "Group members")}
                  onClick={() =>
                    setDialog({
                      type: "dm",
                      id: selected.id,
                      name: selected.name,
                      members: selected.members.filter(
                        (e: string) => e !== data.email,
                      ),
                    })
                  }
                />
              )}
          </div>
        </header>
        {error && (
          <div className="chat-error" role="status">
            {error}
            <Button
              icon="close"
              label={t("ปิด", "Dismiss")}
              onClick={() => setError("")}
            />
          </div>
        )}
        {room && (
          <div className="chat-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ค้นหาในบทสนทนานี้", "Search this conversation")}
              aria-label={t("ค้นหาข้อความ", "Search messages")}
            />
            {pins && (
              <button onClick={() => setPins(false)}>
                {t("ปักหมุดเท่านั้น ×", "Pinned only ×")}
              </button>
            )}
          </div>
        )}
        <div className="chat-body">
          <div className="chat-timeline" aria-live="polite">
            {more && (
              <button
                className="chat-older"
                onClick={() =>
                  history(true).catch((e: any) => setError(e.message))
                }
              >
                {t("โหลดข้อความเก่า", "Load earlier messages")}
              </button>
            )}
            {!messages.length && (
              <div className="chat-empty">
                <Icon name="chat" />
                <h2>
                  {search || pins
                    ? t("ไม่พบข้อความ", "No matching messages")
                    : t("เริ่มบทสนทนา", "Start a conversation")}
                </h2>
                <p>
                  {t(
                    "แบ่งปันอัปเดต ถามคำถาม และทำงานร่วมกัน",
                    "Share updates, ask questions, and work together.",
                  )}
                </p>
              </div>
            )}
            {messages.map((m: any) => (
              <article
                className={
                  "chat-message " + (m.author === data.email ? "own" : "")
                }
                key={m.id}
              >
                <div className="chat-avatar">{name(m.author).slice(0, 2)}</div>
                <div className="chat-message-content">
                  <header>
                    <strong>{name(m.author)}</strong>
                    <time dateTime={m.created}>
                      {new Date(m.created).toLocaleString(
                        w.AITS_I18N.locale(),
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </time>
                    {m.edited && <small>{t("แก้ไขแล้ว", "edited")}</small>}
                    {!!m.pinned && <Icon name="pin" />}
                  </header>
                  {m.reply && (
                    <blockquote>
                      {name(m.reply.author)} ·{" "}
                      {m.reply.body || t("ลบข้อความแล้ว", "Message deleted")}
                    </blockquote>
                  )}
                  <p>
                    {m.deleted
                      ? t("ลบข้อความแล้ว", "Message deleted")
                      : content(m.body)}
                  </p>
                  {m.files?.map((f: any) => (
                    <div key={f.id} className="chat-attachment">
                      <Icon name="clip" />
                      <div>
                        <strong>{f.name}</strong>
                        <small>{bytes(f.size)}</small>
                      </div>
                      {
                        <button onClick={() => openFile(f, true)}>
                          {t("ดู", "Preview")}
                        </button>
                      }
                      <button onClick={() => openFile(f)}>
                        {t("ดาวน์โหลด", "Download")}
                      </button>
                      {(m.author === data.email || data.admin) && (
                        <button
                          onClick={() =>
                            setDialog({
                              type: "confirm",
                              title: t(
                                "ลบไฟล์แนบถาวร?",
                                "Permanently remove this attachment?",
                              ),
                              run: () => api("file-remove", { id: f.id }),
                            })
                          }
                        >
                          {t("ลบ", "Remove")}
                        </button>
                      )}
                    </div>
                  ))}
                  {!!m.reactions?.length && (
                    <div className="chat-reactions">
                      {m.reactions.map((r: any) => (
                        <button
                          className={r.mine ? "mine" : ""}
                          key={r.emoji}
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api("react", { id: m.id, emoji: r.emoji }),
                            )
                          }
                        >
                          {r.emoji} {r.n}
                        </button>
                      ))}
                    </div>
                  )}
                  {!m.deleted && (
                    <div className="chat-message-actions">
                      <button
                        onClick={() => {
                          setReply(m);
                          setEdit(null);
                        }}
                      >
                        {t("ตอบกลับ", "Reply")}
                      </button>
                      <details>
                        <summary>{t("แสดงความรู้สึก", "React")}</summary>
                        <div>
                          {["👍", "❤️", "✅", "🎉", "👀", "🙏", "😂", "❗"].map(
                            (e) => (
                              <button
                                key={e}
                                onClick={() =>
                                  action(() =>
                                    api("react", { id: m.id, emoji: e }),
                                  )
                                }
                              >
                                {e}
                              </button>
                            ),
                          )}
                        </div>
                      </details>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action(() =>
                            api("pin", {
                              id: m.id,
                              revision: m.revision,
                              pinned: !m.pinned,
                            }),
                          )
                        }
                      >
                        {m.pinned
                          ? t("เลิกปักหมุด", "Unpin")
                          : t("ปักหมุด", "Pin")}
                      </button>
                      {m.author === data.email && (
                        <button
                          onClick={() => {
                            setEdit(m);
                            setBody(m.body);
                            setReply(null);
                          }}
                        >
                          {t("แก้ไข", "Edit")}
                        </button>
                      )}
                      {(m.author === data.email || data.admin) && (
                        <button
                          onClick={() =>
                            setDialog({
                              type: "confirm",
                              title: t("ลบข้อความนี้?", "Delete this message?"),
                              run: () =>
                                api("delete", {
                                  id: m.id,
                                  revision: m.revision,
                                }),
                            })
                          }
                        >
                          {t("ลบ", "Delete")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
            <div ref={bottom} />
          </div>
          {memberPanel && (
            <aside className="chat-member-list">
              <h3>
                {t("สมาชิก", "Members")} · {members.length}
              </h3>
              {members.map((e) => (
                <button
                  key={e}
                  onClick={() =>
                    setDialog({ type: "dm", name: "", members: [e] })
                  }
                >
                  <span className="chat-avatar">{name(e).slice(0, 2)}</span>
                  {name(e)}
                </button>
              ))}
            </aside>
          )}
        </div>
        {room && (
          <form className="chat-compose" onSubmit={submit}>
            {(reply || edit) && (
              <div className="chat-context">
                {edit
                  ? t("กำลังแก้ไขข้อความ", "Editing message")
                  : t("ตอบกลับ ", "Replying to ") + name(reply.author)}
                <Button
                  icon="close"
                  label={t("ยกเลิก", "Cancel")}
                  onClick={() => {
                    setReply(null);
                    setEdit(null);
                    setBody("");
                  }}
                />
              </div>
            )}
            {draftFiles.map((f) => (
              <div className="chat-context" key={f.id}>
                {f.name} · {bytes(f.size)}
                <button
                  type="button"
                  onClick={() =>
                    action(async () => {
                      await api("upload-abort", { id: f.id });
                      setDraftFiles((v) => v.filter((x) => x.id !== f.id));
                    })
                  }
                >
                  {t("นำออก", "Remove")}
                </button>
              </div>
            ))}
            {upload && (
              <div className="chat-upload">
                <span>
                  {upload.name} · {upload.progress}%
                </span>
                <progress value={upload.progress} max="100" />
                <button
                  type="button"
                  onClick={() => {
                    cancelUpload.current = true;
                  }}
                >
                  {t("หยุดชั่วคราว", "Pause")}
                </button>
              </div>
            )}
            {pending && !upload && (
              <div className="chat-context">
                {pending.name}
                <button type="button" onClick={() => picker.current?.click()}>
                  {t("เลือกไฟล์เดิมเพื่ออัปโหลดต่อ", "Choose file to resume")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    action(async () => {
                      await api("upload-abort", { id: pending.id });
                      remember(null);
                    })
                  }
                >
                  {t("ยกเลิก", "Cancel")}
                </button>
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={8000}
              placeholder={t(
                "ส่งข้อความ… ใช้ @ เพื่อกล่าวถึง",
                "Message… use @ to mention",
              )}
              aria-label={t("ข้อความ", "Message")}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (body.trim() || draftFiles.length) submit(e);
                }
              }}
            />
            {body.endsWith("@") && (
              <div className="chat-mentions">
                {members.map((e) => (
                  <button
                    type="button"
                    key={e}
                    onClick={() => setBody((v) => v + e + " ")}
                  >
                    {name(e)}
                  </button>
                ))}
              </div>
            )}
            <footer>
              <input
                ref={picker}
                hidden
                type="file"
                onChange={(e) => {
                  if (e.target.files?.[0])
                    uploadFile(e.target.files[0], !!pending);
                }}
              />
              <Button
                icon="clip"
                label={t("แนบไฟล์สูงสุด 1 GB", "Attach a file up to 1 GB")}
                onClick={() => {
                  if (!upload && !edit && draftFiles.length < 10)
                    picker.current?.click();
                }}
              />
              <small>
                {t(
                  "Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่",
                  "Enter to send · Shift+Enter for a new line",
                )}
              </small>
              <button
                className="chat-send"
                type="submit"
                disabled={
                  busy || !!upload || (!body.trim() && !draftFiles.length)
                }
              >
                <Icon name="send" />
                {edit ? t("บันทึก", "Save") : t("ส่ง", "Send")}
              </button>
            </footer>
          </form>
        )}
      </section>
      {preview && (
        <Dialog title={preview.name} close={() => setPreview(null)}>
          {preview.text !== undefined ? (
            <pre className="chat-document">{preview.text}</pre>
          ) : preview.mime.startsWith("image/") ? (
            <img
              className="chat-preview"
              src={preview.url}
              alt={preview.name}
            />
          ) : preview.mime.startsWith("video/") ? (
            <video className="chat-preview" src={preview.url} controls />
          ) : (
            <iframe
              className="chat-pdf"
              src={preview.url}
              title={preview.name}
            />
          )}
          <button onClick={() => openFile(preview)}>
            {t("ดาวน์โหลด", "Download")}
          </button>
        </Dialog>
      )}
      {dialog && (
        <Dialog
          title={
            dialog.title ||
            (dialog.type === "admin"
              ? t("จัดการแชท", "Chat administration")
              : dialog.type === "role"
                ? t("บทบาทแชท", "Messaging role")
                : dialog.type === "membership"
                  ? name(dialog.email)
                  : dialog.type === "dm"
                    ? t("บทสนทนาส่วนตัว", "Private conversation")
                    : t("ตั้งค่าช่อง", "Channel settings"))
          }
          close={() => setDialog(null)}
        >
          {error && (
            <div className="chat-error" role="alert">
              {error}
            </div>
          )}
          {dialog.type === "admin" ? (
            <>
              <nav className="chat-admin-tabs">
                <a href={w.AITS_CONFIG.base + "admin/?tab=roles"}>
                  {t(
                    "บทบาทและสิทธิ์ใน People",
                    "Roles & permissions in People",
                  )}{" "}
                  ↗
                </a>
              </nav>

              <>
                <button className="chat-primary" onClick={() => editRoom()}>
                  {t(
                    "สร้างกลุ่ม / หมวดหมู่ / ช่อง",
                    "Create group / category / channel",
                  )}
                </button>
                {data.rooms
                  .filter((r: any) => !["dm", "groupdm"].includes(r.kind))
                  .map((r: any) => (
                    <div className="chat-admin-row" key={r.id}>
                      <span>
                        {r.name}
                        <small>
                          {r.kind} ·{" "}
                          {r.private
                            ? t("ส่วนตัว", "Private")
                            : t("พนักงานทุกคน", "All employees")}
                        </small>
                      </span>
                      <button onClick={() => editRoom(r)}>
                        {t("แก้ไข", "Edit")}
                      </button>
                    </div>
                  ))}
                <button
                  onClick={() =>
                    action(async () =>
                      setDialog({
                        type: "storage",
                        title: t("ไฟล์แนบ", "Attachments"),
                        files: (await api("files")).files,
                      }),
                    )
                  }
                >
                  {t("จัดการไฟล์", "Manage files")}
                </button>
                <p>
                  {t("พื้นที่จัดเก็บ", "Storage")}: {bytes(data.storage || 0)} /
                  10 GB ·{" "}
                  {t(
                    "อัปโหลดใหม่สูงสุด 10 GB ต่อเดือน",
                    "Up to 10 GB of new uploads per month",
                  )}
                </p>
              </>
            </>
          ) : dialog.type === "storage" ? (
            <>
              {dialog.files.map((f: any) => (
                <div className="chat-admin-row" key={f.id}>
                  <span>
                    {f.name}
                    <small>
                      {bytes(f.size)} · {f.status}
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      action(async () => {
                        await api("file-remove", { id: f.id });
                        setDialog({
                          ...dialog,
                          files: dialog.files.filter((x: any) => x.id !== f.id),
                        });
                      })
                    }
                  >
                    {t("ลบ", "Remove")}
                  </button>
                </div>
              ))}
            </>
          ) : dialog.type === "confirm" ? (
            <>
              <p>
                {t(
                  "การดำเนินการนี้ไม่สามารถย้อนกลับได้",
                  "This action cannot be undone.",
                )}
              </p>
              <button
                className="chat-primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await dialog.run();
                    setDialog(null);
                  })
                }
              >
                {t("ยืนยัน", "Confirm")}
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  const d = { ...dialog };
                  delete d.type;
                  if (dialog.type === "room" && dialog.kind === "group")
                    d.parentId = "";
                  const result = await api(dialog.type, d);
                  setDialog(null);
                  if (
                    dialog.type === "dm" ||
                    (dialog.type === "room" && dialog.kind === "channel")
                  )
                    setRoom(result.id);
                });
              }}
            >
              {dialog.type !== "membership" && (
                <label>
                  {t("ชื่อ", "Name")}
                  <input
                    value={dialog.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    required={dialog.type !== "dm"}
                    maxLength={80}
                  />
                </label>
              )}
              {dialog.type === "room" && (
                <>
                  <label>
                    {t("ประเภท", "Type")}
                    <select
                      disabled={!!dialog.id}
                      value={dialog.kind}
                      onChange={(e) => patch({ kind: e.target.value })}
                    >
                      <option value="group">{t("กลุ่ม", "Group")}</option>
                      <option value="category">
                        {t("หมวดหมู่", "Category")}
                      </option>
                      <option value="channel">
                        {t("ช่องข้อความ", "Text channel")}
                      </option>
                    </select>
                  </label>
                  {dialog.kind !== "group" && (
                    <label>
                      {t("อยู่ภายใต้", "Parent")}
                      <select
                        required
                        value={dialog.parentId}
                        onChange={(e) => patch({ parentId: e.target.value })}
                      >
                        <option value="">{t("เลือก", "Choose")}</option>
                        {data.rooms
                          .filter(
                            (r: any) =>
                              r.kind === "group" ||
                              (dialog.kind === "channel" &&
                                r.kind === "category"),
                          )
                          .map((r: any) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label>
                    {t("ลำดับ", "Order")}
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={dialog.position}
                      onChange={(e) =>
                        patch({ position: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="chat-inline">
                    <input
                      type="checkbox"
                      checked={dialog.private}
                      onChange={(e) => patch({ private: e.target.checked })}
                    />
                    {t(
                      "ส่วนตัว — เฉพาะบทบาทที่เลือก",
                      "Private — selected roles only",
                    )}
                  </label>
                  {dialog.private &&
                    rolesPicker(dialog.roles, (roles) => patch({ roles }))}
                  <p>
                    {t(
                      "สิทธิ์ของกลุ่มและหมวดหมู่มีผลกับช่องภายในด้วย ผู้ดูแลแชทเข้าถึงช่องส่วนตัวได้ แต่ไม่สามารถเปิด DM ของผู้อื่น",
                      "Group and category restrictions also apply to their channels. Chat administrators can access private channels, but cannot open other people’s DMs.",
                    )}
                  </p>
                </>
              )}
              {dialog.type === "dm" && (
                <>
                  {peoplePicker(dialog.members, (members) =>
                    patch({ members }),
                  )}
                  <p>
                    {t(
                      "สมาชิกที่เพิ่มเข้ากลุ่มจะเห็นประวัติทั้งหมด",
                      "Members added to a group can see its full history.",
                    )}
                  </p>
                </>
              )}
              <footer>
                <button className="chat-primary" disabled={busy} type="submit">
                  {t("บันทึก", "Save")}
                </button>
                {dialog.id && dialog.type === "room" && (
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({
                        type: "confirm",
                        title: t("ลบรายการนี้?", "Remove this item?"),
                        run: () =>
                          api(dialog.type, { ...dialog, remove: true }),
                      })
                    }
                  >
                    {t("ลบ", "Remove")}
                  </button>
                )}
              </footer>
            </form>
          )}
        </Dialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<Chat />);
