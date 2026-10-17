# PayBridge API

Backend Express du prototype PayBridge. Il fonctionne actuellement avec un fournisseur de paiement simulé : aucune opération financière réelle ni aucun appel Bitnob n'est effectué.

## Structure

```text
src/
├── app.js                         # création/configuration Express
├── server.js                      # démarrage HTTP
├── config/paybridge.js             # pays, devises et données de démo
├── providers/payment.provider.js   # contrat fournisseur + simulation actuelle
├── repositories/memory.repository.js # stockage temporaire en mémoire
└── routes/api.routes.js            # routes REST, webhook placeholder et SSE
```

Les routes consomment le contrat `paymentProvider`. L'adaptateur Bitnob viendra remplacer le fournisseur simulé; les routes et le format utilisé par le frontend pourront rester stables. Le stockage en mémoire est adapté au prototype : les données sont perdues au redémarrage.

## Démarrer

```bash
npm install
cp .env.example .env
npm run dev
```

Le serveur écoute sur `http://localhost:4000` par défaut.

## API actuelle

```text
GET  /api/health
GET  /api/wallet
GET  /api/rates
GET  /api/banks/:country
GET  /api/account-lookup?country&accountNumber&bankCode&method
POST /api/quotes
POST /api/transfers
GET  /api/transfers
GET  /api/transfers/:id
GET  /api/beneficiaries
POST /api/beneficiaries
GET  /api/events                 # SSE, statuts de transfert
POST /api/webhooks/bitnob        # indisponible en mode simulation (503)
```

Les transferts simulés passent de `pending` à `processing`, puis à `completed` (ou `failed` pour le montant de démonstration se terminant par `.13`). Chaque réponse de transfert indique `demo: true`.

## Suite prévue

1. Confirmer dans le compte et la documentation Bitnob les produits, corridors et accès disponibles.
2. Implémenter `providers/bitnob.provider.js` derrière le même contrat.
3. Ajouter la configuration et vérification de signature du webhook, puis exposer son URL publique avec ngrok ou Cloudflare Tunnel.
4. Remplacer le dépôt mémoire par une base persistante si le prototype doit survivre aux redémarrages.
