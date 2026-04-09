var http   = require ('http');
var h      = require ('hitit');
var dale   = require ('dale');
var teishi = require ('teishi');

var TEST_MODE = {cloud: false, auth: null};
var CONFIG = require ('./secret.json');

var log  = teishi.l || function () {console.log.apply (console, arguments)};
var type = teishi.type || teishi.t;
var inc  = teishi.inc;

// Backend integration tests for server.
// Run:   node test-server.js              (all suites)
//        node test-server.js dialog       (dialog suite, includes safety checks)
//        node test-server.js upload       (uploads suite)
//        node test-server.js autogit      (auto-commit suite)
//        node test-server.js fast         (fast suites: project, doc, upload, snapshot, autogit, cloud)
//        node test-server.js noslow       (all suites except static and backend)
// Suite names: project, doc, upload, snapshot, autogit, dialog, static, backend, vi, cloud
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

// Connect to GET /project/:p/dialog/:id/stream and collect SSE events until done/error/close
var collectSSE = function (project, dialogId, cb, options) {
   options = options || {};
   var events = [];
   var called = false;
   var heartbeatTimer = null;
   if (options.heartbeatMs) {
      heartbeatTimer = setInterval (function () {
         if (called) return;
         if (options.onHeartbeat) options.onHeartbeat (events);
      }, options.heartbeatMs);
   }
   var finish = function (error) {
      if (called) return;
      called = true;
      if (heartbeatTimer) clearInterval (heartbeatTimer);
      cb (error, events);
   };
   var req = http.request ({
      hostname: 'localhost',
      port: 5353,
      path: '/project/' + project + '/dialog/' + dialogId + '/stream',
      method: 'GET',
      headers: {Accept: 'text/event-stream'}
   }, function (res) {
      // If the dialog is already done, server may return 200 with immediate done event
      var raw = '';
      res.on ('data', function (chunk) {
         raw += chunk;
         // Parse complete SSE blocks as they arrive
         var blocks = raw.split (/\n\n+/);
         // Last block may be incomplete, keep it
         raw = blocks.pop () || '';
         dale.go (blocks, function (block) {
            var dataLines = dale.fil (block.split ('\n'), undefined, function (line) {
               if (line.indexOf ('data: ') === 0) return line.slice (6);
            });
            if (! dataLines.length) return;
            try {
               var ev = JSON.parse (dataLines.join ('\n'));
               events.push (ev);
               if (options.onEvent) options.onEvent (ev, events);
               if (ev.type === 'done' || ev.type === 'error') finish (ev.type === 'error' ? new Error (ev.error || 'SSE error') : null);
            }
            catch (e) {
               events.push ({type: 'invalid_json', raw: dataLines.join ('\n')});
            }
         });
      });
      res.on ('end', function () {
         // Parse any remaining data
         if (raw.trim ()) {
            var dataLines = dale.fil (raw.split ('\n'), undefined, function (line) {
               if (line.indexOf ('data: ') === 0) return line.slice (6);
            });
            if (dataLines.length) {
               try {
                  var ev = JSON.parse (dataLines.join ('\n'));
                  events.push (ev);
                  if (options.onEvent) options.onEvent (ev, events);
               }
               catch (e) {}
            }
         }
         finish (null);
      });
   });
   req.on ('error', function (err) {finish (err);});
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

var httpJson = function (method, path, payload, cb, headers) {
   payload = payload === undefined ? '' : payload;
   if (TEST_MODE.cloud && TEST_MODE.auth && ! isOpenPath (path)) {
      headers = headers || {};
      if (! headers.Cookie) headers.Cookie = cookieHeader (TEST_MODE.auth.cookies);
      if ((method === 'POST' || method === 'PUT') && type (payload) === 'object' && payload.csrf === undefined) payload.csrf = TEST_MODE.auth.csrf;
      if (method === 'DELETE' && ! headers ['X-CSRF-Token'] && ! headers ['x-csrf-token']) headers ['X-CSRF-Token'] = TEST_MODE.auth.csrf;
   }
   var body = payload === '' ? '' : JSON.stringify (payload);
   var requestHeaders = {};
   dale.go (headers || {}, function (value, key) {
      requestHeaders [key] = value;
   });
   requestHeaders ['Content-Type'] = 'application/json';
   requestHeaders ['Content-Length'] = Buffer.byteLength (body);
   var req = http.request ({
      hostname: 'localhost',
      port: 5353,
      path: path,
      method: method,
      headers: requestHeaders
   }, function (res) {
      var text = '';
      res.on ('data', function (chunk) {text += chunk;});
      res.on ('end', function () {
         var parsed = null;
         try {parsed = text ? JSON.parse (text) : null;} catch (error) {}
         cb (null, res.statusCode, parsed, text, res.headers);
      });
   });
   req.on ('error', cb);
   if (body) req.write (body);
   req.end ();
};

var httpRequest = function (method, path, body, headers, cb) {
   headers = headers || {};
   if (TEST_MODE.cloud && TEST_MODE.auth && ! isOpenPath (path) && ! headers.Cookie) headers.Cookie = cookieHeader (TEST_MODE.auth.cookies);
   var payload = body || '';
   var req = http.request ({
      hostname: 'localhost',
      port: 5353,
      path: path,
      method: method,
      headers: headers
   }, function (res) {
      var text = '';
      res.on ('data', function (chunk) {text += chunk;});
      res.on ('end', function () {
         cb (null, res.statusCode, text, res.headers);
      });
   });
   req.on ('error', cb);
   if (payload) req.write (payload);
   req.end ();
};

var cookieJarFromSetCookie = function (setCookie) {
   setCookie = setCookie || [];
   if (type (setCookie) === 'string') setCookie = [setCookie];
   return dale.obj (setCookie, function (cookieLine) {
      var first = (cookieLine || '').split (';') [0] || '';
      var eqIndex = first.indexOf ('=');
      if (eqIndex === -1) return;
      var key = first.slice (0, eqIndex);
      var value = first.slice (eqIndex + 1).replace (/^"|"$/g, '');
      return [key, value];
   });
};

var cookieHeader = function (jar) {
   jar = jar || {};
   return dale.fil (jar, undefined, function (value, key) {
      if (value === undefined || value === '') return;
      return key + '="' + value + '"';
   }).join ('; ');
};

var isOpenPath = function (path) {
   if (! path) return false;
   if (path [0] !== '/') path = '/' + path;
   return path === '/' || path === '/client.js' || path === '/client-css.js' || path === '/test-client.js' || path.match (/^\/auth\//) || path.match (/^\/public\//);
};

var scopeCloudPath = function (path) {
   if (! TEST_MODE.cloud || ! TEST_MODE.auth || ! TEST_MODE.auth.userId || type (path) !== 'string') return path;
   var normalized = path [0] === '/' ? path : '/' + path;
   var matchProject = normalized.match (/^\/project\/([^/]+)(\/.*)?$/);
   if (matchProject) {
      var slug = decodeURIComponent (matchProject [1]);
      if (slug.indexOf (TEST_MODE.auth.userId + '-') !== 0) slug = TEST_MODE.auth.userId + '-' + slug;
      return '/project/' + encodeURIComponent (slug) + (matchProject [2] || '');
   }
   var matchProjects = normalized.match (/^\/projects\/([^/]+)$/);
   if (matchProjects) {
      var slug2 = decodeURIComponent (matchProjects [1]);
      if (slug2.indexOf (TEST_MODE.auth.userId + '-') !== 0) slug2 = TEST_MODE.auth.userId + '-' + slug2;
      return '/projects/' + encodeURIComponent (slug2);
   }
   return path;
};

var originalHttpRequest = http.request;
http.request = function (options, cb) {
   if (TEST_MODE.cloud && TEST_MODE.auth && type (options) === 'object' && options.hostname === 'localhost' && options.port === 5353) {
      options.path = scopeCloudPath (options.path);
      if (! isOpenPath (options.path)) {
         options.headers = options.headers || {};
         if (! options.headers.Cookie) options.headers.Cookie = cookieHeader (TEST_MODE.auth.cookies);
         if (options.method === 'DELETE' && ! options.headers ['X-CSRF-Token'] && ! options.headers ['x-csrf-token']) options.headers ['X-CSRF-Token'] = TEST_MODE.auth.csrf;
      }
   }
   var req = originalHttpRequest.call (http, options, cb);
   if (TEST_MODE.cloud && TEST_MODE.auth && type (options) === 'object' && options.hostname === 'localhost' && options.port === 5353 && ! isOpenPath (options.path) && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE')) {
      var contentType = (((options.headers || {}) ['Content-Type']) || ((options.headers || {}) ['content-type']) || '').toLowerCase ();
      if (contentType.indexOf ('application/json') === 0) {
         var originalWrite = req.write.bind (req);
         var originalEnd = req.end.bind (req);
         var chunks = [];
         req.write = function (chunk, encoding, callback2) {
            if (chunk) chunks.push (Buffer.isBuffer (chunk) ? chunk : Buffer.from (chunk, encoding));
            if (type (callback2) === 'function') callback2 ();
            return true;
         };
         req.end = function (chunk, encoding, callback2) {
            if (chunk) chunks.push (Buffer.isBuffer (chunk) ? chunk : Buffer.from (chunk, encoding));
            var text = Buffer.concat (chunks).toString ('utf8');
            var payload;
            try {payload = text ? JSON.parse (text) : {};} catch (e) {payload = undefined;}
            if (type (payload) === 'object' && payload && payload.csrf === undefined) {
               payload.csrf = TEST_MODE.auth.csrf;
               var finalText = JSON.stringify (payload);
               options.headers ['Content-Length'] = Buffer.byteLength (finalText);
               originalWrite (finalText);
            }
            else if (text) originalWrite (text);
            return originalEnd (callback2);
         };
      }
   }
   return req;
};

// *** PROJECTS ***

var PROJECT_BASIC = 'test-proj';
var PROJECT_SPACES = 'My Cool Project';
var PROJECT_EMOJI = '🚀 Rocket App';
var PROJECT_ACCENTED = 'café étude';
var PROJECT_MIXED = 'hello—world & friends!';
var PROJECT_NONLATIN = '日本語プロジェクト';

var normalizeProjectSlugForMode = function (slug) {
   if (! TEST_MODE.cloud || ! TEST_MODE.auth || ! TEST_MODE.auth.userId || type (slug) !== 'string') return slug;
   var prefix = TEST_MODE.auth.userId + '-';
   return slug.indexOf (prefix) === 0 ? slug.slice (prefix.length) : slug;
};

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

var DIALOG_PROJECT = 'dialog-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var DIALOG_SLUG = 'dialog-read-vibey';

var dialogSequence = [

   ['Dialog 0: GET /models returns provider-scoped model list', 'get', 'models', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body from GET /models');
      if (! rs.body.openai || type (rs.body.openai) !== 'object') return log ('Missing openai key in models');
      if (! rs.body.anthropic || type (rs.body.anthropic) !== 'object') return log ('Missing anthropic key in models');
      if (! rs.body.openai ['gpt-5.4'] || ! rs.body.openai ['gpt-5.4'].context) return log ('Missing gpt-5.4 in openai models');
      if (! rs.body.anthropic ['claude-sonnet-4-6'] || ! rs.body.anthropic ['claude-sonnet-4-6'].context) return log ('Missing claude-sonnet-4-6 in anthropic models');
      if (! rs.body.anthropic ['claude-haiku-4-5'] || ! rs.body.anthropic ['claude-haiku-4-5'].context) return log ('Missing claude-haiku-4-5 in anthropic models');
      // gpt-4.1 is apiKeyOnly — should be absent when no OpenAI API key is set
      var hasOpenAIKey = !! (CONFIG.accounts && CONFIG.accounts.openai && CONFIG.accounts.openai.apiKey);
      if (hasOpenAIKey) {
         if (! rs.body.openai ['gpt-4.1'] || ! rs.body.openai ['gpt-4.1'].context) return log ('Expected gpt-4.1 present when API key is set');
         if (! rs.body.openai ['gpt-4.1'].apiKeyOnly) return log ('Expected gpt-4.1 to have apiKeyOnly: true');
      } else {
         if (rs.body.openai ['gpt-4.1']) return log ('Expected gpt-4.1 absent when no API key is set');
      }
      return true;
   }],

   ['Dialog 0b: GET /models with API key includes apiKeyOnly models', 'get', 'models', {}, '', 200, function (s, rq, rs, next) {
      // Set an OpenAI API key, then check gpt-4.1 appears
      httpJson ('POST', '/settings', {openaiKey: 'sk-test-models-apikey'}, function (error, code) {
         if (error) return log ('POST /settings failed: ' + error.message);
         if (code !== 200) return log ('Expected 200 from POST /settings, got ' + code);
         httpRequest ('GET', '/models', '', {}, function (error2, code2, text2) {
            if (error2) return log ('GET /models failed: ' + error2.message);
            if (code2 !== 200) return log ('Expected 200 from GET /models, got ' + code2);
            var body2 = JSON.parse (text2);
            if (! body2 || ! body2.openai || ! body2.openai ['gpt-4.1']) return log ('Expected gpt-4.1 present after setting API key');
            if (! body2.openai ['gpt-4.1'].apiKeyOnly) return log ('Expected gpt-4.1.apiKeyOnly to be true');
            // Clean up: remove the API key
            httpJson ('POST', '/settings', {openaiKey: ''}, function (error3, code3) {
               if (error3) return log ('POST /settings cleanup failed: ' + error3.message);
               httpRequest ('GET', '/models', '', {}, function (error4, code4, text4) {
                  if (error4) return log ('GET /models after cleanup failed: ' + error4.message);
                  var body4 = JSON.parse (text4);
                  if (body4 && body4.openai && body4.openai ['gpt-4.1']) return log ('Expected gpt-4.1 absent after clearing API key');
                  next ();
               });
            });
         });
      });
   }],

   ['Dialog 1: GET / serves shell', 'get', '/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      if (rs.body.indexOf ('client.js') === -1) return log ('HTML shell missing client.js');
      return true;
   }],

   ['Dialog 2: Create project', 'post', 'projects', {}, {name: DIALOG_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== DIALOG_PROJECT) return log ('Unexpected project slug returned');
      return true;
   }],

   ['Dialog 3: Create dialog draft', 'post', 'project/' + DIALOG_PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: DIALOG_SLUG}, 200, function (s, rq, rs) {
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

   ['Dialog 4: Draft listed as done', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('dialogs endpoint should return array');
      var match = dale.stopNot (rs.body, undefined, function (d) {
         if (d.dialogId === s.dialogId) return d;
      });
      if (! match) return log ('Created dialog not found in dialogs list');
      if (match.status !== 'done') return log ('Created dialog should be done');
      return true;
   }],

   ['Dialog 5: Seed test-sample.txt', 'post', 'project/' + DIALOG_PROJECT + '/tool/execute', {}, {toolName: 'write_file', toolInput: {path: 'test-sample.txt', content: '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('Failed to write test-sample.txt: ' + JSON.stringify (rs.body));
      return true;
   }],

   // Test 6: PUT returns JSON immediately (async generation)
   ['Dialog 6: PUT returns JSON with status active', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogId,
         prompt: 'Use the run_command tool to run `cat test-sample.txt`. Reply with its line count only.'
      }, function (error, code, body) {
         if (error) return log ('PUT /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected JSON object, got ' + type (body));
         if (body.status !== 'active') return log ('Expected status active, got: ' + body.status);
         if (! body.dialogId) return log ('Missing dialogId in response');
         if (! body.filename) return log ('Missing filename in response');
         next ();
      });
   }],

   // Test 7: Connect to SSE stream, collect events until done
   ['Dialog 7: SSE stream has context event', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      collectSSE (DIALOG_PROJECT, s.dialogId, function (error, events) {
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) {
            var eventTypes = dale.go (events, function (ev) {return ev && ev.type ? ev.type : 'unknown';}).join (', ');
            return log ('Expected done event. Events: ' + eventTypes);
         }
         var contextEvents = getEventsByType (events, 'context');
         if (! contextEvents.length) return log ('Expected at least one context SSE event');
         var ctx = contextEvents [0].context;
         if (! ctx || (type (ctx.percent) !== 'integer' && type (ctx.percent) !== 'float')) return log ('Context event missing numeric percent field');
         if (ctx.percent < 0 || ctx.percent > 100) return log ('Context percent out of range: ' + ctx.percent);
         if (type (ctx.used) !== 'integer' || ctx.used < 0) return log ('Context used should be a non-negative integer');
         if (type (ctx.limit) !== 'integer' || ctx.limit < 1) return log ('Context limit should be a positive integer');
         next ();
      });
   }],

   // Test 8: Verify markdown on disk
   ['Dialog 8: Markdown has Time + Context + run_command', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (md.indexOf ('> Time:') === -1) return log ('Dialog markdown missing > Time metadata');
         if (md.indexOf ('> Context:') === -1) return log ('Dialog markdown missing > Context metadata');
         if (! hasToolMention (md, 'run_command')) return log ('Missing run_command evidence in dialog markdown');
         if (! hasResultMarker (md)) return log ('run_command block missing Result section');
         next ();
      });
   }],

   // Test 9: PUT for write_file returns JSON
   ['Dialog 9: PUT write_file returns JSON with status active', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogId,
         prompt: 'Use write_file to create dummy.js with this exact content: console.log("hello from dummy");\nDo only this one tool call, nothing else.'
      }, function (error, code, body) {
         if (error) return log ('PUT /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected JSON object');
         if (body.status !== 'active') return log ('Expected status active, got: ' + body.status);
         next ();
      });
   }],

   // Test 10: Collect SSE stream until done
   ['Dialog 10: SSE stream finishes with done', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var started = Date.now ();
      log ('[dialog-10] stream start ' + s.dialogId);
      collectSSE (DIALOG_PROJECT, s.dialogId, function (error, events) {
         var elapsed = Math.round ((Date.now () - started) / 1000);
         log ('[dialog-10] stream complete in ' + elapsed + 's, events=' + events.length + (error ? (' error=' + error.message) : ''));
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) {
            var eventTypes = dale.go (events, function (ev) {return ev && ev.type ? ev.type : 'unknown';}).join (', ');
            return log ('Expected done event. Events: ' + eventTypes);
         }
         next ();
      }, {
         heartbeatMs: 10000,
         onHeartbeat: function (events) {
            var elapsed = Math.round ((Date.now () - started) / 1000);
            log ('[dialog-10] streaming... ' + elapsed + 's events=' + events.length);
         },
         onEvent: function (ev, events) {
            if (! ev || ! ev.type) return;
            var extra = '';
            if (ev.type === 'chunk' && type (ev.content) === 'string') extra = ' len=' + ev.content.length;
            log ('[dialog-10] event ' + ev.type + extra + ' total=' + events.length);
         }
      });
   }],

   // Test 11: Verify markdown has write_file
   ['Dialog 11: Markdown has write_file', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.dialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (! hasToolMention (md, 'write_file')) return log ('Missing write_file block in dialog markdown');
         if (! hasResultMarker (md)) return log ('write_file block missing Result section');
         next ();
      });
   }],

   // Test 12: Verify dummy.js exists
   ['Dialog 12: Verify dummy.js via tool/execute', 'post', 'project/' + DIALOG_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat dummy.js'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('run_command cat dummy.js failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').indexOf ('console.log') === -1) return log ('dummy.js does not contain console.log');
      return true;
   }],

   // Test 13: Continue without provider — PUT returns JSON
   ['Dialog 13: Continue without provider returns JSON', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogId,
         prompt: 'Reply with the single word: ok'
      }, function (error, code, body) {
         if (error) return log ('PUT /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected JSON object');
         if (body.status !== 'active') return log ('Expected status active, got: ' + body.status);
         next ();
      });
   }],

   // Test 14: SSE stream finishes
   ['Dialog 14: SSE stream finishes with done', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      collectSSE (DIALOG_PROJECT, s.dialogId, function (error, events) {
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected done event');
         next ();
      });
   }],

   // Test 15: Metadata stripping — PUT returns JSON
   ['Dialog 15: PUT for metadata stripping returns JSON', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogId,
         prompt: "Repeat your previous assistant message verbatim; if any line starts with '>' include it."
      }, function (error, code, body) {
         if (error) return log ('PUT /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected JSON object');
         next ();
      });
   }],

   // Test 16: SSE stream output does not contain stripped metadata
   ['Dialog 16: SSE output strips only Id/Provider/Model metadata', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var started = Date.now ();
      log ('[dialog-16] stream start ' + s.dialogId);
      collectSSE (DIALOG_PROJECT, s.dialogId, function (error, events) {
         var elapsed = Math.round ((Date.now () - started) / 1000);
         log ('[dialog-16] stream complete in ' + elapsed + 's, events=' + events.length + (error ? (' error=' + error.message) : ''));
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected done event');
         var combined = dale.go (events, function (ev) {
            if (ev && ev.type === 'chunk' && type (ev.content) === 'string') return ev.content;
         }).join ('');
         if (combined.indexOf ('> Id:') !== -1) return log ('Output contains > Id: metadata');
         if (combined.indexOf ('> Provider:') !== -1) return log ('Output contains > Provider: metadata');
         if (combined.indexOf ('> Model:') !== -1) return log ('Output contains > Model: metadata');
         next ();
      }, {
         heartbeatMs: 10000,
         onHeartbeat: function (events) {
            var elapsed = Math.round ((Date.now () - started) / 1000);
            log ('[dialog-16] streaming... ' + elapsed + 's events=' + events.length);
         },
         onEvent: function (ev, events) {
            if (! ev || ! ev.type) return;
            var extra = '';
            if (ev.type === 'chunk' && type (ev.content) === 'string') extra = ' len=' + ev.content.length;
            log ('[dialog-16] event ' + ev.type + extra + ' total=' + events.length);
         }
      });
   }],

   // Test 17: POST /dialog returns JSON (async, no SSE on POST)
   ['Dialog 17: POST /dialog returns JSON immediately', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Use the run_command tool to run `cat test-sample.txt`. Reply with its first line only.',
         slug: 'async-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected JSON object');
         if (body.status !== 'active') return log ('Expected status active, got: ' + body.status);
         if (! body.dialogId) return log ('Missing dialogId');
         if (! body.filename) return log ('Missing filename');
         s.asyncDialogId = body.dialogId;
         next ();
      });
   }],

   // Test 18: SSE stream for the new dialog
   ['Dialog 18: SSE stream for POST dialog finishes', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      collectSSE (DIALOG_PROJECT, s.asyncDialogId, function (error, events) {
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected done event');
         next ();
      });
   }],

   // Test 19: Verify markdown has tool request + result
   ['Dialog 19: POST dialog markdown has run_command', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.asyncDialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (! hasToolMention (md, 'run_command')) return log ('Missing run_command in dialog markdown');
         if (! hasResultMarker (md)) return log ('Missing result marker in dialog markdown');
         next ();
      });
   }],

   // Test 19b: Verify provider message normalization (no hallucinated tool-call text)
   ['Dialog 19b: Provider messages have structured tool calls', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('GET', '/project/' + DIALOG_PROJECT + '/dialog/' + s.dialogId + '/messages', null, function (error, code, body) {
         if (error) return log ('GET messages failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (type (body) !== 'object') return log ('Expected object body');

         // Responses API: no flattened tool-call text
         var responsesApi = body.responsesApi || [];
         var hasHallucination = dale.stop (responsesApi, true, function (item) {
            if (type (item) === 'object' && type (item.content) === 'string' && item.content.indexOf ('[Assistant tool calls]') !== -1) return true;
         });
         if (hasHallucination) return log ('responsesApi contains "[Assistant tool calls]" text — tool calls were flattened instead of structured');

         // Responses API: has structured function_call items
         var hasFunctionCall = dale.stop (responsesApi, true, function (item) {
            if (item && item.type === 'function_call' && item.name && item.call_id && item.arguments) return true;
         });
         if (! hasFunctionCall) return log ('responsesApi missing structured function_call item');

         // Responses API: has function_call_output items
         var hasFunctionOutput = dale.stop (responsesApi, true, function (item) {
            if (item && item.type === 'function_call_output' && item.call_id) return true;
         });
         if (! hasFunctionOutput) return log ('responsesApi missing function_call_output item');

         // OpenAI Chat Completions: has assistant message with tool_calls array
         var openai = body.openai || [];
         var hasToolCalls = dale.stop (openai, true, function (msg) {
            if (msg && msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) return true;
         });
         if (! hasToolCalls) return log ('openai messages missing assistant message with tool_calls');

         // OpenAI Chat Completions: has tool result message
         var hasToolResult = dale.stop (openai, true, function (msg) {
            if (msg && msg.role === 'tool' && msg.tool_call_id) return true;
         });
         if (! hasToolResult) return log ('openai messages missing tool result message');

         next ();
      });
   }],

   // Test 20: SSE stream on done dialog returns immediate done
   ['Dialog 20: SSE stream on done dialog returns done immediately', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      collectSSE (DIALOG_PROJECT, s.asyncDialogId, function (error, events) {
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected immediate done event for finished dialog');
         // Should have no chunk events (dialog already done)
         var chunks = getEventsByType (events, 'chunk');
         if (chunks.length > 0) return log ('Expected no chunk events for finished dialog, got ' + chunks.length);
         next ();
      });
   }],

   // Test 21-22: Create agent drafts
   ['Dialog 21: Create agent-a draft', 'post', 'project/' + DIALOG_PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-a'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.dialogA = rs.body.dialogId;
      if (rs.body.status !== 'done') return log ('agent-a should start as done, got: ' + rs.body.status);
      if (! rs.body.filename || rs.body.filename.indexOf ('-done.md') === -1) return log ('agent-a filename should end in -done.md');
      return true;
   }],

   ['Dialog 22: Create agent-b draft', 'post', 'project/' + DIALOG_PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-b'}, 200, function (s, rq, rs) {
      if (! rs.body.dialogId) return log ('missing dialogId');
      s.dialogB = rs.body.dialogId;
      if (rs.body.status !== 'done') return log ('agent-b should start as done, got: ' + rs.body.status);
      if (! rs.body.filename || rs.body.filename.indexOf ('-done.md') === -1) return log ('agent-b filename should end in -done.md');
      return true;
   }],

   // Test 23: Fire both agents — PUT returns JSON immediately
   ['Dialog 23: Fire both agents (non-blocking)', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var fired = 0;
      var onFired = function () {
         fired++;
         if (fired === 2) setTimeout (next, 2000);
      };
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogA,
         prompt: 'Use the run_command tool to run `sleep 6 && echo still-running`. After it completes, reply with the single word: finished'
      }, function () {onFired ();});
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {
         dialogId: s.dialogB,
         prompt: 'Use the run_command tool to run `sleep 6 && echo still-running`. After it completes, reply with the single word: finished'
      }, function () {onFired ();});
   }],

   // Test 24: Poll until agent-a is active, then immediately verify conflicting continue is rejected (409)
   ['Dialog 24: Agent-a active state rejects conflicting continue (409)', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + DIALOG_PROJECT + '/dialogs', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var dialogs = JSON.parse (body);
               var entry = dale.stopNot (dialogs, undefined, function (d) {
                  if (d && d.dialogId === s.dialogA) return d;
               });
               if (! entry) return done (false);
               if (entry.status !== 'active') return done (false);
               if (entry.filename.indexOf ('-active.md') === -1) return done (false, new Error ('Status active but filename missing -active.md: ' + entry.filename));
               httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {dialogId: s.dialogA, prompt: 'This must be rejected while agent-a is active.'}, function (putError, code, putBody) {
                  if (putError) return done (false, new Error ('PUT /dialog rejection request failed: ' + putError.message));
                  if (code !== 409) return done (false, new Error ('Expected 409, got ' + code));
                  if (! putBody || ! putBody.error) return done (false, new Error ('Expected error payload for 409'));
                  s.activeObserved = true;
                  done (true);
               });
            }
            catch (e) {done (false);}
         });
      }, 200, 15000, function (error) {
         if (error) return log ('agent-a active/409 test failed: ' + error.message);
         next ();
      });
   }],

   // Test 25: Connect to agent-b's SSE stream, verify the stream is live
   ['Dialog 25: SSE stream for agent-b has events', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var events = [];
      var called = false;
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + DIALOG_PROJECT + '/dialog/' + s.dialogB + '/stream',
         method: 'GET',
         headers: {Accept: 'text/event-stream'}
      }, function (res) {
         var raw = '';
         res.on ('data', function (chunk) {
            raw += chunk;
            var blocks = raw.split (/\n\n+/);
            raw = blocks.pop () || '';
            dale.go (blocks, function (block) {
               var dataLines = dale.fil (block.split ('\n'), undefined, function (line) {
                  if (line.indexOf ('data: ') === 0) return line.slice (6);
               });
               if (! dataLines.length) return;
               try {events.push (JSON.parse (dataLines.join ('\n')));} catch (e) {}
            });
            if (! called && events.length > 0) {
               called = true;
               req.destroy ();
               next ();
            }
         });
         res.on ('end', function () {
            if (! called) {called = true; next ();}
         });
      });
      req.on ('error', function (err) {
         if (err.code === 'ECONNRESET') return;
      });
      req.end ();
   }],

   // Test 26: Active status was observed before stop
   ['Dialog 26: Active status was observed before stop', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      if (! s.activeObserved) return log ('Active status was never observed');
      next ();
   }],

   // Test 27: Stop agent-a
   ['Dialog 27: Stop agent-a (200)', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {dialogId: s.dialogA, status: 'done'}, function (error, code, body) {
         if (error) return log ('PUT /dialog stop failed: ' + error.message);
         if (code !== 200) return log ('Expected 200 when stopping, got ' + code);
         if (type (body) !== 'object') return log ('Expected object body');
         if (body.status !== 'done') return log ('Expected status done after stop, got: ' + body.status);
         next ();
      });
   }],

   // Test 28: Agent-a is done, active was observed
   ['Dialog 28: Agent-a is done, active was observed', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + DIALOG_PROJECT + '/dialogs', function (error, status, body) {
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

   // Test 29: Two concurrent PUTs on done agent-a — one wins (200), other gets 409
   ['Dialog 29: Concurrent PUT race on done dialog', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var results = [];
      var finished = 0;
      var onDone = function () {
         finished++;
         if (finished < 2) return;
         var codes = dale.go (results, function (r) {return r.code;}).sort ();
         if (codes [0] !== 200 || codes [1] !== 409) return log ('Expected one 200 and one 409, got ' + codes.join (' and '));
         var winner = dale.stopNot (results, undefined, function (r) {if (r.code === 200) return r;});
         if (! winner || ! winner.body || winner.body.status !== 'active') return log ('Winner should have status active');
         var loser = dale.stopNot (results, undefined, function (r) {if (r.code === 409) return r;});
         if (! loser || ! loser.body || ! loser.body.error) return log ('Loser should have error payload');
         next ();
      };
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {dialogId: s.dialogA, prompt: 'Concurrent race prompt A: reply with the single word alpha'}, function (error, code, body) {
         results.push ({code: code, body: body, error: error});
         onDone ();
      });
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {dialogId: s.dialogA, prompt: 'Concurrent race prompt B: reply with the single word beta'}, function (error, code, body) {
         results.push ({code: code, body: body, error: error});
         onDone ();
      });
   }],

   // Test 30: Stop agent-a after the concurrent race winner started it
   ['Dialog 30: Stop agent-a after concurrent race', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('PUT', '/project/' + DIALOG_PROJECT + '/dialog', {dialogId: s.dialogA, status: 'done'}, function (error, code, body) {
         if (error) return log ('PUT /dialog stop after race failed: ' + error.message);
         if (code !== 200) return log ('Expected 200 when stopping after race, got ' + code);
         if (type (body) !== 'object') return log ('Expected object body');
         if (body.status !== 'done') return log ('Expected status done after stop, got: ' + body.status);
         next ();
      });
   }],

   // Test 31-39: Cleanup
   ['Dialog 31: Delete project while agent-b active', 'delete', 'projects/' + DIALOG_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Dialog 32: Project gone from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, DIALOG_PROJECT)) return log ('Project still exists after deletion');
      return true;
   }],

   ['Dialog 33: Dialogs endpoint 404', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 404],

   ['Dialog 34: Files endpoint 404', 'get', 'project/' + DIALOG_PROJECT + '/files', {}, '', 404],

   ['Dialog 35: Re-create project', 'post', 'projects', {}, {name: DIALOG_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Re-creation failed');
      return true;
   }],

   ['Dialog 36: No dialogs in fresh project', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length !== 0) return log ('Expected 0 dialogs, got ' + rs.body.length);
      return true;
   }],

   ['Dialog 37: Only doc/main.md in fresh project', 'get', 'project/' + DIALOG_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var unexpected = dale.fil (rs.body, undefined, function (name) {
         if (name !== 'doc/main.md') return name;
      });
      if (unexpected.length) return log ('Unexpected files: ' + unexpected.join (', '));
      return true;
   }],

   // Tests 38-43: Streaming tool deltas
   // The project was recreated fresh in test 35.

   // Test 38: Create a dialog and fire a write_file prompt with large content
   ['Dialog 38: Fire write_file for streaming deltas', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Use write_file to create a file called streamed.txt containing at least 200 words of prose about the history of computing. Do only this one tool call, nothing else.',
         slug: 'stream-delta-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (! body || ! body.dialogId) return log ('Missing dialogId');
         s.streamDeltaDialogId = body.dialogId;
         next ();
      });
   }],

   // Test 39: Collect SSE stream and verify tool block content arrives as chunk events
   ['Dialog 39: SSE stream has tool block chunks before tool_request', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var started = Date.now ();
      log ('[dialog-39] stream start ' + s.streamDeltaDialogId);
      collectSSE (DIALOG_PROJECT, s.streamDeltaDialogId, function (error, events) {
         var elapsed = Math.round ((Date.now () - started) / 1000);
         log ('[dialog-39] stream complete in ' + elapsed + 's, events=' + events.length);
         if (error) return log ('SSE stream error: ' + error.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected done event');
         if (! events.length) return log ('Expected at least one SSE event');
         if ((events [0] || {}).type !== 'snapshot') return log ('Active dialog SSE should begin with a snapshot event');

         // Collect all chunk events and tool_request events
         var chunkEvents = getEventsByType (events, 'chunk');
         var toolRequestEvents = getEventsByType (events, 'tool_request');

         if (! toolRequestEvents.length) return log ('Expected at least one tool_request event');

         // Find chunk events that contain tool block header markers
         var toolHeaderChunks = dale.fil (chunkEvents, undefined, function (ev) {
            if (ev.content && ev.content.indexOf ('Tool request:') !== -1) return ev;
         });
         if (! toolHeaderChunks.length) return log ('Expected chunk events containing "Tool request:" header (tool blocks should stream as chunks)');

         // Verify that chunk events contain JSON argument fragments
         // Concatenate all chunk content and check for the tool block pattern
         var allChunkContent = dale.go (chunkEvents, function (ev) {return ev.content || '';}).join ('');
         if (allChunkContent.indexOf ('---\nTool request: write_file') === -1) return log ('Chunk stream missing tool block header for write_file');
         if (allChunkContent.indexOf ('streamed.txt') === -1) return log ('Chunk stream missing file path in tool arguments');
         if (allChunkContent.indexOf ('\n---') === -1) return log ('Chunk stream missing tool block closer');

         log ('[dialog-39] snapshot came first and tool header streamed through chunk events');
         next ();
      }, {
         heartbeatMs: 15000,
         onHeartbeat: function (events) {
            var elapsed = Math.round ((Date.now () - started) / 1000);
            log ('[dialog-39] streaming... ' + elapsed + 's events=' + events.length);
         }
      });
   }],

   // Test 40: Verify the markdown on disk has the tool block with result (writeToolResults replaced it)
   ['Dialog 40: Markdown has write_file with result after streaming', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.streamDeltaDialogId, function (error, md) {
         if (error) return log ('Could not fetch dialog: ' + error.message);
         if (! hasToolMention (md, 'write_file')) return log ('Missing write_file in dialog markdown');
         if (! hasResultMarker (md)) return log ('write_file block missing Result section');
         if (md.indexOf ('streamed.txt') === -1) return log ('Missing streamed.txt path in markdown');
         next ();
      });
   }],

   // Test 41: Verify the file was actually created
   ['Dialog 41: streamed.txt exists via tool/execute', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/tool/execute', {
         toolName: 'run_command', toolInput: {command: 'wc -w /workspace/streamed.txt'}
      }, function (error, code, body) {
         if (error) return log ('tool/execute failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (! body || ! body.success) return log ('run_command failed: ' + JSON.stringify (body));
         // Parse word count — should be >= 200
         var wc = parseInt ((body.stdout || '').trim ());
         if (isNaN (wc) || wc < 100) return log ('Expected at least 100 words in streamed.txt, got ' + wc);
         log ('[dialog-41] streamed.txt has ' + wc + ' words');
         next ();
      });
   }],

   // Test 42: Text-only response produces no tool block chunks
   ['Dialog 42: Text-only response has no tool block chunks', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Say hello and nothing else. Do not use any tools.',
         slug: 'no-tool-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         s.noToolDialogId = body.dialogId;

         collectSSE (DIALOG_PROJECT, body.dialogId, function (error, events) {
            if (error) return log ('SSE stream error: ' + error.message);
            if (! getEventsByType (events, 'done').length) return log ('Expected done event');

            var chunkEvents = getEventsByType (events, 'chunk');
            var allChunkContent = dale.go (chunkEvents, function (ev) {return ev.content || '';}).join ('');
            if (allChunkContent.indexOf ('Tool request:') !== -1) return log ('Text-only response should not contain tool block markers in chunks');
            if (getEventsByType (events, 'tool_request').length) return log ('Text-only response should have no tool_request events');

            log ('[dialog-42] text-only response confirmed: no tool block content in chunks');
            next ();
         });
      });
   }],

   // Test 43: edit_file streams deltas too
   ['Dialog 43: edit_file streams tool block as chunks', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      // First seed a file to edit
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/tool/execute', {
         toolName: 'write_file', toolInput: {path: '/workspace/to-edit.txt', content: 'line 1\nline 2\nline 3\nline 4\nline 5 replace me\nline 6\nline 7\nline 8\nline 9\nline 10\n'}
      }, function (error, code, body) {
         if (error) return log ('Seed write_file failed: ' + error.message);

         httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
            provider: 'openai',
            model: 'gpt-5.2-codex',
            prompt: 'Use edit_file to replace "line 5 replace me" with "line 5 replaced" in to-edit.txt. Do only this one tool call, nothing else.',
            slug: 'edit-delta-test'
         }, function (error, code, body) {
            if (error) return log ('POST /dialog failed: ' + error.message);
            if (code !== 200) return log ('Expected 200, got ' + code);

            collectSSE (DIALOG_PROJECT, body.dialogId, function (error, events) {
               if (error) return log ('SSE stream error: ' + error.message);
               if (! getEventsByType (events, 'done').length) return log ('Expected done event');

               var chunkEvents = getEventsByType (events, 'chunk');
               var allChunkContent = dale.go (chunkEvents, function (ev) {return ev.content || '';}).join ('');
               if (allChunkContent.indexOf ('Tool request: edit_file') === -1) return log ('Expected edit_file tool block header in chunks');
               if (allChunkContent.indexOf ('to-edit.txt') === -1) return log ('Expected file path in chunk content');

               var toolRequestEvents = getEventsByType (events, 'tool_request');
               var editRequest = dale.fil (toolRequestEvents, undefined, function (ev) {
                  if (ev.tool && ev.tool.name === 'edit_file') return ev;
               });
               if (! editRequest.length) return log ('Expected tool_request event for edit_file');

               log ('[dialog-43] edit_file tool block streamed via chunks');
               next ();
            });
         });
      });
   }],

   // Test 44: Tool call description appears in markdown
   ['Dialog 44: Tool call description in markdown', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Use run_command to run `echo hello-description-test`. Do only this one tool call, nothing else.',
         slug: 'desc-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         s.descDialogId = body.dialogId;

         collectSSE (DIALOG_PROJECT, body.dialogId, function (error, events) {
            if (error) return log ('SSE stream error: ' + error.message);
            if (! getEventsByType (events, 'done').length) return log ('Expected done event');

            fetchDialogMarkdown (DIALOG_PROJECT, body.dialogId, function (error, md) {
               if (error) return log ('Could not fetch dialog: ' + error.message);

               // Verify the > Description: line exists in the tool block
               if (md.indexOf ('> Description:') === -1) return log ('Missing > Description: line in tool block markdown');

               // Verify description appears after Tool request header
               var toolBlockMatch = md.match (/---\nTool request:\s+run_command\s+\[[^\]]+\]\n> Description:\s*(.+)\n/);
               if (! toolBlockMatch) return log ('Description line not in expected position (after Tool request header)');
               if (! toolBlockMatch [1].trim ()) return log ('Description is empty');

               // Verify the description field is NOT in the input JSON
               var inputJsonMatch = md.match (/Tool request:.*\n> Description:.*\n\n([\s\S]*?)\n\nResult:/);
               if (inputJsonMatch) {
                  var inputText = inputJsonMatch [1].replace (/^ {4}/gm, '').trim ();
                  try {
                     var inputParsed = JSON.parse (inputText);
                     if (inputParsed.description) return log ('description field should be stripped from input JSON but found: ' + inputParsed.description);
                  }
                  catch (e) {}
               }

               log ('[dialog-44] tool block has > Description: line with non-empty description, stripped from input JSON');
               next ();
            });
         });
      });
   }],

   // Test 45: SSE tool_request event still has description in input
   ['Dialog 45: tool_request event has description in input', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Use write_file to create a file called desc-test-file.txt with content "hello". Do only this one tool call.',
         slug: 'desc-event-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);

         collectSSE (DIALOG_PROJECT, body.dialogId, function (error, events) {
            if (error) return log ('SSE stream error: ' + error.message);
            if (! getEventsByType (events, 'done').length) return log ('Expected done event');

            var toolRequestEvents = getEventsByType (events, 'tool_request');
            if (! toolRequestEvents.length) return log ('Expected at least one tool_request event');

            var writeFileReq = dale.fil (toolRequestEvents, undefined, function (ev) {
               if (ev.tool && ev.tool.name === 'write_file') return ev;
            });
            if (! writeFileReq.length) return log ('Expected tool_request event for write_file');

            // The tool_request event's input should still have description (it's the raw LLM output)
            var input = writeFileReq [0].tool.input;
            if (! input || ! input.description) return log ('Expected description in tool_request event input');

            log ('[dialog-45] tool_request event has description: ' + JSON.stringify (input.description).slice (0, 80));
            next ();
         });
      });
   }],

   // Test 46: tool/execute strips description from input
   ['Dialog 46: tool/execute strips description from input', 'post', 'project/' + DIALOG_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {description: 'Test that description is stripped', command: 'echo desc-stripped-ok'}}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.success) return log ('run_command failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').indexOf ('desc-stripped-ok') === -1) return log ('Expected stdout to contain desc-stripped-ok');
      // If we got here, the tool executed successfully despite the extra description field
      return true;
   }],

   ['Dialog 47: launch_agent spawns a sibling dialog', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + DIALOG_PROJECT + '/dialog', {
         provider: 'openai',
         model: 'gpt-5.2-codex',
         prompt: 'Use launch_agent exactly once. Spawn a sibling agent with provider openai, model gpt-5.2-codex, slug spawned-agent-test, and prompt "Use run_command to execute `sleep 5 && echo CHILD READY`, then reply with exactly CHILD READY. Do not use any other tools." After launching it, briefly say that you spawned it. Do not use any other tools.',
         slug: 'spawn-parent-test'
      }, function (error, code, body) {
         if (error) return log ('POST /dialog failed: ' + error.message);
         if (code !== 200) return log ('Expected 200, got ' + code);
         if (! body || ! body.dialogId) return log ('Missing parent dialogId');
         s.spawnParentDialogId = body.dialogId;

         collectSSE (DIALOG_PROJECT, body.dialogId, function (streamError, events) {
            if (streamError) return log ('Parent SSE stream error: ' + streamError.message);
            if (! getEventsByType (events, 'done').length) return log ('Expected done event for parent dialog');
            var toolRequests = dale.fil (getEventsByType (events, 'tool_request'), undefined, function (ev) {
               if (ev.tool && ev.tool.name === 'launch_agent') return ev;
            });
            if (toolRequests.length !== 1) return log ('Expected exactly one launch_agent tool_request event, got ' + toolRequests.length);
            var toolResults = dale.fil (getEventsByType (events, 'tool_result'), undefined, function (ev) {
               if (ev.tool && ev.tool.name === 'launch_agent') return ev;
            });
            if (toolResults.length !== 1) return log ('Expected exactly one launch_agent tool_result event, got ' + toolResults.length);
            var launched = (((toolResults [0] || {}).tool || {}).result || {}).launched;
            if (type (launched) !== 'object' || ! launched.dialogId) return log ('launch_agent result missing launched dialog payload');
            if (launched.provider !== 'openai') return log ('Expected spawned provider openai, got ' + launched.provider);
            if (launched.model !== 'gpt-5.2-codex') return log ('Expected spawned model gpt-5.2-codex, got ' + launched.model);
            if (! launched.filename || launched.filename.indexOf ('-active.md') === -1 && launched.filename.indexOf ('-done.md') === -1) return log ('Unexpected spawned filename: ' + launched.filename);
            s.spawnChildDialogId = launched.dialogId;
            next ();
         });
      });
   }],

   ['Dialog 48: Parent markdown stores launch_agent tool block', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.spawnParentDialogId, function (error, md) {
         if (error) return log ('Could not fetch parent dialog: ' + error.message);
         if (! hasToolMention (md, 'launch_agent')) return log ('Missing launch_agent in parent dialog markdown');
         if (! hasResultMarker (md)) return log ('launch_agent block missing Result section');
         if (md.indexOf ('spawned-agent-test') === -1) return log ('Missing spawned slug in parent markdown');
         if (md.indexOf ('sleep 5 && echo CHILD READY') === -1) return log ('Missing spawned prompt content in parent markdown');
         next ();
      });
   }],

   ['Dialog 49: launch_agent is non-blocking for the parent', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      var started = Date.now ();
      var poll = function () {
         httpGet (5353, '/project/' + DIALOG_PROJECT + '/dialogs', function (error, status, body) {
            if (error) return log ('GET /dialogs failed: ' + error.message);
            if (status !== 200) return log ('Expected 200, got ' + status);
            var dialogs = JSON.parse (body);
            var parentEntry = dale.stopNot (dialogs, undefined, function (d) {
               if (d.dialogId === s.spawnParentDialogId) return d;
            });
            var childEntry = dale.stopNot (dialogs, undefined, function (d) {
               if (d.dialogId === s.spawnChildDialogId) return d;
            });
            if (! parentEntry) return log ('Parent dialog missing from dialogs list');
            if (! childEntry) return log ('Spawned dialog missing from dialogs list');
            if (parentEntry.status === 'done' && childEntry.status === 'active') return next ();
            if (Date.now () - started > 10000) return log ('Expected parent done while spawned child still active, got parent=' + parentEntry.status + ' child=' + childEntry.status);
            setTimeout (poll, 200);
         });
      };
      poll ();
   }],

   ['Dialog 50: Spawned sibling dialog finishes', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      collectSSE (DIALOG_PROJECT, s.spawnChildDialogId, function (streamError, events) {
         if (streamError) return log ('Spawned dialog SSE stream error: ' + streamError.message);
         if (! getEventsByType (events, 'done').length) return log ('Expected done event for spawned dialog');
         next ();
      });
   }],

   ['Dialog 51: Spawned dialog markdown has prompt and assistant reply', 'get', 'project/' + DIALOG_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fetchDialogMarkdown (DIALOG_PROJECT, s.spawnChildDialogId, function (error, md) {
         if (error) return log ('Could not fetch spawned dialog: ' + error.message);
         if (md.indexOf ('sleep 5 && echo CHILD READY') === -1) return log ('Spawned dialog missing user prompt');
         if (md.indexOf ('CHILD READY') === -1) return log ('Spawned dialog missing assistant reply');
         next ();
      });
   }],

   // Cleanup
   ['Dialog 52: Cleanup delete', 'delete', 'projects/' + DIALOG_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Cleanup deletion failed');
      return true;
   }],

   ['Dialog 53: Confirm gone', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, DIALOG_PROJECT)) return log ('Project still exists after final deletion');
      return true;
   }]

];

