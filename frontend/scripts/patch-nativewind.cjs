// Reapply reviewed compatibility guards after clean installs.
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '../node_modules/react-native-css-interop/dist/runtime/native/render-component.js');
const source = fs.readFileSync(target, 'utf8');
if (!source.includes('ConstructFlow safe diagnostics')) {
  const start = source.indexOf('function stringify(object) {');
  const end = source.indexOf('function getDebugReplacer()', start);
  if (start < 0 || end < 0) throw new Error('NativeWind diagnostic patch requires review for this dependency version');
  const replacement = `function stringify(object) {
    // ConstructFlow safe diagnostics: do not invoke getters or inspect React internals.
    const seen = new WeakSet();
    function safe(value, depth) {
        if (typeof value === 'function') return '[Function]';
        if (value === null || typeof value !== 'object') return value;
        if (depth > 4 || seen.has(value)) return '[Object]';
        seen.add(value);
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (descriptors.$$typeof || descriptors._isReanimatedSharedValue) return '[React/Animated object]';
        const output = Array.isArray(value) ? [] : {};
        for (const key of Object.keys(descriptors).slice(0, 100)) {
            if (key === 'length' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            const descriptor = descriptors[key];
            output[key] = 'value' in descriptor ? safe(descriptor.value, depth + 1) : '[Accessor]';
        }
        return output;
    }
    try { return JSON.stringify(safe(object, 0), null, 2); }
    catch { return '[Unserializable props]'; }
}


`;
  fs.writeFileSync(target, source.slice(0, start) + replacement + source.slice(end));
  console.log('Applied NativeWind safe diagnostic patch');
}

// Patched image-size 2 accepts bytes; this SDK's Metro still passes file paths.
// Preserve Metro's synchronous contract while using the security-fixed parser.
const metroTarget = path.join(__dirname, '../node_modules/metro/src/Assets.js');
const metro = fs.readFileSync(metroTarget, 'utf8');
const oldCall = '(0, _imageSize.default)(isImageInput)';
const newCall = '(0, _imageSize.default)(typeof isImageInput === "string" ? _fs.default.readFileSync(isImageInput) : isImageInput)';
if (metro.includes(oldCall)) {
  fs.writeFileSync(metroTarget, metro.replace(oldCall, newCall));
  console.log('Applied Metro image-size byte-input compatibility patch');
} else if (!metro.includes(newCall)) {
  throw new Error('Metro image parser compatibility requires review for this dependency version');
}
