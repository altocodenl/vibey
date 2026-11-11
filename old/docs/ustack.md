# The ustack: Complete Reference

> A set of libraries to build web applications, aiming to be fully understandable by those who use it. The entire frontend stack is under 2048 lines of ES5 JavaScript; the entire backend stack (server, auth, testing) adds ~1230 more.

## Philosophy & Approach

The ustack is built on these principles:

1. **Radical minimalism**: Each library solves one problem in the most straightforward way possible. The entire frontend is < 2048 lines; the full stack (all 9 libraries) is ~3300 lines.
2. **dsDSLs (data-structure DSLs)**: All libraries use plain JavaScript object literals (arrays and objects) as their primary interface. Code is expressed as data. HTML is arrays, CSS is arrays, routes are arrays, tests are arrays.
3. **mES5 subset**: No `new`, no `this`, no prototypes, no `switch`, strict equality only (`===`/`!==`). Works in old browsers without compilation.
4. **Functional style**: Loops become expressions. Validation is declarative. HTML/CSS is generated from data. Side effects are modeled as events.
5. **Complete understanding**: These libraries are designed to be fully read and understood. No hidden magic, no framework-internal state you can't inspect.

### The Nine Libraries

| # | Library | Lines | Purpose | Runs in |
|---|---------|-------|---------|---------|
| 1 | **dale** | 161 | Functional iteration (loops as expressions) | Browser + Node |
| 2 | **teishi** | 405 | Declarative validation + helpers | Browser + Node |
| 3 | **lith** | 269 | HTML/CSS generation from data | Browser + Node |
| 4 | **recalc** | 199 | Event system with global store | Browser + Node |
| 5 | **cocholate** | 355 | DOM manipulation & AJAX | Browser only |
| 6 | **gotoB** | 680 | Reactive frontend framework | Browser only |
| 7 | **cicek** | 826 | HTTP server (routes, files, cookies, cluster) | Node only |
| 8 | **hitit** | 242 | HTTP API testing client | Node only |
| 9 | **giz** | 167 | Auth primitives (signup, login, sessions) | Node only |

### Library Dependency Chain

```
dale (foundation: loops)
  └─ teishi (foundation: validation + helpers)
       ├─ lith (HTML/CSS generation)
       ├─ recalc (event system)
       ├─ cocholate (DOM manipulation & AJAX)
       ├─ gotoB (frontend framework, uses all above)
       ├─ cicek (HTTP server, uses dale + teishi)
       ├─ hitit (HTTP test client, uses dale + teishi)
       └─ giz (auth primitives, uses bcrypt + redis)
```

### Loading in the Browser (frontend)

```html
<script src="dale.js"></script>
<script src="teishi.js"></script>
<script src="lith.js"></script>
<script src="recalc.js"></script>
<script src="cocholate.js"></script>
<script src="gotoB.js"></script>
```

Or load the single pre-built file for gotoB:
```html
<meta charset="utf-8">
<script src="gotoB.min.js"></script>
```

Global variables after loading: `dale`, `teishi`, `lith`, `R` (recalc constructor), `c` (cocholate), `B` (gotoB).

### Loading in Node.js (backend)

```javascript
var dale   = require('dale');
var teishi = require('teishi');
var lith   = require('lith');
var cicek  = require('cicek');
var hitit  = require('hitit');
var giz    = require('giz');
```

---

## 1. dale — Loops as Functions (~160 lines)

**Purpose**: Functional iteration over arrays, objects, and single values. Turns loops into expressions so they can be embedded inside object literals.

### Key Behaviors

- **Any input type works**: arrays iterate normally, objects iterate over own keys, single values become `[value]`, `undefined` becomes `[]`.
- **Array keys are integers** (not strings like native `for..in`).
- **Own properties only** by default (no `hasOwnProperty` boilerplate). Pass `true` as last arg for inherited props.

### The Eight Functions

#### `dale.go(input, fun)` → array
Map over input. Always returns an array.
```javascript
dale.go([1, 2, 3], function(v) { return v * 10 })           // [10, 20, 30]
dale.go({a: 1, b: 2}, function(v, k) { return k + ':' + v }) // ['a:1', 'b:2']
dale.go('hello', function(v) { return v.toUpperCase() })     // ['HELLO']
dale.go(undefined, function(v) { return v })                 // []
```

#### `dale.fil(input, filterValue, fun)` → array
Like `dale.go` but excludes results equal to `filterValue`.
```javascript
dale.fil([1, 2, 3, 4], undefined, function(v) {
   if (v % 2 === 0) return v;
})
// [2, 4]
```

#### `dale.obj(input, [baseObject], fun)` → object
Build an object. `fun` must return `[key, value]` or `undefined`.
```javascript
dale.obj([{name: 'Jo', age: 30}, {name: 'Mo', age: 25}], function(v) {
   return [v.name, v.age];
})
// {Jo: 30, Mo: 25}
```

#### `dale.stop(input, stopValue, fun)` → single value
Iterate until `fun` returns `stopValue`, then stop and return it. Returns last result if never stopped.
```javascript
dale.stop([1, 2, 'x', 4], false, function(v) {
   return typeof v === 'number';
})
// false (stopped at 'x')
```

#### `dale.stopNot(input, continueValue, fun)` → single value
Iterate while `fun` returns `continueValue`. Stop on first different value.
```javascript
dale.stopNot([1, 2, 3], true, function(v) {
   return v < 3 ? true : 'too big';
})
// 'too big'
```

#### `dale.keys(input)` → array
Returns keys of input. Like `Object.keys` but works on anything.
```javascript
dale.keys({a: 1, b: 2})  // ['a', 'b']
```

#### `dale.times(steps, [start=1], [step=1])` → array
Generate a sequence of numbers.
```javascript
dale.times(3)        // [1, 2, 3]
dale.times(3, 0)     // [0, 1, 2]
dale.times(3, 10, 5) // [10, 15, 20]
```

#### `dale.acc(input, [initialValue], fun)` → single value
Reduce/fold. Accumulates values.
```javascript
dale.acc([1, 2, 3, 4], function(a, b) { return a + b })  // 10
dale.acc([1, 2, 3], 10, function(a, b) { return a + b }) // 16
```

### Utility
- `dale.clog(...)`: Safe `console.log` (falls back to `alert` in old browsers).

---

## 2. teishi — Validation (~410 lines)

**Purpose**: Declarative input validation for functions. Express validation rules as data. Auto-activation: functions check their input and return `false` + error message on failure.

### Core Pattern

```javascript
function myFunction(name, count) {
   if (teishi.stop('myFunction', [
      ['name', name, 'string'],
      ['count', count, 'integer'],
      ['count', count, {min: 0, max: 100}, teishi.test.range]
   ])) return false;
   // Input is valid, proceed...
}
```

### `teishi.v(functionName, rule, [apres], [prod])` → true | false
Validates rules. Returns `true` if valid, `false` (+ prints error) if invalid.
- `functionName`: optional string for error messages.
- `apres`: if `true`, returns error string instead of printing. If function, calls it with error.
- `prod`: if `true`, skips rule validation for speed.

### `teishi.stop(functionName, rule, [apres], [prod])` → true | false
Inverse of `teishi.v`: returns `true` if there's an error (for `if (teishi.stop(...)) return false;` pattern).

### Simple Rules: `[name, compare, to, [multi], [test]]`

- **name**: string or `[name, description]` array
- **compare**: the value being checked
- **to**: what it should match
- **multi** (optional): `'each'` | `'oneOf'` | `'eachOf'`
- **test** (optional): test function (default: `teishi.test.type`)

```javascript
['age', age, 'integer']                                          // type check
['action', action, ['create', 'read'], 'oneOf', teishi.test.equal] // value must be one of these
['items', items, 'string', 'each']                                // every item must be string
['items', items, ['string', 'integer'], 'eachOf']                 // every item must be string or integer
['score', score, {min: 0, max: 100}, teishi.test.range]           // range check
['email', email, /^.+@.+$/, teishi.test.match]                   // regex match
```

### Complex Rules

- **Nested**: `[rule1, rule2, rule3]` — sequential, stop on first failure
- **Boolean**: `true`/`false` — inline validation results
- **Function guards**: `function() { return rule }` — defer evaluation to avoid exceptions
- **Conditional**: `[boolean, [rules]]` — only evaluate rules if boolean is true

```javascript
if (teishi.stop('myFn', [
   ['input', input, 'object'],
   function() { return [
      ['input.name', input.name, 'string'],
      [input.age !== undefined, ['input.age', input.age, 'integer']]
   ]}
])) return false;
```

### Built-in Test Functions

| Function | Checks |
|---|---|
| `teishi.test.type` (default) | `teishi.type(compare) === to` |
| `teishi.test.equal` | Deep equality |
| `teishi.test.notEqual` | Deep inequality |
| `teishi.test.range` | `{min, max, less, more}` |
| `teishi.test.match` | String matches regex |

### Helper Functions

| Function | Purpose |
|---|---|
| `teishi.type(value, [objectType])` | Enhanced `typeof`: returns `'integer'`, `'float'`, `'nan'`, `'infinity'`, `'array'`, `'object'`, `'null'`, `'regex'`, `'date'`, `'function'`, `'string'`, `'boolean'`, `'undefined'` |
| `teishi.str(value)` | Safe `JSON.stringify` (returns `false` on error) |
| `teishi.parse(string)` | Safe `JSON.parse` (returns `false` on error) |
| `teishi.simple(v)` | `true` if not array/object |
| `teishi.complex(v)` | `true` if array/object |
| `teishi.inc(array, value)` | `array.indexOf(value) > -1` |
| `teishi.copy(value)` | Deep copy (handles circular refs) |
| `teishi.eq(a, b)` | Deep equality check |
| `teishi.last(array, [n])` | Last element (or nth from end) |
| `teishi.time([d])` | Current time in ms, or from date |
| `teishi.clog(...)` | Colorized logging with timestamps |

---

## 3. lith — HTML/CSS Generation (~270 lines)

**Purpose**: Generate HTML and CSS strings from JavaScript object literals. Works both in browser and Node.js.

### Liths (HTML)

A **lith** is an array: `[tag, attributes?, contents?]`

```javascript
lith.g(['br'])
// '<br>'

lith.g(['p', {id: 'intro', class: 'bold'}, 'Hello'])
// '<p id="intro" class="bold">Hello</p>'

lith.g(['div', ['p', 'one'], ['p', 'two']])
// '<div><p>one</p><p>two</p></div>'
```

A **lithbag** is an array of liths, strings, numbers, or `undefined`:
```javascript
lith.g([['p', 'A'], ['p', 'B']])
// '<p>A</p><p>B</p>'
```

- Strings are automatically HTML-escaped (except inside `<script>` and `<style>`).
- Falsy attribute values (`undefined`, `null`, `false`, `''`) are omitted.
- `['LITERAL', '<raw html>']` inserts unescaped HTML.
- `lith.g(lith, true)` or `lith.prod = true` enables prod mode (no validation, faster).

### Litcs (CSS)

A **litc** is `[selector, attributes?, contents?]`

```javascript
lith.css.g(['div', {width: 0.5, height: 100}])
// 'div{width:50%;height:100px;}'
```

#### CSS Value Conventions

| JS Value | CSS Output | Why |
|---|---|---|
| integer > 1 or < 0 | `Npx` | Most common unit |
| `1` | `100%` | Special case |
| float (0 < n < 1) | `N%` | `0.5` → `50%` |
| string | as-is | `'200%'`, `'1em'` |

#### Nesting (descendant selectors)
```javascript
lith.css.g(['div.links', {width: 100}, ['a', {'font-size': 14}]])
// 'div.links{width:100px;}div.links a{font-size:14px;}'
```

#### Parent reference with `&`
```javascript
lith.css.g(['a', {'font-size': 14}, ['&:hover', {color: 'lime'}]])
// 'a{font-size:14px;}a:hover{color:lime;}'
```

#### Multiple properties shorthand
```javascript
['p', {'padding-top, padding-bottom': 10}]
// p{padding-top:10px;padding-bottom:10px;}
```

