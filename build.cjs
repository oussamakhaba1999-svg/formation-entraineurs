const fs = require('node:fs');
const { appsScriptUrl } = require('./config.json');
fs.mkdirSync('dist', { recursive: true });
const preview = fs.readFileSync('Index.html', 'utf8');
if (!appsScriptUrl) fs.writeFileSync('dist/index.html', preview);
else {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(appsScriptUrl)) throw Error('Invalid Apps Script deployment URL');
  fs.writeFileSync('dist/index.html', `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formation des entraîneurs | Inscription</title><style>html,body{margin:0;height:100%;}iframe{width:100%;height:100%;border:0;display:block}</style><iframe title="Inscription à la formation des entraîneurs" src="${appsScriptUrl}"></iframe></html>`);
}
