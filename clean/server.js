// *** CONFIG ***

var CONFIG = {
   admin: 'info@altocode.nl',
   baseURL: 'http://localhost:5353',
   cloud: false,
   cookie: {
      expires: 7 * 24 * 60 * 60,
      name:    'vibey'
   },
   email: {
      address: 'info@altocode.nl',
      disable: false,
      name: 'A friend from Vibey',
   },
   port: 5353,
   redis: {
      db: 0
   }
}

// *** SETUP ***

var child   = require ('child_process')
var cluster = require ('cluster');
var crypto  = require ('crypto');
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

var clog = function () {
   if (arguments.length > 1 || type (arguments [0]) !== 'object') var log = {args: teishi.copy (arguments)};
   else var log = arguments [0];

   log = {t: now (), from: cicek.isMaster ? 'main' : ('worker' + cluster.worker.id), ...log};

   console.log (cell.JSToText (log) + '\n');
}

var reply = function (rs, code, body, headers) {
   if (! rs) return;
   if (rs.headersSent || rs.writableEnded || rs.destroyed || (rs.connection && rs.connection.writable === false)) {
      return clog ({priority: 'important', type: 'Interrupted response', id: rs.log.id, method: rs.request.method, path: rs.request.url, origin: rs.log.origin, userId: rs.request.user ? rs.request.user.id : 'anonymous'});
   }

   return cicek.reply (rs, code, body, headers);
}

var validEmail = /^(?=[A-Z0-9][A-Z0-9@._%+-]{5,253}$)[A-Z0-9._%+-]{1,64}@(?:(?=[A-Z0-9-]{1,63}\.)[A-Z0-9]+(?:-[A-Z0-9]+)*\.){1,8}[A-Z]{2,63}$/i

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

var run = async function (...args) {

   if (type (last (args)) === 'object') {
      var command = teishi.copy (args).slice (0, -1);
      var options = last (args);
   }
   else var command = teishi.copy (args), options = {};

   return new Promise (function (resolve) {

      var proc = child.spawn (command [0], command.slice (1), options);

      var output = {stdout: '', stderr: ''};
      var wait = 3;
      var done = function () {
         if (--wait === 0) resolve (output);
      }

      dale.go (['stdout', 'stderr'], function (v) {
         proc [v].on ('data', function (chunk) {
            output [v] += chunk;
         });
         proc [v].on ('end', done);
      });

      proc.on ('error', function (error) {
         output.code  = -1;
         output.error = formatError (error);
         done ();
      });
      proc.on ('exit', function (code, signal) {
         output.code   = code;
         output.signal = signal;
         done ();
      });
   });
}

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

// *** EMAIL ***

var sendmail = function (options) {
   return new Promise (function (resolve, reject) {
      if (! CONFIG.cloud || CONFIG.email.disable) {
         clog ({type: 'Skipping email', to: to, subject: options.subject});
         return resolve ();
      }
      mailer.sendMail ({
         from:    CONFIG.email.name + ' <' + CONFIG.email.address + '>',
         to:      to,
         replyTo: CONFIG.email.address,
         subject: options.subject,
         html:    lith.g (options.message)
      }, function (error) {
         if (error) reject (error);
         else       resolve ();
      });
   });
};

// *** ERROR ***

var fatal = function (type, error) {
   clog ({type: type, priority: 'critical', ...error});
   process.exit (1);
}

process.on ('uncaughtException', function (error, origin) {
   fatal ('Uncaught exception', {error: formatError (error), origin});
});

process.on ('unhandledRejection', function (error) {
   fatal ('Uncaught promise rejection', {error: formatError (error)});
});

// *** ROUTES ***