#### Mixins (nested attribute objects)
```javascript
var bold = {'font-weight': 'bold'};
['p', {color: 'red', font: bold}]
// p{color:red;font-weight:bold;}
```

#### Helper Functions
- `lith.css.media(selector, litc)` → wraps in `@media`
- `lith.css.style(attributes)` → inline CSS string for `style` attribute

#### Auto CSS in HTML
```javascript
lith.g(['style', ['body', {margin: 0}]])
// '<style>body{margin:0px;}</style>'
```

---

## 4. recalc — Event System (~200 lines)

**Purpose**: Functional approach to side effects. Events pass *control*, a global store passes *data*. Events have a `verb` and a `path`, like REST.

### Creating an Instance

```javascript
var r = R();       // browser: R is global. Node: var R = require('recalc')
var r = R([]);     // initialize store as array
var r = R({key: 'value'}); // initialize with data
```

### Core Elements

| Element | Description |
|---|---|
| `r.store` | Global state object |
| `r.responders` | All registered responders |
| `r.log` | Array of all events called and responders matched |
| `r.call(verb, path, ...args)` | Call an event |
| `r.respond(verb, path, [options], rfun)` | Register a responder |
| `r.forget(id, [onforget])` | Remove a responder (and its children) |

### Calling Events

```javascript
r.call('fire', 'hello');                    // verb='fire', path=['hello']
r.call('fire', ['hello', 1]);              // path=['hello', 1]
r.call('fire', 'hello', 'extra', 'args');  // extra args passed to responders
```

Returns the event's `id` (string), or `false` on invalid input.

### Creating Responders

```javascript
r.respond('fire', 'hello', function(x, ...args) {
   // x = {verb, path, args, from, cb, responder}
});

// With options:
r.respond('fire', 'hello', {
   id: 'myResponder',    // custom id
   parent: 'parentId',   // for tree deletion
   priority: 5,          // higher = matched sooner (default 0)
   burn: true,           // auto-destroy after one match
   match: function(ev, responder) { return true; }  // custom matching
}, function(x) { ... });
```

Returns the responder's `id`, or `false` on error.

### Matching Rules

- Verb and path must **both** match.
- Paths must have the **same length** and each element must match.
- Wildcards: `'*'` matches any single element.
- Regexes in **responder** verbs/paths match against event strings.
- Empty path `[]` only matches empty path `[]`.

### Async Responders

```javascript
r.respond('fetch', 'data', function(x) {
   asyncOp(function() {
      x.cb(); // resume execution of further responders
   });
   return x.cb; // signal this is async
});
```

### Event Chains (tracking)

Pass context `x` as first arg to `r.call` within a responder:
```javascript
r.respond('a', 'b', function(x) {
   r.call(x, 'c', 'd'); // chain is tracked in r.log
});
```

### Disabling Responders

```javascript
r.responders.someId.disabled = true;  // temporarily disable
r.responders.someId.disabled = false; // re-enable
```

---

## 5. cocholate — DOM Manipulation & AJAX (~340 lines)

**Purpose**: Browser-only. Lightweight DOM querying, manipulation, AJAX, cookies, and testing. Available as `window.c`.

### Selectors: `c(selector, [fun])`

```javascript
c('div')            // all divs (array)
c('.nav')           // all .nav elements (array)
c('#myId')          // single element (not array)
c('body')           // document.body (not array)
c('div', function(el) { return el.id })  // map over matches
```

#### Scoped selectors
```javascript
c({selector: 'p', from: c('#container')})
```

#### Set operations
```javascript
c([':or', 'div', 'p'])     // union
c([':and', '.a', '.b'])    // intersection
c([':not', 'div', 'p'])    // complement
```

### DOM Functions

```javascript
c.empty(selector)                        // clear innerHTML
c.fill(selector, htmlString)             // set innerHTML
c.place(selector, where, htmlString)     // where: 'beforeBegin'|'afterBegin'|'beforeEnd'|'afterEnd'

c.get(selector, attributes, [css])       // get attributes/CSS as object
c.get('#el', ['id', 'class'])            // {id: '...', class: '...'}
c.get('#el', 'color', true)             // {color: 'red'} (CSS)
c.get('#el')                             // all attributes

c.set(selector, attributes, [css], [notrigger])
c.set('#el', {class: 'active'})          // set attribute
c.set('#el', {class: null})              // remove attribute
c.set('#el', {color: 'red'}, true)       // set CSS

c.fire(selector, eventType)              // dispatch event
c.fire('#btn', 'click')
```

### Non-DOM Functions

```javascript
// Ready handler
c.ready(function() { /* page loaded */ })

// Cookies
c.cookie()           // parse document.cookie → {key: value, ...}
c.cookie(false)      // delete all JS-accessible cookies

// AJAX
c.ajax(method, path, headers, body, callback)
c.ajax('POST', '/api/data', {}, {foo: 'bar'}, function(error, response) {
   // error: null on success (200/304), xhr object on failure
   // response: {headers: {...}, body: ..., xhr: ...}
   // body is auto-parsed if Content-Type is application/json
})
// Objects/arrays as body auto-set Content-Type to application/json

// Load script dynamically
c.loadScript('/path/to/script.js', callback)
```

### Testing: `c.test`

```javascript
c.test([
   ['test name', function() { return someCheck() === true; }],
   ['async test', function(next) {
      doSomething();
      next(500, 50); // check every 50ms for up to 500ms
   }, function() {
      return c('#result').innerText === 'done' || 'not done yet';
   }],
], function(error, ms) {
   if (error) console.log('Failed:', error.test, error.result);
   else console.log('All passed in', ms, 'ms');
});
```

---

## 6. gotoB — Frontend Framework (~670 lines)

**Purpose**: Reactive frontend framework. Views are functions returning liths. State lives in a global store. Events drive all changes. Uses Myers diff for efficient DOM updates. Available as `window.B`.

### Quick Start

```javascript
B.mount('body', function() {
   return B.view('counter', function(counter) {
      counter = counter || 0;
      return ['div', [
         ['h2', 'Counter: ' + counter],
         ['button', {onclick: B.ev('set', 'counter', counter + 1)}, '+1']
      ]];
   });
});
```

### Core API

#### `B.mount(target, vfun)` / `B.unmount(target)`
Place/remove views in the DOM. `target` is `'body'` or `'#someId'`.

```javascript
B.mount('body', function() { return ['h1', 'Hello'] });
B.unmount('body');
```

#### `B.store` — The Global State
All frontend state lives here. Modified only through events.

#### `B.get(path)` — Safe Store Access
```javascript
B.get('user', 'name')         // B.store.user.name (undefined-safe)
B.get(['Data', 'items', 0])   // B.store.Data.items[0]
B.get()                        // entire B.store
```

#### `B.call(verb, path, ...args)` — Call Events
```javascript
B.call('set', 'username', 'mono')         // B.store = {username: 'mono'}
B.call('set', ['user', 'name'], 'mono')   // B.store = {user: {name: 'mono'}}
B.call('add', 'items', 'a', 'b')          // push to array
B.call('rem', 'items', 0)                 // remove index 0
B.call('rem', [], 'username')             // delete key from root
```

From within responders, pass context for tracking:
```javascript
B.call(x, 'set', 'key', 'value')
```

#### Built-in Data Responders

| Verb | Effect | Change Event |
|---|---|---|
| `set` | Set value at path | Yes, if value changed |
| `add` | Push to array at path | Yes, if items added |
| `rem` | Remove keys from object/array at path | Yes, per key removed |
| `mset` / `madd` / `mrem` | Same but **no** change event (mute) | No |

All data responders fire `change` events which trigger view redraws.

#### `B.respond(verb, path, [options], rfun)` — Register Responders

```javascript
B.respond('submit', 'form', function(x) {
   var data = B.get('form');
   c.ajax('POST', '/api/submit', {}, data, function(error, response) {
      if (error) return B.call(x, 'set', ['State', 'error'], 'Submit failed');
      B.call(x, 'set', ['State', 'page'], 'success');
   });
   return x.cb; // async
});
```

Options: `id`, `priority`, `match`, `burn`, `parent` (same as recalc).

**Do / Don't (safe app code, especially for LLM-generated code):**
- **Do** call events as `B.call(x, ...)` inside responders (preserves event trace/context).
- **Don't** mutate `B.store` directly in app logic; use events/data responders instead.
- **Do** batch multi-path updates with mute/direct writes (`mset`/`madd`/`mrem` or `B.set` + manual `change`) to avoid redraw storms.
- **Don't** trigger events from inside `vfun` (views should stay pure).
- **Do** `return x.cb` in async responders so responder flow resumes correctly.
- **Don't** mutate objects returned by `B.get` directly — this bypasses the event/update flow. Copy first with `teishi.copy` if you need to modify.
- **Don't** accidentally replace the entire store with `B.call('set', [], value)` — empty path `[]` means root.

#### `B.mrespond(responders)` — Register Multiple
```javascript
B.mrespond([
   ['verb1', 'path1', function(x) { ... }],
   ['verb2', 'path2', {priority: 1}, function(x) { ... }]
]);
```

#### `B.forget(id)` — Remove Responder
```javascript
B.forget('myResponderId')
```

#### `B.ev(verb, path, ...args)` — DOM Event Handlers
Generates a stringified `B.call` for use in HTML attributes.

```javascript
['button', {onclick: B.ev('set', 'counter', 5)}, 'Set to 5']
['input', {oninput: B.ev('set', 'query')}]  // default: passes this.value

// Raw values (not stringified):
['button', {onclick: B.ev('submit', 'form', {raw: 'this.value'})}, 'Go']

// Multiple events:
['button', {onclick: B.ev(['save', 'data'], ['navigate', 'home'])}, 'Save & Go']

// Conditional (no-op with empty array):
['button', {onclick: B.ev(condition ? ['save', 'data'] : [])}, 'Maybe Save']
```

#### `B.view(path, vfun)` — Reactive Views
Creates a DOM element that auto-updates when the relevant part of `B.store` changes.

```javascript
B.view('todos', function(todos) {
   todos = todos || [];
   return ['ul', dale.go(todos, function(todo, i) {
      return ['li', [todo, ['button', {onclick: B.ev('rem', 'todos', i)}, 'x']]];
   })];
})
```

**Rules:**
- `vfun` must return a single **lith** (not a lithbag).
- Don't set `id` on the returned lith (gotoB manages ids).
- Wrap `B.view` calls in functions for reuse.
- Don't call events from inside `vfun`.
- Views can be nested.

**Multiple paths:**
```javascript
B.view([['user'], ['settings']], function(user, settings) {
   return ['div', [user.name, ' - theme: ', settings.theme]];
})
```

**Path matching for redraws:**
A view at path `'todos'` redraws when `change` fires on:
- `'todos'` (exact match)
- `['todos', 0]` (more specific — affects todos)
- `[]` (less specific — affects everything)

But NOT `'users'` (unrelated path).

### Logging & Debugging

```javascript
B.log            // array of all events and responder matches
B.eventlog()     // render HTML table of all events
B.eventlog('set') // filter log entries containing 'set'
```

### Production Mode

```javascript
B.prod = true;   // disable all validation (faster, no error catching)
```

### Advanced: Opaque Elements

For DOM elements modified by external libraries (e.g., date pickers, SVG):

```javascript
B.view('chart', function(data) {
   return ['div', {opaque: true}, ['LITERAL', '<svg>...</svg>']];
})
```

Opaque elements are fully recreated on redraw (never recycled/diffed).

### Advanced: Async Responders

```javascript
B.respond('fetch', 'users', function(x) {
   c.ajax('GET', '/api/users', {}, '', function(error, res) {
      if (! error) B.call(x, 'set', 'users', res.body);
      x.cb();
   });
   return x.cb;
});
```

### Advanced: Change Responder (non-view)

```javascript
B.respond('change', 'counter', {match: B.changeResponder}, function(x, value, oldValue) {
   console.log('Counter changed from', oldValue, 'to', value);
});
```

### Advanced: Dynamic Responder IDs for Graph-Like Dependencies

When views/components have user-defined dependencies (e.g., spreadsheet cell formulas), use `B.forget` + `B.respond` with explicit `id` and `parent` to rewire reactive edges at runtime:

