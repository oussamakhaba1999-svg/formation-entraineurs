const HEADERS_ = ['Date', 'Référence', 'Nom', 'Prénom', 'CIN', 'Téléphone', 'E-mail', 'Club / association', 'Ville', 'Consentement', 'Statut du paiement', 'Notifications envoyées'];
const CAPACITY_ = 80;
const ORGANIZERS_ = ['garaouimar@gmail.com', 'tkkamaltalha86@gmail.com', 'wissam2oussama@gmail.com'];
const PAYMENT_STATUS_ = 'En attente de vérification';

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
  const properties = PropertiesService.getScriptProperties();
  let id = properties.getProperty('SPREADSHEET_ID');
  if (!id) {
    const created = SpreadsheetApp.create('Formation entraîneurs Marrakech — Inscriptions');
    id = created.getId();
    properties.setProperty('SPREADSHEET_ID', id);
  }
  const book = SpreadsheetApp.openById(id);
  const s = book.getSheetByName('Inscriptions') || book.insertSheet('Inscriptions');
  if (s.getLastRow() === 0) s.appendRow(HEADERS_);
  else {
    const old = s.getRange(1, 1, 1, 10).getValues()[0];
    if (old.join('|') !== HEADERS_.slice(0, 10).join('|')) throw new Error('En-têtes incompatibles');
    s.getRange(1, 11, 1, 2).setValues([HEADERS_.slice(10)]);
    if (s.getLastRow() > 1) {
      const statuses = s.getRange(2, 11, s.getLastRow() - 1, 1).getValues();
      s.getRange(2, 11, statuses.length, 1).setValues(statuses.map(r => [r[0] || PAYMENT_STATUS_]));
    }
  }
  s.setFrozenRows(1);
  // Restricted file: never enable public or link sharing.
  ORGANIZERS_.forEach(email => book.addEditor(email));
  sheet_();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'retryNotifications_')) {
    ScriptApp.newTrigger('retryNotifications_').timeBased().everyMinutes(5).create();
  }
  return book.getUrl();
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
    if ((!['email', 'club'].includes(key) && !clean[key]) || clean[key].length > (key === 'email' ? 254 : 100) || /[\x00-\x1f\x7f]/.test(clean[key])) return null;
  }
  clean.cin = clean.cin.replace(/\s/g, '').toUpperCase();
  clean.telephone = clean.telephone.replace(/[\s().-]/g, '');
  if (!/^[A-Z]{1,2}\d{4,8}$/.test(clean.cin) || !/^\+?\d{9,15}$/.test(clean.telephone) || (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))) return null;
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
    s.appendRow([new Date(), reference, p.nom, p.prenom, p.cin, "'" + p.telephone, p.email, p.club, p.ville, 'Accepté', PAYMENT_STATUS_, ''].map(v => typeof v === 'string' ? safeCell_(v) : v));
    SpreadsheetApp.flush();
    // Notification errors must never turn an already saved registration into a failure.
    try { notifyRow_(s, s.getLastRow()); } catch (_) {}
    return { ok: true, reference, remaining: CAPACITY_ - count - 1 };
  } catch (_) { return { ok: false, code: 'UNAVAILABLE' }; }
  finally { lock.releaseLock(); }
}

// Private functions cannot be called via google.script.run.
function notifyRow_(s, row) {
  const values = s.getRange(row, 1, 1, HEADERS_.length).getValues()[0];
  let sent = String(values[11] || '').split(',').filter(Boolean);
  for (const recipient of ORGANIZERS_) {
    if (sent.includes(recipient)) continue;
    // Keep identity documents and contact details out of notification emails.
    MailApp.sendEmail({to: recipient, subject: 'Nouvelle inscription — Formation entraîneurs',
      body: 'Une nouvelle inscription a été enregistrée.\nRéférence : ' + values[1] +
        '\nPaiement : ' + values[10] + '\nConsultez le fichier privé : ' +
        SpreadsheetApp.openById(config_().id).getUrl()});
    sent.push(recipient);
    s.getRange(row, 12).setValue(sent.join(','));
    SpreadsheetApp.flush();
  }
}
function retryNotifications_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const s = sheet_();
    for (let row = 2; row <= s.getLastRow(); row++) {
      try { notifyRow_(s, row); } catch (_) { break; }
    }
  } finally { lock.releaseLock(); }
}
