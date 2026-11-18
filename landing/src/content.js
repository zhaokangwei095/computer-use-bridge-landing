export const repository = 'https://github.com/zhaokangwei095/computer-use-bridge-landing';
export const resolveLocale = (value) => value === 'en' ? 'en' : 'zh';

export function configFor(client) {
  const path = 'C:\\tools\\codex-computer-use-mcp-win\\dist\\mcp-server.js';
  if (client === 'claude') return `claude mcp add computer-use-win -- node "${path}"`;
  if (!['generic', 'qoder', 'dsh'].includes(client)) throw new Error('Unknown client');
  return JSON.stringify({ mcpServers: { 'codex-computer-use-win': {
    ...(client === 'qoder' ? { type: 'stdio' } : {}),
    command: 'node', args: [path],
  } } }, null, 2);
}

export const messages = {
  zh: {
    metaTitle: 'Computer Use Bridge · 让你的 Agent，真正动手',
    metaDescription: '通过 MCP，将第三方 Agent 接入已安装的 Codex Windows Computer Use 运行时。保留你的模型，连接真实桌面。',
    skip: '跳转到正文', overview: '概览', features: '为什么是 Bridge', workflow: '工作原理', setup: '接入指南', faqLabel: '常见问题', source: '查看源码', start: '开始接入', menu: '打开导航', close: '关闭导航',
    version: 'WINDOWS PREVIEW', heroLine1: '让你的 Agent，', heroLine2: '真正动手。',
    heroDescription: '你熟悉的 Agent，现在也能操作真实桌面。通过 MCP，连接 Codex Computer Use，让规划走出对话框。',
    heroNote: '本地运行 · 无嵌套模型 · MIT 开源', heroLink: '它是如何工作的',
    demoLabel: '交互示意，非实机录像', demoTitle: '从一句指令，到桌面上的行动',
    demoTask: '打开记事本，写下今天的灵感。', agentLabel: 'YOUR AGENT', agentReply: '先观察窗口，再定位输入区域。',
    plan: '任务规划', bridgeLabel: 'MCP BRIDGE', executing: '操作执行', observe: '01 观察', act: '02 操作', verify: '03 再观察',
    noteTitle: '灵感记录.txt', noteText: '把想法写下来，\n把下一步交给 Agent。', demoBadge: '原生 Windows 窗口', demoCaption: '模型负责思考，运行时负责点击与输入。',
    demoStates: [
      { heading: '先看清，再行动。', detail: '读取窗口状态，获得截图与可用的辅助功能信息。', tool: 'observe_window', status: '观察窗口' },
      { heading: '让计划落在桌面上。', detail: '通过签名运行时执行点击和输入；行动发生在真实前台。', tool: 'click_element → type_text', status: '输入内容' },
      { heading: '行动之后，再确认。', detail: '重新观察可见结果。“已发送输入”不等于“任务已完成”。', tool: 'observe_window', status: '重新观察' },
    ],
    compatible: '为支持 MCP 的 Agent 搭一座桥', compatibleNote: '通过标准 MCP 配置接入，具体客户端仍需实机验证。',
    featuresEyebrow: 'SAME AGENT. MORE REACH.', featuresTitle: '保留你的工作流，\n多一种行动能力。',
    featureItems: [
      ['brain', '思考权，留给你的 Agent。', '继续使用你选择的模型与上下文。Bridge 负责执行工具调用，不在中间再套一层模型。', 'YOUR MODEL, YOUR CALL'],
      ['desktop', '操作发生在真实桌面。', '连接 Windows 原生应用，获取窗口状态、截图与可用的辅助功能树，再执行点击、输入和滚动。', 'NATIVE WINDOWS RUNTIME'],
      ['eye', '每一步，都有结果可看。', '执行后重新观察应用状态。结构化工具区分输入发送与观察结果，帮助 Agent 决定下一步。', 'OBSERVE → ACT → OBSERVE'],
    ],
    tagline1: '你选择大脑。', tagline2: '我们接上双手。', taglineFoot: '连接能力，而非替换你的 Agent。',
    workflowEyebrow: 'A BRIDGE, NOT ANOTHER BRAIN.', workflowTitle: '链路很短，\n分工很清楚。', workflowBody: '你的模型做决定，MCP 传递调用，已安装的签名运行时操作 Windows。',
    flowAgent: '你的 Agent', flowAgentSub: '规划与工具调用', flowBridge: 'MCP Bridge', flowBridgeSub: '本地 stdio 服务', flowRuntime: 'Windows runtime', flowRuntimeSub: '观察、点击、输入', flowNote: '复用已安装的 OpenAI 签名运行时；项目不打包或分发 OpenAI 二进制文件。',
    installEyebrow: 'CONNECT YOUR AGENT.', installTitle: '准备好，\n让它动手。', installBody: '在本机完成构建，把服务接入你熟悉的 MCP 客户端。',
    steps: [['检查本机环境', 'Windows 10 1809+ 或 Windows 11、Node.js 22+，以及已安装运行时和已登录的 Codex。保持桌面解锁。'], ['构建本地服务', '克隆源码后安装依赖并构建。状态检查只验证发现结果，不代表客户端或桌面任务验收通过。'], ['接入你的客户端', '替换示例绝对路径，合并配置并重启客户端。先观察窗口，再尝试一个无害的小任务。']],
    clone: '克隆与构建', configLabel: '客户端配置', copy: '复制代码', copied: '已复制', copyError: '复制失败，请选中代码后手动复制。',
    configNote: '示例路径 C:\\tools 需要改成你的安装目录；MCP 服务启动参数不要添加 --status。',
    clientNotes: { generic: '适用于 WorkBuddy 等支持 mcpServers 的客户端；以客户端当前配置结构为准。', qoder: '合并到 Qoder 的 mcpServers，保留现有服务配置。', dsh: '此 JSON 片段也可作为 YAML 使用；合并到现有 Cordis 配置，避免重复顶层节点。', claude: '在本机终端执行此命令，替换其中的服务绝对路径。' },
    boundaryTitle: '能力边界，也说清楚。', boundary: '浏览器读取仍受官方运行时的 URL 核验约束；可能出现导航已发出、页面读取被拒绝的情况。原生 browser_tabs 也不代表后台标签页的全量清单。', boundaryLink: '阅读完整限制',
    faqEyebrow: 'BEFORE YOU CONNECT.', faqTitle: '你可能还想知道',
    faq: [
      ['支持哪些操作系统？', '本项目是 Windows 移植版，要求 Windows 10 1809 或更高版本，或 Windows 11。需要真实、可交互且保持解锁的桌面会话。'],
      ['可以继续用我自己的模型吗？', '可以。规划和推理仍由 MCP 客户端使用的模型完成。Bridge 不内置推理模型，也不会在工具调用中嵌套另一层模型。模型费用与条款由你选择的服务决定。'],
      ['必须安装 ChatGPT 或 Codex 吗？', '需要已安装的签名 Computer Use helper 和有效的 Codex 登录状态。ChatGPT Windows 桌面应用可提供运行时；仅安装此开源项目不会下载或附带 OpenAI 运行时。'],
      ['能读取任意浏览器页面吗？', '不能保证。浏览器 URL 核验仍可能拒绝读取；原生窗口路径只能读取暴露的辅助功能信息。Bridge 不通过 CDP、页面抓取或切换后端绕过拒绝。'],
      ['桌面操作如何授权？', '项目提供 auto、mcp、deny 应用授权模式。默认 auto 并非逐步操作审批；建议按使用环境阅读 SECURITY.md、设置允许与拒绝列表，再开始操作。'],
      ['这是 OpenAI 官方产品吗？', '不是。这是基于 codex-computer-use-mcp 的非官方 Windows 移植项目，采用 MIT 许可，与 OpenAI 无隶属关系，也未获其背书。'],
    ],
    finalTitle: '你的 Agent，\n下一步在桌面上。', finalBody: '从一个窗口、一次观察开始。', footerNote: '为 Agent 与真实桌面之间，搭一座桥。', privacy: '隐私说明', terms: '使用说明',
    disclaimer: '非官方独立项目，与 OpenAI 无隶属关系，亦未获其背书。', localVersion: '本地预览版本 0.4.1-preview.1',
    back: '返回首页', legalPrivacyTitle: '隐私说明', legalPrivacy: '本静态页面不接收表单、不接入分析服务，也不运行桌面操作。页面仅在浏览器 localStorage 中保存语言偏好，你可以通过清除站点数据删除它。点击源码链接后，适用目标网站的隐私政策。MCP 桥接器是独立的软件：它返回的截图与辅助功能文本可能包含敏感内容，并会传给你使用的 MCP 客户端；请在安装前阅读仓库中的 Privacy 与 SECURITY.md。',
    legalTermsTitle: '使用说明', legalTerms: '本页面介绍一个非官方 Windows MCP 开源项目，页面中的交互桌面是模拟示意，并非真实执行或验收记录。项目代码采用 MIT 许可；运行时与客户端仍受其各自条款约束。当前页面所列版本为制作时的本地预览版本，不代表该版本已公开发布。安装前核实系统条件、签名运行时和授权策略。不要将页面中的示例路径直接当成你的安装路径。',
    notFoundTitle: '这个窗口，暂时找不到。', notFoundBody: '页面地址可能已变更。回到首页，继续连接你的 Agent。',
  },
  en: {
    metaTitle: 'Computer Use Bridge · Give your agent a way to act',
    metaDescription: 'Connect third party agents to the installed Codex Windows Computer Use runtime through MCP. Keep your model. Reach your desktop.',
    skip: 'Skip to content', overview: 'Overview', features: 'Why Bridge', workflow: 'How it works', setup: 'Get started', faqLabel: 'FAQ', source: 'View source', start: 'Connect your agent', menu: 'Open navigation', close: 'Close navigation',
    version: 'WINDOWS PREVIEW', heroLine1: 'Your agent thinks.', heroLine2: 'Now it can act.',
    heroDescription: 'Give the agent you already use a way to work on your desktop. Connect to Codex Computer Use through MCP, and take the next step beyond chat.',
    heroNote: 'Runs locally · No nested model · MIT licensed', heroLink: 'See how it works',
    demoLabel: 'Interactive illustration, not a live recording', demoTitle: 'From a prompt to an action on your desktop',
    demoTask: 'Open Notepad and write down an idea.', agentLabel: 'YOUR AGENT', agentReply: 'Observe the window. Then find the input area.',
    plan: 'Planning', bridgeLabel: 'MCP BRIDGE', executing: 'Execution', observe: '01 Observe', act: '02 Act', verify: '03 Observe again',
    noteTitle: 'ideas.txt', noteText: 'Write down the idea.\nLet your agent take the next step.', demoBadge: 'Native Windows window', demoCaption: 'Your model reasons. The runtime clicks and types.',
    demoStates: [
      { heading: 'Observe before acting.', detail: 'Read the window state, screenshots, and available accessibility information.', tool: 'observe_window', status: 'Observing window' },
      { heading: 'Put the plan into action.', detail: 'The signed runtime clicks and types on the real foreground desktop.', tool: 'click_element → type_text', status: 'Entering text' },
      { heading: 'Then check what changed.', detail: 'Observe the visible result again. Input sent does not mean the task succeeded.', tool: 'observe_window', status: 'Observing again' },
    ],
    compatible: 'A bridge for agents that speak MCP', compatibleNote: 'Connect through MCP configuration. Each client still needs live validation.',
    featuresEyebrow: 'SAME AGENT. MORE REACH.', featuresTitle: 'Keep your workflow.\nGive it more reach.',
    featureItems: [
      ['brain', 'Your agent keeps the thinking.', 'Use the model and context you already chose. Bridge executes tool calls without adding another model in the middle.', 'YOUR MODEL, YOUR CALL'],
      ['desktop', 'Actions on your real desktop.', 'Observe native Windows apps through window state, screenshots, and available accessibility trees. Then click, type, and scroll.', 'NATIVE WINDOWS RUNTIME'],
      ['eye', 'Observe after every action.', 'Inspect the application again. Structured tools distinguish dispatched input from observation results, so your agent can decide what comes next.', 'OBSERVE → ACT → OBSERVE'],
    ],
    tagline1: 'You choose the brain.', tagline2: 'We connect the hands.', taglineFoot: 'Extend the agent you already work with.',
    workflowEyebrow: 'A BRIDGE, NOT ANOTHER BRAIN.', workflowTitle: 'A short path.\nA clear role for each.', workflowBody: 'Your model decides. MCP carries the call. The installed signed runtime operates Windows.',
    flowAgent: 'Your agent', flowAgentSub: 'Planning & tool calls', flowBridge: 'MCP Bridge', flowBridgeSub: 'Local stdio server', flowRuntime: 'Windows runtime', flowRuntimeSub: 'Observe, click, type', flowNote: 'Uses your installed OpenAI signed runtime. No OpenAI binaries are bundled or redistributed.',
    installEyebrow: 'CONNECT YOUR AGENT.', installTitle: 'Ready to give\nit a way to act?', installBody: 'Build locally, then connect the service to your preferred MCP client.',
    steps: [['Check your environment', 'Windows 10 1809+ or Windows 11, Node.js 22+, an installed runtime, and an authenticated Codex session. Keep the desktop unlocked.'], ['Build the local service', 'Clone the source, install dependencies, and build. The status check verifies discovery only, not a client handshake or a desktop task.'], ['Connect your client', 'Replace the example absolute path, merge the configuration, and restart your client. Observe a window before trying a harmless task.']],
    clone: 'Clone & build', configLabel: 'Client configuration', copy: 'Copy code', copied: 'Copied', copyError: 'Copy failed. Select the code and copy it manually.',
    configNote: 'Replace C:\\tools with your installation path. Do not add --status to MCP startup arguments.',
    clientNotes: { generic: 'For clients such as WorkBuddy that accept mcpServers. Follow the current configuration structure of your client.', qoder: 'Merge into Qoder mcpServers and preserve your existing services.', dsh: 'This JSON fragment is also valid YAML. Merge it into the existing Cordis configuration without duplicate root keys.', claude: 'Run this in a local terminal after replacing the absolute service path.' },
    boundaryTitle: 'Clear about the boundaries, too.', boundary: 'Browser reads remain subject to runtime URL verification. Navigation can be sent while page reading is denied. Native browser_tabs does not provide a complete inventory of background tabs.', boundaryLink: 'Read the full limitations',
    faqEyebrow: 'BEFORE YOU CONNECT.', faqTitle: 'A few things to know',
    faq: [
      ['Which operating systems are supported?', 'This is a Windows port for Windows 10 version 1809 or newer, or Windows 11. It needs a real, interactive, unlocked desktop session.'],
      ['Can I keep using my own model?', 'Yes. Your MCP client and its model still handle planning and reasoning. Bridge does not include a reasoning model or nest another model inside tool calls. Your chosen model service determines its own costs and terms.'],
      ['Do I need ChatGPT or Codex installed?', 'You need the installed signed Computer Use helper and valid Codex authentication. ChatGPT desktop for Windows can provide the runtime. Installing this project alone does not download or bundle the OpenAI runtime.'],
      ['Can it read any browser page?', 'That is not guaranteed. Browser URL verification may deny reads. The native route reads only exposed accessibility information. Bridge does not bypass a denial using CDP, page fetching, or another backend.'],
      ['How are desktop actions authorized?', 'The project offers auto, mcp, and deny application approval modes. The default auto mode is not approval for each action. Read SECURITY.md and configure the app allow and deny lists for your environment.'],
      ['Is this an official OpenAI product?', 'No. This is an unofficial Windows port of codex-computer-use-mcp under the MIT license. It is not affiliated with or endorsed by OpenAI.'],
    ],
    finalTitle: 'Your agent’s next step.\nOn your desktop.', finalBody: 'Start with one window and one observation.', footerNote: 'A bridge between your agent and your real desktop.', privacy: 'Privacy', terms: 'Usage notes',
    disclaimer: 'An independent, unofficial project. Not affiliated with or endorsed by OpenAI.', localVersion: 'Local preview 0.4.1-preview.1',
    back: 'Back to home', legalPrivacyTitle: 'Privacy', legalPrivacy: 'This static site has no forms, analytics service, or desktop control. It stores only your language preference in browser localStorage, which you can remove by clearing site data. External source links are subject to the destination site’s privacy policy. The MCP bridge is separate software: screenshots and accessibility text may contain sensitive information and are returned to your MCP client. Read the repository Privacy section and SECURITY.md before installing.',
    legalTermsTitle: 'Usage notes', legalTerms: 'This page introduces an unofficial open source Windows MCP project. The interactive desktop is an illustration, not real execution or acceptance evidence. The project uses the MIT license; the runtime and client are subject to their respective terms. The version shown is a local preview at page creation time and does not establish public availability. Verify requirements, the signed runtime, and approval policy before installation. Replace all example installation paths.',
    notFoundTitle: 'This window is missing.', notFoundBody: 'The page may have moved. Head home and keep connecting your agent.',
  },
};
