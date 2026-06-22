# Verification — How to prove the work actually works

> Golden rule: the agent does not say "it works" — it proves it.
> Every change ends with executable evidence, not assertions.
> This project has no build step and no test framework; verification is
> syntax checks + logic round-trips + a manual load in Chrome.

## Level 1 — Syntax is valid (mandatory)

Classic scripts:

```bash
node --check storage.js
node --check content.js
node --check background.js
```

ES modules (node treats `.js` as CommonJS, so copy to `.mjs` to parse as ESM —
this validates syntax only, it does not resolve imports):

```bash
for f in sidebar.js sidebar/*.js; do
  cp "$f" "/tmp/$(basename "$f").mjs" && node --check "/tmp/$(basename "$f").mjs"
done
```

`manifest.json` is valid JSON:

```bash
python3 -c "import json; json.load(open('manifest.json')); print('manifest OK')"
```

## Level 2 — Logic round-trips (mandatory for storage changes)

`buildMd` and `parseMd` are inverses. Any change to either must keep a
round-trip passing. Run with a mocked `chrome.storage.local`:

```bash
node -e '
global.window = global;
global.chrome = { storage: { local: {
  _d:{}, get(k,cb){cb({[k]:this._d[k]})}, set(o,cb){Object.assign(this._d,o);cb&&cb()}
}}};
require("./storage.js");
const S = window.ContextStore;
const ctx = { name:"X", color:"#5b57e8", items:[
  {type:"subtitle",category:"title",text:"T"},
  {type:"text",category:"idea",text:"I",source:"ncbi.nlm.nih.gov"},
  {type:"text",category:"evidence",text:"E"},
]};
const md = S.buildMd(ctx);
const back = S.parseMd(md);
console.log(JSON.stringify(back.items) );
'
```

Verify categories, emoji prefixes and `_Fuente:_` survive the round-trip.

## Level 3 — Consistency checks

- No dead references after a refactor (e.g. classes used in JS exist in CSS;
  removed functions are not still called).
- Every `import` resolves to a matching `export`.
- `sidebar.html` has no inline `<style>` or `style="..."`.

## Level 4 — Manual load in Chrome (before closing a UI change)

1. `chrome://extensions` → enable Developer mode.
2. **Load unpacked** → select the extension root (this folder).
3. Exercise the changed path; check the console (panel + page) for errors.

## Anti-patterns

- No "it should work" without running the checks above.
- No skipping the `buildMd`/`parseMd` round-trip when storage changes.
- No retrieving vendored libs from a CDN to "test faster" — MV3 forbids it.
- No `done` while any Level 1 check fails or the console shows errors.
