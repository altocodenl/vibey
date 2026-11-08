var child  = require ('child_process');
var stream = require ('stream');

// *** HELPERS ***

var formatError = function (error) {
   if (! (error instanceof Error)) return error;
   return {error: error.name, message: error.message, stack: error.stack.split ('\n')};
}

var run = async function (... args) {

   if (typeof args.at (-1) === 'object') var command = args.slice (0, -1), options = args.at (-1);
   else                                  var command = args,               options = {};

   var output = {};

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

      ['stdout', 'stderr'].forEach (function (k) {
         proc [k].on ('error', onError);

         if (typeof options [k] === 'object' && typeof options [k].write === 'function') {
            var stop = function () {
               if (! options.detached) {
                  if (proc.exitCode === null && proc.signalCode === null) proc.kill ();
                  return;
               }
               try {
                  process.kill (-proc.pid);
               }
               catch (error) {}
            };
            options [k].on ('close', stop);
            options [k].on ('error', function (error) {
               onError (error);
               stop ();
            });
            proc [k].pipe (options [k], {end: false});
         }

         else if (typeof options [k] === 'function') {
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

         ['stdout', 'stderr'].forEach (function (k) {
            if (output [k] === undefined) return;
            output [k] = Buffer.concat (output [k]);
            if (options [k] === undefined) output [k] = output [k].toString ('utf8');
         });

         if (output.code === 0 || options.catch) resolve (output);
         else reject (output);
      });
   });
}

// *** PROTOCOL ***

var WINDOW = 1024 * 1024;

var runs = {};

var frame = function (kind, id, payload) {
   var head = Buffer.alloc (9);
   head.write (kind);
   head.writeUInt32BE (id, 1);
   head.writeUInt32BE (payload.length, 5);
   process.stdout.write (Buffer.concat ([head, payload]));
};

var framer = function (entry, kind) {
   return new stream.Writable ({
      write: function (chunk, encoding, callback) {
         frame (kind, entry.id, chunk);
         entry.window -= chunk.length;
         if (entry.window > 0) return callback ();
         entry.waiting.push (callback);
      }
   });
};

var credit = function (entry, bytes) {
   entry.window += bytes;
   if (entry.window > 0) entry.waiting.splice (0).forEach (function (callback) {
      callback ();
   });
};

var exit = function (id, result) {
   frame ('x', id, Buffer.from (JSON.stringify ({code: result.code, signal: result.signal, error: result.error})));
};

var start = function (id, payload) {
   if (runs [id]) return;
   try {
      var request = JSON.parse (payload);
   }
   catch (error) {
      return exit (id, {code: -1, error: formatError (error)});
   }
   if (! Array.isArray (request.command) || ! request.command.length) return exit (id, {code: -1, error: 'Invalid command'});

   var entry = runs [id] = {
      id: id,
      waiting: [],
      window: WINDOW,
   };
   entry.stdout = framer (entry, 'o');
   entry.stderr = framer (entry, 'e');

   run (... request.command, {
      catch: true,
      cwd: request.cwd || '/project',
      detached: true,
      env: request.env,
      stdout: entry.stdout,
      stderr: entry.stderr,
      onSpawn: function (spawned) {
         entry.proc = spawned;
         spawned.stdin.on ('error', function () {});
         if (spawned.pid !== undefined) frame ('s', id, Buffer.from (JSON.stringify ({pid: spawned.pid})));
      },
   }).catch (function (error) {
      return {code: -1, error: formatError (error)};
   }).then (async function (result) {
      await Promise.all ([entry.stdout, entry.stderr].map (function (writable) {
         return new Promise (function (resolve) {
            writable.end (resolve);
         });
      }));
      delete runs [id];
      exit (id, result);
   });
};

var control = function (kind, id, payload) {
   var entry = runs [id];
   if (! entry) return;
   if (kind === 'c') {
      try {
         credit (entry, JSON.parse (payload).bytes);
      }
      catch (error) {}
   }
   if (! entry.proc) return;
   if (kind === 'i') entry.proc.stdin.write (payload);
   if (kind === 'I') entry.proc.stdin.end ();
   if (kind === 'k') {
      credit (entry, Infinity);
      try {
         process.kill (-entry.proc.pid, JSON.parse (payload).signal);
      }
      catch (error) {}
   }
};

var shutdown = function () {
   Object.values (runs).forEach (function (entry) {
      entry.stdout.destroy ();
      entry.stderr.destroy ();
   });
};

var buffer = Buffer.alloc (0);

process.stdin.on ('data', function (chunk) {
   buffer = Buffer.concat ([buffer, chunk]);
   while (buffer.length >= 9 && buffer.length >= 9 + buffer.readUInt32BE (5)) {
      var end = 9 + buffer.readUInt32BE (5), kind = String.fromCharCode (buffer [0]), id = buffer.readUInt32BE (1);
      if (kind === 'r') start (id, buffer.subarray (9, end));
      else control (kind, id, buffer.subarray (9, end));
      buffer = buffer.subarray (end);
   }
});
process.stdin.on ('end', shutdown);
process.stdin.on ('error', shutdown);
process.stdout.on ('error', shutdown);
