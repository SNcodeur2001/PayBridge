# PayBridge API

Backend Express PayBridge Africa connecté exclusivement à Bitnob. Les identifiants Bitnob restent côté serveur et sont obligatoires au démarrage. Aucune réponse ou opération de paiement simulée n’est disponible.

## Démarrer

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

API locale : `http://localhost:4000`. Les opérations démarrent réellement chez Bitnob selon l’environnement des identifiants configurés. Le fichier `server/.data/store.json` conserve uniquement l’état local nécessaire à la réconciliation des opérations lancées par PayBridge et à la déduplication des webhooks; il est ignoré par Git.

## Vérifier la connexion Bitnob

Configurer `BITNOB_CLIENT_ID` et `BITNOB_CLIENT_SECRET` dans `server/.env` ou dans le `.env` à la racine du dépôt, redémarrer le serveur puis appeler `GET /api/bitnob/whoami`. Cette route signe l’appel Bitnob `GET /api/whoami` et renvoie son identité ainsi que les permissions. Sans identifiants valides, le serveur ne démarre pas.

L’API lit les soldes, transactions, taux, banques, bénéficiaires, adresses, clients, comptes virtuels et payouts Bitnob. `GET /api/transfers` liste les payouts et retraits Bitnob; `GET /api/deposits` combine l’historique de transactions Bitnob et les dépôts des comptes virtuels Bitnob. Les opérations de création sont envoyées au fournisseur. `POST /api/transfers`, `POST /api/payout`, les retraits crypto et `POST /api/lightning/pay` peuvent déplacer des fonds; ces opérations sont irréversibles en production. Configurer des identifiants sandbox Bitnob pour valider les corridors et permissions avant la production. La devise PayBridge `USD` est traduite en actif source Bitnob `USDT` pour les payouts.

Les réponses de consultation proviennent de Bitnob. Le dépôt JSON n’est pas une source de données de bénéficiaires, soldes, transactions ou dépôts. Il sert au suivi des références d’opérations créées par PayBridge et à la déduplication des webhooks; plusieurs instances de production nécessitent un stockage partagé. Les webhooks sont vérifiés avec HMAC-SHA512 sur le corps brut.

## Architecture

```text
src/
├── app.js                         # composition des dépendances et middleware Express
├── server.js                      # cycle de vie du serveur HTTP
├── config/                        # paramètres et données de référence
├── core/                          # erreurs métier et fonctions communes
├── middleware/                    # CORS, API key, erreurs, async handlers
├── providers/                     # transport signé et fournisseur Bitnob
├── repositories/                  # état opérationnel local pour rapprochement
├── routes/                        # routes regroupées par domaine
└── services/                      # workflows métier, indépendants d'Express
```

Les services et le fournisseur Bitnob utilisent des classes injectées dans `createApp`. Les routes contiennent le traitement HTTP et la validation d’entrée; les opérations et données financières passent par Bitnob. Le dépôt local conserve uniquement les références nécessaires au suivi opérationnel.

## Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | État du serveur et fournisseur actif |
| `GET` | `/api/wallet` | Soldes disponibles fournis par Bitnob (`available_balance`) |
| `GET` | `/api/deposits` | Historique des dépôts on-chain et NGN reçus |
| `GET` | `/api/rates` | Taux de change |
| `GET` | `/api/banks/:country` | Banques d’un pays |
| `GET` | `/api/payouts/supported-countries` | Corridors et pays actuellement activés chez Bitnob |
| `GET` | `/api/payouts/supported-countries/:country` | Champs bénéficiaire exigés pour un pays Bitnob |
| `GET` | `/api/account-lookup?country&accountNumber&bankCode&method` | Recherche d’un titulaire |
| `POST` | `/api/quotes` | Créer un devis |
| `GET`, `POST` | `/api/transfers` | Lire les transferts Bitnob ou en créer un |
| `GET` | `/api/transfers/:id` | Consulter un transfert |
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
| `GET` | `/api/virtual-account-deposits` | Dépôts issus des transactions Bitnob des comptes virtuels |
| `POST` | `/api/payout` | Créer un payout pour une intégration B2B |
| `POST` | `/api/webhooks/bitnob` | Webhook Bitnob, signature HMAC et déduplication |
| `GET` | `/api/events` | Changements d’état des transferts en SSE |

La clé `API_KEY`, si configurée, protège `POST /api/payout` via `Authorization: Bearer <API_KEY>`. `ALLOWED_ORIGINS` doit contenir les origines exactes (ex. `http://localhost:5173`), séparées par des virgules, lorsque le frontend envoie `credentials: 'include'`; le middleware renvoie alors `Access-Control-Allow-Credentials: true`. Ne pas combiner les credentials avec `*`.

## Configuration Bitnob et tunnel webhook

Configurer les identifiants Bitnob et `BITNOB_WEBHOOK_SECRET` dans `.env`, puis définir `PUBLIC_BASE_URL` avec l’URL HTTPS publique de l’API. Les webhooks exigent une signature valide. Le serveur interroge Bitnob toutes les 20 secondes pour réconcilier les opérations PayBridge encore ouvertes.

## Exploitation

- Le dépôt JSON local convient à une seule instance; utiliser une base transactionnelle partagée pour plusieurs instances en production.
- Les endpoints et opérations restent soumis aux permissions, corridors, soldes et à l’environnement sandbox/production des identifiants Bitnob configurés.
