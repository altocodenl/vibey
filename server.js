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

var CONFIG = cell.textToJS (fs.readFileSync ('config.4tx', 'utf8'));

try {
   var SECRET = cell.textToJS (fs.readFileSync ('secret.4tx', 'utf8'));
}
catch (error) {
   console.log (error);
   var SECRET = {};
}

// *** LIBRARIES ***

var child   = require ('child_process')
var cluster = require ('cluster');
var crypto  = require ('crypto');
var decoder = require ('string_decoder');
var events  = require ('events');
var Path    = require ('path');
var stream  = require ('stream');
var util    = require ('util');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');
var Redis  = require ('redis').createClient ({db: CONFIG.redis?.db});

var aws4  = require ('aws4');
var mime  = require ('mime');
var hitit = require ('hitit');
var marked = require ('marked');

var {inc, last, type} = teishi;

// *** TEST ***

var test = require ('./test.js');

// *** HELPERS ***

var cookie = function (type) {
   return '__Host-' + CONFIG.cookie.name + '-' + type;
}

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

var validUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

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

var run = async function (... args) {

   if (type (last (args)) === 'object') var command = args.slice (0, -1), options = last (args);
   else                                 var command = args,               options = {};

   var id = cicek.pseudorandom (), t = Date.now (), output = {};

   clog ({type: 'Command request', id, command: command.join (' ')});

   return new Promise (function (resolve, reject) {

      var onError = function (error) {
         output.code = -1;
         output.error = output.error ? [].concat (output.error, formatError (error)) : formatError (error);
      }

      var proc = child.spawn (command [0], command.slice (1), options);
      if (options.onSpawn) options.onSpawn (proc);

      if (options.input !== undefined) {
         proc.stdin.write (options.input);
         proc.stdin.end ();
         proc.stdin.on ('error', onError);
      }

      dale.go (['stdout', 'stderr'], function (k) {
         proc [k].on ('error', onError);

         if (type (options [k]) === 'object' && type (options [k].write) === 'function') {
            var stop = function () {
               if (proc.exitCode === null && proc.signalCode === null) proc.kill ();
            };
            options [k].on ('close', stop);
            options [k].on ('error', function (error) {
               onError (error);
               stop ();
            });
            proc [k].pipe (options [k], {end: false});
         }

         else if (type (options [k]) === 'function') {
            proc [k].setEncoding ('utf8');
            return proc [k].on ('data', options [k]);
         }

         else proc [k].on ('data', function (chunk) {
            if (output [k] === undefined) output [k] = [];
            output [k].push (chunk);
         });
      });

      proc.on ('error', onError);
      proc.on ('close', function (code, signal) {
         if (code !== null && output.code === undefined) output.code = code;
         if (signal !== null) output.signal = signal;

         dale.go (['stdout', 'stderr'], function (k) {
            if (output [k] === undefined) return;
            output [k] = Buffer.concat (output [k]);
            if (options [k] === undefined) output [k] = output [k].toString ('utf8');
         });

         clog ({type: 'Command response', id, command: command.join (' '), ms: Date.now () - t, ... dale.obj (output, function (v, k) {
            if (k === 'stdout' || options [k] === 'buffer') v = '[' + Buffer.byteLength (v) + ' bytes]';
            return [k, v];
         })});

         if (output.code === 0 || options.catch) resolve (output);
         else reject (output);
      });

   });
}

var lock = async function (key, ttl, interval) {
   while (! await redis ('set', key, '1', 'NX', 'EX', ttl)) {
      await new Promise (function (resolve) {setTimeout (resolve, interval || 50)});
   }
}

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

// *** MODELS & SYSTEM PROMPT ***

var models = [
   {provider: 'openai',    model: 'gpt-6',   canonical: 'gpt-6-astra',    window: 1050000, priceCache: 1,   priceIn: 10, priceOut: 50},
   {provider: 'openai',    model: 'gpt-5.6', canonical: 'gpt-5.6-sol',    window: 1050000, priceCache: 0.4, priceIn: 4,  priceOut: 20},
   {provider: 'openai',    model: 'gpt-4.1', canonical: 'gpt-4.1',        window: 1047576, priceCache: 0.5, priceIn: 2,  priceOut: 8, requireAPIKey: true},
   {provider: 'anthropic', model: 'opus-5.5', canonical: 'claude-opus-5-5', window: 1000000, priceCache: 0.2, priceIn: 4,  priceOut: 20},
   {provider: 'anthropic', model: 'opus-4.6', canonical: 'claude-opus-4-6', window: 1000000, priceCache: 0.5, priceIn: 5,  priceOut: 25},
];

var systemPrompt = fs.readFileSync ('prompt.md', 'utf8').replace ('AI_TARGETS', dale.go (models, function (m) {return 'ai-' + m.model}).join (', '));
var agentSource = fs.readFileSync ('agent.js', 'utf8');
var projectDockerfile = fs.readFileSync ('Dockerfile.vibey-project', 'utf8');

// *** AUTH HELPERS ***

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

   var results = await redis (dale.go (items, function (item) {
      return ['hgetall', item];
   }));
   if (entity === 'project') {
      var writable = dale.obj (dale.fil (grants, undefined, function (grant) {
         var [verb, id] = grant.split (':');
         if (verb === 'write') return id;
      }), function (id) {
         return [id, true];
      });
      dale.go (results, function (project) {
         project.read = project.owner !== userId && ! writable [project.id] ? true : undefined;
      });
   }
   return results;
}

var setUsername = async function (id, value, generate) {
   var candidates, fallback, number = 0;
   if (generate) {
      var normalize = function (text) {
         text = text.toLowerCase ().replace (/[^a-z0-9]+/g, '-').replace (/^-+|-+$/g, '') || 'user';
         text = text.padEnd (3, '1');
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
}

// *** PROJECT ***

var project = {};

var agents = {};

project.agentRun = function (id, command, options, docker) {
   var agent = agents [id];
   if (! agent) {
      agent = agents [id] = {
         buffer: Buffer.alloc (0),
         next: 0,
         proc: child.spawn (docker [0], [... docker.slice (1), 'exec', '-i', id, 'node', '-e', docker [0] === 'ssh' ? Path.quote (agentSource) : agentSource]),
         runs: {},
         stderr: [],
      };
      agent.proc.on ('error', function () {});
      agent.proc.stdin.on ('error', function () {});
      agent.proc.stderr.on ('data', function (chunk) {
         agent.stderr.push (chunk);
      });
      agent.proc.stdout.on ('data', function (chunk) {
         agent.buffer = Buffer.concat ([agent.buffer, chunk]);
         if (agent.buffer.length >= 9 && agent.buffer.readUInt32BE (5) > 16 * 1024 * 1024) return agent.proc.kill ('SIGKILL');
         while (agent.buffer.length >= 9 && agent.buffer.length >= 9 + agent.buffer.readUInt32BE (5)) {
            var end = 9 + agent.buffer.readUInt32BE (5), entry = agent.runs [agent.buffer.readUInt32BE (1)];
            try {
               if (entry) entry.onFrame (String.fromCharCode (agent.buffer [0]), agent.buffer.subarray (9, end));
            }
            catch (error) {
               return agent.proc.kill ('SIGKILL');
            }
            agent.buffer = agent.buffer.subarray (end);
         }
      });
      agent.proc.on ('close', function () {
         if (agents [id] === agent) delete agents [id];
         var stderr = Buffer.concat (agent.stderr).toString ();
         dale.go (agent.runs, function (entry) {
            entry.onLost (stderr);
         });
      });
   }
   clearTimeout (agent.idle);
   var runId = agent.next++, output = {}, done;
   var send = function (kind, payload, callback) {
      payload = Buffer.from (payload || '');
      var head = Buffer.alloc (9);
      head.write (kind);
      head.writeUInt32BE (runId, 1);
      head.writeUInt32BE (payload.length, 5);
      agent.proc.stdin.write (Buffer.concat ([head, payload]), function () {if (callback) callback ()});
   };
   var decoders = {
      stderr: new decoder.StringDecoder ('utf8'),
      stdout: new decoder.StringDecoder ('utf8'),
   };

   var proc = new events.EventEmitter ();
   proc.exitCode = null;
   proc.signalCode = null;
   proc.stderr = new events.EventEmitter ();
   proc.stdout = new events.EventEmitter ();
   proc.stdin = new stream.Writable ({
      final: function (callback) {
         send ('I', '', callback);
      },
      write: function (chunk, encoding, callback) {
         var i = 0;
         do send ('i', chunk.subarray (i, i + 65536), i + 65536 >= chunk.length ? callback : undefined);
         while ((i += 65536) < chunk.length);
      },
   });
   proc.kill = function (signal) {
      if (! done) send ('k', JSON.stringify ({signal: signal || 'SIGTERM'}));
   };

   var deliver = function (k, chunk) {
      proc [k].emit ('data', chunk);
      var target = options [k];
      var credit = function () {
         if (! done) send ('c', JSON.stringify ({bytes: chunk.length}));
      };
      if (type (target) === 'object' && type (target.write) === 'function') {
         if (target.write (chunk)) credit ();
         else target.once ('drain', credit);
         return;
      }
      if (type (target) === 'function') target (decoders [k].write (chunk));
      else (output [k] = output [k] || []).push (chunk);
      credit ();
   };

   return new Promise (function (resolve, reject) {
      var finish = function (exit) {
         done = true;
         delete agent.runs [runId];
         if (! Object.keys (agent.runs).length) agent.idle = setTimeout (function () {
            if (agents [id] === agent) delete agents [id];
            agent.proc.stdin.end ();
         }, 60000);
         Object.assign (output, exit);
         dale.go (['stdout', 'stderr'], function (k) {
            if (output [k] === undefined) return;
            output [k] = Buffer.concat (output [k]);
            if (options [k] === undefined) output [k] = output [k].toString ('utf8');
         });
         proc.exitCode = output.code === undefined ? null : output.code;
         proc.signalCode = output.signal || null;
         proc.emit ('exit', proc.exitCode, proc.signalCode);
         proc.emit ('close', proc.exitCode, proc.signalCode);
         if (output.code === 0 || options.catch) resolve (output);
         else reject (output);
      };

      dale.go (['stdout', 'stderr'], function (k) {
         var target = options [k];
         if (type (target) !== 'object' || type (target.write) !== 'function') return;
         target.on ('close', function () {proc.kill ()});
         target.on ('error', function () {proc.kill ()});
      });

      agent.runs [runId] = {
         onFrame: function (kind, payload) {
            if (kind === 's') {
               proc.pid = JSON.parse (payload).pid;
               if (options.onSpawn) options.onSpawn (proc);
            }
            if (kind === 'o') deliver ('stdout', payload);
            if (kind === 'e') deliver ('stderr', payload);
            if (kind === 'x') finish (JSON.parse (payload));
         },
         onLost: function (stderr) {
            finish ({code: -1, error: {error: 'AgentExited', stderr: stderr}});
         },
      };

      send ('r', JSON.stringify ({command: command, cwd: options.cwd, env: options.env}));
      if (options.input !== undefined) proc.stdin.end (options.input);
   });
};

var validProjectPath = function (path) {
   return type (path) === 'string' &&
      ! path.startsWith ('/') &&
      ! /[\\\x00-\x1f\x7f]/.test (path) &&
      ! path.includes ('//') &&
      ! dale.stop (path.split ('/'), true, function (part) {
         return part === '.' || part === '..';
      });
};

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
      prefix === 'vibey/access.md' ? ['smembers', 'accessTo:' + userId] : ['sunion', 'accessTo:' + userId, 'accessTo:PUBLIC']
   ]);
   if (! owner) return false;
   if (owner === userId) return true;

   return !! dale.stop (grants, true, function (grant) {
      var [verb, id, ... parts] = grant.split (':');
      if (id !== projectId) return;
      if (verb !== 'write' && verb !== op) return;

      var scope = parts.join (':');
      if (type (prefix) === 'string' && inc (prefix.split ('/'), '.git')) return verb === 'write' && ! scope;
      return ! scope || (type (prefix) === 'string' && (scope.startsWith ('APP:') ? prefix === scope : ! /^APP:\d+$/.test (prefix) && prefix.startsWith (scope)));
   });
}

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
}