// *** DOCS ***

var DOCS_PROJECT = 'docs-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);
var INITIAL_CONTENT = '# Main\n\nThis is the initial content of the project.\n';
var UPDATED_CONTENT = '# Main\n\nThis is the updated content of the project.\n\n## New section\n\nWith more detail.\n';
var SECOND_DOC = 'doc/notes.md';
var SECOND_CONTENT = '# Notes\n\nSome notes here.\n';

var docSequence = [

   ['Doc 1: Create project', 'post', 'projects', {}, {name: DOCS_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      if (rs.body.slug !== DOCS_PROJECT) return log ('Unexpected project slug');
      return true;
   }],

   ['Doc 2: Write doc/main.md', 'post', 'project/' + DOCS_PROJECT + '/file/doc/main.md', {}, {content: INITIAL_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected filename returned');
      return true;
   }],

   ['Doc 3: Read doc/main.md round-trip', 'get', 'project/' + DOCS_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc/main.md') return log ('Unexpected name: ' + rs.body.name);
      if (rs.body.content !== INITIAL_CONTENT) return log ('Content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['Doc 4: List includes doc/main.md', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md not in file list');
      return true;
   }],

   ['Doc 5: Overwrite doc/main.md', 'post', 'project/' + DOCS_PROJECT + '/file/doc/main.md', {}, {content: UPDATED_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['Doc 6: Read updated content', 'get', 'project/' + DOCS_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('Updated content mismatch. Got: ' + JSON.stringify (rs.body.content));
      return true;
   }],

   ['Doc 7: Write second doc', 'post', 'project/' + DOCS_PROJECT + '/file/' + SECOND_DOC, {}, {content: SECOND_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Second file write failed');
      return true;
   }],

   ['Doc 8: List includes both docs', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md missing from list');
      if (! inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' missing from list');
      return true;
   }],

   ['Doc 9: Read second doc', 'get', 'project/' + DOCS_PROJECT + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== SECOND_CONTENT) return log ('Second doc content mismatch');
      return true;
   }],

   ['Doc 10: Delete second doc', 'delete', 'project/' + DOCS_PROJECT + '/file/' + SECOND_DOC, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File deletion failed');
      return true;
   }],

   ['Doc 11: notes.md gone, main.md remains', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (inc (rs.body, SECOND_DOC)) return log (SECOND_DOC + ' still in list after deletion');
      if (! inc (rs.body, 'doc/main.md')) return log ('doc/main.md disappeared');
      return true;
   }],

   ['Doc 12: main.md still has updated content', 'get', 'project/' + DOCS_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== UPDATED_CONTENT) return log ('doc/main.md content changed unexpectedly');
      return true;
   }],

   ['Doc 13: Deleted file returns 404', 'get', 'project/' + DOCS_PROJECT + '/file/' + SECOND_DOC, {}, '', 404],

   ['Doc 14: Invalid name returns 400', 'post', 'project/' + DOCS_PROJECT + '/file/bad..name.md', {}, {content: 'x'}, 400],

   ['Doc 15: Outside managed folders returns 400', 'post', 'project/' + DOCS_PROJECT + '/file/bad.txt', {}, {content: 'x'}, 400],

   // Special characters in filenames

   ['Doc 16a: Write doc with spaces in name', 'post', 'project/' + DOCS_PROJECT + '/file/doc/my%20notes.md', {}, {content: '# My Notes\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Doc 16a: Read doc with spaces', 'get', 'project/' + DOCS_PROJECT + '/file/doc/my%20notes.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# My Notes\n') return log ('Content mismatch');
      return true;
   }],

   ['Doc 16a: Listed in files', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/my notes.md')) return log ('doc/my notes.md not in list');
      return true;
   }],

   ['Doc 16a: Delete doc with spaces', 'delete', 'project/' + DOCS_PROJECT + '/file/doc/my%20notes.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Doc 16a: Gone from list', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/my notes.md')) return log ('doc/my notes.md still in list');
      return true;
   }],

   ['Doc 16b: Write doc with accented name', 'post', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('café.md'), {}, {content: '# Café\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Doc 16b: Read doc with accented name', 'get', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('café.md'), {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Café\n') return log ('Content mismatch');
      return true;
   }],

   ['Doc 16b: Listed in files', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/café.md')) return log ('doc/café.md not in list');
      return true;
   }],

   ['Doc 16b: Delete doc with accented name', 'delete', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('café.md'), {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Doc 16b: Gone from list', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/café.md')) return log ('doc/café.md still in list');
      return true;
   }],

   ['Doc 16c: Write doc with non-Latin name', 'post', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, {content: '# 日本語\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Write failed');
      return true;
   }],

   ['Doc 16c: Read doc with non-Latin name', 'get', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# 日本語\n') return log ('Content mismatch');
      return true;
   }],

   ['Doc 16c: Listed in files', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/日本語.md')) return log ('doc/日本語.md not in list');
      return true;
   }],

   ['Doc 16c: Delete doc with non-Latin name', 'delete', 'project/' + DOCS_PROJECT + '/file/doc/' + encodeURIComponent ('日本語.md'), {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Delete failed');
      return true;
   }],

   ['Doc 16c: Gone from list', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/日本語.md')) return log ('doc/日本語.md still in list');
      return true;
   }],

   ['Doc 17a: Write nested managed doc path', 'post', 'project/' + DOCS_PROJECT + '/file/doc/nested/plan.md', {}, {content: '# Nested Plan\n\nTesting nested managed path writes.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Nested managed write failed');
      if (rs.body.name !== 'doc/nested/plan.md') return log ('Unexpected nested filename returned');
      return true;
   }],

   ['Doc 17b: Read nested managed doc path', 'get', 'project/' + DOCS_PROJECT + '/file/doc/nested/plan.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'doc/nested/plan.md') return log ('Unexpected nested filename: ' + rs.body.name);
      if (rs.body.content !== '# Nested Plan\n\nTesting nested managed path writes.\n') return log ('Nested content mismatch');
      return true;
   }],

   ['Doc 17c: Nested managed doc listed in files', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (! inc (rs.body, 'doc/nested/plan.md')) return log ('doc/nested/plan.md not in list');
      return true;
   }],

   ['Doc 17d: Delete nested managed doc path', 'delete', 'project/' + DOCS_PROJECT + '/file/doc/nested/plan.md', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Nested managed delete failed');
      return true;
   }],

   ['Doc 17e: Nested managed doc gone from list', 'get', 'project/' + DOCS_PROJECT + '/files', {}, '', 200, function (s, rq, rs) {
      if (inc (rs.body, 'doc/nested/plan.md')) return log ('doc/nested/plan.md still in list');
      return true;
   }],

   ['Doc 18: Delete project', 'delete', 'projects/' + DOCS_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Doc 19: Confirm gone', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, DOCS_PROJECT)) return log ('Project still exists after deletion');
      return true;
   }]
];