```javascript
B.respond('update', 'cellRefs', function(x, cellId, newRefs) {
   // Forget old dependency responders for this cell
   B.forget('cell-deps-' + cellId);

   // Create new responders for each referenced cell
   dale.go(newRefs, function(ref, k) {
      B.respond('change', ['cells', ref], {
         id: 'cell-deps-' + cellId + '-' + k,
         parent: 'cell-deps-' + cellId,
         match: B.changeResponder
      }, function(x) {
         B.call(x, 'recalculate', 'cell', cellId);
      });
   });
});
```

This pattern lets you build spreadsheet-like reactive graphs where dependencies change based on user input.

---

## Common Patterns

### Full App Structure

```javascript
// --- State initialization ---
B.call('set', [], {State: {page: 'login'}, Data: {}});

// --- Responders (business logic) ---
B.mrespond([
   ['login', [], function(x) {
      var creds = B.get('State', 'credentials');
      c.ajax('POST', '/auth/login', {}, creds, function(error, res) {
         if (error) return B.call(x, 'set', ['State', 'error'], 'Login failed');
         B.call(x, 'set', ['Data', 'user'], res.body);
         B.call(x, 'set', ['State', 'page'], 'main');
         x.cb();
      });
      return x.cb;
   }],
   ['logout', [], function(x) {
      B.call(x, 'set', [], {State: {page: 'login'}, Data: {}});
   }]
]);

// --- Views ---
var app = function() {
   return B.view(['State', 'page'], function(page) {
      if (page === 'login') return loginView();
      if (page === 'main')  return mainView();
      return ['div', 'Unknown page'];
   });
}

var loginView = function() {
   return ['div', [
      ['input', {placeholder: 'Username', oninput: B.ev('set', ['State', 'credentials', 'username'])}],
      ['input', {type: 'password', oninput: B.ev('set', ['State', 'credentials', 'password'])}],
      ['button', {onclick: B.ev('login', [])}, 'Login']
   ]];
}

var mainView = function() {
   return B.view(['Data', 'user'], function(user) {
      return ['div', [
         ['h1', 'Welcome, ' + (user ? user.name : '')],
         ['button', {onclick: B.ev('logout', [])}, 'Logout']
      ]];
   });
}

B.mount('body', app);
```

### Table with Dynamic Data

```javascript
var table = function() {
   return B.view(['Data', 'items'], function(items) {
      items = items || [];
      return ['table', [
         ['tr', dale.go(['Name', 'Price'], function(h) { return ['th', h] })],
         dale.go(items, function(item) {
            return ['tr', [['td', item.name], ['td', item.price]]];
         })
      ]];
   });
}
```

### CSS with lith

```javascript
var styles = function() {
   return ['style', [
      ['body', {'font-family': 'sans-serif', margin: 0, padding: 20}],
      ['.btn', {
         'background-color': '#4488DD',
         color: 'white',
         border: 'none',
         padding: '10px 20px',
         cursor: 'pointer'
      }, ['&:hover', {'background-color': '#3377CC'}]]
   ]];
}
```

### Input Binding

```javascript
// Text input
['input', {value: B.get('query'), oninput: B.ev('set', 'query')}]

// Select
['select', {onchange: B.ev('set', 'selected')},
   dale.go(options, function(opt) {
      return ['option', {value: opt, selected: opt === B.get('selected')}, opt];
   })
]

// Checkbox
['input', {type: 'checkbox', checked: B.get('agreed'), onclick: B.ev('set', 'agreed', !B.get('agreed'))}]
```

---

## Extended Examples

### Shopping Cart (full app with filter, add-to-cart, checkout)

This example shows a complete shopping cart with product listing, filtering, quantity input, cart management, and a total that auto-recalculates.

```javascript
/*
Store structure:
   products:   [{id: STRING, title: STRING, price: INTEGER|FLOAT}, ...]
   cart:       {productId: quantity, ...}
   quantities: {productId: STRING, ...}   // input buffer for quantity fields
   total:      INTEGER
   filter:     STRING
*/

// *** RESPONDERS ***

B.mrespond([
   ['load', 'data', function(x) {
      // In a real app, you'd fetch from a server with c.ajax
      B.call(x, 'set', 'products', [
         {id: 'p1', title: 'A book on design',           price: 5},
         {id: 'p2', title: 'Something useless',          price: 8},
         {id: 'p3', title: 'Kittens & sunshine',         price: 11},
         {id: 'p4', title: 'Dinner & movie with JSON',   price: 200}
      ]);
   }],
   ['cart', 'add', function(x, productId, quantity) {
      var cart = B.get('cart') || {};
      quantity = parseInt(quantity);
      if (isNaN(quantity) || quantity <= 0) return alert('Please enter a valid quantity.');
      if (! cart[productId]) B.call(x, 'set', ['cart', productId], quantity);
      else                   B.call(x, 'set', ['cart', productId], cart[productId] + quantity);
   }],
   // Recalculate total whenever cart changes
   ['change', 'cart', {match: B.changeResponder}, function(x) {
      B.call(x, 'calculate', 'total');
   }],
   ['calculate', 'total', function(x) {
      var products = B.get('products'), total = 0;
      dale.go(B.get('cart'), function(quantity, productId) {
         var product = dale.stopNot(products, undefined, function(product) {
            if (product.id === productId) return product;
         });
         total += product.price * quantity;
      });
      B.call(x, 'set', 'total', total);
   }],
   ['checkout', [], function(x) {
      alert('PROFIT! ' + JSON.stringify(B.get('cart')));
      B.call(x, 'rem', [], 'cart');
   }]
]);

// *** VIEWS ***

var cart = function() {
   return [
      ['style', [
         ['body', {padding: 15}],
         ['span.action', {color: 'blue', cursor: 'pointer', 'text-decoration': 'underline'}]
      ]],

      // Left panel: product list with filter
      B.view([['products'], ['filter']], function(products, filter) {
         products = products || [];
         var filtered = dale.fil(products, undefined, function(product) {
            if (! filter || product.title.toLowerCase().match(filter.toLowerCase())) return product;
         });
         return ['div', [
            ['h3', 'Product list'],
            ['h4', [filtered.length, ' matching products']],
            ['span', {'class': 'action', onclick: B.ev('load', 'data')}, 'Load data'],
            ['br'], ['br'],
            ['input', {
               placeholder: 'filter',
               value: filter,
               oninput: B.ev('set', 'filter')
            }],
            ['br'], ['br'],
            ['table', dale.go(filtered, function(product) {
               return B.view(['quantities', product.id], function(quantity) {
                  return ['tr', [
                     ['td', product.title],
                     ['td', '$' + product.price],
                     ['td', [
                        ['input', {
                           placeholder: 'Qty',
                           value: quantity,
                           oninput: B.ev('set', ['quantities', product.id], {raw: 'this.value'})
                        }],
                        ['span', {
                           'class': 'action',
                           onclick: B.ev(
                              ['cart', 'add', product.id, quantity],
                              ['rem', 'quantities', product.id]
                           )
                        }, ' Add to cart']
                     ]]
                  ]];
               });
            })]
         ]];
      }),

      // Right panel: cart with totals
      B.view([['products'], ['cart'], ['total']], function(products, cart, total) {
         cart = cart || {};
         return ['div', [
            ['h3', 'My cart'],
            ['h4', [dale.keys(cart).length, ' items, total: $', total || 0]],
            ['table', dale.go(cart, function(quantity, productId) {
               var product = dale.stopNot(products, undefined, function(p) {
                  if (p.id === productId) return p;
               });
               return ['tr', [
                  ['td', product.title],
                  ['td', '$' + product.price],
                  ['td', 'x' + quantity],
                  ['td', '$' + (product.price * quantity)],
                  ['td', ['span', {'class': 'action', onclick: B.ev('rem', 'cart', productId)}, 'Remove']]
               ]];
            })],
            dale.keys(cart).length > 0 ? ['button', {onclick: B.ev('checkout', [])}, 'Checkout!'] : []
         ]];
      })
   ];
}

B.mount('body', cart);
B.call('load', 'data');
```

**Key patterns demonstrated:**
- Store split into `products` (server data), `cart` (user state), `quantities` (input buffers), `total` (derived)
- `B.changeResponder` to auto-recalculate totals when cart changes
- Views depending on multiple store paths
- Nested `B.view` inside a `dale.go` loop (one per product row)
- Multiple events in one `B.ev` call: add to cart + clear quantity input
- `{raw: 'this.value'}` to pass DOM input value to responder

---

### Tic Tac Toe

Adapted from React's Tic Tac Toe example. Shows game logic in responders, view as a pure function of state.

```javascript
var tictactoe = function() {
   return B.view([['board'], ['next'], ['winner']], function(board, next, winner) {
      return ['div', [
         ['h3', winner ? 'Winner: ' + winner : 'Next player: ' + next],
         dale.go(Array(3), function(v, k) {
            return ['div', {class: 'board-row'}, dale.go(Array(3), function(v2, k2) {
               var index = k * 3 + k2;
               return ['button', {
                  class: 'square',
                  onclick: B.ev('click', 'square', index)
               }, board[index] || '-'];
            })];
         })
      ]];
   });
}

var calculateWinner = function() {
   var board = B.get('board');
   return dale.stopNot(
      [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],
      undefined, function(row) {
         if (board[row[0]] && board[row[0]] === board[row[1]] && board[row[1]] === board[row[2]])
            return board[row[0]];
      }
   );
}

B.call('set', 'next', 'X');
B.call('set', 'board', Array(9));

B.respond('click', 'square', function(x, index) {
   if (B.get('winner')) return;
   if (B.get('board', index)) return; // already occupied
   B.call(x, 'set', ['board', index], B.get('next'));
   var winner = calculateWinner();
   if (winner) return B.call(x, 'set', 'winner', winner);
   B.call(x, 'set', 'next', B.get('next') === 'X' ? 'O' : 'X');
});

B.mount('body', tictactoe);
```

**Key patterns demonstrated:**
- Pure game logic in a helper function (`calculateWinner`)
- Single responder handles click → set board → check winner → toggle turn
- View depends on 3 store paths: `board`, `next`, `winner`
- Early returns in responder to guard against invalid moves

---

### TodoMVC (with localStorage, routing, editing)

A full TodoMVC implementation with persistent storage, hash-based routing, inline editing, and toggle-all.

