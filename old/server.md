# Server annotated source

The complete source code is contained in `server.js`.

Below is an annotated reading of the first 100 lines of the file, following the style used in gotoB's readme: short prose sections explaining what each small chunk does, interleaved with the code itself.

## Setup

We first require a few built-in Node modules used throughout the server:

- `fs`, for local file operations on vibey itself.
- `Path`, for constructing filesystem paths in a platform-safe way.
- `crypto`, for random ids, hashes or signatures.
- `http`, for lower-level HTTP work.
- `events`, from which we take the `EventEmitter` constructor.

```javascript
var fs    = require ('fs');
var Path  = require ('path');
var crypto = require ('crypto');
var http   = require ('http');
var EventEmitter = require ('events');
```

We then require four libraries used throughout the server:

- `dale`, for iteration and small data helpers.
- `teishi`, for validation and utility functions.
- `lith`, for generating HTML.
- `cicek`, for the HTTP server and routing layer.

```javascript
var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');
```

Right after the libraries, the server loads `secret.json` into a single shared in-memory object, `CONFIG`. From this point on, the rest of the file can read and mutate that object directly, instead of reloading the configuration from disk at each call site.

```javascript
var CONFIG = require ('./secret.json');
```

We create a short alias to `console.log`. This is a small convenience, useful in a large file where logging is frequent.

```javascript
var clog = console.log;
```

We also create local aliases for a few `teishi` helpers:

- `type`, to inspect the type of a value.
- `eq`, to compare values.
- `last`, to get the last element of a list.
- `inc`, to test whether an element is contained in an array.

This makes the rest of the file more compact.

```javascript
var type = teishi.type, eq = teishi.eq, last = teishi.last, inc = teishi.inc;
```

## Safe replies and validation failures

`reply` is a defensive wrapper around `cicek.reply`. Its purpose is to avoid throwing or double-writing when the response has already been sent, closed or destroyed.

Unlike the previous version, there is no silent `try/catch` here: the function simply performs the safety checks and then delegates to `cicek.reply`.

```javascript
var reply = function (rs, code, body, headers) {
   if (! rs) return;
   if (rs.headersSent || rs.writableEnded || rs.destroyed) return;
   if (rs.connection && rs.connection.writable === false) return;
   return cicek.reply (rs, code, body, headers);
}
```

`stop` is a small validation helper built on top of `teishi.stop`. It receives a response object and a list of validation `rules`. If validation fails, it sends a `400` response with an `{error: ...}` payload.

The final `true` argument is passed through to `teishi.stop`.

```javascript
var stop = function (rs, rules) {
   return teishi.stop (rules, function (error) {
      reply (rs, 400, {error: error});
   }, true);
}
```

## Logging

The server now groups all logging-related state and helper functions inside a single object, `log`.

This object contains:

- `style`, a map of reusable style presets.
- `color`, the low-level ANSI formatter.
- `code`, a helper for formatting HTTP status codes.
- `logId`, a helper for generating ids.
- `line`, the primitive that prints one log line.
- `docker.start` and `docker.end`, specialized helpers for Docker logging.
- `stream`, a helper for stream and SSE events.

This organization makes the logging subsystem more cohesive: all of its data and behavior live in one namespace.