// *** UPLOADS ***

var UPLOADS_PROJECT = 'uploads-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

// A tiny 1x1 red PNG (base64)
var TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
var TINY_PNG_DATA_URL = 'data:image/png;base64,' + TINY_PNG_BASE64;
var TINY_PNG_BYTES = Buffer.from (TINY_PNG_BASE64, 'base64');

var TEXT_CONTENT_BASE64 = Buffer.from ('Hello from uploads test!\nLine 2.\n').toString ('base64');

var uploadSequence = [

   ['Upload 1: Create project', 'post', 'projects', {}, {name: UPLOADS_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   // *** Upload an image (data URL format) ***

   ['Upload 2: Upload image via data URL', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'test-image.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'test-image.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be a positive integer, got: ' + rs.body.size);
      if (type (rs.body.mtime) !== 'integer') return log ('Upload mtime should be an integer, got: ' + type (rs.body.mtime));
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed: ' + rs.body.url);
      return true;
   }],

   // *** List uploads — image should be present ***

   ['Upload 3: List uploads includes image', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs) {
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

   ['Upload 4: Fetch uploaded image', 'get', 'project/' + UPLOADS_PROJECT + '/upload/test-image.png', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/project/' + UPLOADS_PROJECT + '/upload/test-image.png', function (error, status, body) {
         if (error) return log ('Fetch upload failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || body.length < 10) return log ('Upload body too small: ' + (body ? body.length : 0) + ' bytes');
         next ();
      });
   }],

   // Verify Content-Type via raw HTTP request
   ['Upload 5: Verify image Content-Type header', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + UPLOADS_PROJECT + '/upload/test-image.png',
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

   ['Upload 6: Upload text file', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'notes.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'notes.txt') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'text/plain') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      return true;
   }],

   // *** List uploads — both entries ***

   ['Upload 7: List uploads includes both entries', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (rs.body.length < 2) return log ('Expected at least 2 uploads, got ' + rs.body.length);
      var names = dale.go (rs.body, function (entry) {return entry.name;});
      if (! inc (names, 'test-image.png')) return log ('test-image.png missing from list');
      if (! inc (names, 'notes.txt')) return log ('notes.txt missing from list');
      return true;
   }],

   // *** Fetch the text file and verify content ***

   ['Upload 8: Fetch text file content', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + UPLOADS_PROJECT + '/upload/notes.txt',
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

   ['Upload 9: Upload file with spaces in name', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'my screenshot 2026.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my screenshot 2026.png') return log ('Upload name mismatch: ' + rs.body.name);
      if (rs.body.contentType !== 'image/png') return log ('Upload contentType mismatch: ' + rs.body.contentType);
      if (type (rs.body.size) !== 'integer' || rs.body.size < 1) return log ('Upload size should be positive, got: ' + rs.body.size);
      if (type (rs.body.url) !== 'string' || rs.body.url.indexOf ('upload') === -1) return log ('Upload url missing or malformed');
      return true;
   }],

   ['Upload 10: List uploads includes spaced filename', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (entry) {
         if (entry.name === 'my screenshot 2026.png') return entry;
      });
      if (! found) return log ('Spaced filename not found in uploads list');
      return true;
   }],

   // Fetch file with spaces — must percent-encode the name in the URL
   ['Upload 11: Fetch file with spaces in name', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs, next) {
      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/project/' + UPLOADS_PROJECT + '/upload/' + encodeURIComponent ('my screenshot 2026.png'),
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

   ['Upload 12: Upload file with dots and dashes', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'my-file.v2.backup.txt', content: TEXT_CONTENT_BASE64, contentType: 'text/plain'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'my-file.v2.backup.txt') return log ('Upload name mismatch: ' + rs.body.name);
      return true;
   }],

   // *** Upload with path traversal should fail ***

   ['Upload 13: Upload with .. in name returns 400', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: '../etc/passwd', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with backslash should fail ***

   ['Upload 14: Upload with backslash returns 400', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'sub\\file.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with leading slash should fail ***

   ['Upload 15: Upload with leading slash returns 400', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: '/absolute.txt', content: TEXT_CONTENT_BASE64}, 400],

   // *** Upload with nested path is allowed ***

   ['Upload 16: Upload with slash in name succeeds', 'post', 'project/' + UPLOADS_PROJECT + '/upload', {}, {name: 'nested/evil.png', content: TINY_PNG_DATA_URL, contentType: 'image/png'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected object body');
      if (rs.body.name !== 'nested/evil.png') return log ('Upload name mismatch: ' + rs.body.name);
      return true;
   }],

   // *** List should now have 5 valid uploads ***

   ['Upload 17: List uploads has all valid entries', 'get', 'project/' + UPLOADS_PROJECT + '/uploads', {}, '', 200, function (s, rq, rs) {
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

   ['Upload 18: Fetch nonexistent upload returns 404', 'get', 'project/' + UPLOADS_PROJECT + '/upload/nonexistent.png', {}, '', 404],

   // *** Cleanup ***

   ['Upload 19: Delete project', 'delete', 'projects/' + UPLOADS_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Upload 20: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, UPLOADS_PROJECT)) return log ('Project still exists after deletion');
      return true;
   }]
];


