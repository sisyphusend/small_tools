import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import {
  BiliError,
  parseInput,
  getPages,
  getVideoTitle,
  getSubtitleTracks,
  downloadSubtitle,
  pickTrack,
  setCookie,
} from "./bilibili";
import { toSrt, toText, toJson } from "./format";
import { login, loadSavedSessdata } from "./login";

const HELP = `用法: bili-sub <视频URL|BV号|av号> [选项]
       bili-sub login

下载 B 站视频字幕，输出纯文本 / SRT / JSON。

命令:
  login               扫二维码登录，SESSDATA 自动保存到本地（推荐先执行一次）

选项:
  --format <text|srt|json>  输出格式，默认 text
  --lang <语言代码>         指定字幕轨道，如 zh-CN，默认自动选择
  --page <N|all>            指定分P，默认 all（多P时拼接全部）
  --list                    只列出可用字幕轨道
  --out <文件>              写入文件，默认输出到 stdout
  --cookie <SESSDATA>       手动指定登录凭证（优先级高于本地保存和环境变量 BILI_SESSDATA）
  -h, --help                显示帮助

示例:
  bili-sub login                                        # 扫码登录（一次即可）
  bili-sub "https://www.bilibili.com/video/BV1xxxx"
  bili-sub BV1xxxx --format srt --out sub.srt
`;

function info(msg: string) {
  process.stderr.write(msg + "\n"); // 进度信息走 stderr，stdout 保持纯内容
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      format: { type: "string", default: "text" },
      lang: { type: "string" },
      page: { type: "string", default: "all" },
      list: { type: "boolean" },
      out: { type: "string" },
      cookie: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  if (positionals[0] === "login") {
    await login();
    return;
  }

  // 凭证优先级: --cookie > 环境变量 > login 保存的本地文件
  const sessdata =
    values.cookie ?? process.env.BILI_SESSDATA ?? loadSavedSessdata();
  if (sessdata) setCookie(sessdata);

  const input = await parseInput(positionals[0]);
  const { pages } = await getPages(input);
  const title = await getVideoTitle(input);
  info(`视频: ${title || input.bvid || `av${input.aid}`}`);

  const selected =
    values.page === "all"
      ? pages
      : pages.filter((p) => p.page === Number(values.page));
  if (selected.length === 0) {
    throw new BiliError(`没有找到分P ${values.page}`);
  }

  const outputs: string[] = [];
  for (const page of selected) {
    const tracks = await getSubtitleTracks(input, page.cid);
    if (values.list) {
      info(
        tracks.length === 0
          ? `P${page.page} ${page.part}: 无可用字幕`
          : `P${page.page} ${page.part}:\n` +
              tracks
                .map(
                  (t, i) =>
                    `  [${i}] ${t.lan} (${t.lan_doc})${t.ai_type === 1 ? " [AI]" : ""}`,
                )
                .join("\n"),
      );
      continue;
    }
    const track = pickTrack(tracks, values.lang);
    if (!track) {
      info(
        `P${page.page} ${page.part}: 无可用字幕。` +
          (sessdata
            ? "该视频可能没有字幕。"
            : "大多数视频的 AI 字幕需要登录，请通过 --cookie 或环境变量 BILI_SESSDATA 提供。"),
      );
      continue;
    }
    info(`P${page.page} 使用字幕: ${track.lan_doc} (${track.lan})`);
    const lines = await downloadSubtitle(track);
    if (values.format === "srt") outputs.push(toSrt(lines));
    else if (values.format === "json") outputs.push(toJson(lines));
    else outputs.push(toText(lines));
  }

  if (values.list) return;

  const result = outputs.join("\n\n");
  if (!result.trim()) {
    info("最终没有获取到任何字幕内容。");
    process.exitCode = 1;
    return;
  }
  if (values.out) {
    writeFileSync(values.out, result, "utf-8");
    info(`已写入 ${values.out}`);
  } else {
    console.log(result);
  }
}

main().catch((err: Error) => {
  console.error(`错误: ${err instanceof BiliError ? err.message : err}`);
  process.exit(1);
});