```javascript
// *** RESPONDERS ***

// Sync browser hash to store
window.addEventListener('hashchange', function() {
   B.call('hash', 'change');
});

B.mrespond([
   ['initialize', 'app', function(x) {
      B.mount('body', todoMVC);
      B.call(x, 'hash', 'change');
      B.call(x, 'load', 'todos');
   }],

   // Persistence with localStorage
   ['load', 'todos', function(x) {
      if (! localStorage['todos-gotoB']) return B.call(x, 'set', 'todos', []);
      B.call(x, 'set', 'todos', JSON.parse(localStorage.getItem('todos-gotoB')));
   }],
   ['change', 'todos', {match: B.changeResponder}, function(x) {
      localStorage.setItem('todos-gotoB', JSON.stringify(B.get('todos')));
   }],

   // Hash-based routing
   ['hash', 'change', function(x) {
      var hash = window.location.hash.replace('#/', '');
      if (hash !== '' && hash !== 'active' && hash !== 'completed')
         return window.location.hash = '#/';
      B.call(x, 'set', 'view', hash);
   }],

   // CRUD operations
   ['enter', 'new', function(x, keycode) {
      if (keycode !== 13) return;
      var title = (B.get('newTodo') || '').trim();
      if (title === '') return;
      B.call(x, 'add', 'todos', {id: teishi.time(), title: title, completed: false});
      B.call(x, 'set', 'newTodo', '');
   }],
   ['toggle', 'todos', function(x, value) {
      dale.go(B.get('todos'), function(todo, index) {
         B.call(x, 'set', ['todos', index, 'completed'], value);
      });
   }],
   ['start', 'edit', function(x, index) {
      B.call(x, 'set', 'editTodo', B.get('todos', index, 'title'));
      B.call(x, 'set', 'editIndex', index);
      // Focus the input after the view redraws
      c('.editing input.edit')[0].focus();
   }],
   ['enter', 'edit', function(x, keycode) {
      if (keycode === 13) return B.call(x, 'finish', 'edit');
      if (keycode === 27) {
         B.call(x, 'set', 'editIndex', undefined);
         B.call(x, 'set', 'editTodo', '');
      }
   }],
   ['finish', 'edit', function(x) {
      var newTitle = B.get('editTodo'), index = B.get('editIndex');
      if (index === undefined) return;
      if (newTitle === '') B.call(x, 'rem', 'todos', index);
      else B.call(x, 'set', ['todos', index, 'title'], newTitle);
      B.call(x, 'set', 'editIndex', undefined);
   }],
   ['clear', 'completed', function(x) {
      B.call(x, 'set', 'todos', dale.fil(B.get('todos'), undefined, function(todo) {
         if (! todo.completed) return todo;
      }));
   }]
]);

// *** VIEW ***

var todoMVC = function() {
   return ['div', [
      ['style', [/* CSS omitted for brevity */]],
      ['section', {'class': 'todoapp'}, [
         // Header with new todo input
         ['header', ['h1', 'todos'],
            B.view('newTodo', function(newTodo) {
               return ['input', {
                  'class': 'new-todo',
                  placeholder: 'What needs to be done?',
                  value: newTodo,
                  onkeyup: B.ev('enter', 'new', {raw: 'event.keyCode'}),
                  oninput: B.ev('set', 'newTodo')
               }];
            })
         ],
         // Todo list with toggle-all and filtered view
         B.view('todos', function(todos) {
            todos = todos || [];
            var allCompleted = dale.stopNot(todos, true, function(t) { return t.completed });
            return ['section', {'class': 'main'}, [
               ['input', {
                  'class': 'toggle-all', type: 'checkbox',
                  checked: allCompleted,
                  onclick: B.ev('toggle', 'todos', ! allCompleted)
               }],
               // Nested view for filter + edit state
               B.view([['view'], ['editIndex'], ['editTodo']], function(view, editIndex, editTodo) {
                  return ['ul', {'class': 'todo-list'}, dale.go(todos, function(todo, index) {
                     if (todo.completed   && view === 'active')    return;
                     if (! todo.completed && view === 'completed') return;
                     return ['li', {'class': (todo.completed ? 'completed ' : '') + (index === editIndex ? 'editing' : '')}, [
                        ['div', {'class': 'view'}, [
                           ['input', {
                              'class': 'toggle', type: 'checkbox',
                              checked: todo.completed,
                              onclick: B.ev('set', ['todos', index, 'completed'], ! todo.completed)
                           }],
                           ['label', {ondblclick: B.ev('start', 'edit', index)}, todo.title],
                           ['button', {'class': 'destroy', onclick: B.ev('rem', 'todos', index)}]
                        ]],
                        ['input', {
                           'class': 'edit',
                           value: editTodo,
                           oninput: B.ev('set', 'editTodo'),
                           onkeydown: B.ev('enter', 'edit', {raw: 'event.keyCode'}),
                           onblur: B.ev('finish', 'edit')
                        }]
                     ]];
                  })];
               })
            ]];
         }),
         // Footer with count, filters, and clear completed
         B.view('todos', function(todos) {
            todos = todos || [];
            var incomplete = dale.fil(todos, false, function(t) { return ! t.completed }).length;
            return ['footer', {'class': 'footer'}, [
               ['span', {'class': 'todo-count'}, ['strong', [incomplete, ' item', incomplete === 1 ? '' : 's', ' left']]],
               B.view('view', function(view) {
                  return ['ul', {'class': 'filters'}, dale.go(['All', 'Active', 'Completed'], function(f) {
                     var fv = f === 'All' ? '' : f.toLowerCase();
                     return ['li', ['a', {href: '#/' + fv, 'class': fv === view ? 'selected' : ''}, f]];
                  })];
               }),
               todos.length > incomplete
                  ? ['button', {'class': 'clear-completed', onclick: B.ev('clear', 'completed')}, 'Clear completed']
                  : []
            ]];
         })
      ]]
   ]];
}

B.call('initialize', 'app');
```

**Key patterns demonstrated:**
- **Persistence**: `B.changeResponder` on `todos` to auto-save to localStorage
- **Routing**: `hashchange` event → store update → view redraws automatically
- **Inline editing**: `editIndex` and `editTodo` in store, double-click to start, Enter/Escape/blur to finish
- **Filtered views**: nested `B.view` on `['view']` to filter todos by active/completed
- **Toggle-all**: `dale.go` to set all todos' `completed` in one sweep
- **Derived state**: incomplete count calculated in vfun (not stored)
- **Conditional rendering**: `return;` inside `dale.go` to skip filtered items

---

### GitHub Profiles (async data fetching)

Fetching and displaying data from an API with refresh-per-suggestion.

```javascript
B.mrespond([
   ['initialize', [], function(x) {
      B.mount('body', view);
      B.call(x, 'refresh', []);
   }],
   ['refresh', [], function(x) {
      dale.go(dale.times(3, 0), function(index) {
         B.call(x, 'retrieve', 'suggestion', index);
      });
   }],
   ['retrieve', 'suggestion', function(x, index) {
      B.call(x, 'set', ['suggestions', index], {}); // clear immediately
      var randomOffset = Math.floor(Math.random() * 500);
      c.ajax('get', 'https://api.github.com/users?since=' + randomOffset, {}, '', function(error, rs) {
         if (error) return console.log('Error', error.responseText);
         B.call(x, 'set', ['suggestions', index], rs.body[0]);
      });
   }]
]);

var view = function() {
   return B.view('suggestions', function(suggestions) {
      return ['div', {class: 'container'}, [
         ['h2', 'Who to follow'],
         ['a', {href: '#', onclick: B.ev('refresh', [])}, 'Refresh'],
         ['ul', dale.go(suggestions, function(s, index) {
            return ['li', [
               ['img', {src: s.avatar_url}],
               ['a', {href: s.html_url, target: '_blank'}, s.login],
               ['a', {href: '#', onclick: B.ev('retrieve', 'suggestion', index)}, 'X']
            ]];
         })]
      ]];
   });
}

B.call('initialize', []);
```

**Key patterns demonstrated:**
- **Async with `c.ajax`**: fetch from GitHub API, update store in callback
- **Immediate clearing**: `B.call(x, 'set', ..., {})` clears old data before fetch
- **Per-item refresh**: each suggestion has its own "X" button that re-fetches just that slot
- **Context passing**: `x` passed through event chain for traceability in `B.log`

---

### Temperature Converter (bi-directional binding with regex responder paths)

From the 7GUIs tasks — two inputs that stay in sync.

```javascript
var converter = function() {
   return ['div', [
      B.view(['temperature', 'celsius'], function(celsius) {
         return ['input', {onchange: B.ev('set', ['temperature', 'celsius']), value: celsius}];
      }),
      ['label', ' Celsius = '],
      B.view(['temperature', 'fahrenheit'], function(fahrenheit) {
         return ['input', {onchange: B.ev('set', ['temperature', 'fahrenheit']), value: fahrenheit}];
      }),
      ['label', ' Fahrenheit']
   ]];
}

// Single responder handles BOTH directions using a regex in the path!
B.respond('change', ['temperature', /celsius|fahrenheit/], function(x, value) {
   value = parseInt(value);
   if (isNaN(value)) return;
   if (x.path[1] === 'celsius')    B.call(x, 'set', ['temperature', 'fahrenheit'], Math.round(value * 9/5 + 32));
   if (x.path[1] === 'fahrenheit') B.call(x, 'set', ['temperature', 'celsius'],    Math.round((value - 32) * 5/9));
});

B.mount('body', converter);
```

**Key patterns demonstrated:**
- **Regex in responder path**: `/celsius|fahrenheit/` matches both directions
- **`x.path` inspection**: responder uses `x.path[1]` to know which field changed
- **Bi-directional sync**: changing either input updates the other

---

### CRUD (Create, Read, Update, Delete with filter and selection)

From the 7GUIs tasks — a people list with filter prefix, selection, and full CRUD.

```javascript
views.crud = function() {
   return ['div', [
      ['h2', 'CRUD'],
      // Filter input
      B.view(['crud', 'filter'], function(filter) {
         return ['input', {value: filter, oninput: B.ev('set', ['crud', 'filter'])}];
      }),
      // People list (filtered, selectable)
      B.view([['crud', 'people'], ['crud', 'filter'], ['crud', 'selected']], function(people, filter, selected) {
         return ['ul', dale.go(people, function(person, k) {
            if (filter && ! person.surname.toLowerCase().match(filter.toLowerCase())) return;
            return ['li', {
               'class': k === selected ? 'selected' : '',
               onclick: B.ev('set', ['crud', 'selected'], k)
            }, person.surname + ', ' + person.name];
         })];
      }),
      // Name/Surname inputs
      B.view(['crud', 'new', 'name'], function(name) {
         return ['input', {value: name, oninput: B.ev('set', ['crud', 'new', 'name'])}];
      }),
      B.view(['crud', 'new', 'surname'], function(surname) {
         return ['input', {value: surname, oninput: B.ev('set', ['crud', 'new', 'surname'])}];
      }),
      // Action buttons
      B.view([['crud', 'new', 'name'], ['crud', 'new', 'surname'], ['crud', 'selected']], function(name, surname, selected) {
         return ['div', [
            ['button', {
               disabled: ! name || ! surname,
               onclick: B.ev('add', ['crud', 'people'], {name: name, surname: surname})
            }, 'Create'],
            ['button', {
               disabled: selected === undefined,
               onclick: B.ev('set', ['crud', 'people', selected || 0], {name: name, surname: surname})
            }, 'Update'],
            ['button', {
               disabled: selected === undefined,
               onclick: B.ev(
                  ['rem', ['crud', 'people'], selected],
                  ['rem', 'crud', 'selected'],
                  ['rem', 'crud', 'new']
               )
            }, 'Delete']
         ]];
      })
   ]];
}

// When selection changes, copy selected person's data to edit fields
B.respond('change', ['crud', 'selected'], function(x) {
   B.call(x, 'set', ['crud', 'new'], teishi.copy(B.get('crud', 'people', B.get('crud', 'selected'))));
});

B.call('set', ['crud', 'people'], [
   {name: 'Hans', surname: 'Emil'},
   {name: 'Max',  surname: 'Mustermann'},
   {name: 'Roman', surname: 'Tisch'}
]);

B.mount('body', views.crud);
```

**Key patterns demonstrated:**
- **Selection state**: index stored in `['crud', 'selected']`
- **`teishi.copy`**: deep-copy selected person to edit fields (avoids mutating store)
- **Multiple events in one click**: Delete button fires `rem` on people, selection, and edit buffer
- **Disabled buttons**: computed from store values directly in vfun
- **Filter as store value**: typing filters the list reactively

---

### App Skeleton (recommended project setup)

```javascript
var dale = window.dale, teishi = window.teishi, lith = window.lith, c = window.c, B = window.B;

var type = teishi.type, clog = teishi.clog;

// Initialize store with namespaces
window.Data  = B.store.Data  = {};
window.State = B.store.State = {};

// The rest of the app goes here!
```

**Key pattern:** Splitting store into `Data` (server/persistent data) and `State` (UI state like current page, loading flags, etc.) and binding them to `window` for quick console access during development.

---

### Production responder patterns (from tagaway frontend responders)

These are battle-tested patterns worth reusing in bigger gotoB apps.

#### 1) Navigation: split hash parsing from access control

Use one responder to **parse URL hash** and another to **enforce route rules**.

```javascript
window.addEventListener('hashchange', function () {
   B.call('read', 'hash', window.location.hash);
});

B.respond('read', 'hash', function (x) {
   var hash = window.location.hash.replace('#/', '').split('/');
   var page = hash[0];
   B.call(x, 'goto', 'page', page, true); // fromHash = true
});

B.respond('goto', 'page', function (x, page, fromHash) {
   var pages = {logged: ['pics'], unlogged: ['login', 'signup']};
   var logged = B.get('Data', 'csrf');

   if (! logged && inc(pages.logged, page)) {
      B.call(x, 'set', ['State', 'redirect'], page);
      return B.call(x, 'goto', 'page', 'login');
   }

   if (logged && inc(pages.unlogged, page)) return B.call(x, 'goto', 'page', 'pics');

   B.call(x, 'set', ['State', 'page'], page);
   if (window.location.hash !== '#/' + page) window.location.hash = '#/' + page;
});
```

