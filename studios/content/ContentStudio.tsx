import { studioRequest } from "./studioApi";
import StudioImage from "./StudioImage";
import "./contentStudio.css";
import { useState, useEffect, useRef } from "react";
import { translate, type Language } from "./i18n";
import { editorialStyle, matchesEditorialFilter } from './editorial.mjs';
type Item = any;
const stateLabelsTH: Record<string, string> = {
  DRAFT: "พร้อมตรวจทาน",
  POSTING: "กำลังเผยแพร่",
  PREPARING: "กำลังเตรียมรูปภาพ",
  PUBLISHED: "เผยแพร่แล้ว",
  PARTIAL: "ตรวจสอบผลการเผยแพร่",
  FAILED: "เผยแพร่ไม่สำเร็จ",
  UNKNOWN: "ต้องตรวจสอบในบัญชี",
};
export default function ContentStudio() {
  const researchDialog = useRef<HTMLDialogElement>(null);
  const researchButton = useRef<HTMLButtonElement>(null);
  const [research, setResearch] = useState<{id?: string; stage: string; added?: number; error?: string} | null>(null);
  const researching = !!research && !["EMPTY", "COMPLETE", "FAILED", "TIMED_OUT"].includes(research.stage);
  useEffect(() => { if (research) researchDialog.current?.showModal(); }, [!!research]);
  useEffect(() => {
    if (!research?.id || !researching) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await studioRequest("/api/research/" + research.id);
        const result = await response.json() as any;
        if (!response.ok) throw new Error(result.error);
        if (!cancelled) {
          setResearch(result);
          if (["EMPTY", "COMPLETE"].includes(result.stage)) await load(selected?.id);
        }
      } catch (error) { if (!cancelled) setResearch(r => ({...r, stage: "FAILED", error: (error as Error).message})); }
    };
    const timer = window.setInterval(poll, 3000);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [research?.id, researching]);
  async function researchNow() {
    if (researching) return;
    setResearch({stage: "QUEUED"});
    try {
      const response = await studioRequest("/api/research", {method: "POST"});
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error);
      setResearch({id: result.id, stage: "QUEUED"});
    } catch (error) { setResearch({stage: "FAILED", error: (error as Error).message}); }
  }
  function closeResearch() {
    researchDialog.current?.close();
    setResearch(null);
    researchButton.current?.focus();
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const request = studioRequest;
  const browserOnly = false;
  const [language, setLanguage] = useState<Language>("th");
  const t = (text: string) => translate(language, text);
  const label = (status: string) => t(stateLabelsTH[status] || status);
  const locale = language === "en" ? "en-GB" : "th-TH";
  const [connectionCheckedAt, setConnectionCheckedAt] = useState<string | null>(null);
  const displayTime = (value?: string) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(locale, { timeZone: "Asia/Bangkok" }) + " (UTC+7)"
    : t("ไม่ทราบวันที่");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aits-workplace-language");
      if (saved === "th" || saved === "en") setLanguage(saved);
    } catch {}
  }, []);
  useEffect(() => {const update=()=>setLanguage((window as any).AITS_I18N.language());window.addEventListener('aits-language-change',update);return()=>window.removeEventListener('aits-language-change',update);},[]);
  function changeLanguage(value: Language) {document.querySelector<HTMLButtonElement>('nav[aria-label="Language / ภาษา"] button[lang="'+value+'"]')?.click();}
  const [drafts, setDrafts] = useState<Item[]>([]),
    [selected, setSelected] = useState<Item | null>(null),
    [status, setStatus] = useState<Item | null>(null),
    [filter, setFilter] = useState("ALL"),
    [channel, setChannel] = useState("facebook"),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [dirty, setDirty] = useState(false);
  async function load(keep?: string) {
    try {
      const [a, b] = await Promise.all([
        request("/api/drafts"),
        request("/api/status"),
      ]);
      if (!a.ok || !b.ok)
        throw new Error(
          (await (!a.ok ? a : b).json()).error ||
            t("โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง"),
        );
      const list = ((await a.json()) as any).drafts;
      setDrafts(list);
      setStatus(await b.json());
      setConnectionCheckedAt(new Date().toISOString());
      if (!keep) setSelected(null);
      if (keep) setSelected(list.find((d: Item) => d.id === keep) || null);
      return true;
    } catch (e) {
      setMessage(t((e as Error).message));
      return false;
    }
  }
  useEffect(() => {
    load();
  }, []);
  const list = drafts
    .filter(
      (d) =>
        matchesEditorialFilter(d, filter) &&
        d.title.includes(query),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  function select(d: Item) {
    if (busy) return;
    if (dirty && !window.confirm(t("ออกจากร่างโดยไม่บันทึกการแก้ไขหรือไม่?")))
      return;
    setSelected(d);
    setChecked(false);
    setDirty(false);
    setMessage("");
  }
  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await request("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: selected, revision: selected.revision }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(t(j.error));
      if (!(await load(selected.id))) return;
      setDirty(false);
      setChecked(false);
      setMessage(t("บันทึกร่างแล้ว"));
    } catch (e) {
      setMessage(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function post() {
    if (!selected) return;
    setBusy(true);
    const approval = { id: selected.id, revision: selected.revision, checked, channel };
    try {
      for (let attempt = 0; attempt < 24 && mounted.current; attempt++) {
        const r = await request("/api/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(approval),
        });
        const j: any = await r.json();
        if (!r.ok) throw new Error(t(j.error));
        if (!(await load(approval.id))) break;
        setMessage(
          j.results
            .map(
              (p: Item) =>
                (p.channel === "facebook" ? "Facebook" : "Instagram") +
                ": " +
                label(p.status),
            )
            .join(" · "),
        );
        if (!j.results.some((p: Item) => p.status === "PREPARING")) break;
        if (attempt === 23) {
          setMessage(
            t(
              "Instagram ยังเตรียมรูปภาพอยู่ กรุณากด Post อีกครั้งเพื่อดำเนินการต่อ",
            ),
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (e) {
      setMessage(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const channelName = channel === "facebook" ? "Facebook" : "Instagram";
  const connected = channel === "facebook" ? status?.facebookReady : status?.instagramReady;
  const ready = status?.postingEnabled && connected;
  const demoNotice = drafts.some((d) => d.demo === true);
  return (
    <div className="content-studio" lang={language}>
      <dialog ref={researchDialog} className="research-dialog" aria-labelledby="research-title" onCancel={e => { e.preventDefault(); if (!researching) closeResearch(); }}>
        <h2 id="research-title">{language === "en" ? "Research this week’s content" : "ค้นคว้าคอนเทนต์ประจำสัปดาห์"}</h2>
        <div role="status" aria-live="polite">
          {researching && <><progress aria-label={language === "en" ? "Research in progress" : "กำลังค้นคว้า"} /><p>{language === "en" ? (research?.stage === "PREPARING" ? "Research verified. Preparing images and adding drafts to your library…" : "Searching sources and checking relevance to AITS. This may take several minutes…") : (research?.stage === "PREPARING" ? "ตรวจสอบข้อมูลแล้ว กำลังเตรียมภาพและเพิ่มร่างในคลัง…" : "กำลังค้นหาแหล่งข้อมูลและตรวจสอบความเกี่ยวข้องกับ AITS อาจใช้เวลาหลายนาที…")}</p></>}
          {research?.stage === "COMPLETE" && <p>{language === "en" ? "New content added to the content library. Ready for your review." : "เพิ่มเนื้อหาใหม่ในคลังคอนเทนต์แล้ว พร้อมให้คุณตรวจทาน"}</p>}
          {research?.stage === "EMPTY" && <p>{language === "en" ? "No new draft added. This weekly slot may already be filled, or evidence was insufficient." : "ไม่มีร่างใหม่ รอบประจำสัปดาห์นี้อาจมีร่างแล้ว หรือหลักฐานยังไม่เพียงพอ"}</p>}
          {research?.stage === "FAILED" && <p>{language === "en" ? "Research could not be completed. Please try again later." : "ไม่สามารถค้นคว้าให้เสร็จได้ กรุณาลองใหม่ภายหลัง"}</p>}
          {research?.stage === "TIMED_OUT" && <p>{language === "en" ? "Research is taking longer than expected. Check the library later." : "การค้นคว้าใช้เวลานานกว่าที่คาด กรุณาตรวจสอบคลังภายหลัง"}</p>}
        </div>
        {!researching && <button autoFocus onClick={closeResearch}>{language === "en" ? "Back to Content Studio" : "กลับไปยัง Content Studio"}</button>}
      </dialog>
      <div className="shell">
        <aside className="rail">
          <a
            className="brand"
            href="https://aitscctv.com/"
            target="_blank"
            rel="noreferrer"
          >
            <span>AITSCCTV</span>
          </a>
          <div className="rail-label">{t("พื้นที่ทำงาน")}</div>
          <button
            className={filter === "ALL" ? "nav active" : "nav"}
            onClick={() => setFilter("ALL")}
          >
            {t("▤ คลังคอนเทนต์")}
            <span>{drafts.length}</span>
          </button>
          <button
            className={filter === "EDUCATIONAL" ? "nav active" : "nav"}
            onClick={() => setFilter("EDUCATIONAL")}
          >
            {language === "en" ? "Monday · Education" : "วันจันทร์ · ความรู้ทางเทคนิค"}
          </button>
          <button
            className={filter === "MARKETING" ? "nav active" : "nav"}
            onClick={() => setFilter("MARKETING")}
          >
            {language === "en" ? "Thursday · Marketing" : "วันพฤหัสบดี · การตลาด"}
          </button>
          <button
            className={filter === "PUBLISHED" ? "nav active" : "nav"}
            onClick={() => setFilter("PUBLISHED")}
          >
            {t("✓ เผยแพร่แล้ว")}
          </button>
          <div className="rail-bottom">
            <span className={status?.monitoringEnabled ? "dot" : "dot amber"} />
            {status?.monitoringEnabled
              ? (language === "en" ? "Monday & Thursday · 08:00" : "จันทร์และพฤหัสบดี · 08:00")
              : t("รอเปิดระบบตรวจข่าว")}
            <br />
            <small>{t("เวลาไทย · Asia/Bangkok")}</small>
            <a
              href="https://page.line.me/852uanad"
              target="_blank"
              rel="noreferrer"
            >
              {t("ช่องทางลูกค้า · LINE @aitscctv ↗")}
            </a>
          </div>
        </aside>
        <main>
          <div
            className="language-switch"
            role="group"
            aria-label="Interface language"
          >
            <button
              type="button"
              lang="th"
              aria-pressed={language === "th"}
              onClick={() => changeLanguage("th")}
            >
              ไทย
            </button>
            <button
              type="button"
              lang="en"
              aria-pressed={language === "en"}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
          </div>
          <header>
            <div>
              <div className="eyebrow">
                {t("AITSCCTV / คอนเทนต์และโอกาสการขาย")}
              </div>
              <h1>Content Studio</h1>
              <p>
                {t(
                  "ตรวจทานข้อความและภาพ แล้วเผยแพร่ไปยัง Facebook และ Instagram",
                )}
              </p>
            </div>
            <button
              className="outline"
              ref={researchButton}
              onClick={researchNow}
              disabled={busy || dirty || researching}
            >
              {language === "en" ? "Research current slot" : "ค้นคว้ารอบปัจจุบัน"}
            </button>
            <button
              className="outline"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(t("ออกจากร่างโดยไม่บันทึกการแก้ไขหรือไม่?"))
                ) {
                  setDirty(false);
                  setChecked(false);
                  void load(selected?.id);
                }
              }}
              disabled={busy}
            >
              {t("↻ รีเฟรช")}
            </button>
          </header>
          <section className="editorial-calendar" aria-label={language === "en" ? "Weekly content plan" : "แผนคอนเทนต์ประจำสัปดาห์"}>
            <strong>{language === "en" ? "2 drafts per week · 08:00 Bangkok time" : "2 ร่างต่อสัปดาห์ · 08:00 เวลาไทย"}</strong>
            <p>{language === "en" ? "Monday: technical smart-home education · Thursday: marketing and buying guides" : "วันจันทร์: ความรู้ทางเทคนิคเกี่ยวกับสมาร์ทโฮม · วันพฤหัสบดี: การตลาดและคำแนะนำการเลือกซื้อ"}</p>
            <small>{language === "en" ? "Review captions and images before posting. Manual research fills the current slot: Monday–Wednesday education; Thursday–Sunday marketing. Existing slots are not duplicated." : "ตรวจทานข้อความและภาพก่อนเผยแพร่ ค้นคว้าเองจะเติมรอบปัจจุบัน: จันทร์–พุธเป็นความรู้ พฤหัสบดี–อาทิตย์เป็นการตลาด โดยไม่สร้างซ้ำรอบที่มีร่างแล้ว"}</small>
          </section><div className="stats">
            <div>
              <span>{t("ร่างทั้งหมด")}</span>
              <strong>{drafts.length.toString().padStart(2, "0")}</strong>
            </div>
            <div>
              <span>{language === "en" ? "Educational drafts" : "ร่างความรู้ทางเทคนิค"}</span>
              <strong>
                {drafts
                  .filter((d) => editorialStyle(d) === "EDUCATIONAL")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>
            {(["facebook", "instagram"] as const).map((platform) => <div key={platform}>
              <span>{platform === "facebook" ? t("เผยแพร่บน Facebook แล้ว") : t("เผยแพร่บน Instagram แล้ว")}</span>
              <strong>
                {drafts
                  .filter((d) => d.publications?.some((p: Item) => p.channel === platform && p.status === "PUBLISHED"))
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>)}
            <div className="connection">
              <span>{t("สถานะการเชื่อมต่อปัจจุบัน")}</span>
              <b>
                <i className={connected ? "dot" : "dot amber"} />
                {channelName + ": " + (connected ? (language === "en" ? "Connected" : "เชื่อมต่อแล้ว") : t("รอเชื่อมต่อบัญชี"))}
              </b>
              {connectionCheckedAt && <small>{t("ตรวจสอบการเชื่อมต่อเมื่อ ") + displayTime(connectionCheckedAt)}</small>}
              <small>
                {status?.latestRun
                  ? t(
                      status.latestRun.demo
                        ? "ทดสอบการเชื่อมต่อล่าสุด "
                        : "ตรวจล่าสุด ",
                    ) +
                    new Date(status.latestRun.generatedAt).toLocaleString(
                      locale,
                      { timeZone: "Asia/Bangkok" },
                    )
                  : t("ยังไม่มีผลตรวจข่าวจากระบบ")}
              </small>
            </div>
          </div>
          {!ready && !browserOnly && (
            <div className="notice">
              {status?.[channel === "facebook" ? "facebookConnection" : "instagramConnection"]?.reason === "TOKEN_EXPIRED_OR_INVALID" ? (language === "en" ? `${channelName} access has expired or is invalid. Ask an administrator to renew the connection, then refresh. Your drafts are safe.` : `สิทธิ์เข้าถึง ${channelName} หมดอายุหรือไม่ถูกต้อง ให้ผู้ดูแลต่ออายุการเชื่อมต่อแล้วรีเฟรช ร่างของคุณยังอยู่ครบ`) :
              (!connected ? (language === "en" ? `Connect ${channelName} to publish to this platform.` : `เชื่อมต่อ ${channelName} เพื่อเผยแพร่บนแพลตฟอร์มนี้`) : (language === "en" ? "Publishing is currently disabled." : "ขณะนี้ปิดการเผยแพร่ไว้"))
              }
            </div>
          )}
          {browserOnly && (
            <div className="notice">
              {t(
                "GitHub Pages · บันทึกการแก้ไขในเบราว์เซอร์นี้เท่านั้น ยังไม่เชื่อมต่อ n8n และการเผยแพร่",
              )}
            </div>
          )}
          {demoNotice && (
            <div className="notice demo-notice">
              {t(
                "คลังมีร่างตัวอย่างสำหรับทดสอบ ซึ่งไม่สามารถเผยแพร่ได้ ส่วนร่างจริงสามารถตรวจทานและเผยแพร่ได้เมื่อเชื่อมต่อบัญชี",
              )}
            </div>
          )}
          <div className="workspace">
            <section className="library">
              <div className="section-title">
                <h2>{t("เลือกคอนเทนต์")}</h2>
                <span>
                  {list.length} {t("รายการ")}
                </span>
              </div>
              <input
                className="search"
                placeholder={t("ค้นหาหัวข้อ…")}
                aria-label={t("ค้นหาหัวข้อ")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {list.map((d) => (
                <button
                  className={
                    "draft-card " + (selected?.id === d.id ? "chosen" : "")
                  }
                  key={d.id}
                  onClick={() => select(d)}
                  disabled={busy}
                >
                  <div className="thumb">
                    {d.images[0] ? (
                      <StudioImage
                        path={d.images[0]}
                        alt={t("ภาพร่างคอนเทนต์")}
                      />
                    ) : (
                      <span>{t("รอรูปภาพ")}</span>
                    )}
                  </div>
                  <div>
                    <span
                      className={
                        "tag " + (d.priority === "TREND" ? "trend" : "")
                      }
                    >
                      {editorialStyle(d) === "EDUCATIONAL"
                        ? (language === "en" ? "Monday · Education" : "วันจันทร์ · ความรู้")
                        : editorialStyle(d) === "MARKETING"
                          ? (language === "en" ? "Thursday · Marketing" : "วันพฤหัสบดี · การตลาด")
                          : (language === "en" ? "Earlier draft" : "ร่างเดิม")}
                    </span>
                    <h3>{d.title}</h3>
                    <small>
                      {label(d.status)} ·{" "}
                      {new Date(d.createdAt).toLocaleDateString(locale, {
                        timeZone: "Asia/Bangkok",
                      })}
                    </small>
                  </div>
                </button>
              ))}
              {!list.length && (
                <div className="empty">
                  <span className="empty-icon">▤</span>
                  <h3>
                    {drafts.length
                      ? t("ไม่พบคอนเทนต์")
                      : t("ร่างใหม่จะปรากฏที่นี่")}
                  </h3>
                  <p>
                    {t(
                      "ระบบจะค้นคว้าความรู้ทางเทคนิควันจันทร์ และการตลาดวันพฤหัสบดี พร้อมข้อความและภาพให้ตรวจทาน",
                    )}
                  </p>
                  <div className="steps">
                    {t("ค้นหา → ตรวจสอบ → สร้างร่าง")}
                  </div>
                  <small>{t("ไม่เติมข่าวเมื่อไม่มีประเด็นที่ผ่านเกณฑ์")}</small>
                </div>
              )}
            </section>
            <section className="editor">
              {selected ? (
                <>
                  <div className="section-title">
                    <h2>{t("ตรวจทานก่อนเผยแพร่")}</h2>
                    <span>{label(selected.status)}</span>
                  </div>
                  <h2 className="draft-title">{selected.title}</h2>
                  <div className="tabs">
                    <button
                      className={channel === "facebook" ? "on" : ""}
                      disabled={busy}
                      onClick={() => { setChannel("facebook"); setChecked(false); }}
                    >
                      Facebook
                    </button>
                    <button
                      className={channel === "instagram" ? "on" : ""}
                      disabled={busy}
                      onClick={() => { setChannel("instagram"); setChecked(false); }}
                    >
                      Instagram
                    </button>
                  </div>
                  <div className="preview">
                    <div className="profile">
                      <img src={"/aits-cctv.png"} alt="" />
                      <div>
                        <b>AITSCCTV</b>
                        <small>{t("ตัวอย่างโพสต์ · ยังไม่เผยแพร่")}</small>
                      </div>
                    </div>
                    <textarea
                      aria-label={t("คำบรรยาย ") + channel}
                      value={selected[channel + "Caption"]}
                      disabled={selected.status !== "DRAFT" || busy}
                      onChange={(e) => {
                        setSelected({
                          ...selected,
                          [channel + "Caption"]: e.target.value,
                        });
                        setDirty(true);
                        setChecked(false);
                      }}
                    />
                    <div className="images">
                      {selected.images.map((src: string) => (
                        <StudioImage
                          key={src}
                          path={src}
                          alt={t("ภาพที่จะเผยแพร่")}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="context">
                    <b>{t("กลุ่มลูกค้า")}</b>
                    <p>{selected.audience}</p>
                    <b>{t("แนวทางโซลูชัน")}</b>
                    <p>{selected.solution}</p>
                  </div>
                  <details>
                    <summary>{t("หลักฐานและสิ่งที่ต้องตรวจทาน")}</summary>
                    <ul>
                      {selected.sources.map((s: Item) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title || s.url} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                    <ul>
                      {selected.checks.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </details>
                  {selected.article && (
                    <details>
                      <summary>{t("ร่างบทความเว็บไซต์")}</summary>
                      <h3>{selected.article.title}</h3>
                      <pre className="article">{selected.article.body}</pre>
                    </details>
                  )}
                  <div className="notice" role="status">
                    <b>{t("สถานะการเชื่อมต่อปัจจุบัน") + " · " + channelName + ": "}</b>
                    {connected
                      ? t("เชื่อมต่อแล้ว")
                      : t("รอเชื่อมต่อบัญชี")}
                    {connected && (status?.postingEnabled
                      ? " · " + t("พร้อมให้ทีมตรวจทานและกดเผยแพร่")
                      : " · " + t("ขณะนี้ปิดการเผยแพร่ไว้"))}
                    {connectionCheckedAt && <div><small>{t("ตรวจสอบการเชื่อมต่อเมื่อ ") + displayTime(connectionCheckedAt)}</small></div>}
                    {channel === "instagram" && status?.instagramConnection?.expiryStatus === "NO_SCHEDULED_EXPIRY" && <div><small>{t("โทเค็นไม่มีกำหนดหมดอายุ")}</small></div>}
                    {channel === "instagram" && status?.instagramConnection?.expiresAt > 0 && <div><small>{t("โทเค็นหมดอายุ: ") + displayTime(new Date(status.instagramConnection.expiresAt * 1000).toISOString())}</small></div>}
                  </div>
                  <div className="post-results">
                    {selected.publications.map((p: Item) => (
                      <div key={p.channel}>
                        <b>
                          {p.channel === "facebook" ? "Facebook" : "Instagram"}
                        </b>
                        <span>{p.status === "FAILED" ? t("การเผยแพร่ครั้งก่อนล้มเหลว") : label(p.status)}</span>
                        {p.status === "FAILED" && <small>{displayTime(p.finished_at || p.started_at)}</small>}
                        {p.post_url && (
                          <a href={p.post_url} target="_blank" rel="noreferrer">
                            {t("เปิดโพสต์ ↗")}
                          </a>
                        )}
                        {p.error && <small>{(p.status === "FAILED" ? t("ข้อผิดพลาดที่บันทึกไว้: ") : "") + t(p.error)}</small>}
                        {p.status === "FAILED" && <small>{t("นี่คือผลจากครั้งก่อน ไม่ได้กำลังเผยแพร่หรือลองใหม่อัตโนมัติ")}</small>}
                      </div>
                    ))}
                  </div>
                  <div className="approval">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                      />
                      {t(
                        "ฉันตรวจข้อความ รูปภาพ หลักฐาน และความสามารถของ AITS แล้ว",
                      )}
                    </label>
                    <div className="actions">
                      <button
                        className="outline"
                        disabled={!dirty || busy}
                        onClick={save}
                      >
                        {t("บันทึกการแก้ไข")}
                      </button>
                      <button
                        className="primary"
                        disabled={
                          selected.demo === true ||
                          !ready ||
                          !checked ||
                          dirty ||
                          busy ||
                          selected.publications.some((p: Item) =>
                            p.channel === channel && ["PUBLISHED", "UNKNOWN", "POSTING"].includes(p.status),
                          )
                        }
                        onClick={post}
                      >
                        {busy
                          ? t("กำลังดำเนินการ…")
                          : (language === "en" ? `Post to ${channelName}` : `โพสต์ไปยัง ${channelName}`)}
                      </button>
                    </div>
                    {dirty && (
                      <small>{t("บันทึกข้อความที่แก้ไขก่อนเผยแพร่")}</small>
                    )}
                  </div>
                </>
              ) : (
                <div className="editor-empty">
                  <div className="preview-shape">
                    <div />
                    <div />
                    <div />
                  </div>
                  <h2>{t("โพสต์ที่พร้อม เริ่มจากร่างที่ดี")}</h2>
                  <p>
                    {t("เลือกคอนเทนต์ทางซ้ายเพื่อดูภาพ คำบรรยาย")}
                    <br />
                    {t("และแหล่งข้อมูล ก่อนกด Post")}
                  </p>
                  <span>Facebook + Instagram</span>
                </div>
              )}
            </section>
          </div>
          {message && (
            <div role="status" className="toast">
              {message}
              <button
                onClick={() => setMessage("")}
                aria-label={t("ปิดข้อความ")}
              >
                ×
              </button>
            </div>
          )}
          <footer>
            {t(
              "AITSCCTV · วันจันทร์ความรู้ทางเทคนิค · วันพฤหัสบดีการตลาด · ตรวจทานก่อนเผยแพร่",
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
