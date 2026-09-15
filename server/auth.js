const { timingSafeEqual } = require('node:crypto');

function createAccessControl(key) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key || '')) throw new Error('TODO_ACCESS_KEY fehlt oder ist ungültig. Bitte das Setup ausführen und die App mit der Einrichtungskarte verbinden.');
  const expected = Buffer.from(key);
  const accepts = value => {
    if (typeof value !== 'string' || value.length > 128) return false;
    const actual = Buffer.from(value);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const middleware = (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ') || !accepts(header.slice(7))) return res.status(401).json({ error: 'Zugangsschlüssel fehlt oder ist ungültig.' });
    next();
  };
  return { accepts, middleware };
}
module.exports = { createAccessControl };
