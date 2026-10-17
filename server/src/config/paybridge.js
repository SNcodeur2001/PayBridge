export const COUNTRIES = Object.freeze({
  SN: { currency: 'XOF' }, CI: { currency: 'XOF' }, NG: { currency: 'NGN' },
  GH: { currency: 'GHS' }, KE: { currency: 'KES' }, CM: { currency: 'XAF' },
  ZA: { currency: 'ZAR' }, FR: { currency: 'EUR' }, US: { currency: 'USD' },
})

export const RATES_USD = Object.freeze({ USD: 1, EUR: 0.92, XOF: 603.5, XAF: 603.5, NGN: 1548, GHS: 15.4, KES: 129.2, ZAR: 18.1 })
export const SIMULATED_BALANCE = Object.freeze({ balance: 12480.35, currency: 'USD' })
export const SIMULATED_BANKS = Object.freeze({
  GH: [{ code: 'GCB', name: 'GCB Bank' }, { code: 'ECB', name: 'Ecobank Ghana' }, { code: 'GTB', name: 'GTBank Ghana' }],
  NG: [{ code: '058', name: 'GTBank Nigeria' }, { code: '011', name: 'First Bank NG' }, { code: '050', name: 'Access Bank' }],
  SN: [{ code: 'BSIC', name: 'BSIC Sénégal' }, { code: 'BOA', name: 'BOA Sénégal' }, { code: 'ECOBANK', name: 'Ecobank Sénégal' }],
  KE: [{ code: 'KCB', name: 'KCB Bank' }, { code: 'EQTY', name: 'Equity Bank' }, { code: 'COOP', name: 'Co-op Bank' }],
  CI: [{ code: 'SGCI', name: 'SGBCI' }, { code: 'BOACI', name: 'BOA CI' }, { code: 'ECOBANK', name: 'Ecobank CI' }],
  CM: [{ code: 'AFRILAND', name: 'Afriland First Bank' }, { code: 'SGBC', name: 'Société Générale CM' }],
  ZA: [{ code: 'FNB', name: 'FNB' }, { code: 'STD', name: 'Standard Bank' }, { code: 'NED', name: 'Nedbank' }],
})