Why this works well:
- URL parsing is isolated from auth and redirect logic.
- You can call `goto page` from anywhere (UI click, startup, API callback), not just from hash changes.
- `fromHash` prevents navigation loops.

#### 2) AJAX wrapper responders: centralize CSRF, auth expiry, retries, metrics

`tagaway` defines generic `get`/`post` responders and routes all requests through them.

```javascript
B.respond(/^(get|post)$/, [], {match: H.matchVerb}, function (x, headers, body, cb) {
   var t = Date.now(), path = x.path[0];

   if (x.verb === 'post' && needsCSRF(path)) body.csrf = B.get('Data', 'csrf');

   c.ajax(x.verb, path, headers, body, function (error, rs) {
      B.call(x, 'ajax ' + x.verb, path, {
         t: Date.now() - t,
         code: error ? error.status : rs.xhr.status
      });

      if (error && error.status === 403) {
         B.call(x, 'reset', 'store', true);
         B.call(x, 'goto', 'page', 'login');
         return B.call(x, 'snackbar', 'red', 'Your session has expired.');
      }

      if (shouldRetry(path, error)) {
         return setTimeout(function () {
            B.call(x, x.verb, x.path, headers, body, cb);
         }, 10000);
      }

      if (cb) cb(x, error, rs);
   });
});
```

Benefits:
- One place for cross-cutting concerns.
- Feature responders stay tiny (`B.call(x, 'post', 'tag', ..., cb)`).
- Consistent error handling and logging.

#### 3) “Mute updates” for batched state changes

When a responder needs to update multiple store paths quickly, avoid many redraws/events:
- use direct `B.set`/`B.add`/`B.rem` (or `mset`/`madd`/`mrem`),
- then emit a single manual `change`.

Pattern used in `query pivs` and selection logic:

```javascript
// batched updates without intermediate change responders
B.set(['State', 'selected'], nextSelected);
B.set(['Data', 'pivs'], rs.body.pivs);
B.set(['State', 'chunks'], H.computeChunks(x, rs.body.pivs));

// now trigger only what you need
B.call(x, 'change', ['Data', 'pivs'], rs.body.pivs);
B.call(x, 'change', ['State', 'selected']);
```

Use this when:
- multiple updates are logically one transaction,
- intermediate redraws would flicker,
- change responders are expensive.

#### 4) Async race control: keep only latest response

For rapidly changing queries, assign a request token/timestamp and discard stale callbacks.

```javascript
var t = Date.now();
B.call(x, 'set', ['State', 'querying'], {t: t, options: options});

B.call(x, 'post', 'query', {}, payload, function (x, error, rs) {
   var querying = B.get('State', 'querying');
   if (t !== querying.t) {
      querying.options.retry = true;
      return B.call(x, 'query', 'pivs', querying.options);
   }
   B.call(x, 'rem', 'State', 'querying');
   // apply result
});
```

This prevents old network responses from overwriting newer user intent.

#### 5) Snackbar lifecycle: cancel before set

When notifications can fire rapidly, always cancel the existing timeout before creating a new one. This prevents stacked timers and UI race conditions:

```javascript
B.respond('clear', 'snackbar', function(x) {
   var s = B.get('State', 'snackbar');
   if (s && s.timeout) clearTimeout(s.timeout);
   B.call(x, 'rem', 'State', 'snackbar');
});

B.respond('snackbar', 'green', function(x, msg) {
   B.call(x, 'clear', 'snackbar');
   var timeout = setTimeout(function() {
      B.call(x, 'rem', 'State', 'snackbar');
   }, 3000);
   B.call(x, 'set', ['State', 'snackbar'], {color: '#04E762', message: msg, timeout: timeout});
});
```

The full tagaway snackbar (shown later) generalizes this to multiple colors via `H.matchVerb`.

#### 6) Navigation + UI events: combine stopPropagation with route event

In views, use composed event handlers to keep DOM concerns separate from app actions:

```javascript
['a', {onclick: B.ev(H.stopPropagation, ['goto', 'page', 'pics'])}, 'Go home']
```

This pattern keeps responder code clean and avoids accidental parent click handlers.

---

## 7. cicek — HTTP Server for Node.js (~800 lines)

**Purpose**: Minimal backend server with route matching, request parsing, file serving, cookies, gzip, etag caching, logging, and optional clustering. Designed with the same ustack philosophy: small, explicit, readable.

### Core Mental Model

A cicek app is mostly:
1. Define `routes` as data (`[method, path, handler, ...extraArgs]`)
2. Optionally set `cicek.options` (cookies, headers, logging)
3. Start with `cicek.listen({port}, routes)`
4. In handlers, reply with `cicek.reply(rs, code, body, headers)`

### Route format

```javascript
var routes = [
   ['get', 'stats', function (rq, rs) {
      cicek.reply (rs, 200, {ok: true});
   }],
   ['post', 'upload', function (rq, rs) {
      cicek.reply (rs, 200, {received: true});
   }],
   ['all', '*', function (rq, rs) {
      rs.next (); // middleware-style pass-through
   }]
];
```

Path support includes:
- string paths (`'auth/login'`)
- wildcards (`'assets/*'`)
- named captures (`'admin/activity/:username'`)
- regex paths (`/sho|shm/`)

Captured params are exposed in `rq.data.params`.

### Request lifecycle (important for LLMs)

For each request, cicek:
- normalizes request data (`rq.method`, `rq.origin`, query params, cookies)
- parses body as JSON or multipart/form-data depending on `content-type`
- executes first matching route
- allows chaining with `rs.next()`
- replies via `cicek.reply`
- runs `cicek.apres` hook (cleanup + response logging)

### Output helpers

#### `cicek.reply(rs, code?, body?, headers?, contentType?)`
- serializes objects/arrays to JSON automatically
- sets content type when needed
- supports etag/304 (for non-POST)
- supports gzip when client accepts it

#### `cicek.file(rq, rs, file?, paths?, headers?, dots?)`
- serves static files
- resolves path from wildcard captures when `file` omitted
- includes content type detection, etag and gzip
- blocks `..` by default for safety

### Cookies

```javascript
cicek.options.cookieSecret = SECRET.cookieSecret;

var setCookie = cicek.cookie.write ('session', token, {
   httponly: true,
   samesite: 'Lax',
   path: '/',
   expires: new Date (Date.now () + 1000 * 60 * 60 * 24 * 365)
});
```

- `cookie.write` signs values if `cookieSecret` exists
- `cookie.read` verifies signatures and drops invalid/tampered cookies

### Cluster mode

```javascript
cicek.cluster ();
cicek.listen ({port: CONFIG.port}, routes);
```

- master forks workers
- workers report fatal errors to master
- dead workers are respawned automatically

---

### tagaway patterns with cicek

`tagaway` is a strong production example of cicek usage.

#### 1) Layered middleware via ordered routes + `rs.next()`

`tagaway` stacks cross-cutting concerns before feature routes:
- maintenance/consistency guard
- uptime HEAD route
- static file routes
- auth/session loader
- csrf guard for POST
- business endpoints

Pattern:
```javascript
['all', '*', function (rq, rs) {
   // gatekeeper
   rs.next ();
}],
['post', '*', function (rq, rs) {
   // csrf checks
   rs.next ();
}],
['post', 'auth/login', function (rq, rs) {
   // feature logic
}]
```

#### 2) Centralized response/metrics hook by overriding `cicek.apres`

`tagaway` extends cicek's default `Apres` to:
- redact sensitive request fields
- emit request metrics (counts, timings)
- send notifications for non-ignored errors
- then call base cleanup/logging with `cicek.Apres(rs)`

This is an excellent pattern for observability without polluting route handlers.

#### 3) Static + dynamic endpoints from one route table

Examples used in `tagaway`:
- static files: `cicek.file` (`favicon`, `assets/*`, `img/*`)
- HTML shells: `reply(rs, 200, lith.g([...]))`
- JSON API: `reply(rs, 200, { ... })`

A single route DSL handles all of these.

#### 4) Auth session from signed cookie + per-request `rq.user`

`tagaway` reads signed cookie (`CONFIG.cookieName`), authenticates session, then enriches request context:
- `rq.user` (logged-in user)
- `rq.user.csrf`
- semi-public exceptions for selected upload routes

Then POST guard validates csrf from either:
- multipart form fields (`rq.data.fields.csrf`)
- JSON body (`rq.body.csrf`)

#### 5) Body parsing strategy that matches endpoint type

In `tagaway`:
- JSON endpoints use `rq.body` objects (e.g. auth/query/tag)
- upload endpoints rely on multipart parsing (`rq.data.fields`, `rq.data.files`)

cicek handles parsing choice automatically by `content-type`.

### Do / Don't for cicek app generation

- **Do** put shared concerns in early `['all','*']` / `['post','*']` middleware routes.
- **Do** use `rs.next()` explicitly when a route is middleware.
- **Do** centralize outbound behavior in `cicek.apres` (metrics/redaction/alerts).
- **Do** serve files through `cicek.file` instead of hand-rolling stream logic.
- **Don't** trust unsigned cookies; set `cicek.options.cookieSecret`.
- **Don't** duplicate csrf checks in every endpoint; guard once in a wildcard POST route.

---

## 8. hitit — Minimal HTTP(S) API Testing Client (~240 lines)

**Purpose**: Tiny request runner for API testing. Great for integration tests and scripted flows where each request can depend on previous responses.

### Core API

#### `h.one(state, options, cb)`
Run one request.

Important `options` keys:
- `host`, `port`, `https`, `method`, `path`, `headers`, `body`
- `code` expected status (or `'*'` for any)
- `raw` for binary responses (Buffer)
- `timeout` (seconds)
- `apres(state, options, rdata, cb)` post-check hook

`rdata` contains:
- `code`, `headers`, `body`, `time`, `request`

#### `h.seq(state, sequence, cb, map)`
Run many requests in sequence.
- flattens nested arrays
- ignores falsy/empty items (handy for conditional tests)
- `map` transforms compact test definitions into full request objects

#### `h.stdmap`
Maps tuple-style test arrays:
`[tag, method, path, headers, body, code, apres, delay]`
into a standard options object.

### Body handling

hitit auto-selects request encoding from `body`:
- primitive/string → plain text
- object/array → JSON (`content-type: application/json` by default)
- `{multipart: ...}` → multipart/form-data (fields/files)

This makes uploads and JSON APIs easy to mix in one suite.

### Test Tuple Shape (used with `h.stdmap`)

Each test step is a compact array:

```javascript
[tag, method, path, headers, body, code, apres, delay]
```

| Field | Type | Description |
|---|---|---|
| `tag` | string | Descriptive name (becomes your failure report) |
| `method` | string | `'get'` \| `'post'` \| `'put'` \| `'delete'` |
| `path` | string | Endpoint path (`'auth/login'`, `'db'`, `'/'`) |
| `headers` | object | Request headers |
| `body` | string/object/array/function | Request body; **functions receive `state`** for dynamic bodies |
| `code` | number | Expected HTTP status code |
| `apres` | function | Optional `(state, options, rdata, cb)` validator |
| `delay` | number | Optional delay in ms before running this step |

### Dynamic Request Bodies

When a step depends on prior responses, use a function for `body`:

```javascript
['delete queue entry', 'post', 'db', {}, function (s) {
   return {head: {verb: 'delete', path: ['queue', s.queueId]}};
}, 200]
```

This avoids hardcoding IDs and keeps steps self-contained.

### Async Assertions

When testing background effects or eventual consistency, use `apres` with a delay callback:

```javascript
['check async side-effect', 'get', 'status', {}, '', 200, function (s, options, rdata, cb) {
   setTimeout (function () {
      // assert on rdata or re-fetch and check
      cb ();
   }, 200);
}]
```

### Running a Suite with `h.seq`

