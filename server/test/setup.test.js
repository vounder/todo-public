const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { configuration, saveEnv, readEnv, port, privateAddress, deployLink } = require('../setup/config');

test('setup preserves existing configuration and generates a durable access key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-setup-test-'));
  const file = path.join(root, '.env');
  fs.writeFileSync(file, 'SERVER_HOST_PORT=8099\nMONGO_DB_NAME=existing\n');
  const first = configuration({}, readEnv(file));
  assert.equal(first.SERVER_HOST_PORT, '8099'); assert.equal(first.MONGO_DB_NAME, 'existing');
  assert.match(first.TODO_ACCESS_KEY, /^[a-f0-9]{64}$/);
  saveEnv(file, first); const before = fs.readFileSync(file, 'utf8');
  saveEnv(file, configuration({}, readEnv(file)));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(readEnv(file).TODO_ACCESS_KEY, first.TODO_ACCESS_KEY);
});
test('invalid network and port configuration fail before any file is written', () => {
  for (const value of ['', '0', '65536', 'eight', '80\nKEY=value']) assert.throws(() => port(value));
  assert.equal(privateAddress('0.0.0.0'), false);
  assert.equal(privateAddress('127.0.0.1'), false);
  assert.equal(privateAddress([100, 100, 1, 2].join('.')), true);
  assert.throws(() => configuration({ address: '0.0.0.0' }), /Bindeadresse/);
  assert.throws(() => configuration({ database: 'bad\nvalue' }), /Datenbank/);
  assert.throws(() => configuration({ url: 'http://sync.example.test' }), /HTTPS/);
});
test('non-interactive local setup succeeds without DeployDesk and writes a local QR card', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-setup-cli-'));
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TODO_')));
  const args = [path.resolve(__dirname, '../setup/cli.js'), '--root', root, '--non-interactive'];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', env: cleanEnv });
  assert.equal(first.status, 0, first.stderr);
  const env = readEnv(path.join(root, '.env'));
  assert.equal(env.SERVER_BIND_ADDRESS, '127.0.0.1');
  assert.equal(fs.existsSync(path.join(root, 'todo-public.deploylink')), false);
  const card = fs.readFileSync(path.join(root, 'setup-card.local.html'), 'utf8');
  assert.match(card, /<svg/); assert.match(card, /todopublic:\/\/connect/);
  assert.ok(card.includes(env.TODO_ACCESS_KEY)); assert.ok(!first.stdout.includes(env.TODO_ACCESS_KEY));
  assert.equal(spawnSync(process.execPath, args, { env: cleanEnv }).status, 0);
  assert.equal(readEnv(path.join(root, '.env')).TODO_ACCESS_KEY, env.TODO_ACCESS_KEY);
});
test('explicit DeployDesk setup validates required remote values without silent fallback', () => {
  assert.throws(() => deployLink({}), /TODO_DEPLOY_REMOTE_PATH/);
  const env = { TODO_DEPLOY_HOST: 'deploy.example.test', TODO_DEPLOY_USER: 'deploy', TODO_DEPLOY_REMOTE_PATH: '/srv/todo' };
  assert.equal(deployLink(env).server.host, 'deploy.example.test');
  assert.throws(() => deployLink({ ...env, TODO_DEPLOY_REMOTE_PATH: '/srv/../todo' }), /Remote/);
});
