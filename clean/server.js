// *** CONFIG ***

var fs = require ('fs');
var cell = require ('./cell.js');

/* *** SHAPE OF secret.js ***

backup bucket accessKeyId ...
              bucketName ...
              host ...
              region ...
              secretAccessKey ...
email ses accessKeyId ...
          region ...
          secretAccessKey ...
*/

try {
   var CONFIG = cell.textToJS (fs.readFileSync ('config.4tx', 'utf8'));
   var SECRET = cell.textToJS (fs.readFileSync ('secret.4tx', 'utf8'));
}
catch (error) {
   console.log (error);
   var CONFIG = {};
   var SECRET = {};
}

// *** SETUP ***

var child   = require ('child_process')
var cluster = require ('cluster');
var crypto  = require ('crypto');
var Path    = require ('path');
var util    = require ('util');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');
var Redis  = require ('redis').createClient ({db: CONFIG.redis?.db});

var aws4  = require ('aws4');
var mime  = require ('mime');
var hitit = require ('hitit');

var {inc, last, type} = teishi;

// *** SYSTEM PROMPT ***

var systemPrompt = fs.readFileSync ('prompt.md', 'utf8');

// *** MODELS ***

var models = [
   {provider: 'openai',    model: 'gpt-6',   canonical: 'gpt-6-astra',    window: 1050000, priceCache: 1,   priceIn: 10, priceOut: 50},
   {provider: 'openai',    model: 'gpt-5.6', canonical: 'gpt-5.6-sol',    window: 1050000, priceCache: 0.4, priceIn: 4,  priceOut: 20},
   {provider: 'openai',    model: 'gpt-4.1', canonical: 'gpt-4.1',        window: 1047576, priceCache: 0.5, priceIn: 2,  priceOut: 8, requireAPIKey: true},
   {provider: 'anthropic', model: 'opus-5.5', canonical: 'claude-opus-5-5', window: 1000000, priceCache: 0.2, priceIn: 4,  priceOut: 20},
   {provider: 'anthropic', model: 'opus-4.6', canonical: 'claude-opus-4-6', window: 1000000, priceCache: 0.5, priceIn: 5,  priceOut: 25},
];

// *** TEST ***

var test = require ('./test.js');

// *** HELPERS ***

var now = function () {
   return new Date ().toISOString ();
}

var ansi = function (types, text) {
   var colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
   var prefix = dale.go (types, function (type) {
      if (type === 'bold') return '\u001b[1m';
      if (inc (colors, type)) return '\u001b[3' + colors.indexOf (type) + 'm';
      if (inc (colors, type.replace (/^i/, ''))) return '\u001b[4' + colors.indexOf (type) + 'm';
   }).join ('');
   // Apply the color to each line, so that it will be respected by docker logging
   return prefix + text.split ('\n').join ('\n' + prefix) + '\u001b[0m';
}

var clog = function () {
   if (arguments.length > 1 || type (arguments [0]) !== 'object') var log = {args: teishi.copy (arguments)};
   else var log = arguments [0];

   log = {t: now (), from: cicek.isMaster ? 'main' : ('worker' + cluster.worker.id), ... log};
   var color = [];
   if (log.priority === 'important') color.push ('yellow');
   else if (log.priority === 'critical') color.push ('red', 'bold');
   else if (log.type === 'Request') color.push ('cyan');
   else if (log.type === 'Response') color.push ('green');
   else if (log.type === 'Command request') color.push ('magenta');
   else if (log.type === 'Command response') color.push ('magenta', 'bold');

   console.log (ansi (color, cell.JSToText (log)) + '\n\n');
}

var reply = function () {
   var args = arguments;
   var [rs, code, body, headers, contentType] = dale.go (dale.times (5, arguments [0].writable === undefined ? 1 : 0), function (k) {
      return args [k];
   });

   if (rs.headersSent || rs.writableEnded || rs.destroyed || (rs.connection && rs.connection.writable === false)) {
      return clog ({priority: 'important', type: 'Interrupted response', rqId: rs.log.id, method: rs.request.method, path: rs.request.url, ip: rs.log.origin, userId: rs.request.user ? rs.request.user.id : 'anonymous'});
   }

   return cicek.reply (rs, code, body, headers, contentType);
}

var validEmail = /^(?=[A-Z0-9][A-Z0-9@._%+-]{5,253}$)[A-Z0-9._%+-]{1,64}@(?:(?=[A-Z0-9-]{1,63}\.)[A-Z0-9]+(?:-[A-Z0-9]+)*\.){1,8}[A-Z]{2,63}$/i;

var stop = function (rs, rules) {
   return teishi.stop (rules, function (error) {
      reply (rs, 400, {error: error});
   }, true);
}

var formatError = function (error) {
   if (! (error instanceof Error)) return error;
   return {error: error.name, message: error.message, stack: error.stack.split ('\n')};
}

var promise = function (fun, args) {
   if (args === undefined) args = [];
   return util.promisify (fun).apply (null, args);
}

dale.async = async function (input, fun, options) {

   if (input === undefined) return [];
   if (teishi.simple (input)) input = [input];

   options = options || {};
   if (options.concurrent === undefined) options.concurrent = 1;
   if (options.concurrent === true) options.concurrent = dale.keys (input).length;

   var index = 0, keys = dale.keys (input), results = [], error;

   var inner = async function () {
      while (true) {
         if (error) return;
         var i = index++;
         if (i >= keys.length) return;

         try {
            results [keys [i]] = await fun (input [keys [i]], keys [i]);
         }
         catch (Error) {
            if (error) return;
            error = Error;
            throw Error;
         }
      }
   }

   try {
      await Promise.all (dale.go (dale.times (Math.min (keys.length, options.concurrent)), inner));
   }
   catch (error) {
      if (options.catch) options.catch (error);
      else               throw error;
   }

   return results;
}

// *** REDIS ***

var redis = function (command) {
   // Multi
   if (type (command) === 'array') {
      var m = Redis.multi ();
      dale.go (command, function (c) {
         if (c.length === 0) return; // Ignore empty arrays which are used as no-ops within literals
         m [c [0]].apply (m, c.slice (1));
      });
      return promise (m.exec.bind (m));
   }
   // Simple
   return promise (Redis [command].bind (Redis), [].slice.call (arguments, 1));
}

var getForUser = async function (userId, entity) {
   var keys = await redis ('smembers', 'owner:' + userId);
   if (entity === 'project') {
      var grants = await redis ('smembers', 'accessTo:' + userId);
      keys = [... new Set (keys.concat (dale.fil (grants, undefined, function (grant) {
         var [verb, id] = grant.split (':');
         if (verb === 'read' || verb === 'write') return 'project:' + id;
      })))];
   }
   var items = dale.fil (keys, undefined, function (key) {
      if (key.match (new RegExp ('^' + entity + ':'))) return key;
   });

   return await redis (dale.go (items, function (item) {
      return ['hgetall', item];
   }));
}

var validProjectPath = function (path) {
   return type (path) === 'string' &&
      ! path.startsWith ('/') &&
      ! /[\\\x00-\x1f\x7f]/.test (path) &&
      ! path.includes ('//') &&
      ! dale.stop (path.split ('/'), true, function (part) {
         return part === '.' || part === '..';
      });
};

// Project names appear in URLs as /p/<user>/<name>, with each space as `-` and each dash as `--`. A name can't be a UUID (a UUID in that slot is a project id), can't have two spaces in a row or a space next to a dash (those would decode ambiguously), and can't have `/` or `?` (the server decodes the whole URL before routing).
var validProjectName = function (name) {
   return ! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test (name) && ! / {2}| -|- |[/?]/.test (name);
};

var allowOp = async function (userId, projectId, op, prefix) {
   if (op !== 'read' && op !== 'write') return false;
   if (prefix !== undefined && ! validProjectPath (prefix)) return false;
   // access.md names who the project is shared with; requests without a session can't read it.
   if (userId === 'PUBLIC' && prefix === 'vibey/access.md') return false;

   var [owner, grants] = await redis ([
      ['hget', 'project:' + projectId, 'owner'],
      ['sunion', 'accessTo:' + userId, 'accessTo:PUBLIC']
   ]);
   if (! owner) return false;
   if (owner === userId) return true;

   return !! dale.stop (grants, true, function (grant) {
      var [verb, id, ... parts] = grant.split (':');
      if (id !== projectId) return;
      if (verb !== 'write' && verb !== op) return;

      var scope = parts.join (':');
      return ! scope || (type (prefix) === 'string' && prefix.startsWith (scope));
   });
};

var projectAccessCleanup = async function (id) {
   var members = await redis ('smembers', 'accessBy:' + id);
   return [
      ... dale.go (members, function (member) {
         var [verb, who, ... prefix] = member.split (':');
         var suffix = prefix.length ? ':' + prefix.join (':') : '';
         return ['srem', 'accessTo:' + who, verb + ':' + id + suffix];
      }),
      ['del', 'accessBy:' + id]
   ];
};

// *** COMMANDS ***

var run = async function (... args) {

   if (type (last (args)) === 'object') {
      var command = teishi.copy (args.slice (0, -1));
      var options = last (args);
   }
   else var command = teishi.copy (args), options = {};

   var id = cicek.pseudorandom (), t = Date.now ();

   return new Promise (function (resolve, reject) {

      var proc = child.spawn (command [0], command.slice (1), options);

      clog ({type: 'Command request', id, command: command.join (' ')});

      if (options.input !== undefined) {
         proc.stdin.write (options.input);
         proc.stdin.end ();
      }

      var output = {};
      var wait = 3;

      var done = function () {
         if (--wait > 0) return;
         var logOutput = dale.obj (output, function (v, k) {
            if (options [k]) return [k, '[callback]'];
            if (k === 'stdout' && v.length) return [k, '[' + v.length + ' characters]'];
            return [k, v];
         });
         var ms = Date.now () - t;
         clog ({type: 'Command response', id, command: command.join (' '), ms, ... logOutput});
         if (! output.code || options.catch) resolve (output);
         else reject (output);
      }

      dale.go (['stdout', 'stderr'], function (k) {
         proc [k].on ('data', function (chunk) {
            if (options [k]) options [k] (chunk);
            else {
               if (output [k] === undefined) output [k] = '';
               output [k] += chunk;
            }
         });
         proc [k].on ('end', done);
      });

      proc.on ('error', function (error) {
         output.code  = -1;
         output.error = formatError (error);
         done ();
      });
      proc.on ('exit', function (code, signal) {
         if (code !== null) output.code = code;
         if (signal !== null) output.signal = signal;
         done ();
      });
      if (options.onSpawn) options.onSpawn (proc);
   });
}

var docker = {};

docker.access = async function (id) {
   var file = await docker.read (id, '/project/vibey/access.md');
   if (file.code) return file;

   var invalidEntry;
   var entries = dale.fil (file.stdout.toString ('utf8').split (/\r?\n/), undefined, function (line) {
      line = line.trim ();
      // Project grants (`project:<originId> ...`) are read on every cross-project call, not synced.
      if (! line || line.startsWith ('#') || line.startsWith ('project:')) return;
      var match = /^(\S+)\s+(read|write)(?:\s+(.+))?$/.exec (line);
      if (! match || (match [1] !== 'PUBLIC' && ! validEmail.test (match [1]))) return invalidEntry = {error: 'Invalid vibey/access.md line: ' + line};
      if (match [1] === 'PUBLIC' && match [2] !== 'read') return invalidEntry = {error: 'PUBLIC can only be granted read at line: ' + line};

      var prefix = match [3] || '';
      if (! validProjectPath (prefix)) return invalidEntry = {error: 'Invalid vibey/access.md prefix at line: ' + line};

      return {email: match [1] === 'PUBLIC' ? 'PUBLIC' : match [1].toLowerCase (), verb: match [2], prefix};
   });

   if (invalidEntry) return {code: 1, error: invalidEntry.error};

   var emails = dale.keys (dale.obj (entries, function (entry) {
      return [entry.email, true];
   }));

   var users = await dale.async (emails, async function (email) {
      var userId = await redis ('get', 'email:' + email);
      // Keep invitations keyed by email until the account is verified.
      if (userId && await redis ('ttl', 'user:' + userId) === -1) return userId;
      return email;
   });

   var recipients = dale.obj (emails, function (email, k) {
      return [email, users [k]];
   });
   var members = dale.go (entries, function (entry) {
      return entry.verb + ':' + recipients [entry.email] + (entry.prefix ? ':' + entry.prefix : '');
   });

   var previous = await redis ('smembers', 'accessBy:' + id);
   await redis ([
      ... dale.go (previous, function (member) {
         var [verb, who, ... prefix] = member.split (':');
         var suffix = prefix.length ? ':' + prefix.join (':') : '';
         return inc (members, member) ? [] : ['srem', 'accessTo:' + who, verb + ':' + id + suffix];
      }),
      ['del', 'accessBy:' + id],
      members.length ? ['sadd', 'accessBy:' + id, ... members] : [],
      ... dale.go (members, function (member) {
         var [verb, who, ... prefix] = member.split (':');
         var suffix = prefix.length ? ':' + prefix.join (':') : '';
         return ['sadd', 'accessTo:' + who, verb + ':' + id + suffix];
      })
   ]);

   return {code: 0, stdout: 'Access synced for: ' + (emails.join (', ') || '(none)') + '\n'};
};

