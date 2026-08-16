#!/bin/sh
set -e

# Patch dev:frontend to bind to all interfaces
cd /app || exit 1
node -e "
const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
if (!pkg.scripts['dev:frontend'].includes('--host')) {
  pkg.scripts['dev:frontend'] = 'vite --host 0.0.0.0';
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Patched dev:frontend to --host 0.0.0.0');
}
"

exec npm run dev