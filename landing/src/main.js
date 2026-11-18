import { messages, resolveLocale, configFor, repository } from './content.js';

const app = document.querySelector('#app');
let saved;
try { saved = localStorage.getItem('bridge-language'); } catch { /* Storage is optional. */ }
let locale = resolveLocale(new URLSearchParams(location.search).get('lang') || saved);
let client = 'generic';
let stage = 0;
let revealObserver;
let wordObserver;
let sectionObserver;
const icon = (name, extra = '') => `<img class="icon ${extra}" src="./icons/${name}.svg" width="20" height="20" alt="" aria-hidden="true">`;
const br = (text) => text.replaceAll('\n', '<br>');
const arrow = () => icon('arrow-up-right');
const primary = (t) => `<a class="button button-primary button-md" href="#setup">${t.start}${icon('arrow-right')}</a>`;
const brand = `<a class="brand title-3" href="./" aria-label="Computer Use Bridge"><span class="brand-mark" aria-hidden="true">${icon('code')}</span><span>Computer Use<span class="brand-light"> Bridge</span></span></a>`;
const sourceLink = (t, cls = '') => `<a class="source-link ${cls}" href="${repository}" target="_blank" rel="noopener noreferrer">${t.source}${arrow()}</a>`;

function header(t, isHome) {
  return `<a class="skip-link button-md" href="#main">${t.skip}</a>
    <header class="site-header">
      ${brand}
      <div class="nav-slot"><nav id="primary-nav" aria-label="${locale === 'zh' ? '主导航' : 'Primary'}" class="primary-nav title-4">
        <a href="${isHome ? '#features' : './#features'}">${t.features}</a>
        <a href="${isHome ? '#workflow' : './#workflow'}">${t.workflow}</a>
        <a href="${isHome ? '#setup' : './#setup'}">${t.setup}</a>
      </nav></div>
      <div class="header-actions">
        <button id="language-toggle" class="language-button button-sm" type="button" aria-label="${locale === 'zh' ? 'Switch to English' : '切换为中文'}">${icon('globe')}<span>${locale === 'zh' ? 'EN' : '中文'}</span></button>
        ${sourceLink(t, 'header-source button-sm')}
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="${t.menu}" aria-controls="mobile-menu" aria-expanded="false">${icon('list')}</button>
      </div>
    </header>
    <dialog id="mobile-menu" class="mobile-menu"><div class="mobile-menu-top">${brand}<button id="menu-close" class="icon-button" aria-label="${t.close}">${icon('x')}</button></div><div id="mobile-nav-slot"></div>${sourceLink(t, 'title-2')}</dialog>`;
}

function footer(t) {
  return `<footer class="footer wrap"><div class="footer-top"><div>${brand}<p class="body-6 muted">${t.footerNote}</p></div><div class="footer-links title-4">${sourceLink(t)}<a href="./privacy.html?lang=${locale}">${t.privacy}</a><a href="./terms.html?lang=${locale}">${t.terms}</a></div></div><div class="footer-bottom caption-5"><span>${t.disclaimer}</span><span>${t.localVersion}</span></div></footer>`;
}

