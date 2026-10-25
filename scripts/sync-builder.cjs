'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'browser');
const files = fs.readdirSync(folder).filter(name => name.endsWith('.html'));
if (files.length !== 1) throw new Error('Keep one standalone builder HTML in the browser folder.');
const original = fs.readFileSync(path.join(folder, files[0]), 'utf8');
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const desktop = original.replace(/<title>[^<]*<\/title>/, '<title>Frame Builder ' + require('../package.json').version + '</title>').replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">')
  .replace('Files prepared. Check your browser downloads.', 'Choose where to save the exported file.')
  .replace('The browser blocked the viewer window. Allow pop-ups for this file, then select Detach again.', 'The separate viewer could not open. Select Detach to try again.')
  .replace('</body>', '<script src="desktop-ui.js"></script>\n</body>');
fs.writeFileSync(path.join(root, 'app/index.html'), desktop);
console.log('Desktop HTML updated from ' + files[0]);
