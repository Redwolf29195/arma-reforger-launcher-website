import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const navigationCode = source.slice(source.indexOf('const sectionLinks ='), source.indexOf('function formatBytes('));

function navigationFixture({ y = 0, height = 768, reducedMotion = false } = {}) {
  const ids = ['top', 'product', 'workflow', 'features', 'download'];
  const offsets = [0, 900, 2500, 3300, 4400];
  const links = ids.map(id => ({
    dataset: { sectionLink: id }, active: id === 'top', attributes: {},
    classList: { toggle(_name, active) { links[ids.indexOf(id)].active = active; } },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  }));
  const listeners = new Map();
  let frames = [];
  const window = {
    scrollY: y, innerHeight: height,
    addEventListener(name, callback) { listeners.set(name, callback); },
    requestAnimationFrame(callback) { frames.push(callback); }
  };
  const sections = ids.map((id, index) => ({ id, getBoundingClientRect() { return { top: offsets[index] - window.scrollY }; } }));
  vm.runInNewContext(navigationCode, {
    window,
    document: { documentElement: { scrollHeight: 4550, style: { setProperty() {} } } },
    header: { classList: { toggle() {} }, getBoundingClientRect() { return { bottom: window.scrollY > 24 ? 66 : 76 }; } },
    reducedMotion: { matches: reducedMotion },
    $$: selector => selector === '[data-section-link]' ? links : sections
  });
  const active = () => {
    assert.equal(links.filter(link => link.active).length, 1);
    assert.equal(links.filter(link => link.attributes['aria-current'] === 'location').length, 1);
    return links.find(link => link.active).dataset.sectionLink;
  };
  const flush = () => { const pending = frames; frames = []; pending.forEach(callback => callback()); };
  return { window, offsets, active, flush, dispatch: name => listeners.get(name)?.(), queued: () => frames.length };
}

test('dots follow normal scrolling, skipped sections and reverse scrolling', () => {
  const nav = navigationFixture();
  assert.equal(nav.active(), 'top');
  for (const [y, expected] of [[900, 'product'], [2500, 'workflow'], [3300, 'features'], [4550 - 768, 'download'], [900, 'product'], [0, 'top']]) {
    nav.window.scrollY = y;
    nav.dispatch('scroll'); nav.flush();
    assert.equal(nav.active(), expected);
  }
});

test('the final dot is selected at page bottom even for a short final section', () => {
  const nav = navigationFixture({ y: 4550 - 768 });
  assert.equal(nav.active(), 'download');
});

test('initial deep links and restored positions do not depend on observer callbacks', () => {
  const nav = navigationFixture({ y: 2600 });
  assert.equal(nav.active(), 'workflow');
  nav.window.scrollY = 3400;
  nav.dispatch('pageshow'); nav.flush();
  assert.equal(nav.active(), 'features');
});

test('layout changes and rapid scroll events are handled in one animation frame', () => {
  const nav = navigationFixture({ y: 2400 });
  assert.equal(nav.active(), 'workflow');
  nav.offsets[2] = 2800;
  nav.dispatch('resize'); nav.dispatch('scroll'); nav.dispatch('scroll');
  assert.equal(nav.queued(), 1);
  nav.flush();
  assert.equal(nav.active(), 'product');
});

test('reduced motion keeps section highlighting enabled', () => {
  const nav = navigationFixture({ reducedMotion: true });
  nav.window.scrollY = 3300;
  nav.dispatch('scroll'); nav.flush();
  assert.equal(nav.active(), 'features');
});
