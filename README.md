# Computer Use Bridge 落地页

这是已有 Windows Computer Use MCP 桥接器的独立宣传站，包含中英文、交互桌面示意、架构说明、三步接入、四种客户端配置、六条 FAQ，以及隐私说明、使用说明和 404。

## 启动

要求 Node.js 22 或更高版本。在本目录执行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

打开 `http://127.0.0.1:4187`。英文入口为 `http://127.0.0.1:4187/?lang=en`。语言选择会保存在浏览器中。预览服务只监听本地回环地址。

改动源文件后重新执行 `npm.cmd run build`，浏览器刷新即可。更改预览端口可在当前终端设置 `$env:PORT = '另一个空闲端口'`。

```powershell
npm.cmd run build   # 生成 dist 静态站点
npm.cmd run preview # 预览上次构建
npm.cmd test        # 内容与配置逻辑测试
npm.cmd audit       # 依赖检查
```

发布时使用整个 `dist/` 目录，可由普通静态托管服务提供；本次没有部署到公网。部署在子路径时，应按目标托管服务调整 404 页的 base URL。正式域名尚未指定，因此没有伪造 canonical 或站点绝对 OG 地址；正式发布时请将 `og:image` 设置为最终域名下的 `/social-card.png` 完整地址。

## 文件入口

- 页面结构与交互：`src/main.js`
- 中英文文案及客户端配置：`src/content.js`
- 视觉样式与响应式：`src/styles.css`
- 图标、分享图和网站图标：`public/`
- Node 静态构建与预览：`scripts/build.mjs`、`scripts/serve.mjs`
- 浏览器验证脚本：`scripts/verify-browser.mjs`
- 内容与配置测试：`tests/content.test.mjs`
- 设计、范围与事实依据：`docs/DESIGN.md`
- 验证结果与限制：`docs/VERIFICATION.md`
- 浏览器结果与截图：`artifacts/test-results/`
- 原项目源码仍位于兄弟目录：`../codex-computer-use-mcp-win/`

## 内容维护

`0.4.1-preview.1` 为本次核实的本地预览版本，不代表远端发布状态。页面交互示意不会连接或控制用户电脑。兼容客户端名称表示 MCP 接入目标，不表示全部完成实机验收。浏览器 URL 核验、原生页签读取边界、非官方项目声明均已展示。无虚构用户数、评价、价格或商业承诺。

依赖只有本地字体 Geist 与本地图标 Phosphor，不加载外部字体、统计脚本或远端 JavaScript。Node 构建脚本只复制站点文件，不需要前端运行时依赖。

## 浏览器复验

脚本复用本机已有的 Playwright，不将测试浏览器添加到页面依赖。设置已安装的驱动与 Chromium 路径后，在预览运行时执行：

```powershell
$env:PLAYWRIGHT_DRIVER = '你的 playwright-core\index.mjs 绝对路径'
$env:CHROMIUM_PATH = '你的 Chromium\chrome.exe 绝对路径'
$env:PREVIEW_URL = 'http://127.0.0.1:4187'
node scripts/verify-browser.mjs
```

截图为页面实际 Chromium 渲染；示意中的桌面仍为模拟内容，不是桥接器实机验收。
