var http   = require ('http');
var h      = require ('hitit');
var dale   = require ('dale');
var teishi = require ('teishi');

var log  = teishi.l || function () {console.log.apply (console, arguments)};
var type = teishi.type || teishi.t;
var inc  = teishi.inc;

// Backend integration tests for server.
// Run:   node test-server.js                (all suites)
//        node test-server.js --flow=dialog  (dialog suite, includes safety checks)
//        node test-server.js --flow=uploads (uploads suite)
//        node test-server.js --flow=autogit (auto-commit suite)
// Suite names: projects, dialog, docs, uploads, snapshots, autogit, static, backend, vi
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

var httpJson = function (method, path, payload, cb) {
   var body = payload === undefined ? '' : JSON.stringify (payload);
   var req = http.request ({
      hostname: 'localhost',
      port: 5353,
      path: path,
      method: method,
      headers: {
         'Content-Type': 'application/json',
         'Content-Length': Buffer.byteLength (body)
      }
   }, function (res) {
      var text = '';
      res.on ('data', function (chunk) {text += chunk;});
      res.on ('end', function () {
         var parsed = null;
         try {parsed = text ? JSON.parse (text) : null;} catch (error) {}
         cb (null, res.statusCode, parsed, text);
      });
   });
   req.on ('error', cb);
   if (body) req.write (body);
   req.end ();
};

// *** PROJECTS ***

var PROJECT_BASIC = 'test-proj';
var PROJECT_SPACES = 'My Cool Project';
var PROJECT_EMOJI = '🚀 Rocket App';
var PROJECT_ACCENTED = 'café étude';
var PROJECT_MIXED = 'hello—world & friends!';
var PROJECT_NONLATIN = '日本語プロジェクト';

var projectListFindBySlug = function (list, slug) {
   return dale.stopNot (list, undefined, function (item) {
      if (type (item) === 'object' && item.slug === slug) return item;
   });
};

var projectSequence = [

   ['Projects 1: GET /projects returns an array', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array, got: ' + type (rs.body));
      return true;
   }],

   ['Projects 2: Create test-proj', 'post', 'projects', {}, {name: PROJECT_BASIC}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT_BASIC) return log ('Expected slug "' + PROJECT_BASIC + '", got: ' + rs.body.slug);
      if (rs.body.name !== PROJECT_BASIC) return log ('Expected name "' + PROJECT_BASIC + '", got: ' + rs.body.name);
      s.basicSlug = rs.body.slug;
      return true;
   }],

   ['Projects 3: test-proj appears in list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var entry = projectListFindBySlug (rs.body, s.basicSlug);
      if (! entry) return log ('Project not in list');
      if (entry.name !== PROJECT_BASIC) return log ('Display name mismatch: ' + entry.name);
      return true;
   }],

   ['Projects 4: Create same project again (idempotent)', 'post', 'projects', {}, {name: PROJECT_BASIC}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Idempotent creation failed');
      if (rs.body.slug !== s.basicSlug) return log ('Idempotent slug mismatch: ' + rs.body.slug);
      return true;
   }],

   ['Projects 5: Delete test-proj', 'delete', 'projects/' + PROJECT_BASIC, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Projects 6: test-proj no longer in list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, s.basicSlug)) return log ('Project still in list after deletion');
      return true;
   }],

   ['Projects 7a: Files endpoint 404 after delete', 'get', 'project/' + PROJECT_BASIC + '/files', {}, '', 404],

   ['Projects 7b: Dialogs endpoint 404 after delete', 'get', 'project/' + PROJECT_BASIC + '/dialogs', {}, '', 404],

   ['Projects 8: Delete nonexistent project returns 404', 'delete', 'projects/nonexistent-proj-xyz-999', {}, '', 404],

   ['Projects 9: Create with empty name returns 400', 'post', 'projects', {}, {name: ''}, 400],

   ['Projects 10: Create with whitespace-only name returns 400', 'post', 'projects', {}, {name: '   '}, 400],

   ['Projects 11a: Create project with spaces', 'post', 'projects', {}, {name: PROJECT_SPACES}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Creation failed');
      s.spacesSlug = rs.body.slug;
      if (s.spacesSlug.indexOf (' ') !== -1) return log ('Slug contains spaces: ' + s.spacesSlug);
      return true;
   }],

   ['Projects 11a: Spaces project in list with correct display name', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      var entry = projectListFindBySlug (rs.body, s.spacesSlug);
      if (! entry) return log ('Spaces project not in list');
      if (entry.name !== PROJECT_SPACES) return log ('Display name mismatch: ' + entry.name + ' vs ' + PROJECT_SPACES);
      return true;
   }],

   ['Projects 11a: Write file to spaces project', 'post', function (s) {return 'project/' + s.spacesSlug + '/file/doc/main.md';}, {}, {content: '# Spaces Test\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Projects 11a: Read file from spaces project', 'get', function (s) {return 'project/' + s.spacesSlug + '/file/doc/main.md';}, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Spaces Test\n') return log ('Content mismatch');
      return true;
   }],

   ['Projects 11a: Delete spaces project', 'delete', function (s) {return 'projects/' + s.spacesSlug;}, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Deletion failed');
      return true;
   }],

   ['Projects 11a: Spaces project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (projectListHasSlug (rs.body, s.spacesSlug)) return log ('Spaces project still in list');
      return true;
   }],

   ['Projects 11b: Create project with emoji', 'post', 'projects', {}, {name: PROJECT_EMOJI}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Creation failed');
      s.emojiSlug = rs.body.slug;
      return true;
   }],

   ['Projects 11b: Emoji project in list with correct display name', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      var entry = projectListFindBySlug (rs.body, s.emojiSlug);
      if (! entry) return log ('Emoji project not in list');
      if (entry.name !== PROJECT_EMOJI) return log ('Display name mismatch: ' + entry.name + ' vs ' + PROJECT_EMOJI);
      return true;
   }],

   ['Projects 11b: Write/read file in emoji project', 'post', function (s) {return 'project/' + s.emojiSlug + '/file/doc/main.md';}, {}, {content: '# Emoji Test\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Projects 11b: Read file from emoji project', 'get', function (s) {return 'project/' + s.emojiSlug + '/file/doc/main.md';}, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Emoji Test\n') return log ('Content mismatch');
      return true;
   }],

   ['Projects 11b: Delete emoji project', 'delete', function (s) {return 'projects/' + s.emojiSlug;}, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Deletion failed');
      return true;
   }],

   ['Projects 11b: Emoji project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (projectListHasSlug (rs.body, s.emojiSlug)) return log ('Emoji project still in list');
      return true;
   }],

   ['Projects 11c: Create project with accented chars', 'post', 'projects', {}, {name: PROJECT_ACCENTED}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Creation failed');
      s.accentedSlug = rs.body.slug;
      return true;
   }],

   ['Projects 11c: Accented project in list with correct display name', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      var entry = projectListFindBySlug (rs.body, s.accentedSlug);
      if (! entry) return log ('Accented project not in list');
      if (entry.name !== PROJECT_ACCENTED) return log ('Display name mismatch: ' + entry.name + ' vs ' + PROJECT_ACCENTED);
      return true;
   }],

   ['Projects 11c: Write/read file in accented project', 'post', function (s) {return 'project/' + s.accentedSlug + '/file/doc/main.md';}, {}, {content: '# Accented Test\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Projects 11c: Read file from accented project', 'get', function (s) {return 'project/' + s.accentedSlug + '/file/doc/main.md';}, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Accented Test\n') return log ('Content mismatch');
      return true;
   }],

   ['Projects 11c: Delete accented project', 'delete', function (s) {return 'projects/' + s.accentedSlug;}, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Deletion failed');
      return true;
   }],

   ['Projects 11c: Accented project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (projectListHasSlug (rs.body, s.accentedSlug)) return log ('Accented project still in list');
      return true;
   }],

   ['Projects 11d: Create project with mixed special chars', 'post', 'projects', {}, {name: PROJECT_MIXED}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Creation failed');
      s.mixedSlug = rs.body.slug;
      return true;
   }],

   ['Projects 11d: Mixed project in list with correct display name', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      var entry = projectListFindBySlug (rs.body, s.mixedSlug);
      if (! entry) return log ('Mixed project not in list');
      if (entry.name !== PROJECT_MIXED) return log ('Display name mismatch: ' + entry.name + ' vs ' + PROJECT_MIXED);
      return true;
   }],

   ['Projects 11d: Write/read file in mixed project', 'post', function (s) {return 'project/' + s.mixedSlug + '/file/doc/main.md';}, {}, {content: '# Mixed Test\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Projects 11d: Read file from mixed project', 'get', function (s) {return 'project/' + s.mixedSlug + '/file/doc/main.md';}, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Mixed Test\n') return log ('Content mismatch');
      return true;
   }],

   ['Projects 11d: Delete mixed project', 'delete', function (s) {return 'projects/' + s.mixedSlug;}, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Deletion failed');
      return true;
   }],

   ['Projects 11d: Mixed project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (projectListHasSlug (rs.body, s.mixedSlug)) return log ('Mixed project still in list');
      return true;
   }],

   ['Projects 11e: Create project with non-Latin chars', 'post', 'projects', {}, {name: PROJECT_NONLATIN}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Creation failed');
      s.nonlatinSlug = rs.body.slug;
      return true;
   }],

   ['Projects 11e: Non-Latin project in list with correct display name', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      var entry = projectListFindBySlug (rs.body, s.nonlatinSlug);
      if (! entry) return log ('Non-Latin project not in list');
      if (entry.name !== PROJECT_NONLATIN) return log ('Display name mismatch: ' + entry.name + ' vs ' + PROJECT_NONLATIN);
      return true;
   }],

   ['Projects 11e: Write/read file in non-Latin project', 'post', function (s) {return 'project/' + s.nonlatinSlug + '/file/doc/main.md';}, {}, {content: '# Non-Latin Test\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Projects 11e: Read file from non-Latin project', 'get', function (s) {return 'project/' + s.nonlatinSlug + '/file/doc/main.md';}, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Non-Latin Test\n') return log ('Content mismatch');
      return true;
   }],

   ['Projects 11e: Delete non-Latin project', 'delete', function (s) {return 'projects/' + s.nonlatinSlug;}, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Deletion failed');
      return true;
   }],

   ['Projects 11e: Non-Latin project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (projectListHasSlug (rs.body, s.nonlatinSlug)) return log ('Non-Latin project still in list');
      return true;
   }]
];