var routes = [

   // *** GATEKEEPER ***

   ['all', '*', async function (rq, rs) {

      if (! CONFIG.cloud) {
         clog ({type: 'Request', id: rs.log.id, method: rq.method, url: rq.url, origin: rs.log.origin});
         return rs.next ();
      }

      var session = rq.data.cookie && rq.data.cookie [CONFIG.cookie.name] ? rq.data.cookie [CONFIG.cookiename] : undefined;

      if (session) {
         var userId = await redis ('get', 'session:' + session);

         if (userId) {

            var [user, csrf] = await redis ([
               ['hgetall', 'user:' + userId],
               ['get',     'csrf:' + session],
            ]);

            if (! user || ! csrf) return reply (rs, 500, {priority: 'critical', type: 'User or CSRF token not found'});

            rq.user = {csrf, session, ...user};
         }
      }

      clog ({type: 'Request', id: rs.log.id, method: rq.method, url: rq.url, origin: rs.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});

      if (rq.user && inc (['get', 'post', 'delete'], rq.method) && rq.headers ['x-csrf'] !== csrf) return reply (rs, 403, {error: 'csrf'});

      if (! rq.user) {
         var publicPath = dale.stop ([
            ['get', '/'],
            ['get', 'cclient.js'],
            ['post', '/auth/signup'],
            ['post', '/auth/login'],
            ['post', '/auth/verify'],
            ['get', /^\/public\//],
         ], true, function (endpoint) {
            if (type (endpoint [1]) === 'string') endpoint [1] = new RegExp (cicek.escape ('^' + endpoint [1] + '$'));
            return rq.method === endpoint [0] && !! rq.url.match (endpoint [1]);
         });

         if (! publicPath) return reply (rs, 403);
      }

      rs.next ();

      if (rq.user) await redis ([
         ['expire',  'csrf:'    + session, CONFIG.cookie.expires],
         ['expire',  'session:' + session, CONFIG.cookie.expires],
         ['hset',    'user:'    + userId, {seen: now ()}]
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
            ['link', {rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'}],
            ['link', {rel: 'stylesheet', href: 'https://unpkg.com/tachyons@4.12.0/css/tachyons.min.css'}],
            ['link', {rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css'}],
         ]],
         ['body', [
            ['script', {src: 'gotoB.min.js'}],
            ['script', {src: 'marked.umd.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],
   ['get', 'gotoB.min.js', cicek.file, 'node_modules/gotob/gotoB.min.js'],
   ['get', 'marked.umd.js', cicek.file, 'node_modules/marked/lib/marked.umd.js'],
   ['get', 'client.js', cicek.file],

   // *** AUTH ***

   ['get', 'auth/csrf', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 200, {mode: 'local'});
      reply (rs, 200, {admin: rq.user.email === CONFIG.admin ? true : undefined, csrf: rq.user.csrf});
   }],

   ['post', 'auth/signup', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      if (stop (rs, [
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         }
      ])) return;

      await redis ('hmset', 'invite:' + email, {email: email, created: now ()});

      await sendmail (CONFIG.adminEmail, {
         to: CONFIG.email.address,
         subject: 'Vibey signup request',
         message: ['p', [
            'New signup request from: ' + email,
            ['br'],
            now ()
         ]]
      });

      reply (rs, 200, {ok: true});
   }],

   ['post', 'auth/signup/accept', async function (rq, rs) {

      if (rq.user.email !== CONFIG.admin) return reply (rs, 403);

      var userId = crypto.randomUUID ();

      await redis ('hmset', 'user:' + userId, {
         id: userId,
         email: rq.body.email,
         created: now (),
      });

      reply (rs, 200);
   }],

   ['post', 'auth/login', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404);

      if (stop (rs, [
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         }
      ])) return;

      var userId = await redis ('get', 'email:' + rq.body.email.toLowerCase ());
      if (! userId) return reply (rs, 403);

      var otp = String (crypto.randomInt (100000, 999999));

      await redis ('setex', 'otp:' + userId, 60 * 5, otp);

      await sendmail ({
         from: rq.body.email,
         subject: 'Your Vibey login code',
         message: [
            ['p', ['Use this code to log in at ', ['a', {href: CONFIG.baseURL}, CONFIG.baseURL.replace (/^https?:\/\//, '')], ':']],
            ['p', {style: 'font-size: 24px; font-weight: bold; letter-spacing: 4px;'}, otp],
            ['p', 'This code expires in 5 minutes.']
         ]
      });

      reply (rs, 200, {ok: true});
   }],

   ['post', 'auth/verify', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404);

      if (stop (rs, [
         ['email', rq.body.email, 'string'],
         function () {
            return ['email', rq.body.email, validEmail, teishi.test.match];
         },
         ['otp', rq.body.otp, 'string'],
      ])) return;

      var userId = await redis ('get', 'email:' + rq.body.email.toLowerCase ());
      if (! userId) return reply (rs, 403);

      var [otp] = await redis ([
         ['get', 'otp:' + userId],
         ['del', 'otp:' + userId]
      ]);
      if (rq.body.otp !== otp) return reply (rs, 403);

      var csrf    = crypto.randomBytes (bytes || 32).toString ('hex');
      var session = crypto.randomBytes (bytes || 32).toString ('hex');

      await redis ([
         ['setex', 'session:' + session, CONFIG.cookie.expires, userId],
         ['setex', 'csrf:'    + session, CONFIG.cookie.expires, csrf],
      ]);

      reply (rs, 200, {csrf}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, session, {httponly: true, samesite: 'Lax', path: '/', expires: new Date (Date.now () + 1000 * 60 * 60 * 24 * 365 * 10)})});

   }],

   ['post', 'auth/logout', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404);

      await redis ([
         ['del:', 'csrf:'    + sessionId],
         ['del:', 'session:' + sessionId],
      ]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (CONFIG.cookie.name, false, {httponly: true, samesite: 'Lax', path: '/'})});
   }],

];

// *** SERVER ***

cicek.cluster ();

cicek.log = function (log) {
   if (log [0] === 'error') return clog ({priority: 'critical', type: log [1], error: log.slice (2)});
   if (log [0] === 'start') return clog ({priority: 'important', type: 'Server start', port: log [3]});
   // We ignore `request`, `response` and `incomingRequest`
}

cicek.apres = function (rs) {
   clog ({priority: rs.log.code >= 400 ? 'important' : undefined, type: 'Response', id: rs.log.id, method: rs.log.method, path: rs.log.url, code: rs.log.code, ms: Date.now () - rs.log.startTime, length: {rq: rs.log.requestBody === '' ? 0 : JSON.stringify (rs.log.requestBody).length, rs: rs.log.responseBody === undefined ? 0 : JSON.stringify (rs.log.responseBody).length}, origin: rs.log.origin, userId: ! CONFIG.cloud ? undefined : (rs.request.user ? rs.request.user.id : 'anonymous')});
   cicek.Apres (rs);
}

var server = cicek.listen ({port: CONFIG.port}, routes);