// dialogSafetySequence merged into dialogSequence (steps 11–26)

// *** STATIC APP ***
// Tests static proxy, embed blocks, and file serving without waiting for LLM.

var STATIC_PROJECT = 'static-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_STATIC = [
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

// Fire-and-forget: start a dialog via PUT (returns JSON immediately), call back once confirmed.
var fireDialog = function (project, dialogId, prompt, cb) {
   httpJson ('PUT', '/project/' + project + '/dialog', {dialogId: dialogId, prompt: prompt}, function (error, code, body) {
      if (error) return cb (error);
      if (code !== 200) return cb (new Error ('PUT /dialog returned ' + code + ': ' + JSON.stringify (body)));
      if (body && body.error) return cb (new Error ('Dialog error: ' + body.error));
      cb (null);
   });
};

// Fire-and-forget: send PUT to start a dialog, don't wait for response.
var fireDialogNoWait = function (project, dialogId, prompt) {
   httpJson ('PUT', '/project/' + project + '/dialog', {dialogId: dialogId, prompt: prompt}, function () {});
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

   ['Static 1: Create project', 'post', 'projects', {}, {name: STATIC_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Static 2: Write doc/main.md', 'post', 'project/' + STATIC_PROJECT + '/file/doc/main.md', {}, {content: DOC_MAIN_STATIC}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Static 3: Create dialog draft (orchestrator)', 'post', 'project/' + STATIC_PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.staticDialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the dialog and don't block — let the agent build the app
   ['Static 4: Fire "please start" (non-blocking)', 'get', 'project/' + STATIC_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (STATIC_PROJECT, s.staticDialogId, 'Please start. Read doc/main.md once, then implement immediately: create index.html and app.js in /workspace root. Do not re-fetch docs after the first read. After creating files, update doc/main.md with an embed block (port static, title Tictactoe, height 500).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the static page is reachable via static proxy
   ['Static 5: Poll until static page serves', 'get', 'project/' + STATIC_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + STATIC_PROJECT + '/static/', function (error, status, body) {
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
   ['Static 6: index.html has React + app.js', 'post', 'project/' + STATIC_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('cat index.html failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '').toLowerCase ();
      if (out.indexOf ('react') === -1) return log ('index.html missing React reference');
      if (out.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   ['Static 7: app.js has tictactoe logic', 'get', 'project/' + STATIC_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + STATIC_PROJECT + '/static/app.js', function (error, status, body) {
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
   ['Static 8: Poll until embed block appears in doc/main.md', 'get', 'project/' + STATIC_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + STATIC_PROJECT + '/file/doc/main.md', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var parsed = JSON.parse (body);
               var content = parsed.content || '';
               if (content.indexOf ('əəembed') !== -1 && content.indexOf ('port static') !== -1) return done (true);
            }
            catch (e) {}
            done (false);
         });
      }, 3000, 300000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['Static 9: Verify embed block in doc/main.md', 'get', 'project/' + STATIC_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəembed') === -1) return log ('doc/main.md missing əəembed block');
      if (content.indexOf ('port static') === -1) return log ('doc/main.md embed missing port static');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** APP WITH BACKEND ***

var BACKEND_PROJECT = 'backend-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var DOC_MAIN_BACKEND = [
   '# Tictactoe Project (Backend)',
   '',
   'Build a simple tictactoe game for the browser using React (via CDN), served by an Express server on port 4000.',
   'The game should be embedded in this doc via the proxy.',
   '',
   '## Critical rules',
   '',
   '- Create a `server.js` that uses Express to serve static files from `/workspace` on port 4000.',
   '- Before running the server, install Express in `/workspace` with npm (for example `npm init -y || true` and `npm install express`).',
   '- `index.html`: load React, ReactDOM, and Babel standalone from CDN (unpkg or cdnjs).',
   '  Include `<script src="app.js" type="text/babel"></script>` so JSX works.',
   '- `app.js`: a simple React tictactoe with a 3x3 grid of buttons, X/O turns, and a winner check.',
   '- The page title or heading must include "tictactoe" (case-insensitive).',
   '- No build step. Do not install React locally; use the CDN scripts in `index.html`.',
   '- Start the server only after installing Express. Run it with `nohup node server.js > /tmp/tictactoe-server.log 2>&1 &` so it stays alive in the background and logs are captured.',
   '- After starting the server, verify it is running (for example with `ps aux | grep node` or `curl http://localhost:4000/`).',
   '',
].join ('\n') + '\n';

var backendSequence = [

   ['Backend 1: Create project', 'post', 'projects', {}, {name: BACKEND_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Backend 2: Write doc/main.md', 'post', 'project/' + BACKEND_PROJECT + '/file/doc/main.md', {}, {content: DOC_MAIN_BACKEND}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Backend 3: Create dialog draft (orchestrator)', 'post', 'project/' + BACKEND_PROJECT + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'orchestrator'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('dialog/new should return object');
      if (! rs.body.dialogId || ! rs.body.filename) return log ('missing dialogId or filename');
      s.backendDialogId = rs.body.dialogId;
      return true;
   }],

   // Fire the orchestrator and let it build the game + start the server
   ['Backend 4: Fire "please start" (non-blocking)', 'get', 'project/' + BACKEND_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      fireDialog (BACKEND_PROJECT, s.backendDialogId, 'Please start. Read doc/main.md once, then implement immediately: create server.js (Express on port 4000 serving static files from /workspace), index.html, and app.js in /workspace root. Do not re-fetch docs after the first read. Before running the server, install Express in /workspace with npm (for example `npm init -y || true` and `npm install express`). Do not install React locally; use CDN scripts only. Then start the server with `nohup node server.js > /tmp/tictactoe-server.log 2>&1 &`, verify it is running or that `curl http://localhost:4000/` succeeds, and only then update doc/main.md with an embed block (port 4000, title Tictactoe, height 500).', function (error) {
         if (error) return log ('Failed to fire dialog: ' + error.message);
         next ();
      });
   }],

   // Poll until the backend server is reachable via the proxy
   ['Backend 5: Poll until proxy serves the app on port 4000', 'get', 'project/' + BACKEND_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + BACKEND_PROJECT + '/proxy/4000/', function (error, status, body) {
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
   ['Backend 6: Proxy serves index.html with React + app.js', 'get', 'project/' + BACKEND_PROJECT + '/proxy/4000/', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected HTML string body');
      var lower = (rs.body || '').toLowerCase ();
      if (lower.indexOf ('react') === -1) return log ('index.html missing React reference');
      if (lower.indexOf ('app.js') === -1) return log ('index.html missing app.js reference');
      return true;
   }],

   // Verify app.js is served through proxy
   ['Backend 7: Proxy serves app.js with tictactoe logic', 'get', 'project/' + BACKEND_PROJECT + '/proxy/4000/app.js', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'string') return log ('Expected JS string body');
      var lower = (rs.body || '').toLowerCase ();
      var hasBoardLogic = lower.indexOf ('board') !== -1 || lower.indexOf ('cell') !== -1 || lower.indexOf ('square') !== -1 || lower.indexOf ('grid') !== -1;
      if (! hasBoardLogic) return log ('app.js missing board/cell/square/grid logic');
      return true;
   }],

   // Verify the Express server is running inside the container
   ['Backend 8: Server process is running', 'post', 'project/' + BACKEND_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'ps aux | grep node || true'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('ps aux failed: ' + JSON.stringify (rs.body));
      var out = (rs.body.stdout || '') + (rs.body.stderr || '');
      if (out.indexOf ('server.js') === -1) return log ('server.js process not found in ps output');
      return true;
   }],

   // Poll until embed block appears in doc/main.md
   ['Backend 9: Poll until embed block appears in doc/main.md', 'get', 'project/' + BACKEND_PROJECT + '/dialogs', {}, '', 200, function (s, rq, rs, next) {
      pollUntil (function (done) {
         httpGet (5353, '/project/' + BACKEND_PROJECT + '/file/doc/main.md', function (error, status, body) {
            if (error || status !== 200) return done (false);
            try {
               var parsed = JSON.parse (body);
               var content = parsed.content || '';
               if (content.indexOf ('əəembed') !== -1 && content.indexOf ('port 4000') !== -1) return done (true);
            }
            catch (e) {}
            done (false);
         });
      }, 3000, 300000, function (error) {
         if (error) return log ('Embed block never appeared in doc/main.md: ' + error.message);
         next ();
      });
   }],

   ['Backend 10: Verify embed block in doc/main.md', 'get', 'project/' + BACKEND_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      var content = rs.body.content || '';
      if (content.indexOf ('əəembed') === -1) return log ('doc/main.md missing əəembed block');
      if (content.indexOf ('port 4000') === -1) return log ('doc/main.md embed missing port 4000');
      return true;
   }]

   // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable
];

// *** VI MODE ***

var VI_PROJECT = 'vi-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

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

   ['Vi: Create project', 'post', 'projects', {}, {name: VI_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Vi: Write a doc to edit', 'post', 'project/' + VI_PROJECT + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Vi: Read doc back', 'get', 'project/' + VI_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\n') return log ('Content mismatch');
      return true;
   }],

   // Simulate vi :w by writing updated content
   ['Vi: Simulate vi :w (overwrite doc)', 'post', 'project/' + VI_PROJECT + '/file/doc/main.md', {}, {content: '# Vi Test\n\nHello world.\nNew line added by vi.\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   ['Vi: Read doc confirms vi edit persisted', 'get', 'project/' + VI_PROJECT + '/file/doc/main.md', {}, '', 200, function (s, rq, rs) {
      if (rs.body.content !== '# Vi Test\n\nHello world.\nNew line added by vi.\n') return log ('Vi edit not persisted');
      return true;
   }],

   // *** Cleanup: restore viMode to false, clean API key ***

   ['Vi: Restore viMode to false', 'post', 'settings', {}, {editor: {viMode: false}, openaiKey: ''}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Cleanup settings failed');
      return true;
   }],

   ['Vi: Delete project', 'delete', 'projects/' + VI_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }]
];

// *** CLOUD AUTH, ADMIN, ACCESS ***

// Redis helpers for reading OTPs and verifying state directly.
// Cloud mode runs embedded redis inside the vibey container, so tests access it
// through docker exec instead of opening a host TCP connection.
var exec = require ('child_process').exec;

var redisExec = function (args, cb) {
   exec ('docker compose exec -T vibey redis-cli --raw ' + args, {maxBuffer: 1024 * 1024}, function (error, stdout, stderr) {
      if (error) return cb (error);
      cb (null, (stdout || '').replace (/\n$/, ''));
   });
};

var redisGet = function (key, cb) {
   redisExec ('GET ' + JSON.stringify (key), function (error, data) {
      if (error) return cb (error);
      cb (null, data === '' || data === '(nil)' ? null : data);
   });
};

var redisHgetall = function (key, cb) {
   redisExec ('HGETALL ' + JSON.stringify (key), function (error, data) {
      if (error) return cb (error);
      if (! data) return cb (null, null);
      var parts = data.split ('\n');
      if (! parts.length || parts [0] === '(nil)') return cb (null, null);
      var hash = {};
      for (var i = 0; i < parts.length; i += 2) {
         if (parts [i] === undefined || parts [i + 1] === undefined) continue;
         hash [parts [i]] = parts [i + 1];
      }
      cb (null, dale.keys (hash).length ? hash : null);
   });
};

var redisFlushdb = function (cb) {
   redisExec ('FLUSHDB', function (error) {
      cb (error);
   });
};

// Flush all test-created keys from Redis after the cloud suite.
var redisFlushTestKeys = function (keys, cb) {
   if (! keys || ! keys.length) return cb ();
   redisExec ('DEL ' + dale.go (keys, JSON.stringify).join (' '), function (error) {
      cb (error);
   });
};

// Helper: full login flow for a given email. Returns {cookies, csrf} via cb.
var cloudLogin = function (email, cb) {
   // 1. Request OTP
   httpJson ('POST', '/auth/login', {email: email}, function (error, status, body) {
      if (error || status !== 200) return cb (new Error ('Login request failed: ' + (error ? error.message : status)));

      // 2. Read OTP from Redis. We need the userId first.
      redisGet ('email:' + email.toLowerCase (), function (err, userId) {
         if (err || ! userId) return cb (new Error ('Could not find userId for ' + email));

         redisGet ('otp:' + userId, function (err2, otp) {
            if (err2 || ! otp) return cb (new Error ('Could not read OTP from Redis for userId ' + userId));

            // 3. Verify OTP
            httpJson ('POST', '/auth/verify', {email: email, otp: otp}, function (verifyErr, verifyStatus, verifyBody, verifyText, verifyHeaders) {
               if (verifyErr || verifyStatus !== 200) return cb (new Error ('Verify failed: ' + (verifyErr ? verifyErr.message : verifyStatus + ' ' + verifyText)));
               var cookies = cookieJarFromSetCookie (verifyHeaders ['set-cookie']);
               cb (null, {cookies: cookies, csrf: verifyBody.csrf, admin: verifyBody.admin});
            });
         });
      });
   });
};

// Helper: make authenticated JSON request with cookie + csrf.
var authJson = function (method, path, payload, auth, cb) {
   payload = payload || {};
   if (auth.csrf) payload.csrf = auth.csrf;
   httpJson (method, path, payload, cb, {Cookie: cookieHeader (auth.cookies)});
};

var authGet = function (path, auth, cb) {
   httpRequest ('GET', path, '', {Cookie: cookieHeader (auth.cookies)}, function (error, status, body, headers) {
      if (error) return cb (error);
      var parsed = null;
      try {parsed = JSON.parse (body);} catch (e) {}
      cb (null, status, parsed, body, headers);
   });
};

var cloudSequence = [

   // *** MODE DETECTION ***

   ['Cloud 1: Detect cloud mode via GET /auth/csrf', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs) {
      s.cloudAdminEmail  = (CONFIG.adminEmail || '').toLowerCase ();
      s.cloudMemberEmail = 'member-' + testTimestamp () + '@buildwithvibey.com';
      s.cleanupKeys = [];

      // If server is in local mode, the response is {mode: 'LOCAL'}.
      // Cloud tests require cloud mode — skip the suite gracefully.
      if (rs.body && rs.body.mode === 'LOCAL') {
         log ('Server is in LOCAL mode — skipping cloud suite');
         s.skipCloud = true;
      }
      else if (rs.code === 403) {
         // Cloud mode, not logged in — expected at this stage
         s.skipCloud = false;
      }
      else {
         // Cloud mode, already logged in (shouldn't happen in clean test)
         s.skipCloud = false;
      }
      return true;
   }],

   ['Cloud 1b: Flush Redis before cloud tests', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      redisFlushdb (function (error) {
         if (error) return log ('Failed to flush Redis before cloud tests: ' + error.message);
         s.cleanupKeys = [];
         next ();
      });
   }],

   // *** SIGNUP ***

   ['Cloud 2: POST /auth/signup stores request', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/signup', {email: s.cloudMemberEmail}, function (error, status, body) {
         if (error) return log ('signup failed: ' + error.message);
         if (status !== 200) return log ('Expected 200 from signup, got ' + status + ' ' + JSON.stringify (body));
         if (! body || body.ok !== true) return log ('Expected {ok: true} from signup, got: ' + JSON.stringify (body));
         s.cleanupKeys.push ('signup:' + s.cloudMemberEmail);
         next ();
      });
   }],

   ['Cloud 3: POST /auth/signup with invalid email returns 400', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/signup', {email: 'not-an-email'}, function (error, status, body) {
         if (error) return log ('signup bad email request failed: ' + error.message);
         if (status !== 400) return log ('Expected 400 for invalid email signup, got ' + status);
         next ();
      });
   }],

   ['Cloud 4: POST /auth/signup with empty email returns 400', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/signup', {email: ''}, function (error, status, body) {
         if (error) return log ('signup empty email request failed: ' + error.message);
         if (status !== 400) return log ('Expected 400 for empty email signup, got ' + status);
         next ();
      });
   }],

   // *** BOOTSTRAP ADMIN ***

   ['Cloud 5: Config admin user exists in Redis', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      if (! s.cloudAdminEmail) return log ('secret.json must define adminEmail for cloud tests');
      redisGet ('email:' + s.cloudAdminEmail, function (error, userId) {
         if (error) return log ('Failed to read admin email lookup from Redis: ' + error.message);
         if (! userId) return log ('Expected config admin user to exist in Redis for ' + s.cloudAdminEmail);
         s.adminUserId = userId;
         next ();
      });
   }],

   ['Cloud 6: Config admin is marked as admin', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      redisHgetall ('user:' + s.adminUserId, function (err, user) {
         if (err || ! user) return log ('Failed to read admin user from Redis');
         if (user.admin !== '1') return log ('Config admin should have admin=1, got: ' + user.admin);
         if (user.email !== s.cloudAdminEmail) return log ('Admin email mismatch');
         next ();
      });
   }],

   // *** LOGIN FLOW ***

   ['Cloud 7: POST /auth/login sends OTP (stored in Redis)', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/login', {email: s.cloudAdminEmail}, function (error, status, body) {
         if (error) return log ('Login OTP request failed: ' + error.message);
         if (status !== 200) return log ('Expected 200 from login, got ' + status + ' ' + JSON.stringify (body));
         if (! body || body.ok !== true) return log ('Expected {ok: true} from login, got: ' + JSON.stringify (body));

         // Read OTP from Redis
         redisGet ('otp:' + s.adminUserId, function (err, otp) {
            if (err || ! otp) return log ('OTP not found in Redis for ' + s.adminUserId);
            s.adminOtp = otp;
            next ();
         });
      });
   }],

   ['Cloud 8: POST /auth/login with non-existent email returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/login', {email: 'nobody@buildwithvibey.com'}, function (error, status) {
         if (error) return log ('Login bad email failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for non-existent email login, got ' + status);
         next ();
      });
   }],

   ['Cloud 9: POST /auth/verify with wrong OTP returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/verify', {email: s.cloudAdminEmail, otp: '000000'}, function (error, status) {
         if (error) return log ('Verify wrong OTP failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for wrong OTP, got ' + status);
         next ();
      });
   }],

   ['Cloud 10: POST /auth/verify with correct OTP sets session cookie and returns CSRF', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/auth/verify', {email: s.cloudAdminEmail, otp: s.adminOtp}, function (error, status, body, text, headers) {
         if (error) return log ('Verify OTP failed: ' + error.message);
         if (status !== 200) return log ('Expected 200 from verify, got ' + status + ' ' + text);
         if (! body || ! body.csrf) return log ('Expected {csrf: "..."} from verify, got: ' + JSON.stringify (body));
         if (body.admin !== true) return log ('Expected admin: true in verify response');

         var cookies = cookieJarFromSetCookie (headers ['set-cookie']);
         if (! cookies.vibey) return log ('Expected vibey cookie after verify, got: ' + JSON.stringify (cookies));

         s.adminAuth = {cookies: cookies, csrf: body.csrf};
         s.cleanupKeys.push ('session:' + cookies.vibey);
         next ();
      });
   }],

   ['Cloud 11: Cookie attributes include HttpOnly and SameSite=Lax', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      // Re-login to inspect raw Set-Cookie header
      httpJson ('POST', '/auth/login', {email: s.cloudAdminEmail}, function (error, status) {
         if (error || status !== 200) return log ('Re-login for cookie check failed');
         redisGet ('otp:' + s.adminUserId, function (err, otp) {
            if (err || ! otp) return log ('OTP not found for cookie check');
            httpJson ('POST', '/auth/verify', {email: s.cloudAdminEmail, otp: otp}, function (err2, st2, body2, text2, headers2) {
               if (err2 || st2 !== 200) return log ('Verify for cookie check failed');
               var raw = headers2 ['set-cookie'];
               if (! raw) return log ('No Set-Cookie header');
               var cookieStr = type (raw) === 'array' ? raw.join ('; ') : raw;
               var lower = cookieStr.toLowerCase ();
               if (lower.indexOf ('httponly') === -1) return log ('Missing HttpOnly on cookie');
               if (lower.indexOf ('samesite=lax') === -1) return log ('Missing SameSite=Lax on cookie');
               // Store the new session for cleanup
               var newCookies = cookieJarFromSetCookie (headers2 ['set-cookie']);
               if (newCookies.vibey) s.cleanupKeys.push ('session:' + newCookies.vibey);
               next ();
            });
         });
      });
   }],

   // *** CSRF ***

   ['Cloud 12: GET /auth/csrf returns CSRF for logged-in user', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpRequest ('GET', '/auth/csrf', '', {Cookie: cookieHeader (s.adminAuth.cookies)}, function (error, status, body) {
         if (error) return log ('CSRF fetch failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         var parsed;
         try {parsed = JSON.parse (body);} catch (e) {return log ('CSRF response not JSON: ' + body);}
         if (! parsed.csrf) return log ('Expected {csrf: "..."}, got: ' + body);
         // Verify it matches what we got at login
         if (parsed.csrf !== s.adminAuth.csrf) return log ('CSRF mismatch: ' + parsed.csrf + ' !== ' + s.adminAuth.csrf);
         next ();
      });
   }],

   ['Cloud 13: POST without CSRF token returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      // Authenticated but no csrf in body
      httpJson ('POST', '/projects', {name: 'no-csrf-test'}, function (error, status, body) {
         if (error) return log ('No-CSRF request failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for missing CSRF, got ' + status);
         if (! body || body.error !== 'csrf') return log ('Expected {error: "csrf"}, got: ' + JSON.stringify (body));
         next ();
      }, {Cookie: cookieHeader (s.adminAuth.cookies)});
   }],

   // *** ADMIN: SIGNUPS ***

   ['Cloud 14: GET /admin/signups lists the pending signup', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/admin/signups', s.adminAuth, function (error, status, body) {
         if (error) return log ('admin/signups failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (type (body) !== 'array') return log ('Expected array, got: ' + JSON.stringify (body));
         var found = dale.stopNot (body, undefined, function (entry) {
            if (entry.email === s.cloudMemberEmail) return entry;
         });
         if (! found) return log ('Pending signup for ' + s.cloudMemberEmail + ' not found in: ' + JSON.stringify (body));
         next ();
      });
   }],

   ['Cloud 15: GET /admin/signups without auth returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpRequest ('GET', '/admin/signups', '', {}, function (error, status) {
         if (error) return log ('Unauthenticated signups request failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for unauthenticated signups, got ' + status);
         next ();
      });
   }],

   // *** ADMIN: CREATE USER ***

   ['Cloud 16: POST /admin/createUser creates a normal user', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authJson ('POST', '/admin/createUser', {email: s.cloudMemberEmail}, s.adminAuth, function (error, status, body) {
         if (error) return log ('createUser failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status + ' ' + JSON.stringify (body));
         if (! body || body.ok !== true || ! body.id) return log ('Expected {ok: true, id}, got: ' + JSON.stringify (body));
         s.memberUserId = body.id;
         s.cleanupKeys.push ('user:' + body.id, 'email:' + s.cloudMemberEmail);

         // Verify the signup entry was removed
         redisGet ('signup:' + s.cloudMemberEmail, function (err, data) {
            // signup is a hash, so GET returns null; check with hgetall
            redisHgetall ('signup:' + s.cloudMemberEmail, function (err2, hashData) {
               if (hashData && hashData.email) return log ('Signup entry should have been deleted after createUser');
               next ();
            });
         });
      });
   }],

   ['Cloud 17: Created user is not admin', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      redisHgetall ('user:' + s.memberUserId, function (err, user) {
         if (err || ! user) return log ('Failed to read member user from Redis');
         if (user.admin === '1') return log ('Normal user should not be admin');
         if (user.email !== s.cloudMemberEmail) return log ('Email mismatch');
         next ();
      });
   }],

   ['Cloud 18: POST /admin/createUser with duplicate email returns 409', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authJson ('POST', '/admin/createUser', {email: s.cloudMemberEmail}, s.adminAuth, function (error, status, body) {
         if (error) return log ('duplicate createUser failed: ' + error.message);
         if (status !== 409) return log ('Expected 409 for duplicate email, got ' + status);
         next ();
      });
   }],

   ['Cloud 19: POST /admin/createUser without auth returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpJson ('POST', '/admin/createUser', {email: 'noauth@buildwithvibey.com'}, function (error, status) {
         if (error) return log ('Unauthenticated createUser failed: ' + error.message);
         // No users to bootstrap (admin exists) so this should be 403
         if (status !== 403) return log ('Expected 403 for unauthenticated createUser (users exist), got ' + status);
         next ();
      });
   }],

   // *** MEMBER LOGIN ***

   ['Cloud 20: Member logs in via full OTP flow', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      cloudLogin (s.cloudMemberEmail, function (error, auth) {
         if (error) return log ('Member login failed: ' + error.message);
         if (! auth.cookies.vibey) return log ('Missing vibey cookie for member');
         if (! auth.csrf) return log ('Missing CSRF for member');
         if (auth.admin) return log ('Member should not be admin');
         s.memberAuth = auth;
         s.cleanupKeys.push ('session:' + auth.cookies.vibey);
         next ();
      });
   }],

   ['Cloud 21: Non-admin cannot access GET /admin/signups', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/admin/signups', s.memberAuth, function (error, status) {
         if (error) return log ('Non-admin signups failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for non-admin signups, got ' + status);
         next ();
      });
   }],

   ['Cloud 22: Non-admin cannot POST /admin/createUser', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authJson ('POST', '/admin/createUser', {email: 'sneaky@buildwithvibey.com'}, s.memberAuth, function (error, status) {
         if (error) return log ('Non-admin createUser failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for non-admin createUser, got ' + status);
         next ();
      });
   }],

   // *** PROJECT SCOPING ***

   ['Cloud 23: Admin creates a project', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authJson ('POST', '/projects', {name: 'admin-proj-cloud'}, s.adminAuth, function (error, status, body) {
         if (error) return log ('Admin create project failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status + ' ' + JSON.stringify (body));
         if (! body || body.ok !== true || ! body.slug) return log ('Bad create response: ' + JSON.stringify (body));
         s.adminProjectSlug = body.slug;
         next ();
      });
   }],

   ['Cloud 24: Member cannot see admin project', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/projects', s.memberAuth, function (error, status, body) {
         if (error) return log ('Member list projects failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (type (body) !== 'array') return log ('Expected array, got: ' + JSON.stringify (body));
         var found = dale.stopNot (body, undefined, function (p) {
            if (p.slug === s.adminProjectSlug) return p;
         });
         if (found) return log ('Member should NOT see admin project ' + s.adminProjectSlug);
         next ();
      });
   }],

   ['Cloud 25: Unauthenticated GET /projects returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpRequest ('GET', '/projects', '', {}, function (error, status) {
         if (error) return log ('Unauthenticated projects request failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for unauthenticated projects, got ' + status);
         next ();
      });
   }],

   ['Cloud 25a: Member GET /settings has no userApiKey field', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/settings', s.memberAuth, function (error, status, body) {
         if (error) return log ('Member GET /settings failed: ' + error.message);
         if (status !== 200) return log ('Expected 200 from member settings, got ' + status);
         if (body && body.userApiKey) return log ('Settings should not include userApiKey field');
         next ();
      });
   }],


   // *** TRIGGER-ID ACCESS CONTROL ***

   ['Cloud 25b: Owner can read trigger-id for own project', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud || ! s.adminProjectSlug) return next ();
      authGet ('/project/' + encodeURIComponent (s.adminProjectSlug) + '/trigger-id', s.adminAuth, function (error, status, body) {
         if (error) return log ('Admin GET trigger-id failed: ' + error.message);
         if (status !== 200) return log ('Expected 200 from owner trigger-id, got ' + status);
         if (! body || ! body.triggerId) return log ('Missing triggerId in owner response');
         next ();
      });
   }],

   ['Cloud 25c: Other user cannot read trigger-id for someone else\'s project', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud || ! s.adminProjectSlug) return next ();
      authGet ('/project/' + encodeURIComponent (s.adminProjectSlug) + '/trigger-id', s.memberAuth, function (error, status, body) {
         if (error) return log ('Member GET trigger-id request failed: ' + error.message);
         if (status !== 404) return log ('Expected 404 when member reads admin trigger-id, got ' + status);
         next ();
      });
   }],

   ['Cloud 25d: Unauthenticated request to trigger-id returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud || ! s.adminProjectSlug) return next ();
      httpRequest ('GET', '/project/' + encodeURIComponent (s.adminProjectSlug) + '/trigger-id', '', {}, function (error, status) {
         if (error) return log ('Unauthenticated trigger-id request failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for unauthenticated trigger-id, got ' + status);
         next ();
      });
   }],

   // *** ACCESS & PUBLIC ROUTES ***

   ['Cloud 26: GET /access returns empty rules initially', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/access', s.adminAuth, function (error, status, body) {
         if (error) return log ('GET /access failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || type (body.rules) !== 'object') return log ('Expected {rules: {}}, got: ' + JSON.stringify (body));
         next ();
      });
   }],

   ['Cloud 27: POST /access sets rules', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      var rules = {};
      rules [s.adminProjectSlug + ':static/'] = 'ALL';
      authJson ('POST', '/access', {rules: rules}, s.adminAuth, function (error, status, body) {
         if (error) return log ('POST /access failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || body.ok !== true) return log ('Expected {ok: true}, got: ' + JSON.stringify (body));
         s.cleanupKeys.push ('access:' + s.adminUserId);
         next ();
      });
   }],

   ['Cloud 28: GET /access reflects saved rules', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authGet ('/access', s.adminAuth, function (error, status, body) {
         if (error) return log ('GET /access after save failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         if (! body || ! body.rules || body.rules [s.adminProjectSlug + ':static/'] !== 'ALL') {
            return log ('Expected published static rule, got: ' + JSON.stringify (body));
         }
         next ();
      });
   }],

   ['Cloud 29: POST /access overwrites all rules', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      var rules = {};
      rules [s.adminProjectSlug + ':doc/main.md'] = 'ALL';
      authJson ('POST', '/access', {rules: rules}, s.adminAuth, function (error, status) {
         if (error) return log ('Overwrite access failed: ' + error.message);
         if (status !== 200) return log ('Expected 200, got ' + status);
         // Verify old rule is gone
         authGet ('/access', s.adminAuth, function (err2, st2, body2) {
            if (err2 || st2 !== 200) return log ('GET /access after overwrite failed');
            if (body2.rules [s.adminProjectSlug + ':static/']) return log ('Old static/ rule should be gone after overwrite');
            if (body2.rules [s.adminProjectSlug + ':doc/main.md'] !== 'ALL') return log ('New doc rule missing');
            next ();
         });
      });
   }],

   ['Cloud 30: GET /access without auth returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpRequest ('GET', '/access', '', {}, function (error, status) {
         if (error) return log ('Unauthenticated access request failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 for unauthenticated /access, got ' + status);
         next ();
      });
   }],

   // *** LOGOUT ***

   ['Cloud 31: POST /auth/logout clears session', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      authJson ('POST', '/auth/logout', {}, s.adminAuth, function (error, status, body) {
         if (error) return log ('Logout failed: ' + error.message);
         if (status !== 200 || ! body || body.ok !== true) return log ('Logout response bad: ' + JSON.stringify (body));
         next ();
      });
   }],

   ['Cloud 32: Old session cookie is rejected after logout', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud) return next ();
      httpRequest ('GET', '/auth/csrf', '', {Cookie: cookieHeader (s.adminAuth.cookies)}, function (error, status) {
         if (error) return log ('CSRF after logout failed: ' + error.message);
         if (status !== 403) return log ('Expected 403 after logout, got ' + status);
         next ();
      });
   }],

   // *** CLEANUP ***

   ['Cloud 33: Delete admin project', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud || ! s.adminProjectSlug) return next ();
      // Re-login admin to delete the project
      cloudLogin (s.cloudAdminEmail, function (error, auth) {
         if (error) return log ('Admin re-login for cleanup failed: ' + error.message);
         s.cleanupKeys.push ('session:' + auth.cookies.vibey);
         var req = http.request ({
            hostname: 'localhost',
            port: 5353,
            path: '/projects/' + encodeURIComponent (s.adminProjectSlug),
            method: 'DELETE',
            headers: {Cookie: cookieHeader (auth.cookies)}
         }, function (res) {
            var data = '';
            res.on ('data', function (chunk) {data += chunk;});
            res.on ('end', function () {next ();});
         });
         req.on ('error', function () {next ();});
         req.end ();
      });
   }],

   ['Cloud 34: Flush test keys from Redis', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipCloud || ! s.cleanupKeys || ! s.cleanupKeys.length) return next ();
      redisFlushTestKeys (s.cleanupKeys, function () {
         next ();
      });
   }]
];

