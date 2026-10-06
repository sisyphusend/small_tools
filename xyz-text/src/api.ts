import { mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import qrcode from "qrcode-terminal";
import type { Episode } from "./xiaoyuzhou";

const API_BASE = "https://api.xiaoyuzhoufm.com";
const WEB_API_BASE = "https://web-api.xiaoyuzhoufm.com";
/** 网页端扫码登录所需常量（逆向自 accounts.xiaoyuzhoufm.com 前端） */
const MIDWAY_APP_ID = "v6worU4NnWyL";
const CLIENT_ID = "xyz-web";
const APP_UA = "Xiaoyuzhou/2.99.1(android 28)";
const BROWSER_HEADERS = {
  "content-type": "application/json;charset=UTF-8",
  origin: "https://accounts.xiaoyuzhoufm.com",
  referer: "https://accounts.xiaoyuzhoufm.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "x-midway-app-id": MIDWAY_APP_ID,
};
const TOKEN_FILE = join(homedir(), ".config", "small_tools", "xyz.json");

export class XyzApiError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

export interface Creds {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  uid?: string;
  nickname?: string;
  savedAt: string;
}

export function loadCreds(): Creds | null {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as Creds;
  } catch {
    return null;
  }
}

function saveCreds(creds: Creds) {
  mkdirSync(join(TOKEN_FILE, ".."), { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  try {
    chmodSync(TOKEN_FILE, 0o600);
  } catch {
    /* Windows 无 chmod */
  }
}

/** 仿官方 App 的请求头（接口实现参考 github.com/r266-tech/xiaoyuzhou） */
function appHeaders(creds: Creds): Record<string, string> {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  // 东八区本地时间，格式与 App 一续
  const t = new Date(now.getTime() + 8 * 3600_000);
  const localTime =
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}` +
    `.${pad(Math.floor(t.getUTCMilliseconds() / 10))}+0800`;
  return {
    Host: "api.xiaoyuzhoufm.com",
    os: "android",
    "os-version": "28",
    manufacturer: "Xiaomi",
    model: "MI 6",
    resolution: "1080x1920",
    market: "xiaomi",
    applicationid: "app.podcast.cosmos",
    "app-version": "2.99.1",
    "app-buildno": "1362",
    webviewversion: "138.0.7204.179",
    "User-Agent": APP_UA,
    "app-permissions": "100100",
    wificonnected: "false",
    timezone: "Asia/Shanghai",
    "local-time": localTime,
    "content-type": "application/json;charset=utf-8",
    "Accept-Encoding": "gzip",
    "x-jike-access-token": creds.accessToken,
    "x-jike-device-id": creds.deviceId,
  };
}

function webHeaders(): Record<string, string> {
  return { ...BROWSER_HEADERS };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 扫码登录：小宇宙 App 扫码确认后拿到 token 并存本地。二维码过期自动换新 */
export async function qrLogin(totalTimeoutSec = 300): Promise<Creds> {
  const deadline = Date.now() + totalTimeoutSec * 1000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const createRes = await fetch(`${WEB_API_BASE}/v1/auth/qrcode/create`, {
      method: "POST",
      headers: webHeaders(),
      body: JSON.stringify({ clientId: CLIENT_ID }),
    });
    if (!createRes.ok) {
      throw new XyzApiError(`创建二维码失败 HTTP ${createRes.status}`);
    }
    const created = (await createRes.json()) as { id?: string; url?: string };
    if (!created.id || !created.url) {
      throw new XyzApiError("创建二维码响应异常");
    }

    console.log(
      attempt > 1
        ? `\n二维码已过期，已自动换新（第 ${attempt} 张），请重新扫码：`
        : "请用小宇宙 App 扫描下面的二维码（App「我的」页右上角扫一扫），扫完尽快在手机上确认：\n",
    );
    qrcode.generate(created.url, { small: true });
    console.log("");

    let notified = false;
    // 单张二维码最长等 3 分钟，过期/确认成功都跳出
    const qrDeadline = Math.min(Date.now() + 180_000, deadline);
    while (Date.now() < qrDeadline) {
      await sleep(1000);
      const res = await fetch(`${WEB_API_BASE}/v1/auth/qrcode/login`, {
        method: "POST",
        headers: webHeaders(),
        body: JSON.stringify({ id: created.id }),
      });
      if (res.status === 401) {
        break; // 二维码过期（401 + code 21），外层换新
      }
      if (!res.ok) {
        throw new XyzApiError(`查询扫码状态失败 HTTP ${res.status}`);
      }
      const body = (await res.json()) as { status?: string };
      if (body.status === "SCANNED") {
        if (!notified) {
          console.log("已扫码，请在手机上点击确认…");
          notified = true;
        }
        continue;
      }
      // CONFIRMED / USED 都算登录成功（前端同样把两者视为成功）
      if (body.status === "CONFIRMED" || body.status === "USED") {
        const creds = extractCreds(res);
        if (!creds) {
          throw new XyzApiError(
            `扫码确认成功（${body.status}）但响应中没有 token`,
            "请把这个错误反馈给维护者",
          );
        }
        saveCreds(creds);
        console.log(
          `登录成功，token 已保存到 ${TOKEN_FILE}（仅本机可读），之后自动抓取官方文稿。`,
        );
        return creds;
      }
      // WAITTING 继续等
    }
  }
  throw new XyzApiError("等待扫码超时，请重新运行 login");
}

/** 从轮询响应的普通响应头和 Set-Cookie 里提取 token */
function extractCreds(res: Response): Creds | null {
  let accessToken = res.headers.get("x-jike-access-token") ?? "";
  let refreshToken = res.headers.get("x-jike-refresh-token") ?? "";
  if (!accessToken) {
    const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [];
    for (const line of setCookies) {
      const m = line.match(/x-jike-access-token=([^;]+)/);
      if (m) accessToken = m[1];
      const r = line.match(/x-jike-refresh-token=([^;]+)/);
      if (r) refreshToken = r[1];
    }
  }
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    deviceId: randomUUID(),
    savedAt: new Date().toISOString(),
  };
}

/** 用 refresh_token 换新的 access_token；凭证失效返回 false */
async function refreshCreds(creds: Creds): Promise<boolean> {
  const headers = appHeaders({ ...creds, accessToken: "" });
  delete headers["x-jike-access-token"];
  headers["x-jike-refresh-token"] = creds.refreshToken;
  const res = await fetch(`${API_BASE}/app_auth_tokens.refresh`, {
    method: "POST",
    headers,
  });
  if (res.status >= 400 && res.status < 500) return false;
  if (res.status !== 200) return false;
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  const newAccess =
    res.headers.get("x-jike-access-token") || body["x-jike-access-token"];
  const newRefresh =
    res.headers.get("x-jike-refresh-token") || body["x-jike-refresh-token"];
  if (!newAccess) return false;
  const updated: Creds = {
    ...creds,
    accessToken: newAccess,
    refreshToken: newRefresh || creds.refreshToken,
    savedAt: new Date().toISOString(),
  };
  saveCreds(updated);
  Object.assign(creds, updated);
  return true;
}

/** 带 401 自动刷新的 POST */
async function apiPost(
  path: string,
  payload: unknown,
  creds: Creds,
): Promise<any> {
  let res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: appHeaders(creds),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    if (!(await refreshCreds(creds))) {
      throw new XyzApiError(
        "登录态已过期",
        "请重新运行 xyz-text login 登录",
      );
    }
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: appHeaders(creds),
      body: JSON.stringify(payload),
    });
  }
  if (!res.ok) {
    throw new XyzApiError(`接口 ${path} 返回 HTTP ${res.status}`);
  }
  return res.json();
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
}

/** 获取官方 AI 文稿（小宇宙 App 内展示的同款）。无文稿返回 null */
export async function getOfficialTranscript(
  ep: Episode,
  creds: Creds,
): Promise<TranscriptSegment[] | null> {
  // RSS 同步的节目要用平台内部的 transcriptMediaId 才能查到文稿
  const mediaId = ep.transcriptMediaId || ep.mediaId;
  if (!mediaId) return null;
  const data = await apiPost(
    "/v1/episode-transcript/get",
    { eid: ep.eid, mediaId },
    creds,
  );
  let inner = data?.data ?? {};
  if (inner.data && typeof inner.data === "object") inner = inner.data;
  const url: string | undefined = inner.transcriptUrl;
  if (!url) return null;

  // 文稿 CDN 有 UA 白名单，必须用官方 App UA
  const res = await fetch(url, {
    headers: { "User-Agent": APP_UA },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new XyzApiError(`文稿下载失败 HTTP ${res.status}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new XyzApiError("文稿数据格式异常");
  }
  const out: TranscriptSegment[] = [];
  for (const s of raw) {
    if (typeof s !== "object" || s === null) continue;
    const seg = s as { text?: unknown; startMs?: unknown };
    const text = typeof seg.text === "string" ? seg.text.trim() : "";
    if (!text) continue;
    out.push({ text, startMs: Number(seg.startMs ?? 0) });
  }
  return out;
}
