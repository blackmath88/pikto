#!/usr/bin/env node
// pikto — thin vertical slice.
// repo -> visual profile -> search (Iconify) -> rank -> adapt -> validate -> add to project (with provenance).
// Deterministic only. The calling agent (LLM) decides WHERE an icon is needed and WHICH concept/candidate to use.
import fs from 'node:fs';
import path from 'node:path';
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
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
const args = process.argv.slice(2);
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
    if (frags.length >= 5 && (!registry || frags.length > registry.count)) {
      const exportName = src.match(/export const (\w+)\s*=\s*{/)?.[1];
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
  const grid = component?.grid ?? Number(mode(grids)) ?? 24;
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
      grid, grid_consistency: gridConsistency, stroke_width: sw, stroke_ratio: sw ? +(sw / grid).toFixed(4) : null,
      stroke_width_at_24: sw ? +((sw / grid) * 24).toFixed(2) : null,
      linecap: mode(caps), linejoin: mode(joins),
      construction: { stroke_shapes: nStroke, fill_shapes: construction.length - nStroke, dominant: nStroke >= construction.length / 2 ? 'stroke' : 'fill' },
      fill_convention: registry ? 'fill shapes carry stroke="none"; stroke shapes carry fill="none"; colour inherited from <svg>' : 'currentColor',
      render_sizes: [...new Set(sizes)],
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
  const lists = [getJSON(`${API}/search?query=${encodeURIComponent(query)}&limit=150`)];
  if (fam.length) lists.push(getJSON(`${API}/search?query=${encodeURIComponent(query)}&limit=64&prefixes=${fam.join(',')}`));
  const ids = [...new Set((await Promise.all(lists)).flatMap((r) => r.icons))];
  const byPrefix = {};
  ids.forEach((id) => { const [p, n] = id.split(':'); (byPrefix[p] ??= []).push(n); });
  const cols = await getJSON(`${API}/collections?prefixes=${Object.keys(byPrefix).join(',')}`);
  const target = prof.icon_system;
  const cands = [];
  await Promise.all(Object.entries(byPrefix).map(async ([p, names]) => {
    const col = cols[p]; if (!col) return;
    const data = await getJSON(`${API}/${p}.json?icons=${names.join(',')}`);
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
  const data = await getJSON(`${API}/${p}.json?icons=${n}`);
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
    for (const c of ['fill', 'stroke', 'color', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) delete a[c];
    if (isStroke) Object.assign(a, { fill: 'none', 'stroke-linecap': t.linecap || 'round', 'stroke-linejoin': t.linejoin || 'round', 'stroke-width': String(t.stroke_width ?? +(t.grid / 16).toFixed(2)) });
    else a.stroke = 'none';
    return `<${name} ${Object.entries(a).map(([kk, v]) => `${kk}="${v}"`).join(' ')}/>`;
  });
  const isStroke = outEls.some((e) => e.includes('fill="none"'));
  ops.push(isStroke ? `normalize strokes → width ${t.stroke_width}, caps ${t.linecap}, joins ${t.linejoin}` : 'fill shapes: drop hard-coded colour, add stroke="none" (repo convention)');
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
  const col = (await getJSON(`${API}/collections?prefixes=${p}`))[p];
  const prov = { name, source: id, set: col.name, version: col.version, license: col.license, author: col.author, source_url: `${API}/${id.replace(':', '/')}.svg`, operations: a.operations, reading: flag('reading', null), permission: flag('permission', null), added: new Date().toISOString().slice(0, 10) };
  const reg = prof.icon_system.registry;
  let target;
  if (reg) {
    target = path.join(prof.repo, reg.file);
    let src = fs.readFileSync(target, 'utf8');
    if (reg.names.includes(name)) throw new Error(`icon "${name}" already exists in ${reg.file}`);
    const start = src.indexOf(`export const ${reg.export}`);
    const close = src.indexOf('\n};', start);
    const line = `\t// ${id} (${col.name} ${col.version ?? ''}, ${col.license.spdx}) via pikto — see .pikto/provenance.json\n\t'${name}': \`${a.fragment}\`,`;
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

// ---------- CLI ----------
const [cmd, x, y] = args;
const loadProfile = () => JSON.parse(fs.readFileSync(flag('profile', '.pikto/profile.json'), 'utf8'));
try {
  if (cmd === 'profile') out(profile(x || '.'));
  else if (cmd === 'search') out((await search(x, loadProfile())).slice(0, +flag('limit', 8)).map(({ id, set, license, construction, grid, stroke_ratio, score, why, excluded }) => ({ id, set, license, construction, grid, stroke_ratio, score, why, excluded })));
  else if (cmd === 'adapt') { const p = loadProfile(); const a = await adapt(x, p); out({ ...a, validation: validate(a.fragment, p) }); }
  else if (cmd === 'validate') out(validate(fs.readFileSync(x, 'utf8').replace(/^[\s\S]*?<svg[^>]*>|<\/svg>[\s\S]*$/g, ''), loadProfile()));
  else if (cmd === 'differ') { const p = loadProfile(); const ids = [x, ...args.slice(2).filter((v, i, arr) => !v.startsWith('--') && !(arr[i - 1] || '').startsWith('--'))]; out(await Promise.all(ids.map((i) => differ(i, p)))); }
  else if (cmd === 'add') out(await addIcon(x, y, loadProfile()));
  else console.log(`pikto <command>
  profile <repo>                     derive visual profile (JSON to stdout)
  search  <concept> --profile P      ranked, licence-filtered candidates from Iconify
  adapt   <prefix:name> --profile P  transform to the repo's grid/stroke/colour convention + validation
  validate <file.svg> --profile P    check an SVG against the profile
  differ  <id> [id…] --profile P     visual weight vs siblings, confusability, distance from the generic default
  add     <prefix:name> <name> --profile P [--reading "…" --permission "…"]   adapt + validate + write + provenance`);
} catch (e) { console.error('error:', e.message); process.exit(1); }