```javascript
h.seq (
   {host: CONFIG.host, port: CONFIG.port, timeout: 2},
   [suite1, suite2, suite3],
   function (error) {
      if (error) {
         error.request.body = error.request.body.slice (0, 1000)
            + (error.request.body.length > 1000 ? '... OMITTING REMAINDER' : '');
         return console.log ('FINISHED WITH AN ERROR:', error);
      }
      log ('ALL TESTS FINISHED SUCCESSFULLY!');
   },
   h.stdmap
);
```

Key points: all blocks in one orchestrated sequence, fail fast, compact but useful diagnostics.

### Minimal Test Template

```javascript
var h      = require ('hitit');
var teishi = require ('teishi');
var type = teishi.t, log = teishi.l;
var CONFIG = require ('../config');

var id = Math.random () + '';

var tests = [
   ['create item invalid', 'post', 'db', {}, {head: {verb: 'post', path: ['item', id]}, body: {}}, 400],
   ['create item valid',   'post', 'db', {}, {head: {verb: 'post', path: ['item', id]}, body: {id: id, value: 1}}, 200],
   ['get item', 'post', 'db', {}, {head: {verb: 'get', path: ['item', id]}}, 200, function (s, options, rdata) {
      if (type (rdata.body) !== 'object' || rdata.body.body.value !== 1) return log ('item value mismatch');
      return true;
   }],
   ['delete item', 'post', 'db', {}, {head: {verb: 'delete', path: ['item', id]}}, 200]
];

h.seq ({host: CONFIG.host, port: CONFIG.port}, [tests], function (error) {
   if (error) return console.log ('FINISHED WITH AN ERROR:', error);
   log ('ALL TESTS FINISHED SUCCESSFULLY!');
}, h.stdmap);
```

### Test Suite Checklist

When generating integration tests, verify coverage of:

- [ ] Protected routes deny unauthenticated requests
- [ ] Login/signup/logout lifecycle tested
- [ ] Invalid payloads return correct `4xx`
- [ ] Valid payloads mutate state correctly
- [ ] Reads after writes verify persisted values
- [ ] Conflict behavior (`409`) tested where applicable
- [ ] Cleanup restores initial state
- [ ] Unknown route returns `404`

### Style Rules

- Prefer many small explicit steps over giant validators.
- Use descriptive step names — they become your failure report.
- Always verify both negative and positive paths.
- Always include cleanup at the end.
- Use random IDs (`Math.random () + ''`) to avoid collisions in parallel runs.
- Keep assertions deterministic and specific.

---

### tagaway test patterns

#### 1) Shared mutable `state` across the whole suite

The tagaway test harness stores session context in `state` and reuses it automatically:
- `state.headers.cookie`
- `state.csrf`
- ids from prior responses

Example pattern:
```javascript
H.setCredentials = function (s, rq, rs) {
   s.headers = {cookie: rs.headers['set-cookie'][0].split(';')[0]};
   s.csrf = rs.body.csrf;
   return true;
}
```

#### 2) Compact test tuples + global map function

Most tests are written as short arrays and converted centrally via `h.stdmap` in `h.seq(..., map)`.

`tagaway`’s custom map adds CSRF automatically to most POST requests:
- JSON body: inject `body.csrf = s.csrf`
- multipart body: push `{type:'field', name:'csrf', value:s.csrf}`
- skip auth routes where csrf should not be sent

This eliminates boilerplate in thousands of tests.

#### 3) `apres` as assertion hook + state transition hook

Each request can validate response and mutate state for the next request.
- return `true` to continue
- return `false` to fail the suite
- return `undefined` only for async continuation (call `cb` later)

The tagaway test harness mostly keeps `apres` synchronous and pure assertions.

#### 4) Polling/retry wrapper for eventually-consistent assertions

`H.testTimeout` wraps a test so failed assertions are retried for a fixed window using `h.one` repeatedly.
Useful for async backend operations (uploads/conversions/index updates).

#### 5) Binary endpoint verification with `raw: true`

For file/video/download endpoints, tests request raw bytes and compare content/headers instead of JSON parsing.

### Do / Don't for hitit suites

- **Do** centralize request defaults in `state` (`port`, `headers`, auth context).
- **Do** use a single `map` function in `h.seq` to inject common behavior (csrf, headers, tagging).
- **Do** keep `apres` small: assert + minimal state updates.
- **Do** use `code: '*'` only when status can legitimately vary and you assert in `apres`.
- **Don't** duplicate csrf injection logic inside every test; do it once in `map`.
- **Don't** parse binary responses as text; use `raw: true`.

---

## 9. giz — Minimal Auth Primitives for Redis-backed apps (~170 lines)

**Purpose**: Small authentication module for username/password auth, sessions, password recovery, and account destruction.

giz gives you compact primitives instead of a full auth framework:
- `giz.signup(user, pass, cb)`
- `giz.login(user, pass, cb)`
- `giz.auth(session, cb)`
- `giz.logout(session, cb)`
- `giz.recover(user, cb)`
- `giz.reset(user, tokenOrTrue, newPass, cb)`
- `giz.destroy(user, cb)`

### Data model & expiration

By default (with Redis db adapter), giz stores:
- `users:USER` hash (at least `pass`)
- `session:TOKEN` string (expires)
- `token:USER` string (password reset token hash, expires)

Session/token TTL is controlled by:
```javascript
giz.config.expires = 7 * 24 * 60 * 60;
```

You can provide your own redis client:
```javascript
giz.redis = redisClient;
```

### How tagaway uses giz

tagaway uses giz as the core auth engine and layers app-specific concerns around it.

#### 1) Login/signup/recover/reset are delegated, validation remains app-level

Pattern:
- Validate request body and business constraints in route handlers.
- Call giz for auth state transitions.
- Add app-specific side effects (logging, emails, csrf issuance, cookies, redirects).

This keeps giz focused and makes app behavior explicit.

#### 2) Session cookie + csrf are managed outside giz

giz handles session identity, while app code handles transport/security details:
- write signed cookie with session token
- store/fetch csrf per session
- enforce csrf on POST routes

This separation is clean and reusable: giz doesn’t assume browser transport semantics.

#### 3) Sliding session expiration via `giz.auth`

`giz.auth(session, cb)` re-sets the session key when valid, effectively refreshing inactivity TTL.
In practice, each valid authenticated request extends session lifetime.

#### 4) OAuth/session integration by adding a custom login helper

tagaway adds `giz.loginOAuth(user, cb)` that creates a session without password verification,
then reuses the same downstream cookie/csrf/session flow.

This is a strong pattern: extend giz with tiny helpers instead of forking auth logic.

#### 5) Admin/user account deletion still uses giz primitives

Even with complex app-level cleanup, final auth teardown still calls:
- `giz.destroy(user)`
- `giz.logout(session)` when needed

So account lifecycle remains consistent.

### Do / Don't for giz integration

- **Do** keep giz as auth core and implement policy/UX in your routes.
- **Do** set `giz.config.expires` explicitly for your product requirements.
- **Do** centralize cookie + csrf handling outside giz (middleware/wildcard routes).
- **Do** wrap giz calls with strict input validation and clear user-facing errors.
- **Don't** mix auth persistence concerns into unrelated route code.
- **Don't** bypass giz for manual password/session writes unless you fully mirror its behavior.

---

# Part II: tagaway — A Canonical ustack Application

tagaway (formerly acpic) is a production photo/video organizer built entirely with the ustack. It is the canonical reference for how all nine libraries work together in a real, complex application. This section documents the architecture, patterns, and conventions that emerge when you build a full product on the ustack.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (single-page app)                                          │
│                                                                     │
│  client.js (~7400 lines)                                            │
│  ├── CSS object (CSS.vars, CSS.litc)    — all styles as litc data   │
│  ├── SVG object (svg)                   — inline SVG as strings     │
│  ├── H object (helpers)                 — pure functions            │
│  ├── B.mrespond([...])                  — all responders            │
│  ├── var views = {}                     — all view functions        │
│  └── B.mount('body', views.base)        — entry point               │
│                                                                     │
│  Loaded via: gotoB.min.js + client.js                               │
├─────────────────────────────────────────────────────────────────────┤
│  Server (Node.js)                                                   │
│                                                                     │
│  server.js (~6100 lines)                                            │
│  ├── require: dale, teishi, lith, cicek, giz, hitit, redis          │
│  ├── var routes = [...]                 — all routes as data        │
│  ├── cicek.apres = ...                  — metrics/logging hook      │
│  ├── cicek.cluster()                    — multi-process             │
│  └── cicek.listen({port}, routes)       — start server              │
│                                                                     │
│  test/: hitit test suites                                           │
├─────────────────────────────────────────────────────────────────────┤
│  Redis                                                              │
│  ├── users:USERNAME hash (pass, email, ...)                         │
│  ├── session:TOKEN → username (TTL)                                 │
│  ├── csrf:TOKEN → token (TTL)                                       │
│  └── app-specific keys (pivs, tags, uploads, ...)                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Frontend: Single-File Structure

tagaway's entire frontend lives in one file: `client.js`. It's loaded by an HTML shell that cicek generates server-side using `lith.g`:

```javascript
// server.js — HTML shell generation
['get', '/', reply, lith.g([
   ['!DOCTYPE HTML'],
   ['html', [
      ['head', [
         ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
         ['meta', {charset: 'utf-8'}],
         ['title', 'tagaway'],
         ['link', {rel: 'stylesheet', href: '...fonts...'}],
      ]],
      ['body', [
         ['script', {src: 'assets/gotoB.min.js'}],
         ['script', 'B.prod = ' + (ENV === 'prod') + ';'],
         ['script', {src: 'client.js'}]
      ]]
   ]]
])]
```

### client.js Layout (top to bottom)

```javascript
// 1. Imports & aliases
var dale = window.dale, teishi = window.teishi, lith = window.lith, c = window.c, B = window.B;
var type = teishi.type, clog = teishi.clog, eq = teishi.eq, last = teishi.last, inc = teishi.inc;
var media = lith.css.media, style = lith.css.style;

// 2. Debug keyboard shortcuts (Ctrl+K eventlog, Ctrl+L filter, Ctrl+P perf)
window.addEventListener('keydown', function(ev) { ... });

// 3. CSS object — all styles as lith litc data
var CSS = {
   vars: { /* design tokens: colors, fonts, spacing, transitions */ },
   typography: { /* type scale functions */ },
   litc: [ /* all CSS rules as litc arrays */ ]
};

// 4. SVG object — all inline SVGs as strings
var svg = { /* icon names → SVG markup strings */ };

// 5. Helpers object — pure utility functions
var H = {};
H.matchVerb = function(ev, responder) { return B.r.compare(ev.verb, responder.verb); }
H.stopPropagation = ['stop', 'propagation', {raw: 'event'}];
H.isUserTag = function(tag) { ... }
H.computeChunks = function(x, pivs) { ... }
// etc.

// 6. All responders in one B.mrespond call
B.mrespond([
   // General: initialize, reset, snackbar, ajax, error, routing
   // Auth: csrf, login, logout, signup, recover, reset
   // Data: query pivs, query tags, click piv, toggle tag, tag pivs
   // Upload: start, progress, complete
   // etc.
]);

// 7. All views as functions on a views object
var views = {};
views.base = function() { ... }     // root view
views.login = function() { ... }    // auth pages
views.pics = function() { ... }     // main gallery
views.grid = function() { ... }     // photo grid
views.open = function() { ... }     // fullscreen viewer
views.upload = function() { ... }   // upload UI
views.account = function() { ... }  // settings
// etc.

// 8. Entry point
B.mount('body', views.base);
B.call('initialize', []);
```

### Store Structure Convention

tagaway splits `B.store` into two top-level namespaces:

```javascript
// In the 'initialize' responder:
B.call(x, 'set', 'State', {});   // UI state (page, selections, filters, loading flags)
B.call(x, 'set', 'Data',  {});   // Server data (user info, photos, tags, uploads)
window.State = B.get('State');     // Bind to window for console debugging
window.Data  = B.get('Data');
```

