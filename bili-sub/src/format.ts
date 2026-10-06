import type { SubtitleLine } from "./bilibili";

function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function toSrt(lines: SubtitleLine[]): string {
  return lines
    .map(
      (l, i) =>
        `${i + 1}\n${srtTime(l.from)} --> ${srtTime(l.to)}\n${l.content}\n`,
    )
    .join("\n");
}

/** 字幕行合并成可读段落：句末标点断行 */
export function toText(lines: SubtitleLine[]): string {
  const paras: string[] = [];
  let cur = "";
  for (const l of lines) {
    const t = l.content.trim();
    if (!t || t === cur.slice(-t.length)) continue; // 跳过空行与连续重复
    cur += t;
    if (/[。！？!?…]$/.test(t)) {
      paras.push(cur);
      cur = "";
    }
  }
  if (cur) paras.push(cur);
  return paras.join("\n\n");
}

export function toJson(lines: SubtitleLine[]): string {
  return JSON.stringify(lines, null, 2);
}
