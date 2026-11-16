import { studioRequest } from "./studioApi";
import StudioImage from "./StudioImage";
import "./contentStudio.css";
import { useState, useEffect, useRef } from "react";
import { translate, type Language } from "./i18n";
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
        (filter === "ALL" || d.priority === filter || d.status === filter) &&
        d.title.includes(query),
    )
    .sort(
      (a, b) =>
        (a.priority === "TREND" ? 0 : 1) - (b.priority === "TREND" ? 0 : 1),
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
    const approval = { id: selected.id, revision: selected.revision, checked };
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
  const ready =
    status?.postingEnabled && status?.facebookReady && status?.instagramReady;
  const demoNotice = drafts.some((d) => d.demo === true);
  return (
    <div className="content-studio" lang={language}>
      <dialog ref={researchDialog} className="research-dialog" aria-labelledby="research-title" onCancel={e => { e.preventDefault(); if (!researching) closeResearch(); }}>
        <h2 id="research-title">{language === "en" ? "Research current trends" : "ค้นคว้าเทรนด์ล่าสุด"}</h2>
        <div role="status" aria-live="polite">
          {researching && <><progress aria-label={language === "en" ? "Research in progress" : "กำลังค้นคว้า"} /><p>{language === "en" ? (research?.stage === "PREPARING" ? "Research verified. Preparing images and adding drafts to your library…" : "Searching sources and checking relevance to AITS. This may take several minutes…") : (research?.stage === "PREPARING" ? "ตรวจสอบข้อมูลแล้ว กำลังเตรียมภาพและเพิ่มร่างในคลัง…" : "กำลังค้นหาแหล่งข้อมูลและตรวจสอบความเกี่ยวข้องกับ AITS อาจใช้เวลาหลายนาที…")}</p></>}
          {research?.stage === "COMPLETE" && <p>{language === "en" ? "New content added to the content library. Ready for your review." : "เพิ่มเนื้อหาใหม่ในคลังคอนเทนต์แล้ว พร้อมให้คุณตรวจทาน"}</p>}
          {research?.stage === "EMPTY" && <p>{language === "en" ? "No new relevant trends passed the checks yet. Check again later." : "ยังไม่มีเทรนด์ใหม่ที่เกี่ยวข้องและผ่านการตรวจสอบ ลองใหม่ภายหลัง"}</p>}
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
            className={filter === "TREND" ? "nav active" : "nav"}
            onClick={() => setFilter("TREND")}
          >
            {t("↗ ประเด็นปัจจุบัน")}
          </button>
          <button
            className={filter === "EVERGREEN" ? "nav active" : "nav"}
            onClick={() => setFilter("EVERGREEN")}
          >
            {t("◈ ความรู้และบริการ")}
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
              ? (language === "en" ? "Research every two days" : "ค้นคว้าทุกสองวัน")
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
              <h1>
                {t("จากประเด็นวันนี้")} <br className="mobile" />
                {t("สู่บทสนทนากับลูกค้า")}
                <span>.</span>
              </h1>
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
              {language === "en" ? "Research now" : "ค้นคว้าตอนนี้"}
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
          <div className="stats">
            <div>
              <span>{t("ร่างทั้งหมด")}</span>
              <strong>{drafts.length.toString().padStart(2, "0")}</strong>
            </div>
            <div>
              <span>{t("ประเด็นปัจจุบัน")}</span>
              <strong>
                {drafts
                  .filter((d) => d.priority === "TREND")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>{t("เผยแพร่ครบสองช่องทาง")}</span>
              <strong>
                {drafts
                  .filter((d) => d.status === "PUBLISHED")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>
            <div className="connection">
              <span>{t("การเชื่อมต่อ")}</span>
              <b>
                <i className={ready ? "dot" : "dot amber"} />
                {ready ? t("พร้อมเผยแพร่") : t("รอเชื่อมต่อบัญชี")}
              </b>
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
              {t(
                "คลังร่างพร้อมใช้งาน · การเผยแพร่จะเปิดเมื่อเชื่อมต่อบัญชี Facebook และ Instagram แล้ว",
              )}
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
                "โหมดตัวอย่าง · ร่างเหล่านี้ใช้ทดสอบการตรวจทานและบันทึก ไม่ใช่ข่าวปัจจุบัน และไม่สามารถเผยแพร่ได้",
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
                      {d.priority === "TREND"
                        ? t("ประเด็นปัจจุบัน")
                        : t("ความรู้และบริการ")}
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
                      "ระบบจะค้นหาประเด็นในประเทศไทย ตรวจหลักฐาน และเตรียมคำบรรยายพร้อมภาพให้ตรวจทาน",
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
                      onClick={() => setChannel("facebook")}
                    >
                      Facebook
                    </button>
                    <button
                      className={channel === "instagram" ? "on" : ""}
                      onClick={() => setChannel("instagram")}
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
                  <div className="post-results">
                    {selected.publications.map((p: Item) => (
                      <div key={p.channel}>
                        <b>
                          {p.channel === "facebook" ? "Facebook" : "Instagram"}
                        </b>
                        <span>{label(p.status)}</span>
                        {p.post_url && (
                          <a href={p.post_url} target="_blank" rel="noreferrer">
                            {t("เปิดโพสต์ ↗")}
                          </a>
                        )}
                        {p.error && <small>{t(p.error)}</small>}
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
                          selected.status === "PUBLISHED" ||
                          selected.publications.some((p: Item) =>
                            ["UNKNOWN", "POSTING"].includes(p.status),
                          )
                        }
                        onClick={post}
                      >
                        {busy
                          ? t("กำลังดำเนินการ…")
                          : "Post · Facebook + Instagram ↗"}
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
              "AITSCCTV · คอนเทนต์ภาษาไทย · ประเด็นปัจจุบันมาก่อนความรู้ทั่วไป",
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