Path.quote = function (path) {
   return "'" + path.replace (/'/g, "'\\''") + "'";
}

docker.run = async function (id, command, options) {
   id = 'vibey-project-' + id;
   if (type (command) === 'array') command = command.join (' ');

   var commit = options && options.commit, originalCommand;
   // Retry commit up to 50x at ~1ms to handle concurrent git lock contention
   if (commit) {
      originalCommand = command;
      command += ' || exit $?; n=0; sha=; while [ $n -lt 50 ]; do if [ -n "$(git status --porcelain 2>/dev/null)" ]; then git add -A && git commit -m ' + Path.quote (commit) + ' > /dev/null 2>&1 && sha=$(git rev-parse HEAD) && break; fi; sleep 0.001; n=$((n+1)); done; printf "\\nvibey-sha:%s\\n" "$sha"';
      delete options.commit;
   }

   var result = await run ('docker', 'exec', '-i', id, 'sh', '-c', command, {... options, 'catch': true});
   if (result.code === 1 && result.stderr && result.stderr.match (/^Error response from daemon: (?:container .+ is not running|No such container)/)) {
      var recreate = await run ('docker', 'run', '--network', 'vibey-projects', '-v', id + ':/project', '--name', id, '-d', 'vibey-project', {catch: true});
      if (recreate.code) {
         var restart = await run ('docker', 'start', id, {catch: true});
         if (restart.code) return result;
      }
      return docker.run (id.replace ('vibey-project-', ''), originalCommand || command, {... options, commit});
   }
   if (result.code && ! (options && options.catch)) throw result;
   var marker = commit && result.stdout && result.stdout.match (/\nvibey-sha:([0-9a-f]*)\n$/);
   if (marker) {
      result.sha = marker [1] || undefined;
      result.stdout = result.stdout.slice (0, marker.index);
      if (result.stdout === '') delete result.stdout;
      if (result.sha) await docker.backup (id.replace ('vibey-project-', ''));
   }
   return result;
}

docker.read = async function (id, path) {
   var chunks = [];
   var result = await docker.run (id, 'cat ' + Path.quote (path), {catch: true, stdout: function (chunk) {chunks.push (chunk)}});
   return result.code ? {code: result.code, error: result.stderr} : {stdout: Buffer.concat (chunks)};
}

docker.video = async function (rq, rs, id, path) {
   var quoted = Path.quote (path);
   var stat = await docker.run (id, 'test -f ' + quoted + ' || exit 44; wc -c < ' + quoted, {catch: true});
   if (rs.destroyed) return;
   if (stat.code === 44) return reply (rs, 404, fourohfour, 'html');
   if (stat.code) return reply (rs, 500);
   var size = Number (stat.stdout), start = 0, end = size - 1, code = 200;
   if (! Number.isSafeInteger (size) || size < 0) return reply (rs, 500);
   var headers = {
      'content-type': 'video/mp4',
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; media-src 'self'; style-src 'unsafe-inline'",
   };
   // No validators: If-Range always falls back to the full representation.
   var range = ! rq.headers ['if-range'] && /^bytes=(\d*)-(\d*)$/.exec (rq.headers.range || '');
   if (range && (range [1] || range [2])) {
      var first = range [1] ? Number (range [1]) : undefined;
      var last = range [2] ? Number (range [2]) : undefined;
      var invalid = ! size
         || (first !== undefined && ! Number.isSafeInteger (first))
         || (last !== undefined && ! Number.isSafeInteger (last));
      if (first === undefined) {
         start = Math.max (0, size - last);
         invalid = invalid || last === 0;
      }
      else {
         start = first;
         if (last !== undefined) end = Math.min (last, end);
         invalid = invalid || start >= size || end < start;
      }
      if (invalid) return reply (rs, 416, '', {...headers, 'content-range': 'bytes */' + size});
      code = 206;
      headers ['content-range'] = 'bytes ' + start + '-' + end + '/' + size;
   }
   var length = size ? end - start + 1 : 0, sent = 0, failed = false;
   headers ['content-length'] = length;
   var script = [
      'if (Number (process.argv [3]) < 0) process.exit (0);',
      'var stream = require ("fs").createReadStream (process.argv [1], {start: Number (process.argv [2]), end: Number (process.argv [3])});',
      'stream.on ("error", function () {process.exit (1)});',
      'process.stdout.on ("error", function () {process.exit (1)});',
      'stream.pipe (process.stdout);',
   ].join ('\n');
   var proc = child.spawn ('docker', [
      'exec', 'vibey-project-' + id, 'node', '-e', script, path, String (start), String (end),
   ]);
   var begin = function () {
      rs.log.code = code;
      rs.log.responseBody = length;
      rs.log.responseHeaders = headers;
      rs.writeHead (code, headers);
   };
   var fail = function () {
      if (failed || rs.destroyed) return;
      failed = true;
      proc.stdout.unpipe (rs);
      if (rs.headersSent) rs.destroy ();
      else reply (rs, 500);
   };
   proc.stderr.resume ();
   proc.on ('error', fail);
   proc.stdout.on ('error', fail);
   proc.stdout.on ('data', function (chunk) {
      sent += chunk.length;
      if (! failed && ! rs.destroyed && ! rs.headersSent) begin ();
   });
   proc.stdout.pipe (rs, {end: false});
   rs.on ('close', function () {
      proc.stdout.unpipe (rs);
      proc.stdout.destroy ();
      proc.kill ();
   });
   proc.on ('close', function (exitCode) {
      if (failed || rs.destroyed) return;
      if (exitCode !== 0 || sent !== length) return fail ();
      if (! rs.headersSent) begin ();
      rs.end (function () {cicek.apres (rs)});
   });
};

docker.write = async function (id, path, content, noCommit) {
   var command = 'mkdir -p ' + Path.quote (Path.dirname (path)) + ' && cat > ' + Path.quote (path);
   var result = await docker.run (id, command, {input: content, commit: noCommit ? undefined : ('Write ' + Path.quote (path)), catch: true});
   return result.code ? {code: result.code, error: result.stderr} : result;
}

docker.edit = async function (id, path, oldText, newText) {

   var lockKey = 'lock:edit:' + id + ':' + path;
   while (true) {
      var count = await redis ('incr', lockKey);
      if (count === 1) {
         await redis ('expire', lockKey, 10);
         break;
      }
      await new Promise (function (resolve) {setTimeout (resolve, 50)});
   }

   if (oldText === '[EOF]') {
      var result = await docker.run (id, 'cat >> ' + Path.quote (path), {input: newText, catch: true, commit: 'Edit ' + Path.quote (path)});
      await redis ('del', lockKey);
      return result.code ? {code: result.code, error: result.stderr} : result;
   }

   oldText = Buffer.from (oldText);
   newText = Buffer.from (newText);
   var input = Buffer.concat ([Buffer.from (oldText.length + '\n' + newText.length + '\n'), oldText, newText]);

   var script = 'tmp=$(mktemp -d) || exit 1;'
      + ' trap \'rm -rf "$tmp"\' 0;'
      + ' read old_len; read new_len;'
      + ' dd bs=1 count=$old_len of="$tmp/old" 2>/dev/null || exit 1;'
      + ' dd bs=1 count=$new_len of="$tmp/new" 2>/dev/null || exit 1;'
      + " awk -v tmp=\"$tmp\" '"
      +    'BEGIN {RS = sprintf ("%c", 1)}'
      +    ' function rf(f,   _s, _l) {while ((getline _l < f) > 0) _s = _s (length (_s) ? RS : "") _l; close (f); return _s}'
      +    ' {file = file (NR > 1 ? RS : "") $0}'
      +    ' END {'
      +       'old = rf(tmp "/old"); new_ = rf(tmp "/new"); olen = length (old);'
      +       ' s = file; count = 0;'
      +       ' while ((i = index (s, old)) > 0) {count++; s = substr (s, i + olen)}'
      +       ' if (count == 0) {print "Old text not found" > "/dev/stderr"; exit 1}'
      +       ' if (count > 1) {print "Old text found " count " times - must be unique" > "/dev/stderr"; exit 1}'
      +       ' i = index (file, old);'
      +       ' printf "%s", substr (file, 1, i - 1) new_ substr (file, i + olen) > target'
      +    "}"
      + "' target=" + Path.quote (path) + ' ' + Path.quote (path);

   var result = await docker.run (id, script, {input: input, catch: true, commit: 'Edit ' + Path.quote (path)});
   await redis ('del', lockKey);
   return result.code ? {code: result.code, error: result.stderr} : result;
}

docker.cleanup = async function () {
   var result = await run ('docker', 'ps', '-aq', '-f', 'name=vibey-project-', {catch: true});
   if (result.stdout) {
      var projectIds = result.stdout.trim ().split ('\n');
      await run ('docker', 'stop', ... projectIds, {catch: true});
      await run ('docker', 'rm',   ... projectIds, {catch: true});
   }
   process.exit (0);
}

var backup = {};

// Based off https://gist.github.com/adv0r/1dfaf7999d7aac95d473e65b675496b0
backup.presign = function (method, key, expires) {
   var region    = SECRET.backup?.bucket?.host?.match (/s3\.([^.]+)\./)?.[1];

   var now       = new Date ().toISOString ().replace (/[-:]/g, '').replace (/\..+/, '') + 'Z';
   var shortDate = now.slice (0, 8);
   var scope     = shortDate + '/' + region + '/s3/aws4_request';

   var query = [
      'X-Amz-Algorithm=AWS4-HMAC-SHA256',
      'X-Amz-Credential=' + encodeURIComponent (SECRET.backup?.bucket?.accessKeyId + '/' + scope),
      'X-Amz-Date=' + now,
      'X-Amz-Expires=' + (expires || 300),
      'X-Amz-SignedHeaders=host'
   ].join ('&');

   var canonical = [method, '/' + key, query, 'host:' + SECRET.backup?.bucket?.bucketName + '.' + SECRET.backup?.bucket?.host, '', 'host', 'UNSIGNED-PAYLOAD'].join ('\n');
   var toSign    = ['AWS4-HMAC-SHA256', now, scope, crypto.createHash ('sha256').update (canonical).digest ('hex')].join ('\n');

   var hmac = function (key, data) {
      return crypto.createHmac ('sha256', key).update (data).digest ();
   }
   var signingKey = hmac (hmac (hmac (hmac ('AWS4' + SECRET.backup?.bucket?.secretAccessKey, shortDate), region), 's3'), 'aws4_request');
   var signature  = crypto.createHmac ('sha256', signingKey).update (toSign).digest ('hex');

   return 'https://' + SECRET.backup?.bucket?.bucketName + '.' + SECRET.backup?.bucket?.host + '/' + key + '?' + query + '&X-Amz-Signature=' + signature;
}

backup.list = async function (prefix) {
   var objects = [], next;

   while (true) {
      var path = '/?list-type=2';
      if (prefix) path += '&prefix=' + encodeURIComponent (prefix);
      if (next) path += '&continuation-token=' + encodeURIComponent (next);

      var signed = aws4.sign ({
         host:    SECRET.backup?.bucket?.bucketName + '.' + SECRET.backup?.bucket?.host,
         path:    path,
         service: 's3',
         region:  SECRET.backup?.bucket?.region,
      }, {
         accessKeyId:     SECRET.backup?.bucket?.accessKeyId,
         secretAccessKey: SECRET.backup?.bucket?.secretAccessKey,
      });

      var body = await new Promise (function (resolve, reject) {
         hitit.one ({}, {
            https:   true,
            host:    signed.hostname,
            path:    signed.path,
            method:  'get',
            headers: signed.headers,
            code:    200,
         }, function (error, rdata) {
            if (error) return reject (error);
            resolve (rdata.body);
         });
      });

      body.replace (/<Key>([^<]+)<\/Key>\s*<LastModified>([^<]+)<\/LastModified>\s*<[^>]+>[^<]*<[^>]+>\s*<Size>(\d+)<\/Size>/g, function (_, key, modified, size) {
         objects.push ({key: key, modified: modified, size: parseInt (size)});
      });

      var truncated = body.match (/<IsTruncated>true<\/IsTruncated>/);
      if (! truncated) return objects;
      next = body.match (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) [1];
   }
}

docker.backup = async function (id) {

   if (! CONFIG.backup?.enable) return;

   var [tracked, files, lastCommit] = await dale.async (dale.times (3), function (k) {
      if (k === 1) return docker.run (id, 'git -C /project ls-files -co --exclude-standard');
      if (k === 2) return docker.run (id, "find /project -type f -printf '%T@ %p\\n'");
      if (k === 3) return docker.run (id, 'git -C /project log -1 --format=%ct');
   }, {concurrent: true});

   tracked = dale.obj (tracked.stdout.split ('\n'), function (file) {
      if (file !== '') return [file, true];
   });
   files = dale.fil (files.stdout.split ('\n'), undefined, function (file) {
      if (file === '') return;
      file = file.split (/\s+/);
      var name = file [1].replace ('/project/', ''), mtime = file [0].split ('.');
      if (! tracked [name] && ! name.match (/^.git/)) return;
      var mtime = parseInt (mtime [0] + mtime [1].slice (0, 3));
      return [name, mtime];
   });

   lastCommit = parseInt (lastCommit.stdout.replace ('\n', '') + '000');

   clog ({tracked, files, lastCommit});

   // iterate the files to be uploaded: everything with a mtime greater than the last commit
   // git -C /project log -1 --format=%ct

   // for each of the files:
   //    - generate presigned url
   //    - s3.getSignedUrl('putObject', {Bucket, Key: '<project-id>/<path>.<mtime>', Expires: 300})
   //    - run a command that uploads it from the project itself
   //    - curl -X PUT -T <local-path> '<presigned-url>'

   // do the delete sweep:
   //    - s3.listObjectsV2({Bucket, Prefix: '<project-id>/'})
   //    - anything extraneous in the bucket, outside of .git, goes away
   //    - inside of .git, anything extraneous that is older than 7 days
}


// *** RATE LIMIT ***

var rateLimit = async function (prefix, max, ttl) {
   var [result] = await redis ([
      ['incr',   'rateLimit:' + prefix],
      ['expire', 'rateLimit:' + prefix, ttl]
   ]);
   return result > max;
}

// *** EMAIL ***

var mailer;
if (CONFIG.email?.enable && SECRET.email?.ses?.accessKeyId && SECRET.email?.ses?.secretAccessKey) {
   mailer = require ('nodemailer').createTransport (require ('nodemailer-ses-transport') (SECRET.email?.ses));
}

var sendmail = function (options) {
   return new Promise (function (resolve, reject) {
      if (! CONFIG.email?.enable) {
         clog ({type: 'Skipping email', to: options.to, subject: options.subject});
         return resolve ();
      }
      mailer.sendMail ({
         from:    CONFIG.email?.from?.name + ' <' + CONFIG.email?.from?.address + '>',
         to:      options.to,
         replyTo: CONFIG.email?.from?.address,
         subject: options.subject,
         html:    lith.g (options.message)
      }, function (error) {
         if (error) reject (error);
         else       resolve ();
      });
   });
}

// *** ROUTES ***

// The not-found page, served with 404s for file requests: a question mark drawn with spinnies (the client's animated |/-\\ characters) and a link back to the projects.
var fourohfour = lith.g ([
   ['!DOCTYPE HTML'],
   ['html', [
      ['head', [
         ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
         ['meta', {charset: 'utf-8'}],
         ['title', 'Not found - vibey'],
         ['style', [
            ['LITERAL', '@keyframes spinny {0%, 24.99% { content: "|"; } 25%, 49.99% { content: "/"; } 50%, 74.99% { content: "-"; } 75%, 100% { content: "\\\\"; }}'],
            ['.safety', {
               'background-color': '#4a69bd',
               'border-radius': '0.5rem',
               color: '#f5f7ff',
               'font-family': 'sans-serif',
               'font-weight': '600',
               'margin-top': '4rem',
               padding: '0.75rem 1.5rem',
               'text-decoration': 'none',
            }],
            ['body', {
               'align-items': 'center',
               'background-color': '#0f1530',
               color: '#c084fc',
               display: 'flex',
               'flex-direction': 'column',
               'justify-content': 'center',
               margin: 0,
               'min-height': '100vh',
            }],
            ['.cell', {
               display: 'inline-block',
               'font-family': 'monospace',
               'font-size': '2rem',
               'font-weight': 'bold',
               'line-height': '1',
               'text-align': 'center',
               width: '2ch',
            }],
            ['.logo', {
               'background-color': '#1a1a2e',
               'border-radius': '1.125rem',
               'box-sizing': 'border-box',
               display: 'block',
               height: '6.75rem',
               left: '1.5rem',
               padding: '1.125rem',
               position: 'fixed',
               top: 'calc(1.5rem - 2vh)',
               width: '7.59375rem',
            }],
            ['.spinny:before', {
               animation: 'spinny 0.8s steps(1) infinite',
               content: '"|"',
            }],
         ]],
      ]],
      ['body', [
         // The vibey logo, placed as on the projects view; like the button, it takes you to the projects.
         ['a', {href: (CONFIG.baseURL || '') + '/#/projects'}, ['img', {alt: 'vibey', class: 'logo', src: (CONFIG.baseURL || '') + '/favicon.svg'}]],
         ['div', {'aria-label': 'Not found', role: 'img'}, dale.go ([
            '.#####.',
            '##...##',
            '##...##',
            '.....##',
            '....##.',
            '...##..',
            '..##...',
            '..##...',
            '..##...',
            '.......',
            '.......',
            '..##...',
            '.####..',
            '..##...',
         ], function (row) {
            return ['div', dale.go (row.split (''), function (cell) {
               return cell === '#' ? ['span', {class: 'cell spinny'}] : ['span', {class: 'cell'}, '\u00a0'];
            })];
         })],
         ['a', {class: 'safety', href: (CONFIG.baseURL || '') + '/#/projects'}, 'Take me to safety'],
      ]],
   ]],
]);

var setUsername = async function (id, value, generate) {
   var candidates, fallback, number = 0;
   if (generate) {
      var normalize = function (text) {
         text = text.toLowerCase ().replace (/[^a-z0-9]+/g, '-').replace (/^-+|-+$/g, '') || 'user';
         return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test (text) ? text + '-1' : text;
      };
      var parts = value.split ('@');
      fallback = normalize (parts [0] + '-' + parts [1].replace (/\.[^.]+$/, ''));
      candidates = [normalize (parts [0]), fallback];
   }

   while (true) {
      var username = generate
         ? candidates.length ? candidates.shift () : fallback + '-' + (++number)
         : value;

      var result = await redis ('eval', `
         local user = KEYS[1]
         local id, name = ARGV[1], ARGV[2]
         if redis.call('EXISTS', user) == 0 then return -1 end
         local key = 'username:' .. name
         local owner = redis.call('GET', key)
         if owner and owner ~= id
            and redis.call('HGET', 'user:' .. owner, 'username') == name then
            return 0
         end
         local old = redis.call('HGET', user, 'username')
         if old and old ~= name
            and redis.call('GET', 'username:' .. old) == id then
            redis.call('DEL', 'username:' .. old)
         end
         redis.call('SET', key, id)
         redis.call('HSET', user, 'username', name)
         local ttl = redis.call('PTTL', user)
         if ttl >= 0 then redis.call('PEXPIRE', key, ttl) end
         return 1
      `, 1, 'user:' + id, id, username);

      if (! generate || result !== 0) return result;
   }
};

var routes = [

   // *** GATEKEEPER ***

   ['all', '*', async function (rq, rs) {

      if (! CONFIG.cloud) {
         clog ({type: 'Request', rqId: rs.log.id, method: rq.method, url: rq.url, ip: rs.log.origin});
         rq.user = {id: 'local', creator: true};
         return rs.next ();
      }

      var sessionId = rq.data.cookie && rq.data.cookie [CONFIG.cookie?.name] ? rq.data.cookie [CONFIG.cookie?.name] : undefined;

      if (sessionId) {
         var session = await redis ('hgetall', 'session:' + sessionId);

         if (session && new Date (session.expires).getTime () > new Date ().getTime ()) {

            var user = await redis ('hgetall', 'user:' + session.user);

            if (! user) return reply (rs, 500, {priority: 'critical', type: 'User not found', user: session.user});

            rq.user = {csrf: session.csrf, session: sessionId, ... user};
         }
      }

      clog ({type: 'Request', rqId: rs.log.id, method: rq.method, url: rq.url, ip: rs.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});

      if (rq.headers ['x-test'] === '1') {
         if (CONFIG.baseURL !== 'http://localhost:5353') return reply (rs, 403, {error: 'Not a local request'});
         rq.test = true;
      }

      // Project read routes are public; requests without a session are checked against PUBLIC grants.
      var publicPath = dale.stop ([
         ['get', '/'],
         ['get', /^\/assets\/.+/],
         ['get', '/client.js'],
         ['get', '/favicon.svg'],
         ['get', /^\/icon\/icon-(?:180|192|512)\.png$/],
         ['get', '/manifest.json'],
         ['post', '/error'],
         ['post', '/auth/login'],
         ['get', /^\/auth\/verify\//],
         ['get', '/projects'],
         ['get', /^\/p\//],
         ['get', /^\/project\/[^/]+(?:\/files|\/file\/.+)?$/],
         ['put', '/project/message'],
      ], true, function (endpoint) {
         if (type (endpoint [1]) === 'string') endpoint [1] = new RegExp ('^' + cicek.escape (endpoint [1]) + '$');
         return rq.method === endpoint [0] && !! rq.url.match (endpoint [1]);
      });

      if (! rq.user && ! publicPath) {
         if (sessionId) return reply (rs, 403, {error: 'Invalid session'}, {'set-cookie': cicek.cookie.write (CONFIG.cookie?.name, false, {
            httponly: true,
            path: '/',
            samesite: 'Lax',
         })});
         else           return reply (rs, 403, {error: 'No session'});
      }

      if (rq.user && ! publicPath && inc (['post', 'put', 'delete'], rq.method) && rq.headers ['x-csrf'] !== session.csrf) return reply (rs, 403, {error: 'Invalid csrf token'});

      rs.next ();

      if (rq.user && ! (rq.method === 'post' && rq.url === '/auth/logout')) await redis ([
         ['hmset', 'session:' + sessionId, {
            expires: new Date (Date.now () + CONFIG.cookie?.expires * 1000).toISOString (),
            last: JSON.stringify ({
               date: now (),
               ip:   rs.log.origin
            })
         }],
         ['hset', 'user:' + rq.user.id, 'last', now ()],
      ]);

   }],

   // *** STATIC ***

   ['get', '/', reply, lith.g ([
      ['!DOCTYPE HTML'],
      ['html', [
         ['head', [
            ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
            ['meta', {charset: 'utf-8'}],
            CONFIG.baseURL?.match (/\/app\/?$/) ? ['base', {href: '/app/'}] : '',
            ['title', 'vibey'],
            ['link', {rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg'}],
            ['link', {rel: 'manifest', href: 'manifest.json'}],
            ['link', {rel: 'apple-touch-icon', href: 'icon/icon-180.png'}],
            ['meta', {name: 'theme-color', content: '#1a1a2e'}],
            ['link', {rel: 'stylesheet', href: 'assets/bootstrap-icons/font/bootstrap-icons.min.css'}],
            ['link', {rel: 'stylesheet', href: 'assets/codemirror/lib/codemirror.css'}],
            ['link', {rel: 'stylesheet', href: 'assets/normalize.css/normalize.css'}],
            ['link', {rel: 'stylesheet', href: 'assets/tachyons/css/tachyons.min.css'}],
         ]],
         ['body', [
            ['script', {src: 'assets/codemirror/lib/codemirror.js'}],
            ['script', {src: 'assets/codemirror/addon/search/searchcursor.js'}],
            ['script', {src: 'assets/codemirror/keymap/vim.js'}],
            ['script', {src: 'assets/codemirror/mode/markdown/markdown.js'}],
            ['script', {src: 'assets/codemirror/mode/javascript/javascript.js'}],
            ['script', {src: 'assets/codemirror/mode/python/python.js'}],
            ['script', {src: 'assets/gotob/gotoB.min.js'}],
            ['script', {src: 'assets/marked/lib/marked.umd.js'}],
            ['script', 'var models = ' + JSON.stringify (models)],
            ['script', {src: 'cell.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],

   ['get', '/assets/*', function (rq, rs) {
      if (/\.\./.test (rq.url)) return reply (rs, 400, 'No dots (..) allowed');
      cicek.file (rq, rs, rq.url.replace (/^\/assets\//, ''), ['node_modules']);
   }],
   ['get', '/cell.js', cicek.file],
   ['get', '/client.js', cicek.file],
   ['get', '/favicon.svg', function (rq, rs) {
      reply (rs, 200, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 16" width="18" height="16">\
         <rect width="18" height="16" fill="#1a1a2e"/>\
         <path fill="#fff" d="M1 1h2v2H1z M2 3h2v2H2z M3 5h2v2H3z M4 7h2v2H4z M5 9h1v1H5z M5 10h2v1H5z M6 11h2v2H6z M8 9h1v1H8z M7 10h2v1H7z M8 7h2v2H8z M9 5h2v2H9z M10 3h2v2H10z M11 1h2v2H11z"/>\
         <path fill="#c084fc" d="M15 1h2v2h-2z M14 3h2v2h-2z M13 5h2v2h-2z M12 7h2v2h-2z M11 9h2v2h-2z M10 11h2v2h-2z"/>\
      </svg>', {'content-type': 'image/svg+xml'});
   }],
   ['get', /^\/icon\/icon-(?:180|192|512)\.png$/, cicek.file],
   ['get', '/manifest.json', function (rq, rs) {
      reply (rs, 200, JSON.stringify ({
         background_color: '#1a1a2e',
         display: 'standalone',
         icons: [
            {
               sizes: '192x192',
               src: 'icon/icon-192.png',
               type: 'image/png',
            },
            {
               sizes: '512x512',
               src: 'icon/icon-512.png',
               type: 'image/png',
            },
         ],
         id: './',
         name: 'vibey',
         scope: './',
         short_name: 'vibey',
         start_url: './',
         theme_color: '#1a1a2e',
      }), {'content-type': 'application/manifest+json'});
   }],

   // *** ERROR REPORTING ***

   ['post', '/error', function (rq, rs) {
      var error = type (rq.body.error) === 'object' ? rq.body : {error: rq.body};
      clog ({priority: 'important', type: 'client error', ... error});
      reply (rs, 200);
   }],

   // *** AUTH ***

   ['get', '/auth/user', async function (rq, rs) {
      var [user, credentials] = await redis ([
         ['hmget', 'user:' + rq.user.id, 'settings', 'username'],
         ['hget', 'credentials:' + rq.user.id, 'data'],
      ]);
      var settings = JSON.parse (user [0] || '{}');
      var username = user [1] || undefined;
      credentials = JSON.parse (credentials || '{}');
      credentials = dale.obj (credentials, function (types, provider) {
         return [provider, dale.obj (types, function (credential, name) {
            return [name, true];
         })];
      });

      if (! CONFIG.cloud) return reply (rs, 200, {creator: true, credentials, mode: 'local', settings, username});

      reply (rs, 200, {
         admin: rq.user.email === CONFIG.admin ? true : undefined,
         count: parseInt (rq.user.count),
         creator: rq.user.email === CONFIG.admin || !! rq.user.creator,
         credentials,
         csrf: rq.user.csrf,
         email: rq.user.email,
         id: rq.user.id,
         mode: 'cloud',
         settings,
         username,
      });
   }],

   ['put', '/auth/user', async function (rq, rs) {
      if (stop (rs, [
         ['body', rq.body, 'object'],
         function () {return [
            ['keys of body', dale.keys (rq.body), ['settings', 'username'], 'eachOf', teishi.test.equal],
            ['settings', rq.body.settings, ['object', 'undefined'], 'oneOf'],
            ['username', rq.body.username, ['string', 'undefined'], 'oneOf'],
            function () {return rq.body.settings === undefined ? [] : [
               ['keys of settings', dale.keys (rq.body.settings), 'vi', 'eachOf', teishi.test.equal],
               ['settings.vi', rq.body.settings.vi, ['boolean', 'undefined'], 'oneOf'],
            ]}
         ]}
      ])) return;

      if (rq.body.settings === undefined && rq.body.username === undefined) {
         return reply (rs, 400, {error: 'Provide settings or username'});
      }
      if (rq.body.username !== undefined) {
         if (! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test (rq.body.username)
            || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test (rq.body.username)) {
            return reply (rs, 400, {error: 'Invalid username'});
         }
         // Local mode has no signup flow.
         if (! CONFIG.cloud) await redis ('hsetnx', 'user:local', 'id', 'local');
         var result = await setUsername (rq.user.id, rq.body.username);
         if (result === 0) return reply (rs, 409, {error: 'Username already taken'});
      }
      if (rq.body.settings !== undefined) {
         await redis ('hset', 'user:' + rq.user.id, 'settings', JSON.stringify (rq.body.settings));
      }
      reply (rs, 200, {
         settings: rq.body.settings,
         username: rq.body.username,
      });
   }],

   ['post', '/auth/login', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), 'email', 'eachOf', teishi.test.equal],
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         }
      ])) return;

      rq.body.email = rq.body.email.toLowerCase ();

      if (await rateLimit ('login:' + rq.body.email, 5, 300)) return reply (rs, 403, {error: 'Rate limited'});

      var [userId, oldLoginLink] = await redis ([
         ['get', 'email:' + rq.body.email],
         ['get', 'loginLinkR:' + rq.body.email]
      ]);

      var loginLink = crypto.randomBytes (32).toString ('hex');
      var fullLoginLink = CONFIG.baseURL + '/#/verify/' + loginLink;

      if (! userId) {

         userId = crypto.randomUUID ();
         var userCount = await redis ('incr', 'userCount');

         await redis ([
            oldLoginLink ? ['del', 'loginLink:' + oldLoginLink] : [],
            ['set', 'email:' + rq.body.email, userId],
            ['hmset', 'user:' + userId, {
               count: parseInt (userCount),
               created: now (),
               email: rq.body.email,
               id: userId,
            }],
            // Delete the email & user entry if the user doesn't log in in the next five minutes
            ['expire', 'email:' + rq.body.email, 300],
            ['expire', 'user:' + userId, 300],
            ['setex', 'loginLink:' + loginLink, 60 * 5, rq.body.email],
            ['setex', 'loginLinkR:' + rq.body.email, 60 * 5, loginLink]
         ]);
         await setUsername (userId, rq.body.email, true);
      }
      else {
         // For the unlikely case that a new user requests a second link.
         var [ttl, username] = await redis ([
            ['ttl', 'user:' + userId],
            ['hget', 'user:' + userId, 'username'],
            oldLoginLink ? ['del', 'loginLink:' + oldLoginLink] : [],
            ['setex', 'loginLink:' + loginLink, 60 * 5, rq.body.email],
            ['setex', 'loginLinkR:' + rq.body.email, 60 * 5, loginLink]
         ]);
         if (ttl > 0) await redis ([
            ['expire', 'email:' + rq.body.email, 300],
            ['expire', 'user:'  + userId,        300],
            username ? ['expire', 'username:' + username, 300] : [],
         ]);
      }

      if (! CONFIG.email?.enable) clog ({type: 'New login link', email: rq.body.email, fullLoginLink});

      await sendmail ({
         to: rq.body.email,
         subject: 'Log in to Vibey',
         message: [
            ['p', {style: 'text-align: center; margin: 24px 0;'}, ['a', {href: fullLoginLink, style: 'background-color: #007bff; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;'}, 'Click here to enter Vibey']],
            ['p', 'Or copy and paste this link into your browser:'],
            ['p', {style: 'word-break: break-all; font-size: 14px; color: #555555;'}, fullLoginLink],
            ['p', 'This link expires in 5 minutes.']
         ]
      });

      if (rq.test) return reply (rs, 200, {loginLink});

      reply (rs, 200);
   }],

   ['get', '/auth/verify/:loginLink', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      var loginLink = rq.data.params.loginLink;
      var email = await redis ('get', 'loginLink:' + loginLink);
      if (! email) return reply (rs, 403, {error: 'Invalid login link', loginLink});

      var userId = await redis ('get', 'email:' + email);
      if (! userId) return reply (rs, 403, {error: 'No user bound to the email'});

      var [user, credentials] = await redis ([
         ['hgetall', 'user:' + userId],
         ['hget', 'credentials:' + userId, 'data'],
      ]);

      var csrf      = crypto.randomBytes (32).toString ('hex');
      var sessionId = crypto.randomBytes (32).toString ('hex');

      await redis ([
         ['hmset',  'session:' + sessionId, {
            csrf,
            expires: new Date (Date.now () + CONFIG.cookie?.expires * 1000).toISOString (),
            last: JSON.stringify ({
               date: now (),
               ip:   rs.log.origin
            }),
            user: userId
         }],
         ['sadd', 'owner:' + userId, 'session:' + sessionId],
         ['del', 'loginLink:' + loginLink, 'loginLinkR:' + email, 'rateLimit:login:' + user.email],
         // Remove the TTL for email & user entries in case this is the first successful verify for this user
         ['persist', 'user:' + userId],
         ['persist', 'email:' + user.email],
         user.username ? ['persist', 'username:' + user.username] : [],
         ... await (async function () {
            var projects = await redis ('smembers', 'accessTo:' + email);
            return dale.go (projects, function (member) {
               var [verb, id, ... prefix] = member.split (':');
               var suffix = prefix.length ? ':' + prefix.join (':') : '';
               return [
                  ['srem', 'accessBy:' + id, verb + ':' + email + suffix],
                  ['sadd', 'accessBy:' + id, verb + ':' + userId + suffix],
                  ['sadd', 'accessTo:' + userId, member],
                  ['srem', 'accessTo:' + email, member]
               ];
            }).flat ();
         }) (),
      ]);

      credentials = dale.obj (JSON.parse (credentials || '{}'), function (types, provider) {
         return [provider, dale.obj (types, function (credential, name) {
            return [name, true];
         })];
      });

      reply (rs, 200, {
         admin: user.email === CONFIG.admin ? true : undefined,
         count: parseInt (user.count),
         creator: user.email === CONFIG.admin || !! user.creator,
         credentials,
         csrf,
         email: user.email,
         id: userId,
         mode: 'cloud',
         settings: JSON.parse (user.settings || '{}'),
         username: user.username,
      }, {'set-cookie': cicek.cookie.write (CONFIG.cookie?.name, sessionId, {
         expires: new Date (Date.now () + 1000 * 60 * 60 * 24 * 365 * 10),
         httponly: true,
         path: '/',
         samesite: 'Lax',
         secure: CONFIG.baseURL?.match ('localhost') ? undefined : true,
      })});
   }],

   ['get', '/auth/list', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      reply (rs, 200, dale.go (await getForUser (rq.user.id, 'session'), function (session) {
         return {
            expired: new Date (session.expires).getTime () < new Date ().getTime (),
            last: JSON.parse (session.last)
         };
      }))
   }],

   ['post', '/auth/logout', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      await redis ([
         ['del', 'session:' + rq.user.session],
         ['srem', 'owner:' + rq.user.id, 'session:' + rq.user.session]
      ]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (CONFIG.cookie?.name, false, {
         httponly: true,
         path: '/',
         samesite: 'Lax',
         secure: CONFIG.baseURL?.match ('localhost') ? undefined : true,
      })});
   }],

   ['post', '/auth/delete', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      var [user, keys] = await redis ([
         ['hgetall',  'user:'  + rq.user.id],
         ['smembers', 'owner:' + rq.user.id]
      ]);

      await dale.async (keys, async function (key) {
         if (! key.match (/^project:/)) return;
         var projectId = key.replace ('project:', '');
         var containerId = 'vibey-project-' + projectId;

         await run ('docker', 'stop', containerId);
         await run ('docker', 'rm', containerId);
         await run ('docker', 'volume', 'rm', containerId);
      }, {concurrent: 5})

      await redis ([
         ['del', 'user:' + rq.user.id, 'email:' + rq.user.email, 'owner:' + rq.user.id, ... keys],
         ... await (async function () {
            var projects = dale.fil (keys, undefined, function (key) {
               if (key.match (/^project:/)) return key.replace ('project:', '');
            });
            var commands = await dale.async (projects, projectAccessCleanup);
            return commands.flat ();
         }) (),
         ... await (async function () {
            var commands = await dale.async ([rq.user.id, rq.user.email], async function (who) {
               var members = await redis ('smembers', 'accessTo:' + who);
               return [
                  ... dale.go (members, function (member) {
                     var [verb, id, ... prefix] = member.split (':');
                     var suffix = prefix.length ? ':' + prefix.join (':') : '';
                     return ['srem', 'accessBy:' + id, verb + ':' + who + suffix];
                  }),
                  ['del', 'accessTo:' + who]
               ];
            });
            return commands.flat ();
         }) ()
      ]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (CONFIG.cookie?.name, false, {
         httponly: true,
         path: '/',
         samesite: 'Lax',
      })});
   }],

   // *** PROJECT ***

   ['post', '/creator/request', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      if (stop (rs, ['body', rq.body, {}, teishi.test.equal])) return;

      if (rq.user.creator) return reply (rs, 409, {error: 'Already a creator'});

      await sendmail ({
         to: CONFIG.admin,
         subject: 'Vibey creator request',
         message: ['p', [
            'New creator request from: ' + rq.user.email,
            ['br'],
            now ()
         ]]
      });

      reply (rs, 200);
   }],

   ['post', '/creator/grant', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['email', 'grant'], 'eachOf', teishi.test.equal],
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         },
         ['grant', rq.body.grant, 'boolean'],
      ])) return;

      rq.body.email = rq.body.email.toLowerCase ();

      if (rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      var userId = await redis ('get', 'email:' + rq.body.email);

      if (userId) await redis ([rq.body.grant ? ['hset', 'user:' + userId, 'creator', 1] : ['hdel', 'user:' + userId, 'creator']]);

      else {
         if (rq.body.grant === false) return reply (rs, 404);

         var userId    = crypto.randomUUID ();
         var userCount = await redis ('incr', 'userCount');

         await redis ([
            ['set', 'email:' + rq.body.email, userId],
            ['hmset', 'user:' + userId, {
               count: userCount,
               created: now (),
               creator: 1,
               email: rq.body.email,
               id: userId,
            }],
         ]);
         await setUsername (userId, rq.body.email, true);
      }

      reply (rs, 200);
   }],

   ['get', '/projects', async function (rq, rs) {
      var userId = rq.user ? rq.user.id : 'PUBLIC';
      var projects = rq.user ? await getForUser (userId, 'project') : [];
      var listed = dale.obj (projects, function (project) {
         return [project.id, true];
      });
      projects = projects.concat (dale.fil (await getForUser ('PUBLIC', 'project'), undefined, function (project) {
         if (! listed [project.id]) return {...project, public: true};
      }));

      var usernames = projects.length ? await redis (dale.go (projects, function (project) {
         return ['hget', 'user:' + project.owner, 'username'];
      })) : [];
      dale.go (projects, function (project, k) {
         project.ownerUsername = usernames [k] || undefined;
      });

      reply (rs, 200, dale.go (projects.sort (function (a, b) {
         return new Date (b.last) - new Date (a.last);
      }), function (project) {
         return {
            ...project,
            // Slots belong to the owner's wheel.
            slot: project.slot && project.owner === userId ? parseInt (project.slot) : undefined
         }
      }));
   }],

   ['post', '/project', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['name', 'slot'], 'eachOf', teishi.test.equal],
         ['name', rq.body.name, 'string'],
         ['slot', rq.body.slot, [1, 2, 3, 4, 5, undefined], 'oneOf', teishi.test.equal],
         function () {
            return ['length of name', rq.body.name.length, {min: 2}, teishi.test.range];
         }
      ])) return;

      if (! validProjectName (rq.body.name)) return reply (rs, 400, {error: 'Project names cannot be a UUID, contain / or ?, have two spaces in a row, or have a space next to a dash'});

      if (! rq.user.creator && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Please request creator access'});

      var projects = await getForUser (rq.user.id, 'project');
      var conflict = dale.stopNot (projects, undefined, function (project) {
         if (project.name === rq.body.name) return project;
      });
      if (conflict) return reply (rs, 409, {error: 'There is already a project with that name'});

      var project = {
         created: now (),
         id:      crypto.randomUUID (),
         last:    now (),
         name:    rq.body.name,
         owner:   rq.user.id,
      }
      if (rq.body.slot) project.slot = rq.body.slot;

      var slotConflict = ! rq.body.slot ? undefined : dale.stopNot (projects, undefined, function (project) {
         if (project.owner !== rq.user.id) return;
         if (parseInt (project.slot) === rq.body.slot) return project;
      });

      var ops = [
         ['hmset', 'project:' + project.id, project],
         ['sadd',  'owner:' + rq.user.id, 'project:' + project.id]
      ];
      if (slotConflict) ops.push (['hdel', 'project:' + slotConflict.id, 'slot']);

      await redis (ops);

      var containerId = 'vibey-project-' + project.id;

      await run ('docker', 'run', '--network', 'vibey-projects', '-v', containerId + ':/project', '--name', containerId, '-d', 'vibey-project');

      await docker.run (project.id, 'git config --global init.defaultBranch main && git -C /project init && git -C /project config user.name vibey && git -C /project config user.email vibey@local', {catch: true});

      await docker.write (project.id, 'main.md', '# ' + rq.body.name + '\n\n');

      reply (rs, 200, {id: project.id});
   }],

   ['put', '/project', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'name', 'slot'], 'eachOf', teishi.test.equal],
         ['id', rq.body.id, 'string'],
         ['name', rq.body.name, 'string'],
         ['slot', rq.body.slot, [1, 2, 3, 4, 5, undefined], 'oneOf', teishi.test.equal],
         function () {
            return ['name', rq.body.name.length, {min: 2}, teishi.test.range];
         }
      ])) return;

      if (! validProjectName (rq.body.name)) return reply (rs, 400, {error: 'Project names cannot be a UUID, contain / or ?, have two spaces in a row, or have a space next to a dash'});

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return project;
      });
      if (! match || match.owner !== rq.user.id) return reply (rs, 404);
      var conflict = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return;
         if (project.name === rq.body.name) return project;
      });
      if (conflict) return reply (rs, 409, {error: 'There is already a project with that name'});

      var slotConflict = dale.stopNot (projects, undefined, function (project) {
         if (project.owner !== rq.user.id) return;
         if (project.id === rq.body.id) return;
         if (parseInt (project.slot) === rq.body.slot) return project;
      });

      var ops = [['hmset', 'project:' + match.id, {
         last: now (),
         name: rq.body.name
      }]];

      if (rq.body.slot !== undefined || match.slot !== undefined) ops.push (rq.body.slot === undefined ? ['hdel', 'project:' + match.id, 'slot'] : ['hset', 'project:' + match.id, 'slot', rq.body.slot]);

      if (slotConflict) ops.push (['hdel', 'project:' + slotConflict.id, 'slot']);

      await redis (ops);

      reply (rs, 200);
   }],

   ['post', ['/project/write', '/project/edit', '/project/run', '/project/message'], async function (rq, rs) {

      if (rq.url === '/project/write' && rq.data.fields) rq.body = rq.data.fields;

      if (stop (rs, ['id', rq.body.id, 'string'])) return;

      rs.next ();
   }],

   // /p/<username or user id>/<encoded project name or project id>[/<path>] resolves the user and project (which exist or not regardless of access), then rewrites the URL to /project/<id> or /project/<id>/file/<path>, whose routes below check access.
   ['get', /^\/p\/([^/]+)\/([^/]+)(?:\/(.+))?$/, async function (rq, rs) {
      var user = rq.data.params [0], project = rq.data.params [1], path = rq.data.params [2];
      var uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

      var userId = user;
      if (! uuid.test (user)) {
         userId = await redis ('get', 'username:' + user);
         // The username key can outlive a rename; the user hash has the current one.
         if (! userId || await redis ('hget', 'user:' + userId, 'username') !== user) return path === undefined ? reply (rs, 404) : reply (rs, 404, fourohfour, 'html');
      }

      var projectId;
      if (uuid.test (project)) {
         if (await redis ('hget', 'project:' + project, 'owner') === userId) projectId = project;
      }
      else {
         var name = project.replace (/--?/g, function (dashes) {
            return dashes === '--' ? '-' : ' ';
         });
         var keys = dale.fil (await redis ('smembers', 'owner:' + userId), undefined, function (key) {
            if (/^project:/.test (key)) return key;
         });
         var names = keys.length ? await redis (dale.go (keys, function (key) {
            return ['hget', key, 'name'];
         })) : [];
         projectId = dale.stopNot (names, undefined, function (candidate, index) {
            if (candidate === name) return keys [index].replace (/^project:/, '');
         });
      }
      if (! projectId) return path === undefined ? reply (rs, 404) : reply (rs, 404, fourohfour, 'html');

      rq.url = '/project/' + projectId + (path === undefined ? '' : '/file/' + path);
      rs.next ();
   }],

   ['get', '/project/:id', async function (rq, rs) {
      var id = rq.data.params.id;
      var userId = rq.user ? rq.user.id : 'PUBLIC';
      var [owner, grants] = await redis ([
         ['hget', 'project:' + id, 'owner'],
         ['sunion', 'accessTo:' + userId, 'accessTo:PUBLIC']
      ]);
      if (! owner) return reply (rs, 404);
      // Any read or write grant on the project counts, whatever its path scope.
      if (owner !== userId && ! dale.stop (grants, true, function (grant) {
         var [verb, projectId] = grant.split (':');
         return projectId === id && (verb === 'read' || verb === 'write');
      })) return reply (rs, 404);
      reply (rs, 200, {id: id});
   }],

   ['get', '/project/:id/files', async function (rq, rs) {
      var id = rq.data.params.id;
      var userId = rq.user ? rq.user.id : 'PUBLIC';
      var [owner, grants] = await redis ([
         ['hget', 'project:' + id, 'owner'],
         ['sunion', 'accessTo:' + userId, 'accessTo:PUBLIC']
      ]);
      if (! owner) return reply (rs, 404);

      // Load permissions once, rather than querying Redis for every file.
      var scopes = owner === userId ? [''] : dale.fil (grants, undefined, function (grant) {
         var [verb, projectId, ... parts] = grant.split (':');
         if (projectId === id && (verb === 'read' || verb === 'write')) return parts.join (':');
      });
      if (! scopes.length) return reply (rs, 404);

      var result = await docker.run (id, "find /project -type f -not -path '/project/.git/*' -printf '%s %T@ %P\\0'", {catch: true});
      if (result.code) return reply (rs, 500, {error: 'Could not list files'});

      var files = dale.fil ((result.stdout || '').toString ().split ('\0'), undefined, function (line) {
         if (! line) return;
         var first = line.indexOf (' ');
         var second = line.indexOf (' ', first + 1);
         var name = line.slice (second + 1);
         if (! validProjectPath (name)) return;
         if (! rq.user && name === 'vibey/access.md') return;
         if (! dale.stop (scopes, true, function (scope) {
            return name.startsWith (scope);
         })) return;

         return {
            name,
            size: parseInt (line.slice (0, first)),
            mtime: Math.round (parseFloat (line.slice (first + 1, second)) * 1000)
         };
      });
      files.sort (function (a, b) {
         return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return reply (rs, 200, files);
   }],

   ['get', /^\/project\/([^/]+)\/file\/(.+)$/, async function (rq, rs) {
      var id = rq.data.params [0], path = rq.data.params [1];
      if (! validProjectPath (path)) {
         return reply (rs, 400, {error: 'Invalid path'});
      }
      if (! await allowOp (rq.user ? rq.user.id : 'PUBLIC', id, 'read', path)) return reply (rs, 404, fourohfour, 'html');

      if (/\.mp4$/i.test (path)) return docker.video (rq, rs, id, '/project/' + path);

      var file = await docker.read (id, '/project/' + path);
      if (file.code) {
         if (file.code === 1 && file.error && file.error.match ('No such file or directory')) return reply (rs, 404, fourohfour, 'html');
         clog ({priority: 'important', type: 'Read file error', error: formatError (file)});
         return reply (rs, 500);
      }

      var buffer = file.stdout || Buffer.alloc (0);
      var headers = {
         'content-type': mime.lookup (path) || 'application/octet-stream',
         'cache-control': 'private, no-cache',
         'x-content-type-options': 'nosniff',
         'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
      };
      var cached = cicek.cache (rq.method, buffer, rq.headers, headers, 200);
      if (! cached) headers ['content-length'] = buffer.length;

      rs.log.code = cached ? 304 : 200;
      rs.log.responseBody = cached ? 0 : buffer.length;
      rs.log.responseHeaders = headers;
      rs.writeHead (rs.log.code, headers);
      rs.end (cached ? undefined : buffer);
      return cicek.apres (rs);
   }],

   ['post', '/project/write', async function (rq, rs) {

      var multipart = !! rq.data.files;

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), multipart ? ['id', 'path'] : ['id', 'path', 'content'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
      ])) return;

      if (stop (rs, multipart ? [
         ['keys of files', dale.keys (rq.data.files), ['file'], teishi.test.equal],
         ['file', rq.data.files.file, 'string'],
      ] : [
         ['content', rq.body.content, 'string'],
      ])) return;

      if (! await allowOp (rq.user.id, rq.body.id, 'write', rq.body.path)) return reply (rs, 404);

      var content = multipart
         ? await fs.promises.readFile (rq.data.files.file)
         : rq.body.content;

      var result = await docker.write (rq.body.id, rq.body.path, content);
      if (result.code === 0) delete result.code;

      if (! result.code) redis ('hset', 'project:' + rq.body.id, 'last', now ());
      reply (rs, result.code ? 400 : 200, result);
   }],

   ['post', '/project/edit', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path', 'oldText', 'newText'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['oldText', rq.body.oldText, 'string'],
         ['newText', rq.body.newText, 'string'],
      ])) return;

      if (! await allowOp (rq.user.id, rq.body.id, 'write', rq.body.path)) return reply (rs, 404);

      var result = await docker.edit (rq.body.id, rq.body.path, rq.body.oldText, rq.body.newText);
      if (result.code === 0) delete result.code;

      if (! result.code) redis ('hset', 'project:' + rq.body.id, 'last', now ());
      return reply (rs, result.code ? 400 : 200, result);
   }],

   ['post', '/project/run', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'command', 'read'], 'eachOf', teishi.test.equal],
         ['command', rq.body.command, 'string'],
         ['read', rq.body.read, ['boolean', 'undefined'], 'oneOf']
      ])) return;

      // The client's read flag is not an authorization boundary.
      if (! await allowOp (rq.user.id, rq.body.id, 'write')) return reply (rs, 404);

      var result = rq.body.command.trim () === 'vibey access'
         ? await docker.access (rq.body.id)
         : await docker.run (rq.body.id, rq.body.command, {catch: true, commit: 'Run ' + Path.quote (rq.body.command)});
      if (result.code === 0) delete result.code;

      if (! rq.body.read) redis ('hset', 'project:' + rq.body.id, 'last', now ());
      reply (rs, 200, result);
   }],

   ['put', '/project/message', async function (rq, rs) {
      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['file', 'messageId', 'projectId'], 'eachOf', teishi.test.equal],
         ['file', rq.body.file, 'string'],
         ['messageId', rq.body.messageId, 'string'],
         ['projectId', rq.body.projectId, 'string'],
         ['messageId', rq.body.messageId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, teishi.test.match],
      ])) return;

      if (! await allowOp (rq.user ? rq.user.id : 'PUBLIC', rq.body.projectId, 'read', rq.body.file)) return reply (rs, 404);

      var result = await docker.read (rq.body.projectId, rq.body.file);
      if (result.code) {
         if (result.code === 1 && result.error && result.error.match ('No such file or directory')) return reply (rs, 404);
         clog ({
            error: formatError (result),
            priority: 'important',
            type: 'Read message error',
         });
         return reply (rs, 500);
      }
      var text = (result.stdout || Buffer.alloc (0)).toString ('utf8');
      var head = text.match (new RegExp ('^əəə head ' + rq.body.messageId + '\\n', 'im'));
      if (! head) return reply (rs, 404);
      var rest = text.slice (head.index + head [0].length);
      var nextHead = rest.match (/^əəə head [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n/im);
      var message = head [0] + (nextHead ? rest.slice (0, nextHead.index).replace (/\n$/, '') : rest);
      if (! message.match (new RegExp ('^əəə body ' + rq.body.messageId + '\\n', 'im'))) return reply (rs, 404);
      var next = [], heads = /^əəə head ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n/gim, match;
      while ((match = heads.exec (rest))) next.push (match [1]);
      reply (rs, 200, {message: message, next: next});
   }],

   ['post', '/project/message', async function (rq, rs) {
      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['base64', 'body', 'file', 'id', 'name', 'to'], 'eachOf', teishi.test.equal],
         ['base64', rq.body.base64, ['boolean', 'undefined'], 'oneOf'],
         ['file', rq.body.file, 'string'],
         ['id', rq.body.id, 'string'],
         ['body', rq.body.body, 'string'],
         ['body without marker lines', rq.body.body, /^(?![\s\S]*(^|\n)əəə (head|body))/, teishi.test.match],
         ['body', rq.body.body, undefined, function () {
            if (! rq.body.base64 || /^[A-Za-z0-9+/]*={0,2}$/.test (rq.body.body)) return true;
            return ['body must be base64 when base64 is set'];
         }],
         ['name', rq.body.name, ['string', 'undefined'], 'oneOf'],
         ['name', rq.body.name, undefined, function () {
            if (rq.body.name === undefined) return true;
            if (! rq.body.base64) return ['name requires base64'];
            if (/^[^/\n]+$/.test (rq.body.name)) return true;
            return ['name must be a file name without slashes or newlines'];
         }],
         ['to', rq.body.to, 'string'],
         ['to', rq.body.to, undefined, function () {
            var aiTargets = dale.go (models, function (m) {return 'ai-' + m.model});
            if (teishi.inc (['all', 'shell'].concat (aiTargets), rq.body.to)) return true;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (rq.body.to)) return true;
            return ['to must be all, shell, ' + aiTargets.join (', ') + ', or a message UUID'];
         }],
         // Files go to people, not to the shell or AI.
         ['to', rq.body.to, undefined, function () {
            if (! rq.body.base64 || rq.body.to === 'all' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (rq.body.to)) return true;
            return ['base64 messages must be sent to all or a message UUID'];
         }],
      ])) return;

      if (! await allowOp (rq.user.id, rq.body.id, 'write', rq.body.file)) return reply (rs, 404);
      if (rq.body.to === 'shell' || rq.body.to.match (/^ai-/)) {
         if (! await allowOp (rq.user.id, rq.body.id, 'write')) return reply (rs, 404);
      }

      var aiModel = dale.stopNot (models, undefined, function (m) {
         if (rq.body.to === 'ai-' + m.model) return m;
      });
      var aiFlavor = aiModel ? aiModel.provider : undefined;
      var credentials = aiModel
         ? JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}')
         : {};
      var creds = credentials [aiFlavor] || {};
      var auth = aiModel && (aiModel.requireAPIKey
         ? (creds.apiKey ? 'apiKey' : undefined)
         : creds.account ? 'account' : creds.apiKey ? 'apiKey' : undefined);

      if (auth === 'account' && Date.now () >= creds.account.expires) {
         var refreshBody = {
            client_id: aiFlavor === 'anthropic' ? Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString () : 'app_EMoamEEZ73f0CkXaXp7hrann',
            grant_type: 'refresh_token',
            refresh_token: creds.account.refresh,
         };
         try {
            var tokenData = await new Promise (function (resolve, reject) {
               hitit.one ({}, {
                  https:   true,
                  host:    aiFlavor === 'anthropic' ? 'console.anthropic.com' : 'auth.openai.com',
                  path:    aiFlavor === 'anthropic' ? '/v1/oauth/token' : '/oauth/token',
                  method:  'post',
                  headers: aiFlavor === 'anthropic' ? {} : {'content-type': 'application/x-www-form-urlencoded'},
                  body:    aiFlavor === 'anthropic' ? refreshBody : new URLSearchParams (refreshBody).toString (),
                  code:    200,
               }, function (error, rdata) {
                  if (error) return reject (error);
                  resolve (rdata.body);
               });
            });
         }
         catch (error) {
            return reply (rs, 400, {error: aiFlavor + ' account token refresh failed, please reconnect: ' + JSON.stringify (error.body || error.error)});
         }
         creds.account.access = tokenData.access_token;
         creds.account.expires = Date.now () + tokenData.expires_in * 1000 - 5 * 60 * 1000;
         if (tokenData.refresh_token) creds.account.refresh = tokenData.refresh_token;
         if (tokenData.id_token) creds.account.idToken = tokenData.id_token;
         await redis ('hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials));
      }

      if (aiModel && ! auth) return reply (rs, 400, {
         error: aiModel.model + ' requires ' + aiFlavor + (aiModel.requireAPIKey ? ' API key credentials' : ' account or API key credentials'),
      });

      var id = crypto.randomUUID ();

      var message = dale.fil ([
         'əəə head ' + id,
         rq.body.base64 ? 'base64 1' : undefined,
         'from ' + rq.user.id,
         'id ' + id,
         rq.body.name !== undefined ? 'name ' + rq.body.name : undefined,
         't ' + now (),
         'to ' + rq.body.to,
         'əəə body ' + id,
         rq.body.body,
      ], undefined, function (line) {return line}).join ('\n');

      var result = await docker.run (rq.body.id, 'mkdir -p ' + Path.quote (Path.dirname (rq.body.file)) + ' && touch ' + Path.quote (rq.body.file), {catch: true});
      if (result.code) return reply (rs, 400, {code: result.code, error: result.stderr});

      result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + message);
      if (result.code) return reply (rs, 400, result);

      redis ('hset', 'project:' + rq.body.id, 'last', now ());

      if (rq.body.to !== 'shell' && ! rq.body.to.match (/^ai-/)) return reply (rs, 200, {id: id});

      var responseId = crypto.randomUUID ();
      var tStart = now ();

      var responseMessage = [
         'əəə head ' + responseId,
         'from ' + rq.body.to,
         'id ' + responseId,
         'pending 1',
         't-start ' + tStart,
         ...(aiModel ? ['credential ' + auth] : []),
         'to ' + id,
         'əəə body ' + responseId,
         '',
      ].join ('\n');

      var output = '', oldBody = 'əəə body ' + responseId + '\n', usage;
      var editQueue = Promise.resolve (), editError;
      var cancelled = false;
      var processFile = function (messageId) {
         return '/tmp/vibey-process-' + messageId;
      };
      var groupedCommand = function (command) {
         return 'setsid --wait sh -c ' + Path.quote (
            'echo $$ > ' + Path.quote (processFile (responseId))
            + '; exec sh -c ' + Path.quote (command)
         );
      };

      var watchCancellation = function (proc, executionProjectId = rq.body.id) {
         var messageId = responseId;
         var pidFile = processFile (messageId);
         var checking = false, ended = false;
         cancelled = false;

         var interval = setInterval (async function () {
            if (checking || ended || cancelled) return;
            checking = true;
            try {
               var chat = await docker.read (rq.body.id, rq.body.file);
               if (ended || chat.code) return;
               if (! new RegExp (
                  '^əəə head ' + messageId + '\n(?:(?!əəə (?:head|body) )[^\n]*\n)*cancelled .+$', 'im'
               ).test (chat.stdout.toString ('utf8'))) return;
               cancelled = true;
               var result = await docker.run (executionProjectId, 'bash -c ' + Path.quote (
                  'read -r pid < ' + Path.quote (pidFile)
                  + ' && kill -KILL -- "-$pid"'
               ), {catch: true});
               if (result.code) {
                  cancelled = false;
                  return;
               }
               clearInterval (interval);
            }
            catch (error) {
               cancelled = false;
               clog ({error: formatError (error), responseId: messageId, type: 'Cancellation check error'});
            }
            finally {
               checking = false;
            }
         }, 100);

         var stop = function () {
            ended = true;
            clearInterval (interval);
         };
         proc.once ('error', stop);
         proc.once ('exit', stop);
         proc.once ('close', async function () {
            try {
               await docker.run (executionProjectId, 'rm -f ' + Path.quote (pidFile));
            }
            catch (error) {
               clog ({error: formatError (error), responseId: messageId, type: 'Process cleanup error'});
            }
         });
      };

      var streamEdit = function () {
         var newBody = 'əəə body ' + responseId + '\n' + output.replace (/^əəə (head|body)/gm, '> əəə $1');
         editQueue = editQueue.then (async function () {
            if (editError) return;
            var result = await docker.edit (rq.body.id, rq.body.file, oldBody, newBody);
            if (result.code) throw result;
            oldBody = newBody;
         }).catch (function (error) {
            editError = error;
            clog ({priority: 'important', type: 'Stream persistence error', error: formatError (error), responseId});
         });
      };

      if (rq.body.to === 'shell') {
         var shellProject = rq.body.id, shellCommand = rq.body.body;
         var projectCall = /^\s*vibey project ([^\s:]+)\s+([\s\S]+)$/.exec (shellCommand);
         if (projectCall) {
            shellProject = projectCall [1];
            shellCommand = projectCall [2];
            if (shellProject !== rq.body.id) {
               var access = await docker.read (shellProject, '/project/vibey/access.md');
               var allowed = ! access.code && access.stdout.toString ('utf8').split (/\r?\n/).some (function (line) {
                  var grant = /^(\S+)\s+write$/.exec (line.trim ());
                  return grant && grant [1] === 'project:' + rq.body.id;
               });
               if (! allowed) return reply (rs, 404);
            }
         }

         result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + responseMessage);
         if (result.code) return reply (rs, 400, result);
         reply (rs, 200, {id: id, responseId: responseId});

         if (shellCommand.trim () === 'vibey access') {
            var accessResult = await docker.access (shellProject);
            output += accessResult.stdout || accessResult.error || 'Could not sync access\n';
            streamEdit ();
         }
         else await docker.run (shellProject, groupedCommand (shellCommand), {catch: true, onSpawn: function (proc) {
            watchCancellation (proc, shellProject);
         }, stdout: function (chunk) {
            output += chunk;
            streamEdit ();
         }, stderr: function (chunk) {
            output += chunk;
            streamEdit ();
         }});
         await editQueue;

         if (cancelled) return;

         var shellHead = [
            'əəə head ' + responseId,
            'from shell',
            'id ' + responseId,
            'pending 1',
            't-start ' + tStart,
         ].join ('\n');

         var shellDone = [
            'əəə head ' + responseId,
            'from shell',
            'id ' + responseId,
            't-end ' + now (),
            't-start ' + tStart,
         ].join ('\n');

         await docker.edit (rq.body.id, rq.body.file, shellHead, shellDone);
         redis ('hset', 'project:' + rq.body.id, 'last', now ());
         return;
      }

      var toolDone;
      for (var turn = 0; ; turn++) {
         var chat = await docker.read (rq.body.id, rq.body.file);
         if (chat.code) throw chat;
         var transcript = chat.stdout.toString ('utf8');
         if (toolDone) transcript = transcript.replace (toolDone [0], toolDone [1]);
         var entries = transcript.split (/^əəə head /im).slice (1);
         var lastMain = undefined, hasSystemPrompt = false;
         dale.go (entries, function (entry, index) {
            var body = entry.match (/^əəə body [0-9a-f-]{36}\n/im);
            if (! body) return;
            var head = entry.slice (0, body.index);
            if (/^from systemPrompt$/m.test (head)) hasSystemPrompt = true;
            if (! /^from main\.md$/m.test (head)) return;
            lastMain = entry.slice (body.index + body [0].length);
            // Remove the separator before the next message, not main.md's own trailing newline.
            if (index < entries.length - 1) lastMain = lastMain.replace (/\n$/, '');
         });

         if (! hasSystemPrompt) {
            var systemId = crypto.randomUUID ();
            var systemMessage = [
               'əəə head ' + systemId,
               'from systemPrompt',
               'id ' + systemId,
               'to all',
               'əəə body ' + systemId,
               systemPrompt.replace (/^əəə (head|body)/gm, '> əəə $1'),
            ].join ('\n');
            result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + systemMessage);
            if (result.code) throw result;
            transcript += '\n' + systemMessage;
         }

         var main = await docker.read (rq.body.id, 'main.md');
         if (main.code && ! (main.code === 1 && /No such file or directory/.test (main.error || ''))) {
            throw main;
         }
         if (! main.code) {
            var mainBody = main.stdout.toString ('utf8').replace (/^əəə (head|body)/gm, '> əəə $1');
            if (mainBody !== lastMain) {
               var mainId = crypto.randomUUID ();
               var mainMessage = [
                  'əəə head ' + mainId,
                  'from main.md',
                  'id ' + mainId,
                  'to all',
                  'əəə body ' + mainId,
                  mainBody,
               ].join ('\n');
               result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + mainMessage);
               if (result.code) throw result;
               transcript += '\n' + mainMessage;
            }
         }

         // Context is saved first; the transcript does not include the new pending response.
         if (turn === 0) {
            result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + responseMessage);
            if (result.code) return reply (rs, 400, result);
            reply (rs, 200, {id: id, responseId: responseId});
         }
         else {
            await startMessage (rq.body.to, responseId);
            await docker.edit (rq.body.id, rq.body.file, toolDone [0], toolDone [1]);
         }

         var buffer = '', aiStderr = '';
         var lastFullText = '';
         var codexProc, codexError, codexItem, codexDone = false;
         var codexSend = function (message) {
            codexProc.stdin.write (JSON.stringify (message) + '\n');
         };
         var codexStop = function (error) {
            if (error) codexError = error;
            codexProc.stdin.end ();
         };

         var processLines = function (lines) {
            var parseChunk = aiFlavor === 'anthropic' ? function (line) {
               var event = JSON.parse (line);
               if (event.type === 'stream_event' && event.event) {
                  var partial = event.event;
                  if (partial.type === 'message_start') lastFullText = '';
                  if (partial.type === 'content_block_delta' && partial.delta.type === 'text_delta') {
                     lastFullText += partial.delta.text;
                     return partial.delta.text;
                  }
               }
               if (event.type === 'result' && event.usage) {
                  usage = {
                     cache: event.usage.cache_read_input_tokens || 0,
                     fresh: event.usage.input_tokens + (event.usage.cache_creation_input_tokens || 0),
                     output: event.usage.output_tokens,
                  };
               }
               if (event.type === 'assistant' && event.message && event.message.content) {
                  var fullText = event.message.content.filter (function (block) {
                     return block.type === 'text';
                  }).map (function (block) {return block.text}).join ('\n');
                  var delta = fullText.slice (lastFullText.length);
                  lastFullText = fullText;
                  return delta || undefined;
               }
               if (event.type === 'result' && event.result) {
                  var delta = event.result.slice (lastFullText.length);
                  lastFullText = event.result;
                  return delta || undefined;
               }
            } : function (line) {
               var event = JSON.parse (line);
               var params = event.params || {};
               if (event.error) return codexStop (event.error.message || JSON.stringify (event.error));
               if (event.method && event.id !== undefined) return codexSend ({
                  id: event.id,
                  error: {code: -32601, message: 'Unsupported client request: ' + event.method},
               });
               if (event.id === 1) {
                  codexSend ({method: 'initialized'});
                  return codexSend ({
                     id: 2, method: 'thread/start',
                     params: {
                        model: aiModel.canonical, cwd: '/project',
                        approvalPolicy: 'never', sandbox: 'danger-full-access', ephemeral: true,
                     },
                  });
               }
               if (event.id === 2) return codexSend ({
                  id: 3, method: 'turn/start',
                  params: {
                     threadId: event.result.thread.id,
                     input: [{type: 'text', text: prompt, text_elements: []}],
                  },
               });
               if (event.method === 'thread/tokenUsage/updated') {
                  var tokens = params.tokenUsage.total;
                  usage = {
                     cache: tokens.cachedInputTokens || 0,
                     fresh: tokens.inputTokens - (tokens.cachedInputTokens || 0),
                     output: tokens.outputTokens,
                  };
               }
               if (event.method === 'turn/completed') {
                  codexDone = true;
                  return codexStop (params.turn.status === 'completed' ? undefined
                     : (params.turn.error && params.turn.error.message) || 'Codex turn ' + params.turn.status);
               }
               if (event.method === 'item/agentMessage/delta' && params.delta) {
                  var separator = codexItem !== params.itemId && output ? '\n\n' : '';
                  codexItem = params.itemId;
                  return separator + params.delta;
               }
            };
            dale.go (lines, function (line) {
               if (! line) return;
               try {
                  var chunk = parseChunk (line);
                  if (! chunk) return;
                  output += chunk;
                  streamEdit ();
               } catch (e) {
                  clog ({priority: 'important', type: 'AI stream parse error', error: formatError (e), responseId});
                  if (aiFlavor === 'openai') codexStop ('Invalid Codex app-server response');
               }
            });
         }

         var prompt = (transcript + '\n').replace (
            /^əəə head ([0-9a-f-]{36})\n[\s\S]*?^əəə body \1\n/gim,
            function (head) {
               return head.replace (/^(pending|t|t-start|t-end|tokens-in|tokens-cache|tokens-out|credential) .*\n/gm, '');
            }
         );

         prompt = prompt.replace (
            /(^əəə head ([0-9a-f-]{36})\n[\s\S]*?^əəə body \2\n)([\s\S]*?)(?=^əəə head [0-9a-f-]{36}\n|(?![\s\S]))/gim,
            function (match, header, id, body) {
               if (/^from (systemPrompt|main\.md)$/m.test (header)) return match;
               // Preserve the separator newline without counting it as body text.
               var separator = body.endsWith ('\n') ? '\n' : '';
               if (separator) body = body.slice (0, -1);
               // File messages are opaque to the model: replace the base64 with its decoded size.
               if (/^base64 1$/m.test (header)) return header + '[BASE64 FILE: ' + (body.length * 3 / 4 - body.match (/=*$/) [0].length) + ' BYTES OMITTED]' + separator;
               if (body.length <= 10000) return match;
               return header + body.slice (0, 5000) + '\n[TRIMMED ' + (body.length - 10000) + ' CHARS]\n' + body.slice (-5000) + separator;
            }
         );

         prompt += '\nCurrent chat file: ' + JSON.stringify (rq.body.file) + '\n';

         var temp = await docker.run (rq.body.id, 'umask 077; mktemp -d /home/vibey/.vibey-ai.XXXXXXXXXX', {catch: true});
         if (temp.code) throw temp;
         var configDir = temp.stdout.trim ();

         try {
            var dockerArgs = ['exec', '-i'];
            var command;

            if (aiFlavor === 'openai') {
               var codexAuth = JSON.stringify (auth === 'apiKey'
                  ? {auth_mode: 'apikey', OPENAI_API_KEY: creds.apiKey}
                  : {
                     auth_mode: 'chatgpt',
                     last_refresh: new Date ().toISOString (),
                     tokens: {
                        access_token: creds.account.access,
                        refresh_token: creds.account.refresh,
                        id_token: creds.account.idToken || '',
                        account_id: creds.account.accountId || '',
                     },
                  });
               var result = await docker.write (rq.body.id, configDir + '/auth.json', codexAuth, 'noCommit');
               if (result.code) throw result;

               dockerArgs.push ('-e', 'CODEX_HOME=' + configDir);
               command = 'exec codex app-server --stdio -c ' + Path.quote ('sandbox_mode="danger-full-access"');
            }

            if (aiFlavor === 'anthropic') {
               if (auth === 'account') {
                  var claudeAuth = JSON.stringify ({claudeAiOauth: {
                     accessToken: creds.account.access,
                     clientId: Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString (),
                     expiresAt: creds.account.expires,
                     refreshToken: creds.account.refresh,
                  }});
                  var result = await docker.write (rq.body.id, configDir + '/.credentials.json', claudeAuth, 'noCommit');
                  if (result.code) throw result;
               }

               var credentialPath = configDir + '/credential';
               var result = await docker.write (
                  rq.body.id, credentialPath,
                  auth === 'apiKey' ? creds.apiKey : creds.account.access,
                  'noCommit'
               );
               if (result.code) throw result;

               dockerArgs.push ('-e', 'CLAUDE_CONFIG_DIR=' + configDir);
               command = 'unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN;'
                  + ' credential=$(cat ' + Path.quote (credentialPath) + ') || exit 1;'
                  + ' export ' + (auth === 'apiKey' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN') + '="$credential";'
                  + ' unset credential;'
                  + ' exec claude -p --model ' + Path.quote (aiModel.canonical)
                  + ' --output-format stream-json --include-partial-messages --verbose --dangerously-skip-permissions';
            }

            dockerArgs.push ('vibey-project-' + rq.body.id, 'sh', '-c', groupedCommand (command));

            var aiResult = await run ('docker', ... dockerArgs, {
               catch: true,
               input: aiFlavor === 'openai' ? undefined : prompt,
               onSpawn: function (proc) {
                  watchCancellation (proc);
                  if (aiFlavor !== 'openai') return;
                  codexProc = proc;
                  proc.stdin.on ('error', function (error) {
                     codexError = 'Codex stdin error: ' + error.message;
                  });
                  codexSend ({
                     id: 1, method: 'initialize',
                     params: {
                        clientInfo: {name: 'vibey', version: '1.0.0'},
                        capabilities: null,
                     },
                  });
               },
               stderr: function (chunk) {
                  aiStderr += chunk;
               },
               stdout: function (chunk) {
                  buffer += chunk;
                  var lines = buffer.split ('\n');
                  buffer = lines.pop ();
                  processLines (lines);
               },
            });
         }
         finally {
            try {
               var cleanup = await docker.run (rq.body.id, 'rm -rf -- ' + Path.quote (configDir), {catch: true});
               if (cleanup.code) throw cleanup;
            }
            catch (error) {
               clog ({priority: 'important', type: 'AI credentials cleanup error', error: formatError (error), responseId});
            }
         }

         if (buffer) processLines ([buffer]);

         if (cancelled) {
            await editQueue;
            return;
         }

         if (aiFlavor === 'openai' && ! aiResult.code && ! aiResult.signal && (codexError || ! codexDone)) {
            codexError = codexError || 'Codex exited before completing the turn';
            aiResult.code = 1;
         }

         if (aiResult.code === -1) {
            output += (output ? '\n\n' : '') + 'AI process failed to start: ' + aiResult.error;
            streamEdit ();
         }
         else if (aiResult.code || aiResult.signal) {
            var error = codexError || (aiResult.signal ? 'AI process terminated by signal ' + aiResult.signal : 'AI process exited with code ' + aiResult.code);
            output += (output ? '\n\n' : '') + error;
            streamEdit ();
         }

         await editQueue;

         var oldHead = [
            'əəə head ' + responseId,
            'from ' + rq.body.to,
            'id ' + responseId,
            'pending 1',
            't-start ' + tStart,
         ].join ('\n');

         var newHead = [
            'əəə head ' + responseId,
            'from ' + rq.body.to,
            'id ' + responseId,
            't-end ' + now (),
            't-start ' + tStart,
         ].concat (usage ? [
            'tokens-in ' + usage.fresh,
            'tokens-cache ' + usage.cache,
            'tokens-out ' + usage.output,
         ] : []).join ('\n');

         var parseToolCall = function (text) {
            var start = /^tool-call:.*$/m.exec (text);
            if (! start) return;

            var lines = text.slice (start.index).split ('\n');
            var op = /^tool-call: (read|write|edit|run)(?: ([^\s:]+))?$/.exec (lines [0]);
            if (! op) return {error: 'Expected tool-call: read|write|edit|run [projectId]'};
            var projectId = op [2] || rq.body.id;
            op = op [1];

            var description = lines [1];
            if (! description || ! description.trim ()) return {error: 'Expected a description on line 2'};

            var key = op === 'run' ? 'command' : 'path';
            var prefix = key + ': ';
            if (! lines [2] || ! lines [2].startsWith (prefix)) {
               return {error: 'Expected ' + prefix + '... on line 3'};
            }
            var value = lines [2].slice (prefix.length);
            if (! value.trim ()) return {error: key + ' must not be empty'};

            var call = {op: op, description: description, projectId: projectId};
            call [key] = value;
            if (op === 'read' || op === 'run') return call;

            if (op === 'write') {
               if (lines.length < 4) return {error: 'Expected file content starting on line 4'};
               call.content = lines.slice (3).join ('\n');
               return call;
            }

            if (lines [3] !== 'old text:') {
               return {error: 'Expected old text: on line 4'};
            }
            var separator = lines.indexOf ('new line:', 4);
            if (separator === -1) return {error: 'Expected a line containing exactly new line:'};
            call.oldText = lines.slice (4, separator).join ('\n');
            call.newText = lines.slice (separator + 1).join ('\n');
            if (! call.oldText) return {error: 'Old text must not be empty; use [EOF] to append'};
            return call;
         }

         var makeToolCall = async function (call, onOutput) {
            if (call.error) return {code: 1, error: call.error};
            try {
               var target = call.projectId;
               if (target !== rq.body.id) {
                  if (call.op !== 'run' && ! validProjectPath (call.path)) {
                     return {code: 1, error: 'Invalid path'};
                  }
                  var access = await docker.read (target, '/project/vibey/access.md');
                  var allowed = ! access.code && dale.stop (
                     access.stdout.toString ('utf8').split (/\r?\n/), true,
                     function (line) {
                        var grant = /^(\S+)\s+(read|write)(?:\s+(.+))?$/.exec (line.trim ());
                        if (! grant || grant [1] !== 'project:' + rq.body.id) return;
                        if (grant [2] !== 'write' && call.op !== 'read') return;
                        var prefix = grant [3] || '';
                        if (! validProjectPath (prefix)) return;
                        return ! prefix || (call.op !== 'run' && call.path.startsWith (prefix));
                     }
                  );
                  if (! allowed) return {code: 1, error: 'Access denied'};
               }

               if (call.op === 'read') return await docker.read (target, call.path);
               if (call.op === 'write') return await docker.write (target, call.path, call.content);
               if (call.op === 'edit') return await docker.edit (target, call.path, call.oldText, call.newText);
               if (call.op === 'run' && call.command.trim () === 'vibey access') {
                  var result = await docker.access (target);
                  if (onOutput) onOutput (result.stdout || result.error || '');
                  return result;
               }
               if (call.op === 'run') return await docker.run (target, groupedCommand (call.command), {
                  catch: true,
                  onSpawn: function (proc) {watchCancellation (proc, target)},
                  stdout: onOutput,
                  stderr: onOutput,
               });
               return {code: 1, error: 'Unknown tool: ' + call.op};
            }
            catch (error) {
               return {code: error.code || 1, error: formatError (error)};
            }
         }

         var toolCall = ! aiResult.code && ! aiResult.signal ? parseToolCall (output) : undefined;

         var toolCallText;
         if (toolCall) {
            var toolCallIndex = /^tool-call:.*$/m.exec (output).index;
            toolCallText = output.slice (toolCallIndex);
            output = output.slice (0, toolCallIndex);
            if (! toolCall.error) {
               output = output.trimEnd ();
               output += (output ? '\n\n' : '') + toolCall.description;
               var toolCallLines = toolCallText.split ('\n');
               if (toolCall.op === 'read' || toolCall.op === 'run') toolCallLines = toolCallLines.slice (0, 3);
               toolCallLines.splice (1, 1);
               toolCallText = toolCallLines.join ('\n');
            }
         }
         aiStderr = aiStderr.split ('\n').filter (function (line) {
            var plain = line.replace (/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
            return ! /codex_models_manager::manager:\s+failed to refresh available models: request timed out\s*$/.test (plain);
         }).join ('\n');
         if (aiStderr.trim ()) output += '\n\n' + aiStderr;
         streamEdit ();
         await editQueue;
         if (editError) throw editError;

         // Reuse the stream writer only after the previous message's edits have finished.
         var startMessage = async function (from, to, body) {
            responseId = crypto.randomUUID ();
            tStart = now ();
            output = body || '';
            usage = undefined;
            editQueue = Promise.resolve ();
            editError = undefined;
            oldBody = 'əəə body ' + responseId + '\n' + output.replace (/^əəə (head|body)/gm, '> əəə $1');
            var head = [
               'əəə head ' + responseId,
               'from ' + from,
               'id ' + responseId,
               'pending 1',
               't-start ' + tStart,
               ...(from === rq.body.to ? ['credential ' + auth] : []),
            ].join ('\n');
            var result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + head + '\nto ' + to + '\n' + oldBody);
            if (result.code) throw result;
            return head;
         };

         // Append the successor before finishing this message, so pollers never see a finished chain end early.
         if (toolCall) var toolHead = await startMessage ('shell', responseId, toolCallText + '\n\nResult:\n');

         result = await docker.edit (rq.body.id, rq.body.file, oldHead, newHead);
         if (result.code) throw result;
         redis ('hset', 'project:' + rq.body.id, 'last', now ());
         if (! toolCall) break;

         var toolResult = turn >= 49 ? {code: 1, error: 'Tool-call limit reached (50 AI responses).'} : await makeToolCall (toolCall, function (chunk) {
            output += chunk.toString ('utf8');
            streamEdit ();
         });
         if (cancelled) {
            await editQueue;
            return;
         }
         if (toolCall.op !== 'run' && toolResult.stdout) output += toolResult.stdout.toString ('utf8');
         if (toolResult.error) output += '\n' + toolResult.error;
         if (toolResult.signal) output += '\nSignal: ' + toolResult.signal;
         output += '\nExit code: ' + (toolResult.code || 0);
         streamEdit ();
         await editQueue;
         if (editError) throw editError;
         // Finished once the next AI message is appended (or now, if this is the last turn).
         toolDone = [toolHead, toolHead.replace ('\npending 1\n', '\nt-end ' + now () + '\n')];
         if (turn < 49) continue;
         await docker.edit (rq.body.id, rq.body.file, toolDone [0], toolDone [1]);
         redis ('hset', 'project:' + rq.body.id, 'last', now ());
         break;
      }

   }],

   ['delete', '/project/:id', async function (rq, rs) {

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.data.params.id) return project;
      });
      if (! match) return reply (rs, 404);

      if (match.owner !== rq.user.id) return reply (rs, 403, {error: 'Only the project owner can delete the project'});

      var containerId = 'vibey-project-' + rq.data.params.id;

      var noSuchContainer = function (result) {
         return result.code && result.stderr && result.stderr.match (/No such container|is not running/);
      }

      var stop = await run ('docker', 'stop', containerId, {catch: true});
      if (stop.code && ! noSuchContainer (stop)) throw stop;

      var rm = await run ('docker', 'rm', containerId, {catch: true});
      if (rm.code && ! noSuchContainer (rm)) throw rm;

      await run ('docker', 'volume', 'rm', containerId);

      await redis ([
         ['del',  'project:' + rq.data.params.id],
         ['srem', 'owner:' + rq.user.id, 'project:' + rq.data.params.id],
         ... await projectAccessCleanup (rq.data.params.id)
      ]);

      reply (rs, 200);
   }],

   // *** CREDENTIALS ***

   ['post', '/credentials/:provider/start', async function (rq, rs) {
      if (! inc (['anthropic', 'openai'], rq.data.params.provider)) return reply (rs, 400, {error: 'Invalid provider'});

      var b64url = function (buffer) {
         return buffer.toString ('base64').replace (/\+/g, '-').replace (/\//g, '_').replace (/=/g, '');
      };
      var verifier  = b64url (crypto.randomBytes (32));
      var challenge = b64url (crypto.createHash ('sha256').update (verifier).digest ());

      await redis ('setex', 'pkce:' + rq.user.id + ':' + rq.data.params.provider, 900, JSON.stringify ({verifier: verifier}));

      var params = rq.data.params.provider === 'anthropic' ? new URLSearchParams ({
         client_id: Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString (),
         code: 'true',
         code_challenge: challenge,
         code_challenge_method: 'S256',
         redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
         response_type: 'code',
         scope: 'org:create_api_key user:profile user:inference',
         state: verifier,
      }) : new URLSearchParams ({
         client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
         code_challenge: challenge,
         code_challenge_method: 'S256',
         codex_cli_simplified_flow: 'true',
         id_token_add_organizations: 'true',
         redirect_uri: 'http://localhost:1455/auth/callback',
         response_type: 'code',
         scope: 'openid profile email offline_access',
         state: crypto.randomBytes (16).toString ('hex'),
      });

      var url = (rq.data.params.provider === 'anthropic' ? 'https://claude.ai/oauth/authorize' : 'https://auth.openai.com/oauth/authorize') + '?' + params.toString ();

      reply (rs, 200, {url: url});
   }],

   ['post', '/credentials/:provider/complete', async function (rq, rs) {
      if (! inc (['anthropic', 'openai'], rq.data.params.provider)) return reply (rs, 400, {error: 'Invalid provider'});

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), 'code', 'eachOf', teishi.test.equal],
         ['code', rq.body.code, 'string'],
      ])) return;

      var pending = await redis ('get', 'pkce:' + rq.user.id + ':' + rq.data.params.provider);
      if (! pending) return reply (rs, 400, {error: 'No pending PKCE flow'});
      pending = JSON.parse (pending);

      await redis ('del', 'pkce:' + rq.user.id + ':' + rq.data.params.provider);

      var code = rq.body.code.split ('#') [0];
      try {
         var parsed = new URL (code.trim ());
         if (parsed.searchParams.get ('code')) code = parsed.searchParams.get ('code');
      }
      catch (e) {}

      var clientId = rq.data.params.provider === 'anthropic' ? Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString () : 'app_EMoamEEZ73f0CkXaXp7hrann';
      var redirectURI = rq.data.params.provider === 'anthropic' ? 'https://console.anthropic.com/oauth/code/callback' : 'http://localhost:1455/auth/callback';

      try {
         var tokenData = await new Promise (function (resolve, reject) {
            hitit.one ({}, {
               https:   true,
               host:    rq.data.params.provider === 'anthropic' ? 'console.anthropic.com' : 'auth.openai.com',
               path:    rq.data.params.provider === 'anthropic' ? '/v1/oauth/token' : '/oauth/token',
               method:  'post',
               headers: rq.data.params.provider === 'anthropic' ? {} : {'content-type': 'application/x-www-form-urlencoded'},
               body:    rq.data.params.provider === 'anthropic' ? {
                  client_id: clientId,
                  code: code,
                  code_verifier: pending.verifier,
                  grant_type: 'authorization_code',
                  redirect_uri: redirectURI,
                  state: rq.body.code.split ('#') [1],
               } : new URLSearchParams ({
                  client_id: clientId,
                  code: code,
                  code_verifier: pending.verifier,
                  grant_type: 'authorization_code',
                  redirect_uri: redirectURI,
               }).toString (),
               code:    200,
            }, function (error, rdata) {
               if (error) return reject (error);
               resolve (rdata.body);
            });
         });
      }
      catch (error) {
         return reply (rs, 400, {error: 'Token exchange failed: ' + JSON.stringify (error.body || error.error)});
      }

      var credentials = JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}');
      if (! credentials [rq.data.params.provider]) credentials [rq.data.params.provider] = {};
      var accountData = {
         access: tokenData.access_token,
         expires: Date.now () + tokenData.expires_in * 1000 - 5 * 60 * 1000,
         refresh: tokenData.refresh_token,
      };

      if (rq.data.params.provider === 'openai') {
         try {
            var jwt = JSON.parse (Buffer.from (tokenData.access_token.split ('.') [1], 'base64').toString ());
            var accountId = jwt ['https://api.openai.com/auth'] && jwt ['https://api.openai.com/auth'].chatgpt_account_id;
            if (accountId) accountData.accountId = accountId;
            if (tokenData.id_token) accountData.idToken = tokenData.id_token;
         }
         catch (e) {}
      }

      credentials [rq.data.params.provider].account = accountData;

      await redis ([
         ['hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials)],
         ['sadd', 'owner:' + rq.user.id, 'credentials:' + rq.user.id],
      ]);

      reply (rs, 200);
   }],

   ['post', '/credentials/:provider/apiKey', async function (rq, rs) {
      var provider = rq.data.params.provider;
      if (! inc (['anthropic', 'openai'], provider)) return reply (rs, 400, {error: 'Invalid provider'});
      if (type (rq.body.key) !== 'string' || ! rq.body.key.trim ()) return reply (rs, 400, {error: 'Missing key'});

      var credentials = JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}');
      if (! credentials [provider]) credentials [provider] = {};
      credentials [provider].apiKey = rq.body.key.trim ();

      await redis ([
         ['hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials)],
         ['sadd', 'owner:' + rq.user.id, 'credentials:' + rq.user.id],
      ]);

      reply (rs, 200);
   }],

   ['delete', '/credentials/:provider/:name', async function (rq, rs) {
      var provider = rq.data.params.provider;
      var name = rq.data.params.name;
      if (! inc (['anthropic', 'openai'], provider)) return reply (rs, 400, {error: 'Invalid provider'});
      if (! inc (['account', 'apiKey'], name)) return reply (rs, 400, {error: 'Invalid credential type'});

      var credentials = JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}');
      if (credentials [provider]) delete credentials [provider] [name];
      await redis ('hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials));

      reply (rs, 200);
   }],

   // *** TESTS ***

   ['get', '/test', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      await test.cleanup (redis, run);
      test.run (CONFIG) ('all', async function (error, rdata) {
         if (! error) await test.cleanup (redis, run);
         reply (rs, 200, cell.JSToText (error ? {error} : rdata));
      }, {cookie: rq.headers.cookie, csrf: rq.user.csrf}, redis, run);
   }],

   ['get', '/test.js', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      cicek.file (rq, rs, 'test.js');
   }],

   ['post', '/test/cleanup', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      await test.cleanup (redis, run);

      reply (rs, 200);

   }],
];

