// test-client.js
// Unified frontend test entrypoint.
// - In Node: runs Puppeteer, opens vibey, clicks the Test button, waits for final alert.
// - In Browser: runs the c.test Flow #1 frontend suite.

(function () {

   // *** NODE MODE (boot runner) ***

   if (typeof window === 'undefined') {
      var Path = require ('path');
      var puppeteer = require (Path.join (process.execPath, '..', '..', 'lib', 'node_modules', 'puppeteer'));

      (async function () {
         // Accept flow filter from CLI: node test-client.js [flow]
         // e.g. node test-client.js 6   or   node test-client.js ALL
         var cliFlow = (process.argv [2] || 'ALL').trim ().toUpperCase ();

         var launchOptions = {headless: true};
         if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

         var browser = await puppeteer.launch (launchOptions);
         var page = await browser.newPage ();
         await page.setCacheEnabled (false);

         var gotDialog = false;

         var lastActivity = Date.now ();

         // Stream browser logs to Node stdout so test progress is visible in real time.
         page.on ('console', function (msg) {
            lastActivity = Date.now ();
            var type = msg.type ? msg.type () : 'log';
            var text = msg.text ? msg.text () : '';
            console.log ('[vibey-page-' + type + '] ' + text);
         });

         page.on ('pageerror', function (error) {
            lastActivity = Date.now ();
            console.log ('[vibey-page-error] ' + (error && error.stack ? error.stack : (error && error.message ? error.message : String (error))));
         });

         page.on ('requestfailed', function (request) {
            lastActivity = Date.now ();
            var fail = request.failure ? request.failure () : null;
            console.log ('[vibey-request-failed] ' + request.method () + ' ' + request.url () + ' :: ' + (fail && fail.errorText ? fail.errorText : 'unknown'));
         });

         try {
            await page.goto ('http://localhost:5353', {waitUntil: 'networkidle2', timeout: 30000});

            // Intercept the prompt dialog from client.js and answer with our CLI flow choice.
            page.on ('dialog', async function (dialog) {
               if (dialog.type () === 'prompt') {
                  console.log ('[vibey-test] Answering flow prompt with: ' + cliFlow);
                  await dialog.accept (cliFlow);
                  return;
               }
               // Handle alert dialogs (test results) — existing logic below
               var message = dialog.message ();
               console.log ('[vibey-test-alert] ' + message.replace (/\n/g, ' | '));
               await dialog.accept ();

               if (message.indexOf ('✅ All tests passed!') === 0) {
                  gotDialog = true;
                  await browser.close ();
                  process.exit (0);
               }
               if (message.indexOf ('❌ Test FAILED:') === 0) {
                  gotDialog = true;
                  await browser.close ();
                  process.exit (1);
               }
            });

            // Click the top-right "🧪 Test" button.
            var clicked = await page.evaluate (function () {
               var buttons = Array.from (document.querySelectorAll ('button'));
               var testButton = buttons.find (function (b) {
                  var text = (b.textContent || '').trim ();
                  return text === '🧪 Test' || text === 'Test' || text.indexOf ('Test') > -1;
               });
               if (! testButton) return false;
               testButton.click ();
               return true;
            });

            if (! clicked) {
               console.log ('[vibey-test-alert] ERROR: Could not find Test button');
               await browser.close ();
               process.exit (1);
            }

            // Abort if idle for too long (stuck), with a generous hard cap for full runs.
            var MAX_TEST_MS = Number (process.env.VIBEY_TEST_TIMEOUT_MS || (15 * 60 * 1000));
            var IDLE_TIMEOUT_MS = Number (process.env.VIBEY_TEST_IDLE_TIMEOUT_MS || (3 * 60 * 1000));
            var started = Date.now ();

            while (! gotDialog) {
               var now = Date.now ();
               if (now - started >= MAX_TEST_MS) break;
               if (now - lastActivity >= IDLE_TIMEOUT_MS) break;
               await new Promise (function (resolve) {setTimeout (resolve, 250);});
            }

            if (! gotDialog) {
               var now = Date.now ();
               var reason = (now - lastActivity >= IDLE_TIMEOUT_MS)
                  ? ('idle timeout (' + Math.round (IDLE_TIMEOUT_MS / 1000) + 's without activity)')
                  : ('max timeout (' + Math.round (MAX_TEST_MS / 1000) + 's)');
               console.log ('[vibey-test-alert] TIMEOUT: ' + reason);
               await browser.close ();
               process.exit (2);
            }
         }
         catch (error) {
            console.log ('[vibey-test-alert] ERROR: ' + (error && error.message ? error.message : String (error)));
            await browser.close ();
            process.exit (3);
         }
      }) ();

      return;
   }

   // *** BROWSER MODE (c.test suite) ***

   var B = window.B;
   var type = teishi.type;
   var inc  = teishi.inc;

   // *** HELPERS ***

   var originalPrompt = window.prompt;

   var queuedPromptValues = [];

   var mockPrompt = function (value) {
      queuedPromptValues.push (value);
      window.prompt = function () {
         if (queuedPromptValues.length) return queuedPromptValues.shift ();
         return null;
      };
   };

   var restorePrompt = function () {
      window.prompt = originalPrompt;
      queuedPromptValues = [];
   };

   var findByText = function (selector, text) {
      return dale.stopNot (Array.prototype.slice.call (document.querySelectorAll (selector)), undefined, function (el) {
         if (el.textContent.indexOf (text) !== -1) return el;
      }) || null;
   };

   var click = function (el) {
      if (! el) return false;
      el.click ();
      return true;
   };

   var getTextarea = function (selector) {
      return document.querySelector (selector || '.editor-textarea');
   };

   var pressKey = function (el, key, options) {
      if (! el) return;
      options = options || {};
      el.dispatchEvent (new KeyboardEvent ('keydown', {
         key: key,
         bubbles: true,
         ctrlKey: !! options.ctrlKey,
         metaKey: !! options.metaKey,
         altKey: !! options.altKey,
         shiftKey: !! options.shiftKey
      }));
   };

   var setCursor = function (textarea, pos) {
      if (! textarea) return;
      textarea.selectionStart = textarea.selectionEnd = pos;
      if (! textarea.dataset) return;
      textarea.dataset.viCursorPos = String (pos);
      var before = (textarea.value || '').slice (0, pos);
      var line = before.split ('\n').length;
      var lastNl = before.lastIndexOf ('\n');
      var col = lastNl === -1 ? pos + 1 : pos - lastNl;
      textarea.dataset.viCursorLine = String (line);
      textarea.dataset.viCursorCol = String (col);
   };

   var cursorInfoFromTextarea = function (textarea) {
      if (! textarea) {
         if (window.__vibeyViDebug) console.log ('[vi-debug] test cursor: textarea missing');
         return {pos: 0, line: 1, col: 1};
      }
      var val = textarea.value || '';
      var viMode = B.get ('viMode');
      var viCursor = B.get ('viCursor') || {};
      var pos = textarea.selectionStart || 0;
      var line = 1;
      var col = 1;

      if (viMode) {
         var dLine = textarea.dataset ? parseInt (textarea.dataset.viCursorLine || '0', 10) : 0;
         var dCol = textarea.dataset ? parseInt (textarea.dataset.viCursorCol || '0', 10) : 0;
         var dPos = textarea.dataset ? parseInt (textarea.dataset.viCursorPos || '0', 10) : 0;

         if (dLine && dCol) {
            line = dLine;
            col = dCol;
         }
         else if (viCursor.line && viCursor.col) {
            line = viCursor.line;
            col = viCursor.col;
         }

         if (dPos) pos = dPos;
         else {
            var lines = val.split ('\n');
            var offset = 0;
            for (var i = 0; i < line - 1; i++) offset += (lines [i] || '').length + 1;
            pos = offset + (col - 1);
         }
      }
      else {
         var before = val.slice (0, pos);
         line = before.split ('\n').length;
         var lastNl = before.lastIndexOf ('\n');
         col = lastNl === -1 ? pos + 1 : pos - lastNl;
      }

      if (window.__vibeyViDebug) console.log ('[vi-debug] test cursor ' + JSON.stringify ({pos: pos, line: line, col: col, readOnly: textarea.readOnly, connected: !! textarea.isConnected, active: document.activeElement === textarea, dLine: textarea.dataset ? textarea.dataset.viCursorLine : null, dCol: textarea.dataset ? textarea.dataset.viCursorCol : null, dPos: textarea.dataset ? textarea.dataset.viCursorPos : null}));
      return {pos: pos, line: line, col: col};
   };

   var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};
   var testTimestamp = function () {
      var d = new Date ();
      return d.getUTCFullYear () + '' + pad2 (d.getUTCMonth () + 1) + pad2 (d.getUTCDate ()) + '-' + pad2 (d.getUTCHours ()) + pad2 (d.getUTCMinutes ()) + pad2 (d.getUTCSeconds ());
   };

   var streamDialogEvents = function (project, dialogId, onComplete, options) {
      options = options || {};
      var events = [];
      var done = false;
      var timeoutMs = options.timeout || POLL_TIMEOUT;
      var url = 'project/' + encodeURIComponent (project) + '/dialog/' + encodeURIComponent (dialogId) + '/stream';
      var es = new EventSource (url);
      var heartbeatMs = options.heartbeatMs;
      if (! heartbeatMs && timeoutMs >= 60000) heartbeatMs = 30000;
      var heartbeatTimer = heartbeatMs ? setInterval (function () {
         if (done) return;
         console.log ('[vibey-test] stream heartbeat ' + dialogId);
      }, heartbeatMs) : null;

      var finish = function (payload) {
         if (done) return;
         done = true;
         clearTimeout (timer);
         if (heartbeatTimer) clearInterval (heartbeatTimer);
         try { es.close (); } catch (e) {}
         onComplete (payload);
      };

      var timer = setTimeout (function () {
         finish ({error: 'timeout', events: events});
      }, timeoutMs);

      es.onmessage = function (ev) {
         if (! ev || ! ev.data) return;
         var data;
         try { data = JSON.parse (ev.data); } catch (e) { return; }
         events.push (data);
         if (options.onEvent) options.onEvent (data);
         if (options.stopOnChunk && data.type === 'chunk') {
            finish ({error: null, events: events});
            return;
         }
         if (data.type === 'done' || data.type === 'error') {
            finish ({error: data.type === 'error' ? (data.error || 'error') : null, events: events});
         }
      };

      es.onerror = function () {
         finish ({error: 'error', events: events});
      };

      return es;
   };

   var LONG_WAIT    = 240000; // 4 min for LLM responses
   var MEDIUM_WAIT  = 15000;
   var SHORT_WAIT   = 3000;
   var POLL         = 200;
   var POLL_TIMEOUT = 180000; // 3 min hard timeout for long polling steps
   var EXTENDED_POLL_TIMEOUT = 300000; // 5 min for LLM build flows (F4/F5)

   var PROJECT_FLOW = 'test-projects-' + testTimestamp ();
   var TEST_PROJECT = 'test-flow1-' + testTimestamp ();
   var TEST_DIALOG  = 'flow1-read-vibey';

   // *** TESTS ***

   // Suite filter: set by client.js prompt or puppeteer CLI arg.
   // 'ALL' runs everything; use suite name (dialog, docs, uploads, snapshots, static, backend, vi).
   // Suite order matches readme.md test suites section.
   var flowFilter = (window._vibeyTestFlow || 'ALL').toUpperCase ();

   // Extract suite name from test tag: "Dialog: ..." → "dialog", "Docs: ..." → "docs", etc.
   var testFlow = function (name) {
      var match = name.match (/^([^:]+):/);
      if (match) {
         var label = match [1].trim ();
         label = label.replace (/\s+\d+[a-z]?$/i, '');
         return label.toLowerCase ();
      }
      return 'dialog';
   };

   var allTests = [

      // =============================================
      // *** PROJECTS ***
      // =============================================

      ['Project 1: Navigate to projects tab', function (done) {
         window.location.hash = '#/projects';
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'projects') return 'Expected tab to be "projects" but got "' + tab + '"';
         var heading = findByText ('.editor-filename', 'Projects');
         if (! heading) return 'Projects heading not found in DOM';
         return true;
      }],

      ['Project 2: Create project "' + PROJECT_FLOW + '" via prompt', function (done) {
         mockPrompt (PROJECT_FLOW);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected to land on "docs" tab after project creation, got "' + tab + '"';
         var project = B.get ('currentProject');
         if (project !== PROJECT_FLOW) return 'Expected currentProject to be "' + PROJECT_FLOW + '" but got "' + project + '"';
         return true;
      }],

      ['Project 3: Projects list shows new project entry', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'projects') return 'Expected tab to be "projects" but got "' + tab + '"';
         var item = findByText ('.file-name', PROJECT_FLOW);
         if (! item) return 'Project entry not found in list for "' + PROJECT_FLOW + '"';
         return true;
      }],

      ['Project 4: Idempotent create with same name succeeds', function (done) {
         mockPrompt (PROJECT_FLOW);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected to land on "docs" tab after idempotent create, got "' + tab + '"';
         var project = B.get ('currentProject');
         if (project !== PROJECT_FLOW) return 'Expected currentProject to remain "' + PROJECT_FLOW + '" after idempotent create, got "' + project + '"';
         return true;
      }],

      ['Project 5: Delete project via UI clears state', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', PROJECT_FLOW);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Project 6: Projects list no longer shows deleted project', function (done) {
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', PROJECT_FLOW);
         if (item) return 'Deleted project still appears in list';
         return true;
      }],

      ['Project 7: Navigating to deleted project returns to Projects', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (PROJECT_FLOW) + '/docs');
         done (SHORT_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to remain null after navigating to deleted project';
         if (B.get ('tab') !== 'projects') return 'Expected to remain on projects tab after navigating to deleted project';
         return true;
      }],

      ['Project 8: Delete nonexistent project is server-only (client n/a)', function () {
         return true;
      }],

      ['Project 9: Empty project name prompt is ignored', function (done) {
         window._projListCount = (B.get ('projects') || []).length;
         mockPrompt ('');
         B.call ('create', 'project');
         done (SHORT_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var count = (B.get ('projects') || []).length;
         if (count !== window._projListCount) return 'Projects list length changed after empty prompt';
         if (B.get ('currentProject')) return 'currentProject should remain null after empty prompt';
         return true;
      }],

      ['Project 10: Whitespace-only project name prompt is ignored', function (done) {
         window._projListCount = (B.get ('projects') || []).length;
         mockPrompt ('   ');
         B.call ('create', 'project');
         done (SHORT_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var count = (B.get ('projects') || []).length;
         if (count !== window._projListCount) return 'Projects list length changed after whitespace prompt';
         if (B.get ('currentProject')) return 'currentProject should remain null after whitespace prompt';
         return true;
      }],

      ['Project 11a: Create project "My Cool Project"', function (done) {
         mockPrompt ('My Cool Project');
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var slug = B.get ('currentProject');
         if (! slug) return 'Expected currentProject to be set after creating "My Cool Project"';
         if (B.get ('tab') !== 'docs') return 'Expected to land on "docs" tab after creating "My Cool Project"';
         window._projSpecialSlug1 = slug;
         return true;
      }],

      ['Project 11b: Projects list shows "My Cool Project"', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'My Cool Project');
         if (! item) return 'Project entry not found for "My Cool Project"';
         return true;
      }],

      ['Project 11c: Delete "My Cool Project"', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         if (! window._projSpecialSlug1) return done (SHORT_WAIT, POLL);
         B.call ('delete', 'project', window._projSpecialSlug1);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'My Cool Project');
         if (item) return 'Deleted project still appears in list for "My Cool Project"';
         return true;
      }],

      ['Project 11d: Create project "🚀 Rocket App"', function (done) {
         mockPrompt ('🚀 Rocket App');
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var slug = B.get ('currentProject');
         if (! slug) return 'Expected currentProject to be set after creating "🚀 Rocket App"';
         if (B.get ('tab') !== 'docs') return 'Expected to land on "docs" tab after creating "🚀 Rocket App"';
         window._projSpecialSlug2 = slug;
         return true;
      }],

      ['Project 11e: Projects list shows "🚀 Rocket App"', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', '🚀 Rocket App');
         if (! item) return 'Project entry not found for "🚀 Rocket App"';
         return true;
      }],

      ['Project 11f: Delete "🚀 Rocket App"', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         if (! window._projSpecialSlug2) return done (SHORT_WAIT, POLL);
         B.call ('delete', 'project', window._projSpecialSlug2);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', '🚀 Rocket App');
         if (item) return 'Deleted project still appears in list for "🚀 Rocket App"';
         return true;
      }],

      ['Project 11g: Create project "café étude"', function (done) {
         mockPrompt ('café étude');
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var slug = B.get ('currentProject');
         if (! slug) return 'Expected currentProject to be set after creating "café étude"';
         if (B.get ('tab') !== 'docs') return 'Expected to land on "docs" tab after creating "café étude"';
         window._projSpecialSlug3 = slug;
         return true;
      }],

      ['Project 11h: Projects list shows "café étude"', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'café étude');
         if (! item) return 'Project entry not found for "café étude"';
         return true;
      }],

      ['Project 11i: Delete "café étude"', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         if (! window._projSpecialSlug3) return done (SHORT_WAIT, POLL);
         B.call ('delete', 'project', window._projSpecialSlug3);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'café étude');
         if (item) return 'Deleted project still appears in list for "café étude"';
         return true;
      }],

      ['Project 11j: Create project "hello—world & friends!"', function (done) {
         mockPrompt ('hello—world & friends!');
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var slug = B.get ('currentProject');
         if (! slug) return 'Expected currentProject to be set after creating "hello—world & friends!"';
         if (B.get ('tab') !== 'docs') return 'Expected to land on "docs" tab after creating "hello—world & friends!"';
         window._projSpecialSlug4 = slug;
         return true;
      }],

      ['Project 11k: Projects list shows "hello—world & friends!"', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'hello—world & friends!');
         if (! item) return 'Project entry not found for "hello—world & friends!"';
         return true;
      }],

      ['Project 11l: Delete "hello—world & friends!"', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         if (! window._projSpecialSlug4) return done (SHORT_WAIT, POLL);
         B.call ('delete', 'project', window._projSpecialSlug4);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'hello—world & friends!');
         if (item) return 'Deleted project still appears in list for "hello—world & friends!"';
         return true;
      }],

      ['Project 11m: Create project "日本語プロジェクト"', function (done) {
         mockPrompt ('日本語プロジェクト');
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var slug = B.get ('currentProject');
         if (! slug) return 'Expected currentProject to be set after creating "日本語プロジェクト"';
         if (B.get ('tab') !== 'docs') return 'Expected to land on "docs" tab after creating "日本語プロジェクト"';
         window._projSpecialSlug5 = slug;
         return true;
      }],

      ['Project 11n: Projects list shows "日本語プロジェクト"', function (done) {
         B.call ('navigate', 'hash', '#/projects');
         done (SHORT_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', '日本語プロジェクト');
         if (! item) return 'Project entry not found for "日本語プロジェクト"';
         return true;
      }],

      ['Project 11o: Delete "日本語プロジェクト"', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         if (! window._projSpecialSlug5) return done (SHORT_WAIT, POLL);
         B.call ('delete', 'project', window._projSpecialSlug5);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', '日本語プロジェクト');
         if (item) return 'Deleted project still appears in list for "日本語プロジェクト"';
         return true;
      }],

      // --- Dialog: We start on the projects tab ---
      ['Dialog 1: Shell includes client.js', function () {
         var script = document.querySelector ('script[src="client.js"]');
         if (! script) return 'client.js script tag not found in DOM';
         return true;
      }],

      ['Dialog 2: Create project via API', function (done) {
         c.ajax ('post', 'projects', {}, {name: TEST_PROJECT}, function (error, rs) {
            window._f1ProjectCreate = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1ProjectCreate || {};
         if (result.error) return 'Project creation failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (! body.slug) return 'Missing slug in project create response';
         window._f1ProjectSlug = body.slug;
         window._f1ProjectName = body.name;
         return true;
      }],

      ['Dialog 3: Create dialog draft (dialog/new)', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/new', {}, {
            provider: 'openai',
            model: 'gpt-5.2-codex',
            slug: TEST_DIALOG
         }, function (error, rs) {
            window._f1DialogDraft = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogDraft || {};
         if (result.error) return 'Dialog draft creation failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (! body.dialogId) return 'Missing dialogId in dialog/new response';
         if (! body.filename || body.filename.indexOf ('-done.md') === -1) return 'Expected done filename, got ' + body.filename;
         if (body.status !== 'done') return 'Expected status done, got ' + body.status;
         window._f1DialogId = body.dialogId;
         return true;
      }],

      ['Dialog 4: Dialog draft listed in /dialogs', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialogs', {}, '', function (error, rs) {
            window._f1DialogsList = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogsList || {};
         if (result.error) return 'Dialog list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         var found = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._f1DialogId && d.status === 'done') return d;
         });
         if (! found) return 'Dialog draft not found in list';
         return true;
      }],

      ['Dialog 5: Seed test-sample.txt via tool/execute', function (done) {
         var content = '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/tool/execute', {}, {
            toolName: 'write_file',
            toolInput: {path: 'test-sample.txt', content: content}
         }, function (error, rs) {
            window._f1ToolSeed = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1ToolSeed && window._f1ToolSeed.error) return 'Tool seed failed';
         return true;
      }],

      ['Dialog 6: PUT dialog prompt with run_command', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1DialogId,
            prompt: 'read test-sample.txt with run_command'
         }, function (error, rs) {
            window._f1DialogStart = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogStart || {};
         if (result.error) return 'Dialog start failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (body.status !== 'active') return 'Expected active status, got ' + body.status;
         return true;
      }],

      ['Dialog 7: Stream dialog until done and verify context event', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogId, function (result) {
            window._f1Stream1 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         var result = window._f1Stream1 || {};
         if (result.error) return 'Stream failed: ' + result.error;
         var contextEvent = dale.stopNot (result.events || [], undefined, function (ev) {
            if (ev.type === 'context' && ev.context) return ev;
         });
         if (! contextEvent) return 'Missing context event in stream';
         if (type (contextEvent.context.percent) !== 'integer' && type (contextEvent.context.percent) !== 'float') return 'Context percent missing';
         if (type (contextEvent.context.used) !== 'integer' && type (contextEvent.context.used) !== 'float') return 'Context used missing';
         if (type (contextEvent.context.limit) !== 'integer' && type (contextEvent.context.limit) !== 'float') return 'Context limit missing';
         return true;
      }],

      ['Dialog 8: Dialog markdown has Time, Context, and run_command tool blocks', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/' + encodeURIComponent (window._f1DialogId), {}, '', function (error, rs) {
            window._f1DialogLoad = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogLoad || {};
         if (result.error) return 'Dialog fetch failed';
         var md = result.rs && result.rs.body ? result.rs.body.markdown : '';
         if (md.indexOf ('> Time:') === -1) return 'Missing > Time in dialog markdown';
         if (md.indexOf ('> Context:') === -1) return 'Missing > Context in dialog markdown';
         if (md.indexOf ('run_command') === -1) return 'Missing run_command in dialog markdown';
         var hasToolRequest = md.indexOf ('## Tool Request') !== -1 || md.indexOf ('Tool request:') !== -1;
         var hasToolResult = md.indexOf ('## Tool Result') !== -1 || md.indexOf ('Result:') !== -1;
         if (! hasToolRequest || ! hasToolResult) return 'Missing tool request/result blocks';
         return true;
      }],

      ['Dialog 9: PUT dialog prompt to create dummy.js', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1DialogId,
            prompt: 'Use write_file to create dummy.js with EXACT content: console.log("hello from dummy");'
         }, function (error, rs) {
            window._f1DialogDummy = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogDummy || {};
         if (result.error) return 'Dialog dummy prompt failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (body.status !== 'active') return 'Expected active status for dummy.js prompt';
         return true;
      }],

      ['Dialog 10: Stream dummy.js prompt until done', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogId, function (result) {
            window._f1Stream2 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._f1Stream2 && window._f1Stream2.error) return 'Stream failed: ' + window._f1Stream2.error;
         return true;
      }],

      ['Dialog 11: Dialog markdown has write_file tool blocks', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/' + encodeURIComponent (window._f1DialogId), {}, '', function (error, rs) {
            window._f1DialogLoad2 = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogLoad2 || {};
         if (result.error) return 'Dialog fetch failed';
         var md = result.rs && result.rs.body ? result.rs.body.markdown : '';
         if (md.indexOf ('write_file') === -1) return 'Missing write_file in dialog markdown';
         var hasToolRequest = md.indexOf ('## Tool Request') !== -1 || md.indexOf ('Tool request:') !== -1;
         var hasToolResult = md.indexOf ('## Tool Result') !== -1 || md.indexOf ('Result:') !== -1;
         if (! hasToolRequest || ! hasToolResult) return 'Missing tool request/result blocks';
         return true;
      }],

      ['Dialog 12: run_command cat dummy.js shows console.log', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/tool/execute', {}, {
            toolName: 'run_command',
            toolInput: {command: 'cat dummy.js'}
         }, function (error, rs) {
            window._f1DummyCat = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DummyCat || {};
         if (result.error) return 'cat dummy.js failed';
         var stdout = result.rs && result.rs.body ? result.rs.body.stdout : '';
         if (stdout.indexOf ('hello from dummy') === -1 && stdout.indexOf ('console.log') === -1) return 'dummy.js content missing console.log';
         return true;
      }],

      ['Dialog 13: Continue dialog without provider field', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1DialogId,
            prompt: 'continue without provider'
         }, function (error, rs) {
            window._f1DialogContinue = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogContinue || {};
         if (result.error) return 'Dialog continue failed';
         return true;
      }],

      ['Dialog 14: Stream continuation until done', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogId, function (result) {
            window._f1Stream3 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._f1Stream3 && window._f1Stream3.error) return 'Stream failed: ' + window._f1Stream3.error;
         return true;
      }],

      ['Dialog 15: Prompt repeat previous assistant message', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1DialogId,
            prompt: "Repeat your previous assistant message verbatim; if any line starts with '>' include it."
         }, function (error, rs) {
            window._f1DialogRepeat = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogRepeat || {};
         if (result.error) return 'Dialog repeat failed';
         return true;
      }],

      ['Dialog 16: Stream repeat and verify no headers in output', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogId, function (result) {
            window._f1Stream4 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         var result = window._f1Stream4 || {};
         if (result.error) return 'Stream failed: ' + result.error;
         var chunks = dale.fil (result.events || [], undefined, function (ev) {
            if (ev.type === 'chunk' && ev.content) return ev.content;
         });
         var text = chunks.join ('');
         if (text.indexOf ('> Provider:') !== -1) return 'Output should not contain > Provider:';
         if (text.indexOf ('> Model:') !== -1) return 'Output should not contain > Model:';
         if (text.indexOf ('> Context:') !== -1) return 'Output should not contain > Context:';
         return true;
      }],

      ['Dialog 17: POST /dialog async new dialog', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            provider: 'openai',
            model: 'gpt-5.2-codex',
            prompt: 'read test-sample.txt',
            slug: 'async-test'
         }, function (error, rs) {
            window._f1DialogAsync = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogAsync || {};
         if (result.error) return 'Async dialog POST failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (body.status !== 'active') return 'Expected async dialog status active';
         window._f1DialogAsyncId = body.dialogId;
         return true;
      }],

      ['Dialog 18: Stream async dialog until done', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogAsyncId, function (result) {
            window._f1StreamAsync = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._f1StreamAsync && window._f1StreamAsync.error) return 'Async stream failed: ' + window._f1StreamAsync.error;
         return true;
      }],

      ['Dialog 19: Async dialog markdown has run_command tool blocks', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/' + encodeURIComponent (window._f1DialogAsyncId), {}, '', function (error, rs) {
            window._f1DialogAsyncLoad = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogAsyncLoad || {};
         if (result.error) return 'Async dialog fetch failed';
         var md = result.rs && result.rs.body ? result.rs.body.markdown : '';
         if (md.indexOf ('run_command') === -1) return 'Missing run_command in async dialog';
         var hasToolRequest = md.indexOf ('## Tool Request') !== -1 || md.indexOf ('Tool request:') !== -1;
         var hasToolResult = md.indexOf ('## Tool Result') !== -1 || md.indexOf ('Result:') !== -1;
         if (! hasToolRequest || ! hasToolResult) return 'Missing tool request/result blocks in async dialog';
         return true;
      }],

      ['Dialog 20: Stream done dialog returns done immediately', function (done) {
         streamDialogEvents (window._f1ProjectSlug, window._f1DialogAsyncId, function (result) {
            window._f1StreamAsyncDone = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: SHORT_WAIT});
      }, function () {
         if (! window._f1StreamAsyncDone) return 'Missing done stream result';
         return true;
      }],

      ['Dialog 21: Create dialog agent-a', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-a'}, function (error, rs) {
            window._f1AgentA = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1AgentA || {};
         if (result.error) return 'Agent-a creation failed';
         window._f1AgentADialog = result.rs && result.rs.body ? result.rs.body.dialogId : null;
         if (! window._f1AgentADialog) return 'Missing dialogId for agent-a';
         return true;
      }],

      ['Dialog 22: Create dialog agent-b', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-b'}, function (error, rs) {
            window._f1AgentB = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1AgentB || {};
         if (result.error) return 'Agent-b creation failed';
         window._f1AgentBDialog = result.rs && result.rs.body ? result.rs.body.dialogId : null;
         if (! window._f1AgentBDialog) return 'Missing dialogId for agent-b';
         return true;
      }],

      ['Dialog 23: Fire agent-a and agent-b with slow prompts', function (done) {
         var project = encodeURIComponent (window._f1ProjectSlug);
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f1AgentADialog, prompt: 'First run the run_command tool with `sleep 12` and only then write a long essay about the history of computing.'})}).catch (function () {});
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f1AgentBDialog, prompt: 'First run the run_command tool with `sleep 12` and only then write a long essay about the history of mathematics.'})}).catch (function () {});
         done (SHORT_WAIT, POLL);
      }, function () {return true;}],

      ['Dialog 24: Stream agent-a and verify chunks arrive', function (done) {
         window._f1AgentAChunked = false;
         console.log ('[vibey-test] streaming agent-a: ' + window._f1AgentADialog);
         streamDialogEvents (window._f1ProjectSlug, window._f1AgentADialog, function (result) {
            window._f1AgentAStreamResult = result;
            console.log ('[vibey-test] agent-a stream complete error=' + (result && result.error ? result.error : 'none') + ' events=' + ((result && result.events) ? result.events.length : 0));
            done (SHORT_WAIT, POLL);
         }, {
            timeout: LONG_WAIT,
            stopOnChunk: true,
            onEvent: function (ev) {
               if (ev && ev.type) console.log ('[vibey-test] agent-a event ' + ev.type);
               if (ev.type === 'chunk' && ev.content && ! window._f1AgentAChunked) {
                  window._f1AgentAChunked = true;
                  window._f1AgentAActiveObserved = true;
               }
            }
         });
      }, function () {
         if (! window._f1AgentAChunked) return 'No chunks received for agent-a';
         return true;
      }],

      ['Dialog 25: Poll dialogs until agent-a is active with -active.md', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (window._f1AgentAActiveObserved) return true;
         if (! window._f1AgentAStatusRequested) {
            window._f1AgentAStatusRequested = true;
            console.log ('[vibey-test] polling agent-a status');
            c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialogs', {}, '', function (error, rs) {
               window._f1AgentAStatusRequested = false;
               window._f1AgentADialogs = error ? null : (rs.body || []);
            });
            return 'Polling dialog statuses...';
         }
         var list = window._f1AgentADialogs || [];
         var active = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._f1AgentADialog && d.status === 'active' && d.filename && d.filename.indexOf ('-active.md') !== -1) return d;
         });
         if (active) {
            window._f1AgentAActiveObserved = true;
            return true;
         }
         var doneEntry = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._f1AgentADialog && d.status === 'done') return d;
         });
         if (doneEntry && window._f1AgentAChunked) {
            window._f1AgentAActiveObserved = true;
            return true;
         }
         return 'Waiting for agent-a to become active...';
      }],

      ['Dialog 26: Continuing active agent-a is rejected (409)', function (done) {
         console.log ('[vibey-test] request agent-a continue');
         var logTimer = setInterval (function () {
            console.log ('[vibey-test] waiting for 409 from agent-a');
         }, 30000);
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1AgentADialog,
            prompt: 'This should be rejected while active'
         }, function (error, rs) {
            clearInterval (logTimer);
            window._f1AgentAReject = error ? error.status : (rs && rs.xhr ? rs.xhr.status : null);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1AgentAReject !== 409) return 'Expected 409 when continuing active dialog, got ' + window._f1AgentAReject;
         return true;
      }],

      ['Dialog 27: Stop agent-a via status done', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialog', {}, {
            dialogId: window._f1AgentADialog,
            status: 'done'
         }, function (error, rs) {
            window._f1AgentAStop = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1AgentAStop || {};
         if (result.error) return 'Stopping agent-a failed';
         return true;
      }],

      ['Dialog 28: Agent-a becomes done after active observed', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._f1AgentAActiveObserved) return 'Active state was not observed before done';
         if (! window._f1AgentADoneRequested) {
            window._f1AgentADoneRequested = true;
            console.log ('[vibey-test] polling agent-a done');
            c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialogs', {}, '', function (error, rs) {
               window._f1AgentADoneRequested = false;
               window._f1AgentADialogs = error ? null : (rs.body || []);
            });
            return 'Polling dialog statuses...';
         }
         var list = window._f1AgentADialogs || [];
         var found = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._f1AgentADialog && d.status === 'done' && d.filename && d.filename.indexOf ('-done.md') !== -1) return d;
         });
         if (! found) return 'Waiting for agent-a to become done...';
         return true;
      }],

      ['Dialog 29: Delete project while agent-b active', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f1ProjectSlug);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Dialog 30: Project gone from /projects list', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._f1ProjectList = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var list = window._f1ProjectList || [];
         var found = dale.stopNot (list, undefined, function (p) {
            if (p && p.slug === window._f1ProjectSlug) return p;
         });
         if (found) return 'Project still listed after deletion';
         return true;
      }],

      ['Dialog 31: /dialogs returns 404 after deletion', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialogs', {}, '', function (error) {
            window._f1DialogsMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1DialogsMissing !== 404) return 'Expected 404 for dialogs after deletion, got ' + window._f1DialogsMissing;
         return true;
      }],

      ['Dialog 32: /files returns 404 after deletion', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/files', {}, '', function (error) {
            window._f1FilesMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1FilesMissing !== 404) return 'Expected 404 for files after deletion, got ' + window._f1FilesMissing;
         return true;
      }],

      ['Dialog 33: Recreate project with same name', function (done) {
         c.ajax ('post', 'projects', {}, {name: TEST_PROJECT}, function (error, rs) {
            window._f1ProjectRecreate = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1ProjectRecreate || {};
         if (result.error) return 'Project recreate failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         window._f1ProjectSlug = body.slug || window._f1ProjectSlug;
         return true;
      }],

      ['Dialog 34: /dialogs returns empty array', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/dialogs', {}, '', function (error, rs) {
            window._f1DialogsEmpty = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1DialogsEmpty || {};
         if (result.error) return 'Dialogs list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         if (list.length !== 0) return 'Expected empty dialogs list, got ' + list.length;
         return true;
      }],

      ['Dialog 35: /files returns only doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1ProjectSlug) + '/files', {}, '', function (error, rs) {
            window._f1FilesList = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f1FilesList || {};
         if (result.error) return 'Files list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         if (list.length !== 1 || list [0] !== 'doc/main.md') return 'Expected only doc/main.md, got ' + JSON.stringify (list);
         return true;
      }],

      ['Dialog 36: Delete recreated project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f1ProjectSlug);
         done (MEDIUM_WAIT, POLL);
      }, function () {return true;}],

      ['Dialog 37: Project gone after cleanup', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._f1ProjectList2 = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var list = window._f1ProjectList2 || [];
         var found = dale.stopNot (list, undefined, function (p) {
            if (p && p.slug === window._f1ProjectSlug) return p;
         });
         if (found) return 'Project still listed after cleanup deletion';
         return true;
      }],

      // =============================================
      // *** DOCS ***
      // =============================================

      ['Docs 1: Create project for docs editing', function (done) {
         window._f2Project = 'test-flow2-' + testTimestamp ();
         mockPrompt (window._f2Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (project !== window._f2Project) return 'Expected project "' + window._f2Project + '", got "' + project + '"';
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected docs tab after project creation, got "' + tab + '"';
         return true;
      }],

      ['Docs 2: Create doc/main.md via prompt', function (done) {
         mockPrompt ('main.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after creating main.md';
         if (file.name !== 'doc/main.md') return 'Expected name "doc/main.md", got "' + file.name + '"';
         window._f2MainContent = file.content;
         return true;
      }],

      ['Docs 3: Reload main.md and verify round-trip', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after reload';
         if (file.content !== window._f2MainContent) return 'main.md content mismatch after reload';
         return true;
      }],

      ['Docs 4: Files list includes doc/main.md', function () {
         var item = findByText ('.file-name', 'main.md');
         if (! item) return 'main.md not found in sidebar';
         return true;
      }],

      ['Docs 5: Overwrite main.md with updated content', function (done) {
         var newContent = '# Main\n\nUpdated content for testing.\n';
         B.call ('set', ['currentFile', 'content'], newContent);
         B.call ('save', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after save';
         if (file.content.indexOf ('Updated content for testing') === -1) return 'Updated content not present after save';
         if (file.content !== file.original) return 'After save, content and original should match';
         return true;
      }],

      ['Docs 6: Reload main.md and verify updated content', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after reload';
         if (file.content.indexOf ('Updated content for testing') === -1) return 'Updated content not found after reload';
         return true;
      }],

      ['Docs 7: Create doc/notes.md', function (done) {
         mockPrompt ('notes.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/notes.md') return 'Expected doc/notes.md as current file';
         return true;
      }],

      ['Docs 8: Files list includes main.md and notes.md', function () {
         var mainItem = findByText ('.file-name', 'main.md');
         if (! mainItem) return 'main.md not found in sidebar';
         var notesItem = findByText ('.file-name', 'notes.md');
         if (! notesItem) return 'notes.md not found in sidebar';
         return true;
      }],

      ['Docs 9: Read notes.md and verify content', function (done) {
         B.call ('load', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/notes.md') return 'doc/notes.md not loaded';
         if (file.content.indexOf ('# notes') === -1 && file.content.indexOf ('# Notes') === -1) return 'Unexpected content in notes.md';
         return true;
      }],

      ['Docs 10: Delete doc/notes.md', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var notesItem = findByText ('.file-name', 'notes.md');
         if (notesItem) return 'notes.md still in sidebar after deletion';
         return true;
      }],

      ['Docs 11: Files list shows main.md only', function () {
         var notesItem = findByText ('.file-name', 'notes.md');
         if (notesItem) return 'notes.md still in sidebar after deletion';
         var mainItem = findByText ('.file-name', 'main.md');
         if (! mainItem) return 'main.md missing from sidebar';
         return true;
      }],

      ['Docs 12: main.md still has updated content', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content.indexOf ('Updated content for testing') === -1) return 'Updated content missing in main.md';
         return true;
      }],

      ['Docs 13: Loading deleted notes.md returns no selection', function (done) {
         B.call ('load', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (file) return 'Expected no currentFile after loading deleted notes.md';
         return true;
      }],

      ['Docs 14: Invalid filename bad..name.md returns 400', function (done) {
         var project = window._f2Project;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent ('bad..name.md'), {}, {
            content: 'bad'
         }, function (error, rs) {
            window._f2BadNameError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (! window._f2BadNameError) return 'Expected error for bad..name.md';
         return true;
      }],

      ['Docs 15: Invalid filename bad.txt returns 400', function (done) {
         var project = window._f2Project;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent ('bad.txt'), {}, {
            content: 'bad'
         }, function (error, rs) {
            window._f2BadTxtError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (! window._f2BadTxtError) return 'Expected error for bad.txt';
         return true;
      }],

      ['Docs 16: Special filenames round-trip (spaces, accents, non-Latin)', function (done) {
         var project = window._f2Project;
         var files = [
            {name: 'doc/my notes.md', content: '# my notes\n\nHello.\n'},
            {name: 'doc/café.md', content: '# café\n\nBonjour.\n'},
            {name: 'doc/日本語.md', content: '# 日本語\n\nこんにちは。\n'}
         ];

         var run = function (index) {
            if (index >= files.length) return done (SHORT_WAIT, POLL);
            var entry = files [index];
            var filename = entry.name;
            var content = entry.content;

            c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, {content: content}, function (error) {
               if (error) { window._f2SpecialError = filename + ':write'; return done (SHORT_WAIT, POLL); }
               c.ajax ('get', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error2, rs2) {
                  if (error2 || ! rs2.body || rs2.body.content !== content) { window._f2SpecialError = filename + ':read'; return done (SHORT_WAIT, POLL); }
                  c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error3, rs3) {
                     var listed = rs3 && rs3.body ? rs3.body : [];
                     if (error3 || listed.indexOf (filename) === -1) { window._f2SpecialError = filename + ':list'; return done (SHORT_WAIT, POLL); }
                     c.ajax ('delete', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error4) {
                        if (error4) { window._f2SpecialError = filename + ':delete'; return done (SHORT_WAIT, POLL); }
                        c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error5, rs5) {
                           var listedAfter = rs5 && rs5.body ? rs5.body : [];
                           if (error5 || listedAfter.indexOf (filename) !== -1) { window._f2SpecialError = filename + ':gone'; return done (SHORT_WAIT, POLL); }
                           run (index + 1);
                        });
                     });
                  });
               });
            });
         };

         window._f2SpecialError = null;
         run (0);
      }, function () {
         if (window._f2SpecialError) return 'Special filename round-trip failed at ' + window._f2SpecialError;
         return true;
      }],

      ['Docs 17: Nested path round-trip: doc/nested/plan.md', function (done) {
         var project = window._f2Project;
         var filename = 'doc/nested/plan.md';
         var content = '# plan\n\nNested.\n';
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, {content: content}, function (error) {
            if (error) { window._f2NestedError = 'write'; return done (SHORT_WAIT, POLL); }
            c.ajax ('get', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error2, rs2) {
               if (error2 || ! rs2.body || rs2.body.content !== content) { window._f2NestedError = 'read'; return done (SHORT_WAIT, POLL); }
               c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error3, rs3) {
                  var files = rs3 && rs3.body ? rs3.body : [];
                  if (error3 || files.indexOf (filename) === -1) { window._f2NestedError = 'list'; return done (SHORT_WAIT, POLL); }
                  c.ajax ('delete', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error4) {
                     if (error4) { window._f2NestedError = 'delete'; return done (SHORT_WAIT, POLL); }
                     c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error5, rs5) {
                        var files2 = rs5 && rs5.body ? rs5.body : [];
                        if (error5 || files2.indexOf (filename) !== -1) window._f2NestedError = 'gone';
                        else window._f2NestedError = null;
                        done (SHORT_WAIT, POLL);
                     });
                  });
               });
            });
         });
      }, function () {
         if (window._f2NestedError) return 'Nested file (plan.md) failed at step: ' + window._f2NestedError;
         return true;
      }],

      ['Docs 18: Delete docs project via UI', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f2Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after docs project deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Docs 19: Projects list no longer shows deleted docs project', function (done) {
         B.call ('load', 'projects');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', window._f2Project);
         if (item) return 'Deleted docs project still appears in projects list';
         return true;
      }],

      // =============================================
      // *** UPLOADS ***
      // =============================================

      ['Uploads 1: Create project for uploads', function (done) {
         window._f3uProject = 'test-flow3-' + testTimestamp ();
         mockPrompt (window._f3uProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f3uProject || 'Failed to create flow #3 project';
      }],

      ['Uploads 2: Upload test-image.png via data URL', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'test-image.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._f3uUploadImage = rs && rs.body;
            window._f3uUploadImageError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadImageError) return 'Image upload failed: ' + window._f3uUploadImageError;
         var entry = window._f3uUploadImage || {};
         if (entry.name !== 'test-image.png') return 'Upload response missing test-image.png';
         if (! entry.url) return 'Upload response missing url';
         return true;
      }],

      ['Uploads 3: Uploads list includes test-image.png metadata', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'test-image.png') return item; });
         if (! image) return 'test-image.png not found in uploads list';
         if (! image.size || image.size <= 0) return 'test-image.png size invalid';
         if (! image.contentType || image.contentType.indexOf ('image/') !== 0) return 'test-image.png contentType invalid: ' + image.contentType;
         window._f3uUploadImage = image;
         return true;
      }],

      ['Uploads 4: Fetch test-image.png bytes', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/test-image.png', {}, '', function (error, rs) {
            window._f3uUploadFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f3uUploadFetch || {};
         if (result.error) return 'Upload fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for test-image.png, got ' + status;
         var body = rs.body || '';
         if (! body || body.length === 0) return 'Upload fetch returned empty body';
         return true;
      }],

      ['Uploads 5: test-image.png content-type is image/png', function () {
         var rs = (window._f3uUploadFetch || {}).rs || {};
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('image/png') === -1) return 'Expected image/png content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 6: Upload notes.txt via API', function (done) {
         var text = 'Hello from uploads test!';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'notes.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f3uUploadText = rs && rs.body;
            window._f3uUploadTextError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadTextError) return 'Text upload failed: ' + window._f3uUploadTextError;
         var entry = window._f3uUploadText || {};
         if (entry.name !== 'notes.txt') return 'Upload response missing notes.txt';
         return true;
      }],

      ['Uploads 7: Uploads list includes test-image.png + notes.txt', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'test-image.png') return item; });
         if (! image) return 'test-image.png not found in uploads list';
         var text = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'notes.txt') return item; });
         if (! text) return 'notes.txt not found in uploads list';
         return true;
      }],

      ['Uploads 8: Fetch notes.txt and verify content-type', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/notes.txt', {}, '', function (error, rs) {
            window._f3uNotesFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f3uNotesFetch || {};
         if (result.error) return 'notes.txt fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for notes.txt, got ' + status;
         var body = rs.body || '';
         if (body.indexOf ('Hello from uploads test!') === -1) return 'notes.txt content mismatch';
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('text/plain') === -1) return 'Expected text/plain content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 9: Upload my screenshot 2026.png', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'my screenshot 2026.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._f3uUploadScreenshot = rs && rs.body;
            window._f3uUploadScreenshotError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadScreenshotError) return 'Screenshot upload failed: ' + window._f3uUploadScreenshotError;
         return true;
      }],

      ['Uploads 10: Uploads list includes my screenshot 2026.png', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var screenshot = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'my screenshot 2026.png') return item; });
         if (! screenshot) return 'my screenshot 2026.png not found in uploads list';
         return true;
      }],

      ['Uploads 11: Fetch spaced filename upload returns image/png', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/' + encodeURIComponent ('my screenshot 2026.png'), {}, '', function (error, rs) {
            window._f3uSpaceFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f3uSpaceFetch || {};
         if (result.error) return 'spaced filename fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for spaced filename, got ' + status;
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('image/png') === -1) return 'Expected image/png content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 12: Upload my-file.v2.backup.txt', function (done) {
         var text = 'Hello from backups.';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'my-file.v2.backup.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f3uUploadBackupError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadBackupError) return 'Backup upload failed: ' + window._f3uUploadBackupError;
         return true;
      }],

      ['Uploads 13: Invalid upload name ../etc/passwd returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: '../etc/passwd',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._f3uInvalid1 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uInvalid1 !== 400) return 'Expected 400 for ../etc/passwd, got ' + window._f3uInvalid1;
         return true;
      }],

      ['Uploads 14: Invalid upload name sub\\file.txt returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'sub\\file.txt',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._f3uInvalid2 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uInvalid2 !== 400) return 'Expected 400 for sub\\file.txt, got ' + window._f3uInvalid2;
         return true;
      }],

      ['Uploads 15: Invalid upload name /absolute.txt returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: '/absolute.txt',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._f3uInvalid3 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uInvalid3 !== 400) return 'Expected 400 for /absolute.txt, got ' + window._f3uInvalid3;
         return true;
      }],

      ['Uploads 16: Upload nested/evil.png (subdir allowed)', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'nested/evil.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._f3uUploadNestedError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadNestedError) return 'Nested upload failed: ' + window._f3uUploadNestedError;
         return true;
      }],

      ['Uploads 17: Uploads list contains exactly 5 valid entries', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         if (uploads.length !== 5) return 'Expected exactly 5 uploads, got ' + uploads.length;
         var names = dale.go (uploads, function (u) { return u.name; });
         var expected = ['test-image.png', 'notes.txt', 'my screenshot 2026.png', 'my-file.v2.backup.txt', 'nested/evil.png'];
         var missing = dale.stopNot (expected, undefined, function (name) { if (names.indexOf (name) === -1) return name; });
         if (missing) return 'Uploads list missing ' + missing;
         return true;
      }],

      ['Uploads 18: Fetch nonexistent upload returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/nonexistent.png', {}, '', function (error, rs) {
            window._f3uMissingStatus = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uMissingStatus !== 404) return 'Expected 404 for nonexistent.png, got ' + window._f3uMissingStatus;
         return true;
      }],

      ['Uploads 19: Delete uploads project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f3uProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after uploads project deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Uploads 20: Projects list no longer shows deleted project', function (done) {
         B.call ('load', 'projects');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', window._f3uProject);
         if (item) return 'Deleted uploads project still appears in projects list';
         return true;
      }],

      // =============================================
      // *** DIALOG (SAFETY) ***
      // =============================================

      ['Dialog (safety) 14a: Create project', function (done) {
         window._f1sProject = 'test-flow1-safety-' + testTimestamp ();
         mockPrompt (window._f1sProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f1sProject || 'Failed to create flow #1 safety project';
      }],

      ['Dialog (safety) 14b: Write doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1sProject) + '/file/doc/main.md', {}, {content: '# Flow 1 Safety Test Project\n\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Dialog (safety) 14: Create dialog agent-a', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1sProject) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-a'}, function (error, rs) {
            window._f1sDialogA = rs && rs.body && rs.body.dialogId;
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {
         if (! window._f1sDialogA) return 'Missing dialog id for agent-a';
         return true;
      }],

      ['Dialog (safety) 15: Create dialog agent-b', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f1sProject) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-b'}, function (error, rs) {
            window._f1sDialogB = rs && rs.body && rs.body.dialogId;
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {
         if (! window._f1sDialogB) return 'Missing dialog id for agent-b';
         return true;
      }],

      ['Dialog (safety) 16: Fire both dialogs (non-blocking)', function (done) {
         var project = encodeURIComponent (window._f1sProject);
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f1sDialogA, prompt: 'First run the run_command tool with `sleep 12` and only then write a long essay about the history of computing.'})}).catch (function () {});
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f1sDialogB, prompt: 'First run the run_command tool with `sleep 12` and only then write a long essay about the history of mathematics.'})}).catch (function () {});
         done (SHORT_WAIT, POLL);
      }, function () {return true;}],

      ['Dialog (safety) 17: Both dialogs are active', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._f1sStatusRequested) {
            window._f1sStatusRequested = true;
            c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/dialogs', {}, '', function (error, rs) {
               window._f1sStatusRequested = false;
               if (error) return;
               window._f1sDialogs = rs.body || [];
            });
            return 'Polling dialog statuses...';
         }
         var activeCount = dale.fil (window._f1sDialogs || [], undefined, function (d) {
            if (d.status === 'active') return d;
         }).length;
         if (activeCount >= 2) return true;
         window._f1sDialogs = null;
         return 'Waiting for both dialogs to become active...';
      }],

      ['Dialog (safety) 18: Continuing active dialog is rejected (409)', function (done) {
         var project = encodeURIComponent (window._f1sProject);
         fetch ('project/' + project + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({dialogId: window._f1sDialogA, prompt: 'This should be rejected while active'})
         }).then (function (res) {
            window._f1sRejectStatus = res.status;
            return res.text ();
         }).then (function (text) {
            window._f1sRejectBody = text;
            done (SHORT_WAIT, POLL);
         }).catch (function (e) {
            window._f1sRejectStatus = -1;
            window._f1sRejectBody = '' + e;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1sRejectStatus !== 409) return 'Expected 409 when continuing active dialog, got ' + window._f1sRejectStatus;
         return true;
      }],

      ['Dialog (safety) 19: Stop active dialog still works', function (done) {
         var project = encodeURIComponent (window._f1sProject);
         fetch ('project/' + project + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({dialogId: window._f1sDialogA, status: 'done'})
         }).then (function (res) {
            window._f1sStopStatus = res.status;
            return res.text ();
         }).then (function (text) {
            try {window._f1sStopBody = JSON.parse (text);} catch (e) {window._f1sStopBody = null;}
            done (SHORT_WAIT, POLL);
         }).catch (function () {
            window._f1sStopStatus = -1;
            window._f1sStopBody = null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f1sStopStatus !== 200) return 'Expected 200 when stopping active dialog, got ' + window._f1sStopStatus;
         if (! window._f1sStopBody || window._f1sStopBody.status !== 'done') return 'Expected stop response with status=done';
         return true;
      }],

      ['Dialog (safety) 20: Agent-a returns to done', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._f1sDoneRequested) {
            window._f1sDoneRequested = true;
            c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/dialogs', {}, '', function (error, rs) {
               window._f1sDoneRequested = false;
               if (error) return;
               window._f1sDialogsAfterStop = rs.body || [];
            });
            return 'Polling dialog status after stop...';
         }
         var entry = dale.stopNot (window._f1sDialogsAfterStop || [], undefined, function (d) {
            if (d && d.dialogId === window._f1sDialogA) return d;
         });
         if (! entry) return 'Waiting for agent-a dialog entry...';
         if (entry.status === 'done') return true;
         window._f1sDialogsAfterStop = null;
         return 'Waiting for agent-a to be done...';
      }],

      ['Dialog (safety) 21: Delete project with active agents', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f1sProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Dialog (safety) 22: Projects list no longer shows deleted project', function (done) {
         B.call ('load', 'projects');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', window._f1sProject);
         if (item) return 'Deleted safety project still appears in projects list';
         return true;
      }],

      ['Dialog (safety) 23: Dialogs endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/dialogs', {}, '', function (error) {
            window._f1sDialogs404 = error && error.status;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f1sDialogs404 === 404 || 'Expected dialogs endpoint 404';
      }],

      ['Dialog (safety) 24: Files endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/files', {}, '', function (error) {
            window._f1sFiles404 = error && error.status;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f1sFiles404 === 404 || 'Expected files endpoint 404';
      }],

      ['Dialog (safety) 25: Re-create same project name', function (done) {
         c.ajax ('post', 'projects', {}, {name: window._f1sProject}, function () {done (SHORT_WAIT, POLL);});
      }, function () {return true;}],

      ['Dialog (safety) 26: Re-created project has no dialogs', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/dialogs', {}, '', function (error, rs) {
            window._f1sDialogsAfter = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (type (window._f1sDialogsAfter) !== 'array' || window._f1sDialogsAfter.length !== 0) return 'Expected 0 dialogs after re-create';
         return true;
      }],

      ['Dialog (safety) 27: Re-created project has only doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f1sProject) + '/files', {}, '', function (error, rs) {
            window._f1sFilesAfter = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (type (window._f1sFilesAfter) !== 'array') return 'Expected files array after re-create';
         var unexpected = dale.fil (window._f1sFilesAfter, undefined, function (name) {
            if (name !== 'doc/main.md') return name;
         });
         if (unexpected.length) return 'Unexpected files after re-create: ' + unexpected.join (', ');
         return true;
      }],

      ['Dialog (safety) 28: Delete re-created project', function (done) {
         c.ajax ('delete', 'projects/' + encodeURIComponent (window._f1sProject), {}, '', function () {done (SHORT_WAIT, POLL);});
      }, function () {return true;}],

      ['Dialog (safety) 29: Projects list no longer shows re-created project', function (done) {
         B.call ('load', 'projects');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', window._f1sProject);
         if (item) return 'Re-created project still appears in projects list';
         return true;
      }],

      // =============================================
      // *** STATIC APP ***
      // =============================================

      ['Static 1: Create project', function (done) {
         window._f4Project = 'test-flow4-' + testTimestamp ();
         mockPrompt (window._f4Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f4Project || 'Failed to create flow #4 project';
      }],

      ['Static 2: Write doc/main.md', function (done) {
         var docMain = [
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
            ''
         ].join ('\n') + '\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Static 3: Create dialog draft (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f4Project) + '/dialogs');
         mockPrompt ('orchestrator');
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name.indexOf ('dialog/') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-done.md') === -1) return 'Dialog draft should start in done status';
         return true;
      }],

      ['Static 4: Fire "please start" (non-blocking)', function (done) {
         var file = B.get ('currentFile');
         var parsed = file ? parseDialogFilename (file.name) : null;
         if (! parsed || ! parsed.dialogId) {
            window._f4FireError = 'Could not determine dialogId for orchestrator';
            return done (SHORT_WAIT, POLL);
         }
         window._f4FireError = null;
         fetch ('project/' + encodeURIComponent (window._f4Project) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({
               dialogId: parsed.dialogId,
               prompt: 'Please start. Read doc/main.md once, then implement immediately: create index.html and app.js in /workspace root. Do not re-fetch docs after the first read. After creating files, update doc/main.md with an embed block (port static, title Tictactoe, height 500).'
            })
         }).catch (function (error) {
            window._f4FireError = 'Failed to fire dialog: ' + (error && error.message ? error.message : String (error));
         });
         done (SHORT_WAIT, POLL);
      }, function () {
         return window._f4FireError ? window._f4FireError : true;
      }],

      ['Static 5: Poll until static page serves', function (done) {
         window._f4StaticPollError = null;
         var started = Date.now ();
         var attempt = function () {
            var elapsed = Date.now () - started;
            if (elapsed > 300000) {
               window._f4StaticPollError = 'Timed out after 5 minutes waiting for static page';
               return done (SHORT_WAIT, POLL);
            }
            console.log ('[Static poll] waiting for /static/ ... ' + Math.round (elapsed / 1000) + 's');
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/static/', {}, '', function (error, rs) {
               var code = rs && rs.xhr ? rs.xhr.status : null;
               if (! error && code === 200) {
                  var lower = (rs.body || '').toLowerCase ();
                  var hasTitle = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1 || lower.indexOf ('tic-tac-toe') !== -1;
                  if (lower.indexOf ('react') !== -1 && lower.indexOf ('app.js') !== -1 && hasTitle) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._f4StaticPollError ? window._f4StaticPollError : true;
      }],

      ['Static 6: index.html has React + app.js', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._f4IndexError = 'cat index.html failed';
            else {
               var out = (rs.body.stdout || '').toLowerCase ();
               if (out.indexOf ('react') === -1) window._f4IndexError = 'index.html missing React reference';
               else if (out.indexOf ('app.js') === -1) window._f4IndexError = 'index.html missing app.js reference';
               else window._f4IndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f4IndexError ? window._f4IndexError : true;
      }],

      ['Static 7: app.js has tictactoe logic', function (done) {
         window._f4AppError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._f4AppError = 'Timed out waiting for static/app.js with game logic';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/static/app.js', {}, '', function (error, rs) {
               var code = rs && rs.xhr ? rs.xhr.status : null;
               if (error || code !== 200 || ! rs || type (rs.body) !== 'string') return setTimeout (attempt, 3000);

               var lower = (rs.body || '').toLowerCase ();
               var hasBoardLogic = lower.indexOf ('board') !== -1 || lower.indexOf ('cell') !== -1 || lower.indexOf ('square') !== -1 || lower.indexOf ('grid') !== -1;
               if (! hasBoardLogic) return setTimeout (attempt, 3000);
               done (SHORT_WAIT, POLL);
            });
         };
         attempt ();
      }, function () {
         return window._f4AppError ? window._f4AppError : true;
      }],

      ['Static 8: Poll until embed block appears in doc/main.md', function (done) {
         window._f4EmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            var elapsed = Date.now () - started;
            if (elapsed > 300000) {
               window._f4EmbedPollError = 'Timed out after 5 minutes waiting for static embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            console.log ('[Static poll] waiting for embed block ... ' + Math.round (elapsed / 1000) + 's');
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._f4EmbedPollError ? window._f4EmbedPollError : true;
      }],

      ['Static 9: Verify embed block in doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f4EmbedContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var content = window._f4EmbedContent || '';
         if (content.indexOf ('əəəembed') === -1) return 'doc/main.md missing əəəembed block';
         if (content.indexOf ('port static') === -1) return 'doc/main.md embed missing port static';
         return true;
      }],

      // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable

      // =============================================
      // *** APP WITH BACKEND ***
      // =============================================

      ['Backend 1: Create project', function (done) {
         window._f5Project = 'test-flow5-' + testTimestamp ();
         mockPrompt (window._f5Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f5Project || 'Failed to create flow #5 project';
      }],

      ['Backend 2: Write doc/main.md', function (done) {
         var docMain = [
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
            ''
         ].join ('\n') + '\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f5Project) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Backend 3: Create dialog draft (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f5Project) + '/dialogs');
         mockPrompt ('orchestrator');
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name.indexOf ('dialog/') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-done.md') === -1) return 'Dialog draft should start in done status';
         var parsed = parseDialogFilename (file.name);
         if (! parsed || ! parsed.dialogId) return 'Could not parse orchestrator dialogId';
         window._f5DialogId = parsed.dialogId;
         return true;
      }],

      ['Backend 4: Fire "please start" (non-blocking)', function (done) {
         var dialogId = window._f5DialogId;
         if (! dialogId) {
            var file = B.get ('currentFile');
            var parsed = file ? parseDialogFilename (file.name) : null;
            if (parsed && parsed.dialogId) dialogId = parsed.dialogId;
         }
         if (! dialogId) {
            window._f5FireError = 'Could not determine dialogId for orchestrator';
            return done (SHORT_WAIT, POLL);
         }
         window._f5DialogId = dialogId;
         window._f5FireError = null;
         fetch ('project/' + encodeURIComponent (window._f5Project) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({
               dialogId: dialogId,
               prompt: 'Please start. Read doc/main.md once, then implement immediately: create server.js (Express on port 4000 serving static files from /workspace), index.html, and app.js in /workspace root. Do not re-fetch docs after the first read. Start the server with `node server.js &` and then update doc/main.md with an embed block (port 4000, title Tictactoe, height 500).'
            })
         }).catch (function (error) {
            window._f5FireError = 'Failed to fire dialog: ' + (error && error.message ? error.message : String (error));
         });
         done (SHORT_WAIT, POLL);
      }, function () {
         return window._f5FireError ? window._f5FireError : true;
      }],

      ['Backend 5: Poll until proxy serves the app on port 4000', function (done) {
         window._f5ProxyPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._f5ProxyPollError = 'Timed out after 5 minutes waiting for proxied app on port 4000';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/', {}, '', function (error, rs) {
               var code = rs && rs.xhr ? rs.xhr.status : null;
               if (! error && code === 200) {
                  var lower = (rs.body || '').toLowerCase ();
                  var hasTitle = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1 || lower.indexOf ('tic-tac-toe') !== -1;
                  if (lower.indexOf ('react') !== -1 && lower.indexOf ('app.js') !== -1 && hasTitle) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._f5ProxyPollError ? window._f5ProxyPollError : true;
      }],

      ['Backend 6: Proxy serves index.html with React + app.js', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._f5IndexError = 'Failed to fetch index via proxy';
            else {
               var lower = (rs.body || '').toLowerCase ();
               if (lower.indexOf ('react') === -1) window._f5IndexError = 'index.html missing React reference';
               else if (lower.indexOf ('app.js') === -1) window._f5IndexError = 'index.html missing app.js reference';
               else window._f5IndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f5IndexError ? window._f5IndexError : true;
      }],

      ['Backend 7: Proxy serves app.js with tictactoe logic', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/app.js', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._f5AppError = 'Failed to fetch app.js via proxy';
            else {
               var lower = (rs.body || '').toLowerCase ();
               var hasBoardLogic = lower.indexOf ('board') !== -1 || lower.indexOf ('cell') !== -1 || lower.indexOf ('square') !== -1 || lower.indexOf ('grid') !== -1;
               window._f5AppError = hasBoardLogic ? null : 'app.js missing board/cell/square/grid logic';
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f5AppError ? window._f5AppError : true;
      }],

      ['Backend 8: Server process is running', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f5Project) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'ps aux | grep node || true'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._f5PsError = 'ps aux failed';
            else {
               var out = (rs.body.stdout || '') + (rs.body.stderr || '');
               window._f5PsError = out.indexOf ('server.js') !== -1 ? null : 'server.js process not found in ps output';
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f5PsError ? window._f5PsError : true;
      }],

      ['Backend 9: Poll until embed block appears in doc/main.md', function (done) {
         window._f5EmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._f5EmbedPollError = 'Timed out after 5 minutes waiting for port 4000 embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port 4000') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._f5EmbedPollError ? window._f5EmbedPollError : true;
      }],

      ['Backend 10: Verify embed block in doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f5EmbedContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var content = window._f5EmbedContent || '';
         if (content.indexOf ('əəəembed') === -1) return 'doc/main.md missing əəəembed block';
         if (content.indexOf ('port 4000') === -1) return 'doc/main.md embed missing port 4000';
         return true;
      }],

      // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable

      // =============================================
      // *** VI MODE ***
      // =============================================
      /*
      ['Vi 1: Navigate to settings', function (done) {
         window.__vibeyViDebug = true;
         B.call ('navigate', 'hash', '#/settings');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'settings') return 'Expected tab to be "settings" but got "' + tab + '"';
         return true;
      }],

      ['Vi 2: Reset vi mode off', function (done) {
         if (B.get ('viMode')) B.call ('toggle', 'viMode');
         done (SHORT_WAIT, POLL);
      }, function () {
         return B.get ('viMode') === false || 'Expected viMode false after reset';
      }],

      ['Vi 3: Enable vi mode', function (done) {
         B.call ('toggle', 'viMode');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('viMode') !== true) return 'Expected viMode true after toggle';
         var checkbox = document.querySelector ('input[type="checkbox"]');
         if (! checkbox) return 'Vi mode checkbox not found';
         if (! checkbox.checked) return 'Checkbox should be checked after toggle';
         return true;
      }],

      ['Vi 4: Server persisted viMode true', function (done) {
         c.ajax ('get', 'settings', {}, '', function (error, rs) {
            window._f6Settings = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._f6Settings;
         if (! settings || ! settings.editor || settings.editor.viMode !== true) return 'Server settings do not reflect viMode true';
         return true;
      }],

      ['Vi 5: Create project + seed doc/main.md', function (done) {
         window._f6Project = 'test-flow6-' + testTimestamp ();
         window._f6Content = [
            'alpha beta gamma',
            'delta echo foxtrot',
            'golf hotel india',
            'juliet kilo lima'
         ].join ('\n');
         mockPrompt (window._f6Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         if (B.get ('currentProject') !== window._f6Project) return 'Failed to create flow #6 project';
         return true;
      }],

      ['Vi 6: Write doc/main.md and open editor', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f6Project) + '/file/doc/main.md', {}, {content: window._f6Content}, function () {
            B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f6Project) + '/docs/main.md');
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content !== window._f6Content) return 'doc/main.md content mismatch';
         return true;
      }],

      ['Vi 7: Switch to edit mode + normal mode baseline', function (done) {
         if (B.get ('editorPreview')) B.call ('toggle', 'editorPreview');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (B.get ('editorPreview')) return 'Still in preview mode';
         if (viState.mode !== 'normal') return 'Expected normal mode, got: ' + viState.mode;
         var textarea = getTextarea ();
         if (! textarea) return 'Editor textarea not found';
         setCursor (textarea, 0);
         textarea.dispatchEvent (new Event ('click', {bubbles: true}));
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.line !== 1 || cursor.col !== 1) return 'Expected cursor at line 1 col 1, got line ' + cursor.line + ' col ' + cursor.col;
         return true;
      }],

      ['Vi 8: Word motions w/b and line ends', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         setCursor (textarea, 0);
         pressKey (textarea, 'w');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         if (! textarea) return 'Textarea not found';
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected w to move to pos 6, got ' + cursor.pos;
         return true;
      }],

      ['Vi 9: Second w moves to next word', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, 'w');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 11) return 'Expected second w to move to pos 11, got ' + cursor.pos;
         return true;
      }],

      ['Vi 10: b moves back a word', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, 'b');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected b to move back to pos 6, got ' + cursor.pos;
         return true;
      }],

      ['Vi 11: 0 and $ jump to line start/end', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, '0');
         pressKey (textarea, '$');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 16) return 'Expected $ to move to pos 16 (end of line 1), got ' + cursor.pos;
         return true;
      }],

      ['Vi 12: j/k keep column', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         setCursor (textarea, 6);
         pressKey (textarea, 'j');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 23) return 'Expected j to move to pos 23, got ' + cursor.pos;
         pressKey (textarea, 'k');
         var cursorBack = cursorInfoFromTextarea (textarea);
         if (cursorBack.pos !== 6) return 'Expected k to move back to pos 6, got ' + cursorBack.pos;
         return true;
      }],

      ['Vi 13: G to end, gg to start', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, 'G');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var endPos = window._f6Content.length;
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== endPos) return 'Expected G to move to pos ' + endPos + ', got ' + cursor.pos;
         pressKey (textarea, 'g');
         pressKey (textarea, 'g');
         var cursorStart = cursorInfoFromTextarea (textarea);
         if (cursorStart.pos !== 0) return 'Expected gg to move to pos 0, got ' + cursorStart.pos;
         return true;
      }],

      ['Vi 14: i enters insert at cursor position', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         setCursor (textarea, 6);
         pressKey (textarea, 'i');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after i';
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected cursor at pos 6 after i, got ' + cursor.pos;
         return true;
      }],

      ['Vi 15: Escape returns to normal with same cursor', function (done) {
         var textarea = getTextarea ();
         if (textarea) pressKey (textarea, 'Escape');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'normal') return 'Expected normal mode after Escape';
         var textarea = getTextarea ();
         if (! textarea) return 'Textarea not found';
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected cursor to stay at pos 6 after Escape';
         return true;
      }],

      ['Vi 16: a inserts after cursor', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         setCursor (textarea, 6);
         pressKey (textarea, 'a');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after a';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 7) return 'Expected cursor at pos 7 after a, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         var viStateAfter = B.get ('viState') || {};
         if (viStateAfter.mode !== 'normal') return 'Expected normal mode after Escape (a)';
         var cursorAfter = cursorInfoFromTextarea (getTextarea ());
         if (cursorAfter.pos !== 7) return 'Expected cursor to stay at pos 7 after Escape (a), got ' + cursorAfter.pos;
         return true;
      }],

      ['Vi 17: I jumps to line start', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         setCursor (textarea, 11);
         pressKey (textarea, 'I');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after I';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 0) return 'Expected cursor at pos 0 after I, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         var viStateAfter = B.get ('viState') || {};
         if (viStateAfter.mode !== 'normal') return 'Expected normal mode after Escape (I)';
         var cursorAfter = cursorInfoFromTextarea (getTextarea ());
         if (cursorAfter.pos !== 0) return 'Expected cursor to stay at pos 0 after Escape (I), got ' + cursorAfter.pos;
         return true;
      }],

      ['Vi 18: A jumps to line end', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         setCursor (textarea, 0);
         pressKey (textarea, 'A');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after A';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 16) return 'Expected cursor at pos 16 after A, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         var viStateAfter = B.get ('viState') || {};
         if (viStateAfter.mode !== 'normal') return 'Expected normal mode after Escape (A)';
         var cursorAfter = cursorInfoFromTextarea (getTextarea ());
         if (cursorAfter.pos !== 16) return 'Expected cursor to stay at pos 16 after Escape (A), got ' + cursorAfter.pos;
         return true;
      }],

      ['Vi 19: o opens line below', function (done) {
         var content = 'line one\nline two\nline three';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         setCursor (textarea, 3);
         pressKey (textarea, 'o');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after o';
         var file = B.get ('currentFile');
         var expected = 'line one\n\nline two\nline three';
         if (file.content !== expected) return 'Content after o mismatch';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 9) return 'Expected cursor at pos 9 after o, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['Vi 20: O opens line above', function (done) {
         var content = 'line one\nline two\nline three';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         setCursor (textarea, 12);
         pressKey (textarea, 'O');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after O';
         var file = B.get ('currentFile');
         var expected = 'line one\n\nline two\nline three';
         if (file.content !== expected) {
            if (window.__vibeyViDebug) console.log ('[vi-debug] content after O ' + JSON.stringify ({expected: expected, actual: file.content}));
            return 'Content after O mismatch';
         }
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 9) return 'Expected cursor at pos 9 after O, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['Vi 21: o on last line without trailing newline', function (done) {
         var content = 'first\nsecond';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         setCursor (textarea, 8);
         pressKey (textarea, 'o');
         done (SHORT_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         var expected = 'first\nsecond\n';
         if (file.content !== expected) return 'Content after o on last line mismatch';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 13) return 'Expected cursor at pos 13 after o on last line, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['Vi 22: O on first line', function (done) {
         var content = 'alpha\nbeta';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         setCursor (textarea, 2);
         pressKey (textarea, 'O');
         done (SHORT_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         var expected = '\nalpha\nbeta';
         if (file.content !== expected) return 'Content after O on first line mismatch';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 0) return 'Expected cursor at pos 0 after O on first line, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['Vi 23: Disable vi mode', function (done) {
         if (B.get ('viMode')) B.call ('toggle', 'viMode');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return B.get ('viMode') === false || 'Expected viMode false after toggle off';
      }],

      ['Vi 24: Server persisted viMode false', function (done) {
         c.ajax ('get', 'settings', {}, '', function (error, rs) {
            window._f6SettingsAfter = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._f6SettingsAfter;
         if (! settings || ! settings.editor || settings.editor.viMode !== false) return 'Server settings do not reflect viMode false';
         return true;
      }],

      ['Vi 25: Delete project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f6Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {return true;}],

      ['Vi 26: Cleanup restore prompt', function () {
         restorePrompt ();
         return true;
      }],
      */

      // =============================================
      // *** SNAPSHOTS ***
      // =============================================

      ['Snapshots 1: Create project for snapshots', function (done) {
         window._f7Project = 'test-flow7-' + testTimestamp ();
         mockPrompt (window._f7Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f7Project || 'Failed to create flow #7 project';
      }],

      ['Snapshots 2: Write doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/main.md', {}, {content: '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 3: Write extra file doc/notes.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/notes.md', {}, {content: '# Notes\n\nSome extra notes.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 4: Create snapshot with label "before refactor"', function (done) {
         mockPrompt ('before refactor');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return true;
      }],

      ['Snapshots 5: Snapshot appears in list with label', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var found = dale.stopNot (snapshots, undefined, function (snap) {
            if (snap.project === window._f7Project) return snap;
         });
         if (! found) return 'Snapshot for project not found in list';
         if (found.label !== 'before refactor') return 'Snapshot label mismatch: ' + found.label;
         if (! found.id) return 'Snapshot missing id';
         if (type (found.fileCount) !== 'integer' || found.fileCount < 2) return 'Expected at least 2 files, got: ' + found.fileCount;
         window._f7SnapshotId = found.id;
         window._f7SnapshotProjectName = found.projectName;
         return true;
      }],

      ['Snapshots 6: Create second snapshot without label', function (done) {
         mockPrompt ('');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return true;
      }],

      ['Snapshots 7: Two snapshots in list ordered newest-first', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var ours = dale.fil (snapshots, undefined, function (snap) {
            if (snap.project === window._f7Project) return snap;
         });
         if (ours.length < 2) return 'Expected at least 2 snapshots, got: ' + ours.length;
         window._f7SnapshotId2 = ours [0].id !== window._f7SnapshotId ? ours [0].id : ours [1].id;
         if (ours [0].id !== window._f7SnapshotId2) return 'Expected newest snapshot first';
         return true;
      }],

      ['Snapshots 8: Download placeholder snapshot returns 404', function (done) {
         c.ajax ('get', 'snapshots/placeholder/download', {}, '', function (error) {
            window._f7DownloadMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7DownloadMissing !== 404) return 'Expected 404 for placeholder download, got ' + window._f7DownloadMissing;
         return true;
      }],

      ['Snapshots 9: Download first snapshot returns data', function (done) {
         c.ajax ('get', 'snapshots/' + encodeURIComponent (window._f7SnapshotId) + '/download', {}, '', function (error, rs) {
            window._f7DownloadError = error ? error.status : null;
            window._f7DownloadBody = rs && rs.body ? rs.body : '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7DownloadError) return 'Snapshot download failed: ' + window._f7DownloadError;
         if (! window._f7DownloadBody || window._f7DownloadBody.length === 0) return 'Snapshot download empty';
         return true;
      }],

      ['Snapshots 10: Restore snapshot as new project', function (done) {
         mockPrompt ('Restored Flow7 Test');
         B.call ('restore', 'snapshot', window._f7SnapshotId, window._f7SnapshotProjectName);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (! project) return 'No current project after restore';
         if (project === window._f7Project) return 'Still on original project after restore';
         window._f7RestoredProject = project;
         return true;
      }],

      ['Snapshots 11: Projects list includes restored project', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._f7ProjectList = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var projects = window._f7ProjectList || [];
         var found = dale.stopNot (projects, undefined, function (p) {
            if (p && p.name === 'Restored Flow7 Test') return p;
         });
         if (! found) return 'Restored project not found in projects list';
         return true;
      }],

      ['Snapshots 12: Restored project has both files', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/files', {}, '', function (error, rs) {
            window._f7RestoredFiles = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var files = window._f7RestoredFiles;
         if (type (files) !== 'array') return 'Expected files array';
         if (! inc (files, 'doc/main.md')) return 'Restored project missing doc/main.md';
         if (! inc (files, 'doc/notes.md')) return 'Restored project missing doc/notes.md';
         return true;
      }],

      ['Snapshots 13: Restored doc/main.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7RestoredContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored doc/main.md content mismatch';
         return true;
      }],

      ['Snapshots 14: Restored doc/notes.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/notes.md', {}, '', function (error, rs) {
            window._f7RestoredNotes = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredNotes !== '# Notes\n\nSome extra notes.\n') return 'Restored notes.md content mismatch';
         return true;
      }],

      ['Snapshots 15: Modify original project doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 16: Restored project unaffected by original modification', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7CheckContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7CheckContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored content was affected by original modification!';
         return true;
      }],

      ['Snapshots 17: Delete second snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._f7SnapshotId2);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 18: Deleted snapshot gone from list', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var ids = dale.go (snapshots, function (snap) {return snap.id;});
         if (inc (ids, window._f7SnapshotId2)) return 'Deleted snapshot still in list';
         if (! inc (ids, window._f7SnapshotId)) return 'First snapshot should still exist';
         return true;
      }],

      ['Snapshots 19: Delete original project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 20: Snapshot still in list after project deletion', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var found = dale.stopNot (snapshots, undefined, function (snap) {
            if (snap.id === window._f7SnapshotId) return snap;
         });
         if (! found) return 'Snapshot disappeared after project deletion';
         return true;
      }],

      ['Snapshots 21: Delete nonexistent snapshot returns 400', function (done) {
         c.ajax ('delete', 'snapshots/nonexistent-id-12345', {}, '', function (error) {
            window._f7DeleteMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7DeleteMissing !== 400) return 'Expected 400 for nonexistent snapshot delete, got ' + window._f7DeleteMissing;
         return true;
      }],

      ['Snapshots 22: Download nonexistent snapshot returns 404', function (done) {
         c.ajax ('get', 'snapshots/nonexistent-id-12345/download', {}, '', function (error) {
            window._f7DownloadMissing2 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7DownloadMissing2 !== 404) return 'Expected 404 for nonexistent snapshot download, got ' + window._f7DownloadMissing2;
         return true;
      }],

      ['Snapshots 23: Delete restored project', function (done) {
         if (! window._f7RestoredProject) return done ();
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7RestoredProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 24: Delete first snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._f7SnapshotId);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 25: No snapshots left for this flow', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var ours = dale.fil (snapshots, undefined, function (snap) {
            if (snap.project === window._f7Project) return snap;
         });
         if (ours.length > 0) return 'Leftover snapshots from flow7: ' + ours.length;
         return true;
      }],



   ];

   var SUITE_ORDER = ['project', 'dialog', 'docs', 'uploads', 'dialog (safety)', 'static', 'backend', 'vi', 'snapshots'];

   var filterValue = flowFilter.toLowerCase ().trim ();

   var testsBySuite = dale.acc (allTests, {}, function (acc, test) {
      var suite = testFlow (test [0]);
      if (! acc [suite]) acc [suite] = [];
      acc [suite].push (test);
      return acc;
   });

   var filteredTests = [];

   if (filterValue === 'all') {
      dale.go (SUITE_ORDER, function (suite) {
         if (testsBySuite [suite]) filteredTests = filteredTests.concat (testsBySuite [suite]);
      });
      dale.go (testsBySuite, function (tests, suite) {
         if (! inc (SUITE_ORDER, suite)) filteredTests = filteredTests.concat (tests);
      });
   }
   else {
      filteredTests = testsBySuite [filterValue] || [];
   }

   if (filteredTests.length === 0) {
      alert ('❌ No tests found for suite: ' + flowFilter);
      return;
   }

   console.log ('Running ' + filteredTests.length + ' tests (suite: ' + flowFilter + ')');

   c.test (filteredTests, function (error, time) {
      var label = filterValue === 'all' ? 'all suites' : flowFilter;
      if (error) {
         console.error ('❌ Test FAILED:', error.test, '— Result:', error.result);
         alert ('❌ Test FAILED: ' + error.test + '\n\nResult: ' + error.result);
      }
      else {
         console.log ('✅ All tests passed! (' + label + ', ' + time + 'ms)');
         alert ('✅ All tests passed! (' + label + ', ' + time + 'ms)');
      }
   });

})();
