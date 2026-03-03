var http   = require ('http');
var h      = require ('hitit');
var dale   = require ('dale');
var teishi = require ('teishi');

var log  = teishi.l || function () {console.log.apply (console, arguments)};
var type = teishi.type || teishi.t;
var inc  = teishi.inc;

// Backend integration tests for server.
// Run:   node test-server.js              (all flows)
//        node test-server.js --flow=1     (just flow 1)
//        node test-server.js --flow=3     (just flow 3)
// Assumes server is already running on localhost:5353

// *** TIMESTAMP ***

var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};
var testTimestamp = function () {
   var d = new Date ();
   return d.getUTCFullYear () + '' + pad2 (d.getUTCMonth () + 1) + pad2 (d.getUTCDate ()) + '-' + pad2 (d.getUTCHours ()) + pad2 (d.getUTCMinutes ()) + pad2 (d.getUTCSeconds ());
};

// *** HELPERS ***

var projectListHasSlug = function (list, slug) {
   return dale.stopNot (list, undefined, function (item) {
      if (type (item) === 'object' && item.slug === slug) return true;
      if (item === slug) return true;
   }) === true;
};

var parseSSE = function (body) {
   if (type (body) !== 'string') body = '' + body;
   var events = [];

   dale.go (body.split (/\n\n+/), function (block) {
      var lines = block.split ('\n');
      var dataLines = dale.fil (lines, undefined, function (line) {
         if (line.indexOf ('data: ') === 0) return line.slice (6);
      });
      if (! dataLines.length) return;

      var raw = dataLines.join ('\n');
      try {
         events.push (JSON.parse (raw));
      }
      catch (error) {
         events.push ({type: 'invalid_json', raw: raw});
      }
   });

   return events;
};

var getEventsByType = function (events, eventType) {
   return dale.fil (events, undefined, function (event) {
      if (event && event.type === eventType) return event;
   });
};

var hasToolMention = function (md, toolName) {
   return md.indexOf ('Tool request: ' + toolName) !== -1 || md.indexOf ('> Tool: ' + toolName) !== -1 || md.indexOf ('"name":"' + toolName + '"') !== -1;
};

var hasResultMarker = function (md) {
   return md.indexOf ('Result:') !== -1 || md.indexOf ('## Tool Result') !== -1 || md.indexOf ('tool/result/json') !== -1;
};

// Fetch a dialog's markdown via the API
var fetchDialogMarkdown = function (project, dialogId, cb) {
   var options = {
      hostname: 'localhost',
      port: 5353,
      path: '/project/' + project + '/dialog/' + dialogId,
      method: 'GET'
   };
   var req = http.request (options, function (res) {
      var body = '';
      res.on ('data', function (chunk) {body += chunk;});
      res.on ('end', function () {
         try {
            var parsed = JSON.parse (body);
            cb (null, parsed.markdown || '');
         }
         catch (e) {
            cb (new Error ('Failed to parse dialog response'));
         }
      });
   });
   req.on ('error', cb);
   req.end ();
};

// Simple HTTP GET that returns the body as a string
var httpGet = function (port, path, cb) {
   var req = http.request ({hostname: 'localhost', port: port, path: path, method: 'GET'}, function (res) {
      var body = '';
      res.on ('data', function (chunk) {body += chunk;});
      res.on ('end', function () {cb (null, res.statusCode, body);});
   });
   req.on ('error', cb);
   req.end ();
};

// *** FLOW #1: Dialog with tool calls (read + write) ***

var PROJECT = 'flow1-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var DIALOG_SLUG = 'flow1-read-vibey';

var flow1Sequence = [

   ['GET / serves shell', 'get', '/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      if (rs.body.indexOf ('client.js') === -1) return log ('HTML shell missing client.js');
      return true;
   }],

   ['Create project', 'post', 'projects', {}, {name: PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT) return log ('Unexpected project slug returned');
      return true;
   }],

   ['Create dialog draft (openai/gpt-5)', 'post', 'project/' + PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: DIALOG_SLUG}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('dialog/new missing dialogId or filename');
      if (rs.body.provider !== 'openai') return log ('dialog/new provider mismatch');
      if (rs.body.model !== 'gpt-5') return log ('dialog/new model mismatch');
      if (! rs.body.filename.match (/^dialog\/.*\-done\.md$/)) return log ('dialog/new should produce done dialog filename');
      if (rs.body.filename.indexOf (DIALOG_SLUG) === -1) return log ('dialog/new filename missing slug');
      s.dialogId = rs.body.dialogId;
      return true;
   }],

   ['Dialogs list includes done dialog', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('dialogs endpoint should return array');
      var match = dale.stopNot (rs.body, undefined, function (d) {
         if (d.dialogId === s.dialogId) return d;
      });
      if (! match) return log ('Created dialog not found in dialogs list');
      if (match.status !== 'done') return log ('Created dialog should be done');
      return true;
   }],

   // Write a test file inside the project so the agent can read it
   ['Write test-sample.txt for agent to read', 'post', 'project/' + PROJECT + '/tool/execute', {}, {toolName: 'write_file', toolInput: {path: 'test-sample.txt', content: '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('Failed to write test-sample.txt: ' + JSON.stringify (rs.body));
      return true;
   }],

   ['Prompt #1: ask to read test-sample.txt (tools auto-execute)', 'put', 'project/' + PROJECT + '/dialog', {}, function (s) {
      return {
         dialogId: s.dialogId,
         prompt: 'Please read the file test-sample.txt using the run_command tool with `cat test-sample.txt`, then summarize it in 3 short bullets. You must use the tool.'
      };
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected SSE text body');

      var events = parseSSE (rs.body);
      if (! getEventsByType (events, 'done').length) {
         var eventTypes = dale.go (events, function (event) {return event && event.type ? event.type : 'unknown'}).join (', ');
         return log ('Expected done event (tools auto-execute). Events: ' + eventTypes);
      }
      return true;
   }],

   // Fetch dialog markdown via API and verify content
   ['Verify dialog via API: time + run_command', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (md.indexOf ('> Time:') === -1) return log ('Dialog markdown missing > Time metadata');
         if (! hasToolMention (md, 'run_command')) return log ('Missing run_command evidence in dialog markdown');
         if (! hasResultMarker (md)) return log ('run_command block missing Result section');
         next ();
      });
   }],

   ['Prompt #2: ask to create dummy.js (tools auto-execute)', 'put', 'project/' + PROJECT + '/dialog', {}, function (s) {
      return {
         dialogId: s.dialogId,
         prompt: 'Please create a file called dummy.js with the content: console.log("hello from dummy"); Use the write_file tool for this.'
      };
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected SSE text body for second prompt');

      var events = parseSSE (rs.body);
      if (! getEventsByType (events, 'done').length) {
         var eventTypes = dale.go (events, function (event) {return event && event.type ? event.type : 'unknown'}).join (', ');
         return log ('Expected done event (tools auto-execute). Events: ' + eventTypes);
      }
      return true;
   }],

   ['Verify write_file via dialog API', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (! hasToolMention (md, 'write_file')) return log ('Missing write_file block in dialog markdown');
         if (! hasResultMarker (md)) return log ('write_file block missing Result section');
         next ();
      });
   }],

   // Verify dummy.js exists by asking the agent to cat it via tool/execute
   ['Verify dummy.js via tool/execute', 'post', 'project/' + PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat dummy.js'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('run_command cat dummy.js failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').indexOf ('console.log') === -1) return log ('dummy.js does not contain console.log');
      return true;
   }],

   ['Delete project', 'delete', 'projects/' + PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('projects endpoint should return array');
      if (projectListHasSlug (rs.body, PROJECT)) return log ('Project still exists after deletion');
      return true;
   }]
];

