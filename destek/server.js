// *** CONFIG ***

var fs = require ('fs');
var cell = require ('./cell.js');

var CONFIG = cell.textToJS (fs.readFileSync ('config.4tx', 'utf8'));

// *** LIBRARIES ***

var cluster = require ('cluster');
var Path    = require ('path');
var sqlite  = require ('node:sqlite');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');

var {inc, type} = teishi;

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

// Token users carry their secret in their id, so logs show 'token' instead.
var logUser = function (user, fallback) {
   if (! user) return fallback;
   return user.token ? 'token' : user.id;
}

var reply = function () {
   var args = arguments;
   var [rs, code, body, headers, contentType] = dale.go (dale.times (5, arguments [0].writable === undefined ? 1 : 0), function (k) {
      return args [k];
   });

   if (rs.headersSent || rs.writableEnded || rs.destroyed || (rs.connection && rs.connection.writable === false)) {
      return clog ({priority: 'important', type: 'Interrupted response', rqId: rs.log.id, method: rs.request.method, path: rs.request.url, ip: rs.log.origin, userId: logUser (rs.request.user, 'anonymous')});
   }

   return cicek.reply (rs, code, body, headers, contentType);
}

var formatError = function (error) {
   if (! (error instanceof Error)) return error;
   return {error: error.name, message: error.message, stack: error.stack.split ('\n')};
}

var fourdata = function (value) {
   if (inc (['integer', 'float', 'string'], type (value))) return true;
   if (! inc (['array', 'object'], type (value))) return false;
   return dale.stop (value, false, fourdata) !== false;
}

var validTags = function (tags) {
   if (type (tags) !== 'array' || new Set (tags).size !== tags.length) return false;
   return dale.stop (tags, false, function (tag) {
      return inc (['integer', 'float', 'string'], type (tag));
   }) !== false;
}

var nginx = /^(\S+) \S+ (\S+) \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})\] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;

var isoDate = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?/;

var toISO = function (text) {
   var date = new Date (text);
   return isNaN (date) ? undefined : date.toISOString ();
}

var dash = function (value) {
   return value === '-' ? undefined : value;
}

var parseLine = function (line) {
   if (line.trim () [0] === '{') {
      try {
         var json = JSON.parse (line);
         if (type (json) === 'object' && fourdata (json)) return {... parseEntry (json), raw: line};
      }
      catch (error) {}
   }
   var match = line.match (nginx);
   if (match) {
      var request = match [8].match (/^(\S+) (\S+) (\S+)$/);
      return {
         t: toISO (match [3] + ' ' + match [4] + ' ' + match [5] + ' ' + match [6] + ' ' + match [7]) || now (),
         tags: ['nginx'],
         fields: {
            bytes: match [10] === '-' ? undefined : Number (match [10]),
            code: Number (match [9]),
            ip: match [1],
            method: request ? request [1] : undefined,
            path: request ? request [2] : undefined,
            protocol: request ? request [3] : undefined,
            referer: dash (match [11]),
            request: request ? undefined : match [8],
            ua: dash (match [12]),
            user: dash (match [2]),
         },
         raw: line
      };
   }
   match = line.match (isoDate);
   return {t: (match && toISO (match [1] + 'T' + match [2] + (match [3] || 'Z'))) || now (), tags: [], fields: {}, raw: line};
}

var parseEntry = function (entry) {
   if (type (entry) === 'string') return parseLine (entry);
   var t = now (), tags = [], fields = {... entry};
   if (type (entry.t) === 'string' && ! isNaN (new Date (entry.t))) {
      t = new Date (entry.t).toISOString ();
      delete fields.t;
   }
   if (validTags (entry.tags)) {
      tags = entry.tags;
      delete fields.tags;
   }
   return {t: t, tags: tags, fields: fields, raw: JSON.stringify (entry)};
}

// *** DB ***

var DATA = Path.join (__dirname, 'data');
fs.mkdirSync (DATA, {recursive: true});

var dbs = {};

