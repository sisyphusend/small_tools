import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { XyzError, parseEpisodeId, fetchEpisode, toMarkdown } from "./xiaoyuzhou";
import {
  XyzApiError,
  loadCreds,
  qrLogin,
  getOfficialTranscript,
} from "./api";

const HELP = `用法: xyz-text <单集URL|单集ID> [选项]
       xyz-text login

抓取小宇宙播客单集文本，输出 Markdown（元信息 + Shownotes + 官方AI文稿）。

命令:
  login               扫码登录（首次执行一次即可），之后自动抓取官方文稿

选项:
  --timestamps       官方文稿带时间戳
  --audio            只输出音频直链
  --json             输出原始元数据 JSON
  --out <文件>       写入文件，默认输出到 stdout
  -h, --help         显示帮助

示例:
  xyz-text login                                        # 用小宇宙 App 扫码
  xyz-text "https://www.xiaoyuzhoufm.com/episode/<id>"  # 完整 Markdown
  xyz-text <url> --out notes.md
  xyz-text <url> --audio                                # 只取音频直链
`;

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      timestamps: { type: "boolean" },
      audio: { type: "boolean" },
      json: { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  if (positionals[0] === "login") {
    await qrLogin();
    return;
  }

  const eid = parseEpisodeId(positionals[0]);
  const ep = await fetchEpisode(eid);

  if (values.audio) {
    if (!ep.audioUrl) throw new XyzError("没有取到音频链接");
    console.log(ep.audioUrl);
    return;
  }

  // 已登录则抓官方 AI 文稿；失败不影响 Shownotes 输出
  let official = null;
  const creds = loadCreds();
  if (creds) {
    try {
      official = await getOfficialTranscript(ep, creds);
    } catch (err) {
      const msg = err instanceof XyzApiError ? err.message : String(err);
      process.stderr.write(`官方文稿获取失败（${msg}），本次仅输出 Shownotes。\n`);
    }
  }

  const result = values.json
    ? JSON.stringify({ ...ep, officialTranscript: official }, null, 2)
    : toMarkdown(ep, values.timestamps, official);

  if (values.out) {
    writeFileSync(values.out, result, "utf-8");
    process.stderr.write(`已写入 ${values.out}\n`);
  } else {
    console.log(result);
  }
}

main().catch((err: Error) => {
  const hint = err instanceof XyzApiError && err.hint ? `（${err.hint}）` : "";
  console.error(`错误: ${err instanceof XyzError || err instanceof XyzApiError ? err.message : err}${hint}`);
  process.exit(1);
});
