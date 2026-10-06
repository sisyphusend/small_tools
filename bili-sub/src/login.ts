import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import qrcode from "qrcode-terminal";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const COOKIE_FILE = join(homedir(), ".config", "small_tools", "bili.json");

interface SavedCookie {
  sessdata: string;
  dedeUserID?: string;
  savedAt: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 读取本地保存的登录凭证 */
export function loadSavedSessdata(): string | null {
  try {
    const saved = JSON.parse(readFileSync(COOKIE_FILE, "utf-8")) as SavedCookie;
    return saved.sessdata || null;
  } catch {
    return null;
  }
}

function saveCookie(sessdata: string, dedeUserID?: string) {
  mkdirSync(join(COOKIE_FILE, ".."), { recursive: true });
  const data: SavedCookie = {
    sessdata,
    dedeUserID,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    chmodSync(COOKIE_FILE, 0o600);
  } catch {
    /* Windows 下无 chmod */
  }
}

/** 二维码扫码登录，成功后把 SESSDATA 存到本地 */
export async function login(timeoutSec = 180): Promise<void> {
  const genRes = await fetch(
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
    { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" } },
  );
  const gen = (await genRes.json()) as {
    code: number;
    data?: { url: string; qrcode_key: string };
  };
  if (gen.code !== 0 || !gen.data) {
    throw new Error(`获取二维码失败: ${JSON.stringify(gen)}`);
  }

  console.log("请用 B 站 App 扫描下面的二维码（App 首页右上角扫一扫）：\n");
  qrcode.generate(gen.data.url, { small: true });
  console.log("");

  const deadline = Date.now() + timeoutSec * 1000;
  let confirmed = false;
  while (Date.now() < deadline) {
    await sleep(2000);
    const res = await fetch(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${gen.data.qrcode_key}`,
      { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" } },
    );
    const body = (await res.json()) as {
      code: number;
      data?: { url: string; code: number; message: string };
    };
    // 真实状态码在内层 data.code（外层 code 恒为 0 表示传输成功）
    const status = body.data?.code ?? body.code;
    if (status === 86101) continue; // 未扫码
    if (status === 86090) {
      if (!confirmed) {
        console.log("已扫码，请在手机上点击确认…");
        confirmed = true;
      }
      continue;
    }
    if (status === 86038) throw new Error("二维码已过期，请重新运行 login");
    if (status !== 0) {
      throw new Error(`登录失败: ${body.data?.message ?? body.code}`);
    }

    // 成功：跳转 URL 的查询参数里带 SESSDATA（与 BBDown 相同），Set-Cookie 作兜底
    const redirectUrl = body.data?.url ?? "";
    let sessdata = "";
    let dedeUserID: string | undefined;
    try {
      const u = new URL(redirectUrl);
      sessdata = decodeURIComponent(u.searchParams.get("SESSDATA") ?? "");
      dedeUserID = u.searchParams.get("DedeUserID") ?? undefined;
    } catch {
      /* URL 解析失败时走 Set-Cookie */
    }
    if (!sessdata) {
      const setCookies: string[] =
        (res.headers as any).getSetCookie?.() ?? [];
      for (const line of setCookies) {
        const m = line.match(/(^|;\s*)SESSDATA=([^;]+)/);
        if (m) sessdata = m[2];
        const uid = line.match(/DedeUserID=(\d+)/);
        if (uid) dedeUserID = uid[1];
      }
    }
    if (!sessdata) throw new Error("登录成功但没有解析到 SESSDATA");

    saveCookie(sessdata, dedeUserID);
    console.log(
      `登录成功，SESSDATA 已保存到 ${COOKIE_FILE}（仅本机可读），之后直接 bili-sub <url> 即可。`,
    );
    return;
  }
  throw new Error("等待扫码超时，请重新运行 login");
}

/** 本地是否已有有效凭证文件的提示信息 */
export function cookieFileExists(): boolean {
  return existsSync(COOKIE_FILE);
}
