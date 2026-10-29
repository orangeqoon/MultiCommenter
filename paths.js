'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.env.MARUST_SCRIPTS_ROOT && path.resolve(process.env.MARUST_SCRIPTS_ROOT)
  || (fs.existsSync('C:\\scripts') ? 'C:\\scripts' : path.resolve(__dirname, '..', '..'));
const STATE_DIR = process.env.MARUST_STATE && path.resolve(process.env.MARUST_STATE)
  || path.join(ROOT_DIR, 'state');
const NEON_DIRS = [
  path.join(ROOT_DIR, 'streaming', 'NeonTimerApp'),
  path.join(ROOT_DIR, 'NeonTimerApp'),
  path.join(__dirname, '..', 'NeonTimerApp'),
  path.join(__dirname, 'NeonTimerApp')
];

function firstExisting(files) {
  for (const file of files) if (fs.existsSync(file)) return file;
  return files[0];
}

function neonFile(name) {
  return firstExisting(NEON_DIRS.map((dir) => path.join(dir, name)));
}

function stateServiceFile(name) {
  return path.join(STATE_DIR, 'services', name);
}

module.exports = { ROOT_DIR, STATE_DIR, neonFile, stateServiceFile, firstExisting };
