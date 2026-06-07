// *** CONFIG ***

var CONFIG = {
   cloud: false,
   cookie: {
      expires: 7 * 24 * 60 * 60,
      name:    'vibey'
   },
   port: 5353,
   redis: {
      db: 0
   }
}

// *** SETUP ***

var child   = require ('child_process')
var cluster = require ('cluster');
var util    = require ('util');

var dale   = require ('dale');
var teishi = require ('teishi');
var cicek  = require ('cicek');
var Redis  = require ('redis').createClient ({db: CONFIG.redis.db});

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

var {inc, last, type} = teishi;

var now = function () {
   return new Date ().toISOString ();
}

var clog = function () {
   if (arguments.length > 1 && type (arguments [0]) !== 'object') var log = {args: teishi.copy (args)};
   else var log = {message: arguments [0]};

   log = {t: now (), from: cicek.isMaster ? 'main' : ('worker' + cluster.worker.id), ...log};

   console.log (cell.JSToText (log) + '\n');
}

var reply = function (rs, code, body, headers) {
   if (! rs) return;
   if (rs.headersSent || rs.writableEnded || rs.destroyed || (rs.connection && rs.connection.writable === false)) {
      return clog ({priority: 'important', type: 'Interruped response', id: rq.log.id, method: rq.method, url: rq.url, origin: rq.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});
   }

   clog ({priority: code >= 400 ? 'important' : undefined, type: 'Response', id: rs.log.id, method: rs.log.method, url: rs.log.url, code: code, ms: Date.now () - rs.log.startTime, length: JSON.stringify (body).length, origin: rs.log.origin, userId: rs.rq.user ? rs.rq.user.id : 'anonymous'});

   return cicek.reply (rs, code, body, headers);
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
   if (simple (input)) input = [input];

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

var run = async function () {

   return new Promise (function (resolve) {

      if (type (last (arguments)) === 'object') {
         var command = teishi.copy (arguments).slice (0, -1);
         var options = last (arguments);
      }
      else var command = teishi.copy (arguments), options = {};

      var proc = child.spawn (command [0], commands.slice (1), options);

      var wait = 3, done = function () {
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
      dale.go (function (c) {
         m [c [0]].apply (m, c.slice (1));
      });
      return promise (m.exec.bind (m));
   }
   // Simple
   return promise (Redis [command].bind (Redis), [].slice.call (arguments, 1));
}

// *** ERRORS ***

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

      if (! CONFIG.cloud) return rs.next ();

      var sessionId = rq.data.cookie && rq.data.cookie [CONFIG.cookie.name] ? rq.data.cookie [CONFIG.cookiename] : undefined;

      if (sessionId) {
         var userId = await redis ('get', 'session:' + sessionId);

         if (userId) {

            var [user, csrf] = await redis ([
               ['hgetall', 'user:' + userId],
               ['get',     'csrf:' + sessionId],
            ]);

            if (! user || ! csrf) return reply (rs, 500, {priority: 'critical', type: 'User or CSRF token not found'});

            rq.user = {csrf, ...user};
         }
      }

      clog ({type: 'Request', id: rq.log.id, method: rq.method, url: rq.url, origin: rq.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});

      if (! rq.user) {
         var publicPath = dale.stop ([
            '/',
            'cclient.js',
            '/auth/signup',
            '/auth/login',
            '/auth/verify',
            /^\/public\//,
         ], true, function (path) {
            return !! rq.url.match (path);
         });

         if (! publicPath) return reply (rs, 403);
      }

      rs.next ();

      if (rq.user) await redis ([
         ['expire',  'csrf:'    + sessionId, CONFIG.cookie.expires],
         ['expire',  'session:' + sessionId, CONFIG.cookie.expires],
         ['hset',    'user:'    + userId, {seen: now ()}]
      ]);
   }],

   ['get', 'auth/csrf', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 200, {mode: 'LOCAL'});
      reply (rs, 200, {csrf: rq.user.csrf});
   }],

];

// *** SERVER ***

cicek.cluster ();

cicek.log = function (log) {
   if (log [0] === 'error') return clog ({priority: 'critical', type: log [1], error: log.slice (2)});
   if (log [0] === 'start') return clog ({priority: 'important', type: 'Server start', port: log [3]});
   // We ignore `request`, `response` and `incomingRequest`
}

var server = cicek.listen ({port: CONFIG.port}, routes);
