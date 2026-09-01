// Runner B — publication. À chaque réveil : « un post est-il dû ? »
// Si oui : crée le conteneur Reel, attend la fin de l'encodage, publie, puis avance l'item
// `programmé → publié` SUR PLACE (statut + publication{} + historique), comme avancer_fichier.
// Au plus UN item par run. Aucun raisonnement, aucun LLM.
// Format de file = Bloc 1 : stathisto/pipeline/README.md fait foi.
import { writeFileSync } from 'node:fs';
import {
  loadConfig, requireToken, loadFile, pickDue, graph, sleep, redact,
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
  const mp4 = item.media?.mp4_url;
  if (!mp4) throw new Error(`Item ${entry.slug}: media.mp4_url manquant.`);

  log(`→ Publication: ${entry.slug} (${item.format || '?'}/${item.type || '-'}) @ ${item.post_at}`);
  log(`  média: ${mp4}`);
  if (DRY) { log('  [dry-run] aucun appel API.'); return { dry: true }; }

  // 1. Conteneur Reel
  const create = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, {
    media_type: 'REELS',
    video_url: mp4,
    caption: item.caption,
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

  return { media_id: mediaId, permalink };
}

// Avance l'item programmé → publié SUR PLACE, comme etats.avancer_fichier.
function marquerPublie(entry, result) {
  const now = new Date().toISOString();
  const it = entry.item;
  it.statut = 'publié';
  it.publication = {
    media_id: result.media_id || null,
    permalink: result.permalink || null,
    published_at: now,
  };
  it.historique = Array.isArray(it.historique) ? it.historique : [];
  it.historique.push({ statut: 'publié', at: now });
  writeFileSync(entry.path, JSON.stringify(it, null, 2) + '\n');
}

async function main() {
  const cfg = loadConfig();
  const now = new Date();
  const entries = loadFile();
  const entry = pickDue(entries, now);

  if (!entry) {
    log(`Rien à publier (${entries.length} item(s) en file, aucun programmé/dû à ${now.toISOString()}).`);
    return;
  }

  const token = requireToken();
  const result = await publishItem(cfg, entry, token);

  if (DRY) return;
  marquerPublie(entry, result);
  log(`✓ ${entry.slug} → publié (file/${entry.file})`);
  if (result.permalink) log(`  ${result.permalink}`);
}

main().catch((e) => {
  console.error('ÉCHEC:', redact(e.message));
  if (e.graph) console.error(redact(JSON.stringify(e.graph)));
  process.exit(1);
});
