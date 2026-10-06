# small_tools

个人小工具集。目前包含两个命令行工具：抓取 B 站视频字幕、抓取小宇宙播客单集文本。均用 TypeScript 编写，esbuild 打包为单文件，零运行时依赖（Node 20+）。

## 目录

```
bili-sub/    B站字幕下载（CC / AI 字幕）→ 纯文本 / SRT / JSON
xyz-text/    小宇宙单集文本抓取 → Markdown（元信息 + Shownotes + 官方文稿）
```

## 安装与构建

```bash
npm install
npm run build          # 构建所有工具到各自 dist/cli.js
npm link               # 可选：注册全局命令 bili-sub / xyz-text
```

不想全局安装也可以直接：

```bash
npm run bili -- <url>   # 等价于 node bili-sub/dist/cli.js <url>
npm run xyz -- <url>
```

## bili-sub：B站字幕

```bash
bili-sub login                                               # 扫码登录（首次执行一次即可）
bili-sub "https://www.bilibili.com/video/BV1xxxx"            # 输出纯文本
bili-sub BV1xxxx --format srt --out sub.srt                  # SRT 到文件
bili-sub BV1xxxx --list                                      # 列出可用字幕轨道
```

说明：

- **首次使用先 `bili-sub login`**：终端出现二维码，用 B 站 App 扫一下即完成登录，`SESSDATA` 自动保存到 `~/.config/small_tools/bili.json`（仅本机可读），之后直接抓字幕。不想扫码也可用 `--cookie` 或环境变量 `BILI_SESSDATA` 手动传入。
- 绝大多数视频只有 AI 字幕，而 AI 字幕需要登录态。
- 直接调用 B 站开放接口（pagelist + player/wbi/v2，含 WBI 签名；扫码走 passport 二维码登录），接口参考 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)。

## xyz-text：小宇宙单集文本

```bash
xyz-text login                                           # 小宇宙 App 扫码登录（首次一次即可）
xyz-text "https://www.xiaoyuzhoufm.com/episode/<id>"    # 输出 Markdown
xyz-text <url> --timestamps                             # 官方文稿带时间戳
xyz-text <url> --out notes.md                           # 写入文件
xyz-text <url> --audio                                  # 只输出音频直链
xyz-text <url> --json                                   # 原始元数据 JSON
```

说明：

- 免登录可用：元信息 + Shownotes（链接保留为 Markdown 格式）。
- **官方 AI 文稿**（App 内"文稿"同款）：`login` 后自动抓取。小宇宙未公开这些接口，实现为逆向结论：网页版扫码登录（`web-api.xiaoyuzhoufm.com`，二维码接口无需验证码）+ `/v1/episode-transcript/get` 换签名 URL + 官方 App UA 从 CDN 拉分段文稿，参考 [r266-tech/xiaoyuzhou](https://github.com/r266-tech/xiaoyuzhou)。token 存于 `~/.config/small_tools/xyz.json`（仅本机可读），401 自动刷新。
- 注意：走的是个人账号的私有接口，请自用、低频。

## 打包分发

两个子包可独立分发，均零运行时依赖（qrcode-terminal 已打进单文件产物）：

```bash
npm pack -w bili-sub -w xyz-text        # 产出 bili-sub-x.y.z.tgz / xyz-text-x.y.z.tgz
```

三种方式：

```bash
# 1) 本地拷贝：目标机器上
npm i -g bili-sub-0.2.0.tgz

# 2) GitHub Release 附件：上传 tgz 后
npm i -g https://github.com/sisyphusend/small_tools/releases/download/vX/bili-sub-0.2.0.tgz

# 3) npm 公开发布（需 npm 账号，且能访问 registry.npmjs.org；npmmirror 镜像只读不能发）
npm login
npm publish -w bili-sub  --registry https://registry.npmjs.org
npm publish -w xyz-text --registry https://registry.npmjs.org
# 发布后任何人：npm i -g bili-sub 或免安装 npx bili-sub <url>
```

## License

MIT