```javascript
var log = {
   style: {
      ok:        {background: 'green'},
      failed:    {background: 'red'},
      info:      {background: 'cyan'},
      'HTTP-RQ': {color: 'cyan'},
      'HTTP-RS': {color: 'cyan'},
      'DOCK-RQ': {color: 'yellow'},
      'DOCK-RS': {color: 'yellow'},
      ' LLM-RQ': {color: 'magenta'},
      ' LLM-RS': {color: 'magenta'},
      ' SSE-RQ': {color: 'green'},
      ' SSE-RS': {color: 'green'},
      '1xx':     {background: 'cyan'},
      '2xx':     {background: 'green'},
      '3xx':     {background: 'blue'},
      '4xx':     {background: 'yellow'},
      '5xx':     {background: 'red'}
   },
   color: function (text, options) {
      options = options || {};
      var codes = [];
      var colorCodes = {
         black: 30,
         red: 31,
         green: 32,
         yellow: 33,
         blue: 34,
         magenta: 35,
         cyan: 36,
         white: 37,
         gray: 90
      };
      if (options.color === undefined) options.color = 'white';
      if (options.bold  === undefined) options.bold  = true;
      if (options.color      !== undefined && colorCodes [options.color]      !== undefined) codes.push (colorCodes [options.color]);
      if (options.background !== undefined && colorCodes [options.background] !== undefined) codes.push (colorCodes [options.background] + 10);
      if (options.bold) codes.push (1);
      return codes.length ? '\u001b[' + codes.join (';') + 'm' + text + '\u001b[0m' : text;
   },
   code: function (code) {
      code = String (code || '0');
      return log.color (code, log.style [(code [0] || '5') + 'xx']);
   },
   logId: function (length) {
      return cicek.pseudorandom (length);
   },
   line: function (kind, id) {
      var parts = Array.prototype.slice.call (arguments, 2);
      var coloredKind = log.style [kind] ? log.color (kind, log.style [kind]) : kind;
      var line = [new Date ().toISOString (), coloredKind, id].concat (parts).join (' ');
      line = line.replace (/\((\d+)ms\)/g, function (match) {
         return log.color (match);
      });
      console.log (line);
   },
   docker: {
      start: function (id, project, command) {
         log.line ('DOCK-RQ', id, project, command.slice (0, 200));
      },
      end: function (id, project, ok, ms, detail) {
         var status = ok ? log.color ('OK', log.style.ok) : log.color ('FAILED', log.style.failed);
         log.line ('DOCK-RS', id, project, status, '(' + ms + 'ms)', detail ? detail.slice (0, 200) : '');
      }
   },
   stream: function (kind, id, projectName, dialogId, eventType, extra) {
      log.line (kind, id, projectName, 'dialog=' + dialogId, 'type=' + eventType, extra || '');
   }
};
```

A few details are worth noting.

First, `log.color` receives a `text` and an `options` object. The options object can contain three keys:

- `color`, for the foreground color.
- `background`, for the background color.
- `bold`, a boolean.

If these options are omitted, the helper defaults to white text and bold text. The helper uses unicode escapes (`\u001b`) and always appends a final reset code.

Second, `log.style` only specifies deviations from the default style. That is why many presets only set a background or a foreground color.

Third, the same `log.style` object contains both semantic labels like `ok` and transport prefixes like `HTTP-RQ`, as well as the `1xx` to `5xx` HTTP code families.

## Specialized logging behavior

`log.code` formats an HTTP-like status code by coercing it to a string, taking its first digit, and selecting one of the `1xx` to `5xx` presets from `log.style`.

`log.logId` delegates to `cicek.pseudorandom`, so log ids use the same random hexadecimal mechanism as HTTP request ids.

`log.line` is the core primitive. It colors the prefix when a preset exists, builds the full line with timestamp and id, makes any `(123ms)` markers bold, and prints the result.

Finally, `log.docker.start`, `log.docker.end`, and `log.stream` are small wrappers around `log.line` for common cases.

## Prompts

Another visual section marker indicates that the next part of the file deals with prompt loading and management.

```javascript
// *** PROMPTS ***
```

`PROMPTS_PATH` stores the absolute path to `prompt.md`, located next to `server.js`.

```javascript
var PROMPTS_PATH = Path.join (__dirname, 'prompt.md');
```

The prompt helper is now a single function, `loadInjectedPrompt(projectName)`. Its job is to assemble the full prompt text that will be injected into model requests.

It does two things:

1. reads `prompt.md` and extracts the fenced prompt body from it;
2. if `doc/main.md` exists for the current project, appends it as project-specific instructions.

So this helper returns the final injected prompt, rather than just the base contents of `prompt.md`.

```javascript
var loadInjectedPrompt = async function (projectName) {
   var prompt = 'You are a helpful assistant with access to local system tools.';
   try {
      var md = fs.readFileSync (PROMPTS_PATH, 'utf8');
      var match = md.match (/```\n([\s\S]*?)\n```/);
      prompt = match ? match [1].trim () : '';
   }
   catch (e) {}
   var docMain = await getDocMainContent (projectName);
   if (! docMain) return prompt;
   return prompt + '\n\nProject instructions (' + docMain.name + '):\n\n' + docMain.content;
};
```

## Secret configuration

The next section still deals with `secret.json`, but now the loading strategy is much simpler.

The file has already been loaded once near the top into `CONFIG`, so here we only define a save helper that persists the current in-memory object back to disk.

```javascript
// *** SECRET.JSON ***
```

`saveConfigJson` writes the current `CONFIG` object back to `secret.json`, formatting it with two-space indentation to keep the file readable by humans.

