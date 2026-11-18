import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, configFor, messages } from '../src/content.js';

test('language preference survives reload and invalid values fall back to Chinese', () => {
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(resolveLocale('zh'), 'zh');
  assert.equal(resolveLocale(null), 'zh');
  assert.equal(resolveLocale('script'), 'zh');
});

test('each translated surface has matching keys and FAQ coverage', () => {
  assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages.en).sort());
  assert.equal(messages.zh.faq.length, 6);
  assert.equal(messages.en.faq.length, 6);
  for (const locale of ['zh', 'en']) {
    assert.ok(messages[locale].boundary.includes('URL'));
    assert.ok(messages[locale].disclaimer.includes('OpenAI'));
  }
});

test('MCP config starts the service with a pinned absolute path, never status mode', () => {
  for (const client of ['generic', 'qoder', 'dsh']) {
    const config = JSON.parse(configFor(client));
    const service = config.mcpServers['codex-computer-use-win'];
    assert.equal(service.command, 'node');
    assert.equal(service.args.length, 1);
    assert.match(service.args[0], /^C:\\tools\\.*\\dist\\mcp-server\.js$/);
    assert.ok(!service.args.includes('--status'));
  }
});

test('Claude config quotes Windows paths and unsupported clients are rejected', () => {
  assert.match(configFor('claude'), /^claude mcp add/);
  assert.match(configFor('claude'), /"C:\\tools\\/);
  assert.throws(() => configFor('unknown'), /Unknown client/);
});