// *** SERVER ***

var exiting;

dale.go (['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2', 'SIGPIPE', 'SIGALRM'], function (signal) {
   process.on (signal, function () {
      clog ({type: 'Signal received', priority: 'important', signal: signal});
      if (inc (['SIGTERM', 'SIGINT'], signal)) {
         exiting = true;
         if (cicek.isMaster && new URL (CONFIG.baseURL).hostname === 'localhost') docker.cleanup ();
      }
   });
});

cicek.cluster (undefined, function (worker, code, signal) {
   if (exiting) return;
   cluster.fork ().on ('message', function (message) {
      cicek.log (JSON.parse (message), true);
   });
});

var fatal = function (type, error) {
   if (exiting) return;
   clog ({type: type, priority: 'critical', ... error});
   process.exit (1);
}

process.on ('uncaughtException', function (error, origin) {
   fatal ('Uncaught exception', {error: formatError (error), origin});
});

process.on ('unhandledRejection', function (error) {
   fatal ('Uncaught promise rejection', {error: formatError (error)});
});

cicek.log = function (log) {
   if (log [0] === 'error') {
      if (exiting && inc (['worker died', 'worker error'], log [1])) return;
      return clog ({priority: 'critical', type: log [1], error: log.slice (2)});
   }
   if (log [0] === 'start') return clog ({priority: 'important', type: 'Server start', port: log [3]});
   // We ignore `request`, `requestContent` and `response`
}