**`State`** contains ephemeral UI state:
- `State.page` — current page (`'login'`, `'pics'`, `'upload'`, ...)
- `State.query` — current query parameters (`{tags: [...], sort: 'newest', fromDate: ...}`)
- `State.selected` — selected photo IDs (`{pivId: {id, date, dateup}, ...}`)
- `State.open` — fullscreen photo (`{id, k}`)
- `State.snackbar` — notification message (`{color, message, timeout}`)
- `State.upload` — upload queue and progress
- `State.filter` — sidebar search text
- `State.redirect` — page to go to after login

**`Data`** contains server-sourced data:
- `Data.csrf` — CSRF token (also used as "is logged in?" check)
- `Data.account` — user account info
- `Data.pivs` — current query result (array of photo objects)
- `Data.pivTotal` — total matching photos
- `Data.tags` — all user tags
- `Data.queryTags` — tag counts for current query
- `Data.hometags` — tags pinned to home screen

### The Base View Pattern

The root view uses `State.page` to select which page view to render:

```javascript
views.base = function() {
   return [
      ['style', CSS.litc],        // All CSS injected once
      views.snackbar(),            // Global notification overlay
      views.feedback(),            // Feedback modal
      views.date(),                // Date change modal
      views.manageHome(),          // Home tag management modal
      B.view(['State', 'page'], function(page) {
         if (! views[page]) return ['div'];
         return views[page]();     // Dispatch to page view
      })
   ];
}
```

Key insight: **global overlays** (snackbar, modals) are siblings of the page router, not children. They render regardless of which page is active.

### CSS-in-JS via litc

All CSS is expressed as a single litc array in `CSS.litc`, injected via `['style', CSS.litc]` in the base view:

```javascript
var CSS = {
   vars: {
      'color--one': '#5b6eff',
      'grey--darker': '#484848',
      fontPrimaryMedium: {
         'font-family': "'Montserrat'",
         'font-weight': '500',
         'font-style': 'normal',
      },
      easeOutQuart: 'all 400ms cubic-bezier(0.165, 0.84, 0.44, 1)',
   },
   typography: {
      typeBase: 13,
      typeRatio: 1.125,
      fontSize: function(n) {
         return (Math.pow(CSS.typography.typeRatio, n)).toFixed(5) + 'rem';
      },
      spaceVer: function(n) {
         return (n * 1.5).toFixed(5) + 'rem';
      },
   },
   litc: [
      // Reset
      ['html, body, div, span, ...', {'margin, padding, border': 0, font: 'inherit'}],
      // Typography
      ['html', {'font-size': 13}],
      // Buttons
      ['.button', {
         'border-radius': 100,
         mixin1: CSS.vars.fontPrimaryMedium,   // mixin: object value gets flattened
         height: 42,
         transition: CSS.vars.easeOutQuart,
      }],
      ['.button--one', {
         border: '1px solid ' + CSS.vars['color--one'],
         'background-color': CSS.vars['color--one'],
         color: '#fff',
         cursor: 'pointer',
      }],
      // Responsive
      lith.css.media('screen and (max-width: 767px)', [
         ['.hide-on-mobile', {display: 'none'}],
      ]),
      // Nesting + parent reference
      ['.tag', {color: 'rgba(72, 72, 72, 0.8)', transition: '250ms linear color'},
         ['&:hover', {color: '#484848'}]
      ],
   ]
};
```

Patterns to note:
- **Design tokens** as a `vars` object, referenced everywhere via `CSS.vars['color--one']`
- **Font mixins** as objects: `{mixin1: CSS.vars.fontPrimaryMedium}` — lith flattens nested objects in CSS attributes
- **Responsive rules** via `lith.css.media(selector, litc)`
- **CSS functions** (`fontSize`, `spaceVer`) for typographic scale
- **All CSS in one place** — no external CSS files, no build step

### The H (Helpers) Object

Pure functions used across responders and views:

```javascript
var H = {};

// Match responder verb only (ignore path), used with {match: H.matchVerb}
H.matchVerb = function(ev, responder) {
   return B.r.compare(ev.verb, responder.verb);
}

// Inline event to stop DOM event propagation
H.stopPropagation = ['stop', 'propagation', {raw: 'event'}];

// Tag classification (tagaway uses prefix conventions: d:: date, g:: geo, u:: untagged, etc.)
H.isUserTag  = function(tag) { return tag.length > 0 && ! tag.match(/^[a-z]::/); }
H.isDateTag  = function(tag) { return !! tag.match(/^(d|r)::/); }
H.isGeoTag   = function(tag) { return !! tag.match(/^g::/); }
H.isYearTag  = function(tag) { return !! tag.match(/^d::\d/); }
H.isMonthTag = function(tag) { return !! tag.match(/^d::M/); }

// Safe regex from user filter input
H.makeRegex = function(filter) {
   if (! filter) return new RegExp('.*', 'i');
   return new RegExp(filter.trim().replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'), 'i');
}

// SVG icon helper (renders opaque so gotoB doesn't diff it)
H.putSvg = function(which, height) {
   return ['span', {opaque: true, style: ! height ? undefined : style({height: height})}, ['LITERAL', svg[which]]];
}

// Conditional helper for inline use in views
H.if = function(condition, then, Else) {
   return condition ? then : Else;
}
```

### Responder Architecture

All responders are registered in a single `B.mrespond([...])` call, organized into sections:

#### General Responders

```javascript
B.mrespond([
   // Runs once on load (burn: true)
   ['initialize', [], {burn: true}, function(x) {
      B.call(x, 'reset', 'store');
      B.call(x, 'retrieve', 'csrf');
      B.mount('body', views.base);
   }],

   // Reset entire store (on init and logout)
   ['reset', 'store', function(x, logout) {
      if (logout) B.log = B.r.log = [];
      var redirect = B.get('State', 'redirect');
      B.call(x, 'set', 'State', redirect ? {redirect: redirect} : {});
      B.call(x, 'set', 'Data', {});
      window.State = B.get('State');
      window.Data = B.get('Data');
   }],

   // Snackbar notification (verb is color: 'green', 'red', 'yellow')
   ['snackbar', [], {match: H.matchVerb}, function(x, message, noTimeout) {
      B.call(x, 'clear', 'snackbar');
      var colors = {green: '#04E762', red: '#D33E43', yellow: '#ffff00'};
      if (noTimeout) return B.call(x, 'set', ['State', 'snackbar'], {color: colors[x.path[0]], message: message});
      var timeout = setTimeout(function() { B.call(x, 'rem', 'State', 'snackbar'); }, 4000);
      B.call(x, 'set', ['State', 'snackbar'], {color: colors[x.path[0]], message: message, timeout: timeout});
   }],
```

#### Centralized AJAX (get/post via regex verb)

```javascript
   // Matches both 'get' and 'post' verbs; path[0] is the API endpoint
   [/^(get|post)$/, [], {match: H.matchVerb}, function(x, headers, body, cb) {
      var t = Date.now(), path = x.path[0];

      // Auto-inject CSRF for POST (except auth routes)
      if (x.verb === 'post' && ! inc(['auth/login', 'auth/signup', 'auth/recover', 'auth/reset'], path)) {
         if (type(body, true) === 'formdata') body.append('csrf', B.get('Data', 'csrf'));
         else                                  body.csrf = B.get('Data', 'csrf');
      }

      c.ajax(x.verb, path, headers, body, function(error, rs) {
         // Log request timing
         B.call(x, 'ajax ' + x.verb, path, {t: Date.now() - t, code: error ? error.status : rs.xhr.status});

         // Session expiry → force re-login
         if (error && error.status === 403) {
            B.call(x, 'reset', 'store', true);
            B.call(x, 'goto', 'page', 'login');
            return B.call(x, 'snackbar', 'red', 'Your session has expired.');
         }

         // Retry on connection error for uploads
         if (x.verb === 'post' && inc(['upload', 'error'], x.path[0]) && error && error.status === 0) {
            return setTimeout(function() { B.call(x, x.verb, x.path, headers, body, cb); }, 10000);
         }

         if (cb) cb(x, error, rs);
      });
   }],
```

This pattern means **all API calls go through one place**. Feature responders call:
```javascript
B.call(x, 'post', 'tag', {}, {tag: 'vacation', ids: pivIds}, function(x, error, rs) { ... });
B.call(x, 'get', 'tags', {}, '', function(x, error, rs) { ... });
```

#### Hash-Based Routing

```javascript
   // Browser hash change → parse → route
   ['read', 'hash', {id: 'read hash'}, function(x) {
      var hash = window.location.hash.replace('#/', '').split('/');
      var page = hash[0];
      // Handle special URL params (verify tokens, import callbacks, etc.)
      if (page === 'reset' && hash[1] && hash[2])
         B.call(x, 'set', ['Data', 'reset'], {token: hash[1], username: hash[2]});
      B.call(x, 'goto', 'page', page, true);
   }],

   // Route enforcement: auth guards + redirect logic
   ['goto', 'page', {id: 'goto page'}, function(x, page, fromHash) {
      var pages = {
         logged:   ['pics', 'upload', 'share', 'tags', 'import', 'account', 'upgrade'],
         unlogged: ['login', 'signup', 'recover', 'reset']
      };
      if (! inc(pages.logged, page) && ! inc(pages.unlogged, page)) page = 'pics';

      var logged = B.get('Data', 'csrf');

      // Not logged in → redirect to login, save intended page
      if (! logged && inc(pages.logged, page)) {
         B.call(x, 'set', ['State', 'redirect'], page);
         return B.call(x, 'goto', 'page', 'login');
      }
      // Logged in → skip auth pages
      if (logged && inc(pages.unlogged, page)) return B.call(x, 'goto', 'page', 'pics');

      B.call(x, 'set', ['State', 'page'], page);
      if (window.location.hash !== '#/' + page) window.location.hash = '#/' + page;
   }],
```

#### Query with Race Control

```javascript
   ['query', 'pivs', function(x, options) {
      options = options || {};
      var query = teishi.copy(B.get('State', 'query'));  // snapshot query
      if (! query) return;
      var t = Date.now();

      // Race control: if already querying, just store new intent
      if (! options.retry && B.get('State', 'querying'))
         return B.call(x, 'set', ['State', 'querying'], {t: t, options: options});

      B.call(x, 'set', ['State', 'querying'], {t: t, options: options});

      B.call(x, 'post', 'query', {}, { /* query payload */ }, function(x, error, rs) {
         var querying = B.get('State', 'querying');
         // Stale response? Re-query with latest intent
         if (t !== querying.t) {
            querying.options.retry = true;
            return B.call(x, 'query', 'pivs', querying.options);
         }
         B.call(x, 'rem', 'State', 'querying');
         if (error) return B.call(x, 'snackbar', 'red', 'Error getting pictures.');

         // Batched mute updates (avoid intermediate redraws)
         B.set(['State', 'selected'], /* filtered selection */);
         B.set(['Data', 'pivs'], rs.body.pivs);
         B.set(['State', 'chunks'], H.computeChunks(x, rs.body.pivs));

         // Then manually trigger only the changes needed
         B.call(x, 'change', ['Data', 'pivs'], rs.body.pivs);
      });
   }],
```

#### Tagging (CRUD on photos)

```javascript
   ['tag', 'pivs', {id: 'tag pivs'}, function(x, tag, del) {
      if (! tag) return;
      if (del && ! confirm('Remove tag ' + tag + '?')) return;
      if (! H.isUserTag(tag) && tag !== 'o::')
         return B.call(x, 'snackbar', 'yellow', 'Cannot use that tag.');

      var ids = dale.keys(B.get('State', 'selected'));
      B.call(x, 'post', 'tag', {}, {tag: tag, ids: ids, del: del}, function(x, error, rs) {
         if (error) return B.call(x, 'snackbar', 'red', 'Error tagging.');
         B.call(x, 'snackbar', 'green', 'Tagged ' + ids.length + ' pictures with ' + tag);
         B.call(x, 'query', 'pivs');  // refresh results
      });
   }],
```

### View Patterns

#### Nested Views for Independent Reactivity

The pics page demonstrates deeply nested `B.view` calls, each bound to different store paths:

