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
# 1) 首次使用:扫码登录(终端出二维码,用 B 站 App「我的」页右上角扫一扫)
#    AI 字幕必须登录才能获取,登录一次即可,凭证自动保存
bili-sub login

# 2) 抓字幕(默认输出按句分段的纯文本)
bili-sub "https://www.bilibili.com/video/BV1xxxx"

# 3) 常用玩法
bili-sub BV1xxxx --format srt --out sub.srt   # 带时间轴的 SRT
bili-sub BV1xxxx --list                        # 列出该视频可用字幕轨道
bili-sub BV1xxxx --page 2                      # 多P视频只抓 P2(默认抓全部)
```

## 选项

| 选项 | 说明 |
|---|---|
| `--format <text\|srt\|json>` | 输出格式，默认 `text`(纯文本，句末标点分段) |
| `--lang <语言代码>` | 指定字幕轨道(如 `zh-CN`),默认自动选中文 |
| `--page <N\|all>` | 分P选择，默认 `all`(多P拼接) |
| `--list` | 只列出可用字幕轨道，不下载 |
| `--out <文件>` | 写入文件，默认输出到 stdout(进度信息走 stderr,可安全重定向) |
| `--cookie <SESSDATA>` | 手动指定登录凭证(优先级高于本地保存和环境变量) |

## 说明

- **登录凭证**：`login` 扫码后 `SESSDATA` 保存在 `~/.config/small_tools/bili.json`(权限 600,仅本机可读)；也可通过 `BILI_SESSDATA` 环境变量或 `--cookie` 传入。
- 支持完整 URL / `BV号` / `av号` / `b23.tv` 短链自动跳转。
- 直接调用 B 站公开接口(`pagelist` + `player/wbi/v2`,含 WBI 签名；扫码走 passport 二维码登录)，接口参考 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)。
- 个人自用工具，请低频使用，注意遵守平台条款。

## License

MIT
