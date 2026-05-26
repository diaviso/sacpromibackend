#!/usr/bin/env node
/**
 * Génère 2 secrets JWT cryptographiquement sûrs pour la production.
 *
 * Usage :
 *   node scripts/generate-secrets.js
 *
 * Copiez les valeurs générées dans les variables Railway :
 *   JWT_ACCESS_SECRET  et  JWT_REFRESH_SECRET
 */

const crypto = require('crypto');

function gen() {
  return crypto.randomBytes(48).toString('hex');
}

const access = gen();
const refresh = gen();

console.log('');
console.log('🔐 Secrets JWT pour la production');
console.log('=========================================');
console.log('');
console.log('JWT_ACCESS_SECRET=' + access);
console.log('JWT_REFRESH_SECRET=' + refresh);
console.log('');
console.log('💡 Copiez ces valeurs dans Railway → Variables');
console.log('   (NE PAS les commit dans Git ni les partager)');
console.log('');
