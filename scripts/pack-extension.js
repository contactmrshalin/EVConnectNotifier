// Zips the extension folder for Chrome Web Store upload, using the system zip.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, `charger-availability-notifier-${manifest.version}.zip`);

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(outFile, { force: true });

execFileSync('zip', ['-r', '-X', outFile, '.', '-x', '.DS_Store', '-x', '__MACOSX/*'], {
  cwd: path.join(root, 'extension'),
  stdio: 'inherit',
});

console.log(`\nReady to upload: ${outFile}`);