// *** SNAPSHOTS ***

var SNAPSHOTS_PROJECT = 'snapshots-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var SNAP_DOC_CONTENT = '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n';
var SNAP_EXTRA_FILE = 'doc/notes.md';
var SNAP_EXTRA_CONTENT = '# Notes\n\nSome extra notes.\n';

var snapshotsSequence = [

   ['Snapshot 1: Create project', 'post', 'projects', {}, {name: SNAPSHOTS_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Snapshot 2: Write doc/main.md', 'post', 'project/' + SNAPSHOTS_PROJECT + '/file/doc/main.md', {}, {content: SNAP_DOC_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File write failed');
      return true;
   }],

   ['Snapshot 3: Write extra file', 'post', 'project/' + SNAPSHOTS_PROJECT + '/file/' + SNAP_EXTRA_FILE, {}, {content: SNAP_EXTRA_CONTENT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Extra file write failed');
      return true;
   }],

   // *** Create a snapshot ***

   ['Snapshot 4: Create snapshot with label', 'post', 'project/' + SNAPSHOTS_PROJECT + '/snapshot', {}, {label: 'before refactor'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return log ('Expected snapshot entry object');
      if (! rs.body.id) return log ('Snapshot missing id');
      if (normalizeProjectSlugForMode (rs.body.project) !== SNAPSHOTS_PROJECT) return log ('Snapshot project mismatch: ' + rs.body.project);
      if (rs.body.label !== 'before refactor') return log ('Snapshot label mismatch');
      if (! rs.body.file || rs.body.file.indexOf ('.tar.gz') === -1) return log ('Snapshot file should be .tar.gz');
      if (type (rs.body.fileCount) !== 'integer' || rs.body.fileCount < 2) return log ('Expected at least 2 files, got: ' + rs.body.fileCount);
      if (! rs.body.created) return log ('Snapshot missing created timestamp');
      s.snapshotId = rs.body.id;
      s.snapshotProjectName = rs.body.projectName;
      return true;
   }],

   // *** List snapshots ***

   ['Snapshot 5: List snapshots includes our snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot not found in list');
      if (found.label !== 'before refactor') return log ('Label mismatch in list');
      return true;
   }],

   // *** Create a second snapshot (no label) ***

   ['Snapshot 6: Create second snapshot without label', 'post', 'project/' + SNAPSHOTS_PROJECT + '/snapshot', {}, {}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.id) return log ('Second snapshot creation failed');
      s.snapshotId2 = rs.body.id;
      return true;
   }],

   ['Snapshot 7: List snapshots has two entries', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (! inc (ids, s.snapshotId)) return log ('First snapshot missing');
      if (! inc (ids, s.snapshotId2)) return log ('Second snapshot missing');
      // Newest first
      if (rs.body [0].id !== s.snapshotId2) return log ('Expected newest snapshot first');
      return true;
   }],

   // *** Download snapshot ***

   ['Snapshot 8: Download placeholder snapshot returns 404', 'get', 'snapshots/' + 'placeholder' + '/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // Verify download via httpGet for dynamic path
   ['Snapshot 9: Download snapshot (dynamic path)', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      httpGet (5353, '/snapshots/' + encodeURIComponent (s.snapshotId) + '/download', function (error, status, body) {
         if (error) return log ('Download failed: ' + error.message);
         if (status !== 200) return log ('Download returned status ' + status);
         if (! body || body.length < 10) return log ('Download body too small: ' + body.length + ' bytes');
         next ();
      });
   }],

   // *** Restore snapshot as new project ***

   ['Snapshot 10: Restore snapshot as new project', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
      var body = JSON.stringify ({name: 'Restored Snapshot Test'});
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
               s.restoredSlug = normalizeProjectSlugForMode (result.slug);
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
   ['Snapshot 11: Restored project in list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (! projectListHasSlug (rs.body, s.restoredSlug)) return log ('Restored project not in list: ' + s.restoredSlug);
      return true;
   }],

   // Verify restored project has the same files
   ['Snapshot 12: Restored project has both files', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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
   ['Snapshot 13: Restored doc/main.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshot 14: Restored notes.md matches original', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshot 15: Modify original doc/main.md', 'post', 'project/' + SNAPSHOTS_PROJECT + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('File overwrite failed');
      return true;
   }],

   // Restored project should still have original content
   ['Snapshot 16: Restored project unaffected by original modification', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshot 17: Delete second snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshot 18: List snapshots no longer has deleted snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ids = dale.go (rs.body, function (snap) {return snap.id;});
      if (inc (ids, s.snapshotId2)) return log ('Deleted snapshot still in list');
      if (! inc (ids, s.snapshotId)) return log ('First snapshot should still exist');
      return true;
   }],

   // *** Snapshot survives project deletion ***

   ['Snapshot 19: Delete original project', 'delete', 'projects/' + SNAPSHOTS_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Snapshot 20: Snapshot still in list after project deletion', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var found = dale.stopNot (rs.body, undefined, function (snap) {
         if (snap.id === s.snapshotId) return snap;
      });
      if (! found) return log ('Snapshot disappeared after project deletion');
      return true;
   }],

   // *** Delete nonexistent snapshot returns error ***

   ['Snapshot 21: Delete nonexistent snapshot returns 400', 'delete', 'snapshots/nonexistent-id-12345', {}, '', 400, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Download nonexistent snapshot returns 404 ***

   ['Snapshot 22: Download nonexistent snapshot returns 404', 'get', 'snapshots/nonexistent-id-12345/download', {}, '', 404, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || ! rs.body.error) return log ('Expected error message');
      return true;
   }],

   // *** Cleanup ***

   ['Snapshot 23: Delete restored project', 'get', 'projects', {}, '', 200, function (s, rq, rs, next) {
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
   ['Snapshot 24: Delete first snapshot', 'get', 'snapshots', {}, '', 200, function (s, rq, rs, next) {
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

   ['Snapshot 25: Snapshots list is clean', 'get', 'snapshots', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      var ours = dale.fil (rs.body, undefined, function (snap) {
         if (normalizeProjectSlugForMode (snap.project) === SNAPSHOTS_PROJECT) return snap;
      });
      if (ours.length > 0) return log ('Leftover snapshots from snapshots suite: ' + ours.length);
      return true;
   }]
];

// *** AUTOGIT ***

var AUTOGIT_PROJECT = 'autogit-' + testTimestamp () + '-' + Math.floor (Math.random () * 100000);

var autogitSequence = [

   ['Autogit 1: Create project', 'post', 'projects', {}, {name: AUTOGIT_PROJECT}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project creation failed');
      return true;
   }],

   ['Autogit 2: .git repository exists in workspace', 'post', 'project/' + AUTOGIT_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'test -d .git && echo yes || echo no'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('run_command failed: ' + JSON.stringify (rs.body));
      if ((rs.body.stdout || '').trim () !== 'yes') return log ('Expected .git directory to exist');
      return true;
   }],

   ['Autogit 3: Capture initial commit count', 'post', 'project/' + AUTOGIT_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, 200, function (s, rq, rs) {
      if (! rs.body || ! rs.body.success) return log ('Failed to read commit count');
      var n = Number ((rs.body.stdout || '').trim ());
      if (! isFinite (n) || n < 1) return log ('Initial commit count should be >= 1, got: ' + rs.body.stdout);
      s.autogitCount0 = n;
      return true;
   }],

   ['Autogit 4: GET files does not create a commit', 'get', 'project/' + AUTOGIT_PROJECT + '/files', {}, '', 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after GET: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after GET');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.autogitCount0) return log ('GET /files changed commit count from ' + s.autogitCount0 + ' to ' + n);
         s.autogitCount1 = n;
         next ();
      });
   }],

   ['Autogit 5: Write doc/notes.md increments commit count', 'post', 'project/' + AUTOGIT_PROJECT + '/file/doc/notes.md', {}, {content: '# Notes\n\nFirst version\n'}, 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after write: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after write');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.autogitCount1 + 1) return log ('Expected commit count ' + (s.autogitCount1 + 1) + ' after write, got ' + n);
         s.autogitCount2 = n;
         next ();
      });
   }],

   ['Autogit 6: Rewriting same content does not create a commit', 'post', 'project/' + AUTOGIT_PROJECT + '/file/doc/notes.md', {}, {content: '# Notes\n\nFirst version\n'}, 200, function (s, rq, rs, next) {
      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after same-content write: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after same-content write');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.autogitCount2) return log ('Same-content write changed commit count from ' + s.autogitCount2 + ' to ' + n);
         s.autogitCount3 = n;
         next ();
      });
   }],

   ['Autogit 7: run_command with FS mutation increments commit count', 'post', 'project/' + AUTOGIT_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'echo from-autogit > touched-by-tool.txt'}}, 200, function (s, rq, rs, next) {
      if (! rs.body || ! rs.body.success) return log ('Mutating run_command failed');
      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after mutating run_command: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after mutating run_command');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.autogitCount3 + 1) return log ('Expected commit count ' + (s.autogitCount3 + 1) + ' after mutating run_command, got ' + n);
         s.autogitCount4 = n;
         next ();
      });
   }],

   ['Autogit 8: run_command without FS mutation does not create a commit', 'post', 'project/' + AUTOGIT_PROJECT + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'echo noop'}}, 200, function (s, rq, rs, next) {
      if (! rs.body || ! rs.body.success) return log ('Non-mutating run_command failed');
      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (error, code, body) {
         if (error) return log ('Failed to read commit count after non-mutating run_command: ' + error.message);
         if (code !== 200 || ! body || ! body.success) return log ('Unexpected response reading commit count after non-mutating run_command');
         var n = Number ((body.stdout || '').trim ());
         if (n !== s.autogitCount4) return log ('Non-mutating run_command changed commit count from ' + s.autogitCount4 + ' to ' + n);
         s.autogitCount5 = n;
         next ();
      });
   }],

   ['Autogit 9: Two concurrent writes keep git healthy and create two commits', 'get', 'project/' + AUTOGIT_PROJECT + '/files', {}, '', 200, function (s, rq, rs, next) {
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

         httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git rev-list --count HEAD'}}, function (errCount, codeCount, bodyCount) {
            if (errCount) return log ('Failed to read commit count after concurrent writes: ' + errCount.message);
            if (codeCount !== 200 || ! bodyCount || ! bodyCount.success) return log ('Unexpected response reading commit count after concurrent writes');

            var n = Number ((bodyCount.stdout || '').trim ());
            if (n !== s.autogitCount5 + 2) return log ('Expected two additional commits after concurrent writes. Expected ' + (s.autogitCount5 + 2) + ', got ' + n);

            httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'git fsck --no-progress'}}, function (errFsck, codeFsck, bodyFsck) {
               if (errFsck) return log ('git fsck request failed: ' + errFsck.message);
               if (codeFsck !== 200 || ! bodyFsck || ! bodyFsck.success) return log ('git fsck command failed: ' + JSON.stringify (bodyFsck));

               httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/tool/execute', {toolName: 'run_command', toolInput: {command: 'test ! -e .git/index.lock && echo clean'}}, function (errLock, codeLock, bodyLock) {
                  if (errLock) return log ('index.lock check failed: ' + errLock.message);
                  if (codeLock !== 200 || ! bodyLock || ! bodyLock.success) return log ('index.lock check command failed');
                  if ((bodyLock.stdout || '').trim () !== 'clean') return log ('Expected no .git/index.lock after concurrent writes');
                  next ();
               });
            });
         });
      };

      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/file/doc/concurrent-a.md', {content: '# A\n\n' + Date.now () + '\n'}, function (errorA, codeA, bodyA) {
         if (errorA) return finishOne (errorA.message);
         if (codeA !== 200 || ! bodyA || bodyA.ok !== true) return finishOne ('write A status/body mismatch');
         finishOne ();
      });

      httpJson ('POST', '/project/' + AUTOGIT_PROJECT + '/file/doc/concurrent-b.md', {content: '# B\n\n' + Date.now () + '\n'}, function (errorB, codeB, bodyB) {
         if (errorB) return finishOne (errorB.message);
         if (codeB !== 200 || ! bodyB || bodyB.ok !== true) return finishOne ('write B status/body mismatch');
         finishOne ();
      });
   }],

   ['Autogit 10: Delete project', 'delete', 'projects/' + AUTOGIT_PROJECT, {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object' || rs.body.ok !== true) return log ('Project deletion failed');
      return true;
   }],

   ['Autogit 11: Project removed from list', 'get', 'projects', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'array') return log ('Expected array');
      if (projectListHasSlug (rs.body, AUTOGIT_PROJECT)) return log ('Project still exists after deletion');
      return true;
   }],

];