cicek.apres = function (rs) {
   clog ({
      priority: rs.log.code >= 500 ? 'critical' : (rs.log >= 400 ? 'important' : undefined),
      type: 'Response',
      rqId: rs.log.id,
      method: rs.log.method,
      path: rs.log.url,
      code: rs.log.code,
      ms: Date.now () - rs.log.startTime,
      ip: rs.log.origin,
      length: {
         rq: rs.log.requestBody === undefined || rs.log.requestBody === '' ? 0 : JSON.stringify (rs.log.requestBody).length,
         rs: rs.log.responseBody === undefined ? 0 : (type (rs.log.responseBody) !== 'integer' ? JSON.stringify (rs.log.responseBody).length : rs.log.responseBody)
      },
      userId: ! CONFIG.cloud ? undefined : (rs.request.user ? rs.request.user.id : 'anonymous')
   });
   cicek.Apres (rs);
}

var server = cicek.listen ({port: CONFIG.port}, dale.go (routes, function (route) {
   var fn = route [2];
   route [2] = async function (rq, rs) {
      try {
         await fn.apply (fn, [rq, rs].concat (route.slice (3)));
      }
      catch (error) {
         clog ({priority: 'critical', type: 'Internal route error', error: formatError (error), rqId: rs.log.id});
         reply (rs, 500, {error: 'Internal server error'});
      }
   }
   return route;
}));
