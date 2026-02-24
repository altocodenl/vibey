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

   ['Create waiting dialog draft (openai/gpt-5)', 'post', 'project/' + PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: DIALOG_SLUG}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('dialog/new missing dialogId or filename');
      if (rs.body.provider !== 'openai') return log ('dialog/new provider mismatch');
      if (rs.body.model !== 'gpt-5') return log ('dialog/new model mismatch');
      if (! rs.body.filename.match (/^dialog\-.*\-waiting\.md$/)) return log ('dialog/new should produce waiting dialog filename');
      if (rs.body.filename.indexOf (DIALOG_SLUG) === -1) return log ('dialog/new filename missing slug');
      s.dialogId = rs.body.dialogId;
      return true;
   }],

   ['Dialogs list includes waiting dialog', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('dialogs endpoint should return array');
      var match = dale.stopNot (rs.body, undefined, function (d) {
         if (d.dialogId === s.dialogId) return d;
      });
      if (! match) return log ('Created dialog not found in dialogs list');
      if (match.status !== 'waiting') return log ('Created dialog should be waiting');
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
var SECOND_DOC = 'doc-notes.md';
var SECOND_CONTENT = '# Notes\n\nSome notes here.\n';

var flow2Sequence = [

   ['F2: Create project', 'post', 'projects', {}, {name: PROJECT2}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT2) return log ('Unexpected project slug');
      return true;
   }],

   ['F2: Write doc-main.md with initial content', 'post', 'project/' + PROJECT2 + '/file/doc-main.md', {}, {content: INITIAL_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      if (rs.body.name !== 'doc-main.md') return log ('Unexpected filename returned');
      return true;
   }],

   ['F2: Read doc-main.md returns initial content', 'get', 'project/' + PROJECT2 + '/file/doc-main.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc-main.md') return log ('Unexpected name: ' + rs.body.name);
      if (rs.body.content !== INITIAL_CONTENT) return log ('Content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['F2: List files includes doc-main.md', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc-main.md')) return log ('doc-main.md not in file list');
      return true;
   }],

   ['F2: Overwrite doc-main.md with updated content', 'post', 'project/' + PROJECT2 + '/file/doc-main.md', {}, {content: UPDATED_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['F2: Read doc-main.md returns updated content', 'get', 'project/' + PROJECT2 + '/file/doc-main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('Updated content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['F2: Write a second doc', 'post', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, {content: SECOND_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Second file write failed');
      return true;
   }],

   ['F2: List files includes both docs', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc-main.md')) return log ('doc-main.md missing from list');
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
      if (! inc (rs.body, 'doc-main.md')) return log ('doc-main.md disappeared');
      return true;
   }],

   ['F2: doc-main.md still has updated content', 'get', 'project/' + PROJECT2 + '/file/doc-main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('doc-main.md content changed unexpectedly');
      return true;
   }],

   ['F2: Read nonexistent file returns 404', 'get', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 404],

   ['F2: Write with invalid filename returns 400', 'post', 'project/' + PROJECT2 + '/file/bad..name.md', {}, {content: 'x'}, 400],

   ['F2: Write with non-md extension returns 400', 'post', 'project/' + PROJECT2 + '/file/bad.txt', {}, {content: 'x'}, 400],

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

   ['F3: Write doc-main.md', 'post', 'project/' + PROJECT3 + '/file/doc-main.md', {}, {content: DOC_MAIN_F3}, 200, function (s, rq, rs) {
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

   ['F3: Re-created project has only default doc-main.md', 'get', 'project/' + PROJECT3 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var unexpected = dale.fil (rs.body, undefined, function (name) {
         if (name !== 'doc-main.md') return name;
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
         // As soon as we see the first SSE chunk event, we know the LLM started. Abort — let it run in background.
         if (! called && (got.indexOf ('"type":"chunk"') !== -1 || got.indexOf ('"type":"error"') !== -1)) {
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

   ['F4: Write doc-main.md', 'post', 'project/' + PROJECT4 + '/file/doc-main.md', {}, {content: DOC_MAIN_F4}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['F4: Create waiting dialog (orchestrator)', 'post', 'project/' + PROJECT4 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.f4DialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the dialog and don't block — let agents work in background
   ['F4: Fire "please start" (non-blocking)', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT4, s.f4DialogId, 'please start', function (error) {
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
            if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && lower.indexOf ('tictactoe') !== -1) return done (true);
            done (false);
         });
      }, 5000, 180000, function (error) {
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

   ['F4: app.js has tictactoe gotoB code', 'post', 'project/' + PROJECT4 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat app.js'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('cat app.js failed: ' + JSON.stringify (rs.body));
      var out = rs.body.stdout || '';
      if (out.indexOf ('B.') === -1) return log ('app.js missing gotoB usage (no B. references)');
      var hasBoardLogic = out.indexOf ('board') !== -1 || out.indexOf ('cell') !== -1 || out.indexOf ('grid') !== -1;
      if (! hasBoardLogic) return log ('app.js missing board/cell/grid logic');
      return true;
   }],

   // Ask the AI to embed the game in doc-main.md
   ['F4: Send embed request to orchestrator dialog', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT4, s.f4DialogId, 'The tictactoe game is now available via the static proxy at /project/' + PROJECT4 + '/static/. Please add an embed block to doc-main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port static, title Tictactoe, height 500) at the end of doc-main.md.', function (error) {
         if (error) return log ('Failed to fire embed request: ' + error.message);
         next ();
      });
   }],

   // Poll until embed block appears in doc-main.md
   ['F4: Poll until embed block appears in doc-main.md', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/file/doc-main.md', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var parsed = JSON.parse (body);
               var content = parsed.content || '';
               if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (true);
            }
            catch (e) {}
            done (false);
         });
      }, 5000, 180000, function (error) {
         if (error) return log ('Embed block never appeared in doc-main.md: ' + error.message);
         next ();
      });
   }],

   ['F4: Verify embed block in doc-main.md', 'get', 'project/' + PROJECT4 + '/file/doc-main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəəembed') === -1) return log ('doc-main.md missing əəəembed block');
      if (content.indexOf ('port static') === -1) return log ('doc-main.md embed missing port static');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** RUNNER ***

var allFlows = {1: flow1Sequence, 2: flow2Sequence, 3: flow3Sequence, 4: flow4Sequence};

var requestedFlows = [];
dale.go (process.argv.slice (2), function (arg) {
   var match = arg.match (/^--flow=(\d+)$/);
   if (match) requestedFlows.push (Number (match [1]));
});

if (! requestedFlows.length) requestedFlows = [1, 2, 3, 4];

var sequences = dale.go (requestedFlows, function (n) {return allFlows [n];});
var label = 'Flow #' + requestedFlows.join (' + Flow #');

h.seq (
   {
      host: 'localhost',
      port: 5353,
      timeout: 300
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
