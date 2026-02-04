/**
 * One-time script to generate ADMIN_PASSWORD_HASH for .env
 * Usage: node server/generate-admin-hash.js [password]
 * If no password given, uses the default secure password.
 */
const bcrypt = require('bcrypt');
const password = process.argv[2] || 'F1owb!e#Adm1n$X9k2Q';
bcrypt.hash(password, 10).then((hash) => {
  console.log('Add this to your .env file:\n');
  console.log('ADMIN_PASSWORD_HASH=' + hash);
  console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'));
  console.log('\nDefault password (save it somewhere safe):', password);
});
