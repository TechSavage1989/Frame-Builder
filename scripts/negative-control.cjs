'use strict';
// Regression proof: the original updater timeout callback throws ReferenceError.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
let triggerTimeout;
const transport = { get() {
  const req = new EventEmitter();
  req.setTimeout = (_milliseconds, cb) => { triggerTimeout = cb; };
  req.destroy = error => req.emit('error', error);
  return req;
} };
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fixtures/original-update-check.cjs'), 'utf8'), {
  module: moduleStub,
  require(id) {
    if (id === 'node:https') return transport;
    if (id === './update-core.cjs') return require('../app/update-core.cjs');
    return require(id);
  },
  Buffer,
  URL,
});
moduleStub.exports.fetchJson('https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest', null);
assert.equal(typeof triggerTimeout, 'function');
assert.throws(() => triggerTimeout(), /timedOut is not defined/);
console.log('Negative control PASS: original 3.51.7 timeout raises ReferenceError.');
console.log('Fixed timeout is separately tested in scripts/update.test.cjs.');
