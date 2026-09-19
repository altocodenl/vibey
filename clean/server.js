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
   var items = dale.fil (await redis ('smembers', 'owner:' + userId), undefined, function (key) {
      if (key.match (new RegExp ('^' + entity + ':'))) return key;
   });

   return await redis (dale.go (items, function (item) {
      return ['hgetall', item];
   }));
}

// *** COMMANDS ***

var run = async function (... args) {

   if (type (last (args)) === 'object') {
      var command = teishi.copy (args).slice (0, -1);
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
   });
}

var docker = {};

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
      command += ' || exit $?; n=0; s=0; while [ $n -lt 50 ]; do if [ -n "$(git status --porcelain 2>/dev/null)" ]; then git add -A && git commit -m ' + Path.quote (commit) + ' > /dev/null 2>&1 && git rev-parse HEAD && s=1 && break; fi; sleep 0.001; n=$((n+1)); done; [ $s = 0 ] && echo || true';
      delete options.commit;
   }

   var result = await run ('docker', 'exec', '-i', id, 'sh', '-c', command, {... options, 'catch': true});
   if (result.code === 1 && result.stderr && result.stderr.match (/^Error response from daemon: (?:container .+ is not running|No such container)/)) {
      var recreate = await run ('docker', 'run', '-v', id + ':/project', '--name', id, '-d', 'vibey-project', {catch: true});
      if (recreate.code) {
         var restart = await run ('docker', 'start', id, {catch: true});
         if (restart.code) return result;
      }
      return docker.run (id.replace ('vibey-project-', ''), originalCommand || command, {... options, commit});
   }
   if (result.code && ! (options && options.catch)) throw result;
   if (commit && result.stdout) {
      result.sha = last (result.stdout.split ('\n'), 2) || undefined;
      result.stdout = result.stdout.replace (/[^\n]{0,}\n$/, '');
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

   var script = 'read old_len; read new_len;'
      + ' dd bs=1 count=$old_len of=/tmp/_old 2>/dev/null;'
      + ' dd bs=1 count=$new_len of=/tmp/_new 2>/dev/null;'
      + " awk '"
      +    'BEGIN {RS = sprintf ("%c", 1)}'
      +    ' function rf(f,   _s, _l) {while ((getline _l < f) > 0) _s = _s (length (_s) ? RS : "") _l; close (f); return _s}'
      +    ' {file = file (NR > 1 ? RS : "") $0}'
      +    ' END {'
      +       'old = rf("/tmp/_old"); new_ = rf("/tmp/_new"); olen = length (old);'
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

      var publicPath = dale.stop ([
         ['get', '/'],
         ['get', /^\/assets\/.+/],
         ['get', '/client.js'],
         ['get', '/favicon.svg'],
         ['post', '/error'],
         ['post', '/auth/login'],
         ['get', /^\/auth\/verify\//],
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
            ['script', {src: 'cell.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],

   ['get', '/assets/*', function (rq, rs) {
      cicek.file (rq, rs, rq.url.replace ('assets/', ''), ['node_modules']);
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

   // *** ERROR REPORTING ***

   ['post', '/error', function (rq, rs) {
      var error = type (rq.body.error) === 'object' ? rq.body : {error: rq.body};
      clog ({priority: 'important', type: 'client error', ... error});
      reply (rs, 200);
   }],

   // *** AUTH ***

   ['get', '/auth/user', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 200, {mode: 'local'});

      reply (rs, 200, {
         admin: rq.user.email === CONFIG.admin ? true : undefined,
         count: parseInt (rq.user.count),
         creator: !! rq.user.creator,
         csrf: rq.user.csrf,
         email: rq.user.email,
         id: rq.user.id,
         mode: 'cloud',
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
      }
      else {
         // For the unlikely case that a new user requests a second link.
         var [ttl] = await redis ([
            ['ttl', 'user:' + userId],
            oldLoginLink ? ['del', 'loginLink:' + oldLoginLink] : [],
            ['setex', 'loginLink:' + loginLink, 60 * 5, rq.body.email],
            ['setex', 'loginLinkR:' + rq.body.email, 60 * 5, loginLink]
         ]);
         if (ttl > 0) await redis ([
            ['expire', 'email:' + rq.body.email, 300],
            ['expire', 'user:'  + userId,        300],
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

      var user = await redis ('hgetall', 'user:' + userId);

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
      ]);

      reply (rs, 200, {
         admin: user.email === CONFIG.admin ? true : undefined,
         count: parseInt (user.count),
         creator: !! user.creator,
         csrf,
         email: user.email,
         mode: 'cloud',
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

      await redis ('del', ... ['user:' + rq.user.id, 'email:' + rq.user.email, 'owner:' + rq.user.id, ... keys]);

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
      }

      reply (rs, 200);
   }],

   ['get', '/projects', async function (rq, rs) {
      reply (rs, 200, dale.go ((await getForUser (rq.user.id, 'project')).sort (function (a, b) {
         return new Date (b.last) - new Date (a.last);
      }), function (project) {
         return {
            ...project,
            slot: project.slot ? parseInt (project.slot) : undefined
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
         if (parseInt (project.slot) === rq.body.slot) return project;
      });

      var ops = [
         ['hmset', 'project:' + project.id, project],
         ['sadd',  'owner:' + rq.user.id, 'project:' + project.id]
      ];
      if (slotConflict) ops.push (['hdel', 'project:' + slotConflict.id, 'slot']);

      await redis (ops);

      var containerId = 'vibey-project-' + project.id;

      await run ('docker', 'run', '-v', containerId + ':/project', '--name', containerId, '-d', 'vibey-project');

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

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return project;
      });
      if (! match) return reply (rs, 404);
      var conflict = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return;
         if (project.name === rq.body.name) return project;
      });
      if (conflict) return reply (rs, 409, {error: 'There is already a project with that name'});

      var slotConflict = dale.stopNot (projects, undefined, function (project) {
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

   ['post', ['/project/read', '/project/write', '/project/edit', '/project/run', '/project/message'], async function (rq, rs) {

      if (stop (rs, ['id', rq.body.id, 'string'])) return;

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return project;
      });
      if (! match) return reply (rs, 404);

      rs.next ();
   }],

   ['post', '/project/read', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
      ])) return;

      var file = await docker.read (rq.body.id, rq.body.path);
      if (file.code) {
         if (file.code === 1 && file.error && file.error.match ('No such file or directory')) return reply (rs, 404);
         clog ({priority: 'important', type: 'Read file error', error: formatError (file)});
         return reply (rs, 500);
      }
      if (file.code === 0) delete file.code;

      var stdout = file.stdout || Buffer.alloc (0);
      var binary = stdout.slice (0, 512).indexOf (0) !== -1;
      if (binary) {
         // cicek doesn't support sending buffers
         rs.log.code = 200;
         rs.log.responseBody = stdout.length;
         rs.writeHead (200, {'content-type': mime.lookup (rq.body.path) || 'application/octet-stream', 'x-binary': '1'});
         rs.end (stdout);
         return cicek.apres (rs);
      }
      reply (rs, 200, stdout.toString ('utf8'), {}, rq.body.path);
   }],

   ['post', '/project/write', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path', 'content', 'base64'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['content', rq.body.content, 'string'],
         ['base64', rq.body.base64, ['boolean', 'undefined'], 'oneOf'],
      ])) return;

      var content = rq.body.base64 ? Buffer.from (rq.body.content, 'base64') : rq.body.content;

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

      var result = await docker.run (rq.body.id, rq.body.command, {catch: true, commit: 'Run ' + Path.quote (rq.body.command)});
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

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.projectId) return project;
      });
      if (! match) return reply (rs, 404);

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
      reply (rs, 200, message, {'content-type': 'text/plain; charset=utf-8'});
   }],

   ['post', '/project/message', async function (rq, rs) {
      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['base64', 'body', 'file', 'id', 'to'], 'eachOf', teishi.test.equal],
         ['base64', rq.body.base64, ['boolean', 'undefined'], 'oneOf'],
         ['file', rq.body.file, 'string'],
         ['id', rq.body.id, 'string'],
         ['body', rq.body.body, 'string'],
         ['body without marker lines', rq.body.body, /^(?![\s\S]*(^|\n)əəə (head|body))/, teishi.test.match],
         ['to', rq.body.to, 'string'],
         ['to', rq.body.to, undefined, function () {
            if (teishi.inc (['all', 'shell', 'ai-gpt-6', 'ai-opus-4.6'], rq.body.to)) return true;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (rq.body.to)) return true;
            return ['to must be all, shell, ai-gpt-6, ai-opus-4.6, or a message UUID'];
         }],
      ])) return;

      var id = crypto.randomUUID ();

      var message = [
         'əəə head ' + id,
         rq.body.base64 ? 'base64 1' : '',
         'from ' + rq.user.id,
         'id ' + id,
         't ' + now (),
         'to ' + rq.body.to,
         'əəə body ' + id,
         rq.body.body,
      ].join ('\n');

      var result = await docker.run (rq.body.id, 'mkdir -p ' + Path.quote (Path.dirname (rq.body.file)) + ' && touch ' + Path.quote (rq.body.file), {catch: true});
      if (result.code) return reply (rs, 400, {code: result.code, error: result.stderr});

      result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + message);
      if (result.code) return reply (rs, 400, result);

      redis ('hset', 'project:' + rq.body.id, 'last', now ());

      if (rq.body.to !== 'shell' && ! rq.body.to.match (/^ai-/)) return reply (rs, 200, {id: id});

      if (rq.body.to.match (/^ai-/)) {
         var aiFlavor = rq.body.to === 'ai-opus-4.6' ? 'anthropic' : rq.body.to === 'ai-gpt-6' ? 'openai' : undefined;
      }

      var responseId = crypto.randomUUID ();
      var tStart = now ();

      var responseMessage = [
         'əəə head ' + responseId,
         'from ' + rq.body.to,
         'id ' + responseId,
         'pending 1',
         't-start ' + tStart,
         'to ' + id,
         'əəə body ' + responseId,
         '',
      ].join ('\n');

      result = await docker.edit (rq.body.id, rq.body.file, '[EOF]', '\n' + responseMessage);
      if (result.code) return reply (rs, 400, result);

      reply (rs, 200, {id: id, responseId: responseId});

      var output = '', oldBody = 'əəə body ' + responseId + '\n';
      var editQueue = Promise.resolve (), editError;
      var streamEdit = function () {
         var newBody = 'əəə body ' + responseId + '\n' + output;
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
         await docker.run (rq.body.id, rq.body.body, {catch: true, stdout: function (chunk) {
            output += chunk;
            streamEdit ();
         }, stderr: function (chunk) {
            output += chunk;
            streamEdit ();
         }});
         await editQueue;
      }

      if (aiFlavor) {
         var credentials = JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}');

         if (aiFlavor === 'anthropic') var command = 'claude -p --model claude-opus-4-6 --output-format stream-json --verbose --dangerously-skip-permissions'
         if (aiFlavor === 'openai')    var command = 'codex exec --json -m "gpt-6-astra" --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check';

         if (aiFlavor === 'openai') {
            if (! credentials.openai?.oauth) return reply (rs, 400, {error: 'No OpenAI credential'});
            var codexAuth = JSON.stringify ({auth_mode: 'chatgpt', tokens: {access_token: credentials.openai.oauth.access, refresh_token: credentials.openai.oauth.refresh}});
            var result = await docker.write (rq.body.id, '/tmp/codex-auth/auth.json', codexAuth, 'noCommit');
            if (result.code) throw result;
         }

         var dockerArgs = ['exec'];
         if (aiFlavor === 'anthropic') {
            if (! credentials.anthropic?.oauth) return reply (rs, 400, {error: 'No Anthropic credential'});
            dockerArgs.push ('-e', 'CLAUDE_CODE_OAUTH_TOKEN=' + credentials.anthropic.oauth.access);
         }
         if (aiFlavor === 'openai')    dockerArgs.push ('-e', 'CODEX_HOME=/tmp/codex-auth');
         dockerArgs.push ('vibey-project-' + rq.body.id, 'sh', '-c', command + ' ' + Path.quote (rq.body.body));

         var buffer = '';

         var processLines = function (lines) {
            var parseChunk = aiFlavor === 'anthropic' ? function (line) {
               var event = JSON.parse (line);
               if (event.type === 'assistant' && event.message && event.message.content) {
                  return {replace: true, text: event.message.content.filter (function (block) {
                     return block.type === 'text';
                  }).map (function (block) {return block.text}).join ('\n')};
               }
               if (event.type === 'result' && event.result) {
                  return {replace: true, text: event.result};
               }
            } : function (line) {
               var event = JSON.parse (line);
               if (event.type === 'item.completed' && event.item && event.item.type === 'agent_message') return event.item.text;
            };
            dale.go (lines, function (line) {
               if (! line) return;
               try {
                  var chunk = parseChunk (line);
                  if (! chunk) return;
                  if (chunk.replace) output = chunk.text;
                  else               output += chunk;
                  streamEdit ();
               } catch (e) {
                  clog ({priority: 'important', type: 'AI stream parse error', error: formatError (e), responseId});
               }
            });
         }

         var aiResult = await run ('docker', ... dockerArgs, {catch: true, stdout: function (chunk) {
            buffer += chunk;
            var lines = buffer.split ('\n');
            buffer = lines.pop ();
            processLines (lines);
         }, stderr: function (chunk) {
            output += chunk;
            streamEdit ();
         }});

         if (buffer) processLines ([buffer]);

         if (aiResult.code === -1) {
            output += (output ? '\n\n' : '') + 'AI process failed to start: ' + aiResult.error;
            streamEdit ();
         }
         else if (aiResult.code || aiResult.signal) {
            var error = aiResult.signal ? 'AI process terminated by signal ' + aiResult.signal : 'AI process exited with code ' + aiResult.code;
            output += (output ? '\n\n' : '') + error;
            streamEdit ();
         }

         await editQueue;
      }

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
      ].join ('\n');

      await docker.edit (rq.body.id, rq.body.file, oldHead, newHead);

      redis ('hset', 'project:' + rq.body.id, 'last', now ());
   }],

   ['delete', '/project/:id', async function (rq, rs) {

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.data.params.id) return project;
      });
      if (! match) return reply (rs, 404);

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
         ['srem', 'owner:' + rq.user.id, 'project:' + rq.data.params.id]
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

      var tokenURL = rq.data.params.provider === 'anthropic' ? 'https://console.anthropic.com/v1/oauth/token' : 'https://auth.openai.com/oauth/token';
      var clientId = rq.data.params.provider === 'anthropic' ? Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString () : 'app_EMoamEEZ73f0CkXaXp7hrann';
      var redirectURI = rq.data.params.provider === 'anthropic' ? 'https://console.anthropic.com/oauth/code/callback' : 'http://localhost:1455/auth/callback';

      var isAnthropic = rq.data.params.provider === 'anthropic';

      var response = await fetch (tokenURL, {
         method: 'POST',
         headers: {'Content-Type': isAnthropic ? 'application/json' : 'application/x-www-form-urlencoded'},
         body: isAnthropic ? JSON.stringify ({
            client_id: clientId,
            code: code,
            code_verifier: pending.verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectURI,
            state: rq.body.code.split ('#') [1],
         }) : new URLSearchParams ({
            client_id: clientId,
            code: code,
            code_verifier: pending.verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectURI,
         }),
      });

      if (! response.ok) return reply (rs, 400, {error: 'Token exchange failed: ' + await response.text ()});

      var tokenData = await response.json ();

      var credentials = JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}');
      if (! credentials [rq.data.params.provider]) credentials [rq.data.params.provider] = {};
      credentials [rq.data.params.provider].oauth = {
         access: tokenData.access_token,
         expires: Date.now () + tokenData.expires_in * 1000 - 5 * 60 * 1000,
         refresh: tokenData.refresh_token,
      };

      await redis ([
         ['hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials)],
         ['sadd', 'owner:' + rq.user.id, 'credentials:' + rq.user.id],
      ]);

      reply (rs, 200);
   }],

   // *** TESTS ***

   ['get', '/test', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      await test.cleanup (docker, redis);
      test.run (CONFIG) ('all', async function (error, rdata) {
         if (! error) await test.cleanup (docker, redis);
         reply (rs, 200, cell.JSToText (error ? {error} : rdata));
      }, {cookie: rq.headers.cookie, csrf: rq.user.csrf}, redis, run);
   }],

   ['get', '/test.js', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      cicek.file (rq, rs, 'test.js');
   }],

   ['post', '/test/cleanup', async function (rq, rs) {
      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      await test.cleanup (docker, redis);

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
         if (cicek.isMaster) docker.cleanup ();
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
         rq: rs.log.requestBody === ''         ? 0 : JSON.stringify (rs.log.requestBody).length,
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
