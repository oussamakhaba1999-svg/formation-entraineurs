const HEADERS_ = ['Date', 'Référence', 'Nom', 'Prénom', 'CIN', 'Téléphone', 'E-mail', 'Club / association', 'Ville', 'Consentement'];
const CAPACITY_ = 80;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Formation des entraîneurs | Inscription')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function config_() {
  const p = PropertiesService.getScriptProperties();
  return { id: p.getProperty('SPREADSHEET_ID'), open: p.getProperty('REGISTRATION_OPEN') === 'true', privacy: p.getProperty('PRIVACY_NOTICE') || '' };
}
function sheet_() {
  const c = config_();
  if (!c.id) throw new Error('Configuration manquante');
  const s = SpreadsheetApp.openById(c.id).getSheetByName('Inscriptions');
  if (!s || s.getRange(1, 1, 1, HEADERS_.length).getValues()[0].join('|') !== HEADERS_.join('|')) throw new Error('Feuille non initialisée');
  return s;
}
// Run manually in the Apps Script editor; trailing underscore prevents client calls.
function setup_() {
  const c = config_();
  if (!c.id) throw new Error('Définir SPREADSHEET_ID');
  const book = SpreadsheetApp.openById(c.id);
  const s = book.getSheetByName('Inscriptions') || book.insertSheet('Inscriptions');
  if (s.getLastRow() === 0) { s.appendRow(HEADERS_); s.setFrozenRows(1); }
  sheet_();
}
function getStatus() {
  try {
    const c = config_();
    const remaining = Math.max(0, CAPACITY_ - Math.max(0, sheet_().getLastRow() - 1));
    return { available: c.open && !!c.privacy && remaining > 0, remaining, privacy: c.privacy };
  } catch (_) { return { available: false, remaining: null, privacy: '' }; }
}
function validate_(p) {
  if (!p || typeof p !== 'object' || p.website || p.consent !== true) return null;
  const clean = {};
  for (const key of ['nom', 'prenom', 'cin', 'telephone', 'email', 'club', 'ville']) {
    if (typeof p[key] !== 'string') return null;
    clean[key] = p[key].normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!clean[key] || clean[key].length > (key === 'email' ? 254 : 100) || /[\x00-\x1f\x7f]/.test(clean[key])) return null;
  }
  clean.cin = clean.cin.replace(/\s/g, '').toUpperCase();
  clean.telephone = clean.telephone.replace(/[\s().-]/g, '');
  if (!/^[A-Z]{1,2}\d{4,8}$/.test(clean.cin) || !/^\+?\d{9,15}$/.test(clean.telephone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) return null;
  return clean;
}
function safeCell_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function registerParticipant(payload) {
  const p = validate_(payload);
  if (!p) return { ok: false, code: 'INVALID' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, code: 'BUSY' };
  try {
    const c = config_();
    if (!c.open || !c.privacy) return { ok: false, code: 'CLOSED' };
    const s = sheet_();
    const count = Math.max(0, s.getLastRow() - 1);
    const cins = count ? s.getRange(2, 5, count, 1).getDisplayValues().map(r => r[0].replace(/\s/g, '').toUpperCase()) : [];
    // Return a generic refusal to avoid publicly confirming a CIN's presence.
    if (cins.includes(p.cin)) return { ok: false, code: 'REFUSED' };
    if (count >= CAPACITY_) return { ok: false, code: 'FULL', remaining: 0 };
    const reference = Utilities.getUuid();
    s.appendRow([new Date(), reference, p.nom, p.prenom, p.cin, p.telephone, p.email, p.club, p.ville, 'Accepté'].map(v => typeof v === 'string' ? safeCell_(v) : v));
    SpreadsheetApp.flush();
    return { ok: true, reference, remaining: CAPACITY_ - count - 1 };
  } catch (_) { return { ok: false, code: 'UNAVAILABLE' }; }
  finally { lock.releaseLock(); }
}
