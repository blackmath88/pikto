#!/usr/bin/env node
// pikto — thin vertical slice.
// repo -> visual profile -> search (Iconify) -> rank -> adapt -> validate -> add to project (with provenance).
// Deterministic only. The calling agent (LLM) decides WHERE an icon is needed and WHICH concept/candidate to use.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import svgpath from 'svgpath';
import { optimize } from 'svgo';
import { Resvg } from '@resvg/resvg-js';

const API = 'https://api.iconify.design';
const PERMISSIVE = new Set(['MIT', 'ISC', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'OFL-1.1', 'BSD-3-Clause', 'Unlicense']);
const ATTRIBUTION = new Set(['CC-BY-4.0', 'CC-BY-3.0']);
const FAMILY_HINTS = [
  [/phosphoricons|@phosphor-icons|phosphor/i, 'ph'], [/lucide/i, 'lucide'], [/heroicons/i, 'heroicons'],
  [/tabler/i, 'tabler'], [/feather/i, 'feather'], [/material-symbols/i, 'material-symbols'],
  [/remixicon/i, 'ri'], [/iconoir/i, 'iconoir'], [/fontawesome|font-awesome/i, 'fa6-solid'],
];
const SHAPES = ['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.astro', 'coverage']);
const CODE = /\.(svg|astro|vue|svelte|jsx?|tsx?|mjs|html)$/;

// ---------- helpers ----------
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mode = (a) => { const c = {}; a.forEach((v) => (c[v] = (c[v] || 0) + 1)); return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null; };
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const elements = (body) => [...body.matchAll(/<(\w+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].map((m) => ({ name: m[1], a: attrs(m[2]) }));
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : CODE.test(e.name) && out.push(p);
  }
  return out;
}
const args = process.argv.slice(2);