// *** DIALOG ***

var PROJECT = 'flow1-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var DIALOG_SLUG = 'flow1-read-vibey';

var dialogSequence = [

   ['Dialog 1: GET / serves shell', 'get', '/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      if (rs.body.indexOf ('client.js') === -1) return log ('HTML shell missing client.js');
      return true;
   }],

   ['Dialog 2: Create project', 'post', 'projects', {}, {name: PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT) return log ('Unexpected project slug returned');
      return true;
   }],

   ['Dialog 3: Create dialog draft', 'post', 'project/' + PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: DIALOG_SLUG}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('dialog/new missing dialogId or filename');
      if (rs.body.provider !== 'openai') return log ('dialog/new provider mismatch');
      if (rs.body.model !== 'gpt-5.2-codex') return log ('dialog/new model mismatch');
      if (rs.body.status !== 'done') return log ('dialog/new should start as done, got: ' + rs.body.status);
      if (! rs.body.filename.match (/^dialog\/.*\-done\.md$/)) return log ('dialog/new filename should end in -done.md');
      if (rs.body.filename.indexOf (DIALOG_SLUG) === -1) return log ('dialog/new filename missing slug');
      s.dialogId = rs.body.dialogId;
      return true;
   }],

   ['Dialog 4: Draft listed as done', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('dialogs endpoint should return array');
      var match = dale.stopNot (rs.body, undefined, function (d) {
         if (d.dialogId === s.dialogId) return d;
      });
      if (! match) return log ('Created dialog not found in dialogs list');
      if (match.status !== 'done') return log ('Created dialog should be done');
      return true;
   }],

   ['Dialog 5: Seed test-sample.txt', 'post', 'project/' + PROJECT + '/tool/execute', {}, {toolName: 'write_file', toolInput: {path: 'test-sample.txt', content: '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('Failed to write test-sample.txt: ' + JSON.stringify (rs.body));
      return true;
   }],

   ['Dialog 6: run_command via SSE', 'put', 'project/' + PROJECT + '/dialog', {}, function (s) {
      return {
         dialogId: s.dialogId,
         prompt: 'Please read the file test-sample.txt using the run_command tool with `cat test-sample.txt`, then summarize it in 3 short bullets. You must use the tool.'
      };
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected SSE text body');

      var events = parseSSE (rs.body);
      if (! getEventsByType (events, 'done').length) {
         var eventTypes = dale.go (events, function (event) {return event && event.type ? event.type : 'unknown'}).join (', ');
         return log ('Expected done event. Events: ' + eventTypes);
      }
      var contextEvents = getEventsByType (events, 'context');
      if (! contextEvents.length) return log ('Expected at least one context SSE event');
      var ctx = contextEvents [0].context;
      if (! ctx || (type (ctx.percent) !== 'integer' && type (ctx.percent) !== 'float')) return log ('Context event missing numeric percent field');
      if (ctx.percent < 0 || ctx.percent > 100) return log ('Context percent out of range: ' + ctx.percent);
      if (type (ctx.used) !== 'integer' || ctx.used < 0) return log ('Context used should be a non-negative integer');
      if (type (ctx.limit) !== 'integer' || ctx.limit < 1) return log ('Context limit should be a positive integer');
      return true;
   }],

   ['Dialog 7: Markdown has Time + Context + run_command', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (md.indexOf ('> Time:') === -1) return log ('Dialog markdown missing > Time metadata');
         if (md.indexOf ('> Context:') === -1) return log ('Dialog markdown missing > Context metadata');
         if (! hasToolMention (md, 'run_command')) return log ('Missing run_command evidence in dialog markdown');
         if (! hasResultMarker (md)) return log ('run_command block missing Result section');
         next ();
      });
   }],

   ['Dialog 8: write_file via SSE', 'put', 'project/' + PROJECT + '/dialog', {}, function (s) {
      return {
         dialogId: s.dialogId,
         prompt: 'Please create a file called dummy.js with the content: console.log("hello from dummy"); Use the write_file tool for this.'
      };
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected SSE text body');

      var events = parseSSE (rs.body);
      if (! getEventsByType (events, 'done').length) {
         var eventTypes = dale.go (events, function (event) {return event && event.type ? event.type : 'unknown'}).join (', ');
         return log ('Expected done event. Events: ' + eventTypes);
      }
      return true;
   }],

   ['Dialog 9: Markdown has write_file', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (! hasToolMention (md, 'write_file')) return log ('Missing write_file block in dialog markdown');
         if (! hasResultMarker (md)) return log ('write_file block missing Result section');
         next ();
      });
   }],

   ['Dialog 10: Verify dummy.js via tool/execute', 'post', 'project/' + PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat dummy.js'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('run_command cat dummy.js failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').indexOf ('console.log') === -1) return log ('dummy.js does not contain console.log');
      return true;
   }],

   ['Dialog 11: Remove Provider header line', 'post', 'project/' + PROJECT + '/tool/execute', {}, function (s) {
      return {toolName: 'run_command', toolInput: {command: "sed -i '/^> Provider:/d' dialog/" + s.dialogId + "-done.md"}};
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('Failed to remove Provider header: ' + JSON.stringify (rs.body));
      return true;
   }],

   ['Dialog 12: Continue without provider returns SSE error', 'put', 'project/' + PROJECT + '/dialog', {}, function (s) {
      return {dialogId: s.dialogId, prompt: 'Continue without provider metadata.'};
   }, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected SSE text body');
      var events = parseSSE (rs.body);
      var errorEvents = getEventsByType (events, 'error');
      if (! errorEvents.length) return log ('Expected SSE error event');
      log ('Dialog 12 SSE error payload:', JSON.stringify (errorEvents [0]));
      return true;
   }],

   ['Dialog 13: Dialog remains done after provider error', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var entry = dale.stopNot (rs.body, undefined, function (d) {
         if (d && d.dialogId === s.dialogId) return d;
      });
      if (! entry) return log ('Dialog not found after provider error');
      if (entry.status !== 'done') return log ('Dialog status should remain done, got: ' + entry.status);
      if (entry.filename.indexOf ('-done.md') === -1) return log ('Dialog filename should remain -done.md, got: ' + entry.filename);
      return true;
   }],

   ['Dialog 14: Create agent-a draft', 'post', 'project/' + PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-a'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.dialogA = rs.body.dialogId;
      if (rs.body.status !== 'done') return log ('agent-a should start as done, got: ' + rs.body.status);
      if (! rs.body.filename || rs.body.filename.indexOf ('-done.md') === -1) return log ('agent-a filename should end in -done.md');
      return true;
   }],

   ['Dialog 15: Create agent-b draft', 'post', 'project/' + PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-b'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.dialogB = rs.body.dialogId;
      if (rs.body.status !== 'done') return log ('agent-b should start as done, got: ' + rs.body.status);
      if (! rs.body.filename || rs.body.filename.indexOf ('-done.md') === -1) return log ('agent-b filename should end in -done.md');
      return true;
   }],

   ['Dialog 16: Fire both agents (non-blocking)', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialogNoWait (PROJECT, s.dialogA, 'First run the run_command tool with `sleep 12` and only then write a 200 word essay about the history of computing.');
      fireDialogNoWait (PROJECT, s.dialogB, 'First run the run_command tool with `sleep 12` and only then write a 200 word essay about the history of mathematics.');
      setTimeout (next, 2000);
   }],

   ['Dialog 17: Poll until agent-a is active', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT + '/dialogs', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var dialogs = JSON.parse (body);
               var entry = dale.stopNot (dialogs, undefined, function (d) {
                  if (d && d.dialogId === s.dialogA) return d;
               });
               if (! entry) return done (false);
               if (entry.status === 'active') {
                  if (entry.filename.indexOf ('-active.md') === -1) return done (false, new Error ('Status active but filename missing -active.md: ' + entry.filename));
                  s.activeObserved = true;
                  return done (true);
               }
               done (false);
            }
            catch (e) {done (false);}
         });
      }, 500, 30000, function (error) {
         if (error) return log ('agent-a never became active: ' + error.message);
         next ();
      });
   }],

   ['Dialog 18: Continuing active agent-a rejected (409)', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + PROJECT + '/dialog', {dialogId: s.dialogA, prompt: 'This must be rejected while agent-a is active.'}, function (error, code, body) {
         if (error) return log ('PUT /dialog rejection request failed: ' + error.message);
         if (code !== 409) return log ('Expected 409, got ' + code);
         if (! body || ! body.error) return log ('Expected error payload for 409');
         next ();
      });
   }],

   ['Dialog 19: Stop agent-a (200)', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + PROJECT + '/dialog', {dialogId: s.dialogA, status: 'done'}, function (error, code, body) {
         if (error) return log ('PUT /dialog stop failed: ' + error.message);
         if (code !== 200) return log ('Expected 200 when stopping, got ' + code);
         if (type (body) !== 'object') return log ('Expected object body');
         if (body.status !== 'done') return log ('Expected status done after stop, got: ' + body.status);
         next ();
      });
   }],

   ['Dialog 20: Agent-a is done, active was observed', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT + '/dialogs', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var dialogs = JSON.parse (body);
               var entry = dale.stopNot (dialogs, undefined, function (d) {
                  if (d && d.dialogId === s.dialogA) return d;
               });
               if (! entry) return done (false);
               if (entry.status === 'done' && entry.filename.indexOf ('-done.md') !== -1) return done (true);
               done (false);
            }
            catch (e) {done (false);}
         });
      }, 500, 30000, function (error) {
         if (error) return log ('agent-a never returned to done: ' + error.message);
         if (! s.activeObserved) return log ('Active status was never observed');
         next ();
      });
   }],

   ['Dialog 21: Delete project while agent-b active', 'delete', 'projects/' + PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Dialog 22: Project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT)) return log ('Project still exists after deletion');
      return true;
   }],

   ['Dialog 23: Dialogs endpoint 404', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 404],

   ['Dialog 24: Files endpoint 404', 'get', 'project/' + PROJECT + '/files', {}, '', 404],

   ['Dialog 25: Re-create project', 'post', 'projects', {}, {name: PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Re-creation failed');
      return true;
   }],

   ['Dialog 26: No dialogs in fresh project', 'get', 'project/' + PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length !== 0) return log ('Expected 0 dialogs, got ' + rs.body.length);
      return true;
   }],

   ['Dialog 27: Only doc/main.md in fresh project', 'get', 'project/' + PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var unexpected = dale.fil (rs.body, undefined, function (name) {
         if (name !== 'doc/main.md') return name;
      });
      if (unexpected.length) return log ('Unexpected files: ' + unexpected.join (', '));
      return true;
   }],

   ['Dialog 28: Cleanup delete', 'delete', 'projects/' + PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Cleanup deletion failed');
      return true;
   }],

   ['Dialog 29: Confirm gone', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT)) return log ('Project still exists after final deletion');
      return true;
   }]
];

