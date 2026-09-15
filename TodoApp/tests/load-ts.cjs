const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real TypeScript services with deterministic native/network ports.
module.exports = function loadTs(file, mocks = {}, globals = {}) {
  const cache = new Map();
  function load(target) {
    target = path.resolve(__dirname, '..', target);
    if (!path.extname(target)) target += '.ts';
    if (cache.has(target)) return cache.get(target).exports;
    const module = { exports: {} }; cache.set(target, module);
    const code = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(target), name));
      return require(name);
    };
    const context = { module, exports: module.exports, require: localRequire, console, setTimeout, clearTimeout, URLSearchParams, AbortController, ...globals };
    vm.runInNewContext(code, context, { filename: target });
    return module.exports;
  }
  return load(file);
};
