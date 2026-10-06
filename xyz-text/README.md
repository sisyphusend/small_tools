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
# 免登录即可用:输出元信息 + Shownotes(链接保留为 Markdown 格式)
xyz-text "https://www.xiaoyuzhoufm.com/episode/<id>"

# 要抓官方 AI 文稿(App 内「文稿」同款):先扫码登录(小宇宙 App 扫一扫)
# 二维码约 5 分钟有效,过期会自动换新,无需重跑命令
xyz-text login

# 常用玩法
xyz-text <url> --out notes.md      # 写入文件
xyz-text <url> --timestamps        # 文稿带时间戳
xyz-text <url> --audio             # 只输出音频直链(可接 whisper 等转写)
xyz-text <url> --json              # 原始元数据 JSON
```

## 选项

| 选项 | 说明 |
|---|---|
| `--timestamps` | 官方文稿每段前带 `[mm:ss]` 时间戳 |
| `--audio` | 只输出音频 CDN 直链 |
| `--json` | 输出原始元数据 JSON(含文稿段落) |
| `--out <文件>` | 写入文件，默认输出到 stdout |

## 说明

- **官方 AI 文稿**：小宇宙未公开此接口。本工具的实现为逆向结论——网页版扫码登录(`web-api.xiaoyuzhoufm.com` 二维码接口,无需验证码)→ `/v1/episode-transcript/get` 换签名 URL → 用官方 App UA 从 CDN 拉取分段文稿，参考 [r266-tech/xiaoyuzhou](https://github.com/r266-tech/xiaoyuzhou)。部分单集没有文稿时会在输出中注明。
- **登录凭证**：token 保存在 `~/.config/small_tools/xyz.json`(权限 600,仅本机可读)，过期自动用 refresh token 续期，续期失败才需要重新 `login`。
- RSS 同步的节目会自动用平台内部的 `transcriptMediaId` 查文稿。
- 走个人账号的私有接口，请自用、低频。

## License

MIT
