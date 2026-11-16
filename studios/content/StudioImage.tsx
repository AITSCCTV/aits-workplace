import { useEffect, useRef, useState } from "react";
import { apiClient } from "./client";

/** Images require the same staff JWT as drafts; never place a bearer token in an image URL. */
export default function StudioImage({
  path,
  alt,
}: {
  path: string;
  alt: string;
}) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    setSource("");
    setFailed(false);
    if (!/^\/media\/[a-f0-9]{32}\.jpg$/.test(path)) {
      setFailed(true);
      return;
    }
    const load = () =>
      apiClient
        .getBlob("/api/admin/content-studio" + path)
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        })
        .catch((error: { status?: number; retryAfterMs?: number }) => {
          if (!active) return;
          if (error.status === 429 && retries++ < 2) {
            retryTimer = setTimeout(load, Math.max(1000, Math.min(error.retryAfterMs || 60_000, 120_000)));
          } else setFailed(true);
        });
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined") void load();
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            void load();
          }
        },
        { rootMargin: "100px" },
      );
      if (container.current) observer.observe(container.current);
    }
    return () => {
      active = false;
      observer?.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (failed)
    return (
      <span className="image-error" role="status">
        {alt} · Image unavailable / โหลดภาพไม่ได้
      </span>
    );
  return (
    <span ref={container} className="studio-image">
      {source ? (
        <img src={source} alt={alt} />
      ) : (
        <span aria-label={alt}>…</span>
      )}
    </span>
  );
}