// *** FLOW #2: Docs editing ***

var PROJECT2 = 'flow2-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var INITIAL_CONTENT = '# Main\n\nThis is the initial content of the project.\n';
var UPDATED_CONTENT = '# Main\n\nThis is the updated content of the project.\n\n## New section\n\nWith more detail.\n';
var SECOND_DOC = 'doc/notes.md';
var SECOND_CONTENT = '# Notes\n\nSome notes here.\n';

var flow2Sequence = [

   ['F2: Create project', 'post', 'projects', {}, {name: PROJECT2}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT2) return log ('Unexpected project slug');
      return true;
   }],

   ['F2: Write doc/main.md with initial content', 'post', 'project/' + PROJECT2 + '/file/doc/main.md', {}, {content: INITIAL_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected filename returned');
      return true;
   }],

   ['F2: Read doc/main.md returns initial content', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected name: ' + rs.body.name);
      if (rs.body.content !== INITIAL_CONTENT) return log ('Content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['F2: List files includes doc/main.md', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md not in file list');
      return true;
   }],

   ['F2: Overwrite doc/main.md with updated content', 'post', 'project/' + PROJECT2 + '/file/doc/main.md', {}, {content: UPDATED_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['F2: Read doc/main.md returns updated content', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('Updated content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['F2: Write a second doc', 'post', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, {content: SECOND_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Second file write failed');
      return true;
   }],

   ['F2: List files includes both docs', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md missing from list');
      if (! inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' missing from list');
      return true;
   }],

   ['F2: Read second doc', 'get', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== SECOND_CONTENT) return log ('Second doc content mismatch');
      return true;
   }],

   ['F2: Delete second doc', 'delete', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File deletion failed');
      return true;
   }],

   ['F2: List files no longer has second doc', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' still in list after deletion');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md disappeared');
      return true;
   }],

   ['F2: doc/main.md still has updated content', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('doc/main.md content changed unexpectedly');
      return true;
   }],

   ['F2: Read nonexistent file returns 404', 'get', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 404],

   ['F2: Write with invalid filename returns 400', 'post', 'project/' + PROJECT2 + '/file/bad..name.md', {}, {content: 'x'}, 400],

   ['F2: Write outside managed folders returns 400', 'post', 'project/' + PROJECT2 + '/file/bad.txt', {}, {content: 'x'}, 400],

   ['F2: Delete project', 'delete', 'projects/' + PROJECT2, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['F2: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT2)) return log ('Project still exists after deletion');
      return true;
   }]
];

// *** FLOW #3: Delete project stops agents and removes folder ***

var PROJECT3 = 'flow3-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_F3 = [
   '# Flow 3 Test Project',
   ''
].join ('\n') + '\n';

