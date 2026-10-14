import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { XyzError, parseEpisodeId, fetchEpisode, toMarkdown, htmlToText, formatDuration } from "../src/xiaoyuzhou.ts";
import type { Episode } from "../src/xiaoyuzhou.ts";
import { loadCreds, getOfficialTranscript } from "../src/api.ts";

const execFileAsync = promisify(execFile);

/** 测试单集: 投资实战派 E198（公开页面，无需登录） */
const EPISODE_URL = "https://www.xiaoyuzhoufm.com/episode/6a9d2c42f03e74ee6b05db4f";
const EPISODE_ID = "6a9d2c42f03e74ee6b05db4f";

test("解析: 单集URL / 纯单集ID / 非法输入", () => {
  assert.equal(parseEpisodeId(EPISODE_URL), EPISODE_ID);
  assert.equal(parseEpisodeId(EPISODE_ID), EPISODE_ID);
  assert.throws(() => parseEpisodeId("https://example.com/whatever"), XyzError);
});

test("抓取: 公开单集页面（无需登录）", async () => {
  const ep = await fetchEpisode(EPISODE_ID);
  assert.ok(ep.title.length > 0, "应有单集标题");
  assert.ok(ep.podcast.title.length > 0, "应有播客名");
  assert.ok(ep.duration > 0, "应有时长");
});

test("格式: htmlToText 链接转 Markdown、去标签、反转义", () => {
  const md = htmlToText('<p>看<a href="https://example.com/a">这篇文章</a></p><p>A &amp; B</p>');
  assert.ok(md.includes("[这篇文章](https://example.com/a)"), "链接应转 Markdown");
  assert.ok(!md.includes("<"), "不应残留 HTML 标签");
  assert.ok(md.includes("A & B"), "应反转义实体");
});

test("格式: formatDuration / toMarkdown 带与不带时间戳", () => {
  assert.equal(formatDuration(3720), "1小时2分");
  assert.equal(formatDuration(600), "10分");
  assert.equal(formatDuration(0), "未知");

  const ep: Episode = {
    eid: EPISODE_ID,
    title: "测试单集",
    shownotes: "<p>笔记</p>",
    pubDate: "2026-09-06T00:00:00Z",
    duration: 600,
    podcast: { pid: "p1", title: "测试播客", author: "主播" },
  };
  const segments = [
    { text: "第一句。", startMs: 5000 },
    { text: "第二句。", startMs: 63000 },
  ];
  const plain = toMarkdown(ep, false, segments);
  assert.ok(plain.includes("## 官方文稿"), "应含官方文稿小节");
  assert.ok(!/\[\d{2}:\d{2}\]/.test(plain), "默认不带时间戳");

  const timed = toMarkdown(ep, true, segments);
  assert.ok(timed.includes("[00:05] 第一句。"), "应带 [mm:ss] 时间戳");
  assert.ok(timed.includes("[01:03] 第二句。"), "分钟应正确进位");
});

test("官方文稿: 已登录时获取（无凭证自动跳过）", async (t) => {
  const creds = loadCreds();
  if (!creds) {
    t.skip("没有登录凭证（先运行 xyz-text --login 扫码一次），跳过官方文稿用例");
    return;
  }
  const ep = await fetchEpisode(EPISODE_ID);
  try {
    const segments = await getOfficialTranscript(ep, creds);
    if (segments) {
      assert.ok(segments.length > 0, "有文稿时应非空");
    }
    // 该单集无官方文稿时返回 null 也算通过（接口契约允许）
  } catch (err) {
    // 私有接口偶发抖动不视为回归，跳过并注明原因
    t.skip(`官方文稿接口本次不可用（${err instanceof Error ? err.message : err}），跳过`);
  }
});

test("CLI: --logout 清除凭证（隔离 HOME，不影响真实凭证）", async () => {
  const cwd = join(import.meta.dirname, "..");
  const fakeHome = mkdtempSync(join(tmpdir(), "xyz-text-test-"));
  const credFile = join(fakeHome, ".xyz-text", "credentials.json");
  try {
    mkdirSync(join(fakeHome, ".xyz-text"), { recursive: true });
    writeFileSync(credFile, JSON.stringify({ accessToken: "dummy" }));
    assert.ok(existsSync(credFile), "前置: 已放置凭证文件");

    const env = { ...process.env, HOME: fakeHome };
    const res = await execFileAsync("node", ["src/cli.ts", "--logout"], {
      cwd,
      env,
    });
    assert.ok(/已清除/.test(res.stderr), "应提示已清除及路径");
    assert.ok(!existsSync(credFile), "凭证文件应被删除");

    const again = await execFileAsync("node", ["src/cli.ts", "--logout"], {
      cwd,
      env,
    });
    assert.ok(/无需清理/.test(again.stderr), "无凭证时应提示无需清理");
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
