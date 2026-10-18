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

## Déployer sur Render

Le fichier `render.yaml` à la racine configure un Web Service Node.js pour la branche `main`. Il utilise `server/` comme racine, `npm ci` pour l'installation, `npm start` pour démarrer, et `/api/health` pour le health check. Le serveur écoute sur `0.0.0.0` et le port fourni par Render via `PORT`.

Pour créer le service, connecter le dépôt GitHub `SNcodeur2001/PayBridge` à Render puis créer un Blueprint depuis `render.yaml`. Le service démarre en simulation ; aucun identifiant Bitnob n'est nécessaire et les paiements live restent désactivés. Render génère `API_KEY` pour protéger `POST /api/payout` ; sa valeur est consultable dans l'environnement du service. Les autres endpoints restent publics comme dans la version actuelle.

Le plan Free est configuré pour éviter tout coût par défaut. Le stockage étant en mémoire, les données de simulation sont perdues au redémarrage ou au réveil du service ; ce déploiement convient aux essais d'API, pas à une exploitation avec des données à conserver.

## Vérifier la connexion Bitnob

Configurer `BITNOB_CLIENT_ID` et `BITNOB_CLIENT_SECRET` dans `server/.env` ou dans le `.env` à la racine du dépôt, redémarrer le serveur puis appeler `GET /api/whoami`. Cette route signe l’appel Bitnob `GET /api/whoami` et renvoie son identité ainsi que les permissions. Sans identifiants valides, le serveur ne démarre pas.

L’API lit les soldes, transactions, taux, bénéficiaires, adresses, clients, comptes virtuels et payouts Bitnob. `GET /api/transfers` liste les payouts et retraits Bitnob; `GET /api/transactions` transmet l’historique Bitnob avec sa pagination. Les parcours crypto utilisent `POST /api/withdrawals` puis `GET /api/transactions/:idOrReference`. Le parcours payout peut utiliser les étapes distinctes `/api/payouts/quotes`, `/:quoteId/initialize`, `/:quoteId/finalize`, puis consulter `GET /api/payouts/:id` ou `/reference/:reference`. `POST /api/transfers` et `POST /api/payout` conservent aussi leur parcours composé. Ces opérations peuvent déplacer des fonds et sont irréversibles en production. Configurer des identifiants et une URL Sandbox Bitnob avant de les valider; l’API ne détecte ni ne force le Sandbox. La devise PayBridge `USD` est traduite en actif source Bitnob `USDT` pour les payouts.

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
| `GET` | `/api/balances` | Soldes disponibles fournis par Bitnob (`available_balance`) |
| `GET` | `/api/balances/:currency` | Solde Bitnob d’un actif, par exemple `USDC` |
| `GET` | `/api/stablecoins/supported-chains` | Réseaux supportés par Bitnob pour les stablecoins |
| `GET` | `/api/transactions` | Transactions Bitnob, avec pagination par curseur |
| `GET` | `/api/transactions/:idOrReference` | Détail et statut Bitnob d’une transaction |
| `GET` | `/api/rates` | Taux de change |
| `GET` | `/api/payouts/supported-countries` | Corridors et pays actuellement activés chez Bitnob |
| `GET` | `/api/payouts/supported-countries/:country` | Champs bénéficiaire exigés pour un pays Bitnob |
| `GET` | `/api/payouts` | Lister les payouts Bitnob |
| `POST` | `/api/payouts/quotes` | Créer une cotation Bitnob |
| `POST` | `/api/payouts/:quoteId/initialize` | Initialiser un payout avec une référence unique et un bénéficiaire |
| `POST` | `/api/payouts/:quoteId/finalize` | Finaliser le payout; Bitnob débite le solde |
| `GET` | `/api/payouts/:id` | Consulter un payout par identifiant |
| `GET` | `/api/payouts/reference/:reference` | Consulter un payout par référence |
| `POST` | `/api/withdrawals` | Créer un retrait crypto en unités minimales; référence fournie par le client |
| `GET` | `/api/whoami` | Identité et permissions Bitnob |
| `GET` | `/api/account-lookup?country&accountNumber&bankCode&method` | Recherche d’un titulaire |
| `POST` | `/api/quotes` | Créer un devis |
| `GET`, `POST` | `/api/transfers` | Lire les transferts Bitnob ou en créer un |
| `GET` | `/api/transfers/:id` | Consulter un transfert |
| `GET`, `POST`, `PUT` | `/api/beneficiaries` | Lister, ajouter ou modifier un bénéficiaire (`PUT /:id`) |
| `POST` | `/api/lightning/decode` | Décoder une facture Lightning |
| `POST` | `/api/lightning/invoices` | Créer une facture Lightning |
| `POST` | `/api/lightning/pay` | Payer une facture Lightning |
| `POST` | `/api/addresses/validate` | Vérifier le format d’une adresse crypto |
| `GET` | `/api/addresses` | Lister les adresses gérées par Bitnob |
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

La clé `API_KEY`, si configurée, protège `POST /api/payout`, les écritures `/api/payouts/*` et `POST /api/withdrawals` via `Authorization: Bearer <API_KEY>`. Elle ne protège pas encore `POST /api/transfers` ni `POST /api/lightning/pay`. `ALLOWED_ORIGINS` doit contenir les origines exactes (ex. `http://localhost:5173`), séparées par des virgules, lorsque le frontend envoie `credentials: 'include'`; le middleware renvoie alors `Access-Control-Allow-Credentials: true`. Ne pas combiner les credentials avec `*`.

## Configuration Bitnob et tunnel webhook

Configurer les identifiants Bitnob et `BITNOB_WEBHOOK_SECRET` dans `.env`, puis définir `PUBLIC_BASE_URL` avec l’URL HTTPS publique de l’API. Les webhooks exigent une signature valide. Le serveur interroge Bitnob toutes les 20 secondes pour réconcilier les opérations PayBridge encore ouvertes.

## Exploitation

- Le dépôt JSON local convient à une seule instance; utiliser une base transactionnelle partagée pour plusieurs instances en production.
- Les endpoints et opérations restent soumis aux permissions, corridors, soldes et à l’environnement sandbox/production des identifiants Bitnob configurés.