// *** DOCS ***

var PROJECT2 = 'flow2-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var INITIAL_CONTENT = '# Main\n\nThis is the initial content of the project.\n';
var UPDATED_CONTENT = '# Main\n\nThis is the updated content of the project.\n\n## New section\n\nWith more detail.\n';
var SECOND_DOC = 'doc/notes.md';
var SECOND_CONTENT = '# Notes\n\nSome notes here.\n';

var docSequence = [

   ['Docs 1: Create project', 'post', 'projects', {}, {name: PROJECT2}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== PROJECT2) return log ('Unexpected project slug');
      return true;
   }],

   ['Docs 2: Write doc/main.md', 'post', 'project/' + PROJECT2 + '/file/doc/main.md', {}, {content: INITIAL_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected filename returned');
      return true;
   }],

   ['Docs 3: Read doc/main.md round-trip', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected name: ' + rs.body.name);
      if (rs.body.content !== INITIAL_CONTENT) return log ('Content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['Docs 4: List includes doc/main.md', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md not in file list');
      return true;
   }],

   ['Docs 5: Overwrite doc/main.md', 'post', 'project/' + PROJECT2 + '/file/doc/main.md', {}, {content: UPDATED_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['Docs 6: Read updated content', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('Updated content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['Docs 7: Write second doc', 'post', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, {content: SECOND_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Second file write failed');
      return true;
   }],

   ['Docs 8: List includes both docs', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md missing from list');
      if (! inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' missing from list');
      return true;
   }],

   ['Docs 9: Read second doc', 'get', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== SECOND_CONTENT) return log ('Second doc content mismatch');
      return true;
   }],

   ['Docs 10: Delete second doc', 'delete', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File deletion failed');
      return true;
   }],

   ['Docs 11: notes.md gone, main.md remains', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' still in list after deletion');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md disappeared');
      return true;
   }],

   ['Docs 12: main.md still has updated content', 'get', 'project/' + PROJECT2 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('doc/main.md content changed unexpectedly');
      return true;
   }],

   ['Docs 13: Deleted file returns 404', 'get', 'project/' + PROJECT2 + '/file/' + SECOND_DOC, {}, '', 404],

   ['Docs 14: Invalid name returns 400', 'post', 'project/' + PROJECT2 + '/file/bad..name.md', {}, {content: 'x'}, 400],

   ['Docs 15: Outside managed folders returns 400', 'post', 'project/' + PROJECT2 + '/file/bad.txt', {}, {content: 'x'}, 400],

   // Special characters in filenames

   ['Docs 16a: Write doc with spaces in name', 'post', 'project/' + PROJECT2 + '/file/doc/my%20notes.md', {}, {content: '# My Notes\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Docs 16a: Read doc with spaces', 'get', 'project/' + PROJECT2 + '/file/doc/my%20notes.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# My Notes\n') return log ('Content mismatch');
      return true;
   }],

   ['Docs 16a: Listed in files', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/my notes.md')) return log ('doc/my notes.md not in list');
      return true;
   }],

   ['Docs 16a: Delete doc with spaces', 'delete', 'project/' + PROJECT2 + '/file/doc/my%20notes.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Docs 16a: Gone from list', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/my notes.md')) return log ('doc/my notes.md still in list');
      return true;
   }],

   ['Docs 16b: Write doc with accented name', 'post', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('café.md'), {}, {content: '# Café\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Docs 16b: Read doc with accented name', 'get', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('café.md'), {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Café\n') return log ('Content mismatch');
      return true;
   }],

   ['Docs 16b: Listed in files', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/café.md')) return log ('doc/café.md not in list');
      return true;
   }],

   ['Docs 16b: Delete doc with accented name', 'delete', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('café.md'), {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Docs 16b: Gone from list', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/café.md')) return log ('doc/café.md still in list');
      return true;
   }],

   ['Docs 16c: Write doc with non-Latin name', 'post', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, {content: '# 日本語\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Docs 16c: Read doc with non-Latin name', 'get', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# 日本語\n') return log ('Content mismatch');
      return true;
   }],

   ['Docs 16c: Listed in files', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/日本語.md')) return log ('doc/日本語.md not in list');
      return true;
   }],

   ['Docs 16c: Delete doc with non-Latin name', 'delete', 'project/' + PROJECT2 + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Docs 16c: Gone from list', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/日本語.md')) return log ('doc/日本語.md still in list');
      return true;
   }],

   ['Docs 17a: Write nested managed doc path', 'post', 'project/' + PROJECT2 + '/file/doc/nested/plan.md', {}, {content: '# Nested Plan\n\nTesting nested managed path writes.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Nested managed write failed');
      if (rs.body.name !== 'doc/nested/plan.md') return log ('Unexpected nested filename returned');
      return true;
   }],

   ['Docs 17b: Read nested managed doc path', 'get', 'project/' + PROJECT2 + '/file/doc/nested/plan.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc/nested/plan.md') return log ('Unexpected nested filename: ' + rs.body.name);
      if (rs.body.content !== '# Nested Plan\n\nTesting nested managed path writes.\n') return log ('Nested content mismatch');
      return true;
   }],

   ['Docs 17c: Nested managed doc listed in files', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/nested/plan.md')) return log ('doc/nested/plan.md not in list');
      return true;
   }],

   ['Docs 17d: Delete nested managed doc path', 'delete', 'project/' + PROJECT2 + '/file/doc/nested/plan.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Nested managed delete failed');
      return true;
   }],

   ['Docs 17e: Nested managed doc gone from list', 'get', 'project/' + PROJECT2 + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/nested/plan.md')) return log ('doc/nested/plan.md still in list');
      return true;
   }],

   ['Docs 18: Delete project', 'delete', 'projects/' + PROJECT2, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Docs 19: Confirm gone', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT2)) return log ('Project still exists after deletion');
      return true;
   }]
];

