# Computer Use Bridge for Windows

完整项目仓库：Windows MCP 桥接器源码、测试、安装与安全文档，以及中英文宣传网站。

- 网站：https://computer-use-bridge-landing.vercel.app
- 桥接器完整说明：[codex-computer-use-mcp-win/README.md](codex-computer-use-mcp-win/README.md)
- 安全说明：[SECURITY.md](codex-computer-use-mcp-win/SECURITY.md)
- 网站开发：[landing/README.md](landing/README.md)

## 项目结构

```text
codex-computer-use-mcp-win/
  src/              Windows MCP 服务与工具实现
  test/             单元、协议与模拟 helper 测试
  README.md         环境要求、安装、配置与已知限制
  SECURITY.md       授权与安全边界
  LICENSE           MIT 许可
  NOTICE.md         上游归属与非官方声明
landing/
  src/              中英文页面与交互
  public/           网站资源
  scripts/          静态构建、预览与浏览器验证
  tests/            网站内容与配置测试
  docs/             页面设计与部署说明
scripts/
  restore-cursor.ps1 手动恢复当前 Windows 鼠标方案
vercel.json          只安装并构建 landing 的部署配置
```

桥接器是本机 Windows 程序，在用户的真实前台桌面执行操作。Vercel 只托管静态宣传页面，不运行 Computer Use 服务。

## 安装桥接器

要求 Windows 10 1809+ 或 Windows 11、Node.js 22+、已安装的 OpenAI 签名 Computer Use helper 与有效的 Codex 登录状态。完整前提见桥接器 README。

```powershell
git clone https://github.com/zhaokangwei095/computer-use-bridge-landing.git
cd computer-use-bridge-landing\codex-computer-use-mcp-win
npm.cmd ci
npm.cmd run build
node dist\mcp-server.js --status
```

将生成的 `dist/mcp-server.js` 绝对路径加入 MCP 客户端配置。`--status` 仅用于诊断，不要放入 MCP 服务启动参数。

## 本地运行网站

```powershell
cd landing
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

访问 `http://127.0.0.1:4187`。网站要求 Node.js 24。

## 验证

```powershell
npm.cmd --prefix codex-computer-use-mcp-win run check
npm.cmd --prefix codex-computer-use-mcp-win test
npm.cmd --prefix landing test
npm.cmd --prefix landing run build
```

2026-11-18（Asia/Singapore）发布整理时，桥接器类型检查通过，137 项单元与协议测试通过。测试使用模拟 helper，不代表第三方客户端实机或任意浏览器页面读取已验收。浏览器 URL 核验仍可能拒绝读取，详见桥接器文档。

依赖审计：网站为 0 告警；桥接器当前固定的 `zod@4.4.3` 存在一项高危资源耗尽告警 `GHSA-mrhx-c7xc-m3w5`，修复版本为 4.6.6 及以上。本次保存现有源码快照，未升级桥接器依赖。安装使用前应评估并完成升级与回归验证；不能将当前测试通过等同于依赖安全审计通过。

## 来源与发布范围

桥接器基于 Thomas Mustier 的 [codex-computer-use-mcp](https://github.com/tmustier/codex-computer-use-mcp)，上游和 Windows 移植历史保留在 Git 历史中；版权与许可保留在 [LICENSE](codex-computer-use-mcp-win/LICENSE) 和 [NOTICE.md](codex-computer-use-mcp-win/NOTICE.md)。本项目非 OpenAI 官方项目，未附带或重新分发 OpenAI 二进制文件。

本仓库包含本地当前桥接器源码，包括发布整理前未提交的浏览器路由与鼠标恢复改动。本地缓存、已安装依赖、个人截图、代理配置、临时实验状态、第三方上游参考副本和凭据不在发布范围，原文件均保留在本机。

完整仓库发布自原有落地页仓库，现有提交历史和公开网站地址保持可追溯。历史提交中的根目录为旧版落地页；当前版本使用上面的双目录结构。
