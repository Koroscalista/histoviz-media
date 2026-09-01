// Helpers partagés Runner B. Zéro dépendance (fetch natif Node 20+).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const QUEUE_DIR = join(ROOT, 'queue');
export const PUBLISHED_DIR = join(ROOT, 'published');

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

// Charge tous les items de queue/*.json (hors README). Retourne {id, path, item}.
export function loadQueue() {
  let names;
  try {
    names = readdirSync(QUEUE_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      const path = join(QUEUE_DIR, n);
      const item = JSON.parse(readFileSync(path, 'utf8'));
      return { id: item.id || n.replace(/\.json$/, ''), file: n, path, item };
    });
}

// Un item est « dû » s'il est programmé et que son heure est passée.
export function isDue(item, now = new Date()) {
  const status = item.status || 'scheduled';
  if (status !== 'scheduled') return false;
  if (!item.publish_at) return false;
  const t = new Date(item.publish_at);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() <= now.getTime();
}

// Choisit le prochain item à poster : priorité d'abord, puis publish_at le plus ancien.
export function pickDue(entries, now = new Date()) {
  const due = entries.filter((e) => isDue(e.item, now));
  due.sort((a, b) => {
    const pa = a.item.priority ? 1 : 0;
    const pb = b.item.priority ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return new Date(a.item.publish_at) - new Date(b.item.publish_at);
  });
  return due[0] || null;
}

// Appel Graph. `params` -> query string. POST par défaut si `method` non fourni pour /media*.
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

// Redacte un token dans un log éventuel.
export function redact(s) {
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t) return s;
  return String(s).split(t).join('<token>');
}
