import { readFileSync } from 'node:fs'

/**
 * Chargeur .env minimaliste (sans dépendance).
 * Ne surcharge jamais une variable déjà présente dans l'environnement.
 */
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
} catch {
  /* .env absent : les variables d'environnement système suffisent */
}