function illustration(t) {
  return `<div class="demo-shell wrap" aria-label="${t.demoTitle}">
    <div class="demo-topline caption-4"><span><span class="small-square"></span> AGENT TO DESKTOP</span><span>${t.demoLabel}</span></div>
    <div class="demo-scene">
      <div class="agent-window">
        <div class="mini-window-top caption-4"><span class="mini-mark">${icon('brain')}</span>${t.agentLabel}<span class="window-dot"></span></div>
        <div class="agent-chat"><div class="chat-prompt body-6">${t.demoTask}</div><div class="agent-reply body-6">${icon('lightning')}<span>${t.agentReply}</span></div></div>
        <div class="tool-call"><div class="caption-3"><span class="status-dot"></span><span id="demo-status">${t.demoStates[stage].status}</span></div><code id="demo-tool">${t.demoStates[stage].tool}</code></div>
        <div class="agent-status caption-5">${icon('brain')} ${t.plan}<span>● ● ●</span></div>
      </div>
      <div class="bridge-wire" aria-hidden="true"><div></div><span>${icon('code')}</span><div></div></div>
      <div class="desktop-scene" data-stage="${stage}">
        <div class="desktop-bar caption-5"><span class="window-squares" aria-hidden="true"><b></b><b></b><b></b><b></b></span><span>Windows</span><span class="desktop-bar-end">${icon('shield-check')} SIGNED RUNTIME</span></div>
        <div class="notepad-window"><div class="notepad-tabs caption-4">${icon('file-text')}<span>${t.noteTitle}</span><span class="notepad-plus" aria-hidden="true">+</span><span class="window-controls" aria-hidden="true">− &nbsp; □ &nbsp; ×</span></div><div class="notepad-toolbar caption-5">File &nbsp;&nbsp; Edit &nbsp;&nbsp; View <span> Aa &nbsp;&nbsp; ⚙</span></div><div class="notepad-content title-3"><span class="note-line">${br(t.noteText)}</span><span class="text-caret" aria-hidden="true"></span></div><div class="notepad-bottom caption-5"><span>Ln 2, Col 1</span><span>UTF-8</span></div></div>
        <span class="demo-cursor" aria-hidden="true">${icon('cursor')}<span class="caption-3">Computer Use</span></span>
        <div class="desktop-badge caption-4">${icon('check-circle')} ${t.demoBadge}</div>
      </div>
    </div>
    <div class="demo-bottom"><div class="demo-tabs" role="group" aria-label="${t.demoTitle}">${[t.observe, t.act, t.verify].map((s, i) => `<button type="button" class="demo-tab button-sm ${stage === i ? 'selected' : ''}" data-stage-button="${i}" aria-pressed="${stage === i}">${s}</button>`).join('')}</div><p class="caption-2 muted" id="demo-caption">${t.demoStates[stage].heading}</p></div>
    <div class="demo-detail caption-2 muted" id="demo-detail" aria-live="polite">${t.demoStates[stage].detail}</div>
  </div>`;
}

function install(t) {
  return `<section class="install-section wrap" id="setup" aria-labelledby="install-title">
    <div class="section-heading reveal"><p class="eyebrow caption-3">${t.installEyebrow}</p><h2 id="install-title" class="heading-2">${br(t.installTitle)}</h2><p class="body-3 muted">${t.installBody}</p></div>
    <div class="install-layout"><ol class="install-steps">${t.steps.map(([title, body], i) => `<li><span class="step-number caption-3">0${i + 1}</span><div><h3 class="title-2">${title}</h3><p class="body-6 muted">${body}</p></div></li>`).join('')}</ol>
    <div class="code-stack"><div class="code-panel"><div class="code-header caption-4"><span>${icon('terminal-window')}${t.clone}</span><button type="button" data-copy="build" class="copy-button button-xsm" aria-label="${t.copy}: ${t.clone}">${icon('copy')}<span>${t.copy}</span></button></div><pre tabindex="0"><code id="build-code"></code></pre></div>
    <div class="code-panel"><div class="code-header caption-4"><label for="client-select">${t.configLabel}</label><select class="client-select title-4" id="client-select"><option value="generic">WorkBuddy / MCP</option><option value="qoder">Qoder</option><option value="dsh">DSH</option><option value="claude">Claude Code</option></select></div><div class="config-toolbar caption-5"><span id="config-format">JSON</span><button type="button" data-copy="config" class="copy-button button-xsm" aria-label="${t.copy}: ${t.configLabel}">${icon('copy')}<span>${t.copy}</span></button></div><pre class="config-code" tabindex="0"><code id="config-code"></code></pre><p class="config-note caption-2" id="client-note"></p></div><p class="path-note caption-2 muted">${icon('warning-circle')}<span>${t.configNote}</span></p><p id="copy-status" class="copy-status caption-2" role="status" aria-live="polite"></p></div></div>
  </section>`;
}

