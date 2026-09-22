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

// GARDE-FOU HORAIRE. Les runs planifiés de GitHub Actions arrivent en retard et de façon
// irrégulière (mesuré sur 120 runs : 13 réveils/jour au lieu de 96, écart médian 24 min mais
// jusqu'à 7 h). Un item dû à 17 h peut donc être pris à 23 h et sortir en pleine nuit — c'est
// arrivé le 21/09/2026 (pyramide-japon postée à 00 h 15). Hors fenêtre, on ne publie pas : on
// attend le réveil suivant, quitte à sortir le lendemain — jamais un post nocturne.
//
// Deux fenêtres (config.json, donc données) : 17 h–21 h pour une vidéo normale, 12 h–21 h pour
// une réaction à l'actu, qui perd sa valeur en attendant le soir. Le créneau de l'item prime sur
// le début de fenêtre : un post délibérément calé à 12 h sort à 12 h, sans être retenu jusqu'à
// 17 h. La fin de fenêtre, elle, ne se négocie pas.
function heureLocale(tz, d) {
  // en-GB et pas fr-FR : le format français rend « 17 h », qui ne se convertit pas en nombre.
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Europe/Paris', hour: '2-digit', hour12: false,
  }).format(d));
}

export function dansFenetre(cfg, item, now = new Date()) {
  const f = cfg.fenetre_publication;
  if (!f) return true;
  const w = (item && (item.origine === 'actu' || Number(item.priorite || 0) >= 1))
    ? (f.actu || f.normale) : (f.normale || f.actu);
  if (!w) return true;
  const h = heureLocale(f.tz, now);
  if (Number.isNaN(h)) return true;          // fuseau illisible : on ne bloque pas la publication
  const creneau = item && item.post_at ? heureLocale(f.tz, new Date(item.post_at)) : NaN;
  const debut = Number.isNaN(creneau) ? w.debut : Math.min(w.debut, creneau);
  return h >= debut && h < w.fin;
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