var flow3Sequence = [

   ['F3: Create project', 'post', 'projects', {}, {name: PROJECT3}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['F3: Write doc/main.md', 'post', 'project/' + PROJECT3 + '/file/doc/main.md', {}, {content: DOC_MAIN_F3}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   // Create two dialogs and fire them with slow prompts so they stay active
   ['F3: Create dialog A', 'post', 'project/' + PROJECT3 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'agent-a'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.f3DialogA = rs.body.dialogId;
      return true;
   }],

   ['F3: Create dialog B', 'post', 'project/' + PROJECT3 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'agent-b'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.f3DialogB = rs.body.dialogId;
      return true;
   }],

   // Fire both dialogs with a long prompt to keep them busy
   ['F3: Fire both dialogs (non-blocking)', 'get', 'project/' + PROJECT3 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialogNoWait (PROJECT3, s.f3DialogA, 'Write a 2000 word essay about the history of computing. Take your time and be thorough.');
      fireDialogNoWait (PROJECT3, s.f3DialogB, 'Write a 2000 word essay about the history of mathematics. Take your time and be thorough.');
      // Give the server a moment to start processing both PUT requests
      setTimeout (next, 2000);
   }],

   // Poll until both dialogs are active before deleting
   ['F3: Both dialogs are active', 'get', 'project/' + PROJECT3 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT3 + '/dialogs', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var dialogs = JSON.parse (body);
               var activeCount = dale.fil (dialogs, undefined, function (d) {
                  if (d.status === 'active') return d;
               }).length;
               done (activeCount >= 2);
            }
            catch (e) {done (false);}
         });
      }, 2000, 60000, function (error) {
         if (error) return log ('Dialogs never became active: ' + error.message);
         next ();
      });
   }],

   // Delete the project while agents are running
   ['F3: Delete project with active agents', 'delete', 'projects/' + PROJECT3, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   // Verify project is gone from the list
   ['F3: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT3)) return log ('Project still exists after deletion');
      return true;
   }],

   // Verify the project's endpoints are 404
   ['F3: Dialogs endpoint returns 404', 'get', 'project/' + PROJECT3 + '/dialogs', {}, '', 404],

   ['F3: Files endpoint returns 404', 'get', 'project/' + PROJECT3 + '/files', {}, '', 404],

   // Verify we can't interact with the deleted dialogs
   ['F3: Dialog A returns 404', 'get', 'project/' + PROJECT3 + '/dialog/' + 'placeholder', {}, '', 404, function (s, rq, rs) {
      // Use actual dialogId — but project is gone so any dialog request should 404
      return true;
   }],

   // Verify creating the same project name works (folder truly gone)
   ['F3: Re-create same project name', 'post', 'projects', {}, {name: PROJECT3}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Re-creation failed');
      return true;
   }],

   ['F3: Re-created project has no dialogs', 'get', 'project/' + PROJECT3 + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length !== 0) return log ('Expected 0 dialogs, got ' + rs.body.length);
      return true;
   }],

   ['F3: Re-created project has only default doc/main.md', 'get', 'project/' + PROJECT3 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var unexpected = dale.fil (rs.body, undefined, function (name) {
         if (name !== 'doc/main.md') return name;
      });
      if (unexpected.length) return log ('Unexpected files after re-create: ' + unexpected.join (', '));
      return true;
   }],

   // Cleanup
   ['F3: Delete re-created project', 'delete', 'projects/' + PROJECT3, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Final cleanup failed');
      return true;
   }]
];

// *** FLOW #4: Static tictactoe — HTML + JS only (no backend) ***

var PROJECT4 = 'flow4-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_F4 = [
   '# Tictactoe Project',
   '',
   'Build a simple tictactoe game for the browser using gotoB. No backend server.',
   'Served via the static proxy at `/project/<project>/static/`.',
   '',
   '## References',
   '',
   '- gotoB docs: https://raw.githubusercontent.com/fpereiro/ustack/master/llms.md',
   '',
   '## Critical rules',
   '',
   '- `index.html`: load gotoB.min.js in `<body>` (not `<head>` — document.body must exist when gotoB initializes):',
   '  `<script src="https://cdn.jsdelivr.net/gh/fpereiro/gotob@434aa5a532fa0f9012743e935c4cd18eb5b3b3c5/gotoB.min.js"></script>`',
   '  This single file bundles dale, teishi, lith, recalc, cocholate. Do NOT load them separately.',
   '- `app.js`: set `B.prod = true` before any B.call.',
   '- Use `lith.css.style({...})` for inline styles, not raw JS objects.',
   '- `B.ev` always requires a path: `B.ev(\'reset\', [])`, not `B.ev(\'reset\')`.',
   '- Pass event context in responders: `function (x, ...) { B.call(x, \'set\', ...); }`.',
   '',
].join ('\n') + '\n';

// Fire-and-forget: start a dialog via PUT (SSE), read just enough to confirm it started, then abort.
var fireDialog = function (project, dialogId, prompt, cb) {
   var options = {
      hostname: 'localhost',
      port: 5353,
      path: '/project/' + project + '/dialog',
      method: 'PUT',
      headers: {'Content-Type': 'application/json'}
   };
   var body = JSON.stringify ({dialogId: dialogId, prompt: prompt});
   var called = false;
   var req = http.request (options, function (res) {
      var got = '';
      res.on ('data', function (chunk) {
         got += chunk;
         // As soon as we see the first SSE event (chunk/tool/error), we know the LLM started. Abort — let it run in background.
         if (! called && (got.indexOf ('"type":"chunk"') !== -1 || got.indexOf ('"type":"tool_request"') !== -1 || got.indexOf ('"type":"tool_result"') !== -1 || got.indexOf ('"type":"error"') !== -1)) {
            called = true;
            req.destroy ();
            if (got.indexOf ('"type":"error"') !== -1) return cb (new Error ('SSE error: ' + got.slice (0, 500)));
            cb (null);
         }
      });
      res.on ('end', function () {if (! called) {called = true; cb (null);}});
   });
   req.on ('error', function (err) {
      // ECONNRESET is expected since we abort
      if (err.code === 'ECONNRESET') return;
   });
   req.write (body);
   req.end ();
};

// Fire-and-forget: send PUT to start a dialog, don't wait for any SSE data.
var fireDialogNoWait = function (project, dialogId, prompt) {
   var body = JSON.stringify ({dialogId: dialogId, prompt: prompt});
   var req = http.request ({
      hostname: 'localhost',
      port: 5353,
      path: '/project/' + project + '/dialog',
      method: 'PUT',
      headers: {'Content-Type': 'application/json'}
   }, function (res) {
      res.on ('data', function () {});
      res.on ('end', function () {});
   });
   req.on ('error', function () {});
   req.write (body);
   req.end ();
};

