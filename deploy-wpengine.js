/**
 * Deploy dist/ to WP Engine via SFTP using wpengine-deploy.config.json.
 * Run: npm run deploy:wpengine
 * Config path: WPENGINE_CONFIG env or ./wpengine-deploy.config.json
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import SftpClient from 'ssh2-sftp-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname);
const distDir = join(rootDir, 'dist');

function loadConfig() {
  const configPath = process.env.WPENGINE_CONFIG || join(rootDir, 'wpengine-deploy.config.json');
  if (!existsSync(configPath)) {
    console.error('WP Engine config not found. Expected:', configPath);
    console.error('Copy wpengine-deploy.config.example.json to wpengine-deploy.config.json and fill in your site, host, username, password, remotePath.');
    process.exit(1);
  }
  const raw = readFileSync(configPath, 'utf8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON in config file:', configPath, e.message);
    process.exit(1);
  }
  if (!config.host || !config.username) {
    console.error('Config must include host and username.');
    process.exit(1);
  }
  let password = config.password;
  if (config.passwordPath && existsSync(config.passwordPath)) {
    password = readFileSync(config.passwordPath, 'utf8').trim();
  }
  if (!password) {
    console.error('Config must include password or passwordPath to a file containing the password.');
    process.exit(1);
  }
  let remotePath = (config.remotePath || '/public/').replace(/\/+$/, '') || '/public';
  const subPath = process.env.WPENGINE_SUBPATH;
  if (subPath && subPath.trim()) {
    remotePath = remotePath + '/' + subPath.trim().replace(/^\/+/, '') + '/';
  } else {
    remotePath = remotePath + '/';
  }
  return {
    host: config.host.replace(/^sftp:\/\//, ''),
    port: config.port || 22,
    username: config.username,
    password,
    remotePath
  };
}

async function main() {
  if (!existsSync(distDir)) {
    console.error('dist/ not found. Run npm run build first.');
    process.exit(1);
  }
  const config = loadConfig();
  const sftp = new SftpClient();
  try {
    console.log('Connecting to', config.host, '...');
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password
    });
    console.log('Uploading dist/ to', config.remotePath, '...');
    let fileCount = 0;
    sftp.on('upload', () => {
      fileCount++;
      process.stdout.write(`\r  ${fileCount} files uploaded`);
    });
    await sftp.uploadDir(distDir, config.remotePath);
    console.log('\nDeploy complete.');
    console.log('Tip: If GSC connect/scan fails, add GSC_SERVICE_ACCOUNT_JSON to your backend env (e.g. Render → flowbie-api → Environment).');
  } catch (err) {
    console.error('Deploy failed:', err.message);
    process.exit(1);
  } finally {
    await sftp.end();
  }
}

main();