// *** TRIGGERS ***

var triggerSequence = [

   ['Trigger 1: Cloud trigger setup', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (rs.code === 200 && rs.body && rs.body.mode === 'LOCAL') {
         s.skipTrigger = true;
         return next ();
      }
      if (rs.code !== 403 && rs.code !== 200) return log ('Expected 403 or 200 from auth/csrf, got ' + rs.code);

      s.triggerAdminEmail = (CONFIG.adminEmail || '').toLowerCase ();
      if (! s.triggerAdminEmail) {
         s.skipTrigger = true;
         return next ();
      }

      cloudLogin (s.triggerAdminEmail, function (loginError, auth) {
         if (loginError) {
            s.skipTrigger = true;
            return next ();
         }
         s.triggerAuth = auth;

         // Resolve userId for later Redis checks
         redisGet ('email:' + s.triggerAdminEmail, function (err, userId) {
            if (err || ! userId) {
               s.skipTrigger = true;
               return next ();
            }
            s.triggerUserId = userId;

            // Save original settings for restore
            redisExec ('HGET ' + JSON.stringify ('user:' + userId) + ' settings', function (err2, raw) {
               s.triggerOriginalSettings = raw || '{}';
               next ();
            });
         });
      });
   }],

   ['Trigger 2: Create project and verify trigger ID in Redis', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      authJson ('POST', '/projects', {name: 'trigger-test-' + testTimestamp ()}, s.triggerAuth, function (projectError, projectStatus, projectBody) {
         if (projectError) return log ('Trigger project create failed: ' + projectError.message);
         if (projectStatus !== 200) return log ('Expected 200 creating trigger project, got ' + projectStatus);
         if (! projectBody || ! projectBody.slug) return log ('Trigger project create missing slug');
         s.triggerProjectSlug = projectBody.slug;

         authGet ('/project/' + encodeURIComponent (s.triggerProjectSlug) + '/trigger-id', s.triggerAuth, function (trigError, trigStatus, trigBody) {
            if (trigError) return log ('GET trigger-id failed: ' + trigError.message);
            if (trigStatus !== 200) return log ('Expected 200 from GET trigger-id, got ' + trigStatus);
            if (! trigBody || ! trigBody.triggerId) return log ('Missing triggerId in response');
            s.triggerId = trigBody.triggerId;

            redisGet ('trigger:' + trigBody.triggerId, function (err, val) {
               if (err || ! val) return log ('trigger:<id> not found in Redis');
               if (val.indexOf (s.triggerProjectSlug) === -1) return log ('trigger:<id> value does not contain project slug: ' + val);

               redisGet ('projecttrigger:' + s.triggerUserId + ':' + s.triggerProjectSlug, function (err2, val2) {
                  if (err2 || val2 !== s.triggerId) return log ('projecttrigger reverse lookup mismatch: expected ' + s.triggerId + ', got ' + val2);
                  next ();
               });
            });
         });
      });
   }],

   ['Trigger 3: POST /trigger with Bearer token creates dialog', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         prompt: 'Reply with the single word ok.',
         slug: 'api-trigger'
      }, function (triggerError, triggerStatus, triggerBody) {
         if (triggerError) return log ('Trigger failed: ' + triggerError.message);
         if (triggerStatus !== 202) return log ('Expected 202 from trigger, got ' + triggerStatus + ' ' + JSON.stringify (triggerBody));
         if (! triggerBody || triggerBody.ok !== true || ! triggerBody.dialogId) return log ('Bad trigger response: ' + JSON.stringify (triggerBody));
         next ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 4: POST /trigger with data (email shape) creates dialog', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         data: {from: 'test@example.com', subject: 'Test trigger', body: 'Run echo hello'},
         slug: 'email-trigger'
      }, function (triggerError, triggerStatus, triggerBody) {
         if (triggerError) return log ('Data trigger failed: ' + triggerError.message);
         if (triggerStatus !== 202) return log ('Expected 202 from data trigger, got ' + triggerStatus + ' ' + JSON.stringify (triggerBody));
         if (! triggerBody || triggerBody.ok !== true || ! triggerBody.dialogId) return log ('Bad data trigger response: ' + JSON.stringify (triggerBody));
         next ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 5: POST /trigger with explicit model resolves provider', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         model: 'gpt-5.2',
         prompt: 'Reply with the single word ok.',
         slug: 'model-trigger'
      }, function (triggerError, triggerStatus, triggerBody) {
         if (triggerError) return log ('Model trigger failed: ' + triggerError.message);
         if (triggerStatus !== 202) return log ('Expected 202 from model trigger, got ' + triggerStatus + ' ' + JSON.stringify (triggerBody));
         if (! triggerBody || triggerBody.ok !== true || ! triggerBody.dialogId) return log ('Bad model trigger response: ' + JSON.stringify (triggerBody));
         next ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 6: Invalid trigger ID returns 403', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         prompt: 'test'
      }, function (triggerError, triggerStatus) {
         if (triggerStatus !== 403) return log ('Expected 403 for invalid trigger ID, got ' + triggerStatus);
         next ();
      }, {Authorization: 'Bearer invalid-trigger-id-12345'});
   }],

   ['Trigger 7: No prompt and no data returns 400', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         slug: 'empty-trigger'
      }, function (triggerError, triggerStatus) {
         if (triggerStatus !== 400) return log ('Expected 400 for missing prompt/data, got ' + triggerStatus);
         next ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 8: Unknown model returns 400', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         model: 'not-a-real-model',
         prompt: 'test'
      }, function (triggerError, triggerStatus) {
         if (triggerStatus !== 400) return log ('Expected 400 for unknown model, got ' + triggerStatus);
         next ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 9: Autodetect prefers OpenAI when both providers available', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      httpJson ('POST', '/trigger', {
         prompt: 'Reply with the single word ok.',
         slug: 'autodetect-both'
      }, function (triggerError, triggerStatus, triggerBody) {
         if (triggerError) return log ('Autodetect-both trigger failed: ' + triggerError.message);
         if (triggerStatus !== 202) return log ('Expected 202 from autodetect-both trigger, got ' + triggerStatus + ' ' + JSON.stringify (triggerBody));
         if (! triggerBody || ! triggerBody.dialogId) return log ('Missing dialogId from autodetect-both trigger');

         // Dialog file is written before 202 but may need a moment to be readable via docker exec
         var attempts = 0;
         var readDialog = function () {
            authGet ('/project/' + encodeURIComponent (s.triggerProjectSlug) + '/dialog/' + encodeURIComponent (triggerBody.dialogId), s.triggerAuth, function (err, status, body) {
               if ((err || status !== 200 || ! body || ! body.markdown) && attempts < 10) {
                  attempts++;
                  return setTimeout (readDialog, 500);
               }
               if (err || status !== 200 || ! body || ! body.markdown) return log ('Could not read autodetect-both dialog after ' + attempts + ' attempts, status=' + status);
               if (body.markdown.indexOf ('Provider: openai') === -1) return log ('Autodetect should prefer openai when both available, got: ' + body.markdown.slice (0, 200));
               next ();
            });
         };
         readDialog ();
      }, {Authorization: 'Bearer ' + s.triggerId});
   }],

   ['Trigger 10: Autodetect falls back to Claude when only Claude configured', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      var settings = {};
      try {settings = JSON.parse (s.triggerOriginalSettings);} catch (e) {}
      var claudeOnly = {accounts: {}};
      if (settings.accounts && settings.accounts.claude) claudeOnly.accounts.claude = settings.accounts.claude;
      if (settings.accounts && settings.accounts.claudeOAuth) claudeOnly.accounts.claudeOAuth = settings.accounts.claudeOAuth;

      redisExec ('HSET ' + JSON.stringify ('user:' + s.triggerUserId) + ' settings ' + JSON.stringify (JSON.stringify (claudeOnly)), function (err) {
         if (err) return log ('Could not set Claude-only settings');

         httpJson ('POST', '/trigger', {
            prompt: 'Reply with the single word ok.',
            slug: 'autodetect-claude'
         }, function (triggerError, triggerStatus, triggerBody) {
            if (triggerError) return log ('Autodetect-claude trigger failed: ' + triggerError.message);
            if (triggerStatus !== 202) return log ('Expected 202 from autodetect-claude trigger, got ' + triggerStatus + ' ' + JSON.stringify (triggerBody));

            var attempts = 0;
            var readDialog = function () {
               authGet ('/project/' + encodeURIComponent (s.triggerProjectSlug) + '/dialog/' + encodeURIComponent (triggerBody.dialogId), s.triggerAuth, function (err2, status, body) {
                  if ((err2 || status !== 200 || ! body || ! body.markdown) && attempts < 10) {
                     attempts++;
                     return setTimeout (readDialog, 500);
                  }
                  if (err2 || status !== 200 || ! body || ! body.markdown) return log ('Could not read autodetect-claude dialog after ' + attempts + ' attempts, status=' + status);
                  if (body.markdown.indexOf ('Provider: claude') === -1) return log ('Autodetect should fall back to claude when only Claude configured, got: ' + body.markdown.slice (0, 200));

                  redisExec ('HSET ' + JSON.stringify ('user:' + s.triggerUserId) + ' settings ' + JSON.stringify (s.triggerOriginalSettings), function () {
                     next ();
                  });
               });
            };
            readDialog ();
         }, {Authorization: 'Bearer ' + s.triggerId});
      });
   }],

   ['Trigger 11: 422 when no provider credentials configured', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger) return next ();

      redisExec ('HSET ' + JSON.stringify ('user:' + s.triggerUserId) + ' settings ' + JSON.stringify (JSON.stringify ({accounts: {}})), function (err) {
         if (err) return log ('Could not clear provider settings');

         httpJson ('POST', '/trigger', {
            prompt: 'Reply with the single word ok.',
            slug: 'no-creds'
         }, function (triggerError, triggerStatus) {
            if (triggerStatus !== 422) return log ('Expected 422 when no provider credentials, got ' + triggerStatus);

            // Restore settings
            redisExec ('HSET ' + JSON.stringify ('user:' + s.triggerUserId) + ' settings ' + JSON.stringify (s.triggerOriginalSettings), function () {
               next ();
            });
         }, {Authorization: 'Bearer ' + s.triggerId});
      });
   }],

   ['Trigger 12: Cleanup — delete project and verify both Redis keys removed', 'get', 'auth/csrf', {}, '', '*', function (s, rq, rs, next) {
      if (s.skipTrigger || ! s.triggerProjectSlug) return next ();

      var req = http.request ({
         hostname: 'localhost',
         port: 5353,
         path: '/projects/' + encodeURIComponent (s.triggerProjectSlug),
         method: 'DELETE',
         headers: {Cookie: cookieHeader (s.triggerAuth.cookies), 'X-CSRF-Token': s.triggerAuth.csrf}
      }, function (res) {
         res.on ('data', function () {});
         res.on ('end', function () {
            if (res.statusCode !== 200) return log ('Expected 200 from project delete, got ' + res.statusCode);
            redisGet ('trigger:' + s.triggerId, function (err, val) {
               if (val) return log ('trigger:<id> should be deleted after project deletion, but still exists: ' + val);
               redisGet ('projecttrigger:' + s.triggerUserId + ':' + s.triggerProjectSlug, function (err2, val2) {
                  if (val2) return log ('projecttrigger:<userId>:<slug> should be deleted, but still exists: ' + val2);
                  next ();
               });
            });
         });
      });
      req.on ('error', function () {next ();});
      req.end ();
   }]

];

