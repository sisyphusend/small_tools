# xyz-text

抓取小宇宙播客单集文本的命令行工具：元信息 + Shownotes + 官方 AI 文稿，输出 Markdown。

零运行时依赖（单文件打包），需要 Node 20+。

## 安装

```bash
npm i -g xyz-text
# 或免安装直接用
npx xyz-text <url>
```

## 快速开始

```bash
# 直接抓——未登录时会自动弹出二维码（走 stderr），扫码确认后自动继续
xyz-text "https://www.xiaoyuzhoufm.com/episode/<id>"

# 也可以先主动登录（覆盖旧凭证；二维码约 5 分钟有效，过期自动换新）
xyz-text --login

# 常用玩法
xyz-text <url>                     # 默认输出 Markdown 到控制台
xyz-text <url> --out notes.md      # 写入文件
xyz-text <url> --timestamps        # 文稿带时间戳
```

## 登录与凭证

- 官方 AI 文稿需要登录；未登录时抓取会**自动弹出二维码**，用小宇宙 App「我的」页右上角扫一扫，确认后自动继续。
- `--login` 主动登录并**覆盖旧凭证**（兼容旧写法 `xyz-text login`），可与单集参数同用。
- `--logout` 清除本地凭证（`~/.xyz-text/credentials.json` 及旧版位置一并清理）。
- 凭证保存在 `~/.xyz-text/credentials.json`（权限 600，仅本机可读），过期自动用 refresh token 续期；
  旧版本 `~/.config/small_tools/xyz.json` 的凭证会在首次运行时自动迁移。

## 选项

| 选项 | 说明 |
|---|---|
| `--login` | 扫码登录并覆盖旧凭证(可与单集参数同用,登录后自动抓取) |
| `--logout` | 清除本地保存的登录凭证 |
| `--timestamps` | 官方文稿每段前带 `[mm:ss]` 时间戳 |
| `--out <文件>` | 写入文件，默认输出到控制台(stdout) |

## 开发

```bash
cd xyz-text
npm install

# 直接跑源码，改完即生效，无需构建（需要 Node >= 22.18 原生跑 TypeScript）
npm run dev -- --help
npm run dev -- "https://www.xiaoyuzhoufm.com/episode/6ac9dceae742e36efcc0c441"

npm run typecheck        # 类型检查
npm run build            # esbuild 单文件打包到 dist/cli.js（发布产物，Node 20+ 可跑）
node dist/cli.js <url>   # 验证构建产物（与 npm i -g 后的 xyz-text 行为一致）

npm test                 # 端到端测试（公开页面抓取无需登录；文稿用例无凭证时自动跳过）
```

| 文件 | 职责 |
|---|---|
| `src/cli.ts` | 入口、参数解析、凭证选择与自动登录 |
| `src/xiaoyuzhou.ts` | 公开单集页面抓取与 Markdown 组装 |
| `src/api.ts` | 扫码登录、凭证保存/迁移、官方文稿接口 |
| `test/e2e.test.ts` | 端到端测试 |

## 说明

- **官方 AI 文稿**：小宇宙未公开此接口。本工具的实现为逆向结论——网页版扫码登录(`web-api.xiaoyuzhoufm.com` 二维码接口,无需验证码)→ `/v1/episode-transcript/get` 换签名 URL → 用官方 App UA 从 CDN 拉取分段文稿，参考 [r266-tech/xiaoyuzhou](https://github.com/r266-tech/xiaoyuzhou)。部分单集没有文稿时会在输出中注明。
- RSS 同步的节目会自动用平台内部的 `transcriptMediaId` 查文稿。
- 走个人账号的私有接口，请自用、低频。

## License

MIT
