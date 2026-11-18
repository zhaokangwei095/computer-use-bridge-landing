# 部署记录

日期：2026-11-18，Asia/Singapore。

## 已发布

本仓库现已扩展为完整项目：`codex-computer-use-mcp-win/` 包含桥接器源码与测试，`landing/` 包含网站。根 `vercel.json` 从完整仓库中只构建 `landing/`。Vercel 不执行本机 Windows 服务。

- GitHub：`https://github.com/zhaokangwei095/computer-use-bridge-landing`，公开仓库，默认分支 `main`。
- Vercel 项目：`computer-use-bridge-landing`，位于 `zhaokangwei095s-projects`。
- 网站：`https://computer-use-bridge-landing.vercel.app`。
- 首次部署：`dpl_6jjNGhV4GLHYpskYacVTdYeKonaA`，Vercel 状态 `READY`。
- 完整项目结构部署：`dpl_GmnR9PSiLPyLGiFdmSYXv1WztuPf`，production / READY；使用 Node.js 24，公开主站地址保持不变。
- 首次部署由 Vercel 为新项目自动指定为 production，不覆盖既有项目。
- 从完整仓库根目录安装：`npm ci --prefix landing --ignore-scripts`；构建：`npm --prefix landing run build`；输出：`landing/dist`。
- 部署不需要额外的服务端密钥。`.env*`、`.vercel/`、本机截图与日志不进入 Git 或部署上传。

## 自动部署连接

GitHub 仓库和 Vercel 站点分别已发布。尝试连接 Git 集成时，Vercel 返回需要安装 GitHub App。浏览器已将授权范围限制为本次的一个仓库 `computer-use-bridge-landing`，但 GitHub 要求本人完成 Confirm access 验证，所以 App 安装与自动部署连接尚未完成。

完成本人验证并安装 App 后，在完整仓库根目录执行：

```powershell
vercel.cmd git connect https://github.com/zhaokangwei095/computer-use-bridge-landing.git --yes --scope zhaokangwei095s-projects
```

连接前，Git push 不会自动部署。可以从本目录手动部署：

```powershell
vercel.cmd deploy --yes --scope zhaokangwei095s-projects
```

这会为已有项目创建预览部署；需要更新公开主站时使用明确的 `--prod`。

## 验证与回退

公开主站匿名 HTTP 200，分享图 URL 为该域名下的绝对地址，安全响应头生效。完整项目结构上线后，中英文与响应式、配置复制、菜单键盘操作等 18 组浏览器检查再次通过，错误列表为空。源码链接与安装命令已指向完整仓库及其桥接器子目录。

桥接器 47 个发布文件与原本机项目逐文件 SHA-256 相同；GitHub 远端树确认包含桥接器源码、测试与网站，且没有将嵌套仓库误提交为 gitlink。原桥接器源码目录与本地未提交状态保留。代码仅上传到 GitHub，Vercel 只接收和构建站点所需内容。

桥接器类型检查及 137 项模拟 helper 测试通过；网站 4 项测试与构建通过。网站依赖审计为 0 告警；桥接器现有 Zod 依赖的一项高危告警见根 README，本次没有升级依赖。

完整线上浏览器验证证据保存在本机 `artifacts/test-results/`，不向公开仓库上传。

回退时在 Vercel 项目的 Deployments 里选择先前 READY 部署并 Promote。此站无数据库，无需执行数据回滚；Git 历史保留源代码版本。未实际执行回退操作。