project.access = async function (proj) {
   var id = proj.id;
   var file = await project.read (proj, '/project/vibey/access.md');
   if (file.code) return file;

   var invalidEntry;
   var entries = dale.fil (file.stdout.split (/\r?\n/), undefined, function (line) {
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
}

Path.quote = function (path) {
   return "'" + path.replace (/'/g, "'\\''") + "'";
}

project.remote = async function (proj) {
   if (! proj.engine) return {command: ['docker'], cleanup: function () {}};
   var engine = await redis ('hgetall', 'engine:' + proj.engine);
   var keyFile = '/tmp/vibey-engine-' + proj.engine + '-' + process.pid + '-' + Math.random ().toString (36).slice (2);
   await dale.async ({[keyFile]: engine.privateKey, [keyFile + '.known']: engine.knownHost}, function (content, path) {
      return fs.promises.writeFile (path, content.trim () + '\n', {mode: 0o600});
   }, {concurrent: 2});
   return {
      command: ['ssh', '-i', keyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + keyFile + '.known', '-o', 'ControlMaster=auto', '-o', 'ControlPath=/tmp/vibey-ssh-' + proj.engine, '-o', 'ControlPersist=10m', '-o', 'LogLevel=ERROR', 'root@' + engine.ip, 'docker'],
      cleanup: function () {
         dale.async ([keyFile, keyFile + '.known'], function (path) {
            return fs.promises.rm (path, {force: true});
         }, {concurrent: 2}).catch (function () {});
      }
   };
}

project.remove = async function (proj) {
   var id = 'vibey-project-' + proj.id;
   var remote = await project.remote (proj);
   var docker = remote.command;

   var noSuchContainer = function (result) {
      return result.code && result.stderr && result.stderr.match (/No such container|is not running/);
   }

   try {
      var stop = await run (... docker, 'stop', id, {catch: true});
      if (stop.code && ! noSuchContainer (stop)) throw stop;

      var rm = await run (... docker, 'rm', id, {catch: true});
      if (rm.code && ! noSuchContainer (rm)) throw rm;

      await run (... docker, 'volume', 'rm', id);
   }
   finally {
      remote.cleanup ();
   }
}

project.run = async function (proj, command, options) {
   var id = 'vibey-project-' + proj.id;
   if (type (command) === 'array') command = command.join (' ');
   var remote = await project.remote (proj);
   var docker = remote.command;

   try {
      var result = await project.agentRun (id, ['sh', '-c', command], {... options, 'catch': true}, docker);
      if (result.error && result.error.error === 'AgentExited' && result.error.stderr.match (/^Error response from daemon: (?:container .+ is not running|No such container)/)) {
         if (proj.engine) await run (... docker, 'network', 'create', '-o', 'com.docker.network.bridge.enable_icc=false', 'vibey-projects', {catch: true});
         var recreate = await run (... docker, 'run', '--init', '--network', 'vibey-projects', '-v', id + ':/project', '--name', id, '-d', 'vibey-project', {catch: true});
         if (proj.engine && recreate.code && /Unable to find image 'vibey-project:/.test (recreate.stderr)) {
            var build = await run (... docker, 'build', '-t', 'vibey-project', '-', {input: projectDockerfile, catch: true});
            return build.code ? result : project.run (proj, command, options);
         }
         if (recreate.code) {
            var restart = await run (... docker, 'start', id, {catch: true});
            if (restart.code) return result;
         }
         return project.run (proj, command, options);
      }
   }
   finally {
      remote.cleanup ();
   }
   if (result.code && ! (options && options.catch)) throw result;

   // Commits run in the background, one at a time per project, after the command that caused them completes.
   var commit = options && options.commit;
   if (commit && ! result.code) (async function () {
      var lockKey = 'lock:commit:' + proj.id;
      await lock (lockKey, 60);
      try {
         var committed = await project.run (proj, 'git add -A && (git diff --cached --quiet || (git commit -q -m ' + Path.quote (commit) + ' && git rev-parse HEAD))', {catch: true});
         if (committed.code) return clog ({type: 'Commit error', id: proj.id, message: commit, error: committed.stderr});
         if (committed.stdout) await project.backup (proj);
      }
      finally {
         await redis ('del', lockKey);
      }
   }) ().catch (function (error) {
      clog ({type: 'Commit error', id, message: commit, error: formatError (error)});
   });

   return result;
}

project.read = async function (proj, path, mode) {
   var result = await project.run (proj, 'cat ' + Path.quote (path), {catch: true, stdout: mode});
   return result.code ? {code: result.code, error: result.stderr} : {stdout: result.stdout || (mode === 'buffer' ? Buffer.alloc (0) : '')};
}

project.media = async function (rq, rs, proj, path) {
   var quoted = Path.quote (path);
   var stat = await project.run (proj, 'test -f ' + quoted + ' || exit 44; wc -c < ' + quoted, {catch: true});
   if (rs.destroyed) return;
   if (stat.code === 44) return reply (rs, 404, fourohfour, 'html');
   if (stat.code) return reply (rs, 500);
   var size = Number (stat.stdout), start = 0, end = size - 1, code = 200;
   if (! Number.isSafeInteger (size) || size < 0) return reply (rs, 500);
   var headers = {
      'access-control-allow-origin': '*',
      'content-type': mime.lookup (path) || 'application/octet-stream',
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'",
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
   var length = size ? end - start + 1 : 0, sent = 0;
   headers ['content-length'] = length;
   var script = [
      'if (Number (process.argv [3]) < 0) process.exit (0);',
      'var stream = require ("fs").createReadStream (process.argv [1], {start: Number (process.argv [2]), end: Number (process.argv [3])});',
      'stream.on ("error", function () {process.exit (1)});',
      'process.stdout.on ("error", function () {process.exit (1)});',
      'stream.pipe (process.stdout);',
   ].join ('\n');
   var begin = function () {
      rs.log.code = code;
      rs.log.responseBody = length;
      rs.log.responseHeaders = headers;
      rs.writeHead (code, headers);
   };
   var result = await project.run (proj, 'node -e ' + Path.quote (script) + ' ' + Path.quote (path) + ' ' + start + ' ' + end, {
      catch: true,
      stdout: rs,
      onSpawn: function (proc) {
         proc.stdout.on ('data', function (chunk) {
            sent += chunk.length;
            if (! rs.destroyed && ! rs.headersSent) begin ();
         });
      },
   });
   if (rs.destroyed) return;
   if (result.code !== 0 || sent !== length) return rs.headersSent ? rs.destroy () : reply (rs, 500);
   if (! rs.headersSent) begin ();
   rs.end (function () {cicek.apres (rs)});
}

project.write = async function (proj, path, content, noCommit) {
   // Writes go through a rename, since truncating a file that a concurrent git add is reading crashes git (SIGBUS).
   var command = 'tmp=$(mktemp -d /project/.git/vibey.XXXXXX) || exit 1;'
      + ' trap \'rm -rf "$tmp"\' 0;'
      + ' mkdir -p ' + Path.quote (Path.dirname (path)) + ' && cat > "$tmp/out"'
      + ' && { ! [ -e ' + Path.quote (path) + ' ] || chmod $(stat -c %a ' + Path.quote (path) + ') "$tmp/out"; }'
      + ' && mv "$tmp/out" ' + Path.quote (path);
   var result = await project.run (proj, command, {input: content, commit: noCommit ? undefined : ('Write ' + Path.quote (path)), catch: true});
   return result.code ? {code: result.code, error: result.stderr} : result;
}

project.edit = async function (proj, path, oldText, newText, noCommit) {

   var lockKey = 'lock:edit:' + proj.id + ':' + path;
   await lock (lockKey, 10, 10);

   if (oldText === '[EOF]') {
      var result = await project.run (proj, 'cat >> ' + Path.quote (path), {input: newText, catch: true, commit: noCommit ? false : 'Edit ' + Path.quote (path)});
      await redis ('del', lockKey);
      return result.code ? {code: result.code, error: result.stderr} : result;
   }

   oldText = Buffer.from (oldText);
   newText = Buffer.from (newText);
   var input = Buffer.concat ([Buffer.from (oldText.length + '\n' + newText.length + '\n'), oldText, newText]);

   // Edits go through a rename, since truncating a file that a concurrent git add is reading crashes git (SIGBUS).
   var script = 'tmp=$(mktemp -d /project/.git/vibey.XXXXXX) || exit 1;'
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
      + "' target=\"$tmp/out\" " + Path.quote (path)
      + ' && chmod $(stat -c %a ' + Path.quote (path) + ') "$tmp/out" && mv "$tmp/out" ' + Path.quote (path);

   var result = await project.run (proj, script, {input: input, catch: true, commit: noCommit ? false : 'Edit ' + Path.quote (path)});
   await redis ('del', lockKey);
   return result.code ? {code: result.code, error: result.stderr} : result;
}

project.cleanup = async function () {
   var result = await run ('docker', 'ps', '-aq', '-f', 'name=vibey-project-', {catch: true});
   if (result.stdout) {
      var projectIds = result.stdout.trim ().split ('\n');
      await run ('docker', 'stop', ... projectIds, {catch: true});
      await run ('docker', 'rm',   ... projectIds, {catch: true});
   }
   process.exit (0);
}

project.wake = async function () {
   var volumes = await run ('docker', 'volume', 'ls', '-q', '-f', 'name=vibey-project-', {catch: true});
   if (volumes.code || ! volumes.stdout.trim ()) return;
   await dale.async (volumes.stdout.trim ().split ('\n'), async function (id) {
      var start = await run ('docker', 'start', id, {catch: true});
      if (! start.code) return;
      var recreate = await run ('docker', 'run', '--init', '--network', 'vibey-projects', '-v', id + ':/project', '--name', id, '-d', 'vibey-project', {catch: true});
      if (recreate.code) clog ({priority: 'important', type: 'Project wake error', id, error: recreate.stderr});
   }, {concurrent: 10});
}

// *** BACKUP ***

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

project.backup = async function (proj) {

   if (! CONFIG.backup?.enable) return;

   var [tracked, files, lastCommit] = await dale.async (dale.times (3), function (k) {
      if (k === 1) return project.run (proj, 'git -C /project ls-files -co --exclude-standard');
      if (k === 2) return project.run (proj, "find /project -type f -printf '%T@ %p\\n'");
      if (k === 3) return project.run (proj, 'git -C /project log -1 --format=%ct');
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

// *** ROUTES ***

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

var routes = [

   // *** HOST GATEKEEPER ***

   ['all', '*', async function (rq, rs) {

      if (rq.method === 'head') rq.method = 'get';

      if (rq.headers ['x-test'] === '1') {
         if (CONFIG.baseURL !== 'http://localhost:5353') return reply (rs, 403, {error: 'Not a local request'});
         rq.test = true;
      }

      var host = (rq.headers.host || '').toLowerCase ().replace (/:\d+$/, ''), baseHost = new URL (CONFIG.baseURL).hostname;
      if (host !== baseHost) {
         if (! host.endsWith ('.' + baseHost) || host.slice (0, - baseHost.length - 1).includes ('.')) return reply (rs, 404);
         rq.subdomain = host.slice (0, - baseHost.length - 1);
      }

      if (rq.subdomain) {

         var slug = (s) => s.toLowerCase ().replace (/-/g, '--').replace (/ /g, '-');
         var appMatch = rq.subdomain.match (/^(\d{1,5})--(.+)$/);
         if (appMatch) {
            rq.appPort = appMatch [1];
            rq.url = '/p/' + appMatch [1] + rq.url;
         }
         var projectSubdomain = appMatch ? appMatch [2] : rq.subdomain;

         if (validUuid.test (projectSubdomain)) {
            var project = await redis ('hgetall', 'project:' + projectSubdomain);
            var owner = project ? await redis ('hgetall', 'user:' + project.owner) : undefined;
            if (project && ! owner && ! CONFIG.cloud) owner = {};
            if (owner) {
               rq.project = project;
               rq.projectId = projectSubdomain;
               var readableSubdomain = owner.username + '--' + slug (project.name);
               if (owner.username && readableSubdomain.match (/^[a-z0-9][a-z0-9\-]{0,54}[a-z0-9]$/)) rq.projectRedirect = readableSubdomain;
            }
         }
         else {
            var subdomain = projectSubdomain.split ('--');
            var username = subdomain [0], projectName = subdomain.slice (1).join ('--');
            var ownerId = await redis ('get', 'username:' + username);
            var projects = ownerId ? await getForUser (ownerId, 'project') : undefined;
            rq.project = dale.stopNot (projects, undefined, function (project) {
               if (project.owner === ownerId && slug (project.name) === projectName) return project;
            });
            rq.projectId = rq.project ? rq.project.id : undefined;
         }
      }

      if (! CONFIG.cloud) {
         clog ({type: 'Request', rqId: rs.log.id, method: rq.method, url: rq.url, subdomain: rq.subdomain, projectId: rq.projectId, ip: rs.log.origin});
         rq.user = {id: 'local', creator: true};
         return rs.next ();
      }

      var cookieName = cookie (rq.subdomain ? 'project' : 'host');
      var sessionId = rq.data.cookie && rq.data.cookie [cookieName] ? rq.data.cookie [cookieName] : undefined;

      if (sessionId) {
         var session = await redis ('hgetall', (rq.subdomain ? 'session-p:' : 'session-h:') + sessionId);
         if (rq.subdomain && session) {
            var hostSession = await redis ('hgetall', 'session-h:' + session.hostSession);
            if (! hostSession || new Date (hostSession.expires).getTime () < Date.now ()) {
               await redis ([
                  ['del',  'session-p:' + sessionId],
                  ['srem', 'owner:' + session.user, 'session-p:' + sessionId]
               ]);
               session = hostSession = undefined;
            }
         }

         if (rq.subdomain && hostSession || session && new Date (session.expires).getTime () > new Date ().getTime ()) {

            var user = await redis ('hgetall', 'user:' + session.user);

            if (! user) return reply (rs, 500, {priority: 'critical', type: 'User not found', user: session.user});

            rq.user = {csrf: session.csrf, session: session.hostSession || sessionId, ... user};
         }

         if (rq.user && rq.projectId && session.project !== rq.projectId) delete rq.user;
      }

      clog ({type: 'Request', rqId: rs.log.id, method: rq.method, url: rq.url, subdomain: rq.subdomain, projectId: rq.projectId, ip: rs.log.origin, userId: rq.user ? rq.user.id : 'anonymous'});

      // Create project cookie from session cookie
      if (rq.subdomain && rq.data.query && rq.data.query.sessionCode) {
         var [sessionCode] = await redis ([
            ['hgetall', 'session-code:' + rq.data.query.sessionCode],
            ['del',     'session-code:' + rq.data.query.sessionCode]
         ]);

         if (! sessionCode) return reply (rs, 403, {error: 'Missing session code'});

         if (rq.subdomain !== sessionCode.subdomain || ! rq.data.cookie || rq.data.cookie [cookie ('project-state')] !== sessionCode.state) return reply (rs, 403, {error: 'Invalid session code'});

         var csrf      = crypto.randomBytes (32).toString ('hex');
         var sessionId = crypto.randomBytes (32).toString ('hex');

         await redis ([
            ['hmset',  'session-p:' + sessionId, {csrf, hostSession: sessionCode.hostSession, project: rq.projectId || '', user: sessionCode.user}],
            ['expire', 'session-p:' + sessionId, CONFIG.cookie.expires],
            ['sadd',   'owner:' + sessionCode.user, 'session-p:' + sessionId]
         ]);

         rs.setHeader ('set-cookie', [
            cicek.cookie.write (cookie ('project'), sessionId, {
               expires: new Date (Date.now () + CONFIG.cookie.expires * 1000),
               httponly: true,
               path: '/',
               samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
               secure: true,
            }),
            cicek.cookie.write (cookie ('project-state'), false, {
               httponly: true,
               path: '/',
               samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
               secure: true,
            })
         ]);

         var location = new URL (rq.rawurl, CONFIG.baseURL);
         location.searchParams.delete ('sessionCode');

         return reply (rs, 302, '', {
            location: location.pathname + location.search,
            'referrer-policy': 'no-referrer',
         });
      }

      if (rq.projectRedirect && rq.method === 'get' && rq.url === '/') {
         var [owner, grants] = await redis ([
            ['hget', 'project:' + rq.projectId, 'owner'],
            ['sunion', 'accessTo:' + (rq.user ? rq.user.id : 'PUBLIC'), 'accessTo:PUBLIC']
         ]);
         if (owner === (rq.user && rq.user.id) || dale.stop (grants, true, function (grant) {
            var [verb, projectId] = grant.split (':');
            return projectId === rq.projectId && (verb === 'read' || verb === 'write');
         })) return reply (rs, 302, '', {
            location: new URL (CONFIG.baseURL).protocol + '//' + rq.projectRedirect + '.' + new URL (CONFIG.baseURL).host + encodeURI (rq.rawurl || rq.url)
         });
      }

      var matchRoute = function (routes) {
         return dale.stop (routes, true, function (endpoint) {
            if (type (endpoint [1]) === 'string') endpoint [1] = new RegExp ('^' + cicek.escape (endpoint [1]) + '$');
            return (endpoint [0] === 'all' || rq.method === endpoint [0]) && !! rq.url.match (endpoint [1]);
         });
      }

      var staticRoutes = [
         ['get', '/'],
         ['get', /^\/assets\/.+/],
         ['get', '/cell.js'],
         ['get', '/client.js'],
         ['get', '/favicon.svg'],
         ['get', /^\/icon\/icon-(?:180|192|512)\.png$/],
         ['get', '/manifest.json'],
         // Error reporting, static only in spirit
         ['post', '/error'],
      ];

      var projectRoutes = [
         ['get', '/project'],
         ['get', /^\/f\/.+/],
         ['get', /^\/project\/message\/.+/],
         ['post', '/project/write'],
         ['post', '/project/edit'],
         ['post', '/project/run'],
         ['post', '/project/message'],
         ['all', /^\/p\/\d+\//],
      ];

      var publicPath = matchRoute ([
         ... staticRoutes,
         // Auth
         ['post', '/auth/login'],
         rq.projectId ? ['get', '/auth/user'] : [], // This one is public only for projects
         ['get', /^\/auth\/verify\//],
         ['get', /^\/auth\/project\//],
         // Project (all of these are semi-public endpoints, access is checked by the endpoints themselves)
         ['get', '/projects'],
         ['get', '/project'],
         ['get', /^\/f\/.+/],
         ['get', /^\/project\/message\/.+/],
         ['all', /^\/p\/\d+\//],
      ]);

      if (! rq.appPort && rq.url.match (/^\/p\//)) return reply (rs, 404);
      if (! rq.subdomain && matchRoute (projectRoutes)) return reply (rs, 404);
      if (rq.subdomain && ! matchRoute ([... staticRoutes, ... projectRoutes, ['get', '/auth/user']])) return reply (rs, 404);

      if (! rq.user && ! publicPath) {
         if (sessionId) return reply (rs, 403, {error: 'Invalid session'}, {'set-cookie': cicek.cookie.write (cookie (rq.projectId ? 'project' : 'host'), false, {
            httponly: true,
            path: '/',
            samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
            secure: true,
         })});
         else           return reply (rs, 403, {error: 'No session'});
      }

      if (rq.user && ! publicPath && inc (['post', 'put', 'delete'], rq.method) && rq.headers ['x-csrf'] !== session.csrf) return reply (rs, 403, {error: 'Invalid csrf token'});

      if (rq.subdomain && matchRoute ([['get', '/'], ['get', /^\/f\/.+/]])) {
         if (rq.url !== '/' && ! validProjectPath (rq.url.replace (/^\/f\//, ''))) return reply (rs, 400, {error: 'Invalid path'});

         var [owner, grants] = await redis ([
            ['hget', 'project:' + rq.projectId, 'owner'],
            ['sunion', 'accessTo:' + (rq.user ? rq.user.id : 'PUBLIC'), 'accessTo:PUBLIC']
         ]);
         var allowed = owner && rq.url === '/' ?
            owner === (rq.user && rq.user.id) || dale.stop (grants, true, function (grant) {
               var [verb, projectId] = grant.split (':');
               return projectId === rq.projectId && (verb === 'read' || verb === 'write');
            }) :
            await allowOp (rq.user ? rq.user.id : 'PUBLIC', rq.projectId, 'read', rq.url.replace (/^\/f\//, ''));

         if (! allowed) {
            if (rq.user) return reply (rs, 404, fourohfour, 'html');

            var base  = new URL (CONFIG.baseURL);
            var state = crypto.randomBytes (32).toString ('hex');
            return reply (rs, 302, '', {
               location: CONFIG.baseURL + '/auth/project/' + rq.subdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + rq.headers.host + encodeURI (rq.rawurl || rq.url)) + '&state=' + state,
               'set-cookie': cicek.cookie.write (cookie ('project-state'), state, {
                  expires: new Date (Date.now () + 10 * 60 * 1000),
                  httponly: true,
                  path: '/',
                  samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
                  secure: true,
               })
            });
         }
      }

      rs.next ();

      if (rq.user && ! (rq.method === 'post' && rq.url === '/auth/logout')) await redis ([
         ['hmset', 'session-h:' + (hostSession ? session.hostSession : sessionId), {
            expires: new Date (Date.now () + CONFIG.cookie.expires * 1000).toISOString (),
            last: JSON.stringify ({
               date: now (),
               ip:   rs.log.origin
            })
         }],
         ['hset', 'user:' + rq.user.id, 'last', now ()],
      ]);
   }],

   // *** ERROR REPORTING ***

   ['post', '/error', function (rq, rs) {
      var error = type (rq.body.error) === 'object' ? rq.body : {error: rq.body};
      clog ({priority: 'important', type: 'client error', ... error, user: rq.user ? rq.user.id : 'public'});
      reply (rs, 200);
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
            ['meta', {name: 'base-host', content: new URL (CONFIG.baseURL).host}],
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
            {sizes: '192x192', src: 'icon/icon-192.png', type: 'image/png'},
            {sizes: '512x512', src: 'icon/icon-512.png', type: 'image/png'},
         ],
         id: './',
         name: 'vibey',
         scope: './',
         short_name: 'vibey',
         start_url: './',
         theme_color: '#1a1a2e',
      }), {'content-type': 'application/manifest+json'});
   }],

   // *** AUTH ***

   // Gives the user a code to open a session on a project subdomain. It doesn't check access to the project: the session only says who the user is, and the project routes decide what they can see.
   ['get', '/auth/project/:subdomain', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      var subdomain = rq.data.params.subdomain;
      if (! subdomain.match (/^[a-z0-9\-]{1,63}$/)) return reply (rs, 400, {error: 'Invalid subdomain'});

      try {
         var url = new URL (rq.data.query.returnUrl);
      }
      catch (error) {
         return reply (rs, 400, {error: 'Invalid returnUrl'});
      }

      var base = new URL (CONFIG.baseURL);
      if (url.origin !== base.protocol + '//' + subdomain + '.' + base.host) return reply (rs, 400, {error: 'Invalid returnUrl'});
      if (type (rq.data.query.state) !== 'string' || rq.data.query.state.length === 0) return reply (rs, 400, {error: 'Invalid state'});

      if (! rq.user) return reply (rs, 302, '', {location: rq.data.query.optional ? url.href : CONFIG.baseURL + '/#/login/' + encodeURIComponent ('/auth/project/' + subdomain + '?returnUrl=' + encodeURIComponent (url.href) + '&state=' + encodeURIComponent (rq.data.query.state))});

      var code = crypto.randomBytes (32).toString ('hex');
      await redis ([
         ['hmset',  'session-code:' + code, {hostSession: rq.user.session, subdomain, state: rq.data.query.state, user: rq.user.id}],
         ['expire', 'session-code:' + code, 60]
      ]);
      url.searchParams.set ('sessionCode', code);
      reply (rs, 302, '', {location: url.href});
   }],

   ['get', '/auth/user', async function (rq, rs) {
      if (! rq.user) {
         if (! rq.projectId) return reply (rs, 403);
         var grants = await redis ('smembers', 'accessTo:PUBLIC');
         var isPublic = dale.stop (grants, true, function (grant) {
            var [verb, projectId] = grant.split (':');
            return verb === 'read' && projectId === rq.projectId;
         });
         if (isPublic && rq.data.cookie && rq.data.cookie [cookie ('project-state')]) return reply (rs, 200, {anonymous: true, mode: 'cloud'});
         var base  = new URL (CONFIG.baseURL);
         var state = crypto.randomBytes (32).toString ('hex');
         return reply (rs, 403, {
            location: CONFIG.baseURL + '/auth/project/' + rq.subdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + rq.headers.host + '/') + '&state=' + state + (isPublic ? '&optional=1' : '')
         }, {
            'set-cookie': cicek.cookie.write (cookie ('project-state'), state, {
               expires: new Date (Date.now () + 10 * 60 * 1000),
               httponly: true,
               path: '/',
               samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
               secure: true,
            })
         });
      }

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
         email: rq.subdomain ? undefined : rq.user.email,
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
         var username = rq.body.username.toLowerCase ().normalize ('NFC');
         var characters = username.split ('');

         if (characters.length < 3) return reply (rs, 400, {error: 'Username must have at least 3 characters'});
         if (/\s/u.test (username)) return reply (rs, 400, {error: 'Username cannot contain whitespace'});

         var hasAsciiLetters = /[a-z]/.test (username);
         var hasNonAscii = characters.some (character => character.charCodeAt (0) >= 128);
         if (hasAsciiLetters && hasNonAscii) return reply (rs, 400, {error: 'Username cannot mix ASCII letters with non-ASCII characters'});

         if (username.includes ('--')) return reply (rs, 400, {error: 'Username cannot contain double dashes'});
         if (! /^[\p{L}\p{M}\p{N}-]+$/u.test (username)) return reply (rs, 400, {error: 'Username can only contain letters, combining marks, numbers and dashes'});
         if (! /^[\p{L}\p{N}]/u.test (username)) return reply (rs, 400, {error: 'Username must start with a letter or number'});
         if (username.endsWith ('-')) return reply (rs, 400, {error: 'Username cannot end with a dash'});
         if (/-\p{M}/u.test (username)) return reply (rs, 400, {error: 'A combining mark cannot follow a dash'});

         if (validUuid.test (username)) return reply (rs, 400, {error: 'Username cannot be a UUID'});
         if (/^\d+$/.test (username)) return reply (rs, 400, {error: 'Username cannot be only digits'});

         rq.body.username = username;
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
         ['hmset',  'session-h:' + sessionId, {
            csrf,
            expires: new Date (Date.now () + CONFIG.cookie.expires * 1000).toISOString (),
            last: JSON.stringify ({
               date: now (),
               ip:   rs.log.origin
            }),
            user: userId
         }],
         ['sadd', 'owner:' + userId, 'session-h:' + sessionId],
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
      }, {'set-cookie': cicek.cookie.write (cookie ('host'), sessionId, {
         expires: new Date (Date.now () + 1000 * 60 * 60 * 24 * 365 * 10),
         httponly: true,
         path: '/',
         samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
         secure: true,
      })});
   }],

   ['get', '/auth/list', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      reply (rs, 200, dale.go (await getForUser (rq.user.id, 'session-h'), function (session) {
         return {
            expired: new Date (session.expires).getTime () < new Date ().getTime (),
            last: JSON.parse (session.last)
         };
      }))
   }],

   ['post', '/auth/logout', async function (rq, rs) {
      if (! CONFIG.cloud) return reply (rs, 404, {error: 'Not in cloud mode'});

      var projectSessions = dale.fil (await redis ('smembers', 'owner:' + rq.user.id), undefined, function (key) {
         if (key.match (/^session-p:/)) return key;
      });
      var hostSessions = await redis (dale.go (projectSessions, function (key) {
         return ['hget', key, 'hostSession'];
      }));

      await redis ([
         ['del', 'session-h:' + rq.user.session],
         ['srem', 'owner:' + rq.user.id, 'session-h:' + rq.user.session],
         ... dale.go (projectSessions, function (key, k) {
            if (hostSessions [k] === rq.user.session || ! hostSessions [k]) return [
               ['del', key],
               ['srem', 'owner:' + rq.user.id, key]
            ];
            return [];
         }).flat ()
      ]);

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (cookie ('host'), false, {
         httponly: true,
         path: '/',
         samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
         secure: true,
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
         await project.remove (await redis ('hgetall', key) || {id: key.replace ('project:', '')});
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

      reply (rs, 200, {}, {'set-cookie': cicek.cookie.write (cookie ('host'), false, {
         httponly: true,
         path: '/',
         samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
         secure: true,
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

   // *** PROJECTS (HOST) ***

   ['get', '/projects', async function (rq, rs) {
      var userId = rq.user ? rq.user.id : 'PUBLIC';
      var projects = rq.user ? await getForUser (userId, 'project') : [];
      var listed = dale.obj (projects, function (project) {
         return [project.id, project];
      });
      projects = projects.concat (dale.fil (await getForUser ('PUBLIC', 'project'), undefined, function (project) {
         if (! listed [project.id]) return {...project, public: true};
         if (! project.read) listed [project.id].read = undefined;
      }));

      var usernames = projects.length ? await redis (dale.go (projects, function (project) {
         return ['hget', 'user:' + project.owner, 'username'];
      })) : [];
      dale.go (projects, function (project, k) {
         project.ownerUsername = usernames [k] || undefined;
         var subdomain = project.ownerUsername + '--' + project.name.toLowerCase ().replace (/-/g, '--').replace (/ /g, '-');
         if (project.ownerUsername && subdomain.match (/^[a-z0-9][a-z0-9\-]{0,54}[a-z0-9]$/)) project.subdomain = subdomain;
      });

      reply (rs, 200, dale.go (projects.sort (function (a, b) {
         return new Date (b.last) - new Date (a.last);
      }), function (project) {
         return {
            ...project,
            read: ! rq.user || project.read ? true : undefined,
            // Slots belong to the owner's wheel.
            slot: project.slot && project.owner === userId ? parseInt (project.slot) : undefined
         }
      }));
   }],

   ['post', '/project', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['engine', 'name', 'slot'], 'eachOf', teishi.test.equal],
         ['engine', rq.body.engine, ['string', 'undefined'], 'oneOf'],
         ['name', rq.body.name, 'string'],
         ['slot', rq.body.slot, [1, 2, 3, 4, 5, undefined], 'oneOf', teishi.test.equal],
         function () {
            return ['length of name', rq.body.name.length, {
               max: 500,
               min: 2,
            }, teishi.test.range];
         }
      ])) return;

      if (! validProjectName (rq.body.name)) return reply (rs, 400, {error: 'Project names cannot be a UUID, contain / or ?, have two spaces in a row, or have a space next to a dash'});

      if (! rq.user.creator && rq.user.email !== CONFIG.admin) return reply (rs, 403, {error: 'Please request creator access'});

      if (rq.body.engine && await redis ('hget', 'engine:' + rq.body.engine, 'owner') !== rq.user.id) return reply (rs, 404, {error: 'Engine not found'});

      var projects = await getForUser (rq.user.id, 'project');
      var conflict = dale.stopNot (projects, undefined, function (project) {
         if (project.name.toLowerCase () === rq.body.name.toLowerCase ()) return project;
      });
      if (conflict) return reply (rs, 409, {error: 'There is already a project with that name'});

      var newProject = {
         created: now (),
         id:      crypto.randomUUID (),
         last:    now (),
         name:    rq.body.name,
         owner:   rq.user.id,
      }
      if (rq.body.slot) newProject.slot = rq.body.slot;
      if (rq.body.engine) newProject.engine = rq.body.engine;

      var slotConflict = ! rq.body.slot ? undefined : dale.stopNot (projects, undefined, function (project) {
         if (project.owner !== rq.user.id) return;
         if (parseInt (project.slot) === rq.body.slot) return project;
      });

      var ops = [
         ['hmset', 'project:' + newProject.id, newProject],
         ['sadd',  'owner:' + rq.user.id, 'project:' + newProject.id]
      ];
      if (slotConflict) ops.push (['hdel', 'project:' + slotConflict.id, 'slot']);

      await redis (ops);

      await project.run (newProject, 'git config --global init.defaultBranch main && git -C /project init && git -C /project config user.name vibey && git -C /project config user.email vibey@local', {catch: true});

      await project.write (newProject, 'main.md', '# ' + rq.body.name + '\n\n');

      var subdomain = rq.user.username + '--' + rq.body.name.toLowerCase ().replace (/-/g, '--').replace (/ /g, '-');
      reply (rs, 200, {id: newProject.id, subdomain: rq.user.username && subdomain.match (/^[a-z0-9][a-z0-9\-]{0,54}[a-z0-9]$/) ? subdomain : undefined});
   }],

   ['put', '/project', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['id', 'name', 'slot'], 'eachOf', teishi.test.equal],
         ['id', rq.body.id, 'string'],
         ['name', rq.body.name, 'string'],
         ['slot', rq.body.slot, [1, 2, 3, 4, 5, undefined], 'oneOf', teishi.test.equal],
         function () {
            return ['length of name', rq.body.name.length, {
               max: 500,
               min: 2,
            }, teishi.test.range];
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
         if (project.name.toLowerCase () === rq.body.name.toLowerCase ()) return project;
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

   ['delete', '/project/:id', async function (rq, rs) {

      var projects = await getForUser (rq.user.id, 'project');
      var match = dale.stopNot (projects, undefined, function (project) {
         if (project.id === rq.data.params.id) return project;
      });
      if (! match) return reply (rs, 404);

      if (match.owner !== rq.user.id) return reply (rs, 403, {error: 'Only the project owner can delete the project'});

      await project.remove (match);

      await redis ([
         ['del',  'project:' + rq.data.params.id],
         ['srem', 'owner:' + rq.user.id, 'project:' + rq.data.params.id],
         ... await projectAccessCleanup (rq.data.params.id)
      ]);

      reply (rs, 200);
   }],

   // *** PROJECT (SUBDOMAIN) ***

   ['get', '/project', async function (rq, rs) {

      var userId = rq.user ? rq.user.id : 'PUBLIC';
      var [[owner, name], grants] = await redis ([
         ['hmget', 'project:' + rq.projectId, 'owner', 'name'],
         ['sunion', 'accessTo:' + userId, 'accessTo:PUBLIC']
      ]);

      // Load permissions once, rather than querying Redis for every file.
      var access = owner === userId ? undefined : dale.fil (grants, undefined, function (grant) {
         var [verb, projectId, ... parts] = grant.split (':');
         if (projectId === rq.projectId && (verb === 'read' || verb === 'write')) return [verb, ... parts].join (':');
      });
      if (access && ! access.length) return reply (rs, 404);

      var accessFile = await allowOp (userId, rq.projectId, 'read', 'vibey/access.md');

      var [result, sockets] = await Promise.all ([
         project.run (rq.project, "find /project -type f -not -path '/project/.git/*' -printf '%s %T@ %P\\0'", {catch: true}),
         project.run (rq.project, 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null', {catch: true}),
      ]);
      if (result.code) return reply (rs, 500, {error: 'Could not list files'});

      var apps = [];
      dale.go ((sockets.stdout || '').toString ().split ('\n'), function (line) {
         var fields = line.trim ().split (/\s+/);
         if (fields [3] !== '0A') return;
         var port = parseInt (fields [1].split (':').pop (), 16);
         if (access && ! dale.stop (access, true, function (grant) {
            var scope = grant.split (':').slice (1).join (':');
            return ! scope || scope === 'APP:' + port;
         })) return;
         if (! inc (apps, port)) apps.push (port);
      });
      apps.sort (function (a, b) {
         return a - b;
      });

      if (apps.length) {
         var probe = await project.run (rq.project, dale.go (apps, function (port) {
            return 'curl -sI -o /dev/null -m 1 -w "' + port + ' %{http_code}\\n" http://127.0.0.1:' + port + '/';
         }).join (' & ') + ' & wait', {catch: true});
         var http = dale.fil ((probe.stdout || '').toString ().split ('\n'), undefined, function (line) {
            var [port, code] = line.split (' ');
            if (code && code !== '000') return parseInt (port);
         });
         apps = dale.fil (apps, undefined, function (port) {
            if (inc (http, port)) return port;
         });
      }

      var files = dale.fil ((result.stdout || '').toString ().split ('\0'), undefined, function (line) {
         if (! line) return;
         var first = line.indexOf (' ');
         var second = line.indexOf (' ', first + 1);
         var name = line.slice (second + 1);
         if (! validProjectPath (name)) return;
         if (name === 'vibey/access.md' && ! accessFile) return;
         if (access && ! dale.stop (access, true, function (grant) {
            var scope = grant.split (':').slice (1).join (':');
            return ! scope.startsWith ('APP:') && ! /^APP:\d+$/.test (name) && name.startsWith (scope);
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
      return reply (rs, 200, {
         apps,
         files,
         project: {
            access,
            id: rq.projectId,
            name,
            ownerId: owner,
            subdomain: rq.subdomain !== rq.projectId ? rq.subdomain : undefined,
         }
      });
   }],

   ['get', /^\/f\/(.+)$/, async function (rq, rs) {
      var path = rq.data.params [0];
      if (! validProjectPath (path)) {
         return reply (rs, 400, {error: 'Invalid path'});
      }

      if (rq.projectRedirect) return reply (rs, 302, '', {
         location: new URL (CONFIG.baseURL).protocol + '//' + rq.projectRedirect + '.' + new URL (CONFIG.baseURL).host + encodeURI (rq.rawurl || rq.url)
      });

      if (/\.(m4a|mov|mp3|mp4|ogg|wav|webm)$/i.test (path)) return project.media (rq, rs, rq.project, '/project/' + path);

      var file = await project.read (rq.project, '/project/' + path, 'buffer');
      if (file.code) {
         if (file.code === 1 && file.error && file.error.match ('No such file or directory')) return reply (rs, 404, fourohfour, 'html');
         clog ({priority: 'important', type: 'Read file error', error: formatError (file)});
         return reply (rs, 500);
      }

      var buffer = file.stdout;
      var markdown = /\.md$/i.test (path) && ! (rq.data.query && rq.data.query.raw);
      if (markdown) buffer = Buffer.from (lith.g ([
         ['!DOCTYPE HTML'],
         ['html', [
            ['head', [
               ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
               ['meta', {charset: 'utf-8'}],
               ['title', Path.basename (path)],
               ['style', [
                  ['body', {
                     'font-family': 'sans-serif',
                     'line-height': '1.5',
                     margin: '0 auto',
                     'max-width': '48rem',
                     padding: '2rem 1rem',
                  }],
                  ['.raw', {
                     'background-color': '#4a69bd',
                     'border-radius': '0.5rem',
                     color: '#f5f7ff',
                     padding: '0.5rem 1rem',
                     position: 'fixed',
                     right: '1rem',
                     'text-decoration': 'none',
                     top: '1rem',
                  }],
               ]],
            ]],
            ['body', [
               ['a', {class: 'raw', download: Path.basename (path), href: '/f/' + path.split ('/').map (encodeURIComponent).join ('/') + '?raw=1'}, 'Download'],
               ['LITERAL', marked.parse (buffer.toString (), {breaks: true})],
            ]],
         ]],
      ]));
      var headers = {
         'access-control-allow-origin': '*',
         'content-type': markdown ? 'text/html' : mime.lookup (path) || 'application/octet-stream',
         'cache-control': 'private, no-cache',
         'x-content-type-options': 'nosniff',
      };
      if (inc (['text/html', 'image/svg+xml'], headers ['content-type'])) headers ['content-security-policy'] = 'sandbox allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts';
      var cached = cicek.cache (rq.method, buffer, rq.headers, headers, 200);
      if (! cached) headers ['content-length'] = buffer.length;

      rs.log.code = cached ? 304 : 200;
      rs.log.responseBody = cached ? 0 : buffer.length;
      rs.log.responseHeaders = headers;
      rs.writeHead (rs.log.code, headers);
      rs.end (cached ? undefined : buffer);
      return cicek.apres (rs);
   }],

   ['all', /^\/p\/(\d+)(\/.*)$/, async function (rq, rs) {
      var port = rq.data.params [0], url = rq.rawurl || rq.data.params [1];

      if (rq.projectRedirect && (port + '--' + rq.projectRedirect).length <= 63) return reply (rs, 302, '', {
         location: new URL (CONFIG.baseURL).protocol + '//' + port + '--' + rq.projectRedirect + '.' + new URL (CONFIG.baseURL).host + encodeURI (url)
      });

      if (! await allowOp (rq.user ? rq.user.id : 'PUBLIC', rq.projectId, rq.method === 'get' ? 'read' : 'write', 'APP:' + port)) {
         if (rq.user || rq.method !== 'get') return reply (rs, 404, fourohfour, 'html');

         var base  = new URL (CONFIG.baseURL);
         var state = crypto.randomBytes (32).toString ('hex');
         return reply (rs, 302, '', {
            location: CONFIG.baseURL + '/auth/project/' + rq.subdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + rq.headers.host + encodeURI (url)) + '&state=' + state,
            'set-cookie': cicek.cookie.write (cookie ('project-state'), state, {
               expires: new Date (Date.now () + 10 * 60 * 1000),
               httponly: true,
               path: '/',
               samesite: CONFIG.baseURL === 'http://localhost:5353' ? 'None' : 'Lax',
               secure: true,
            })
         });
      }

      try {
         var body = await new Promise (function (resolve, reject) {
            var bodyChunks = [];
            rq.on ('data', function (chunk) {bodyChunks.push (chunk)});
            rq.on ('end', function () {resolve (Buffer.concat (bodyChunks))});
            rq.on ('error', reject);
         });
      }
      catch (error) {
         return reply (rs, 400, {error: 'Could not read request body'});
      }

      var cookies = dale.fil ((rq.headers.cookie || '').split (/;\s*/), undefined, function (pair) {
         var name = pair.split ('=') [0];
         if (pair && name !== cookie ('project') && name !== cookie ('project-state')) return pair;
      });
      var headers = dale.fil (rq.headers, undefined, function (v, k) {
         if (! inc (['connection', 'content-length', 'cookie', 'expect', 'host', 'x-csrf'], k)) return '-H ' + Path.quote (k + ': ' + v);
      });

      var result = await project.run (rq.project, [
         'curl -sS -i --http1.1 -X', Path.quote (rq.method.toUpperCase ()),
         ... headers,
         cookies.length ? '-H ' + Path.quote ('cookie: ' + cookies.join ('; ')) : '',
         '-H ' + Path.quote ('host: ' + rq.headers.host),
         '-H ' + Path.quote ('x-forwarded-proto: ' + new URL (CONFIG.baseURL).protocol.slice (0, -1)),
         '-H expect:',
         body.length ? '--data-binary @-' : '',
         Path.quote ('http://127.0.0.1:' + port + encodeURI (url)),
      ], {
         catch: true,
         input: body.length ? body : undefined,
         stdout: 'buffer',
      });
      if (result.code === 7) return reply (rs, 502, {error: 'Nothing is listening on port ' + port});
      if (result.code) return reply (rs, 502, {error: 'App request failed'});

      var output = result.stdout || Buffer.alloc (0), split = output.indexOf ('\r\n\r\n');
      var lines = output.slice (0, split).toString ().split ('\r\n');
      var responseHeaders = {};
      dale.go (lines.slice (1), function (line) {
         var colon = line.indexOf (':'), k = line.slice (0, colon).trim ().toLowerCase (), v = line.slice (colon + 1).trim ();
         if (inc (['connection', 'keep-alive', 'transfer-encoding'], k)) return;
         responseHeaders [k] = responseHeaders [k] === undefined ? v : [].concat (responseHeaders [k], v);
      });
      var buffer = output.slice (split + 4);
      responseHeaders ['content-length'] = buffer.length;

      rs.log.code = parseInt (lines [0].split (' ') [1]);
      rs.log.responseBody = buffer.length;
      rs.log.responseHeaders = responseHeaders;
      rs.writeHead (rs.log.code, responseHeaders);
      rs.end (buffer);
      return cicek.apres (rs);
   }],

   ['post', '/project/write', async function (rq, rs) {

      var multipart = !! rq.data.files;
      if (multipart) rq.body = rq.data.fields;

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), multipart ? ['path'] : ['path', 'content'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
      ])) return;

      if (stop (rs, multipart ? [
         ['keys of files', dale.keys (rq.data.files), ['file'], teishi.test.equal],
         ['file', rq.data.files.file, 'string'],
      ] : [
         ['content', rq.body.content, 'string'],
      ])) return;

      if (! await allowOp (rq.user.id, rq.projectId, 'write', rq.body.path)) return reply (rs, 404);

      var content = multipart
         ? await fs.promises.readFile (rq.data.files.file)
         : rq.body.content;

      var result = await project.write (rq.project, rq.body.path, content);
      if (result.code === 0) delete result.code;

      if (! result.code) redis ('hset', 'project:' + rq.projectId, 'last', now ());
      reply (rs, result.code ? 400 : 200, result);
   }],

   ['post', '/project/edit', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['path', 'oldText', 'newText'], 'eachOf', teishi.test.equal],
         ['path', rq.body.path, 'string'],
         ['oldText', rq.body.oldText, 'string'],
         ['newText', rq.body.newText, 'string'],
      ])) return;

      if (! await allowOp (rq.user.id, rq.projectId, 'write', rq.body.path)) return reply (rs, 404);

      var result = await project.edit (rq.project, rq.body.path, rq.body.oldText, rq.body.newText);
      if (result.code === 0) delete result.code;

      if (! result.code) redis ('hset', 'project:' + rq.projectId, 'last', now ());
      return reply (rs, result.code ? 400 : 200, result);
   }],

   ['post', '/project/run', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['command', 'read'], 'eachOf', teishi.test.equal],
         ['command', rq.body.command, 'string'],
         ['read', rq.body.read, ['boolean', 'undefined'], 'oneOf']
      ])) return;

      // The client's read flag is not an authorization boundary.
      if (! await allowOp (rq.user.id, rq.projectId, 'write')) return reply (rs, 404);

      var result = rq.body.command.trim () === 'vibey access'
         ? await project.access (rq.project)
         : await project.run (rq.project, rq.body.command, {catch: true, commit: rq.body.read ? false : 'Run ' + Path.quote (rq.body.command)});
      if (result.code === 0) delete result.code;

      if (! rq.body.read) redis ('hset', 'project:' + rq.projectId, 'last', now ());
      reply (rs, 200, result);
   }],

   ['get', /^\/project\/message\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(.+)$/, async function (rq, rs) {
      var messageId = rq.data.params [0], path = rq.data.params [1];

      if (! await allowOp (rq.user ? rq.user.id : 'PUBLIC', rq.projectId, 'read', path)) return reply (rs, 404);

      var result = await project.read (rq.project, path);
      if (result.code) {
         if (result.code === 1 && result.error && result.error.match ('No such file or directory')) return reply (rs, 404);
         clog ({
            error: formatError (result),
            priority: 'important',
            type: 'Read message error',
         });
         return reply (rs, 500);
      }
      var text = result.stdout;
      var head = text.match (new RegExp ('^əəə head ' + messageId + '\\n', 'im'));
      if (! head) return reply (rs, 404);
      var rest = text.slice (head.index + head [0].length);
      var nextHead = rest.match (/^əəə head [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n/im);
      var message = head [0] + (nextHead ? rest.slice (0, nextHead.index).replace (/\n$/, '') : rest);
      if (! message.match (new RegExp ('^əəə body ' + messageId + '\\n', 'im'))) return reply (rs, 404);
      var next = [], heads = /^əəə head ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n/gim, match;
      while ((match = heads.exec (rest))) next.push (match [1]);
      reply (rs, 200, {message: message, next: next});
   }],

   ['post', '/project/message', async function (rq, rs) {
      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['base64', 'body', 'file', 'from', 'name', 'reply', 'to'], 'eachOf', teishi.test.equal],
         ['base64', rq.body.base64, ['boolean', 'undefined'], 'oneOf'],
         ['file', rq.body.file, 'string'],
         ['from', rq.body.from, ['string', 'undefined'], 'oneOf'],
         ['from', rq.body.from, undefined, function () {
            if (rq.body.from === undefined || /^[^\n]+$/.test (rq.body.from)) return true;
            return ['from must be a single line'];
         }],
         ['reply', rq.body.reply, ['string', 'undefined'], 'oneOf'],
         ['reply', rq.body.reply, undefined, function () {
            if (rq.body.reply === undefined) return true;
            if (rq.body.from === undefined) return ['reply requires from'];
            if (/^[^\n]+$/.test (rq.body.reply)) return true;
            return ['reply must be a single line'];
         }],
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

      if (! await allowOp (rq.user.id, rq.projectId, 'write', rq.body.file)) return reply (rs, 404);
      if (rq.body.to === 'shell' || rq.body.to.match (/^ai-/)) {
         if (! await allowOp (rq.user.id, rq.projectId, 'write')) return reply (rs, 404);
      }

      var aiModel = dale.stopNot (models, undefined, function (m) {
         if (rq.body.to === 'ai-' + m.model) return m;
      });
      var aiFlavor = aiModel ? aiModel.provider : undefined;
      var credentials = aiModel
         ? JSON.parse (await redis ('hget', 'credentials:' + rq.user.id, 'data') || '{}')
         : {};
      var creds = credentials [aiFlavor] || {};
      var auth = aiModel && (rq.test ? 'test' : aiModel.requireAPIKey
         ? (creds.apiKey ? 'apiKey' : undefined)
         : creds.account ? 'account' : creds.apiKey ? 'apiKey' : undefined);

      var refreshError;
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
            refreshError = aiFlavor + ' account token refresh failed, please reconnect: ' + JSON.stringify (error.body || error.error);
         }
         if (! refreshError) {
            creds.account.access = tokenData.access_token;
            creds.account.expires = Date.now () + tokenData.expires_in * 1000 - 5 * 60 * 1000;
            if (tokenData.refresh_token) creds.account.refresh = tokenData.refresh_token;
            if (tokenData.id_token) creds.account.idToken = tokenData.id_token;
            await redis ('hset', 'credentials:' + rq.user.id, 'data', JSON.stringify (credentials));
         }
      }

      if (aiModel && ! auth) return reply (rs, 400, {
         error: aiModel.model + ' requires ' + aiFlavor + (aiModel.requireAPIKey ? ' API key credentials' : ' account or API key credentials'),
      });

      var id = crypto.randomUUID ();

      var message = dale.fil ([
         'əəə head ' + id,
         rq.body.base64 ? 'base64 1' : undefined,
         'from ' + (rq.body.from || rq.user.id),
         'id ' + id,
         rq.body.name !== undefined ? 'name ' + rq.body.name : undefined,
         rq.body.reply !== undefined ? 'reply ' + rq.body.reply : undefined,
         't ' + now (),
         'to ' + rq.body.to,
         'əəə body ' + id,
         rq.body.body,
      ], undefined, function (line) {return line}).join ('\n');

      var result = await project.run (rq.project, 'mkdir -p ' + Path.quote (Path.dirname (rq.body.file)) + ' && touch ' + Path.quote (rq.body.file), {catch: true});
      if (result.code) return reply (rs, 400, {code: result.code, error: result.stderr});

      result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + message);
      if (result.code) return reply (rs, 400, result);

      redis ('hset', 'project:' + rq.projectId, 'last', now ());

      if (refreshError) {
         var errorId = crypto.randomUUID ();
         result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + [
            'əəə head ' + errorId,
            'from ' + rq.body.to,
            'id ' + errorId,
            't-end ' + now (),
            't-start ' + now (),
            'to ' + id,
            'əəə body ' + errorId,
            refreshError,
         ].join ('\n'));
         if (result.code) return reply (rs, 400, result);
         return reply (rs, 200, {id: id, responseId: errorId});
      }

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

      var output = '', oldBody = 'əəə body ' + responseId + '\n', usage, writtenUsage, messageTo = id;
      var tokenLines = function (usage) {
         return usage ? [
            'tokens-in ' + usage.fresh,
            'tokens-cache ' + usage.cache,
            'tokens-out ' + usage.output,
         ] : [];
      };
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

      var watchCancellation = function (proc, executionProject = rq.project) {
         var messageId = responseId;
         var pidFile = processFile (messageId);
         var checking = false, ended = false;
         cancelled = false;

         var interval = setInterval (async function () {
            if (checking || ended || cancelled) return;
            checking = true;
            try {
               var chat = await project.read (rq.project, rq.body.file);
               if (ended || chat.code) return;
               if (! new RegExp (
                  '^əəə head ' + messageId + '\n(?:(?!əəə (?:head|body) )[^\n]*\n)*cancelled .+$', 'im'
               ).test (chat.stdout)) return;
               cancelled = true;
               var result = proc.fake ? {code: 0} : await project.run (executionProject, 'bash -c ' + Path.quote (
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
               await project.run (executionProject, 'rm -f ' + Path.quote (pidFile));
            }
            catch (error) {
               clog ({error: formatError (error), responseId: messageId, type: 'Process cleanup error'});
            }
         });
      };

      var streamPending = false;
      var streamEdit = function () {
         if (streamPending) return;
         streamPending = true;
         editQueue = editQueue.then (async function () {
            await new Promise (function (resolve) {setTimeout (resolve, 20)});
            streamPending = false;
            if (editError) return;
            var newBody = 'əəə body ' + responseId + '\n' + output.replace (/^əəə (head|body)/gm, '> əəə $1');
            var headUsage = usage;
            var headTail = function (usage) {
               return ['t-start ' + tStart].concat (tokenLines (usage), ['credential ' + auth, 'to ' + messageTo, '']).join ('\n');
            };
            var updateHead = headUsage && ! teishi.eq (headUsage, writtenUsage);
            var oldText = updateHead ? headTail (writtenUsage) + oldBody : oldBody;
            var newText = updateHead ? headTail (headUsage) + newBody : newBody;
            var result = await project.edit (rq.project, rq.body.file, oldText, newText, Math.random () > 0.05);
            if (result.code) throw result;
            oldBody = newBody;
            if (updateHead) writtenUsage = headUsage;
         }).catch (function (error) {
            editError = error;
            clog ({priority: 'important', type: 'Stream persistence error', error: formatError (error), responseId});
         });
      };

      // Commits whatever the stream left uncommitted, for exits that skip the closing head edit.
      var streamCommit = async function () {
         await editQueue;
         await project.run (rq.project, 'true', {catch: true, commit: 'Edit ' + Path.quote (rq.body.file)});
      };

      var postMessage = function (body) {
         return new Promise (function (resolve) {
            hitit.one ({}, {
               port:    CONFIG.port,
               method:  'post',
               path:    '/project/message',
               headers: dale.obj ({cookie: rq.headers.cookie, host: rq.headers.host, 'x-csrf': rq.headers ['x-csrf'], 'x-test': rq.headers ['x-test']}, function (v, k) {if (v !== undefined) return [k, v]}),
               body:    body,
               code:    200,
            }, function (error, rdata) {
               if (error) return resolve ({code: 1, error: JSON.stringify (error.body || error.error)});
               resolve ({code: 0, stdout: JSON.stringify (rdata.body)});
            });
         });
      };

      if (rq.body.to === 'shell') {
         var agentCall = /^\s*vibey agent (\S+)\s+([\s\S]+)$/.exec (rq.body.body);
         if (agentCall) {
            var agentResult = await postMessage ({body: agentCall [2], file: rq.body.file, from: 'shell', to: 'ai-' + agentCall [1]});
            if (agentResult.code) return reply (rs, 400, {error: agentResult.error});
            return reply (rs, 200, {id: id, responseId: JSON.parse (agentResult.stdout).responseId});
         }

         var shellProject = rq.project, shellCommand = rq.body.body;
         var projectCall = /^\s*vibey project ([^\s:]+)\s+([\s\S]+)$/.exec (shellCommand);
         if (projectCall) {
            shellCommand = projectCall [2];
            if (projectCall [1] !== rq.projectId) {
               if (! validUuid.test (projectCall [1]) || ! (shellProject = await redis ('hgetall', 'project:' + projectCall [1]))) return reply (rs, 404);
               var access = await project.read (shellProject, '/project/vibey/access.md');
               var allowed = ! access.code && access.stdout.split (/\r?\n/).some (function (line) {
                  var grant = /^(\S+)\s+write$/.exec (line.trim ());
                  return grant && grant [1] === 'project:' + rq.projectId;
               });
               if (! allowed) return reply (rs, 404);
            }
         }

         result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + responseMessage);
         if (result.code) return reply (rs, 400, result);
         reply (rs, 200, {id: id, responseId: responseId});

         if (shellCommand.trim () === 'vibey access') {
            var accessResult = await project.access (shellProject);
            output += accessResult.stdout || accessResult.error || 'Could not sync access\n';
            streamEdit ();
         }
         else await project.run (shellProject, groupedCommand (shellCommand), {catch: true, onSpawn: function (proc) {
            watchCancellation (proc, shellProject);
         }, stdout: function (chunk) {
            output += chunk;
            streamEdit ();
         }, stderr: function (chunk) {
            output += chunk;
            streamEdit ();
         }});
         await editQueue;

         if (cancelled) return await streamCommit ();

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

         await project.edit (rq.project, rq.body.file, shellHead, shellDone);
         redis ('hset', 'project:' + rq.projectId, 'last', now ());
         return;
      }

      var toolDone;
      for (var turn = 0; ; turn++) {
         var chat = await project.read (rq.project, rq.body.file);
         if (chat.code) throw chat;
         var transcript = chat.stdout;
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
            result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + systemMessage);
            if (result.code) throw result;
            transcript += '\n' + systemMessage;
         }

         var main = await project.read (rq.project, 'main.md');
         if (main.code && ! (main.code === 1 && /No such file or directory/.test (main.error || ''))) {
            throw main;
         }
         if (! main.code) {
            var mainBody = main.stdout.replace (/^əəə (head|body)/gm, '> əəə $1');
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
               result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + mainMessage);
               if (result.code) throw result;
               transcript += '\n' + mainMessage;
            }
         }

         // Context is saved first; the transcript does not include the new pending response.
         if (turn === 0) {
            result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + responseMessage);
            if (result.code) return reply (rs, 400, result);
            reply (rs, 200, {id: id, responseId: responseId});
         }
         else {
            await startMessage (rq.body.to, responseId);
            await project.edit (rq.project, rq.body.file, toolDone [0], toolDone [1]);
         }

         var buffer = '', aiStderr = '';
         var lastFullText = '', messageBreak = false;
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
                  if (partial.type === 'message_start') {
                     lastFullText = '';
                     messageBreak = !! output;
                  }
                  if (partial.type === 'message_start' && partial.message && partial.message.usage) {
                     var start = partial.message.usage;
                     usage = {
                        cache: start.cache_read_input_tokens || 0,
                        fresh: start.input_tokens + (start.cache_creation_input_tokens || 0),
                        output: start.output_tokens || 0,
                     };
                  }
                  if (partial.type === 'message_delta' && partial.usage && usage) usage = {
                     cache: usage.cache,
                     fresh: usage.fresh,
                     output: partial.usage.output_tokens,
                  };
                  if (partial.type === 'content_block_delta' && partial.delta.type === 'text_delta') {
                     lastFullText += partial.delta.text;
                     var separator = messageBreak ? '\n\n' : '';
                     messageBreak = false;
                     return separator + partial.delta.text;
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

         if (rq.test) var aiResult = await new Promise (function (resolve) {
            var proc = new (require ('events')) (), words = 0;
            var script = turn === 0 && /^fake-output:\n/.test (rq.body.body) ? rq.body.body.slice ('fake-output:\n'.length) : undefined;
            proc.fake = true;
            watchCancellation (proc);
            var interval = setInterval (function () {
               if (! cancelled) {
                  output += script !== undefined ? script : (words ? ' ' : '') + 'word' + words;
                  streamEdit ();
                  if (script === undefined && ++words < 1000) return;
               }
               clearInterval (interval);
               proc.emit ('exit');
               proc.emit ('close');
               resolve (cancelled ? {code: null, signal: 'SIGKILL'} : {code: 0});
            }, 1);
         });
         else {
            var temp = await project.run (rq.project, 'umask 077; mktemp -d /home/vibey/.vibey-ai.XXXXXXXXXX', {catch: true});
            if (temp.code) throw temp;
            var configDir = temp.stdout.trim ();

            try {
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
                  var result = await project.write (rq.project, configDir + '/auth.json', codexAuth, 'noCommit');
                  if (result.code) throw result;

                  command = 'export CODEX_HOME=' + Path.quote (configDir) + ';'
                     + ' exec codex app-server --stdio -c ' + Path.quote ('sandbox_mode="danger-full-access"');
               }

               if (aiFlavor === 'anthropic') {
                  if (auth === 'account') {
                     var claudeAuth = JSON.stringify ({claudeAiOauth: {
                        accessToken: creds.account.access,
                        clientId: Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString (),
                        expiresAt: creds.account.expires,
                        refreshToken: creds.account.refresh,
                     }});
                     var result = await project.write (rq.project, configDir + '/.credentials.json', claudeAuth, 'noCommit');
                     if (result.code) throw result;
                  }

                  var credentialPath = configDir + '/credential';
                  var result = await project.write (
                     rq.project, credentialPath,
                     auth === 'apiKey' ? creds.apiKey : creds.account.access,
                     'noCommit'
                  );
                  if (result.code) throw result;

                  command = 'export CLAUDE_CONFIG_DIR=' + Path.quote (configDir) + ';'
                     + ' unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN;'
                     + ' credential=$(cat ' + Path.quote (credentialPath) + ') || exit 1;'
                     + ' export ' + (auth === 'apiKey' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN') + '="$credential";'
                     + ' unset credential;'
                     + ' exec claude -p --model ' + Path.quote (aiModel.canonical)
                     + ' --output-format stream-json --include-partial-messages --verbose --dangerously-skip-permissions';
               }

               var aiResult = await project.run (rq.project, groupedCommand (command), {
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
                  var cleanup = await project.run (rq.project, 'rm -rf -- ' + Path.quote (configDir), {catch: true});
                  if (cleanup.code) throw cleanup;
               }
               catch (error) {
                  clog ({priority: 'important', type: 'AI credentials cleanup error', error: formatError (error), responseId});
               }
            }

         }

         if (buffer) processLines ([buffer]);

         if (cancelled) {
            return await streamCommit ();
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
         ].concat (tokenLines (usage)).join ('\n');

         var parseToolCall = function (text) {
            var start = /^tool-call:.*$/m.exec (text);
            if (! start) return;

            var lines = text.slice (start.index).split ('\n');
            var op = /^tool-call: (read|write|edit|run|agent)(?: ([^\s:]+))?$/.exec (lines [0]);
            if (! op) return {error: 'Expected tool-call: read|write|edit|run|agent [projectId]'};
            var projectId = op [2] || rq.projectId;
            op = op [1];
            if (op === 'agent' && projectId !== rq.projectId) return {error: 'agent only works on the current project'};

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

            if (op === 'agent') {
               var to = lines [3] && lines [3].startsWith ('to: ');
               call.to = to ? lines [3].slice (4) : rq.body.to;
               var rest = lines.slice (to ? 4 : 3);
               var next = rest.findIndex (function (line) {return /^tool-call: agent/.test (line)});
               call.body = rest.slice (0, next === -1 ? rest.length : next).join ('\n');
               if (next !== -1) call.more = parseToolCall (rest.slice (next).join ('\n'));
               if (call.more && call.more.error) return call.more;
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
               var target = rq.project;
               if (call.projectId !== rq.projectId) {
                  if (call.op !== 'run' && ! validProjectPath (call.path)) {
                     return {code: 1, error: 'Invalid path'};
                  }
                  if (! validUuid.test (call.projectId) || ! (target = await redis ('hgetall', 'project:' + call.projectId))) return {code: 1, error: 'Access denied'};
                  var access = await project.read (target, '/project/vibey/access.md');
                  var allowed = ! access.code && dale.stop (
                     access.stdout.split (/\r?\n/), true,
                     function (line) {
                        var grant = /^(\S+)\s+(read|write)(?:\s+(.+))?$/.exec (line.trim ());
                        if (! grant || grant [1] !== 'project:' + rq.projectId) return;
                        if (grant [2] !== 'write' && call.op !== 'read') return;
                        var prefix = grant [3] || '';
                        if (! validProjectPath (prefix)) return;
                        return ! prefix || (call.op !== 'run' && call.path.startsWith (prefix));
                     }
                  );
                  if (! allowed) return {code: 1, error: 'Access denied'};
               }

               if (call.op === 'read') return await project.read (target, call.path);
               if (call.op === 'write') return await project.write (target, call.path, call.content);
               if (call.op === 'edit') return await project.edit (target, call.path, call.oldText, call.newText);
               if (call.op === 'agent') {
                  var calls = [];
                  for (var next = call; next; next = next.more) calls.push (next);
                  var results = await dale.async (calls, function (agentCall) {
                     return postMessage ({body: agentCall.body, file: agentCall.path, from: rq.body.to, reply: rq.body.file, to: agentCall.to});
                  }, {concurrent: true});
                  return {
                     code: dale.stop (results, true, function (result) {return !! result.code}) ? 1 : 0,
                     stdout: dale.go (results, function (result) {return result.stdout || result.error}).join ('\n'),
                  };
               }
               if (call.op === 'run' && call.command.trim () === 'vibey access') {
                  var result = await project.access (target);
                  if (onOutput) onOutput (result.stdout || result.error || '');
                  return result;
               }
               if (call.op === 'run') return await project.run (target, groupedCommand (call.command), {
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
               var toolCallLines = toolCallText.split ('\n');
               if (toolCall.op === 'read' || toolCall.op === 'run') toolCallLines = toolCallLines.slice (0, 3);
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
            writtenUsage = undefined;
            messageTo = to;
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
            var result = await project.edit (rq.project, rq.body.file, '[EOF]', '\n' + head + '\nto ' + to + '\n' + oldBody);
            if (result.code) throw result;
            return head;
         };

         // Append the successor before finishing this message, so pollers never see a finished chain end early.
         var finishedHead = [oldHead].concat (tokenLines (writtenUsage)).join ('\n');
         if (toolCall) var toolHead = await startMessage ('shell', responseId, toolCallText + '\n\nResult:\n');

         result = await project.edit (rq.project, rq.body.file, finishedHead, newHead);
         if (result.code) throw result;
         redis ('hset', 'project:' + rq.projectId, 'last', now ());
         if (! toolCall) break;

         var toolResult = turn >= 49 ? {code: 1, error: 'Tool-call limit reached (50 AI responses).'} : await makeToolCall (toolCall, function (chunk) {
            output += chunk.toString ('utf8');
            streamEdit ();
         });
         if (cancelled) {
            return await streamCommit ();
         }
         if (toolCall.op !== 'run' && toolResult.stdout) output += toolResult.stdout;
         if (toolResult.error) output += '\n' + toolResult.error;
         if (toolResult.signal) output += '\nSignal: ' + toolResult.signal;
         output += '\nExit code: ' + (toolResult.code || 0);
         streamEdit ();
         await editQueue;
         if (editError) throw editError;
         // Finished once the next AI message is appended (or now, if this is the last turn).
         toolDone = [toolHead, toolHead.replace ('\npending 1\n', '\nt-end ' + now () + '\n')];
         for (var waits = toolCall.op === 'agent' && ! toolResult.code, next = toolCall; waits && next; next = next.more) waits = /^ai-/.test (next.to);
         if (turn < 49 && ! waits) continue;
         await project.edit (rq.project, rq.body.file, toolDone [0], toolDone [1]);
         redis ('hset', 'project:' + rq.projectId, 'last', now ());
         break;
      }

      if (rq.body.reply) {
         var sameChat = rq.body.reply === rq.body.file;
         var replyChat = await project.read (rq.project, rq.body.reply);
         var heads = {};
         dale.go ((replyChat.code ? '' : replyChat.stdout).split (/^əəə head /m).slice (1), function (entry) {
            var head = entry.slice (0, entry.search (/^əəə body /m));
            var field = function (name) {return (head.match (new RegExp ('^' + name + ' (.+)$', 'm')) || []) [1]};
            heads [field ('id')] = {from: field ('from'), pending: field ('pending'), reply: field ('reply'), to: field ('to')};
         });
         var answered = {};
         dale.go (heads, function (head) {answered [head.to] = true});
         var pending = dale.fil (heads, undefined, function (head, id) {
            if (head.reply && head.from === rq.body.from && ! answered [id]) return head;
            if (! head.pending) return;
            while (heads [head.to]) head = heads [head.to];
            if (head.reply && head.from === rq.body.from) return head;
         }).length;
         if (! sameChat || ! pending) {
            var replied = await postMessage ({body: sameChat ? 'All agents finished.' : output.replace (/^əəə (head|body)/gm, '> əəə $1'), file: rq.body.reply, from: sameChat ? 'shell' : rq.body.to, to: rq.body.from});
            if (replied.code) clog ({priority: 'important', type: 'Agent reply error', error: replied.error, responseId});
         }
      }
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

      var clientId = {
         anthropic: Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString (),
         openai: 'app_EMoamEEZ73f0CkXaXp7hrann'
      } [rq.data.params.provider];

      var redirectURI = {
         anthropic: 'https://console.anthropic.com/oauth/code/callback',
         openai: 'http://localhost:1455/auth/callback'
      } [rq.data.params.provider];

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
         if (cicek.isMaster && new URL (CONFIG.baseURL).hostname === 'localhost') project.cleanup ();
      }
   });
});

if (cicek.isMaster) project.wake ();

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

var cicekFork = cicek.fork;
cicek.fork = function (request, response, route) {
   if (! /^\d{1,5}--/.test (request.headers.host || '')) return cicekFork (request, response, route);
   route [2].apply (route [2], [request, response].concat (route.slice (3)));
};

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
