// Renouvellement du token longue durée Instagram (60 j) — job Actions hebdomadaire.
// 1. échange le token courant contre un token frais (compteur remis à ~60 j) ;
// 2. réécrit le secret IG_ACCESS_TOKEN via `gh secret set` (nécessite GH_PAT_SECRETS,
//    un PAT fine-grained avec Secrets: read/write sur ce repo, exposé en env GH_TOKEN).
// Idempotent et sans danger : si le token est trop récent (<24 h) pour être rafraîchi,
// l'API renvoie une erreur explicite -> on log et on sort en succès.
import { execFileSync } from 'node:child_process';
import { loadConfig, requireToken } from './lib.mjs';

const REPO = process.env.GITHUB_REPOSITORY || 'Koroscalista/histoviz-media';

async function main() {
  const cfg = loadConfig();
  const token = requireToken();

  const url = new URL(`${cfg.graph_host}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);

  const res = await fetch(url, { method: 'GET' });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    // Token trop récent pour un refresh : non bloquant.
    if (/24 hours|too recent|not enough time/i.test(msg)) {
      console.log(`Refresh ignoré (token trop récent): ${msg}`);
      return;
    }
    throw new Error(`Refresh échoué: ${msg}`);
  }

  const newToken = json.access_token;
  const days = Math.round((json.expires_in || 0) / 86400);
  if (!newToken) throw new Error('Réponse sans access_token.');
  console.log(`Token rafraîchi. Nouvelle expiration ≈ ${days} j.`);

  if (newToken === token) {
    console.log('Token identique — pas de réécriture du secret.');
    return;
  }

  if (!process.env.GH_TOKEN) {
    throw new Error('GH_TOKEN (PAT fine-grained Secrets:write) absent — impossible de réécrire le secret.');
  }

  execFileSync('gh', ['secret', 'set', 'IG_ACCESS_TOKEN', '--repo', REPO, '--body', newToken], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  console.log('Secret IG_ACCESS_TOKEN mis à jour.');
}

main().catch((e) => {
  console.error('ÉCHEC refresh:', e.message);
  process.exit(1);
});
