/* *** SHAPE OF secret.js ***

module.exports = {
   ses: {
      accessKeyId:     '...',
      secretAccessKey: '...'
   }
}

*/

try {
   var SECRET = require ('./secret.js');
}
catch (error) {
   var SECRET = {};
}

// *** CONFIG ***

var CONFIG = {
   admin: 'info@altocode.nl',
   baseURL: 'http://localhost:5353',
   cloud: process.env.cloud === '1',
   cookie: {
      expires: 7 * 24 * 60 * 60,
      name:    'vibey'
   },
   email: {
      enable: process.env.email === '1',
      from: {
         address: 'info@altocode.nl',
         name: 'A friend from Vibey',
      },
      ses: {
         accessKeyId:     SECRET.ses?.access,
         region:          'eu-west-1',
         secretAccessKey: SECRET.ses?.secret
      },
   },
   port: 5353,
   redis: {
      db: 0
   }
}

// *** TEST ***

var test = require ('./test.js') (CONFIG);

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
var Redis  = require ('redis').createClient ({db: CONFIG.redis.db});

var {inc, last, type} = teishi;

// *** CELL (for logging, taken from github.com/altocodenl/cell) ***

var cell = {};

cell.unparseElement = function (v) {
   if (v === null) return ' ';
   if (type (v) !== 'string') return v + '';
   if (v.length === 0) return '""';

   if (v.match (/^-?(\d+\.)?\d+$/) !== null) return '"' + v + '"';
   if (v.match ('"') || v.match (/\s/)) {
      return '"' + v.replace (/\//g, '//').replace (/"/g, '/"') + '"';
   }
   return v;
}

cell.sorter = function (paths) {

   var compare = function (v1, v2) {
      if (v1 === v2) return 0;
      var types = [type (v1) === 'string' ? 'text' : 'number', type (v2) === 'string' ? 'text' : 'number'];
      if (types [0] !== types [1]) return types [0] === 'number' ? -1 : 1;
      if (types [0] === 'number') return v1 - v2;

      if (v1 === '=' && v2 === ':') return -1;
      if (v1 === ':' && v2 === '=') return 1;

      return v1 < v2 ? -1 : 1;
   }

   return paths.sort (function (a, b) {
      var result = dale.stopNot (dale.times (Math.min (a.length, b.length), 0), 0, function (k) {
         return compare (a [k], b [k]);
      }) || 0;
      return result !== 0 ? result : a.length - b.length;
   });
}

cell.JSToText = function (text) {
   return cell.pathsToText (cell.JSToPaths (text));
}

cell.pathsToText = function (paths) {

   var spaces = function (n) {
      return Array (n).fill (' ').join ('');
   }

   var output = [];

   var pathToText = function (path, prefixIndent) {
      var indentCount = 0;
      return dale.go (path, function (step) {
         step = cell.unparseElement (step);
         if (! step.match (/\n/)) {
            indentCount += step.length + 1;
            return step;
         }
         return dale.go (step.split (/\n/), function (line, k) {
            if (k === 0) {
               indentCount++;
               return line;
            }
            var indent = line.length === 0 ? '' : spaces (indentCount);
            if (k === step.split (/\n/).length - 1) {
               indentCount += line.length + 1;
            }
            return (prefixIndent || '') + indent + line;
         }).join ('\n');
      }).join (' ');
   }

   dale.go (paths, function (path, k) {
      var commonPrefix = [];
      if (k > 0) dale.stop (paths [k - 1], false, function (v, k) {
         if (v === path [k]) commonPrefix.push (v);
         else return false;
      });
      if (commonPrefix.length === 0) return output.push (pathToText (path));

      var prefixIndent = spaces (pathToText (commonPrefix).length + 1);
      output.push (prefixIndent + pathToText (path.slice (commonPrefix.length), prefixIndent));
   });

   return output.join ('\n');
}

cell.JSToPaths = function (v) {

   var paths = [];

   var singleToFourdata = function (v) {
      var Type = type (v);
      if (teishi.inc (['integer', 'float', 'string'], Type)) return v;
      if (Type === 'boolean') return v ? 1 : 0;
      if (Type === 'date') return v.toISOString ();
      if (teishi.inc (['regex', 'function', 'infinity'], Type)) return v.toString ();
      return '';
   }

   var recurse = function (v, path) {
      if (v === undefined) return;
      if (teishi.simple (v)) paths.push ([...path, singleToFourdata (v)]);
      else                   dale.go (v, function (v2, k2) {
         recurse (v2, [...path, type (k2) === 'integer' ? k2 + 1 : k2]);
      });
   }

   recurse (v, [])

   return cell.sorter (paths);
}

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

   log = {t: now (), from: cicek.isMaster ? 'main' : ('worker' + cluster.worker.id), ...log};
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

var run = async function (...args) {

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
            if (k === 'stdout' && v.length) return [k, '(' + v.length + ' characters)'];
            return [k, v];
         });
         var ms = Date.now () - t;
         clog ({type: 'Command response', id, command: command.join (' '), ms, ...logOutput});
         if (! output.code || options.catch) resolve (output);
         else reject (output);
      }

      dale.go (['stdout', 'stderr'], function (k) {
         proc [k].on ('data', function (chunk) {
            if (output [k] === undefined) output [k] = '';
            output [k] += chunk;
         });
         proc [k].on ('end', done);
      });

      proc.on ('error', function (error) {
         output.code  = -1;
         output.error = formatError (error);
         done ();
      });
      proc.on ('exit', function (code, signal) {
         if (code !== null && code !== 0) output.code = code;
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
   if (commit) {
      originalCommand = command;
      command += ' && if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -m ' + Path.quote ('vibey:auto ' + commit) + ' > /dev/null 2>&1 && git rev-parse HEAD; else echo; fi';
      delete options.commit;
   }

   var result = await run ('docker', 'exec', '-i', id, 'sh', '-c', command, options || {});
   if (result.code === 1 && result.stderr && result.stderr.match (/^Error response from daemon: container .+ is not running/)) {
      var restart = await run ('docker', 'start', id);
      if (restart.code === 1) return result;
      return docker.run (id.replace ('vibey-project-', ''), originalCommand || command, options);
   }
   if (commit && result.stdout) {
      result.sha = last (result.stdout.split ('\n'), 2) || undefined;
      result.stdout = result.stdout.replace (/[^\n]{0,}\n$/, '');
      if (result.stdout === '') delete result.stdout;
      if (result.sha) await docker.backup (id.replace ('vibey-project-', ''));
   }
   return result;
}

docker.read = function (id, path) {
   return docker.run (id, ['cat', path]);
}

docker.write = function (id, path, content) {
   var command = 'mkdir -p ' + Path.quote (Path.dirname (path)) + ' && cat > ' + Path.quote (path);
   return docker.run (id, command, {input: content, commit: 'Write ' + Path.quote (path)});
}

docker.edit = async function (id, path, oldText, newText) {
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
   if (result.stderr) return {error: result.stderr};
   return result;
}

docker.cleanup = async function () {
   var result = await run ('docker', 'ps', '-aq', '-f', 'name=vibey-project-', {catch: true});
   if (result.stdout) {
      var ids = result.stdout.trim ().split ('\n');
      await run ('docker', 'stop', ...ids, {catch: true});
      await run ('docker', 'rm', ...ids, {catch: true});
   }
   process.exit (0);
}

docker.backup = async function (id) {

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
if (CONFIG.email.ses.accessKeyId && CONFIG.email.ses.secretAccessKey) {
   mailer = require ('nodemailer').createTransport (require ('nodemailer-ses-transport') (CONFIG.email.ses));
}

var sendmail = function (options) {
   return new Promise (function (resolve, reject) {
      if (! CONFIG.email.enable) {
         clog ({type: 'Skipping email', to: options.to, subject: options.subject});
         return resolve ();
      }
      mailer.sendMail ({
         from:    CONFIG.email.from.name + ' <' + CONFIG.email.from.address + '>',
         to:      options.to,
         replyTo: CONFIG.email.address,
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
         return rs.next ();
      }

      var sessionId = rq.data.cookie && rq.data.cookie [CONFIG.cookie.name] ? rq.data.cookie [CONFIG.cookie.name] : undefined;

      if (sessionId) {
         var session = await redis ('hgetall', 'session:' + sessionId);

         if (session && new Date (session.expires).getTime () > new Date ().getTime ()) {

            var user = await redis ('hgetall', 'user:' + session.user);

            if (! user) return reply (rs, 500, {priority: 'critical', type: 'User not found', user: session.user});

            rq.user = {csrf: session.csrf, session: sessionId, ...user};
         }
      }

      clog ({type: 'Request', rqId: rs.log.id, method: rq.method, url: rq.url, ip: rs.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});

      if (rq.headers ['x-test'] === '1') {
         if (CONFIG.baseURL !== 'http://localhost:5353') return reply (rs, 403, {error: 'Not a local request'});
         rq.test = true;
      }

      var publicPath = dale.stop ([
         ['get', '/'],
         ...dale.go (['normalize', 'tachyons', 'bootstrap-icons', 'fonts/bootstrap-icons.woff2', 'fonts/bootstrap-icons.woff'], function (v) {
            return ['get', '/' + v + (v.match (/\.woff\d?$/) ? '' : '.css')];
         }),
         ...dale.go (['client', 'gotoB', 'marked'], function (v) {
            return ['get', '/' + v + '.js'];
         }),
         ...dale.go (['signup/request', 'login', 'verify'], function (v) {
            return ['post', '/auth/' + v];
         }),
         ['get', '/favicon.ico'],
         ['post', '/error'],
         ... (rq.test ? [['post', '/auth/signup/accept']] : []),
      ], true, function (endpoint) {
         if (type (endpoint [1]) === 'string') endpoint [1] = new RegExp ('^' + cicek.escape (endpoint [1]) + '$');
         return rq.method === endpoint [0] && !! rq.url.match (endpoint [1]);
      });

      if (! rq.user && ! publicPath) {
         if (sessionId) return reply (rs, 403, {error: 'Invalid session'}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, false, {httponly: true, samesite: 'Lax', path: '/'})});
         else           return reply (rs, 403, {error: 'No session'});
      }

      if (rq.user && ! publicPath && inc (['post', 'put', 'delete'], rq.method) && rq.headers ['x-csrf'] !== session.csrf) return reply (rs, 403, {error: 'Invalid csrf token'});

      rs.next ();

      if (rq.user && ! (rq.method === 'post' && rq.url === '/auth/logout')) await redis ([
         ['hmset', 'session:' + sessionId, {
            expires: new Date (Date.now () + CONFIG.cookie.expires * 1000).toISOString (),
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
            CONFIG.domain && CONFIG.domain.match (/\/app\/?$/) ? ['base', {href: '/app/'}] : '',
            ['title', 'vibey'],
            ['link', {rel: 'stylesheet', href: 'normalize.css'}],
            ['link', {rel: 'stylesheet', href: 'tachyons.css'}],
            ['link', {rel: 'stylesheet', href: 'bootstrap-icons.css'}],
         ]],
         ['body', [
            ['script', {src: 'gotoB.js'}],
            ['script', {src: 'marked.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],
   ...dale.go ([
      ['normalize.css', 'normalize.css/normalize.css'],
      ['tachyons.css', 'tachyons/css/tachyons.min.css'],
      ['bootstrap-icons.css', 'bootstrap-icons/font/bootstrap-icons.min.css'],
      ['fonts/bootstrap-icons.woff2', 'bootstrap-icons/font/fonts/bootstrap-icons.woff2'],
      ['fonts/bootstrap-icons.woff',  'bootstrap-icons/font/fonts/bootstrap-icons.woff'],
      ['gotoB.js', 'gotob/gotoB.min.js'],
      ['marked.js', 'marked/lib/marked.umd.js'],
   ], function (route) {
      return ['get', route [0], cicek.file, 'node_modules/' + route [1]];
   }),
   ['get', 'client.js', cicek.file],
   ['get', 'favicon.ico', function (rq, rs) {
      rs.writeHead (200, {'content-type': 'image/x-icon'});
      rs.end (Buffer.from ('AAABAAEAEBAAAAEAIACKAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAAFFJREFUeJxjEJRQ/08JZgARMEBIMTZ11DGAGENwyVPPAEKGoMvBAFEGYBPHagAhxdj4BA0gZCCGAegKqG4AOh+rAcgKCYUH7QwgOSnTxQBsGAAft/+qqAkz2wAAAABJRU5ErkJggg==', 'base64'));
   }],

   // *** ERROR REPORTING ***

   ['post', 'error', function (rq, rs) {
      var error = type (rq.body.error) === 'object' ? rq.body : {error: rq.body};
      clog ({priority: 'important', type: 'client error', ...error});
      reply (rs, 200);
   }],

   // *** AUTH ***

   ['get', 'auth/csrf', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 200, {mode: 'local'});
      reply (rs, 200, {admin: rq.user.email === CONFIG.admin ? true : undefined, csrf: rq.user.csrf});
   }],

   ['post', '*', function (rq, rs) {
      if (! inc (['/auth/signup/request', '/auth/signup/accept', '/auth/login', '/auth/verify'], rq.url)) return rs.next ();

      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      if (stop (rs, [
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         }
      ])) return;

      rq.body.email = rq.body.email.toLowerCase ();
      rs.next ();

   }],

   ['post', 'auth/signup/request', async function (rq, rs) {

      var exists = await redis ('exists', 'email:' + rq.body.email);
      if (exists) return reply (rs, 409);

      if (rq.body.email === CONFIG.admin) {
         var userId = crypto.randomUUID ();

         await redis ([
            ['set', 'email:' + rq.body.email, userId],
            ['hmset', 'user:' + userId, {
               created: now (),
               email: rq.body.email,
               id: userId,
            }],
         ]);
      }
      else {
         await redis ('hmset', 'invite:' + rq.body.email, {email: rq.body.email, created: now ()});

         await sendmail ({
            to: CONFIG.email.address,
            subject: 'Vibey signup request',
            message: ['p', [
               'New signup request from: ' + rq.body.email,
               ['br'],
               now ()
            ]]
         });
      }

      reply (rs, 200, {admin: rq.body.email === CONFIG.admin ? true : undefined});
   }],

   ['post', 'auth/signup/accept', async function (rq, rs) {

      if (! rq.test && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      var existingUser = await redis ('get', 'email:' + rq.body.email);
      if (existingUser) return reply (rs, 409);

      var userId = crypto.randomUUID ();

      var invite = await redis ('hgetall', 'invite:' + rq.body.email);
      if (! invite) return reply (rs, 404);

      await redis ([
         ['set', 'email:' + rq.body.email, userId],
         ['del', 'invite:' + rq.body.email],
         ['hmset', 'user:' + userId, {
            created: now (),
            email: rq.body.email,
            id: userId,
            invite: invite.created,
         }],
      ]);

      reply (rs, 200);
   }],

   ['post', 'auth/login', async function (rq, rs) {

      if (await rateLimit ('login:' + rq.body.email, 5, 300)) return reply (rs, 403, {error: 'Rate limited'});

      var userId = await redis ('get', 'email:' + rq.body.email);
      if (! userId) return reply (rs, 403, {error: 'No such email'});

      var otp = String (crypto.randomInt (100000, 999999));

      await redis ('setex', 'otp:' + userId, 60 * 5, otp);

      if (! CONFIG.email.enable) clog ({type: 'New OTP', email: rq.body.email, otp});

      await sendmail ({
         to: rq.body.email,
         subject: 'Your Vibey login code',
         message: [
            ['p', ['Use this code to log in at ', ['a', {href: CONFIG.baseURL}, CONFIG.baseURL.replace (/^https?:\/\//, '')], ':']],
            ['p', {style: 'font-size: 24px; font-weight: bold; letter-spacing: 4px;'}, otp],
            ['p', 'This code expires in 5 minutes.']
         ]
      });

      if (rq.test) return reply (rs, 200, {otp: otp});

      reply (rs, 200);
   }],

   ['post', 'auth/verify', async function (rq, rs) {

      if (stop (rs, ['otp', rq.body.otp, 'string'])) return;

      if (await rateLimit ('verify:' + rq.body.email, 5, 300)) return reply (rs, 403, {error: 'Rate limited'});

      var userId = await redis ('get', 'email:' + rq.body.email);
      if (! userId) return reply (rs, 403, {error: 'No such email'});

      var otp = await redis ('get', 'otp:' + userId);
      if (rq.body.otp !== otp) return reply (rs, 403, {error: 'Invalid OTP', otp: rq.body.otp});

      var csrf      = crypto.randomBytes (32).toString ('hex');
      var sessionId = crypto.randomBytes (32).toString ('hex');

      await redis ([
         ['hmset',  'session:' + sessionId, {
            csrf,
            expires: new Date (Date.now () + CONFIG.cookie.expires * 1000).toISOString (),
            last: JSON.stringify ({
               date: now (),
               ip:   rs.log.origin
            }),
            user: userId
         }],
         ['sadd', 'owner:' + userId, 'session:' + sessionId],
         ['del', 'otp:' + userId, 'rateLimit:login:' + rq.body.email, 'rateLimit:verify:' + rq.body.email]
      ]);

      reply (rs, 200, {csrf, admin: rq.body.email === CONFIG.admin ? true : undefined}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, sessionId, {httponly: true, samesite: 'Lax', path: '/', expires: new Date (Date.now () + 1000 * 60 * 60 * 24 * 365 * 10)})});
   }],

   ['get', 'auth/list', async function (rq, rs) {

      reply (rs, 200, dale.go (await getForUser (rq.user.id, 'session'), function (session) {
         return {
            expired: new Date (session.expires).getTime () < new Date ().getTime (),
            last: JSON.parse (session.last)
         };
      }))
   }],

   ['post', 'auth/logout', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      await redis ([
         ['del', 'session:' + rq.user.session],
         ['srem', 'owner:' + rq.user.id, 'session:' + rq.user.session]
      ]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, false, {httponly: true, samesite: 'Lax', path: '/'})});
   }],

   ['post', 'auth/delete', async function (rq, rs) {
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

      await redis ('del', ...['user:' + rq.user.id, 'email:' + rq.user.email, 'owner:' + rq.user.id, ...keys]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, false, {httponly: true, samesite: 'Lax', path: '/'})});
   }],

   // *** PROJECT ***

   ['get', 'projects', async function (rq, rs) {
      reply (rs, 200, (await getForUser (rq.user.id, 'project')).sort (function (a, b) {
         return new Date (b.last) - new Date (a.last);
      }));
   }],

   ['post', 'project', async function (rq, rs) {

      if (stop (rs, [
         ['name', rq.body.name, 'string'],
         function () {
            return ['name', rq.body.name.length, {min: 2}, teishi.test.range];
         }
      ])) return;

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

      await redis ([
         ['hmset', 'project:' + project.id, project],
         ['sadd',  'owner:' + rq.user.id, 'project:' + project.id]
      ]);

      var containerId = 'vibey-project-' + project.id;

      await run ('docker', 'run', '-v', containerId + ':/project', '--name', containerId, '-d', 'vibey-project');

      await docker.run (project.id, 'git config --global init.defaultBranch main && git -C /project init && git -C /project config user.name vibey && git -C /project config user.email vibey@local', {catch: true});

      await docker.write (project.id, 'doc/main.md', '# ' + rq.body.name);

      reply (rs, 200, {id: project.id});
   }],

   ['put', 'project', async function (rq, rs) {

      if (stop (rs, [
         ['id', rq.body.id, 'string'],
         ['name', rq.body.name, 'string'],
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
         if (project.name === rq.body.name) return project;
      });
      if (conflict && conflict.id !== rq.body.id) return reply (rs, 409, {error: 'There is already a project with that name'});

      await redis ('hset', 'project:' + match.id, 'name', rq.body.name);

      reply (rs, 200);
   }],

   ['post', ['project/read', 'project/write', 'project/edit', 'project/run'], async function (rq, rs) {

      if (stop (rs, ['id', rq.body.id, 'string'])) return;

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.body.id) return project;
      });
      if (! match) return reply (rs, 404);

      rs.next ();
   }],

   ['post', 'project/read', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path', 'sha'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['sha', rq.body.sha, ['string', 'undefined'], 'oneOf'],
      ])) return;

      try {
         if (! rq.body.sha) var file = await docker.read (rq.body.id, rq.body.path);
         file = file.stdout;
      }
      catch (error) {
         clog (error);
         if (error.code === 1 && error.stderr.match ('No such file or directory')) return reply (rs, 404);
         throw error;
      }

      reply (rs, 200, file, {}, rq.body.path);
   }],

   ['post', 'project/write', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path', 'content', 'base64'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['content', rq.body.content, 'string'],
         ['base64', rq.body.base64, ['boolean', 'undefined'], 'oneOf'],
      ])) return;

      var content = rq.body.base64 ? Buffer.from (rq.body.content, 'base64') : rq.body.content;

      var result = await docker.write (rq.body.id, rq.body.path, content);

      reply (rs, 200, result);
   }],

   ['post', 'project/edit', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'path', 'oldText', 'newText'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['oldText', rq.body.oldText, 'string'],
         ['newText', rq.body.newText, 'string'],
      ])) return;

      var result = await docker.edit (rq.body.id, rq.body.path, rq.body.oldText, rq.body.newText);

      return reply (rs, result.error ? 400 : 200, result);
   }],

   ['post', 'project/run', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'command'], 'eachOf', teishi.test.equal],
         ['command', rq.body.command, 'string']
      ])) return;

      var result = await docker.run (rq.body.id, rq.body.command, {catch: true, commit: 'Run ' + Path.quote (rq.body.command)});

      reply (rs, 200, result);
   }],

   ['delete', 'project/:id', async function (rq, rs) {

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.data.params.id) return project;
      });
      if (! match) return reply (rs, 404);

      var containerId = 'vibey-project-' + rq.data.params.id;

      await run ('docker', 'stop', containerId);
      await run ('docker', 'rm', containerId);
      await run ('docker', 'volume', 'rm', containerId);

      await redis ([
         ['del',  'project:' + rq.data.params.id],
         ['srem', 'owner:' + rq.user.id, 'project:' + rq.data.params.id]
      ]);

      reply (rs, 200);
   }],

   // *** TESTS ***

   ['get', 'test', async function (rq, rs) {

      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      test ('all', function (error, rdata) {
         reply (rs, 200, cell.JSToText (error ? {error} : rdata));
      }, {cookie: rq.headers.cookie, csrf: rq.user.csrf}, redis, run);
   }],

   ['get', 'test.js', async function (rq, rs) {

      if (CONFIG.cloud && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Not admin'});

      // Cleanup before auth suite
      var testUserId = await redis ('get', 'email:hello@example.com');
      await redis ('del', 'invite:hello@example.com', 'email:hello@example.com', 'rateLimit:login:foo@example.com', 'rateLimit:verify:foo@example.com', 'rateLimit:login:hello@example.com', 'rateLimit:verify:hello@example.com', 'user:' + testUserId);

      cicek.file (rq, rs, 'test.js');
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
   clog ({type: type, priority: 'critical', ...error});
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
         rs: rs.log.responseBody === undefined ? 0 : JSON.stringify (rs.log.responseBody).length
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