// *** UPLOADS ***

var PROJECT3_UPLOADS = 'flow3-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

// A tiny 1x1 red PNG (base64)
var TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
var TINY_PNG_DATA_URL = 'data:image/png;base64,' + TINY_PNG_BASE64;
var TINY_PNG_BYTES = Buffer.from (TINY_PNG_BASE64, 'base64');

var TEXT_CONTENT_BASE64 = Buffer.from ('Hello from uploads test!\nLine 2.\n').toString ('base64');

var uploadSequence = [

   ['Uploads 1: Create project', 'post', 'projects', {}, {name: PROJECT3_UPLOADS}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   // *** Upload an image (data URL format) ***

   ['Uploads 2: Upload image via data URL', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'test-image.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'test-image.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be a positive integer, got: ' + rs.body.size);
      if (type (rs.body.mtime) !== 'integer') return log ('Upload mtime should be an integer, got: ' + type (rs.body.mtime));
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed: ' + rs.body.url);
      return true;
   }],

   // *** List uploads — image should be present ***

   ['Uploads 3: List uploads includes image', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs) {
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

   ['Uploads 4: Fetch uploaded image', 'get', 'project/' + PROJECT3_UPLOADS + '/upload/test-image.png', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + PROJECT3_UPLOADS + '/upload/test-image.png', function (error, status, body) {
         if (error) return log ('Fetch upload failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || body.length < 10) return log ('Upload body too small: ' + (body ? body.length : 0) + ' bytes');
         next ();
      });
   }],

   // Verify Content-Type via raw HTTP request
   ['Uploads 5: Verify image Content-Type header', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT3_UPLOADS + '/upload/test-image.png',
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

   ['Uploads 6: Upload text file', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'notes.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'notes.txt') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'text/plain') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      return true;
   }],

   // *** List uploads — both entries ***

   ['Uploads 7: List uploads includes both entries', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length < 2) return log ('Expected at least 2 uploads, got ' + rs.body.length);
      var names = dale.go (rs.body, function (entry) {return entry.name;});
      if (! inc (names, 'test-image.png')) return log ('test-image.png missing from list');
      if (! inc (names, 'notes.txt')) return log ('notes.txt missing from list');
      return true;
   }],

   // *** Fetch the text file and verify content ***

   ['Uploads 8: Fetch text file content', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT3_UPLOADS + '/upload/notes.txt',
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

   ['Uploads 9: Upload file with spaces in name', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'my screenshot 2026.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my screenshot 2026.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed');
      return true;
   }],

   ['Uploads 10: List uploads includes spaced filename', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (entry) {
         if (entry.name === 'my screenshot 2026.png') return entry;
      });
      if (! found) return log ('Spaced filename not found in uploads list');
      return true;
   }],

   // Fetch file with spaces — must percent-encode the name in the URL
   ['Uploads 11: Fetch file with spaces in name', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + PROJECT3_UPLOADS + '/upload/' + encodeURIComponent ('my screenshot 2026.png'),
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

   ['Uploads 12: Upload file with dots and dashes', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'my-file.v2.backup.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my-file.v2.backup.txt') return log ('Upload name mismatch: ' + rs.body.name);
      return true;
   }],

   // *** Upload with path traversal should fail ***

   ['Uploads 13: Upload with .. in name returns 400', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: '../etc/passwd', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with backslash should fail ***

   ['Uploads 14: Upload with backslash returns 400', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'sub\\file.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with leading slash should fail ***

   ['Uploads 15: Upload with leading slash returns 400', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: '/absolute.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with nested path is allowed ***

   ['Uploads 16: Upload with slash in name succeeds', 'post', 'project/' + PROJECT3_UPLOADS + '/upload', {}, {name: 'nested/evil.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'nested/evil.png') return log ('Upload name mismatch: ' + rs.body.name);
      return true;
   }],

   // *** List should now have 5 valid uploads ***

   ['Uploads 17: List uploads has all valid entries', 'get', 'project/' + PROJECT3_UPLOADS + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var names = dale.go (rs.body, function (entry) {return entry.name;});
      if (! inc (names, 'test-image.png')) return log ('test-image.png missing');
      if (! inc (names, 'notes.txt')) return log ('notes.txt missing');
      if (! inc (names, 'my screenshot 2026.png')) return log ('spaced filename missing');
      if (! inc (names, 'my-file.v2.backup.txt')) return log ('dotted filename missing');
      if (! inc (names, 'nested/evil.png')) return log ('nested filename missing');
      if (rs.body.length !== 5) return log ('Expected exactly 5 uploads, got ' + rs.body.length);
      return true;
   }],

   // *** Fetch nonexistent upload returns 404 ***

   ['Uploads 18: Fetch nonexistent upload returns 404', 'get', 'project/' + PROJECT3_UPLOADS + '/upload/nonexistent.png', {}, '', 404],

   // *** Cleanup ***

   ['Uploads 19: Delete project', 'delete', 'projects/' + PROJECT3_UPLOADS, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Uploads 20: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT3_UPLOADS)) return log ('Project still exists after deletion');
      return true;
   }]
];


