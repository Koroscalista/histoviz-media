// Helpers partagés Runner B. Zéro dépendance (fetch natif Node 20+).
// Consomme la file au format « Bloc 1 » : stathisto/pipeline/README.md fait foi.
// Réplique en JS la sélection `a_publier` de pipeline/etats.py (statut/post_at/priorite).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const FILE_DIR = join(ROOT, 'file'); // équivalent de pipeline/file/

export function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
}

export function requireToken() {
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t || !t.trim()) {
    throw new Error('IG_ACCESS_TOKEN manquant (secret GitHub Actions, ou export local).');
  }
  return t.trim();
}

// Charge tous les items de file/*.json (hors README). Retourne {slug, file, path, item}.
export function loadFile() {
  let names;
  try {
    names = readdirSync(FILE_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      const path = join(FILE_DIR, n);
      const item = JSON.parse(readFileSync(path, 'utf8'));
      return { slug: item.slug || n.replace(/\.json$/, ''), file: n, path, item };
    });
}

// Un item est « dû » = statut `programmé`, non bloqué/abandonné, et post_at (ISO+offset)
// passé. Miroir exact de `a_publier` / `est_actif` côté Python (pipeline/etats.py) : un hold
// ou un kill posé par Alexis dans Notion doit empêcher la publication ici aussi.
export function isDue(item, now = new Date()) {
  if (item.statut !== 'programmé') return false;
  if (item.bloque || item.abandonne) return false;
  if (!item.post_at) return false;
  const t = new Date(item.post_at);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() <= now.getTime();
}

// Prochain item à poster : priorité décroissante, puis post_at croissant (tri de a_publier).
export function pickDue(entries, now = new Date()) {
  const due = entries.filter((e) => isDue(e.item, now));
  due.sort((a, b) => {
    const pa = Number(a.item.priorite || 0);
    const pb = Number(b.item.priorite || 0);
    if (pa !== pb) return pb - pa;
    return new Date(a.item.post_at) - new Date(b.item.post_at);
  });
  return due[0] || null;
}

// Appel Graph. `params` -> query string. POST par défaut, GET si method==='GET'.
export async function graph(cfg, method, path, params, token) {
  const url = new URL(`${cfg.graph_host}/${cfg.graph_version}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }
  body.set('access_token', token);

  let res;
  if (method === 'GET') {
    url.search = body.toString();
    res = await fetch(url, { method: 'GET' });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const e = json.error || {};
    const msg = e.message || text;
    const err = new Error(`Graph ${res.status}: ${msg}`);
    err.graph = json;
    throw err;
  }
  return json;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Redacte le token dans un log éventuel.
export function redact(s) {
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t) return s;
  return String(s).split(t).join('<token>');
}
