const assert = require('node:assert/strict');
const test = require('node:test');
const { healthResponse } = require('../health');

test('reports ready only when the database is connected', () => {
  assert.deepEqual(healthResponse(true), {
    statusCode: 200,
    body: { status: 'ok', database: 'ready' },
  });
  assert.deepEqual(healthResponse(false), {
    statusCode: 503,
    body: { status: 'unavailable', database: 'not-ready' },
  });
});