// dialogSafetySequence merged into dialogSequence (steps 11–26)

// *** STATIC APP ***
// Tests static proxy, embed blocks, and file serving without waiting for LLM.

var PROJECT4 = 'flow4-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_F4 = [
   '# Tictactoe Project',
   '',
   'Build a simple tictactoe game for the browser using React (via CDN). No backend server.',
   'Served via the static proxy at `/project/<project>/static/`.',
   '',
   '## Critical rules',
   '',
   '- `index.html`: load React, ReactDOM, and Babel standalone from CDN (unpkg or cdnjs).',
   '  Include `<script src="app.js" type="text/babel"></script>` so JSX works.',
   '- `app.js`: a simple React tictactoe with a 3x3 grid of buttons, X/O turns, and a winner check.',
   '- The page title or heading must include "tictactoe" (case-insensitive).',
   '- No build step, no npm. Pure static files.',
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

var pollDialogDone = function (project, dialogId, intervalMs, maxMs, cb) {
   pollUntil (function (done) {
      httpGet (5353, '/project/' + project + '/dialogs', function (error, status, body) {
         if (error || status !== 200) return done (false);
         try {
            var dialogs = JSON.parse (body);
            var entry = dale.stopNot (dialogs, undefined, function (d) {
               if (d && d.dialogId === dialogId) return d;
            });
            if (! entry) return done (false);
            if (entry.status === 'done' && type (entry.filename) === 'string' && entry.filename.indexOf ('-done.md') !== -1) return done (true);
         }
         catch (e) {}
         done (false);
      });
   }, intervalMs, maxMs, cb);
};