function home(t) {
  return `${header(t, true)}<main id="main">
    <section class="hero wrap" id="overview" aria-labelledby="hero-title"><a class="preview-badge caption-3" href="#boundary"><span class="status-dot"></span>${t.version}<span class="badge-divider"></span>0.4.1${arrow()}</a><h1 class="heading-1" id="hero-title"><span>${t.heroLine1}</span><span>${t.heroLine2}</span></h1><p class="hero-description body-3">${t.heroDescription}</p><div class="hero-actions">${primary(t)}<a class="text-link title-4" href="#workflow">${t.heroLink}${icon('arrow-down')}</a></div><p class="hero-note caption-2">${icon('check')}${t.heroNote}</p></section>
    ${illustration(t)}
    <section class="compatibility wrap"><p class="caption-2 muted">${t.compatible}</p><div class="client-names" aria-label="MCP clients"><span class="title-1">Qoder<span class="client-symbol">↗</span></span><span class="title-1">WorkBuddy</span><span class="title-1">DSH<span class="client-symbol">_</span></span><span class="title-1">Claude Code</span><span class="title-1">Any MCP client<span class="client-symbol">+</span></span></div><p class="caption-5 muted">${t.compatibleNote}</p></section>
    <section class="features-section wrap" id="features" aria-labelledby="features-title"><div class="section-heading reveal"><p class="eyebrow caption-3">${t.featuresEyebrow}</p><h2 class="heading-2" id="features-title">${br(t.featuresTitle)}</h2></div><div class="feature-grid">${t.featureItems.map(([glyph, title, body, tag], i) => `<article class="feature-item reveal"><div class="feature-top">${icon(glyph)}<span class="caption-5">0${i + 1}</span></div><h3 class="heading-6">${title}</h3><p class="body-6 muted">${body}</p><span class="feature-tag caption-5">${tag}</span></article>`).join('')}</div></section>
    <section class="tagline-section"><div class="wrap"><p class="eyebrow caption-3">THINK HERE. ACT THERE.</p><p class="tagline heading-1" aria-label="${t.tagline1} ${t.tagline2}"><span class="tagline-word">${t.tagline1}</span><br><span class="tagline-word">${t.tagline2}</span></p><p class="body-3 muted">${t.taglineFoot}</p><span class="tagline-glyph" aria-hidden="true">${icon('arrow-elbow-down-right')}</span></div></section>
    <section class="workflow-section wrap" id="workflow" aria-labelledby="workflow-title"><div class="workflow-heading reveal"><div><p class="eyebrow caption-3">${t.workflowEyebrow}</p><h2 class="heading-2" id="workflow-title">${br(t.workflowTitle)}</h2></div><p class="body-3 muted">${t.workflowBody}</p></div><div class="flow-diagram reveal">${[['brain', t.flowAgent, t.flowAgentSub], ['code', t.flowBridge, t.flowBridgeSub], ['desktop', t.flowRuntime, t.flowRuntimeSub]].map(([glyph, title, sub], i) => `${i ? `<span class="flow-arrow" aria-hidden="true">${icon('arrow-right')}</span>` : ''}<div class="flow-node ${i === 1 ? 'flow-node-accent' : ''}">${icon(glyph)}<h3 class="title-2">${title}</h3><p class="caption-2">${sub}</p></div>`).join('')}</div><p class="workflow-foot caption-2 muted">${icon('shield-check')}${t.flowNote}</p></section>
    ${install(t)}
    <aside class="boundary wrap" id="boundary"><div class="boundary-icon">${icon('warning-circle')}</div><div><h2 class="title-2">${t.boundaryTitle}</h2><p class="body-6">${t.boundary}</p><a class="text-link title-4" href="${repository}/tree/main/codex-computer-use-mcp-win#tools" target="_blank" rel="noopener noreferrer">${t.boundaryLink}${arrow()}</a></div></aside>
    <section class="faq-section wrap" id="faq" aria-labelledby="faq-title"><div class="section-heading"><p class="eyebrow caption-3">${t.faqEyebrow}</p><h2 class="heading-3" id="faq-title">${t.faqTitle}</h2></div><div class="faq-list">${t.faq.map(([q, a]) => `<details><summary class="title-3">${q}${icon('plus')}</summary><p class="body-6 muted">${a}</p></details>`).join('')}</div></section>
    <section class="final-section"><div class="wrap"><span class="brand-mark large-mark" aria-hidden="true">${icon('code')}</span><h2 class="heading-2">${br(t.finalTitle)}</h2><p class="body-3 muted">${t.finalBody}</p>${primary(t)}</div></section>
  </main>${footer(t)}`;
}