var db = function (day) {
   if (dbs [day]) return dbs [day];
   dbs [day] = new sqlite.DatabaseSync (Path.join (DATA, day + '.sqlite'));
   dbs [day].exec ('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
   dbs [day].exec ('CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY, t TEXT NOT NULL, tags TEXT NOT NULL, fields TEXT NOT NULL, raw TEXT NOT NULL)');
   return dbs [day];
}

// *** ROUTES ***
var routes = [
   ['get', '/', reply, lith.g ([
      ['!DOCTYPE HTML'],
      ['html', [
         ['head', [
            ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
            ['meta', {charset: 'utf-8'}],
            ['title', 'destek'],
            ['link', {rel: 'stylesheet', href: 'assets/tachyons/css/tachyons.min.css'}],
         ]],
         ['body', [
            ['script', {src: 'assets/gotob/gotoB.min.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],
   ['get', '/assets/*', function (rq, rs) {
      if (/\.\./.test (rq.url)) return reply (rs, 400, 'No dots (..) allowed');
      cicek.file (rq, rs, rq.url.replace (/^\/assets\//, ''), ['node_modules']);
   }],
   ['get', '/client.js', cicek.file],

   ['post', '/log', function (rq, rs) {
      var entries = [];
      dale.go (type (rq.body) === 'array' ? rq.body : [rq.body], function (entry) {
         if (type (entry) !== 'string') return entries.push (entry);
         dale.go (entry.split ('\n'), function (line) {
            if (line.trim ()) entries.push (line);
         });
      });
      if (entries.length === 0) return reply (rs, 400, {error: 'No entries'});

      var invalid = dale.stopNot (entries, undefined, function (entry, k) {
         if (type (entry) !== 'string' && (type (entry) !== 'object' || ! fourdata (entry))) return k;
      });
      if (invalid !== undefined) return reply (rs, 400, {error: 'Invalid entry', index: invalid});

      var days = {};
      dale.go (entries, function (entry) {
         entry = parseEntry (entry);
         var day = entry.t.slice (0, 10);
         (days [day] = days [day] || []).push (entry);
      });

      dale.go (days, function (entries, day) {
         var insert = db (day).prepare ('INSERT INTO log (t, tags, fields, raw) VALUES (?, ?, ?, ?)');
         db (day).exec ('BEGIN');
         dale.go (entries, function (entry) {
            insert.run (entry.t, JSON.stringify (entry.tags), JSON.stringify (entry.fields), entry.raw);
         });
         db (day).exec ('COMMIT');
      });

      reply (rs, 200, {count: entries.length});
   }],

   ['get', '/log', function (rq, rs) {
      var params = rq.data.query || {};
      var query = params.query;
      if (type (query) !== 'string' || query.length === 0 || query.length > 8192) return reply (rs, 400, {error: 'query must be a SQL string of up to 8192 characters'});

      var limit = params.limit === undefined ? 100 : Number (params.limit);
      if (! Number.isInteger (limit) || limit < 1 || limit > 1000) return reply (rs, 400, {error: 'limit must be an integer between 1 and 1000'});
      var offset = params.offset === undefined ? 0 : Number (params.offset);
      if (! Number.isInteger (offset) || offset < 0) return reply (rs, 400, {error: 'offset must be a non-negative integer'});
      if (params.day !== undefined && ! /^\d{4}-\d{2}-\d{2}$/.test (params.day)) return reply (rs, 400, {error: 'day must be YYYY-MM-DD'});

      var days = dale.fil (fs.readdirSync (DATA).sort ().reverse (), undefined, function (file) {
         var day = (file.match (/^(\d{4}-\d{2}-\d{2})\.sqlite$/) || []) [1];
         if (day && (params.day === undefined || day <= params.day)) return day;
      });

      var rows = [], next;
      try {
         dale.stop (days, true, function (day, k) {
            var skip = day === params.day ? offset : 0;
            var need = limit - rows.length;
            var reader = new sqlite.DatabaseSync (':memory:');
            try {
               reader.exec ("ATTACH DATABASE '" + Path.join (DATA, day + '.sqlite') + "' AS d");
               reader.exec ("CREATE TEMP VIEW logs AS SELECT '" + day + "' AS day, * FROM d.log");
               reader.exec ('PRAGMA query_only = ON');
               var found = reader.prepare ('SELECT * FROM (' + query + ') LIMIT ? OFFSET ?').all (need + 1, skip);
            }
            finally {
               reader.close ();
            }
            rows = rows.concat (found.slice (0, need));
            if (found.length > need) next = {day: day, offset: skip + need};
            else if (rows.length === limit && days [k + 1]) next = {day: days [k + 1], offset: 0};
            return next !== undefined;
         });
      }
      catch (error) {
         return reply (rs, 400, {error: error.message});
      }

      reply (rs, 200, {rows: rows, next: next});
   }],
]

// *** SERVER ***

var exiting;

dale.go (['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2', 'SIGPIPE', 'SIGALRM'], function (signal) {
   process.on (signal, function () {
      clog ({type: 'Signal received', priority: 'important', signal: signal});
      if (inc (['SIGTERM', 'SIGINT'], signal)) {
         exiting = true;
         process.exit (0);
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