var staticSequence = [

   ['Static 1: Create project', 'post', 'projects', {}, {name: PROJECT4}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Static 2: Write doc/main.md', 'post', 'project/' + PROJECT4 + '/file/doc/main.md', {}, {content: DOC_MAIN_F4}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Static 3: Create dialog draft (orchestrator)', 'post', 'project/' + PROJECT4 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.f4DialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the dialog and don't block — let the agent build the app
   ['Static 4: Fire "please start" (non-blocking)', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT4, s.f4DialogId, 'Please start. Read doc/main.md once, then implement immediately: create index.html and app.js in /workspace root. Do not re-fetch docs after the first read. After creating files, update doc/main.md with an embed block (port static, title Tictactoe, height 500).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the static page is reachable via static proxy
   ['Static 5: Poll until static page serves', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/static/', function (error, status, body) {
            if (error || status !== 200) return done (false);
            var lower = (body || '').toLowerCase ();
            var hasTic = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1 || lower.indexOf ('tic-tac-toe') !== -1;
            if (lower.indexOf ('react') !== -1 && lower.indexOf ('app.js') !== -1 && hasTic) return done (true);
            done (false);
         });
      }, 3000, 300000, function (error) {
         if (error) return log ('Static app never appeared: ' + error.message);
         next ();
      });
   }],

   // Verify the content of index.html via tool/execute
   ['Static 6: index.html has React + app.js', 'post', 'project/' + PROJECT4 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('cat index.html failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '').toLowerCase ();
      if (out.indexOf ('react') === -1) return log ('index.html missing React reference');
      if (out.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   ['Static 7: app.js has tictactoe logic', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT4 + '/static/app.js', function (error, status, body) {
            if (error || status !== 200) return done (false);
            var out = (body || '').toLowerCase ();
            var hasBoardLogic = out.indexOf ('board') !== -1 || out.indexOf ('cell') !== -1 || out.indexOf ('square') !== -1 || out.indexOf ('grid') !== -1;
            if (! hasBoardLogic) return done (false);
            return done (true);
         });
      }, 3000, 300000, function (error) {
         if (error) return log ('app.js missing board/cell/grid logic: ' + error.message);
         next ();
      });
   }],

   // Poll until embed block appears in doc/main.md
   ['Static 8: Poll until embed block appears in doc/main.md', 'get', 'project/' + PROJECT4 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
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
      }, 3000, 300000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['Static 9: Verify embed block in doc/main.md', 'get', 'project/' + PROJECT4 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəəembed') === -1) return log ('doc/main.md missing əəəembed block');
      if (content.indexOf ('port static') === -1) return log ('doc/main.md embed missing port static');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** APP WITH BACKEND ***

var PROJECT5 = 'flow5-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_F5 = [
   '# Tictactoe Project (Backend)',
   '',
   'Build a simple tictactoe game for the browser using React (via CDN), served by an Express server on port 4000.',
   'The game should be embedded in this doc via the proxy.',
   '',
   '## Critical rules',
   '',
   '- Create a `server.js` that uses Express to serve static files from `/workspace` on port 4000.',
   '- `index.html`: load React, ReactDOM, and Babel standalone from CDN (unpkg or cdnjs).',
   '  Include `<script src="app.js" type="text/babel"></script>` so JSX works.',
   '- `app.js`: a simple React tictactoe with a 3x3 grid of buttons, X/O turns, and a winner check.',
   '- The page title or heading must include "tictactoe" (case-insensitive).',
   '- No build step, no npm install for React. Express is already available in the sandbox.',
   '- Run the server with `node server.js &` so it stays alive in the background.',
   '',
].join ('\n') + '\n';

