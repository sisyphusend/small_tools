import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  renameSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import qrcode from "qrcode-terminal";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const CONFIG_DIR = join(homedir(), ".bili-sub");
const COOKIE_FILE = join(CONFIG_DIR, "credentials.json");
// 旧版凭证位置，首次读取时自动迁移到 ~/.bili-sub/
const LEGACY_COOKIE_FILE = join(homedir(), ".config", "small_tools", "bili.json");

interface SavedCookie {
  sessdata: string;
  dedeUserID?: string;
  savedAt: string;
}

function info(msg: string) {
  process.stderr.write(msg + "\n"); // 登录提示走 stderr，不污染 stdout
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 旧版本把凭证存在 ~/.config/small_tools/，首次使用时迁移过来 */
function migrateLegacyCookie(): void {
  if (existsSync(COOKIE_FILE) || !existsSync(LEGACY_COOKIE_FILE)) return;
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    renameSync(LEGACY_COOKIE_FILE, COOKIE_FILE);
    info(`已把旧凭证迁移到 ${COOKIE_FILE}`);
    return;
  } catch {
    /* rename 失败（如跨设备）退回复制 */
  }
  try {
    copyFileSync(LEGACY_COOKIE_FILE, COOKIE_FILE);
    info(`已把旧凭证迁移到 ${COOKIE_FILE}`);
  } catch {
    /* 迁移失败按无凭证处理，登录时会重新生成 */
  }
}

/** 读取本地保存的登录凭证 */
export function loadSavedSessdata(): string | null {
  migrateLegacyCookie();
  try {
    const saved = JSON.parse(readFileSync(COOKIE_FILE, "utf-8")) as SavedCookie;
    return saved.sessdata || null;
  } catch {
    return null;
  }
}

function saveCookie(sessdata: string, dedeUserID?: string) {
  mkdirSync(CONFIG_DIR, { recursive: true });
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

/** 登录成功后从跨域跳转 URL 的查询参数里解析 SESSDATA，Set-Cookie 作兜底 */
function extractSessdata(res: Response, redirectUrl: string): {
  sessdata: string;
  dedeUserID?: string;
} {
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
  return { sessdata, dedeUserID };
}

/** 清除本地登录凭证（含旧版位置，避免迁移机制把它带回来），返回被删除的文件 */
export function clearSavedCookie(): string[] {
  const removed: string[] = [];
  for (const file of [COOKIE_FILE, LEGACY_COOKIE_FILE]) {
    try {
      rmSync(file);
      removed.push(file);
    } catch {
      /* 文件不存在等情况忽略 */
    }
  }
  return removed;
}

/** 二维码扫码登录，成功后把 SESSDATA 覆盖保存到 ~/.bili-sub/credentials.json */
export async function login(timeoutSec = 180): Promise<void> {
  if (!process.stderr.isTTY) {
    throw new Error(
      "当前不是交互式终端，无法扫码登录。请先在终端运行: bili-sub --login",
    );
  }
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

  info("请用 B 站 App 扫描下面的二维码（App 首页右上角扫一扫）：\n");
  // 二维码走 stderr，stdout 保持纯字幕内容，可安全重定向
  qrcode.generate(gen.data.url, { small: true }, (qr) =>
    process.stderr.write(qr + "\n"),
  );

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
        info("已扫码，请在手机上点击确认…");
        confirmed = true;
      }
      continue;
    }
    if (status === 86038) throw new Error("二维码已过期，请重新运行 --login");
    if (status !== 0) {
      throw new Error(`登录失败: ${body.data?.message ?? body.code}`);
    }

    // 成功：跳转 URL 的查询参数里带 SESSDATA，Set-Cookie 作兜底
    const { sessdata, dedeUserID } = extractSessdata(
      res,
      body.data?.url ?? "",
    );
    if (!sessdata) throw new Error("登录成功但没有解析到 SESSDATA");

    saveCookie(sessdata, dedeUserID);
    info(
      `登录成功！凭证已保存到 ${COOKIE_FILE}（权限 600，仅本机可读），之后无需再扫码。`,
    );
    return;
  }
  throw new Error("等待扫码超时，请重新运行 --login");
}
