import type { SubtitleLine } from "./bilibili.ts";

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

interface Paragraph {
  from: number; // 段落起始时间（秒）
  text: string;
}

/** 字幕行合并成可读段落：句末标点断行，跳过空行与连续重复 */
function groupParagraphs(lines: SubtitleLine[]): Paragraph[] {
  const paras: Paragraph[] = [];
  let cur: Paragraph | null = null;
  for (const l of lines) {
    const t = l.content.trim();
    if (!t) continue;
    if (cur && t === cur.text.slice(-t.length)) continue;
    if (!cur) cur = { from: l.from, text: "" };
    cur.text += t;
    if (/[。！？!?…]$/.test(t)) {
      paras.push(cur);
      cur = null;
    }
  }
  if (cur) paras.push(cur);
  return paras;
}

/** 段落纯文本（默认输出，无时间戳） */
export function toText(lines: SubtitleLine[]): string {
  return groupParagraphs(lines).map((p) => p.text).join("\n\n");
}

function mmss(sec: number): string {
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 段落文本，每段开头带 [mm:ss] 时间戳（--timestamps） */
export function toTextWithTime(lines: SubtitleLine[]): string {
  return groupParagraphs(lines)
    .map((p) => `[${mmss(p.from)}] ${p.text}`)
    .join("\n\n");
}

export function toJson(lines: SubtitleLine[]): string {
  return JSON.stringify(lines, null, 2);
}