// *** RUNNER ***

// Suite order matches readme.md test suites section.
var SUITE_ORDER = ['project', 'doc', 'upload', 'snapshot', 'autogit', 'cloud', /*vi, */'trigger', 'dialog', 'static', 'backend'];
var FAST_SUITES = ['project', 'doc', 'upload', 'snapshot', 'autogit', 'cloud'];
var NOSLOW_SUITES = ['project', 'doc', 'upload', 'snapshot', 'autogit', 'cloud', /*vi, */'trigger', 'dialog'];

var allSuites = {
   project:  projectSequence,
   doc:      docSequence,
   upload:   uploadSequence,
   snapshot: snapshotsSequence,
   autogit:  autogitSequence,
   cloud:    cloudSequence,
   dialog:   dialogSequence,
   trigger:  triggerSequence,
   static:   staticSequence,
   backend:  backendSequence,
   vi:       viSequence
};

var requestedSuites = [];
dale.go (process.argv.slice (2), function (arg) {
   if (arg === 'fast') return dale.go (FAST_SUITES, function (name) {
      requestedSuites.push (name);
   });
   if (arg === 'noslow') return dale.go (NOSLOW_SUITES, function (name) {
      requestedSuites.push (name);
   });
   if (allSuites [arg]) requestedSuites.push (arg);
});

