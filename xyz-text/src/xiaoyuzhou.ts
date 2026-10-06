const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class XyzError extends Error {}

export interface Episode {
  eid: string;
  title: string;
  shownotes: string;
  pubDate: string;
  duration: number; // 秒
  podcast: {
    pid: string;
    title: string;
    author: string;
  };
  audioUrl?: string;
  mediaId?: string;
  transcriptMediaId?: string;
  transcript?: {
    mediaId?: string;
    sentences?: { text: string; startMs: number; endMs: number }[];
  };
}

/** 从单集 URL 解析 eid；支持 b23.tv 之类跳转由调用方先行展开 */
export function parseEpisodeId(input: string): string {
  const s = input.trim();
  const m = s.match(/xiaoyuzhoufm\.com\/episode\/([0-9a-zA-Z]{24})/);
  if (m) return m[1];
  if (/^[0-9a-zA-Z]{24}$/.test(s)) return s;
  throw new XyzError("无法解析单集链接，请提供 xiaoyuzhoufm.com/episode/<id> 格式的 URL");
}

/** 抓取单集页面并解析 __NEXT_DATA__ */
export async function fetchEpisode(eid: string): Promise<Episode> {
  const res = await fetch(`https://www.xiaoyuzhoufm.com/episode/${eid}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new XyzError(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s,
  );
  if (!m) throw new XyzError("页面中没有 __NEXT_DATA__，网页结构可能已变化");
  const data = JSON.parse(m[1]);
  if (data.page === "/404") throw new XyzError("单集不存在或已下线");
  const ep = data.props?.pageProps?.episode;
  if (!ep) throw new XyzError("页面数据中没有单集信息");

  return {
    eid: ep.eid ?? eid,
    title: ep.title ?? "",
    shownotes: ep.shownotes ?? "",
    pubDate: ep.pubDate ?? "",
    duration: ep.duration ?? 0,
    podcast: {
      pid: ep.podcast?.pid ?? "",
      title: ep.podcast?.title ?? "",
      author: ep.podcast?.author ?? "",
    },
    audioUrl: ep.media?.source?.url ?? ep.enclosure?.url,
    mediaId: ep.media?.id,
    transcriptMediaId: ep.transcriptMediaId,
    transcript: ep.transcript ?? undefined,
  };
}

/** shownotes 的 HTML 转成 Markdown（保留链接，其余转纯文本） */
export function htmlToText(html: string): string {
  return html
    // 超链接转为 [文字](地址)，外链在投资笔记里往往是关键信息
    .replace(
      /<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis,
      (_, href, text) => {
        const label = String(text).replace(/<[^>]+>/g, "").trim();
        return label && href.startsWith("http") ? `[${label}](${href})` : label;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatDuration(sec: number): string {
  if (!sec) return "未知";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}小时${m}分` : `${m}分`;
}

/** 组装成 Markdown；segments 为官方文稿段落（优先），网页端自带 sentences 时作兜底 */
export function toMarkdown(
  ep: Episode,
  withTimestamps = false,
  officialSegments?: { text: string; startMs: number }[] | null,
): string {
  const head = [
    `# ${ep.title}`,
    "",
    `- 播客: ${ep.podcast.title}${ep.podcast.author ? `（${ep.podcast.author}）` : ""}`,
    `- 发布: ${ep.pubDate.slice(0, 10)}`,
    `- 时长: ${formatDuration(ep.duration)}`,
    `- 单集: https://www.xiaoyuzhoufm.com/episode/${ep.eid}`,
    "",
  ];

  const sections: string[] = [];

  const notes = htmlToText(ep.shownotes);
  if (notes) sections.push(`## Shownotes\n\n${notes}`);

  const segments =
    officialSegments && officialSegments.length > 0
      ? officialSegments
      : (ep.transcript?.sentences ?? []);
  if (segments.length > 0) {
    const body = segments
      .map((s) =>
        withTimestamps ? `[${msToClock(s.startMs)}] ${s.text}` : s.text,
      )
      .join(withTimestamps ? "\n" : "");
    sections.push(`## 官方文稿\n\n${body}`);
  } else {
    sections.push(
      "## 官方文稿\n\n（本集暂无官方文稿。已登录用户可运行 `xyz-text login` 后重试；" +
        "或用 --audio 取音频链接自行转写）",
    );
  }

  return head.concat(sections.join("\n\n"), "").join("\n");
}

function msToClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
