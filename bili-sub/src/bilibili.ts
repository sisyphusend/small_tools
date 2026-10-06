import { createHash } from "node:crypto";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** WBI 签名用的固定混淆表，见 bilibili-API-collect 文档 */
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

export interface Page {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface SubtitleTrack {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  ai_type?: number;
}

export interface SubtitleLine {
  from: number;
  to: number;
  content: string;
}

export interface Video {
  title?: string;
  aid?: number;
  bvid?: string;
}

export class BiliError extends Error {}

let mixinKeyCache: { key: string; expires: number } | null = null;
let cookieHeader = "";

export function setCookie(sessdata: string) {
  cookieHeader = sessdata.startsWith("SESSDATA=")
    ? sessdata
    : `SESSDATA=${sessdata}`;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.bilibili.com/",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (!res.ok) throw new BiliError(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

async function getMixinKey(): Promise<string> {
  if (mixinKeyCache && Date.now() < mixinKeyCache.expires) {
    return mixinKeyCache.key;
  }
  const nav = await getJson("https://api.bilibili.com/x/web-interface/nav");
  // 未登录时 code 为 -101，但 wbi_img 仍会返回
  const img: string = nav?.data?.wbi_img?.img_url ?? "";
  const sub: string = nav?.data?.wbi_img?.sub_url ?? "";
  if (!img || !sub) {
    throw new BiliError("获取 WBI 密钥失败");
  }
  const imgKey = img.slice(img.lastIndexOf("/") + 1).split(".")[0];
  const subKey = sub.slice(sub.lastIndexOf("/") + 1).split(".")[0];
  const raw = imgKey + subKey;
  const key = MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
  // 密钥每日轮换，缓存到当天结束
  mixinKeyCache = { key, expires: Date.now() + 3600_000 };
  return key;
}

/** 对参数做 WBI 签名，返回完整 query string */
async function wbiSign(params: Record<string, string>): Promise<string> {
  const mixinKey = await getMixinKey();
  const all: Record<string, string> = {
    ...params,
    wts: String(Math.floor(Date.now() / 1000)),
  };
  const search = new URLSearchParams(
    Object.keys(all)
      .sort()
      .reduce<Record<string, string>>((acc, k) => {
        acc[k] = all[k].replace(/[!'()*]/g, "");
        return acc;
      }, {}),
  ).toString();
  return `${search}&w_rid=${md5(search + mixinKey)}`;
}

export interface ParsedInput {
  bvid?: string;
  aid?: number;
  page?: number;
}

/** 从 URL / BV号 / av号 解析视频 */
export async function parseInput(input: string): Promise<ParsedInput> {
  let s = input.trim();
  if (/^b23\.tv\//.test(s) || s.includes("b23.tv/")) {
    if (!s.startsWith("http")) s = `https://${s}`;
    const res = await fetch(s, {
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
    s = res.url;
  }
  const bv = s.match(/BV[0-9A-Za-z]{10}/);
  const av = s.match(/av(\d+)/i);
  const page = s.match(/[?&]p=(\d+)/);
  if (bv) return { bvid: bv[0], page: page ? Number(page[1]) : undefined };
  if (av) return { aid: Number(av[1]), page: page ? Number(page[1]) : undefined };
  throw new BiliError("无法从输入中解析出 BV 号或 av 号");
}

export async function getPages(input: ParsedInput): Promise<{
  video: Video;
  pages: Page[];
}> {
  const query = input.bvid
    ? `bvid=${input.bvid}`
    : `aid=${input.aid}`;
  const data = await getJson(
    `https://api.bilibili.com/x/player/pagelist?${query}`,
  );
  if (data.code !== 0) {
    throw new BiliError(`获取分P列表失败: ${data.message}`);
  }
  return {
    video: { aid: data.data[0]?.aid, bvid: input.bvid },
    pages: data.data,
  };
}

export async function getVideoTitle(input: ParsedInput): Promise<string> {
  const query = input.bvid
    ? `bvid=${input.bvid}`
    : `aid=${input.aid}`;
  const data = await getJson(
    `https://api.bilibili.com/x/web-interface/view?${query}`,
  );
  return data.code === 0 ? data.data.title : "";
}

/** 拿某个分P的字幕轨道列表（AI 字幕需要 SESSDATA 登录态） */
export async function getSubtitleTracks(
  input: ParsedInput,
  cid: number,
): Promise<SubtitleTrack[]> {
  const params: Record<string, string> = { cid: String(cid) };
  if (input.bvid) params.bvid = input.bvid;
  if (input.aid) params.aid = String(input.aid);
  const query = await wbiSign(params);
  const data = await getJson(
    `https://api.bilibili.com/x/player/wbi/v2?${query}`,
  );
  if (data.code !== 0) {
    throw new BiliError(`获取字幕列表失败: ${data.message}`);
  }
  return (data.data?.subtitle?.subtitles ?? []) as SubtitleTrack[];
}

export async function downloadSubtitle(
  track: SubtitleTrack,
): Promise<SubtitleLine[]> {
  let url = track.subtitle_url;
  if (url.startsWith("//")) url = `https:${url}`;
  const data = await getJson(url);
  return (data.body ?? []) as SubtitleLine[];
}

/** 按优先级挑一条字幕轨道 */
export function pickTrack(
  tracks: SubtitleTrack[],
  lang?: string,
): SubtitleTrack | undefined {
  if (tracks.length === 0) return undefined;
  if (lang) {
    return tracks.find((t) => t.lan === lang);
  }
  const prefer = ["zh-CN", "zh-Hans", "ai-zh", "zh"];
  for (const p of prefer) {
    const hit = tracks.find((t) => t.lan === p);
    if (hit) return hit;
  }
  return tracks.find((t) => t.lan.startsWith("zh")) ?? tracks[0];
}
