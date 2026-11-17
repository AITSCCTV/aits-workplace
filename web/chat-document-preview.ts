// Read bounded byte ranges and render extracted text, never uploaded HTML.
async function range(id: string, start: number, end: number) {
  const r = await fetch(
    "/api/messaging?action=file&id=" + encodeURIComponent(id),
    { headers: { Range: `bytes=${start}-${end}` } },
  );
  if (r.status !== 206)
    throw Error("Unable to preview this file. Download it to open it.");
  return new Uint8Array(await r.arrayBuffer());
}
const decoder = new TextDecoder();
export async function documentPreview(file: any) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["txt", "csv", "json", "md", "log"].includes(ext))
    return (
      decoder.decode(await range(file.id, 0, Math.min(file.size - 1, 262143))) +
      (file.size > 262144 ? "\n…" : "")
    );
  if (!["zip", "docx", "xlsx", "pptx"].includes(ext))
    return "Preview unavailable for this format. Download the file to open it.";
  const tail = await range(
      file.id,
      Math.max(0, file.size - 65557),
      file.size - 1,
    ),
    view = new DataView(tail.buffer);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("This archive format cannot be previewed.");
  const directorySize = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true);
  if (directorySize > 2_000_000 || offset + directorySize > file.size)
    throw Error("Archive index is too large to preview.");
  const bytes = await range(file.id, offset, offset + directorySize - 1),
    dir = new DataView(bytes.buffer),
    entries: any[] = [];
  for (let i = 0; i + 46 <= bytes.length && entries.length < 2000; ) {
    if (dir.getUint32(i, true) !== 0x02014b50) break;
    const length = dir.getUint16(i + 28, true),
      extra = dir.getUint16(i + 30, true),
      comment = dir.getUint16(i + 32, true);
    entries.push({
      name: decoder.decode(bytes.slice(i + 46, i + 46 + length)),
      compressed: dir.getUint32(i + 20, true),
      size: dir.getUint32(i + 24, true),
      method: dir.getUint16(i + 10, true),
      flags: dir.getUint16(i + 8, true),
      offset: dir.getUint32(i + 42, true),
    });
    i += 46 + length + extra + comment;
  }
  if (ext === "zip")
    return (
      entries
        .map((e) => e.name + " · " + e.size.toLocaleString() + " bytes")
        .join("\n") + (entries.length === 2000 ? "\n…" : "")
    );
  const names =
    ext === "docx"
      ? ["word/document.xml"]
      : ext === "pptx"
        ? ["ppt/slides/slide1.xml"]
        : ["xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"];
  const result = [];
  for (const name of names) {
    const entry = entries.find((e) => e.name === name);
    if (!entry) continue;
    if (
      entry.flags & 1 ||
      entry.size > 2_000_000 ||
      entry.compressed > 2_000_000 ||
      ![0, 8].includes(entry.method)
    )
      throw Error("Document is too large or encrypted. Download to open it.");
    const head = await range(file.id, entry.offset, entry.offset + 29),
      h = new DataView(head.buffer),
      start = entry.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    let body = await range(file.id, start, start + entry.compressed - 1);
    if (entry.method === 8) {
      const reader = new Blob([body])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2_000_000) {
          await reader.cancel();
          throw Error("Document exceeds the safe preview size.");
        }
        chunks.push(value);
      }
      body = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        body.set(chunk, at);
        at += chunk.length;
      }
    }
    const xml = new DOMParser().parseFromString(
      decoder.decode(body),
      "application/xml",
    );
    if (xml.querySelector("parsererror"))
      throw Error("Document preview is unavailable.");
    result.push(
      [...xml.getElementsByTagName("*")]
        .filter((n) => ["t", "v"].includes(n.localName))
        .map((n) => n.textContent)
        .join("\n")
        .slice(0, 100000),
    );
  }
  return (
    result.join("\n\n") ||
    "No preview text found. Download to open the original document."
  );
}