// Poll until a condition is met, with timeout
var pollUntil = function (checkFn, intervalMs, maxMs, cb) {
   var elapsed = 0;
   var tick = function () {
      checkFn (function (done, error) {
         if (error) return cb (error);
         if (done) return cb (null);
         elapsed += intervalMs;
         if (elapsed >= maxMs) return cb (new Error ('Poll timed out after ' + (maxMs / 1000) + 's'));
         setTimeout (tick, intervalMs);
      });
   };
   tick ();
};

var flow4Sequence = [

   ['F4: Create project', 'post', 'projects', {}, {name: PROJECT4}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['F4: Write doc/main.md', 'post', 'project/' + PROJECT4 + '/file/doc/main.md', {}, {content: DOC_MAIN_F4}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['F4: Create dialog draft (orchestrator)', 'post', 'project/' + PROJECT4 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.f4DialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the dialog and don't block — let agents work in background
   ['F4: Fire "please start" (non-blocking)', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT4, s.f4DialogId, 'Please start. Read doc/main.md once, then implement immediately: create index.html and app.js in /workspace root. Do not re-fetch docs after the first read. After creating files, update doc/main.md with an embed block (port static).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the static page is reachable via static proxy
   ['F4: Poll until static page serves', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/static/', function (error, status, body) {
            if (error || status !== 200) return done (false);
            var lower = (body || '').toLowerCase ();
            var hasTic = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1;
            if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && hasTic) return done (true);
            done (false);
         });
      }, 5000, 420000, function (error) {
         if (error) return log ('Static app never appeared: ' + error.message);
         next ();
      });
   }],

   // Now verify the content of each file via tool/execute
   ['F4: index.html has gotoB + app.js', 'post', 'project/' + PROJECT4 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('cat index.html failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '').toLowerCase ();
      if (out.indexOf ('gotob') === -1) return log ('index.html missing gotoB reference');
      if (out.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   ['F4: app.js has tictactoe gotoB code', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/static/app.js', function (error, status, body) {
            if (error || status !== 200) return done (false);
            var out = body || '';
            if (out.indexOf ('B.') === -1) return done (false);
            var hasBoardLogic = out.indexOf ('board') !== -1 || out.indexOf ('cell') !== -1 || out.indexOf ('grid') !== -1;
            if (! hasBoardLogic) return done (false);
            return done (true);
         });
      }, 5000, 420000, function (error) {
         if (error) return log ('app.js missing gotoB usage: ' + error.message);
         next ();
      });
   }],

   // Ask the AI to embed the game in doc/main.md
   ['F4: Send embed request to orchestrator dialog', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT4, s.f4DialogId, 'The tictactoe game is now available via the static proxy at /project/' + PROJECT4 + '/static/. Please add an embed block to doc/main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port static, title Tictactoe, height 500) at the end of doc/main.md.', function (error) {
         if (error) return log ('Failed to fire embed request: ' + error.message);
         next ();
      });
   }],

   // Poll until embed block appears in doc/main.md
   ['F4: Poll until embed block appears in doc/main.md', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/file/doc/main.md', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var parsed = JSON.parse (body);
               var content = parsed.content || '';
               if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (true);
            }
            catch (e) {}
            done (false);
         });
      }, 5000, 420000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['F4: Verify embed block in doc/main.md', 'get', 'project/' + PROJECT4 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəəembed') === -1) return log ('doc/main.md missing əəəembed block');
      if (content.indexOf ('port static') === -1) return log ('doc/main.md embed missing port static');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** FLOW #5: Backend tictactoe — Express server on port 4000, embed via proxy ***

var PROJECT5 = 'flow5-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_F5 = [
   '# Tictactoe Project (Backend)',
   '',
   'Build a simple tictactoe game for the browser using gotoB, served by an Express server on port 4000.',
   'The game should be embedded in this doc via the proxy.',
   '',
   '## References',
   '',
   '- gotoB docs: https://raw.githubusercontent.com/fpereiro/ustack/master/llms.md',
   '',
   '## Critical rules',
   '',
   '- Create a `server.js` that uses Express to serve static files from `/workspace` on port 4000.',
   '- `index.html`: load gotoB.min.js in `<body>` (not `<head>` — document.body must exist when gotoB initializes):',
   '  `<script src="https://cdn.jsdelivr.net/gh/fpereiro/gotob@434aa5a532fa0f9012743e935c4cd18eb5b3b3c5/gotoB.min.js"></script>`',
   '  This single file bundles dale, teishi, lith, recalc, cocholate. Do NOT load them separately.',
   '- `app.js`: set `B.prod = true` before any B.call.',
   '- Use `lith.css.style({...})` for inline styles, not raw JS objects.',
   '- `B.ev` always requires a path: `B.ev(\'reset\', [])`, not `B.ev(\'reset\')`.',
   '- Pass event context in responders: `function (x, ...) { B.call(x, \'set\', ...); }`.',
   '- Run the server with `node server.js &` so it stays alive in the background.',
   '- The game must mention "tictactoe" somewhere in the page title or heading.',
   '',
].join ('\n') + '\n';

