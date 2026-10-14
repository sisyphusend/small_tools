import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadSavedSessdata } from "../src/login.ts";
import {
  setCookie,
  parseInput,
  getPages,
  getVideoTitle,
  getSubtitleTracks,
  downloadSubtitle,
  pickTrack,
} from "../src/bilibili.ts";
import type { SubtitleTrack } from "../src/bilibili.ts";

const execFileAsync = promisify(execFile);

/** 测试视频: 单P有 AI 中文字幕; aid 由 view 接口查得 */
const VIDEO = {
  url: "https://www.bilibili.com/video/BV1bW411n7fY",
  bvid: "BV1bW411n7fY",
  aid: 19390801,
  shortLink: "https://b23.tv/BV1bW411n7fY",
};
/** 测试视频: 2P 且两P均有 AI 中文字幕 */
const MULTI_PART_BVID = "BV1yTpH64Eev";

/** 凭证与 CLI 一致: BILI_SESSDATA 环境变量 > --login 扫码保存的本地文件 */
function credential(): string | null {
  return process.env.BILI_SESSDATA ?? loadSavedSessdata();
}

/** 需要登录态的用例统一走这里: 无凭证时跳过并返回 null（调用方需 return） */
function ensureCredential(t: { skip: (msg: string) => void }): string | null {
  const sessdata = credential();
  if (!sessdata) {
    t.skip("没有登录凭证（先运行 bili-sub --login 扫码一次，或设 BILI_SESSDATA 环境变量）");
    return null;
  }
  setCookie(sessdata);
  return sessdata;
}

test("解析: 完整URL / 纯BV号 / av号 / b23.tv短链", async () => {
  assert.equal((await parseInput(VIDEO.url)).bvid, VIDEO.bvid);
  assert.equal((await parseInput(VIDEO.bvid)).bvid, VIDEO.bvid);
  assert.equal((await parseInput(`av${VIDEO.aid}`)).aid, VIDEO.aid);
  // b23.tv 短链跟随 302 跳转后解析出 BV 号
  assert.equal((await parseInput(VIDEO.shortLink)).bvid, VIDEO.bvid);
});

test("解析: URL 中的分P参数", async () => {
  const input = await parseInput(`${VIDEO.url}?p=2`);
  assert.equal(input.bvid, VIDEO.bvid);
  assert.equal(input.page, 2);
});

test("选轨: pickTrack 默认中文优先，--lang 可指定英文等", () => {
  const mk = (lan: string, lan_doc = lan): SubtitleTrack => ({
    lan,
    lan_doc,
    subtitle_url: "",
  });
  const bilingual = [mk("en", "英文"), mk("zh-CN", "中文（简体）"), mk("ai-zh", "中文（自动生成）")];
  assert.equal(pickTrack(bilingual)!.lan, "zh-CN"); // 有 CC 中文时优先 CC
  assert.equal(pickTrack(bilingual, "en")!.lan, "en"); // 指定英文
  assert.equal(pickTrack([mk("ai-zh"), mk("en")])!.lan, "ai-zh"); // 只有 AI 中文时选它
  assert.equal(pickTrack([mk("ja"), mk("en")])!.lan, "ja"); // 完全没有中文轨道时取第一条
});

test("下载: 标准视频（登录后获取 AI 字幕）", async (t) => {
  if (!ensureCredential(t)) return;

  const input = await parseInput(VIDEO.url);
  const title = await getVideoTitle(input);
  assert.ok(title, "应能获取视频标题");

  const { pages } = await getPages(input);
  assert.ok(pages.length === 1, "该视频应为单P");

  const tracks = await getSubtitleTracks(input, pages[0].cid);
  assert.ok(tracks.length > 0, "登录后应能看到字幕轨道");

  const lines = await downloadSubtitle(pickTrack(tracks)!);
  assert.ok(lines.length > 0, "字幕内容非空");
  assert.ok(
    lines.every((l) => typeof l.content === "string" && l.content.length > 0),
    "每行字幕都应有文本",
  );
});

test("多P: 分P列表与逐P字幕（2P 视频各P均可下载）", async (t) => {
  if (!ensureCredential(t)) return;

  const input = await parseInput(MULTI_PART_BVID);
  const { pages } = await getPages(input);
  assert.ok(pages.length >= 2, "应至少有 2 个分P");

  for (const p of pages) {
    const tracks = await getSubtitleTracks(input, p.cid);
    assert.ok(tracks.length > 0, `P${p.page} 应有字幕轨道`);
    const lines = await downloadSubtitle(pickTrack(tracks)!);
    assert.ok(lines.length > 0, `P${p.page} 字幕内容非空`);
  }
});

test("CLI: 默认无时间戳，--timestamps 每段带 [mm:ss]", async (t) => {
  if (!ensureCredential(t)) return;

  const cwd = join(import.meta.dirname, "..");
  const plain = await execFileAsync("node", ["src/cli.ts", VIDEO.bvid], {
    cwd,
  });
  assert.ok(plain.stdout.trim().length > 0, "默认输出应有字幕文本");
  assert.ok(
    !/\[\d{1,2}:\d{2}\]/.test(plain.stdout),
    "默认输出不应带时间戳",
  );

  const timed = await execFileAsync(
    "node",
    ["src/cli.ts", VIDEO.bvid, "--timestamps"],
    { cwd },
  );
  assert.ok(
    /\[\d{1,2}:\d{2}\]/.test(timed.stdout),
    "--timestamps 输出应带 [mm:ss] 前缀",
  );
});

test("CLI: --logout 清除凭证（隔离 HOME，不影响真实凭证）", async () => {
  const cwd = join(import.meta.dirname, "..");
  const fakeHome = mkdtempSync(join(tmpdir(), "bili-sub-test-"));
  const credFile = join(fakeHome, ".bili-sub", "credentials.json");
  try {
    mkdirSync(join(fakeHome, ".bili-sub"), { recursive: true });
    writeFileSync(credFile, JSON.stringify({ sessdata: "dummy" }));
    assert.ok(existsSync(credFile), "前置: 已放置凭证文件");

    const env = { ...process.env, HOME: fakeHome };
    const res = await execFileAsync("node", ["src/cli.ts", "--logout"], {
      cwd,
      env,
    });
    assert.ok(/已清除/.test(res.stderr), "应提示已清除及路径");
    assert.ok(!existsSync(credFile), "凭证文件应被删除");

    // 无凭证时再执行一次: 幂等，提示无需清理
    const again = await execFileAsync("node", ["src/cli.ts", "--logout"], {
      cwd,
      env,
    });
    assert.ok(/无需清理/.test(again.stderr), "无凭证时应提示无需清理");
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