if (! requestedSuites.length) requestedSuites = SUITE_ORDER;

var adaptSequenceForCloud = function (sequence) {
   return dale.go (sequence, function (step) {
      var copy = step.slice ();
      var method = (copy [1] || '').toUpperCase ();
      var headers = {};
      dale.go (copy [3] || {}, function (value, key) {
         headers [key] = value;
      });
      headers.Cookie = cookieHeader (TEST_MODE.auth.cookies);
      copy [3] = headers;
      if (type (copy [2]) === 'string') copy [2] = scopeCloudPath (copy [2]).replace (/^\//, '');
      else if (type (copy [2]) === 'function') {
         var originalPath = copy [2];
         copy [2] = function (s) {
            var path = originalPath (s);
            return type (path) === 'string' ? scopeCloudPath (path).replace (/^\//, '') : path;
         };
      }
      if ((method === 'POST' || method === 'PUT') && type (copy [4]) === 'object' && copy [4].csrf === undefined) copy [4].csrf = TEST_MODE.auth.csrf;
      if (method === 'DELETE' && ! headers ['X-CSRF-Token'] && ! headers ['x-csrf-token']) headers ['X-CSRF-Token'] = TEST_MODE.auth.csrf;
      return copy;
   });
};

var finish = function (code) {
   process.exit (code);
};

var runSuites = function () {
   var label = requestedSuites.join (' + ');
   var state = {
      host: 'localhost',
      port: 5353,
      timeout: 420
   };

   var ensureCloudAuth = function (suiteName, cb) {
      var email = (CONFIG.adminEmail || '').toLowerCase ();
      if (! email) return cb (new Error ('secret.json must define adminEmail for cloud tests'));

      var seedAccounts = function (userId, done) {
         if (! CONFIG.accounts) return done ();
         var hasAccounts = CONFIG.accounts.openaiOAuth || CONFIG.accounts.claudeOAuth || (CONFIG.accounts.openai && CONFIG.accounts.openai.apiKey) || (CONFIG.accounts.claude && CONFIG.accounts.claude.apiKey);
         if (! hasAccounts) return done ();
         redisExec ('HSET ' + JSON.stringify ('user:' + userId) + ' settings ' + JSON.stringify (JSON.stringify ({accounts: CONFIG.accounts})), done);
      };

      var finishAuth = function (auth, userId) {
         auth.userId = userId;
         TEST_MODE.auth = auth;
         seedAccounts (userId, function (seedError) {
            if (seedError) return cb (seedError);
            cb (null);
         });
      };

      var loginFresh = function () {
         cloudLogin (email, function (loginError, auth) {
            if (loginError) return cb (new Error ('Cloud login failed for suite ' + suiteName + ': ' + loginError.message));
            redisGet ('email:' + email, function (lookupError, userId) {
               if (lookupError || ! userId) return cb (lookupError || new Error ('Missing config admin user in Redis'));
               finishAuth (auth, userId);
            });
         });
      };

      if (! TEST_MODE.auth) return loginFresh ();
      authGet ('/auth/csrf', TEST_MODE.auth, function (error, status, body) {
         if (! error && status === 200 && body && body.csrf) return finishAuth (TEST_MODE.auth, TEST_MODE.auth.userId);
         loginFresh ();
      });
   };

   var runSuiteAt = function (index) {
      if (index >= requestedSuites.length) {
         log ('ALL TESTS PASSED (' + label + ')');
         return finish (0);
      }

      var name = requestedSuites [index];
      var sequence = allSuites [name];
      if (! sequence) return runSuiteAt (index + 1);

      var execute = function (suiteSequence) {
         h.seq (state, [suiteSequence], function (error) {
            if (error) {
               try {
                  if (error.request && type (error.request.body) === 'string') {
                     error.request.body = error.request.body.slice (0, 1200) + (error.request.body.length > 1200 ? '... OMITTING REMAINDER' : '');
                  }
               }
               catch (e) {}
               console.log ('VIBEY TEST FAILED:', error);
               return finish (1);
            }
            runSuiteAt (index + 1);
         }, h.stdmap);
      };

      if (! TEST_MODE.cloud) return execute (sequence);
      if (name === 'cloud') {
         TEST_MODE.auth = null;
         return execute (sequence);
      }

      ensureCloudAuth (name, function (authError) {
         if (authError) {
            console.log ('VIBEY TEST FAILED:', authError);
            return finish (1);
         }
         execute (adaptSequenceForCloud (sequence));
      });
   };

   runSuiteAt (0);
};

httpRequest ('GET', '/auth/csrf', '', {}, function (error, status, text) {
   if (error) {
      console.log ('VIBEY TEST FAILED:', error);
      return finish (1);
   }

   var body = null;
   try {body = text ? JSON.parse (text) : null;} catch (e) {}

   if (status === 200 && body && body.mode === 'LOCAL') return runSuites ();
   if (status !== 403 && status !== 200) {
      console.log ('VIBEY TEST FAILED:', new Error ('Unexpected GET /auth/csrf status: ' + status));
      return finish (1);
   }

   TEST_MODE.cloud = true;

   var needsCloudAuth = dale.stopNot (requestedSuites, false, function (name) {
      return name !== 'cloud';
   });

   if (! needsCloudAuth) return runSuites ();

   redisFlushdb (function (flushError) {
      if (flushError) {
         console.log ('VIBEY TEST FAILED:', flushError);
         return finish (1);
      }

      var email = (CONFIG.adminEmail || '').toLowerCase ();
      if (! email) {
         console.log ('VIBEY TEST FAILED:', new Error ('secret.json must define adminEmail for cloud tests'));
         return finish (1);
      }

      httpRequest ('GET', '/auth/csrf', '', {}, function (bootstrapError) {
         if (bootstrapError) {
            console.log ('VIBEY TEST FAILED:', bootstrapError);
            return finish (1);
         }
         cloudLogin (email, function (loginError, auth) {
            if (loginError) {
               console.log ('VIBEY TEST FAILED:', loginError);
               return finish (1);
            }
            redisGet ('email:' + email, function (lookupError, userId) {
               if (lookupError || ! userId) {
                  console.log ('VIBEY TEST FAILED:', lookupError || new Error ('Missing config admin user in Redis'));
                  return finish (1);
               }
               auth.userId = userId;
               TEST_MODE.auth = auth;

               // Seed API keys from secret.json into the user's Redis settings
               if (CONFIG.accounts && (CONFIG.accounts.openaiOAuth || CONFIG.accounts.claudeOAuth || (CONFIG.accounts.openai && CONFIG.accounts.openai.apiKey) || (CONFIG.accounts.claude && CONFIG.accounts.claude.apiKey))) {
                  var settings = JSON.stringify ({accounts: CONFIG.accounts});
                  redisExec ('HSET ' + JSON.stringify ('user:' + userId) + ' settings ' + JSON.stringify (settings), function (seedError) {
                     if (seedError) {
                        console.log ('VIBEY TEST WARNING: Could not seed API keys into Redis:', seedError.message);
                     }
                     runSuites ();
                  });
               }
               else {
                  runSuites ();
               }
            });
         });
      });
   });
});
