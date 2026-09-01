// Runner B — publication. À chaque réveil : « un post est-il dû ? »
// Si oui : crée le conteneur Reel, attend la fin de l'encodage, publie, marque l'item publié.
// Au plus UN item par run. Aucun raisonnement, aucun LLM. Voir docs/FORMAT.md pour la file.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig, requireToken, loadQueue, pickDue, graph, sleep, redact,
  PUBLISHED_DIR,
} from './lib.mjs';

const DRY = process.argv.includes('--dry-run');

function log(...a) { console.log(...a.map((x) => redact(x))); }

async function waitContainer(cfg, creationId, token) {
  const deadline = Date.now() + cfg.container_poll.timeout_seconds * 1000;
  while (Date.now() < deadline) {
    const s = await graph(cfg, 'GET', creationId, { fields: 'status_code,status' }, token);
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new Error(`Conteneur ${s.status_code}: ${s.status || ''}`);
    }
    await sleep(cfg.container_poll.interval_seconds * 1000);
  }
  throw new Error('Timeout: le conteneur Reel n\'a pas fini d\'encoder à temps.');
}

async function publishItem(cfg, entry, token) {
  const { item } = entry;
  log(`→ Publication: ${entry.id} (${item.format || '?'}) @ ${item.publish_at}`);
  log(`  média: ${item.media_url}`);

  if (DRY) { log('  [dry-run] aucun appel API.'); return { dry: true }; }

  // 1. Conteneur
  const create = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, {
    media_type: item.media_type || 'REELS',
    video_url: item.media_url,
    caption: item.caption,
    share_to_feed: item.share_to_feed === false ? undefined : true,
  }, token);
  const creationId = create.id;
  log(`  conteneur créé: ${creationId}`);

  // 2. Attente encodage
  await waitContainer(cfg, creationId, token);
  log('  encodage terminé (FINISHED).');

  // 3. Publication
  const pub = await graph(cfg, 'POST', `${cfg.ig_user_id}/media_publish`, {
    creation_id: creationId,
  }, token);
  const mediaId = pub.id;
  log(`  publié: media id ${mediaId}`);

  // 4. Permalink (best-effort)
  let permalink = null;
  try {
    const meta = await graph(cfg, 'GET', mediaId, { fields: 'permalink' }, token);
    permalink = meta.permalink || null;
  } catch (e) { log(`  (permalink non récupéré: ${e.message})`); }

  return { ig_media_id: mediaId, ig_permalink: permalink };
}

// Déplace l'item de queue/ vers published/ avec le résultat.
function archive(entry, result) {
  const out = {
    ...entry.item,
    status: 'published',
    published_at: new Date().toISOString(),
    ig_media_id: result.ig_media_id || null,
    ig_permalink: result.ig_permalink || null,
  };
  mkdirSync(PUBLISHED_DIR, { recursive: true });
  writeFileSync(join(PUBLISHED_DIR, `${entry.file}`), JSON.stringify(out, null, 2) + '\n');
  rmSync(entry.path);
}

async function main() {
  const cfg = loadConfig();
  const now = new Date();
  const entries = loadQueue();
  const entry = pickDue(entries, now);

  if (!entry) {
    log(`Rien à publier (${entries.length} item(s) en file, aucun dû à ${now.toISOString()}).`);
    return;
  }

  const token = requireToken();
  const result = await publishItem(cfg, entry, token);

  if (DRY) return;
  archive(entry, result);
  log(`✓ Item archivé dans published/${entry.file}`);
  if (result.ig_permalink) log(`  ${result.ig_permalink}`);
}

main().catch((e) => {
  console.error('ÉCHEC:', redact(e.message));
  if (e.graph) console.error(redact(JSON.stringify(e.graph)));
  process.exit(1);
});