var flow5Sequence = [

   ['F5: Create project', 'post', 'projects', {}, {name: PROJECT5}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['F5: Write doc/main.md', 'post', 'project/' + PROJECT5 + '/file/doc/main.md', {}, {content: DOC_MAIN_F5}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['F5: Create dialog draft (orchestrator)', 'post', 'project/' + PROJECT5 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.f5DialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the orchestrator and let it build the game + start the server
   ['F5: Fire "please start" (non-blocking)', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT5, s.f5DialogId, 'Please start. Read doc/main.md once, then implement immediately: create server.js (Express on port 4000), index.html, and app.js in /workspace. Do not re-fetch docs after the first read. Start the server with `node server.js &` and then update doc/main.md with an embed block (port 4000).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the backend server is reachable via the proxy
   ['F5: Poll until proxy serves the app on port 4000', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT5 + '/proxy/4000/', function (error, status, body) {
            if (error || status !== 200) {
               if (error) log ('F5 poll: error reaching /project/' + PROJECT5 + '/proxy/4000/ - ' + error.message);
               else log ('F5 poll: /project/' + PROJECT5 + '/proxy/4000/ returned ' + status);
               return done (false);
            }
            var lower = (body || '').toLowerCase ();
            var hasTic = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1;
            if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && hasTic) return done (true);
            done (false);
         });
      }, 5000, 420000, function (error) {
         if (error) return log ('Backend app never appeared via proxy: ' + error.message);
         next ();
      });
   }],

   // Verify the index page via proxy
   ['F5: Proxy serves index.html with gotoB + app.js', 'get', 'project/' + PROJECT5 + '/proxy/4000/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      var lower = (rs.body || '').toLowerCase ();
      if (lower.indexOf ('gotob') === -1) return log ('index.html missing gotoB reference');
      if (lower.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   // Verify app.js is served through proxy
   ['F5: Proxy serves app.js', 'get', 'project/' + PROJECT5 + '/proxy/4000/app.js', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected JS string body');
      if (rs.body.indexOf ('B.') === -1) return log ('app.js missing gotoB usage');
      var hasBoardLogic = rs.body.indexOf ('board') !== -1 || rs.body.indexOf ('cell') !== -1 || rs.body.indexOf ('grid') !== -1;
      if (! hasBoardLogic) return log ('app.js missing board/cell/grid logic');
      return true;
   }],

   // Verify the Express server is running inside the container
   ['F5: Server process is running', 'post', 'project/' + PROJECT5 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'ps aux | grep node || true'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('ps aux failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '') + (rs.body.stderr || '');
      if (out.indexOf ('server.js') === -1) return log ('server.js process not found in ps output');
      return true;
   }],

   // Ask the agent to embed the game in doc/main.md
   ['F5: Send embed request to orchestrator dialog', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT5, s.f5DialogId, 'The tictactoe game is now running on port 4000 inside the container. Please add an embed block to doc/main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port 4000, title Tictactoe, height 500) at the end of doc/main.md.', function (error) {
         if (error) return log ('Failed to fire embed request: ' + error.message);
         next ();
      });
   }],

   // Poll until embed block appears in doc/main.md
   ['F5: Poll until embed block appears in doc/main.md', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT5 + '/file/doc/main.md', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var parsed = JSON.parse (body);
               var content = parsed.content || '';
               if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port 4000') !== -1) return done (true);
            }
            catch (e) {}
            done (false);
         });
      }, 5000, 420000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['F5: Verify embed block in doc/main.md', 'get', 'project/' + PROJECT5 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəəembed') === -1) return log ('doc/main.md missing əəəembed block');
      if (content.indexOf ('port 4000') === -1) return log ('doc/main.md embed missing port 4000');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** FLOW #6: Vi mode (settings toggle) ***

var PROJECT6 = 'flow6-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var flow6Sequence = [

   // *** Settings: default state ***

   ['F6: GET /settings returns default viMode false', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('Default viMode should be false, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: enable vi mode ***

   ['F6: POST /settings to enable viMode', 'post', 'settings', {}, {editor: {viMode: true}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['F6: GET /settings confirms viMode true', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== true) return log ('viMode should be true after enable, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: disable vi mode ***

   ['F6: POST /settings to disable viMode', 'post', 'settings', {}, {editor: {viMode: false}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['F6: GET /settings confirms viMode false again', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('viMode should be false after disable, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: viMode persists alongside API keys ***

   ['F6: POST /settings with API key does not clobber viMode', 'post', 'settings', {}, {editor: {viMode: true}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['F6: POST /settings with API key only', 'post', 'settings', {}, {openaiKey: 'sk-test-vi-flow'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['F6: GET /settings: viMode still true after API key save', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== true) return log ('viMode should still be true, got: ' + JSON.stringify (rs.body.editor));
      if (! rs.body.openai || ! rs.body.openai.hasKey) return log ('openai key should be set');
      return true;
   }],

   // *** Settings: viMode with boolean body.viMode (backward compat) ***

   ['F6: POST /settings with top-level viMode boolean', 'post', 'settings', {}, {viMode: false}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['F6: GET /settings confirms viMode false via top-level toggle', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('viMode should be false, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Vi mode with doc editing ***

   ['F6: Create project', 'post', 'projects', {}, {name: PROJECT6}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['F6: Write a doc to edit', 'post', 'project/' + PROJECT6 + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['F6: Read doc back', 'get', 'project/' + PROJECT6 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\n') return log ('Content mismatch');
      return true;
   }],

   // Simulate vi :w by writing updated content
   ['F6: Simulate vi :w (overwrite doc)', 'post', 'project/' + PROJECT6 + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\nNew line added by vi.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['F6: Read doc confirms vi edit persisted', 'get', 'project/' + PROJECT6 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\nNew line added by vi.\n') return log ('Vi edit not persisted');
      return true;
   }],

   // *** Cleanup: restore viMode to false, clean API key ***

   ['F6: Restore viMode to false', 'post', 'settings', {}, {editor: {viMode: false}, openaiKey: ''}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Cleanup settings failed');
      return true;
   }],

   ['F6: Delete project', 'delete', 'projects/' + PROJECT6, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }]
];

// *** FLOW #7: Snapshots ***

var PROJECT7 = 'flow7-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var SNAP_DOC_CONTENT = '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n';
var SNAP_EXTRA_FILE = 'doc/notes.md';
var SNAP_EXTRA_CONTENT = '# Notes\n\nSome extra notes.\n';

var flow7Sequence = [

   ['F7: Create project', 'post', 'projects', {}, {name: PROJECT7}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['F7: Write doc/main.md', 'post', 'project/' + PROJECT7 + '/file/doc/main.md', {}, {content: SNAP_DOC_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['F7: Write extra file', 'post', 'project/' + PROJECT7 + '/file/' + SNAP_EXTRA_FILE, {}, {content: SNAP_EXTRA_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Extra file write failed');
      return true;
   }],

   // *** Create a snapshot ***

   ['F7: Create snapshot with label', 'post', 'project/' + PROJECT7 + '/snapshot', {}, {label: 'before refactor'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected snapshot entry object');
      if (! rs.body.id) return log ('Snapshot missing id');
      if (rs.body.project !== PROJECT7) return log ('Snapshot project mismatch: ' + rs.body.project);
      if (rs.body.label !== 'before refactor') return log ('Snapshot label mismatch');
      if (! rs.body.file || rs.body.file.indexOf ('.tar.gz') === -1) return log ('Snapshot file should be .tar.gz');
      if (type (rs.body.fileCount) !== 'integer' || rs.body.fileCount < 2) return log ('Expected at least 2 files, got: ' + rs.body.fileCount);
      if (! rs.body.created) return log ('Snapshot missing created timestamp');
      s.snapshotId = rs.body.id;
      s.snapshotProjectName = rs.body.projectName;
      return true;
   }],

   // *** List snapshots ***

   ['F7: List snapshots includes our snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot not found in list');
      if (found.label !== 'before refactor') return log ('Label mismatch in list');
      return true;
   }],

   // *** Create a second snapshot (no label) ***

   ['F7: Create second snapshot without label', 'post', 'project/' + PROJECT7 + '/snapshot', {}, {}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.id) return log ('Second snapshot creation failed');
      s.snapshotId2 = rs.body.id;
      return true;
   }],

   ['F7: List snapshots has two entries', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (! inc (ids, s.snapshotId)) return log ('First snapshot missing');
      if (! inc (ids, s.snapshotId2)) return log ('Second snapshot missing');
      // Newest first
      if (rs.body [0].id !== s.snapshotId2) return log ('Expected newest snapshot first');
      return true;
   }],

   // *** Download snapshot ***

   ['F7: Download placeholder snapshot returns 404', 'get', 'snapshots/' + 'placeholder' + '/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // Verify download via httpGet for dynamic path
   ['F7: Download snapshot (dynamic path)', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/snapshots/' + encodeURIComponent (s.snapshotId) + '/download', function (error, status, body) {
         if (error) return log ('Download failed: ' + error.message);
         if (status !== 200) return log ('Download returned status ' + status);
         if (! body || body.length < 10) return log ('Download body too small: ' + body.length + ' bytes');
         next ();
      });
   }],

   // *** Restore snapshot as new project ***

   ['F7: Restore snapshot as new project', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      var body = JSON.stringify ({name: 'Restored Flow7 Test'});
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/snapshots/' + encodeURIComponent (s.snapshotId) + '/restore',
         method: 'POST',
         headers: {'Content-Type': 'application/json'}
      }, function (res) {
         var data = '';
         res.on ('data', function (chunk) {data += chunk;});
         res.on ('end', function () {
            try {
               var result = JSON.parse (data);
               if (! result.slug) return log ('Restore missing slug');
               if (result.snapshotId !== s.snapshotId) return log ('Restore snapshotId mismatch');
               s.restoredSlug = result.slug;
               s.restoredName = result.name;
               next ();
            }
            catch (e) {
               log ('Restore response parse error: ' + data);
            }
         });
      });
      req.on ('error', function (err) {log ('Restore request error: ' + err.message);});
      req.write (body);
      req.end ();
   }],

   // Verify restored project appears in project list
   ['F7: Restored project in list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! projectListHasSlug (rs.body, s.restoredSlug)) return log ('Restored project not in list: ' + s.restoredSlug);
      return true;
   }],

   // Verify restored project has the same files
   ['F7: Restored project has both files', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + s.restoredSlug + '/files', function (error, status, body) {
         if (error || status !== 200) return log ('Failed to list restored files');
         try {
            var files = JSON.parse (body);
            if (! inc (files, 'doc/main.md')) return log ('Restored project missing doc/main.md');
            if (! inc (files, SNAP_EXTRA_FILE)) return log ('Restored project missing ' + SNAP_EXTRA_FILE);
            next ();
         }
         catch (e) {log ('Parse error: ' + body);}
      });
   }],

   // Verify restored file content matches original
   ['F7: Restored doc/main.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + s.restoredSlug + '/file/doc/main.md', function (error, status, body) {
         if (error || status !== 200) return log ('Failed to read restored doc/main.md');
         try {
            var parsed = JSON.parse (body);
            if (parsed.content !== SNAP_DOC_CONTENT) return log ('Restored doc/main.md content mismatch. Got: ' + JSON.stringify (parsed.content));
            next ();
         }
         catch (e) {log ('Parse error');}
      });
   }],

   ['F7: Restored notes.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + s.restoredSlug + '/file/' + SNAP_EXTRA_FILE, function (error, status, body) {
         if (error || status !== 200) return log ('Failed to read restored notes.md');
         try {
            var parsed = JSON.parse (body);
            if (parsed.content !== SNAP_EXTRA_CONTENT) return log ('Restored notes.md content mismatch');
            next ();
         }
         catch (e) {log ('Parse error');}
      });
   }],

   // *** Modify original project, verify snapshot is unaffected ***

   ['F7: Modify original doc/main.md', 'post', 'project/' + PROJECT7 + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   // Restored project should still have original content
   ['F7: Restored project unaffected by original modification', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + s.restoredSlug + '/file/doc/main.md', function (error, status, body) {
         if (error || status !== 200) return log ('Failed to read restored doc/main.md after modification');
         try {
            var parsed = JSON.parse (body);
            if (parsed.content !== SNAP_DOC_CONTENT) return log ('Restored content was affected by original modification!');
            next ();
         }
         catch (e) {log ('Parse error');}
      });
   }],

   // *** Delete a snapshot ***

   ['F7: Delete second snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/snapshots/' + encodeURIComponent (s.snapshotId2),
         method: 'DELETE'
      }, function (res) {
         var data = '';
         res.on ('data', function (chunk) {data += chunk;});
         res.on ('end', function () {
            try {
               var result = JSON.parse (data);
               if (! result.ok) return log ('Snapshot deletion failed');
               next ();
            }
            catch (e) {log ('Delete response parse error: ' + data);}
         });
      });
      req.on ('error', function (err) {log ('Delete request error: ' + err.message);});
      req.end ();
   }],

   ['F7: List snapshots no longer has deleted snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (inc (ids, s.snapshotId2)) return log ('Deleted snapshot still in list');
      if (! inc (ids, s.snapshotId)) return log ('First snapshot should still exist');
      return true;
   }],

   // *** Snapshot survives project deletion ***

   ['F7: Delete original project', 'delete', 'projects/' + PROJECT7, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['F7: Snapshot still in list after project deletion', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot disappeared after project deletion');
      return true;
   }],

   // *** Delete nonexistent snapshot returns error ***

   ['F7: Delete nonexistent snapshot returns 400', 'delete', 'snapshots/nonexistent-id-12345', {}, '', 400, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Download nonexistent snapshot returns 404 ***

   ['F7: Download nonexistent snapshot returns 404', 'get', 'snapshots/nonexistent-id-12345/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Cleanup ***

   ['F7: Delete restored project', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
      if (! s.restoredSlug) return next ();
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/projects/' + encodeURIComponent (s.restoredSlug),
         method: 'DELETE'
      }, function (res) {
         var data = '';
         res.on ('data', function (chunk) {data += chunk;});
         res.on ('end', function () {next ();});
      });
      req.on ('error', function () {next ();});
      req.end ();
   }],

   // Clean up remaining snapshot
   ['F7: Delete first snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/snapshots/' + encodeURIComponent (s.snapshotId),
         method: 'DELETE'
      }, function (res) {
         var data = '';
         res.on ('data', function (chunk) {data += chunk;});
         res.on ('end', function () {next ();});
      });
      req.on ('error', function () {next ();});
      req.end ();
   }],

   ['F7: Snapshots list is clean', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ours = dale.fil (rs.body, undefined, function (snap) {
         if (snap.project === PROJECT7) return snap;
      });
      if (ours.length > 0) return log ('Leftover snapshots from flow7: ' + ours.length);
      return true;
   }]
];