```javascript
views.pics = function() {
   return ['div', {class: 'pics-target app-pictures app-all-tags'}, [
      views.header(true, true),
      views.open(),                         // fullscreen overlay

      // Update banner: reacts to State.query.update only
      B.view(['State', 'query', 'update'], function(update) {
         if (! update) return ['div'];
         return ['div', {class: 'update-pivs-box'}, [ /* update/auto-update UI */ ]];
      }),

      // Main content: reacts to Data.pivs and State.query.home
      B.view([['Data', 'pivs'], ['State', 'query', 'home']], function(pivs, home) {
         if (! pivs) return ['div'];
         return ['div', [
            ['div', {class: 'sidebar'}, [
               // Tag list: reacts to 9 different store paths
               B.view([['State', 'filter'], ['State', 'query', 'tags'], ['Data', 'queryTags'],
                       ['Data', 'monthTags'], ['Data', 'account'], ['State', 'showNTags'],
                       ['State', 'tagOrder'], ['State', 'expandCountries'], ['State', 'expandYears']],
                  function(filter, selected, queryTags, monthTags, account, showNTags, tagOrder, ...) {
                     // Complex tag list with filtering, sorting, grouping
                     return ['ul', dale.go(taglist, function(tag) { return makeTag(tag); })];
                  }
               ),
            ]],
            ['div', {class: 'main'}, [views.grid()]]
         ]];
      }),
   ]];
}
```

#### DOM Manipulation Outside Views for Performance

For high-frequency changes like selection highlighting, tagaway manipulates the DOM directly via `cocholate` inside a change responder, bypassing gotoB's diff:

```javascript
['change', ['State', 'selected'], {match: B.changeResponder}, function(x) {
   var selected = B.get('State', 'selected') || {};
   var pivs = document.getElementsByClassName('pictures-grid__item-picture');
   dale.go(pivs, function(piv) {
      if (selected[piv.id]   && ! piv.classList.contains('selected')) piv.classList.add('selected');
      if (! selected[piv.id] &&   piv.classList.contains('selected')) piv.classList.remove('selected');
   });
   // Toggle CSS classes on parent container for sidebar mode switching
   // ...
}],
```

This is the recommended approach when:
- Changes are frequent (every click/scroll)
- The affected DOM is large (hundreds of photo elements)
- The change is purely additive (toggling a class), not structural

#### Opaque Elements for External Content

SVG icons are rendered as opaque elements so gotoB doesn't try to diff them:

```javascript
H.putSvg = function(which, height) {
   return ['span', {opaque: true, style: ! height ? undefined : style({height: height})},
      ['LITERAL', svg[which]]
   ];
}
```

#### Compound Events in onclick

```javascript
// Multiple events in one click: stop propagation + navigate
['a', {onclick: B.ev(H.stopPropagation, ['goto', 'page', 'pics'])}, 'Go home']

// Tag + clear input in one click
['span', {onclick: B.ev(
   ['cart', 'add', product.id, quantity],
   ['rem', 'quantities', product.id]
)}, 'Add to cart']

// Conditional event (no-op with empty array)
['button', {onclick: B.ev(selected ? ['delete', 'pivs'] : [])}, 'Delete']
```

## Backend: Server Structure

### Route Table as Data

tagaway's server is a single `routes` array passed to `cicek.listen`:

```javascript
var routes = [
   // 1. Gatekeeper middleware
   ['all', '*', function(rq, rs) {
      if (mode === 'makeConsistent') return reply(rs, 503, {error: 'maintenance'});
      rs.next();
   }],

   // 2. Health check
   ['head', '*', function(rq, rs) { reply(rs, rq.url === '/stats' ? 200 : 404); }],

   // 3. Static assets
   ['get', 'favicon.ico', cicek.file, 'assets/img/favicon.ico'],
   ['get', 'assets/gotoB.min.js', cicek.file, 'node_modules/gotob/gotoB.min.js'],
   ['get', ['assets/*', 'client.js', 'admin.js'], cicek.file],

   // 4. HTML shells (generated with lith)
   ['get', '/', reply, lith.g([ /* full HTML document as lith */ ])],

   // 5. Pre-auth error logging (for non-logged-in users)
   ['post', 'error', function(rq, rs) { /* log + reply 200 */ }],

   // 6. Public auth routes
   ['post', 'auth/login',   function(rq, rs) { /* giz.login + cookie + csrf */ }],
   ['post', 'auth/signup',  function(rq, rs) { /* validation + giz.signup */ }],
   ['post', 'auth/recover', function(rq, rs) { /* giz.recover + email */ }],
   ['post', 'auth/reset',   function(rq, rs) { /* giz.reset */ }],
   ['get',  'auth/verify/(*)', function(rq, rs) { /* email verification */ }],

   // 7. Session middleware (authenticate all further routes)
   ['all', '*', function(rq, rs) {
      // Read signed cookie → giz.auth → set rq.user → rs.next()
      giz.auth(rq.data.cookie[CONFIG.cookieName], function(error, user) {
         if (error || ! user) return reply(rs, 403, {error: 'session'});
         rq.user = user;
         rs.next();
      });
   }],

   // 8. CSRF middleware (all POST after this point)
   ['get', 'auth/csrf', function(rq, rs) { reply(rs, 200, {csrf: rq.user.csrf}); }],
   ['post', '*', function(rq, rs) {
      // Validate csrf from body or multipart fields
      if (rq.body.csrf !== rq.user.csrf) return reply(rs, 403, {error: 'csrf'});
      delete rq.body.csrf;
      rs.next();
   }],

   // 9. Protected routes
   ['post', 'auth/logout', function(rq, rs) { /* giz.logout + clear cookie */ }],
   ['post', 'auth/delete', function(rq, rs) { /* giz.destroy + cleanup */ }],
   ['get',  'account',     function(rq, rs) { /* user info */ }],
   ['post', 'query',       function(rq, rs) { /* photo search */ }],
   ['post', 'tag',         function(rq, rs) { /* attach/detach tags */ }],
   ['post', 'upload',      function(rq, rs) { /* multipart file upload */ }],
   ['get',  'thumb/:size/:id', function(rq, rs) { /* serve thumbnail */ }],
   ['get',  'piv/:id',     function(rq, rs) { /* serve photo/video */ }],
   // ... more endpoints
];

cicek.options.cookieSecret = SECRET.cookieSecret;
cicek.cluster();
cicek.listen({port: CONFIG.port}, routes);
```

### Middleware Layering via Route Order + rs.next()

The route order creates a middleware pipeline:
1. **Maintenance guard** → all requests
2. **Health check** → HEAD requests
3. **Static files** → GET for assets
4. **HTML shells** → GET for pages
5. **Pre-auth error logging** → POST /error (no auth needed)
6. **Public auth** → login/signup/recover/reset
7. **Session loader** → authenticates cookie, sets `rq.user`
8. **CSRF guard** → validates token on all POST
9. **Protected endpoints** → business logic

Each middleware calls `rs.next()` to pass to the next matching route.

### Centralized Metrics via cicek.apres

tagaway overrides `cicek.apres` for observability:

```javascript
cicek.apres = function(rs) {
   var t = Date.now();
   // Redact sensitive fields
   if (rs.log.url.match(/^\/auth/))
      if (rs.log.requestBody && rs.log.requestBody.password) rs.log.requestBody.password = 'REDACTED';

   // Emit metrics
   var logs = [['flow', 'rq-' + rs.log.code, 1]];
   if (rs.log.code >= 400) {
      logs.push(['flow', 'rq-bad', 1]);
      // Send alert notification for non-trivial errors
      if (! isIgnoredError) notify({type: 'response error', code: rs.log.code, ...});
   }
   else {
      logs.push(['flow', 'rq-all', 1]);
      logs.push(['flow', 'ms-all', t - rs.log.startTime]);
      // Per-endpoint timing
      dale.go(['auth', 'query', 'upload', 'tag', ...], function(path) {
         if (rs.log.url.match(new RegExp('^\/' + path)))
            logs.push(['flow', 'ms-' + path, t - rs.log.startTime]);
      });
   }
   H.stat.w(logs);
   cicek.Apres(rs);  // call original for cleanup/logging
}
```

### Auth Integration with giz

```javascript
// Setup
giz.redis = redis;
giz.config.expires = 7 * 24 * 60 * 60;  // 1 week sessions

// Login route
['post', 'auth/login', function(rq, rs) {
   // 1. Validate input
   if (stop(rs, [['username', rq.body.username, 'string'], ['password', rq.body.password, 'string']])) return;

   // 2. Delegate to giz
   giz.login(rq.body.username, rq.body.password, function(error, session) {
      if (error) return reply(rs, 403, {error: error});

      // 3. Create CSRF token, store in Redis
      var csrf = require('crypto').randomBytes(20).toString('hex');
      redis.setex('csrf:' + session, giz.config.expires, csrf, function(error) {
         // 4. Set signed cookie + return CSRF
         reply(rs, 200, {csrf: csrf}, {
            'set-cookie': cicek.cookie.write(CONFIG.cookieName, session, {
               httponly: true, samesite: 'Lax', path: '/',
               expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
            })
         });
      });
   });
}],
```

## Full-Stack Data Flow: Tagging a Photo

Here's how a single user action (tagging a photo) flows through every layer:

```
1. USER clicks tag button
   → onclick: B.ev('tag', 'pivs', 'vacation')

2. GOTOB generates: B.call('tag', 'pivs', 'vacation')

3. RESPONDER ['tag', 'pivs'] fires:
   → validates tag (H.isUserTag)
   → collects selected IDs from B.get('State', 'selected')
   → B.call(x, 'post', 'tag', {}, {tag: 'vacation', ids: [...], del: false})

4. AJAX RESPONDER [/^(get|post)$/, []] fires:
   → injects body.csrf = B.get('Data', 'csrf')
   → c.ajax('post', 'tag', headers, body, callback)

5. COCHOLATE sends XMLHttpRequest to server

6. CICEK receives request, runs route pipeline:
   → ['all', '*'] maintenance check → rs.next()
   → ['all', '*'] session loader → giz.auth(cookie) → rq.user set → rs.next()
   → ['post', '*'] CSRF check → body.csrf matches rq.user.csrf → rs.next()
   → ['post', 'tag'] handler:
      → validates body with teishi.stop
      → updates Redis: adds tag to piv's tag set
      → reply(rs, 200, {})

7. RESPONSE flows back:
   → cicek.apres logs metrics + timing
   → c.ajax callback fires in browser
   → AJAX RESPONDER calls cb(x, null, rs)
   → TAG RESPONDER's callback:
      → B.call(x, 'snackbar', 'green', 'Tagged 3 pictures')
      → B.call(x, 'query', 'pivs')  // refresh view

8. QUERY RESPONDER fires:
   → sends POST /query to server
   → receives updated piv list
   → B.set(['Data', 'pivs'], newPivs)  // mute
   → B.call(x, 'change', ['Data', 'pivs'])  // manual trigger

9. VIEW RESPONDER at B.view(['Data', 'pivs'], ...) fires:
   → vfun re-executes with new data
   → gotoB diffs old vs new prediff
   → DOM updated via applyDiff (Myers diff algorithm)

10. USER sees updated photo grid + green snackbar notification
```

## Summary of Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| `State` / `Data` split | Store | Separate UI state from server data |
| `H.matchVerb` | Responders | Match on verb only (path becomes first arg) |
| Regex verb `[/^(get\|post)$/]` | AJAX | Centralize all HTTP in one responder |
| `B.set` + manual `B.call('change')` | Batched updates | Avoid redraw storms |
| Race timestamp `t !== querying.t` | Async queries | Discard stale responses |
| `H.stopPropagation` | Views | Keep DOM concerns out of responders |
| `{opaque: true}` | SVG/external | Skip diffing for non-reactive content |
| Direct DOM via `classList` | Selection | Performance for high-frequency changes |
| `['all', '*'] + rs.next()` | Server | Middleware pipeline as route data |
| `cicek.apres` override | Server | Centralized metrics/alerts |
| `giz.*` + app cookie/csrf | Auth | Auth primitives + app-level transport |
| Single `B.mrespond([...])` | Client | All behavior in one place |
| `var views = {}` | Client | All UI in one place |
| `CSS.litc` array | Client | All styles in one place |