var backendSequence = [

   ['Backend 1: Create project', 'post', 'projects', {}, {name: PROJECT5}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Backend 2: Write doc/main.md', 'post', 'project/' + PROJECT5 + '/file/doc/main.md', {}, {content: DOC_MAIN_F5}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Backend 3: Create dialog draft (orchestrator)', 'post', 'project/' + PROJECT5 + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.f5DialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the orchestrator and let it build the game + start the server
   ['Backend 4: Fire "please start" (non-blocking)', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (PROJECT5, s.f5DialogId, 'Please start. Read doc/main.md once, then implement immediately: create server.js (Express on port 4000 serving static files from /workspace), index.html, and app.js in /workspace root. Do not re-fetch docs after the first read. Start the server with `node server.js &` and then update doc/main.md with an embed block (port 4000, title Tictactoe, height 500).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the backend server is reachable via the proxy
   ['Backend 5: Poll until proxy serves the app on port 4000', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + PROJECT5 + '/proxy/4000/', function (error, status, body) {
            if (error || status !== 200) return done (false);
            var lower = (body || '').toLowerCase ();
            var hasTic = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1 || lower.indexOf ('tic-tac-toe') !== -1;
            if (lower.indexOf ('react') !== -1 && lower.indexOf ('app.js') !== -1 && hasTic) return done (true);
            done (false);
         });
      }, 3000, 300000, function (error) {
         if (error) return log ('Backend app never appeared via proxy: ' + error.message);
         next ();
      });
   }],

   // Verify the index page via proxy
   ['Backend 6: Proxy serves index.html with React + app.js', 'get', 'project/' + PROJECT5 + '/proxy/4000/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      var lower = (rs.body || '').toLowerCase ();
      if (lower.indexOf ('react') === -1) return log ('index.html missing React reference');
      if (lower.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   // Verify app.js is served through proxy
   ['Backend 7: Proxy serves app.js with tictactoe logic', 'get', 'project/' + PROJECT5 + '/proxy/4000/app.js', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected JS string body');
      var lower = (rs.body || '').toLowerCase ();
      var hasBoardLogic = lower.indexOf ('board') !== -1 || lower.indexOf ('cell') !== -1 || lower.indexOf ('square') !== -1 || lower.indexOf ('grid') !== -1;
      if (! hasBoardLogic) return log ('app.js missing board/cell/square/grid logic');
      return true;
   }],

   // Verify the Express server is running inside the container
   ['Backend 8: Server process is running', 'post', 'project/' + PROJECT5 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'ps aux | grep node || true'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('ps aux failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '') + (rs.body.stderr || '');
      if (out.indexOf ('server.js') === -1) return log ('server.js process not found in ps output');
      return true;
   }],

   // Poll until embed block appears in doc/main.md
   ['Backend 9: Poll until embed block appears in doc/main.md', 'get', 'project/' + PROJECT5 + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
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
      }, 3000, 300000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['Backend 10: Verify embed block in doc/main.md', 'get', 'project/' + PROJECT5 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəəembed') === -1) return log ('doc/main.md missing əəəembed block');
      if (content.indexOf ('port 4000') === -1) return log ('doc/main.md embed missing port 4000');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** VI MODE ***

var PROJECT6 = 'flow6-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var viSequence = [

   // *** Settings: default state ***

   ['Vi: GET /settings returns default viMode false', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('Default viMode should be false, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: enable vi mode ***

   ['Vi: POST /settings to enable viMode', 'post', 'settings', {}, {editor: {viMode: true}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['Vi: GET /settings confirms viMode true', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== true) return log ('viMode should be true after enable, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: disable vi mode ***

   ['Vi: POST /settings to disable viMode', 'post', 'settings', {}, {editor: {viMode: false}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['Vi: GET /settings confirms viMode false again', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('viMode should be false after disable, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Settings: viMode persists alongside API keys ***

   ['Vi: POST /settings with API key does not clobber viMode', 'post', 'settings', {}, {editor: {viMode: true}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['Vi: POST /settings with API key only', 'post', 'settings', {}, {openaiKey: 'sk-test-vi-flow'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['Vi: GET /settings: viMode still true after API key save', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== true) return log ('viMode should still be true, got: ' + JSON.stringify (rs.body.editor));
      if (! rs.body.openai || ! rs.body.openai.hasKey) return log ('openai key should be set');
      return true;
   }],

   // *** Settings: viMode with boolean body.viMode (backward compat) ***

   ['Vi: POST /settings with top-level viMode boolean', 'post', 'settings', {}, {viMode: false}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Settings save failed');
      return true;
   }],

   ['Vi: GET /settings confirms viMode false via top-level toggle', 'get', 'settings', {}, '', 200, function (s, rq, rs) {
      if (! rs.body.editor || rs.body.editor.viMode !== false) return log ('viMode should be false, got: ' + JSON.stringify (rs.body.editor));
      return true;
   }],

   // *** Vi mode with doc editing ***

   ['Vi: Create project', 'post', 'projects', {}, {name: PROJECT6}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Vi: Write a doc to edit', 'post', 'project/' + PROJECT6 + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Vi: Read doc back', 'get', 'project/' + PROJECT6 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\n') return log ('Content mismatch');
      return true;
   }],

   // Simulate vi :w by writing updated content
   ['Vi: Simulate vi :w (overwrite doc)', 'post', 'project/' + PROJECT6 + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\nNew line added by vi.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['Vi: Read doc confirms vi edit persisted', 'get', 'project/' + PROJECT6 + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\nNew line added by vi.\n') return log ('Vi edit not persisted');
      return true;
   }],

   // *** Cleanup: restore viMode to false, clean API key ***

   ['Vi: Restore viMode to false', 'post', 'settings', {}, {editor: {viMode: false}, openaiKey: ''}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Cleanup settings failed');
      return true;
   }],

   ['Vi: Delete project', 'delete', 'projects/' + PROJECT6, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }]
];

// *** SNAPSHOTS ***

var PROJECT7 = 'flow7-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var SNAP_DOC_CONTENT = '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n';
var SNAP_EXTRA_FILE = 'doc/notes.md';
var SNAP_EXTRA_CONTENT = '# Notes\n\nSome extra notes.\n';

var snapshotsSequence = [

   ['Snapshots 1: Create project', 'post', 'projects', {}, {name: PROJECT7}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Snapshots 2: Write doc/main.md', 'post', 'project/' + PROJECT7 + '/file/doc/main.md', {}, {content: SNAP_DOC_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Snapshots 3: Write extra file', 'post', 'project/' + PROJECT7 + '/file/' + SNAP_EXTRA_FILE, {}, {content: SNAP_EXTRA_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Extra file write failed');
      return true;
   }],

   // *** Create a snapshot ***

   ['Snapshots 4: Create snapshot with label', 'post', 'project/' + PROJECT7 + '/snapshot', {}, {label: 'before refactor'}, 200, function (s, rq, rs) {
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

   ['Snapshots 5: List snapshots includes our snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot not found in list');
      if (found.label !== 'before refactor') return log ('Label mismatch in list');
      return true;
   }],

   // *** Create a second snapshot (no label) ***

   ['Snapshots 6: Create second snapshot without label', 'post', 'project/' + PROJECT7 + '/snapshot', {}, {}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.id) return log ('Second snapshot creation failed');
      s.snapshotId2 = rs.body.id;
      return true;
   }],

   ['Snapshots 7: List snapshots has two entries', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (! inc (ids, s.snapshotId)) return log ('First snapshot missing');
      if (! inc (ids, s.snapshotId2)) return log ('Second snapshot missing');
      // Newest first
      if (rs.body [0].id !== s.snapshotId2) return log ('Expected newest snapshot first');
      return true;
   }],

   // *** Download snapshot ***

   ['Snapshots 8: Download placeholder snapshot returns 404', 'get', 'snapshots/' + 'placeholder' + '/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // Verify download via httpGet for dynamic path
   ['Snapshots 9: Download snapshot (dynamic path)', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/snapshots/' + encodeURIComponent (s.snapshotId) + '/download', function (error, status, body) {
         if (error) return log ('Download failed: ' + error.message);
         if (status !== 200) return log ('Download returned status ' + status);
         if (! body || body.length < 10) return log ('Download body too small: ' + body.length + ' bytes');
         next ();
      });
   }],

   // *** Restore snapshot as new project ***

   ['Snapshots 10: Restore snapshot as new project', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
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
   ['Snapshots 11: Restored project in list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! projectListHasSlug (rs.body, s.restoredSlug)) return log ('Restored project not in list: ' + s.restoredSlug);
      return true;
   }],

   // Verify restored project has the same files
   ['Snapshots 12: Restored project has both files', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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
   ['Snapshots 13: Restored doc/main.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshots 14: Restored notes.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshots 15: Modify original doc/main.md', 'post', 'project/' + PROJECT7 + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   // Restored project should still have original content
   ['Snapshots 16: Restored project unaffected by original modification', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshots 17: Delete second snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshots 18: List snapshots no longer has deleted snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (inc (ids, s.snapshotId2)) return log ('Deleted snapshot still in list');
      if (! inc (ids, s.snapshotId)) return log ('First snapshot should still exist');
      return true;
   }],

   // *** Snapshot survives project deletion ***

   ['Snapshots 19: Delete original project', 'delete', 'projects/' + PROJECT7, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Snapshots 20: Snapshot still in list after project deletion', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot disappeared after project deletion');
      return true;
   }],

   // *** Delete nonexistent snapshot returns error ***

   ['Snapshots 21: Delete nonexistent snapshot returns 400', 'delete', 'snapshots/nonexistent-id-12345', {}, '', 400, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Download nonexistent snapshot returns 404 ***

   ['Snapshots 22: Download nonexistent snapshot returns 404', 'get', 'snapshots/nonexistent-id-12345/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Cleanup ***

   ['Snapshots 23: Delete restored project', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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
   ['Snapshots 24: Delete first snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshots 25: Snapshots list is clean', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ours = dale.fil (rs.body, undefined, function (snap) {
         if (snap.project === PROJECT7) return snap;
      });
      if (ours.length > 0) return log ('Leftover snapshots from flow7: ' + ours.length);
      return true;
   }]
];

// *** AUTOGIT ***

var PROJECT9 = 'flow9-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var autogitSequence = [

   ['Autogit 1: Create project', 'post', 'projects', {}, {name: PROJECT9}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Autogit 2: .git repository exists in workspace', 'post', 'project/' + PROJECT9 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'test -d .git && echo yes || echo no'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('run_command failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').trim () !== 'yes') return log ('Expected .git directory to exist');
      return true;
   }],

   ['Autogit 3: Capture initial commit count', 'post', 'project/' + PROJECT9 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('Failed to read commit count');
      var n = Number ((rs.body.stdout || '').trim ());
      if (! isFinite (n) || n < 1) return log ('Initial commit count should be >= 1, got: ' + rs.body.stdout);
      s.f9Count0 = n;
      return true;
   }],

   ['Autogit 4: GET files does not create a commit', 'get', 'project/' + PROJECT9 + '/files', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after GET: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after GET');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.f9Count0) return log ('GET /files changed commit count from ' + s.f9Count0 + ' to ' + n);
         s.f9Count1 = n;
         next ();
      });
   }],

   ['Autogit 5: Write doc/notes.md increments commit count', 'post', 'project/' + PROJECT9 + '/file/doc/notes.md', {}, {content: '# Notes\n\nFirst version\n'}, 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after write: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after write');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.f9Count1 + 1) return log ('Expected commit count ' + (s.f9Count1 + 1) + ' after write, got ' + n);
         s.f9Count2 = n;
         next ();
      });
   }],

   ['Autogit 6: Rewriting same content does not create a commit', 'post', 'project/' + PROJECT9 + '/file/doc/notes.md', {}, {content: '# Notes\n\nFirst version\n'}, 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after same-content write: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after same-content write');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.f9Count2) return log ('Same-content write changed commit count from ' + s.f9Count2 + ' to ' + n);
         s.f9Count3 = n;
         next ();
      });
   }],

   ['Autogit 7: run_command with FS mutation increments commit count', 'post', 'project/' + PROJECT9 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'echo from-flow9 > touched-by-tool.txt'}}, 200, function (s, rq, rs, next) {
      if (! rs.body || ! rs.body.success) return log ('Mutating run_command failed');
      httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after mutating run_command: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after mutating run_command');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.f9Count3 + 1) return log ('Expected commit count ' + (s.f9Count3 + 1) + ' after mutating run_command, got ' + n);
         s.f9Count4 = n;
         next ();
      });
   }],

   ['Autogit 8: run_command without FS mutation does not create a commit', 'post', 'project/' + PROJECT9 + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'echo noop'}}, 200, function (s, rq, rs, next) {
      if (! rs.body || ! rs.body.success) return log ('Non-mutating run_command failed');
      httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after non-mutating run_command: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after non-mutating run_command');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.f9Count4) return log ('Non-mutating run_command changed commit count from ' + s.f9Count4 + ' to ' + n);
         s.f9Count5 = n;
         next ();
      });
   }],

   ['Autogit 9: Two concurrent writes keep git healthy and create two commits', 'get', 'project/' + PROJECT9 + '/files', {}, '', 200, function (s, rq, rs, next) {
      var done = 0;
      var failed = false;

      var finishOne = function (error) {
         if (failed) return;
         if (error) {
            failed = true;
            return log ('Concurrent write failed: ' + error);
         }
         done++;
         if (done < 2) return;

         httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (errCount, codeCount, bodyCount) {
            if (errCount) return log ('Failed to read commit count after concurrent writes: ' + errCount.message);
            if (codeCount !== 200 || ! bodyCount || ! bodyCount.success) return log ('Unexpected response reading commit count after concurrent writes');

            var n = Number ((bodyCount.stdout || '').trim ());
            if (n !== s.f9Count5 + 2) return log ('Expected two additional commits after concurrent writes. Expected ' + (s.f9Count5 + 2) + ', got ' + n);

            httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git fsck --no-progress'}}, function (errFsck, codeFsck, bodyFsck) {
               if (errFsck) return log ('git fsck request failed: ' + errFsck.message);
               if (codeFsck !== 200 || ! bodyFsck || ! bodyFsck.success) return log ('git fsck command failed: ' + JSON.stringify (bodyFsck));

               httpJson ('POST', '/project/' + PROJECT9 + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'test ! -e .git/index.lock && echo clean'}}, function (errLock, codeLock, bodyLock) {
                  if (errLock) return log ('index.lock check failed: ' + errLock.message);
                  if (codeLock !== 200 || ! bodyLock || ! bodyLock.success) return log ('index.lock check command failed');
                  if ((bodyLock.stdout || '').trim () !== 'clean') return log ('Expected no .git/index.lock after concurrent writes');
                  next ();
               });
            });
         });
      };

      httpJson ('POST', '/project/' + PROJECT9 + '/file/doc/concurrent-a.md', {content: '# A\n\n' + Date.now () + '\n'}, function (errorA, codeA, bodyA) {
         if (errorA) return finishOne (errorA.message);
         if (codeA !== 200 || ! bodyA || bodyA.ok !== true) return finishOne ('write A status/body mismatch');
         finishOne ();
      });

      httpJson ('POST', '/project/' + PROJECT9 + '/file/doc/concurrent-b.md', {content: '# B\n\n' + Date.now () + '\n'}, function (errorB, codeB, bodyB) {
         if (errorB) return finishOne (errorB.message);
         if (codeB !== 200 || ! bodyB || bodyB.ok !== true) return finishOne ('write B status/body mismatch');
         finishOne ();
      });
   }],

   ['Autogit 10: Delete project', 'delete', 'projects/' + PROJECT9, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Autogit 11: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, PROJECT9)) return log ('Project still exists after deletion');
      return true;
   }],

];

// *** RUNNER ***

// Suite order matches readme.md test suites section.
var SUITE_ORDER = ['project', 'doc', 'upload', 'snapshot', 'autogit', /*vi, */'dialog', 'static', 'backend'];

var allSuites = {
   project:  projectSequence,
   doc:      docSequence,
   upload:   uploadSequence,
   snapshot: snapshotsSequence,
   autogit:   autogitSequence,
   dialog:    dialogSequence,
   static:    staticSequence,
   backend:   backendSequence,
   vi:        viSequence
};

var requestedSuites = [];
dale.go (process.argv.slice (2), function (arg) {
   var match = arg.match (/^--flow=(.+)$/);
   if (match) requestedSuites.push (match [1]);
});

if (! requestedSuites.length) requestedSuites = SUITE_ORDER;

var sequences = dale.go (requestedSuites, function (name) {return allSuites [name];});
var label = requestedSuites.join (' + ');

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
