# bili-sub

下载 B 站视频字幕(CC / AI 字幕)的命令行工具，输出纯文本 / SRT / JSON。

零运行时依赖（单文件打包），需要 Node 20+。

## 安装

```bash
npm i -g bili-sub
# 或免安装直接用
npx bili-sub <url>
```

## 快速开始

```bash
# 直接抓字幕——未登录时会自动弹出二维码，扫码确认后自动继续，全程无需人工干预
bili-sub "https://www.bilibili.com/video/BV1bW411n7fY"

# 也可以先主动登录（覆盖旧凭证）
bili-sub --login

# 常用玩法
bili-sub BV1xxxx --timestamps                 # 文本 + [mm:ss] 时间戳
bili-sub BV1xxxx --format srt --out sub.srt   # 带时间轴的 SRT
bili-sub BV1xxxx --list                        # 列出可用字幕(中/英文轨道,* 为默认)
bili-sub BV1xxxx --lang en                     # 下载英文字幕轨道
bili-sub BV1xxxx --page 2                      # 多P视频只抓 P2(默认抓全部)
```

## 登录与凭证

- AI 字幕需要登录；未登录时抓取会**自动弹出二维码**（走 stderr，不影响 stdout 重定向），
  用 B 站 App「我的」页右上角扫一扫，确认后自动继续下载。
- `--login` 主动登录并**覆盖旧凭证**（兼容旧写法 `bili-sub login`），可与视频参数同用。
- `--logout` 清除本地凭证（`~/.bili-sub/credentials.json` 及旧版位置一并清理）。
- 凭证保存在 `~/.bili-sub/credentials.json`（权限 600，仅本机可读），长期有效；
  旧版本 `~/.config/small_tools/bili.json` 的凭证会在首次运行时自动迁移。
- 也可用 `--cookie <SESSDATA>` 或环境变量 `BILI_SESSDATA` 手动指定凭证（优先级更高）。

## 选项

| 选项 | 说明 |
|---|---|
| `--login` | 扫码登录并覆盖旧凭证(可与视频参数同用,登录后自动下载) |
| `--logout` | 清除本地保存的登录凭证 |
| `--format <text\|srt\|json>` | 输出格式，默认 `text`(纯文本，句末标点分段) |
| `--timestamps` | 每段文本前加 `[mm:ss]` 时间戳(仅对 `text` 格式生效) |
| `--lang <语言代码>` | 指定字幕轨道(如 `zh-CN`、`en`)，默认自动选中文 |
| `--page <N\|all>` | 分P选择，默认 `all`(多P拼接) |
| `--list` | 只列出可用字幕轨道，`*` 标记默认选择，不下载 |
| `--out <文件>` | 写入文件，默认输出到 stdout(进度信息走 stderr,可安全重定向) |
| `--cookie <SESSDATA>` | 手动指定登录凭证(优先级高于本地保存和环境变量) |

## 开发

```bash
cd bili-sub
npm install

# 直接跑源码，改完即生效，无需构建（需要 Node >= 22.18 原生跑 TypeScript）
npm run dev -- --help
npm run dev -- "https://www.bilibili.com/video/BV1bW411n7fY"
npm run dev -- "https://b23.tv/BV1bW411n7fY"
npm run dev -- --login
npm run dev -- --logout


npm run typecheck        # 类型检查
npm run build            # esbuild 单文件打包到 dist/cli.js（发布产物，Node 20+ 可跑）
node dist/cli.js <url>   # 验证构建产物（与 npm i -g 后的 bili-sub 行为一致）

# 端到端测试: 用本地已保存的凭证(BILI_SESSDATA 或 --login 扫码保存)获取 BV1bW411n7fY 的字幕
npm test                 # 没有凭证时自动跳过
```

源码结构:

| 文件 | 职责 |
|---|---|
| `src/cli.ts` | 入口、参数解析、凭证选择与自动登录 |
| `src/bilibili.ts` | B 站接口（WBI 签名、分P列表、字幕轨道与下载） |
| `src/login.ts` | 扫码登录、凭证保存/迁移 |
| `src/format.ts` | text / SRT / JSON 输出格式化 |
| `test/e2e.test.ts` | 端到端测试 |

## 说明

- **登录凭证**：见上文「登录与凭证」；`--login` 后 `SESSDATA` 保存在 `~/.bili-sub/credentials.json`(权限 600,仅本机可读)。
- 支持完整 URL / `BV号` / `av号` / `b23.tv` 短链自动跳转。
- 直接调用 B 站公开接口(`pagelist` + `player/wbi/v2`,含 WBI 签名；扫码走 passport 二维码登录)，接口参考 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)。
- 个人自用工具，请低频使用，注意遵守平台条款。

## License

MIT
