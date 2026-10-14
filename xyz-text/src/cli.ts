import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { XyzError, parseEpisodeId, fetchEpisode, toMarkdown } from "./xiaoyuzhou.ts";
import {
  XyzApiError,
  loadCreds,
  clearCreds,
  qrLogin,
  getOfficialTranscript,
} from "./api.ts";

const HELP = `用法: xyz-text [选项] <单集URL|单集ID>
       xyz-text --login

抓取小宇宙播客单集文本，输出 Markdown（元信息 + Shownotes + 官方AI文稿）到控制台。

登录:
  --login               扫码登录并覆盖旧凭证（兼容旧写法: xyz-text login）
                        凭证保存在 ~/.xyz-text/credentials.json（权限 600）
  --logout              清除本地保存的登录凭证
  未登录时抓取会自动弹出二维码，扫码确认后自动继续，无需人工干预

选项:
  --timestamps          官方文稿带时间戳
  --out <文件>          写入文件，默认输出到控制台(stdout)
  -h, --help            显示帮助

示例:
  xyz-text --login                                        # 用小宇宙 App 扫码
  xyz-text "https://www.xiaoyuzhoufm.com/episode/<id>"    # 未登录会自动弹码并继续
  xyz-text <url> --timestamps --out notes.md              # 文稿带时间戳存文件
`;

function info(msg: string) {
  process.stderr.write(msg + "\n"); // 进度信息走 stderr，stdout 保持纯内容
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      timestamps: { type: "boolean" },
      out: { type: "string" },
      login: { type: "boolean" },
      logout: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || (!values.login && !values.logout && positionals.length === 0)) {
    console.log(HELP);
    return;
  }

  if (values.logout) {
    const removed = clearCreds();
    info(
      removed.length > 0
        ? `已清除登录凭证: ${removed.join("、")}`
        : "本地没有已保存的登录凭证，无需清理。",
    );
    return;
  }

  // 兼容旧写法 xyz-text login；--login 是主推方式，两者都强制重新扫码并覆盖旧凭证
  const legacyLoginCmd = positionals[0] === "login";
  const wantLogin = values.login || legacyLoginCmd;
  const target = legacyLoginCmd ? positionals[1] : positionals[0];

  if (wantLogin) {
    await qrLogin();
    if (!target) return; // 只登录，不带单集
  }

  // 已登录则抓官方 AI 文稿
  let creds = loadCreds();
  if (!creds) {
    // 未登录时自动弹出二维码，扫码成功后凭证落盘，自动继续抓取
    info("未检测到登录凭证，请扫码登录（扫码后将自动继续）…\n");
    creds = await qrLogin();
  }

  const eid = parseEpisodeId(target);
  const ep = await fetchEpisode(eid);

  // 已登录则抓官方 AI 文稿；失败不影响 Shownotes 输出
  let official = null;
  if (creds) {
    try {
      official = await getOfficialTranscript(ep, creds);
    } catch (err) {
      const msg = err instanceof XyzApiError ? err.message : String(err);
      info(`官方文稿获取失败（${msg}），本次仅输出 Shownotes。`);
    }
  }

  const result = toMarkdown(ep, values.timestamps, official);

  if (values.out) {
    writeFileSync(values.out, result, "utf-8");
    info(`已写入 ${values.out}`);
  } else {
    console.log(result);
  }
}

main().catch((err: Error) => {
  const hint = err instanceof XyzApiError && err.hint ? `（${err.hint}）` : "";
  console.error(`错误: ${err instanceof XyzError || err instanceof XyzApiError ? err.message : err}${hint}`);
  process.exit(1);
});