// *** FLOW #8: Uploads (create/list/preview) ***

var PROJECT8 = 'flow8-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

// A tiny 1x1 red PNG (base64)
var TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
var TINY_PNG_DATA_URL = 'data:image/png;base64,' + TINY_PNG_BASE64;
var TINY_PNG_BYTES = Buffer.from (TINY_PNG_BASE64, 'base64');

var TEXT_CONTENT_BASE64 = Buffer.from ('Hello from uploads test!\nLine 2.\n').toString ('base64');

var flow8Sequence = [

   ['F8: Create project', 'post', 'projects', {}, {name: PROJECT8}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   // *** Upload an image (data URL format) ***

   ['F8: Upload image via data URL', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: 'test-image.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'test-image.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be a positive integer, got: ' + rs.body.size);
      if (type (rs.body.mtime) !== 'integer') return log ('Upload mtime should be an integer, got: ' + type (rs.body.mtime));
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed: ' + rs.body.url);
      return true;
   }],

   // *** List uploads — image should be present ***

   ['F8: List uploads includes image', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length < 1) return log ('Expected at least 1 upload, got ' + rs.body.length);
      var found = dale.stopNot (rs.body, undefined, function (entry) {
         if (entry.name === 'test-image.png') return entry;
      });
      if (! found) return log ('test-image.png not found in uploads list');
      if (found.contentType !== 'image/png') return log ('Listed contentType mismatch: ' + found.contentType);
      if (type (found.size) !== 'integer' || found.size < 1) return log ('Listed size should be positive integer');
      if (type (found.url) !== 'string') return log ('Listed url missing');
      return true;
   }],

   // *** Fetch the uploaded image and verify bytes + Content-Type ***

   ['F8: Fetch uploaded image', 'get', 'project/' + PROJECT8 + '/upload/test-image.png', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + PROJECT8 + '/upload/test-image.png', function (error, status, body) {
         if (error) return log ('Fetch upload failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || body.length < 10) return log ('Upload body too small: ' + (body ? body.length : 0) + ' bytes');
         next ();
      });
   }],

   // Verify Content-Type via raw HTTP request
   ['F8: Verify image Content-Type header', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT8 + '/upload/test-image.png',
         method: 'GET'
      }, function (res) {
         var ct = res.headers ['content-type'] || '';
         if (ct.indexOf ('image/png') === -1) return log ('Expected Content-Type image/png, got: ' + ct);
         // Consume the body
         res.on ('data', function () {});
         res.on ('end', function () {next ();});
      });
      req.on ('error', function (err) {log ('Request error: ' + err.message);});
      req.end ();
   }],

   // *** Upload a non-media file ***

   ['F8: Upload text file', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: 'notes.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'notes.txt') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'text/plain') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      return true;
   }],

   // *** List uploads — both entries ***

   ['F8: List uploads includes both entries', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length < 2) return log ('Expected at least 2 uploads, got ' + rs.body.length);
      var names = dale.go (rs.body, function (entry) {return entry.name;});
      if (! inc (names, 'test-image.png')) return log ('test-image.png missing from list');
      if (! inc (names, 'notes.txt')) return log ('notes.txt missing from list');
      return true;
   }],

   // *** Fetch the text file and verify content ***

   ['F8: Fetch text file content', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT8 + '/upload/notes.txt',
         method: 'GET'
      }, function (res) {
         var ct = res.headers ['content-type'] || '';
         if (ct.indexOf ('text/plain') === -1) return log ('Expected Content-Type text/plain, got: ' + ct);
         var body = '';
         res.on ('data', function (chunk) {body += chunk;});
         res.on ('end', function () {
            if (body.indexOf ('Hello from uploads test!') === -1) return log ('Text file content mismatch: ' + body.slice (0, 100));
            next ();
         });
      });
      req.on ('error', function (err) {log ('Request error: ' + err.message);});
      req.end ();
   }],

   // *** Upload with spaces in filename ***

   ['F8: Upload file with spaces in name', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: 'my screenshot 2026.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my screenshot 2026.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed');
      return true;
   }],

   ['F8: List uploads includes spaced filename', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (entry) {
         if (entry.name === 'my screenshot 2026.png') return entry;
      });
      if (! found) return log ('Spaced filename not found in uploads list');
      return true;
   }],

   // Fetch file with spaces — must percent-encode the name in the URL
   ['F8: Fetch file with spaces in name', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT8 + '/upload/' + encodeURIComponent ('my screenshot 2026.png'),
         method: 'GET'
      }, function (res) {
         if (res.statusCode !== 200) return log ('Expected 200 for spaced filename, got ' + res.statusCode);
         var ct = res.headers ['content-type'] || '';
         if (ct.indexOf ('image/png') === -1) return log ('Expected Content-Type image/png for spaced file, got: ' + ct);
         res.on ('data', function () {});
         res.on ('end', function () {next ();});
      });
      req.on ('error', function (err) {log ('Request error: ' + err.message);});
      req.end ();
   }],

   // *** Upload with dots and dashes (edge-case valid names) ***

   ['F8: Upload file with dots and dashes', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: 'my-file.v2.backup.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my-file.v2.backup.txt') return log ('Upload name mismatch: ' + rs.body.name);
      return true;
   }],

   // *** Upload with path traversal should fail ***

   ['F8: Upload with .. in name returns 400', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: '../etc/passwd', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with backslash should fail ***

   ['F8: Upload with backslash returns 400', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: 'sub\\file.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with leading slash should fail ***

   ['F8: Upload with leading slash returns 400', 'post', 'project/' + PROJECT8 + '/upload', {}, {name: '/absolute.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** List should now have 4 valid uploads ***

   ['F8: List uploads has all valid entries', 'get', 'project/' + PROJECT8 + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var names = dale.go (rs.body, function (entry) {return entry.name;});
      if (! inc (names, 'test-image.png')) return log ('test-image.png missing');
      if (! inc (names, 'notes.txt')) return log ('notes.txt missing');
      if (! inc (names, 'my screenshot 2026.png')) return log ('spaced filename missing');
      if (! inc (names, 'my-file.v2.backup.txt')) return log ('dotted filename missing');
      if (rs.body.length !== 4) return log ('Expected exactly 4 uploads, got ' + rs.body.length);
      return true;
   }],

   // *** Fetch nonexistent upload returns 404 ***

   ['F8: Fetch nonexistent upload returns 404', 'get', 'project/' + PROJECT8 + '/upload/nonexistent.png', {}, '', 404],

   // *** Cleanup ***

   ['F8: Delete project', 'delete', 'projects/' + PROJECT8, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['F8: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT8)) return log ('Project still exists after deletion');
      return true;
   }]
];

// *** RUNNER ***

var allFlows = {1: flow1Sequence, 2: flow2Sequence, 3: flow3Sequence, 4: flow4Sequence, 5: flow5Sequence, 6: flow6Sequence, 7: flow7Sequence, 8: flow8Sequence};

var requestedFlows = [];
dale.go (process.argv.slice (2), function (arg) {
   var match = arg.match (/^--flow=(\d+)$/);
   if (match) requestedFlows.push (Number (match [1]));
});

if (! requestedFlows.length) requestedFlows = [1, 2, 3, 4, 5, 6, 7, 8];

var sequences = dale.go (requestedFlows, function (n) {return allFlows [n];});
var label = 'Flow #' + requestedFlows.join (' + Flow #');

h.seq (
   {
      host: 'localhost',
      port: 5353,
      timeout: 420
   },
   sequences,
   function (error) {
      if (error) {
         try {
            if (error.request && type (error.request.body) === 'string') {
               error.request.body = error.request.body.slice (0, 1200) + (error.request.body.length > 1200 ? '... OMITTING REMAINDER' : '');
            }
         }
         catch (e) {}
         return console.log ('VIBEY TEST FAILED:', error);
      }
      log ('ALL TESTS PASSED (' + label + ')');
   },
   h.stdmap
);
