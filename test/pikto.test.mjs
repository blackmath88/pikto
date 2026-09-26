// Offline end-to-end tests: every command runs through the CLI against local @iconify-json/* sets and an empty cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin', 'pikto.mjs');
const repo = path.join(here, 'fixtures', 'glyph-repo');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pikto-test-'));
const run = (...a) => JSON.parse(execFileSync('node', [bin, ...a, '--offline'], { env: { ...process.env, PIKTO_CACHE: path.join(tmp, 'cache') }, encoding: 'utf8' }));
const prof = path.join(tmp, 'profile.json');
fs.writeFileSync(prof, JSON.stringify(run('profile', repo)));

test('audit: DESIGN.md intent and one meaning drawn with two glyphs', () => {
  const a = run('audit', repo);
  assert.deepEqual(a.intent.stroke_px, [1, 1.5]);
  assert.equal(a.intent.glyph_px, 18);
  assert.ok(a.issues.some((i) => i.startsWith('"available" is drawn as')));
});

test('profile: a repo without icons falls back to DESIGN.md instead of grid 0', () => {
  const p = JSON.parse(fs.readFileSync(prof, 'utf8')).icon_system;
  assert.equal(p.grid, 24);
  assert.equal(p.render_px, 18);
  assert.deepEqual(p.stroke_range, [1.333, 2]);
  assert.equal(p.construction.dominant, null);
});

test('search: offline, from local sets', () => {
  const r = run('search', 'check circle', '--profile', prof);
  assert.ok(r.some((c) => c.id === 'ph:check-circle'));
});

test('adapt: source stroke kept within the DESIGN.md range, validates', () => {
  const a = run('adapt', 'lucide:search', '--profile', prof);
  assert.ok(a.validation.ok, a.validation.issues.join());
  assert.match(a.fragment, /stroke-width="2"/);
});

test('validate: rejects hard-coded colour and scripts', () => {
  const f = path.join(tmp, 'bad.svg');
  fs.writeFileSync(f, '<svg viewBox="0 0 24 24"><path fill="#f00" d="M2 2h20v20H2z"/><script/></svg>');
  const v = run('validate', f, '--profile', prof);
  assert.equal(v.ok, false);
  assert.ok(v.issues.includes('hard-coded colour'));
  assert.ok(v.issues.includes('forbidden element'));
});

test('sheet: optical stroke, family frame, missing icons, tokens', () => {
  const out = path.join(tmp, 'sheet.html');
  const r = run('sheet', repo, '--profile', prof, '--proposal', path.join(here, 'fixtures', 'proposal.json'), '--out', out);
  const [rail, status] = r.roles;
  const [ph, lucide, missing] = rail.items[0].candidates;
  assert.ok(Math.abs(ph.stroke_px - 1.125) < 0.1, `phosphor 16/256 at 18px, got ${ph.stroke_px}`);
  assert.ok(Math.abs(lucide.stroke_px - 1.5) < 0.1, `lucide 2/24 at 18px, got ${lucide.stroke_px}`);
  assert.equal(missing.ok, undefined);
  assert.ok(r.failed.some((f) => f.id === 'ph:does-not-exist'));
  // shared circle is intended: members are compared by their marks, so check vs x is not "confusable"
  const byMeaning = Object.fromEntries(status.items.map((i) => [i.meaning, i.candidates[0]]));
  assert.ok(byMeaning.confirmed.family.shared_frame > 0.5);
  assert.ok(!byMeaning.confirmed.notes.some((n) => n.includes('confusable')));
  assert.ok(byMeaning.available.notes.some((n) => n.startsWith('weight')), 'dashed circle is visibly lighter');
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /color:#8a5f2d/, 'var() with fallback resolved from repo CSS');
  assert.doesNotMatch(html, /<script/);
});