// ---------- icon source: local @iconify-json/* packages → disk cache → Iconify API ----------
// Local sets are versioned by the lockfile, so they are the deterministic path (CI, --offline).
const OFFLINE = args.includes('--offline') || process.env.PIKTO_OFFLINE === '1';
const CACHE = process.env.PIKTO_CACHE || path.join(os.homedir(), '.cache', 'pikto');
const PIKTO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const localSets = new Map();
function localSetDirs() {
  const dirs = new Map();
  for (const start of [process.cwd(), PIKTO_ROOT]) for (let d = path.resolve(start); ; d = path.dirname(d)) {
    const base = path.join(d, 'node_modules', '@iconify-json');
    if (fs.existsSync(base)) for (const p of fs.readdirSync(base)) if (!dirs.has(p) && fs.existsSync(path.join(base, p, 'icons.json'))) dirs.set(p, path.join(base, p));
    if (d === path.dirname(d)) break;
  }
  return dirs;
}
function localSet(prefix) {
  if (!localSets.has(prefix)) {
    const dir = localSetDirs().get(prefix);
    localSets.set(prefix, dir ? { ...JSON.parse(fs.readFileSync(path.join(dir, 'icons.json'), 'utf8')), info: JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')), pkgVersion: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } : null);
  }
  return localSets.get(prefix);
}
async function getJSON(url) {
  const f = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  if (OFFLINE) throw new Error(`offline and not cached: ${url} (install @iconify-json/<prefix>)`);
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  const j = await r.json();
  fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(j));
  return j;
}
// resolve plain aliases (no rotate/flip transforms) to their parent icon
function pickIcons(set, names) {
  const icons = {};
  for (const n of names) {
    let k = n, hops = 0;
    while (!set.icons[k] && set.aliases?.[k] && hops++ < 5) { const al = set.aliases[k]; if (al.rotate || al.hFlip || al.vFlip) break; k = al.parent; }
    if (set.icons[k]) icons[n] = set.icons[k];
  }
  return { icons, height: set.height, width: set.width };
}
async function iconData(prefix, names) {
  const loc = localSet(prefix);
  return loc ? pickIcons(loc, names) : getJSON(`${API}/${prefix}.json?icons=${names.join(',')}`);
}
async function collections(prefixes) {
  const res = {}, remote = [];
  for (const p of prefixes) { const l = localSet(p); if (l) res[p] = { ...l.info, version: l.info.version ?? l.pkgVersion, height: l.height ?? l.info.height, source: `@iconify-json/${p}@${l.pkgVersion}` }; else remote.push(p); }
  if (remote.length) try { Object.assign(res, await getJSON(`${API}/collections?prefixes=${remote.join(',')}`)); } catch (e) { if (!OFFLINE) throw e; }
  return res;
}
async function searchIds(query, prefixes, limit) {
  const local = [...localSetDirs().keys()].filter((p) => !prefixes || prefixes.includes(p));
  if (OFFLINE || (prefixes && prefixes.every((p) => local.includes(p)))) {
    const q = query.toLowerCase().trim().replace(/\s+/g, '-'), toks = q.split('-');
    const hits = [];
    for (const p of local) { const s = localSet(p);
      for (const n of [...Object.keys(s.icons), ...Object.keys(s.aliases ?? {})]) {
        const parts = n.split('-');
        const rank = n === q ? 0 : parts.slice(0, toks.length).join('-') === q ? 1 : toks.every((t) => parts.includes(t)) ? 2 : n.includes(q) ? 3 : -1;
        if (rank >= 0) hits.push([rank, n.length, `${p}:${n}`]);
      } }
    return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map((h) => h[2]);
  }
  return (await getJSON(`${API}/search?query=${encodeURIComponent(query)}&limit=${limit}${prefixes ? `&prefixes=${prefixes.join(',')}` : ''}`)).icons;
}
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = (o) => console.log(JSON.stringify(o, null, 2));

// ---------- profile ----------
function profile(repo) {
  const files = walk(repo);
  const strokeWidths = [], caps = [], joins = [], construction = [], grids = [], sizes = [], families = new Set();
  let registry = null, component = null;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(repo, f);
    for (const [re, prefix] of FAMILY_HINTS) if (re.test(src) && /icon/i.test(src)) families.add(prefix);
    // registry: an object map of many SVG fragments (e.g. IconPaths.ts)
    const frags = [...src.matchAll(/['"]?([\w-]+)['"]?\s*:\s*`(\s*<(?:path|circle|rect|g|line|polyline|polygon|ellipse)[\s\S]*?)`/g)];
    const ownModule = frags.length && /^\/\/ Generated by pikto apply/m.test(src); // apply's module is a registry at any size
    if ((frags.length >= 5 || ownModule) && (!registry || ownModule || frags.length > registry.count)) {
      const exportName = src.match(/(?:export\s+)?const (\w+)\s*=\s*{/)?.[1]; // the map need not be exported (apply's PATHS is not)
      registry = { file: rel, export: exportName, count: frags.length, names: frags.map((m) => m[1]) };
    }
    const vb = [...src.matchAll(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/g)];
    vb.forEach((m) => grids.push(+m[1]));
    if (/set:html|innerHTML|dangerouslySetInnerHTML/.test(src) && vb.length && /icon/i.test(rel)) component = { file: rel, grid: +vb[0][1] };
    if (!component && /^icon\.\w+$/i.test(path.basename(f)) && vb.length >= 3) component = { file: rel, grid: Number(mode(vb.map((m) => m[1]))), pattern: 'inline-svg-switch', svg_count: vb.length };
    for (const m of src.matchAll(/<Icon\b[^>]*size="([^"]+)"/g)) sizes.push(m[1]);
    const bodies = frags.length ? frags.map((m) => m[2]) : [...src.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);
    for (const b of bodies) for (const el of elements(b)) {
      if (!SHAPES.includes(el.name)) continue;
      const a = el.a;
      if (a['stroke-width']) strokeWidths.push(+a['stroke-width']);
      if (a['stroke-linecap']) caps.push(a['stroke-linecap']);
      if (a['stroke-linejoin']) joins.push(a['stroke-linejoin']);
      construction.push(a.fill === 'none' || a['stroke-width'] ? 'stroke' : 'fill');
    }
  }
  // an imported library is the convention when the repo has no registry of its own: its grammar is the family's
  const libs = libraryUses(repo).sort((a, b) => Object.values(b.components).reduce((s, c) => s + c.uses, 0) - Object.values(a.components).reduce((s, c) => s + c.uses, 0));
  const lib = !registry && !component && libs[0] ? { ...libs[0], spec: libSpec(libs[0].package) } : null;
  if (lib) {
    families.add(lib.prefix);
    const sws = Object.entries(lib.stroke_widths).sort((a, b) => b[1] - a[1]);
    const sw0 = sws.length ? +sws[0][0] : lib.spec.stroke;
    if (sw0) { strokeWidths.length = 0; strokeWidths.push(sw0); caps.push(lib.spec.cap); joins.push(lib.spec.join); }
    construction.push(lib.spec.stroke ? 'stroke' : 'fill');
    grids.length = 0; grids.push(lib.spec.grid);
    for (const [sz, n] of Object.entries(lib.sizes)) for (let k = 0; k < n; k++) sizes.push(sz);
  }
  // no icons in the repo yet: the grid is a free choice (24); stroke and size come from DESIGN.md intent
  const intent = readIntent(repo);
  const grid = component?.grid ?? (grids.length ? Number(mode(grids)) : 24);
  const render = intent.glyph_px ?? null;
  const gridConsistency = grids.length ? +(grids.filter((g) => g === grid).length / grids.length).toFixed(2) : null;
  const sw = median(strokeWidths);
  const nStroke = construction.filter((c) => c === 'stroke').length;
  // design tokens (CSS custom properties) — context for the agent, not used for geometry
  const css = files.concat(walk(repo).filter((f) => f.endsWith('.css'))).filter((f) => /\.css$/.test(f));
  const tokens = {};
  for (const f of fs.readdirSync(repo, { recursive: true }).map((p) => path.join(repo, p)).filter((p) => p.endsWith('.css') && !p.includes('node_modules'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[m[1]] ??= m[2].trim().replace(/\s+/g, ' ');
  }
  const pick = (re) => Object.fromEntries(Object.entries(tokens).filter(([k]) => re.test(k)));
  return {
    repo: path.resolve(repo),
    icon_system: {
      families: [...families], registry, component,
      library: lib ? { package: lib.package, prefix: lib.prefix, components: Object.keys(lib.components).length, sizes: lib.sizes } : null,
      grid, grid_consistency: gridConsistency, stroke_width: sw, stroke_ratio: sw ? +(sw / grid).toFixed(4) : null,
      stroke_width_at_24: sw ? +((sw / grid) * 24).toFixed(2) : null,
      linecap: mode(caps), linejoin: mode(joins),
      construction: { stroke_shapes: nStroke, fill_shapes: construction.length - nStroke, dominant: !construction.length ? null : nStroke >= construction.length / 2 ? 'stroke' : 'fill' },
      fill_convention: registry ? 'fill shapes carry stroke="none"; stroke shapes carry fill="none"; colour inherited from <svg>' : 'currentColor',
      render_sizes: [...new Set(sizes.length ? sizes : render ? [String(render)] : [])].sort((a, b) => a - b),
      // DESIGN.md stroke rule, in px at the render size and in grid units; adapt clamps to it when no stroke_width is measured
      stroke_px_range: intent.stroke_px ?? null, render_px: render,
      stroke_range: intent.stroke_px && render ? intent.stroke_px.map((v) => +((v * grid) / render).toFixed(3)) : null,
      source: lib ? `grammar of ${lib.package} (imported library)` : construction.length ? 'measured from existing icons' : intent.file ? `no icons found; intent from ${intent.file}` : 'no icons found; defaults',
    },
    tokens: { accent: pick(/accent|gradient-stop/), radius: pick(/radius|rounded/), fonts: pick(/font/) },
    evidence: { files_scanned: files.length, stroke_samples: strokeWidths.length, shapes_sampled: construction.length },
  };
}

// ---------- search + rank ----------
function features(body, height) {
  const els = elements(body).filter((e) => SHAPES.includes(e.name));
  const sws = els.map((e) => +e.a['stroke-width']).filter(Boolean);
  const bodySw = +(body.match(/stroke-width="([\d.]+)"/)?.[1] || 0);
  const stroke = els.some((e) => e.a.fill === 'none') || /fill="none"/.test(body);
  const sw = median(sws) || bodySw || null;
  return { construction: stroke ? 'stroke' : 'fill', grid: height, stroke_ratio: sw ? +(sw / height).toFixed(4) : null, elements: els.length };
}
async function search(query, prof) {
  const fam = prof.icon_system.families;
  const lists = [searchIds(query, null, 150)];
  if (fam.length) lists.push(searchIds(query, fam, 64));
  const ids = [...new Set((await Promise.all(lists)).flat())];
  const byPrefix = {};
  ids.forEach((id) => { const [p, n] = id.split(':'); (byPrefix[p] ??= []).push(n); });
  const cols = await collections(Object.keys(byPrefix));
  const target = prof.icon_system;
  const cands = [];
  await Promise.all(Object.entries(byPrefix).map(async ([p, names]) => {
    const col = cols[p]; if (!col) return;
    const data = await iconData(p, names);
    for (const n of names) {
      const ic = data.icons[n]; if (!ic) continue;
      const h = ic.height ?? data.height ?? col.height ?? 16;
      const f = features(ic.body, h);
      const spdx = col.license?.spdx;
      const r = { id: `${p}:${n}`, set: col.name, license: spdx, license_url: col.license?.url, author: col.author, version: col.version, ...f, score: 0, why: [] };
      if (!PERMISSIVE.has(spdx)) { r.excluded = 'license not permissive'; cands.push(r); continue; }
      const add = (s, w) => { r.score += s; r.why.push(`${s > 0 ? '+' : ''}${s} ${w}`); };
      if (fam.includes(p)) add(50, 'same family as repo');
      if (ATTRIBUTION.has(spdx)) add(-5, 'needs attribution');
      if (f.construction === target.construction.dominant) add(15, `construction ${f.construction} matches`);
      else if (target.construction.fill_shapes > 0 && f.construction === 'fill') add(5, 'fill accepted by repo convention');
      if (f.stroke_ratio && target.stroke_ratio) add(Math.round(20 * Math.max(0, 1 - Math.abs(f.stroke_ratio - target.stroke_ratio) / target.stroke_ratio)), `stroke ratio ${f.stroke_ratio} vs ${target.stroke_ratio}`);
      const base = query.toLowerCase().replace(/\s+/g, '-');
      if (n === base) add(10, 'exact concept name');
      if (/(-fill|-bold|-duotone|-thin|-light|-solid|-twotone|-filled|-sharp)$/.test(n)) add(-15, 'weight/variant suffix, repo uses regular');
      if (f.elements > 6) add(-5, 'high detail');
      cands.push(r);
    }
  }));
  return cands.sort((a, b) => (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || b.score - a.score);
}

// ---------- adapt ----------
function scaleAttrs(a, k) {
  for (const key of ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2']) if (a[key] != null) a[key] = +(+a[key] * k).toFixed(2);
  if (a.points) a.points = a.points.trim().split(/[\s,]+/).map((v) => +(+v * k).toFixed(2)).join(' ');
  if (a.d) a.d = svgpath(a.d).scale(k).round(2).toString();
}
async function adapt(id, prof) {
  const [p, n] = id.split(':');
  const data = await iconData(p, [n]);
  const ic = data.icons[n]; if (!ic) throw new Error('icon not found ' + id);
  const srcGrid = ic.height ?? data.height;
  const t = prof.icon_system;
  const k = t.grid / srcGrid;
  const ops = [];
  if (k !== 1) ops.push(`scale ${srcGrid}→${t.grid} grid (×${+k.toFixed(4)})`);
  // inherit wrapper-level stroke/fill (Iconify puts them on <g>) into shapes, then flatten groups
  let inherited = {};
  const g = ic.body.match(/<g((?:\s+[\w:-]+="[^"]*")*)>/); if (g) { inherited = attrs(g[1]); ops.push('flatten <g> wrapper'); }
  const shapes = elements(ic.body).filter((e) => SHAPES.includes(e.name));
  const outEls = shapes.map(({ name, a }) => {
    a = { ...inherited, ...a };
    scaleAttrs(a, k);
    const isStroke = a.fill === 'none' || a.stroke;
    const src = { sw: a['stroke-width'] ? +a['stroke-width'] * k : null, cap: a['stroke-linecap'], join: a['stroke-linejoin'] };
    for (const c of ['fill', 'stroke', 'color', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) delete a[c];
    // measured repo stroke wins; otherwise keep the source stroke, clamped to the DESIGN.md range
    const sw = t.stroke_width ?? (src.sw && t.stroke_range ? Math.min(Math.max(src.sw, t.stroke_range[0]), t.stroke_range[1]) : src.sw) ?? t.grid / 16;
    if (isStroke) Object.assign(a, { fill: 'none', 'stroke-linecap': t.linecap || src.cap || 'round', 'stroke-linejoin': t.linejoin || src.join || 'round', 'stroke-width': String(+sw.toFixed(3)) });
    else a.stroke = 'none';
    return `<${name} ${Object.entries(a).map(([kk, v]) => `${kk}="${v}"`).join(' ')}/>`;
  });
  const isStroke = outEls.some((e) => e.includes('fill="none"'));
  const outSw = outEls.join('').match(/stroke-width="([\d.]+)"/)?.[1];
  ops.push(isStroke ? `normalize strokes → width ${outSw}${t.stroke_width ? '' : t.stroke_range ? ` (source stroke clamped to DESIGN.md ${t.stroke_range.join('–')})` : ' (source stroke kept)'}, caps ${t.linecap ?? 'source'}, joins ${t.linejoin ?? 'source'}` : 'fill shapes: drop hard-coded colour, add stroke="none" (repo convention)');
  ops.push('remove colour attributes (colour inherited from <Icon>)');
  // mirror the host component (fill+stroke inherited) so svgo does not strip "useless" stroke attrs
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.grid} ${t.grid}" fill="currentColor" stroke="currentColor">${outEls.join('')}</svg>`;
  const opt = optimize(wrapped, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { convertShapeToPath: false, mergePaths: false, removeUnknownsAndDefaults: false, moveElemsAttrsToGroup: false, collapseGroups: false } } }] }).data;
  ops.push('svgo (preset-default; keep primitives, keep per-shape attributes)');
  const fragment = opt.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return { id, fragment, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.grid} ${t.grid}" fill="currentColor" stroke="currentColor">${fragment}</svg>`, operations: ops, source_body: ic.body, source_grid: srcGrid };
}

// ---------- validate ----------
function validate(fragment, prof) {
  const t = prof.icon_system, issues = [];
  if (/<(script|style|image|foreignObject|use|text)\b/i.test(fragment)) issues.push('forbidden element');
  if (/\son\w+=|href=/i.test(fragment)) issues.push('event handler or external reference');
  if (/(fill|stroke)="(?!none|currentColor)[^"]+"/i.test(fragment)) issues.push('hard-coded colour');
  const els = elements(fragment);
  if (!els.length) issues.push('no shapes');
  els.forEach((e) => { if (!SHAPES.includes(e.name)) issues.push(`unexpected <${e.name}>`); });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pt = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const { a } of els) {
    if (a.d) svgpath(a.d).abs().unarc().iterate((s) => { for (let i = 1; i + 1 < s.length; i += 2) pt(s[i], s[i + 1]); });
    if (a.cx) { pt(+a.cx - +(a.r || a.rx), +a.cy - +(a.r || a.ry)); pt(+a.cx + +(a.r || a.rx), +a.cy + +(a.r || a.ry)); }
    if (a.width) { pt(+a.x || 0, +a.y || 0); pt((+a.x || 0) + +a.width, (+a.y || 0) + +a.height); }
    if (a.x1) { pt(+a.x1, +a.y1); pt(+a.x2, +a.y2); }
  }
  const bbox = [minX, minY, maxX, maxY].map((v) => +v.toFixed(1));
  if (minX < 0 || minY < 0 || maxX > t.grid || maxY > t.grid) issues.push(`geometry outside ${t.grid} grid`);
  const pad = Math.min(minX, minY, t.grid - maxX, t.grid - maxY);
  const sws = els.map((e) => +e.a['stroke-width']).filter(Boolean);
  if (t.stroke_width && sws.some((s) => s !== t.stroke_width)) issues.push('stroke width differs from profile');
  els.forEach((e) => { if (e.a.fill === 'none' && !e.a['stroke-width']) issues.push(`stroke shape <${e.name}> lacks stroke-width`); if (e.a.fill !== 'none' && e.a.stroke !== 'none' && t.fill_convention.startsWith('fill shapes')) issues.push(`fill shape <${e.name}> lacks stroke="none"`); });
  // Aicher-style grammar signal (report only): share of straight segments on 0/45/90° directions
  let straight = 0, ortho45 = 0;
  for (const { a } of els) if (a.d) { let px = 0, py = 0; svgpath(a.d).abs().unshort().iterate((sg, i, x, y) => { const c = sg[0]; let nx = x, ny = y;
    if (c === 'L') [nx, ny] = [sg[1], sg[2]]; else if (c === 'H') nx = sg[1]; else if (c === 'V') ny = sg[1]; else return;
    const ang = (Math.atan2(ny - y, nx - x) * 180) / Math.PI; straight++; if (Math.abs(((ang % 45) + 45) % 45) < 2 || Math.abs((((ang % 45) + 45) % 45) - 45) < 2) ortho45++; }); }
  const bytes = Buffer.byteLength(fragment);
  if (bytes > 4000) issues.push('fragment larger than 4 kB — too detailed for this system');
  return { ok: issues.length === 0, issues, bbox, min_padding: +pad.toFixed(1), optical_coverage: +(((maxX - minX) * (maxY - minY)) / t.grid ** 2).toFixed(2), angle_grammar_45: straight ? +(ortho45 / straight).toFixed(2) : null, bytes };
}

// ---------- add (export into project) ----------
async function addIcon(id, name, prof) {
  const a = await adapt(id, prof);
  const v = validate(a.fragment, prof);
  if (!v.ok) return { added: false, adapt: a, validation: v };
  const [p] = id.split(':');
  const col = (await collections([p]))[p];
  const prov = { name, source: id, set: col.name, version: col.version, license: col.license, author: col.author, source_url: `${API}/${id.replace(':', '/')}.svg`, operations: a.operations, meaning: flag('meaning', null), reading: flag('reading', null), permission: flag('permission', null), added: new Date().toISOString().slice(0, 10) };
  const reg = prof.icon_system.registry;
  let target;
  if (reg) {
    target = path.join(prof.repo, reg.file);
    let src = fs.readFileSync(target, 'utf8');
    if (reg.names.includes(name)) throw new Error(`icon "${name}" already exists in ${reg.file}`);
    const start = src.search(new RegExp(`(?:export\\s+)?const ${reg.export}\\s*=\\s*{`));
    if (start < 0) throw new Error(`registry map ${reg.export} not found in ${reg.file}`);
    const close = src.indexOf('\n}', start); // "};" or "} as const;"
    const indent = src.slice(start).match(/\n([ \t]+)['"]?[\w-]+['"]?\s*:\s*`/)?.[1] ?? '\t';
    const line = `${indent}// ${id} (${col.name} ${col.version ?? ''}, ${col.license.spdx}): ${flag('meaning', name)} (via pikto, see .pikto/provenance.json)\n${indent}'${name}': \`${a.fragment}\`,`;
    src = src.slice(0, close) + '\n' + line + src.slice(close);
    fs.writeFileSync(target, src);
  } else {
    const dir = path.join(prof.repo, flag('out', 'src/icons')); fs.mkdirSync(dir, { recursive: true });
    target = path.join(dir, `${name}.svg`); fs.writeFileSync(target, a.svg + '\n');
  }
  const pf = path.join(prof.repo, '.pikto', 'provenance.json');
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  const all = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : { icons: [] };
  all.icons = all.icons.filter((x) => x.name !== name).concat(prov);
  fs.writeFileSync(pf, JSON.stringify(all, null, 2) + '\n');
  return { added: true, file: path.relative(prof.repo, target), provenance: prov, validation: v, fragment: a.fragment };
}

// ---------- differ (différance check: coherent with siblings, distinct from each sibling and from the generic default) ----------
function mask(fragment, grid, px = 48) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" width="${px}" height="${px}" fill="#000" stroke="#000">${fragment}</svg>`;
  const rgba = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().pixels;
  const m = new Uint8Array(px * px); for (let i = 0; i < m.length; i++) m[i] = rgba[i * 4 + 3] > 96 ? 1 : 0; return m;
}
const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; };
const ink = (m) => m.reduce((s, v) => s + v, 0) / m.length;
async function siblings(prof) {
  const reg = prof.icon_system.registry; if (!reg) return [];
  const src = fs.readFileSync(path.join(prof.repo, reg.file), 'utf8');
  return [...src.matchAll(/['"]?([\w-]+)['"]?\s*:\s*`([\s\S]*?)`/g)].map((m) => ({ name: m[1], fragment: m[2] }));
}
async function differ(id, prof) {
  const t = prof.icon_system, a = await adapt(id, prof), cand = mask(a.fragment, t.grid);
  const sibs = (await siblings(prof)).filter((s) => !/-logo$/.test(s.name) && s.fragment !== a.fragment);
  const sibScores = sibs.map((s) => { const m = mask(s.fragment, t.grid); return { name: s.name, iou: +iou(cand, m).toFixed(3), ink: ink(m) }; }).sort((x, y) => y.iou - x.iou);
  const inkMed = median(sibScores.map((s) => s.ink));
  const concept = id.split(':')[1].replace(/-(fill|bold|duotone|light|thin|regular)$/, '');
  let generic = null;
  for (const gp of ['lucide', 'heroicons', 'tabler']) {
    if (id.startsWith(gp + ':')) continue;
    try { const g = await adapt(`${gp}:${concept}`, prof); generic = { id: `${gp}:${concept}`, iou: +iou(cand, mask(g.fragment, t.grid)).toFixed(3) }; break; } catch {}
  }
  const inkRatio = inkMed ? +(ink(cand) / inkMed).toFixed(2) : null;
  const notes = [];
  if (sibScores[0]?.iou > 0.55) notes.push(`confusable with sibling "${sibScores[0].name}"`);
  if (generic && generic.iou > 0.6) notes.push(`near-identical to generic default ${generic.id} — no distinction gained`);
  if (inkRatio && (inkRatio < 0.6 || inkRatio > 1.6)) notes.push(`visual weight ${inkRatio}× siblings — will look ${inkRatio < 1 ? 'faint' : 'heavy'}`);
  return { id, visual_weight_vs_siblings: inkRatio, nearest_siblings: sibScores.slice(0, 3).map(({ name, iou }) => ({ name, iou })), generic_default: generic, notes, verdict: notes.length ? 'review' : 'coherent-and-distinct' };
}

// ---------- audit (intent = DESIGN.md, evidence = code) ----------
const GLYPH = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF\u00D7\u2715\u2713\u{1F300}-\u{1FAFF}]/gu;
const NOT_ICON = /[\u00B7\u2022\u2026]/; // middle dot, bullet, ellipsis are typography
function readIntent(repo) {
  const intent = {};
  const dm = ['DESIGN.md', 'design.md'].map((n) => path.join(repo, n)).find((p) => fs.existsSync(p));
  if (dm) { const t = fs.readFileSync(dm, 'utf8');
    intent.file = path.basename(dm);
    intent.icon_rules = t.split('\n').filter((l) => /icon|glyph|pictogram/i.test(l) && !/^\s*[\w-]+:\s/.test(l)).map((l) => l.replace(/^[-*\s]+/, '').trim());
    intent.has_iconography_section = /^##\s+Iconography/im.test(t);
    const rules = intent.icon_rules.join(' '); const px = rules.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)px stroke/) || rules.match(/()()(\d+(?:\.\d+)?)px stroke(?! glyph)/);
    if (px) intent.stroke_px = px[3] ? [+px[3], +px[3]] : [+px[1], +px[2]];
    const sz = intent.icon_rules.join(' ').match(/(\d+)px (?:stroke )?glyph/); if (sz) intent.glyph_px = +sz[1]; }
  return intent;
}
// ---------- icon libraries imported as components (lucide-react, heroicons, tabler, phosphor, radix, react-icons) ----------
// Each entry maps a package to its Iconify prefix, the component naming rule and the family's stroke grammar.
const pascal = (k) => k.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const kebab = (c) => c.replace(/([a-z])([A-Z0-9])/g, '$1-$2').replace(/([0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
const LIBS = [
  { re: /^lucide(?:-react|-vue-next|-svelte|-solid|-preact)?$/, prefix: 'lucide', toName: (c) => kebab(c.replace(/^Lucide/, '').replace(/Icon$/, '')), toComp: pascal, grid: 24, stroke: 2, cap: 'round', join: 'round' },
  { re: /^@tabler\/icons-react$/, prefix: 'tabler', toName: (c) => kebab(c.replace(/^Icon/, '')), toComp: (n) => 'Icon' + pascal(n), grid: 24, stroke: 2, cap: 'round', join: 'round' },
  { re: /^@heroicons\/react\/24\/outline$/, prefix: 'heroicons', toName: (c) => kebab(c.replace(/Icon$/, '')), toComp: (n) => pascal(n) + 'Icon', grid: 24, stroke: 1.5, cap: 'round', join: 'round' },
  { re: /^@heroicons\/react\/24\/solid$/, prefix: 'heroicons', toName: (c) => kebab(c.replace(/Icon$/, '')) + '-solid', toComp: (n) => pascal(n.replace(/-solid$/, '')) + 'Icon', grid: 24, stroke: null },
  { re: /^@phosphor-icons\/react$/, prefix: 'ph', toName: (c) => kebab(c.replace(/Icon$/, '')), toComp: pascal, grid: 256, stroke: null },
  { re: /^@radix-ui\/react-icons$/, prefix: 'radix-icons', toName: (c) => kebab(c.replace(/Icon$/, '')), toComp: (n) => pascal(n) + 'Icon', grid: 15, stroke: null },
  ...[['lu', 'lucide', 'Lu'], ['fi', 'feather', 'Fi'], ['tb', 'tabler', 'Tb'], ['pi', 'ph', 'Pi'], ['hi2', 'heroicons', 'Hi']].map(([sub, prefix, p]) =>
    ({ re: new RegExp(`^react-icons/${sub}$`), prefix, toName: (c) => kebab(c.replace(new RegExp(`^${p}`), '')), toComp: (n) => p + pascal(n), grid: 24, stroke: null })),
];
function libraryUses(repo) {
  const libs = {};
  for (const f of walk(repo)) {
    if (!/\.(tsx?|jsx?|vue|svelte|astro|mjs)$/.test(f) || /\.test\./.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8'), rel = path.relative(repo, f);
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const lib = LIBS.find((l) => l.re.test(m[2])); if (!lib) continue;
      const L = (libs[m[2]] ??= { package: m[2], prefix: lib.prefix, files: [], components: {}, sizes: {}, stroke_widths: {} });
      L.files.push(rel);
      for (const spec of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const [imported, local = imported] = spec.split(/\s+as\s+/);
        const c = (L.components[imported] ??= { id: `${lib.prefix}:${lib.toName(imported)}`, uses: 0, sizes: [] });
        for (const u of src.matchAll(new RegExp(`<${local}\\b([^>]*?)\\/?>`, 'g'))) {
          c.uses++;
          const size = u[1].match(/\bsize=\{?["']?([\d.]+)/)?.[1], sw = u[1].match(/\bstrokeWidth=\{?["']?([\d.]+)/)?.[1];
          if (size) { c.sizes.includes(+size) || c.sizes.push(+size); L.sizes[size] = (L.sizes[size] || 0) + 1; }
          if (sw) L.stroke_widths[sw] = (L.stroke_widths[sw] || 0) + 1;
        }
      }
    }
  }
  return Object.values(libs);
}
const libSpec = (pkg) => LIBS.find((l) => l.re.test(pkg));

// Is this glyph an icon or typography? An icon stands alone (its whole element or literal) or trails a label as a
// marker ("Open source ↗"). Typography sits inside prose: between words or interpolations ("a → b", "${x} ↔ ${y}"),
// as a separator literal (' → '), or leading a sentence ("→ became a new branch").
function glyphKind(g, before, after) {
  const arrow = /[\u2190-\u21FF]/u.test(g);
  if (/[>'"`]$/.test(before) && /^[<'"`]/.test(after)) return 'icon';
  if (/[\w)]\s$/.test(before) && /^\s*(?:$|<|['"`])/.test(after)) return 'icon';
  if (/[A-Za-z]\s?$/.test(before.replace(/<[^>]*>$/, '')) && /^\s?[A-Za-z]/.test(after)) return 'in running text';
  if (/[\w})\]'"]\s+$/.test(before) && /^\s+(?:\$\{|[\w{(])/.test(after)) return 'connector between operands';
  if (arrow && /['"`]\s+$/.test(before) && /^\s+['"`]/.test(after)) return 'separator literal';
  if (arrow && /^\s+\$\{/.test(after)) return 'connector before a value';
  if (/(?:^|[>'"`\[])\s*$/.test(before) && /^\s+[a-z][\w-]*(?:\s+[\w+'-]+){2,}/.test(after)) return 'leads a sentence';
  return 'icon';
}
function audit(repo) {
  const intent = readIntent(repo);
  const uses = [];
  for (const f of walk(repo)) {
    if (!/\.(tsx?|jsx?|mjs|html|astro|vue|svelte)$/.test(f) || /\.test\./.test(f)) continue;
    const rel = path.relative(repo, f);
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const m of line.matchAll(GLYPH)) {
        const g = m[0], at = m.index; if (NOT_ICON.test(g)) continue;
        const before = line.slice(Math.max(0, at - 140), at), after = line.slice(at + 1, at + 60);
        const cls = [...before.matchAll(/class(?:Name)?="([^"]+)"/g)].pop()?.[1] ?? null;
        const cond = [...before.matchAll(/===\s*'([\w-]+)'\s*\?\s*'?$/g)].pop()?.[1] ?? [...before.matchAll(/'([\w-]+)'\s*\?\s*'[^']*$/g)].pop()?.[1];
        const label = after.match(/^\s*([A-Za-z][\w -]{1,24})/)?.[1]?.trim() ?? after.match(/<span>([^<]{1,24})</)?.[1] ?? null;
        const kind = glyphKind(g, before, after);
        uses.push({ glyph: g, file: rel, line: i + 1, role: cls, meaning: (cond || label || '').toLowerCase() || null, kind: kind === 'icon' ? 'icon' : 'typographic', ...(kind === 'icon' ? {} : { why: kind }) });
      }
    });
  }
  const icons = uses.filter((u) => u.kind === 'icon');
  const byMeaning = {}, byGlyph = {};
  for (const u of icons) { if (u.meaning) (byMeaning[u.meaning] ??= new Set()).add(u.glyph); (byGlyph[u.glyph] ??= new Set()).add(u.meaning ?? '?'); }
  const issues = [];
  for (const [m, gs] of Object.entries(byMeaning)) if (gs.size > 1) issues.push(`"${m}" is drawn as ${[...gs].join(' / ')}`);
  const vocabulary = Object.fromEntries(Object.entries(byGlyph).map(([g, ms]) => [g, [...ms]]));
  if (icons.length && intent.stroke_px) issues.push(`DESIGN.md asks for ${intent.stroke_px.join('–')}px stroke icons; ${icons.length} Unicode glyphs render with font-dependent weight`);
  // libraries: two families are two grammars; a glyph in a file that already imports the library should use it
  const libraries = libraryUses(repo);
  const prefixes = [...new Set(libraries.map((l) => l.prefix))];
  if (prefixes.length > 1) issues.push(`${prefixes.length} icon families imported (${libraries.map((l) => l.package).join(', ')}): two grammars in one UI`);
  for (const l of libraries) {
    const beside = icons.filter((u) => l.files.includes(u.file));
    if (beside.length) issues.push(`${beside.length} glyph${beside.length > 1 ? 's' : ''} (${[...new Set(beside.map((u) => u.glyph))].join(' ')}) in files that already import ${l.package}: use the library`);
  }
  const roles = {};
  for (const u of icons) { const r = (roles[u.role ?? `${u.file}`] ??= { glyphs: {}, sites: 0 }); r.sites++; r.glyphs[u.glyph] = [...new Set([...(r.glyphs[u.glyph] ?? []), u.meaning ?? '?'])]; }
  return { repo: path.resolve(repo), intent, summary: { icon_glyphs: icons.length, typographic: uses.length - icons.length, roles: Object.keys(roles).length, libraries: libraries.map((l) => `${l.package} (${Object.keys(l.components).length})`), issues: issues.length }, issues, vocabulary, roles, libraries, uses };
}

// ---------- sheet (contact sheet: before → after in the repo's own tokens; the human decides here) ----------
// Input is a proposal the agent writes (.pikto/proposal.json): roles → items → candidate ids + reading.
// Everything below is deterministic: adapt, validate, measure, compare within each role family, render HTML.
function repoTokens(repo) {
  const tokens = {};
  const dm = path.join(repo, 'DESIGN.md');
  if (fs.existsSync(dm)) for (const m of fs.readFileSync(dm, 'utf8').matchAll(/^\s+([\w-]+):\s*'(#[0-9a-fA-F]{3,8})'/gm)) tokens[m[1]] ??= m[2];
  for (const f of walkAll(repo, /\.css$/)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/--([\w-]+):\s*([^;}]+)[;}]/g)) tokens[m[1]] ??= m[2].trim();
  return tokens;
}
function walkAll(dir, re, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walkAll(p, re, out) : re.test(e.name) && out.push(p);
  }
  return out;
}
const resolveVar = (v, tokens, depth = 0) => typeof v !== 'string' || depth > 5 ? v : v.replace(/var\(--([\w-]+)(?:,\s*([^)]+))?\)/g, (_, k, fb) => resolveVar(tokens[k] ?? fb ?? '#000', tokens, depth + 1));
// optical stroke thickness in px at the render size, for any construction: 2·area / perimeter of the rendered ink
function strokePx(fragment, grid, px) {
  const ss = 8, n = px * ss, m = mask(fragment, grid, n);
  // perimeter by Cauchy–Crofton: ink/background transitions along rows and columns × π/4 (unbiased over edge angles)
  let area = 0, cross = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; area += m[i];
    if (x + 1 < n && m[i] !== m[i + 1]) cross++; if (y + 1 < n && m[i] !== m[i + n]) cross++; }
  const perim = (cross * Math.PI) / 4;
  return perim ? +((2 * area) / perim / ss).toFixed(2) : null;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function sheet(repo, prof, proposal, outFile) {
  const t = prof.icon_system, tokens = repoTokens(repo), aud = audit(repo);
  const font = resolveVar(proposal.font ?? 'Inter, system-ui, sans-serif', tokens);
  const range = t.stroke_px_range, cols = {}, report = { file: null, roles: [], sources: {}, failed: [] };
  for (const role of proposal.roles) {
    const ctx = { size: t.render_px ?? 24, box: null, radius: 0, color: 'currentColor', background: 'transparent', ...role.context };
    const items = [];
    for (const it of role.items) {
      const c = { ...ctx, ...it.context };
      const cands = [];
      for (const id of it.candidates) {
        try {
          const a = await adapt(id, prof), v = validate(a.fragment, prof), p = id.split(':')[0];
          cols[p] ??= (await collections([p]))[p];
          const col = cols[p], sp = strokePx(a.fragment, t.grid, c.size);
          const notes = v.issues.slice();
          if (range && sp && (sp < range[0] - 0.15 || sp > range[1] + 0.15)) notes.push(`stroke ≈${sp}px at ${c.size}px, DESIGN.md asks ${range.join('–')}px`);
          cands.push({ id, fragment: a.fragment, ok: v.ok, stroke_px: sp, license: col?.license?.spdx ?? '?', set: col?.name ?? p, notes });
          report.sources[id] = { set: col?.name, version: col?.version, license: col?.license?.spdx, via: col?.source ?? 'api.iconify.design' };
        } catch (e) { cands.push({ id, error: e.message, notes: [e.message] }); report.failed.push({ id, error: e.message }); }
      }
      items.push({ ...it, ctx: c, cands });
    }
    // différance inside the family: the proposed (first) candidates must share weight and stay distinguishable
    // A role marked "frame": true intends a shared frame (Isotype's works in a series, e.g. one circle for all states):
    // the frame is the ink a strict majority of members share, and only the marks (ink minus frame) are compared.
    const lead = items.map((it) => it.cands.find((c) => c.fragment)).map((c) => c && { c, m: mask(c.fragment, t.grid) });
    const ms = lead.filter(Boolean).map((l) => l.m), inkMed = median(ms.map(ink));
    let frame = new Uint8Array(ms[0]?.length ?? 0);
    if (role.frame && ms.length >= 3) for (let k = 0; k < frame.length; k++) { let c = 0; for (const m of ms) c += m[k]; frame[k] = c * 2 > ms.length ? 1 : 0; }
    let frameShare = +(ink(frame) / (inkMed || 1)).toFixed(2);
    if (role.frame && frameShare < 0.3) report.failed.push({ role: role.role, error: 'role declares a shared frame but members share almost no ink' });
    if (frameShare) lead.forEach((l) => { if (!l) return; let inside = 0; for (let k = 0; k < frame.length; k++) inside += l.m[k] & frame[k];
      if (inside < ink(frame) * frame.length * 0.5) l.c.notes.push('does not share the family frame'); });
    const markOf = (m) => m.map((v, k) => v & (1 - frame[k]));
    lead.forEach((l, i) => { if (!l) return;
      let best = null;
      lead.forEach((o, j) => { if (o && j !== i) { const s = iou(markOf(l.m), markOf(o.m)); if (!best || s > best.iou) best = { name: items[j].meaning, iou: +s.toFixed(3) }; } });
      const r = inkMed ? +(ink(l.m) / inkMed).toFixed(2) : null;
      l.c.family = { nearest: best, weight: r, shared_frame: frameShare };
      if (best && best.iou > 0.55) l.c.notes.push(`confusable with "${best.name}" (mark IoU ${best.iou})`);
      if (r && (r < 0.6 || r > 1.6)) l.c.notes.push(`weight ${r}× family median`);
    });
    report.roles.push({ role: role.role, items: items.map((it) => ({ meaning: it.meaning, today: it.today, candidates: it.cands.map(({ id, ok, stroke_px, family, notes }) => ({ id, ok, stroke_px, family, notes })) })) });
    role._items = items;
  }
  const tile = (c, ctx, big) => {
    const sz = big ? ctx.size : Math.round(ctx.size * 0.9), box = ctx.box ?? sz + 16;
    const inner = c.fragment ? `<svg viewBox="0 0 ${t.grid} ${t.grid}" width="${sz}" height="${sz}" fill="currentColor" stroke="currentColor" aria-hidden="true">${c.fragment}</svg>` : `<span class="err">✕</span>`;
    return `<div class="swatch" style="width:${box}px;height:${box}px;border-radius:${ctx.radius}px;background:${esc(resolveVar(ctx.background, tokens))};color:${esc(resolveVar(ctx.color, tokens))}">${inner}</div>`;
  };
  const glyph = (g, ctx) => `<div class="swatch" style="width:${ctx.box ?? ctx.size + 16}px;height:${ctx.box ?? ctx.size + 16}px;border-radius:${ctx.radius}px;background:${esc(resolveVar(ctx.background, tokens))};color:${esc(resolveVar(ctx.color, tokens))};font:${ctx.size}px/1 ${esc(font)}">${esc(g ?? '—')}</div>`;
  const roleHtml = proposal.roles.map((role) => `
  <section><h2>${esc(role.role)}</h2>${role.note ? `<p class="note">${esc(role.note)}</p>` : ''}
    <div class="grid">${role._items.map((it) => { const [lead, ...alts] = it.cands; return `
      <figure>
        <div class="pair">${glyph(it.today, it.ctx)}<span class="arrow">→</span>${tile(lead, it.ctx, true)}</div>
        <figcaption><b>${esc(it.meaning)}</b><code>${esc(lead.id)}</code>
          <span class="meta">${esc(lead.set ?? '')} · ${esc(lead.license ?? '')}${lead.stroke_px ? ` · ≈${lead.stroke_px}px stroke` : ''}</span>
          ${it.reading ? `<span class="reading">${esc(it.reading)}</span>` : ''}
          ${lead.notes.map((n) => `<span class="warn">${esc(n)}</span>`).join('')}
        </figcaption>
        ${alts.length ? `<div class="alts">${alts.map((a) => `<div title="${esc(a.id)}">${tile(a, it.ctx, false)}<code>${esc(a.id)}</code>${a.notes.map((n) => `<span class="warn">${esc(n)}</span>`).join('')}</div>`).join('')}</div>` : ''}
      </figure>`; }).join('')}
    </div>
  </section>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pikto sheet: ${esc(path.basename(repo))}</title>
<style>
:root{--ink:#1c1c1a;--muted:#6b6a66;--line:#e2dfd8;--page:#faf9f6;--card:#fff;--warn:#9a5b12}
@media (prefers-color-scheme:dark){:root{--ink:#ecebe7;--muted:#a3a19b;--line:#34332f;--page:#161614;--card:#1f1f1c;--warn:#e0a458}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
main{max-width:1080px;margin:auto;padding:32px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:36px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.lede{color:var(--muted);margin:0 0 20px}.intent{display:grid;gap:4px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;font-size:13px}
.intent .warn{display:block}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
figure{margin:0;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;display:grid;gap:10px;align-content:start}
.pair{display:flex;align-items:center;gap:12px}.arrow{color:var(--muted)}.swatch{display:grid;place-items:center;flex:none;border:1px solid rgba(0,0,0,.06)}
figcaption{display:grid;gap:3px;font-size:12px}code{font:11px ui-monospace,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}.meta{color:var(--muted);font-size:11px}
.reading{font-size:12px}.warn{color:var(--warn);font-size:11px}.warn::before{content:"⚠ "}.note{color:var(--muted);margin:-4px 0 12px;font-size:13px}
.alts{display:flex;gap:10px;flex-wrap:wrap;padding-top:8px;border-top:1px dashed var(--line)}.alts>div{display:grid;gap:4px;justify-items:start;max-width:110px}
ol{padding-left:20px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}.err{color:var(--warn)}
</style></head><body><main>
<h1>${esc(proposal.title ?? `Icon proposal: ${path.basename(repo)}`)}</h1>
<p class="lede">Before → after in the repo's own colours and sizes. Generated by <code>pikto sheet</code>; pick on this page, then run <code>apply</code>.</p>
<div class="intent">
${(aud.intent.icon_rules ?? []).map((r) => `<span>${esc(aud.intent.file)}: ${esc(r)}</span>`).join('')}
<span>Audit: ${aud.summary.icon_glyphs} icon glyphs in ${aud.summary.roles} roles.</span>
${aud.issues.map((i) => `<span class="warn">${esc(i)}</span>`).join('')}
</div>
${roleHtml}
${proposal.questions?.length ? `<h2>Open decisions</h2><ol>${proposal.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}
<h2>Sources</h2><table><tr><th>icon</th><th>set</th><th>license</th><th>via</th></tr>
${Object.entries(report.sources).map(([id, s]) => `<tr><td><code>${esc(id)}</code></td><td>${esc(s.set)} ${esc(s.version ?? '')}</td><td>${esc(s.license)}</td><td>${esc(s.via)}</td></tr>`).join('')}
</table></main></body></html>
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  report.file = outFile;
  return report;
}

// ---------- apply (the human's pick → icons module, call sites, provenance, DESIGN.md) ----------
// Input is .pikto/decision.json: icons {name: {source, meaning, reading, permission}}, replace rules
// [{glyph, icon, size, at?: ["file:line"]}] and skip [{at: "file:line", reason}]. Rules without `at` apply to the
// sites audit classified as icons; ASCII glyphs ('?', '+') are only replaced at explicit sites and only standalone.
// A glyph is only replaced inside string or template text, never in code or comments.
function lexContexts(src) {
  // per-offset context: 'c' code, 'k' comment, "'" / '"' quoted string, '`' template text
  const ctx = new Array(src.length), stack = []; let st = 'c';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (st === 'c') {
      if (ch === '/' && nx === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; for (; i < end; i++) ctx[i] = 'k'; i--; continue; }
      if (ch === '/' && nx === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; for (; i < end; i++) ctx[i] = 'k'; i--; continue; }
      ctx[i] = 'c';
      if (ch === "'" || ch === '"' || ch === '`') st = ch;
      else if (ch === '{') stack.length && stack[stack.length - 1]++;
      else if (ch === '}' && stack.length) { if (stack[stack.length - 1] === 0) { stack.pop(); st = '`'; } else stack[stack.length - 1]--; }
    } else {
      if (ch === '\\') { ctx[i] = ctx[i + 1] = st; i++; continue; }
      if (st === '`' && ch === '$' && nx === '{') { ctx[i] = ctx[i + 1] = 'c'; i++; stack.push(0); st = 'c'; continue; }
      if (ch === st) { ctx[i] = 'c'; st = 'c'; continue; }
      if (st !== '`' && ch === '\n') st = 'c';
      ctx[i] = st;
    }
  }
  return ctx;
}
const ASCII = /^[\x20-\x7e]$/;
// JSX text: the nearest structural characters around the glyph are an element boundary (> or }) and (< or {)
function jsxText(src, i) {
  let b = i - 1; while (b >= 0 && !/[<>{}();=]/.test(src[b])) b--;
  let f = i + 1; while (f < src.length && !/[<>{}();=]/.test(src[f])) f++;
  return (src[b] === '>' || src[b] === '}') && (src[f] === '<' || src[f] === '{');
}
function canonical(prefix, n) { const s = localSet(prefix); let k = n, h = 0; while (s && !s.icons[k] && s.aliases?.[k] && h++ < 5) k = s.aliases[k].parent; return k; }
const IMPORT = /^import\b[\s\S]*?\bfrom\s*['"][^'"]+['"];?[ \t]*\n|^import\s*['"][^'"]+['"];?[ \t]*\n/gm;
const insertImport = (src, imp) => { const last = [...src.matchAll(IMPORT)].pop(); return last ? src.slice(0, last.index + last[0].length) + imp + src.slice(last.index + last[0].length) : imp + src; };
async function apply(repo, prof, decision, dryRun) {
  const t = prof.icon_system, mod = decision.module ?? 'src/ui/icons.ts', fn = decision.function ?? 'icon';
  // target: the repo's own imported library when every chosen icon comes from its family, else a generated module
  const lib = t.library, lspec = lib && libSpec(lib.package);
  const target = decision.target ?? (lib && Object.values(decision.icons).every((d) => d.source.startsWith(lib.prefix + ':')) ? 'library' : 'module');
  if (target === 'library' && !lspec) throw new Error('decision targets a library, but the profile found none');
  // 1. adapt + validate every icon; any failure stops before anything is written
  const icons = {}, failed = [];
  for (const [name, d] of Object.entries(decision.icons)) {
    const a = await adapt(d.source, prof), v = validate(a.fragment, prof);
    if (!v.ok) failed.push({ name, source: d.source, issues: v.issues }); else icons[name] = { ...d, fragment: a.fragment, operations: a.operations };
    if (icons[name] && target === 'library') { const [p, n] = d.source.split(':'); icons[name].component = lspec.toComp(canonical(p, n)); }
  }
  if (failed.length) return { applied: false, failed };
  // 2. call sites
  const aud = audit(repo), iconSites = new Set(aud.uses.filter((u) => u.kind === 'icon').map((u) => `${u.file}:${u.line}:${u.glyph}`));
  const skip = new Map((decision.skip ?? []).map((s) => [s.at, s.reason]));
  for (const r of decision.replace) if (!icons[r.icon]) throw new Error(`replace rule for ${r.glyph} names unknown icon "${r.icon}"`);
  const files = new Set([...aud.uses.map((u) => u.file), ...decision.replace.flatMap((r) => (r.at ?? []).map((a) => a.split(':')[0]))]);
  const replaced = [], left = [], writes = {};
  for (const rel of files) {
    const file = path.join(repo, rel), src = fs.readFileSync(file, 'utf8'), ctx = lexContexts(src);
    const collides = new RegExp(`\\b(?:const|let|var|function)\\s+${fn}\\b`).test(src);
    const call = collides ? `${fn}Svg` : fn;
    const edits = [], used = new Set();
    let lineNo = 1;
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '\n') { lineNo++; continue; }
      const cp = src.codePointAt(i), g = String.fromCodePoint(cp), at = `${rel}:${lineNo}`;
      const rule = decision.replace.find((r) => r.glyph === g && (r.at ? r.at.includes(at) : !ASCII.test(g) && iconSites.has(`${at}:${g}`)));
      if (!rule) continue;
      if (skip.has(at)) { left.push({ at, glyph: g, reason: skip.get(at) }); continue; }
      const c = ctx[i], prev = src[i - 1], next = src[i + g.length];
      if (target === 'library') {
        if (!/\.(tsx|jsx)$/.test(rel)) { if (!ASCII.test(g)) left.push({ at, glyph: g, reason: `not a JSX file: ${lib.package} cannot render here` }); continue; }
        if (c !== 'c' || !jsxText(src, i)) { if (!ASCII.test(g)) left.push({ at, glyph: g, reason: c === 'k' ? 'in a comment' : 'not in JSX text: a string cannot hold a component' }); continue; }
        if (ASCII.test(g) && !(prev === '>' && next === '<')) continue;
        const comp = icons[rule.icon].component;
        edits.push({ from: i, to: i + g.length, text: `<${comp}${rule.size ? ` size={${rule.size}}` : ''} aria-hidden="true" />` });
        used.add(comp); replaced.push({ at, glyph: g, icon: rule.icon, component: comp, context: 'jsx' });
        i += g.length - 1; continue;
      }
      if (c !== "'" && c !== '"' && c !== '`') { if (!ASCII.test(g)) left.push({ at, glyph: g, reason: `in ${c === 'k' ? 'a comment' : 'code'}` }); continue; }
      if (ASCII.test(g) && !((prev === '>' || prev === c) && (next === '<' || next === c))) continue;
      const expr = `${call}('${rule.icon}'${rule.size ? `, ${rule.size}` : ''})`;
      let from = i, to = i + g.length, text;
      if (c === '`') text = `\${${expr}}`;
      else if (prev === c && next === c) { from--; to++; text = expr; } // the literal is exactly the glyph
      else text = `${c} + ${expr} + ${c}`;
      edits.push({ from, to, text });
      replaced.push({ at, glyph: g, icon: rule.icon, context: c === '`' ? 'template' : 'string' });
      i += g.length - 1;
    }
    if (!edits.length) continue;
    let out = src;
    for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
    const imps = [...out.matchAll(IMPORT)], semi = (imps.length ? imps.some((m) => /;\s*$/.test(m[0])) : /;[ \t]*$/m.test(out)) ? ';' : '';
    if (target === 'library') { // merge into the existing import from the library, keeping its order convention
      const m = out.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*(['"])${lib.package.replace(/[/.@-]/g, '\\$&')}\\2`));
      if (m) { const have = m[1].split(',').map((x) => x.trim()).filter(Boolean), sorted = have.every((v, k) => !k || have[k - 1].localeCompare(v) <= 0);
        const all = [...new Set([...have, ...used])]; if (sorted) all.sort((a, b) => a.localeCompare(b));
        out = out.replace(m[0], m[0].replace(m[1], ` ${all.join(', ')} `)); }
      else out = insertImport(out, `import { ${[...used].sort().join(', ')} } from '${lib.package}'${semi}\n`);
    } else {
      let spec = path.relative(path.dirname(file), path.join(repo, mod)).replace(/\.ts$/, '').split(path.sep).join('/');
      if (!spec.startsWith('.')) spec = './' + spec;
      out = insertImport(out, `import { ${fn}${collides ? ` as ${call}` : ''} } from '${spec}'${semi}\n`);
    }
    writes[rel] = out;
  }
  // 3. the module: plain SVG string functions, colour from currentColor, no dependency
  const cols = await collections([...new Set(Object.values(icons).map((d) => d.source.split(':')[0]))]);
  const body = Object.entries(icons).map(([n, d]) => { const [p] = d.source.split(':'); return `  // ${d.source} (${cols[p]?.name} ${cols[p]?.version ?? ''}, ${cols[p]?.license?.spdx}): ${d.meaning ?? n}\n  '${n}': \`${d.fragment}\`,`; }).join('\n');
  const module = `// Generated by pikto apply. Do not edit path data by hand: sources, licenses and operations are in .pikto/provenance.json.
// Colour comes from currentColor, so existing state classes (.source-state.ready, .claim-rejected, …) keep working.
const PATHS = {
${body}
} as const;

export type IconName = keyof typeof PATHS;

export const ${fn} = (name: IconName, size = 16): string =>
  \`<svg class="icon icon-\${name}" viewBox="0 0 ${t.grid} ${t.grid}" width="\${size}" height="\${size}" fill="currentColor" stroke="currentColor" aria-hidden="true" focusable="false" style="vertical-align:-0.125em;flex:none">\${PATHS[name]}</svg>\`;
`;
  if (target === 'module') writes[mod] = module;
  const pkgJson = fs.existsSync(path.join(repo, 'package.json')) ? JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) : {};
  const libVersion = lib && ({ ...pkgJson.dependencies, ...pkgJson.devDependencies })[lib.package];
  // 4. provenance, the audit allow list (sites deliberately left as text), and the DESIGN.md section
  const today = new Date().toISOString().slice(0, 10);
  const prov = { icons: Object.entries(icons).map(([n, d]) => { const [p] = d.source.split(':'); const col = cols[p];
    const base = { name: n, source: d.source, set: col?.name, license: col?.license, author: col?.author, meaning: d.meaning, reading: d.reading ?? null, permission: d.permission ?? null, added: today };
    return target === 'library' ? { ...base, component: d.component, package: lib.package, package_version: libVersion ?? null, operations: ['none: rendered by the repo\'s own library, no geometry copied'] }
      : { ...base, version: col?.version, via: col?.source ?? 'api.iconify.design', operations: d.operations }; }) };
  writes['.pikto/provenance.json'] = JSON.stringify(prov, null, 2) + '\n';
  writes['.pikto/audit.json'] = JSON.stringify({ module: target === 'library' ? lib.package : mod, allow: (decision.skip ?? []).map((s) => ({ file: s.at.split(':')[0], glyph: s.glyph, reason: s.reason })) }, null, 2) + '\n';
  const dmFile = path.join(repo, 'DESIGN.md');
  let design = null;
  if (fs.existsSync(dmFile) && !aud.intent.has_iconography_section) {
    const sets = [...new Set(Object.values(icons).map((d) => { const p = d.source.split(':')[0]; return `${cols[p]?.name} (${cols[p]?.license?.spdx})`; }))].join(', ');
    const rows = Object.entries(icons).map(([n, d]) => `| \`${n}\` | ${d.meaning ?? ''} | \`${d.source}\` |`).join('\n');
    const src = target === 'library' ? `- Source: ${lib.package} components only (${sets}); no second library, no pasted SVG.\n` : `- Source: ${sets}, adapted by pikto to a ${t.grid} grid. Module: \`${mod}\`, \`${fn}(name, size)\` returns an SVG string; colour is \`currentColor\`.\n`;
    design = `\n## Iconography\n\n${decision.design_md?.intro ?? ''}${decision.design_md?.intro ? '\n\n' : ''}${src}${(decision.design_md?.rules ?? []).map((r) => `- ${r}\n`).join('')}- No Unicode glyphs as icons. Add icons with \`pikto add\`/\`pikto apply\`; \`pikto audit --check\` fails on new glyphs. Provenance: \`.pikto/provenance.json\`.\n\n| Name | Meaning | Source |\n|---|---|---|\n${rows}\n`;
    writes['DESIGN.md'] = fs.readFileSync(dmFile, 'utf8').replace(/\s*$/, '\n') + design;
  }
  const done = new Set(replaced.map((r) => `${r.at}:${r.glyph}`));
  const unmapped = aud.uses.filter((u) => u.kind === 'icon' && !done.has(`${u.file}:${u.line}:${u.glyph}`) && !skip.has(`${u.file}:${u.line}`)).map((u) => ({ at: `${u.file}:${u.line}`, glyph: u.glyph, meaning: u.meaning }));
  if (!dryRun) for (const [rel, s] of Object.entries(writes)) { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }
  return { applied: !dryRun, target, module: target === 'library' ? lib.package : mod, icons: Object.keys(icons), files: Object.keys(writes), replaced, left, unmapped, design_md: design ? 'Iconography section appended' : 'unchanged' };
}

// ---------- CLI ----------
const [cmd, x, y] = args;
const loadProfile = () => JSON.parse(fs.readFileSync(flag('profile', '.pikto/profile.json'), 'utf8'));
try {
  if (cmd === 'audit') {
    const repo = x || '.', a = audit(repo);
    if (args.includes('--check')) { // drift: every icon glyph must be allowed in .pikto/audit.json (written by apply)
      const af = path.join(repo, '.pikto', 'audit.json'), allow = fs.existsSync(af) ? JSON.parse(fs.readFileSync(af, 'utf8')).allow : [];
      const drift = a.uses.filter((u) => u.kind === 'icon' && !allow.some((al) => al.file === u.file && al.glyph === u.glyph)).map(({ glyph, file, line, role, meaning }) => ({ glyph, at: `${file}:${line}`, role, meaning }));
      out({ ok: !drift.length, drift, allowed: a.uses.filter((u) => u.kind === 'icon').length - drift.length });
      if (drift.length) process.exitCode = 1;
    } else out(args.includes('--full') ? a : { ...a, uses: undefined });
  }
  else if (cmd === 'profile') out(profile(x || '.'));
  else if (cmd === 'search') out((await search(x, loadProfile())).slice(0, +flag('limit', 8)).map(({ id, set, license, construction, grid, stroke_ratio, score, why, excluded }) => ({ id, set, license, construction, grid, stroke_ratio, score, why, excluded })));
  else if (cmd === 'adapt') { const p = loadProfile(); const a = await adapt(x, p); out({ ...a, validation: validate(a.fragment, p) }); }
  else if (cmd === 'validate') out(validate(fs.readFileSync(x, 'utf8').replace(/^[\s\S]*?<svg[^>]*>|<\/svg>[\s\S]*$/g, ''), loadProfile()));
  else if (cmd === 'differ') { const p = loadProfile(); const ids = [x, ...args.slice(2).filter((v, i, arr) => !v.startsWith('--') && !(arr[i - 1] || '').startsWith('--'))]; out(await Promise.all(ids.map((i) => differ(i, p)))); }
  else if (cmd === 'add') out(await addIcon(x, y, loadProfile()));
  else if (cmd === 'apply') { const repo = x || '.'; const r = await apply(repo, loadProfile(), JSON.parse(fs.readFileSync(flag('decision', path.join(repo, '.pikto', 'decision.json')), 'utf8')), args.includes('--dry-run')); out(r); if (r.failed) process.exitCode = 1; }
  else if (cmd === 'sheet') { const repo = x || '.'; out(await sheet(repo, loadProfile(), JSON.parse(fs.readFileSync(flag('proposal', path.join(repo, '.pikto', 'proposal.json')), 'utf8')), flag('out', path.join(repo, '.pikto', 'sheet.html')))); }
  else console.log(`pikto <command>
  profile <repo>                     derive visual profile (JSON to stdout)
  search  <concept> --profile P      ranked, licence-filtered candidates from Iconify
  adapt   <prefix:name> --profile P  transform to the repo's grid/stroke/colour convention + validation
  validate <file.svg> --profile P    check an SVG against the profile
  audit   <repo> [--full | --check]  DESIGN.md intent vs icon-like glyphs/SVG in code; --check exits 1 on glyphs not allowed in .pikto/audit.json
  differ  <id> [id…] --profile P     visual weight vs siblings, confusability, distance from the generic default
  add     <prefix:name> <name> --profile P [--meaning "…" --reading "…" --permission "…"]   adapt + validate + write + provenance
  sheet   <repo> --profile P [--proposal F --out sheet.html]   contact sheet: today's glyph → proposed icon, per role family
  apply   <repo> --profile P [--decision F --dry-run]   write the icons module, replace call sites, provenance, DESIGN.md ## Iconography
global: --offline   use only local @iconify-json/* packages and the cache (${'$'}PIKTO_CACHE, default ~/.cache/pikto)`);
} catch (e) { console.error('error:', e.message); process.exit(1); }