```javascript
var saveConfigJson = function () {
   fs.writeFileSync (Path.join (__dirname, 'secret.json'), JSON.stringify (CONFIG, null, 2), 'utf8');
};
```

`maskApiKey` is a small display helper. It hides the middle of an API key while leaving a short prefix and suffix visible.

If the key is absent, it returns an empty string. If the key is too short, it returns a fixed masked token instead.

```javascript
var maskApiKey = function (key) {
   if (! key || key.length < 12) return key ? '••••••••' : '';
   return key.slice (0, 7) + '••••••••' + key.slice (-4);
};
```

## PKCE

The next section implements helpers for PKCE, the OAuth mechanism that pairs an authorization code with a verifier and challenge.

```javascript
// *** PKCE ***
```

`base64urlEncode` converts a buffer to base64url format:

- `+` becomes `-`
- `/` becomes `_`
- trailing `=` padding is removed

This is the encoding format required by PKCE.

```javascript
var base64urlEncode = function (buffer) {
   return buffer.toString ('base64').replace (/\+/g, '-').replace (/\//g, '_').replace (/=/g, '');
};
```

`generatePKCE` generates a verifier and its corresponding SHA-256 challenge.

The flow is:

1. generate 32 random bytes;
2. encode them as the verifier;
3. hash the verifier with SHA-256;
4. base64url-encode the hash as the challenge.

The function returns both values in an object.

```javascript
var generatePKCE = async function () {
   var verifierBytes = crypto.randomBytes (32);
   var verifier = base64urlEncode (verifierBytes);
   var challengeBuffer = crypto.createHash ('sha256').update (verifier).digest ();
   var challenge = base64urlEncode (challengeBuffer);
   return {verifier: verifier, challenge: challenge};
};
```

## OAuth: Anthropic

The next section starts the Anthropic OAuth implementation.

```javascript
// *** OAUTH: ANTHROPIC ***
```

A set of constants defines the OAuth endpoints and request parameters:

- the client id;
- the authorization URL;
- the token exchange URL;
- the redirect URI;
- the requested scopes.

The client id is stored in base64 form and decoded at runtime. This does not make it secret, but it does keep the raw identifier out of plain sight in the source.

```javascript
var ANTHROPIC_CLIENT_ID = Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString ();
var ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
var ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
var ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
var ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';
```

The server keeps one in-flight PKCE login state for Anthropic in memory.

```javascript
// In-flight PKCE state for Anthropic login
var anthropicPendingLogin = null;
```

`startAnthropicLogin` begins the OAuth flow. It generates PKCE material, builds the authorization URL, stores the verifier in memory, and returns the final URL.

Notice that the verifier is also sent back as the OAuth `state`, so it can later be checked on the callback step.

```javascript
var startAnthropicLogin = async function () {
   var pkce = await generatePKCE ();
   var params = new URLSearchParams ({
      code: 'true',
      client_id: ANTHROPIC_CLIENT_ID,
      response_type: 'code',
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      scope: ANTHROPIC_SCOPES,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state: pkce.verifier
   });
   var url = ANTHROPIC_AUTHORIZE_URL + '?' + params.toString ();
   anthropicPendingLogin = {verifier: pkce.verifier};
   return url;
};
```

`completeAnthropicLogin` finishes the OAuth flow. The function starts by ensuring there is a pending login in memory, then retrieves and clears the stored verifier.

It splits the received `authCode` on `#`, treating the first part as the authorization code and the second as the returned state.

```javascript
var completeAnthropicLogin = async function (authCode) {
   if (! anthropicPendingLogin) throw new Error ('No pending Anthropic login');
   var verifier = anthropicPendingLogin.verifier;
   anthropicPendingLogin = null;

   var splits = authCode.split ('#');
   var code = splits [0];
   var state = splits [1];
```

The function then verifies that the returned state matches the stored verifier. If it does not, the login is rejected.

```javascript
   if (state && state !== verifier) throw new Error ('Anthropic OAuth state mismatch');
```

Finally, it begins the token exchange request by POSTing JSON to Anthropic's token endpoint. The rest of this function continues beyond the chunk covered here.

```javascript
   var response = await fetch (ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify ({
         grant_type: 'authorization_code',
         client_id: ANTHROPIC_CLIENT_ID,
         code: code,
         state: state,
         redirect_uri: ANTHROPIC_REDIRECT_URI,
         code_verifier: verifier
      })
   });
```