function render() {
  revealObserver?.disconnect();
  wordObserver?.disconnect();
  sectionObserver?.disconnect();
  const t = messages[locale];
  const page = document.body.dataset.page;
  const isHome = !page;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = isHome ? t.metaTitle : `${t[page === 'privacy' ? 'legalPrivacyTitle' : page === 'terms' ? 'legalTermsTitle' : 'notFoundTitle']} · Computer Use Bridge`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.metaDescription);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.metaDescription);
  if (isHome) app.innerHTML = home(t);
  else {
    const title = page === 'privacy' ? t.legalPrivacyTitle : page === 'terms' ? t.legalTermsTitle : t.notFoundTitle;
    const body = page === 'privacy' ? t.legalPrivacy : page === 'terms' ? t.legalTerms : t.notFoundBody;
    app.innerHTML = `${header(t, false)}<main id="main" class="legal-page wrap"><p class="eyebrow caption-3">${page === '404' ? '404 · WINDOW NOT FOUND' : 'COMPUTER USE BRIDGE'}</p><h1 class="heading-2">${title}</h1><p class="body-3 muted">${body}</p><a href="./?lang=${locale}" class="button button-primary button-md">${icon('arrow-right')} ${t.back}</a></main>${footer(t)}`;
  }
  document.querySelector('#language-toggle').addEventListener('click', () => {
    locale = locale === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('bridge-language', locale); } catch { /* No persistence in restricted contexts. */ }
    const url = new URL(location.href); url.searchParams.set('lang', locale); history.replaceState(null, '', url);
    render();
    document.querySelector('#language-toggle').focus({ preventScroll: true });
  });
  bindMenu();
  if (isHome) {
    setConfig();
    document.querySelector('#build-code').textContent = `git clone ${repository}.git\ncd computer-use-bridge-landing\\codex-computer-use-mcp-win\nnpm ci\nnpm run build\nnode dist\\mcp-server.js --status`;
    document.querySelectorAll('[data-stage-button]').forEach(button => button.addEventListener('click', () => setStage(Number(button.dataset.stageButton))));
    document.querySelector('#client-select').value = client;
    document.querySelector('#client-select').addEventListener('change', event => { client = event.target.value; setConfig(); });
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyCode(button)));
    bindReveals();
    if ('IntersectionObserver' in window) {
      sectionObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.querySelectorAll('#primary-nav a').forEach(link => {
            if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          });
        }
      }), { rootMargin: '-10% 0px -55% 0px', threshold: 0 });
      for (const id of ['features', 'workflow', 'setup']) sectionObserver.observe(document.getElementById(id));
    }
  }
}

function setStage(value) {
  stage = value;
  const state = messages[locale].demoStates[stage];
  document.querySelector('.desktop-scene').dataset.stage = stage;
  for (const [selector, text] of [['#demo-status', state.status], ['#demo-tool', state.tool], ['#demo-caption', state.heading], ['#demo-detail', state.detail]]) document.querySelector(selector).textContent = text;
  document.querySelectorAll('[data-stage-button]').forEach(button => { const selected = Number(button.dataset.stageButton) === stage; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
}

function setConfig() {
  document.querySelector('#config-code').textContent = configFor(client);
  document.querySelector('#client-note').textContent = messages[locale].clientNotes[client];
  document.querySelector('#config-format').textContent = client === 'claude' ? 'PowerShell' : client === 'dsh' ? 'JSON / YAML' : 'JSON';
}

async function copyCode(button) {
  const t = messages[locale];
  const code = document.querySelector(button.dataset.copy === 'build' ? '#build-code' : '#config-code').textContent;
  button.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(code);
    button.querySelector('span').textContent = t.copied;
    document.querySelector('#copy-status').textContent = t.copied;
  } catch {
    document.querySelector('#copy-status').textContent = t.copyError;
  } finally {
    button.disabled = false;
    setTimeout(() => { if (button.isConnected) button.querySelector('span').textContent = messages[locale].copy; }, 2500);
  }
}

function bindMenu() {
  const dialog = document.querySelector('#mobile-menu');
  const button = document.querySelector('#menu-toggle');
  const nav = document.querySelector('#primary-nav');
  const restore = () => { document.querySelector('.nav-slot').append(nav); button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => {
    document.querySelector('#mobile-nav-slot').append(nav);
    button.setAttribute('aria-expanded', 'true');
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  const close = () => { if (dialog.close) dialog.close(); else { dialog.removeAttribute('open'); restore(); button.focus(); } };
  document.querySelector('#menu-close').addEventListener('click', close);
  dialog.addEventListener('close', restore);
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { if (dialog.open) close(); }));
}

function bindReveals() {
  revealObserver?.disconnect();
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const words = document.querySelectorAll('.tagline-word');
  // Segment Chinese by phrase and English by word, preserving meaningful reading order.
  words.forEach(line => {
    const parts = locale === 'zh' ? line.textContent.match(/.{1,2}/gu) : line.textContent.split(/(\s+)/);
    line.replaceChildren(...parts.map(part => { const span = document.createElement('span'); span.textContent = part; span.className = 'reveal-word'; return span; }));
  });
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(element => { element.classList.add('will-reveal'); revealObserver.observe(element); });
  wordObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); wordObserver.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -18% 0px', threshold: 0.5 });
  document.querySelectorAll('.reveal-word').forEach((word, index) => { word.style.setProperty('--word-index', index); wordObserver.observe(word); });
}

render();
