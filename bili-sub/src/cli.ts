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
} from "./bilibili.ts";
import { toSrt, toText, toTextWithTime, toJson } from "./format.ts";
import { login, loadSavedSessdata, clearSavedCookie } from "./login.ts";

const HELP = `用法: bili-sub [选项] <视频URL|BV号|av号>
       bili-sub --login

下载 B 站视频字幕，输出纯文本 / SRT / JSON。

登录:
  --login               扫码登录并覆盖旧凭证（兼容旧写法: bili-sub login）
                        凭证保存在 ~/.bili-sub/credentials.json（权限 600）
  --logout              清除本地保存的登录凭证
  未登录时直接抓取会自动弹出二维码，扫码确认后自动继续下载，无需人工干预

凭证（优先级从高到低）: --cookie 参数 > BILI_SESSDATA 环境变量 > 本地凭证文件

选项:
  --login                    扫码登录（可同时带视频，登录后自动下载）
  --logout                   清除本地保存的登录凭证
  --format <text|srt|json>   输出格式，默认 text
  --timestamps               每段文本前加 [mm:ss] 时间戳（仅对 text 格式生效）
  --lang <语言代码>          指定字幕轨道，如 zh-CN、en，默认自动选中文
  --page <N|all>             指定分P，默认 all（多P时拼接全部）
  --list                     只列出可用字幕轨道（* 标记默认选择）
  --out <文件>               写入文件，默认输出到 stdout
  --cookie <SESSDATA>        手动指定登录凭证
  -h, --help                 显示帮助

示例:
  bili-sub --login                                       # 扫码登录（凭证长期有效）
  bili-sub "https://www.bilibili.com/video/BV1xxxx"      # 未登录会自动弹码并继续
  bili-sub BV1xxxx --format srt --out sub.srt            # SRT 字幕
  bili-sub BV1xxxx --timestamps                          # 文本 + 时间戳
  bili-sub BV1xxxx --list                                # 看有哪些字幕（中英文等）
  bili-sub BV1xxxx --lang en                             # 下载英文字幕
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
      login: { type: "boolean" },
      logout: { type: "boolean" },
      timestamps: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || (!values.login && !values.logout && positionals.length === 0)) {
    console.log(HELP);
    return;
  }

  if (values.logout) {
    const removed = clearSavedCookie();
    info(
      removed.length > 0
        ? `已清除登录凭证: ${removed.join("、")}`
        : "本地没有已保存的登录凭证，无需清理。",
    );
    return;
  }

  // 兼容旧写法 bili-sub login；--login 是主推方式，两者都强制重新扫码并覆盖旧凭证
  const legacyLoginCmd = positionals[0] === "login";
  const wantLogin = values.login || legacyLoginCmd;
  const target = legacyLoginCmd ? positionals[1] : positionals[0];

  if (wantLogin) {
    await login();
    if (!target) return; // 只登录，不带视频
  }

  // 凭证优先级: --cookie > 环境变量 > login 保存的本地文件
  let sessdata =
    values.cookie ?? process.env.BILI_SESSDATA ?? loadSavedSessdata();
  if (!sessdata) {
    // 未登录时自动弹出二维码，扫码成功后凭证落盘，自动继续下载
    info("未检测到登录凭证，请扫码登录（扫码后将自动继续）…\n");
    await login();
    sessdata = loadSavedSessdata();
  }
  if (sessdata) setCookie(sessdata);

  const input = await parseInput(target);
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
      const chosen = pickTrack(tracks, values.lang);
      info(
        tracks.length === 0
          ? `P${page.page} ${page.part}: 无可用字幕`
          : `P${page.page} ${page.part}:\n` +
              tracks
                .map(
                  (t, i) =>
                    `  ${t === chosen ? "*" : " "}[${i}] ${t.lan} (${t.lan_doc})${t.ai_type === 1 ? " [AI]" : ""}`,
                )
                .join("\n") +
              "\n  (* 默认选择，--lang <语言代码> 可换轨道)",
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
    else if (values.timestamps) outputs.push(toTextWithTime(lines));
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
