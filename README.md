# small_tools

个人小工具集。两个独立的命令行工具,均为 TypeScript + esbuild 单文件打包,零运行时依赖(Node 20+):

| 目录 | 工具 | 功能 |
|---|---|---|
| [bili-sub/](./bili-sub) | B站字幕下载 | CC / AI 字幕 → 纯文本 / SRT / JSON,扫码登录 |
| [xyz-text/](./xyz-text) | 小宇宙单集文本 | 元信息 + Shownotes + 官方 AI 文稿,扫码登录 |

安装与详细用法见各自目录的 README:

```bash
npm i -g bili-sub xyz-text
```

## 本地开发

```bash
npm install
npm run build             # 构建两个工具到各自 dist/cli.js
npm run typecheck
npm run bili -- <url>     # 不全局安装的直接用法;xyz 同理 npm run xyz -- <url>
```

## 打包

```bash
npm pack -w bili-sub -w xyz-text   # 产出 tgz,可直接 npm i -g 安装
```

## 发布(CI/CD)

推送到 main 自动跑构建 + 类型检查(CI)。发布走 tag 触发(GitHub Actions 自动发布到 npm 并创建对应包的 Release,附带 tgz):

```bash
# 以发布 bili-sub 0.2.1 为例(先确认 bili-sub/package.json 的 version 一致)
git tag bili-sub-v0.2.1
git push origin bili-sub-v0.2.1

# xyz-text 同理:xyz-text-v0.2.0
```

两个包独立版本、独立发布、独立 Release。需要仓库 Secrets 里的 `NPM_TOKEN`(granular token,开 Bypass two-factor authentication,权限 Read and write (publish and stage))。

## License

MIT
