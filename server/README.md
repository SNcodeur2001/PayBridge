# PayBridge API

Backend Express du prototype PayBridge Africa. Les clés Bitnob restent côté serveur. Sans `BITNOB_CLIENT_ID` et `BITNOB_CLIENT_SECRET`, l’API démarre automatiquement avec le fournisseur simulé et n’effectue aucun paiement réel.

## Démarrer

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

API locale : `http://localhost:4000`. Les transferts, bénéficiaires, dépôts reçus et identifiants de webhooks sont stockés dans `server/.data/store.json`, ignoré par Git.

## Vérifier la connexion Bitnob

Configurer `BITNOB_CLIENT_ID` et `BITNOB_CLIENT_SECRET` dans `server/.env` ou dans le `.env` à la racine du dépôt, redémarrer le serveur puis appeler `GET /api/bitnob/whoami`. Cette route signe uniquement l’appel Bitnob `GET /api/whoami` et renvoie l’état du client, l’environnement et les permissions. Les opérations ci-dessous sont raccordées au fournisseur Bitnob quand `BITNOB_PAYMENTS_ENABLED=true`; à `false`, les réponses de test restent simulées.

Le mode Bitnob raccorde les soldes, transactions reçues, taux, banques, vérifications de compte, devis, payouts, bénéficiaires bancaires et crypto, retraits crypto, paiements et factures Lightning, adresses, clients et comptes virtuels NGN. Les clients et comptes virtuels exigent le mode Bitnob actif. `POST /api/transfers` et `POST /api/payout` peuvent débiter le portefeuille Bitnob; les transferts crypto et `POST /api/lightning/pay` envoient des fonds. Ces opérations sont irréversibles en production. Utiliser les identifiants sandbox pour valider les corridors et les permissions. La devise `USD` est traduite en actif source `USDT` pour les payouts.

Les bénéficiaires sont synchronisés depuis Bitnob en mode live. Les transferts, dépôts de comptes virtuels et identifiants de déduplication sont persistés localement pour le prototype; une base partagée sera nécessaire pour plusieurs instances en production. Les webhooks sont vérifiés avec HMAC-SHA512 sur le corps brut et dédupliqués.

## Architecture

```text
src/
├── app.js                         # composition des dépendances et middleware Express
├── server.js                      # cycle de vie du serveur HTTP
├── config/                        # paramètres et données de référence
├── core/                          # erreurs métier et fonctions communes
├── middleware/                    # CORS, API key, erreurs, async handlers
├── providers/                     # contrat fournisseur : simulation et Bitnob
├── repositories/                     # adaptateurs mémoire et fichier JSON
├── routes/                        # routes regroupées par domaine
└── services/                      # workflows métier, indépendants d'Express
```

Les services et fournisseurs utilisent des classes injectées dans `createApp`. Les routes ne contiennent que le traitement HTTP et la validation d’entrée; les règles de paiement sont partagées par le mode simulation et Bitnob. Pour remplacer le stockage mémoire, on peut fournir un autre repository sans réécrire les services.

## Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | État du serveur et fournisseur actif |
| `GET` | `/api/wallet` | Soldes Bitnob et synchronisation de secours depuis les transactions |
| `GET` | `/api/deposits` | Historique des dépôts on-chain et NGN reçus |
| `GET` | `/api/rates` | Taux de change |
| `GET` | `/api/banks/:country` | Banques d’un pays |
| `GET` | `/api/account-lookup?country&accountNumber&bankCode&method` | Recherche d’un titulaire |
| `POST` | `/api/quotes` | Créer un devis |
| `GET`, `POST` | `/api/transfers` | Lister ou créer un transfert |
| `GET` | `/api/transfers/:id` | Consulter un transfert |
| `POST` | `/api/transfers/:id/simulate-deposit` | Financer un payout on-chain en sandbox |
| `GET`, `POST`, `PUT` | `/api/beneficiaries` | Lister, ajouter ou modifier un bénéficiaire (`PUT /:id`) |
| `POST` | `/api/lightning/decode` | Décoder une facture Lightning |
| `POST` | `/api/lightning/invoices` | Créer une facture Lightning |
| `POST` | `/api/lightning/pay` | Payer une facture Lightning |
| `POST` | `/api/addresses/validate` | Vérifier le format d’une adresse crypto |
| `GET` | `/api/addresses/deposit` | Lister les adresses (`?chain=BTC` filtre un réseau) |
| `GET`, `POST` | `/api/customers` | Lister ou créer un client Bitnob |
| `GET`, `POST` | `/api/virtual-accounts` | Lister ou créer des comptes virtuels NGN |
| `GET` | `/api/virtual-accounts/supported-currencies` | Devises prises en charge |
| `GET` | `/api/virtual-accounts/:id` | Consulter un compte virtuel |
| `GET` | `/api/virtual-accounts/:id/transactions` | Dépôts du compte virtuel |
| `PATCH` | `/api/virtual-accounts/:id/alias` | Modifier son alias |
| `POST` | `/api/virtual-accounts/:id/simulate-deposit` | Simuler un dépôt (sandbox seulement) |
| `GET` | `/api/virtual-account-deposits` | Dépôts reçus via webhook |
| `POST` | `/api/payout` | Créer un payout pour une intégration B2B |
| `POST` | `/api/webhooks/bitnob` | Webhook Bitnob, signature HMAC et déduplication |
| `GET` | `/api/events` | Changements d’état des transferts en SSE |

La clé `API_KEY`, si configurée, protège `POST /api/payout` via `Authorization: Bearer <API_KEY>`. CORS autorise toutes les origines par défaut; définir `ALLOWED_ORIGINS` avec une liste CSV pour restreindre l’accès navigateur. Les opérations Bitnob de paiement restent désactivées par défaut, même si les identifiants sont présents.

## Configuration Bitnob et tunnel webhook

Configurer les identifiants et `BITNOB_WEBHOOK_SECRET` dans `.env`, puis définir `PUBLIC_BASE_URL` avec l’URL HTTPS fournie par ngrok ou Cloudflare Tunnel. En mode live, les webhooks exigent une signature valide. Le serveur utilise un polling de secours toutes les 20 secondes pour les transferts qui ne sont pas terminés.

## Limites du prototype

- Le mode simulé reproduit les formes de réponse utiles à la démo; les adresses, taux, wallets, factures et statuts simulés ne correspondent pas à des fonds réels.
- Le fichier JSON convient au prototype local, mais une base transactionnelle partagée est requise pour plusieurs instances en production.
- Les opérations sortantes restent soumises aux permissions, corridors, soldes et au mode sandbox/production du compte Bitnob.
