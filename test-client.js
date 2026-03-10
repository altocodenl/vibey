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
         if (options.stopOnAnyEvent) {
            finish ({error: null, events: events});
            return;
         }
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
   var TEST_PROJECT = 'test-dialog-' + testTimestamp ();
   var TEST_DIALOG  = 'dialog-read-vibey';

   // *** TESTS ***

   // Suite filter: set by client.js prompt or puppeteer CLI arg.
   // 'ALL' runs everything; use suite name (dialog, docs, uploads, snapshots, static, backend, vi).
   // Suite order matches readme.md test suites section.
   var suiteFilter = (window._vibeyTestFlow || 'ALL').toUpperCase ();

   // Extract suite name from test tag: "Dialog: ..." → "dialog", "Docs: ..." → "docs", etc.
   var testSuite = function (name) {
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

      ['Dialog 2: Create project via prompt and navigate into it', function (done) {
         mockPrompt (TEST_PROJECT);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (! project) return 'currentProject not set after creation';
         window._dialogProjectSlug = project;
         window._dialogProjectName = TEST_PROJECT;
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected docs tab after project creation, got "' + tab + '"';
         return true;
      }],

      ['Dialog 3: Create dialog draft (dialog/new)', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/new', {}, {
            provider: 'openai',
            model: 'gpt-5.2-codex',
            slug: TEST_DIALOG
         }, function (error, rs) {
            window._dialogDialogDraft = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogDraft || {};
         if (result.error) return 'Dialog draft creation failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (! body.dialogId) return 'Missing dialogId in dialog/new response';
         if (! body.filename || body.filename.indexOf ('-done.md') === -1) return 'Expected done filename, got ' + body.filename;
         if (body.provider !== 'openai') return 'Expected provider openai, got ' + body.provider;
         if (body.model !== 'gpt-5.2-codex') return 'Expected model gpt-5.2-codex, got ' + body.model;
         if (body.status !== 'done') return 'Expected status done, got ' + body.status;
         window._dialogDialogId = body.dialogId;
         return true;
      }],

      ['Dialog 4: Dialog draft listed in /dialogs', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialogs', {}, '', function (error, rs) {
            window._dialogDialogsList = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogsList || {};
         if (result.error) return 'Dialog list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         var found = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._dialogDialogId && d.status === 'done') return d;
         });
         if (! found) return 'Dialog draft not found in list';
         return true;
      }],

      ['Dialog 5: Seed test-sample.txt via tool/execute', function (done) {
         var content = '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/tool/execute', {}, {
            toolName: 'write_file',
            toolInput: {path: 'test-sample.txt', content: content}
         }, function (error, rs) {
            window._dialogToolSeed = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._dialogToolSeed && window._dialogToolSeed.error) return 'Tool seed failed';
         return true;
      }],

      ['Dialog 6: PUT dialog prompt with run_command', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogDialogId,
            prompt: 'Use the run_command tool to run `cat test-sample.txt`. Reply with its line count only.'
         }, function (error, rs) {
            window._dialogDialogStart = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogStart || {};
         if (result.error) return 'Dialog start failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (! body.dialogId) return 'Missing dialogId in PUT dialog response';
         if (! body.filename) return 'Missing filename in PUT dialog response';
         if (body.status !== 'active') return 'Expected active status, got ' + body.status;
         return true;
      }],

      ['Dialog 7: Stream dialog until done and verify context event', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogId, function (result) {
            window._dialogStream1 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         var result = window._dialogStream1 || {};
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
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/' + encodeURIComponent (window._dialogDialogId), {}, '', function (error, rs) {
            window._dialogDialogLoad = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogLoad || {};
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
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogDialogId,
            prompt: 'Use write_file to create dummy.js with this exact content: console.log("hello from dummy");\nDo only this one tool call, nothing else.'
         }, function (error, rs) {
            window._dialogDialogDummy = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogDummy || {};
         if (result.error) return 'Dialog dummy prompt failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (body.status !== 'active') return 'Expected active status for dummy.js prompt';
         return true;
      }],

      ['Dialog 10: Stream dummy.js prompt until done', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogId, function (result) {
            window._dialogStream2 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._dialogStream2 && window._dialogStream2.error) return 'Stream failed: ' + window._dialogStream2.error;
         return true;
      }],

      ['Dialog 11: Dialog markdown has write_file tool blocks', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/' + encodeURIComponent (window._dialogDialogId), {}, '', function (error, rs) {
            window._dialogDialogLoad2 = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogLoad2 || {};
         if (result.error) return 'Dialog fetch failed';
         var md = result.rs && result.rs.body ? result.rs.body.markdown : '';
         if (md.indexOf ('write_file') === -1) return 'Missing write_file in dialog markdown';
         var hasToolRequest = md.indexOf ('## Tool Request') !== -1 || md.indexOf ('Tool request:') !== -1;
         var hasToolResult = md.indexOf ('## Tool Result') !== -1 || md.indexOf ('Result:') !== -1;
         if (! hasToolRequest || ! hasToolResult) return 'Missing tool request/result blocks';
         return true;
      }],

      ['Dialog 12: run_command cat dummy.js shows console.log', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/tool/execute', {}, {
            toolName: 'run_command',
            toolInput: {command: 'cat dummy.js'}
         }, function (error, rs) {
            window._dialogDummyCat = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDummyCat || {};
         if (result.error) return 'cat dummy.js failed';
         var stdout = result.rs && result.rs.body ? result.rs.body.stdout : '';
         if (stdout.indexOf ('hello from dummy') === -1 && stdout.indexOf ('console.log') === -1) return 'dummy.js content missing console.log';
         return true;
      }],

      ['Dialog 13: Continue dialog without provider field', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogDialogId,
            prompt: 'Reply with the single word: ok'
         }, function (error, rs) {
            window._dialogDialogContinue = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogContinue || {};
         if (result.error) return 'Dialog continue failed';
         return true;
      }],

      ['Dialog 14: Stream continuation until done', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogId, function (result) {
            window._dialogStream3 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._dialogStream3 && window._dialogStream3.error) return 'Stream failed: ' + window._dialogStream3.error;
         return true;
      }],

      ['Dialog 15: Prompt repeat previous assistant message', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogDialogId,
            prompt: "Repeat your previous assistant message verbatim; if any line starts with '>' include it."
         }, function (error, rs) {
            window._dialogDialogRepeat = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogRepeat || {};
         if (result.error) return 'Dialog repeat failed';
         return true;
      }],

      ['Dialog 16: Stream repeat and verify no headers in output', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogId, function (result) {
            window._dialogStream4 = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         var result = window._dialogStream4 || {};
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
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            provider: 'openai',
            model: 'gpt-5.2-codex',
            prompt: 'Use the run_command tool to run `cat test-sample.txt`. Reply with its first line only.',
            slug: 'async-test'
         }, function (error, rs) {
            window._dialogDialogAsync = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogAsync || {};
         if (result.error) return 'Async dialog POST failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         if (body.status !== 'active') return 'Expected async dialog status active';
         window._dialogDialogAsyncId = body.dialogId;
         return true;
      }],

      ['Dialog 18: Stream async dialog until done', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogAsyncId, function (result) {
            window._dialogStreamAsync = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: LONG_WAIT});
      }, function () {
         if (window._dialogStreamAsync && window._dialogStreamAsync.error) return 'Async stream failed: ' + window._dialogStreamAsync.error;
         return true;
      }],

      ['Dialog 19: Async dialog markdown has run_command tool blocks', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/' + encodeURIComponent (window._dialogDialogAsyncId), {}, '', function (error, rs) {
            window._dialogDialogAsyncLoad = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogAsyncLoad || {};
         if (result.error) return 'Async dialog fetch failed';
         var md = result.rs && result.rs.body ? result.rs.body.markdown : '';
         if (md.indexOf ('run_command') === -1) return 'Missing run_command in async dialog';
         var hasToolRequest = md.indexOf ('## Tool Request') !== -1 || md.indexOf ('Tool request:') !== -1;
         var hasToolResult = md.indexOf ('## Tool Result') !== -1 || md.indexOf ('Result:') !== -1;
         if (! hasToolRequest || ! hasToolResult) return 'Missing tool request/result blocks in async dialog';
         return true;
      }],

      ['Dialog 20: Stream done dialog returns done immediately (no chunks)', function (done) {
         streamDialogEvents (window._dialogProjectSlug, window._dialogDialogAsyncId, function (result) {
            window._dialogStreamAsyncDone = result;
            done (SHORT_WAIT, POLL);
         }, {timeout: SHORT_WAIT});
      }, function () {
         var result = window._dialogStreamAsyncDone;
         if (! result) return 'Missing done stream result';
         if (result.error) return 'Stream error: ' + result.error;
         var doneEvents = dale.fil (result.events || [], undefined, function (ev) {
            if (ev.type === 'done') return ev;
         });
         if (! doneEvents.length) return 'Expected immediate done event for finished dialog';
         var chunks = dale.fil (result.events || [], undefined, function (ev) {
            if (ev.type === 'chunk') return ev;
         });
         if (chunks.length > 0) return 'Expected no chunk events for finished dialog, got ' + chunks.length;
         return true;
      }],

      ['Dialog 21: Create dialog agent-a', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-a'}, function (error, rs) {
            window._dialogAgentA = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogAgentA || {};
         if (result.error) return 'Agent-a creation failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         window._dialogAgentADialog = body.dialogId || null;
         if (! window._dialogAgentADialog) return 'Missing dialogId for agent-a';
         if (body.status !== 'done') return 'Expected agent-a draft status done, got ' + body.status;
         if (! body.filename || body.filename.indexOf ('-done.md') === -1) return 'Expected agent-a filename ending -done.md, got ' + body.filename;
         return true;
      }],

      ['Dialog 22: Create dialog agent-b', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5.2-codex', slug: 'agent-b'}, function (error, rs) {
            window._dialogAgentB = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogAgentB || {};
         if (result.error) return 'Agent-b creation failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         window._dialogAgentBDialog = body.dialogId || null;
         if (! window._dialogAgentBDialog) return 'Missing dialogId for agent-b';
         if (body.status !== 'done') return 'Expected agent-b draft status done, got ' + body.status;
         if (! body.filename || body.filename.indexOf ('-done.md') === -1) return 'Expected agent-b filename ending -done.md, got ' + body.filename;
         return true;
      }],

      ['Dialog 23: Fire agent-a and agent-b with slow prompts', function (done) {
         var project = encodeURIComponent (window._dialogProjectSlug);
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._dialogAgentADialog, prompt: 'Use the run_command tool to run `sleep 6 && echo still-running`. After it completes, reply with the single word: finished'})}).catch (function () {});
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._dialogAgentBDialog, prompt: 'Use the run_command tool to run `sleep 6 && echo still-running`. After it completes, reply with the single word: finished'})}).catch (function () {});
         done (2000, POLL);
      }, function () {return true;}],

      ['Dialog 24: Agent-a active state rejects conflicting continue (409)', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._dialogAgentAStatusRequested) {
            window._dialogAgentAStatusRequested = true;
            c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialogs', {}, '', function (error, rs) {
               window._dialogAgentAStatusRequested = false;
               window._dialogAgentADialogs = error ? null : (rs.body || []);
            });
            return 'Polling dialog statuses...';
         }
         var list = window._dialogAgentADialogs || [];
         var active = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._dialogAgentADialog && d.status === 'active' && d.filename && d.filename.indexOf ('-active.md') !== -1) return d;
         });
         if (! active) return 'Waiting for agent-a to become active...';
         if (window._dialogAgentAReject === 409) {
            window._dialogAgentAActiveObserved = true;
            return true;
         }
         if (window._dialogAgentARejectRequestInFlight) return 'Waiting for 409 from agent-a...';
         window._dialogAgentARejectRequestInFlight = true;
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogAgentADialog,
            prompt: 'This should be rejected while active'
         }, function (error, rs) {
            window._dialogAgentARejectRequestInFlight = false;
            window._dialogAgentAReject = error ? error.status : (rs && rs.xhr ? rs.xhr.status : null);
         });
         return 'Attempting conflicting continue...';
      }],

      ['Dialog 25: Stream agent-b and verify stream is live', function (done) {
         window._dialogAgentBHasEvents = false;
         console.log ('[vibey-test] streaming agent-b: ' + window._dialogAgentBDialog);
         streamDialogEvents (window._dialogProjectSlug, window._dialogAgentBDialog, function (result) {
            window._dialogAgentBStreamResult = result;
            console.log ('[vibey-test] agent-b stream complete error=' + (result && result.error ? result.error : 'none') + ' events=' + ((result && result.events) ? result.events.length : 0));
            done (SHORT_WAIT, POLL);
         }, {
            timeout: LONG_WAIT,
            stopOnAnyEvent: true,
            onEvent: function (ev) {
               if (ev && ev.type) console.log ('[vibey-test] agent-b event ' + ev.type);
               if (ev && ev.type && ! window._dialogAgentBHasEvents) window._dialogAgentBHasEvents = true;
            }
         });
      }, function () {
         if (! window._dialogAgentBHasEvents) return 'No stream events received for agent-b';
         return true;
      }],

      ['Dialog 26: Active status was observed before stop', function () {
         if (! window._dialogAgentAActiveObserved) return 'Active status was never observed';
         return true;
      }],

      ['Dialog 27: Stop agent-a via status done', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogAgentADialog,
            status: 'done'
         }, function (error, rs) {
            window._dialogAgentAStop = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogAgentAStop || {};
         if (result.error) return 'Stopping agent-a failed';
         return true;
      }],

      ['Dialog 28: Agent-a becomes done after active observed', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._dialogAgentAActiveObserved) return 'Active state was not observed before done';
         if (! window._dialogAgentADoneRequested) {
            window._dialogAgentADoneRequested = true;
            console.log ('[vibey-test] polling agent-a done');
            c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialogs', {}, '', function (error, rs) {
               window._dialogAgentADoneRequested = false;
               window._dialogAgentADialogs = error ? null : (rs.body || []);
            });
            return 'Polling dialog statuses...';
         }
         var list = window._dialogAgentADialogs || [];
         var found = dale.stopNot (list, undefined, function (d) {
            if (d.dialogId === window._dialogAgentADialog && d.status === 'done' && d.filename && d.filename.indexOf ('-done.md') !== -1) return d;
         });
         if (! found) return 'Waiting for agent-a to become done...';
         return true;
      }],

      ['Dialog 29: Concurrent PUT race on done agent-a — one 200, one 409', function (done) {
         var project = encodeURIComponent (window._dialogProjectSlug);
         var dialogId = window._dialogAgentADialog;
         window._dialogConcurrentResults = [];
         window._dialogConcurrentDone = 0;

         var onResult = function () {
            window._dialogConcurrentDone++;
            if (window._dialogConcurrentDone >= 2) done (SHORT_WAIT, POLL);
         };

         fetch ('project/' + project + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({dialogId: dialogId, prompt: 'Concurrent race prompt A: reply with the single word alpha'})
         }).then (function (res) {
            return res.json ().then (function (body) {
               window._dialogConcurrentResults.push ({code: res.status, body: body});
               onResult ();
            });
         }).catch (function () { onResult (); });

         fetch ('project/' + project + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({dialogId: dialogId, prompt: 'Concurrent race prompt B: reply with the single word beta'})
         }).then (function (res) {
            return res.json ().then (function (body) {
               window._dialogConcurrentResults.push ({code: res.status, body: body});
               onResult ();
            });
         }).catch (function () { onResult (); });
      }, function () {
         var results = window._dialogConcurrentResults || [];
         if (results.length < 2) return 'Expected 2 results, got ' + results.length;
         var codes = dale.go (results, function (r) {return r.code;}).sort ();
         if (codes [0] !== 200 || codes [1] !== 409) return 'Expected one 200 and one 409, got ' + codes.join (' and ');
         var winner = dale.stopNot (results, undefined, function (r) {if (r.code === 200) return r;});
         if (! winner || ! winner.body || winner.body.status !== 'active') return 'Winner should have status active';
         var loser = dale.stopNot (results, undefined, function (r) {if (r.code === 409) return r;});
         if (! loser || ! loser.body || ! loser.body.error) return 'Loser should have error payload';
         return true;
      }],

      ['Dialog 30: Stop agent-a after concurrent race', function (done) {
         c.ajax ('put', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialog', {}, {
            dialogId: window._dialogAgentADialog,
            status: 'done'
         }, function (error, rs) {
            window._dialogAgentARaceStop = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogAgentARaceStop || {};
         if (result.error) return 'Stopping agent-a after race failed';
         return true;
      }],

      ['Dialog 31: Delete project while agent-b active', function (done) {
         c.ajax ('delete', 'projects/' + encodeURIComponent (window._dialogProjectSlug), {}, '', function (error, rs) {
            window._dialogDeleteWhileActive = {error: error, rs: rs};
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDeleteWhileActive || {};
         if (result.error) return 'Delete project while agent-b active failed';
         var status = result.rs && result.rs.xhr ? result.rs.xhr.status : null;
         if (status !== 200) return 'Expected 200 on delete, got ' + status;
         return true;
      }],

      ['Dialog 32: Project gone from /projects list', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._dialogProjectList = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var list = window._dialogProjectList || [];
         var found = dale.stopNot (list, undefined, function (p) {
            if (p && p.slug === window._dialogProjectSlug) return p;
         });
         if (found) return 'Project still listed after deletion';
         return true;
      }],

      ['Dialog 33: /dialogs returns 404 after deletion', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialogs', {}, '', function (error) {
            window._dialogDialogsMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._dialogDialogsMissing !== 404) return 'Expected 404 for dialogs after deletion, got ' + window._dialogDialogsMissing;
         return true;
      }],

      ['Dialog 34: /files returns 404 after deletion', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/files', {}, '', function (error) {
            window._dialogFilesMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._dialogFilesMissing !== 404) return 'Expected 404 for files after deletion, got ' + window._dialogFilesMissing;
         return true;
      }],

      ['Dialog 35: Recreate project with same name', function (done) {
         c.ajax ('post', 'projects', {}, {name: TEST_PROJECT}, function (error, rs) {
            window._dialogProjectRecreate = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogProjectRecreate || {};
         if (result.error) return 'Project recreate failed';
         var body = result.rs && result.rs.body ? result.rs.body : {};
         window._dialogProjectSlug = body.slug || window._dialogProjectSlug;
         return true;
      }],

      ['Dialog 36: /dialogs returns empty array', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/dialogs', {}, '', function (error, rs) {
            window._dialogDialogsEmpty = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogDialogsEmpty || {};
         if (result.error) return 'Dialogs list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         if (list.length !== 0) return 'Expected empty dialogs list, got ' + list.length;
         return true;
      }],

      ['Dialog 37: /files returns only doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._dialogProjectSlug) + '/files', {}, '', function (error, rs) {
            window._dialogFilesList = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._dialogFilesList || {};
         if (result.error) return 'Files list failed';
         var list = result.rs && result.rs.body ? result.rs.body : [];
         if (list.length !== 1 || list [0] !== 'doc/main.md') return 'Expected only doc/main.md, got ' + JSON.stringify (list);
         return true;
      }],

      ['Dialog 38: Delete recreated project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._dialogProjectSlug);
         done (MEDIUM_WAIT, POLL);
      }, function () {return true;}],

      ['Dialog 39: Project gone after cleanup', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._dialogProjectList2 = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var list = window._dialogProjectList2 || [];
         var found = dale.stopNot (list, undefined, function (p) {
            if (p && p.slug === window._dialogProjectSlug) return p;
         });
         if (found) return 'Project still listed after cleanup deletion';
         return true;
      }],

      // =============================================
      // *** DOCS ***
      // =============================================

      ['Docs 1: Create project for docs editing', function (done) {
         window._docsProject = 'test-docs-' + testTimestamp ();
         mockPrompt (window._docsProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (project !== window._docsProject) return 'Expected project "' + window._docsProject + '", got "' + project + '"';
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
         window._docsMainContent = file.content;
         return true;
      }],

      ['Docs 3: Reload main.md and verify round-trip', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after reload';
         if (file.content !== window._docsMainContent) return 'main.md content mismatch after reload';
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
         var project = window._docsProject;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent ('bad..name.md'), {}, {
            content: 'bad'
         }, function (error, rs) {
            window._docsBadNameError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (! window._docsBadNameError) return 'Expected error for bad..name.md';
         return true;
      }],

      ['Docs 15: Invalid filename bad.txt returns 400', function (done) {
         var project = window._docsProject;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent ('bad.txt'), {}, {
            content: 'bad'
         }, function (error, rs) {
            window._docsBadTxtError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (! window._docsBadTxtError) return 'Expected error for bad.txt';
         return true;
      }],

      ['Docs 16: Special filenames round-trip (spaces, accents, non-Latin)', function (done) {
         var project = window._docsProject;
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
               if (error) { window._docsSpecialError = filename + ':write'; return done (SHORT_WAIT, POLL); }
               c.ajax ('get', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error2, rs2) {
                  if (error2 || ! rs2.body || rs2.body.content !== content) { window._docsSpecialError = filename + ':read'; return done (SHORT_WAIT, POLL); }
                  c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error3, rs3) {
                     var listed = rs3 && rs3.body ? rs3.body : [];
                     if (error3 || listed.indexOf (filename) === -1) { window._docsSpecialError = filename + ':list'; return done (SHORT_WAIT, POLL); }
                     c.ajax ('delete', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error4) {
                        if (error4) { window._docsSpecialError = filename + ':delete'; return done (SHORT_WAIT, POLL); }
                        c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error5, rs5) {
                           var listedAfter = rs5 && rs5.body ? rs5.body : [];
                           if (error5 || listedAfter.indexOf (filename) !== -1) { window._docsSpecialError = filename + ':gone'; return done (SHORT_WAIT, POLL); }
                           run (index + 1);
                        });
                     });
                  });
               });
            });
         };

         window._docsSpecialError = null;
         run (0);
      }, function () {
         if (window._docsSpecialError) return 'Special filename round-trip failed at ' + window._docsSpecialError;
         return true;
      }],

      ['Docs 17: Nested path round-trip: doc/nested/plan.md', function (done) {
         var project = window._docsProject;
         var filename = 'doc/nested/plan.md';
         var content = '# plan\n\nNested.\n';
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, {content: content}, function (error) {
            if (error) { window._docsNestedError = 'write'; return done (SHORT_WAIT, POLL); }
            c.ajax ('get', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error2, rs2) {
               if (error2 || ! rs2.body || rs2.body.content !== content) { window._docsNestedError = 'read'; return done (SHORT_WAIT, POLL); }
               c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error3, rs3) {
                  var files = rs3 && rs3.body ? rs3.body : [];
                  if (error3 || files.indexOf (filename) === -1) { window._docsNestedError = 'list'; return done (SHORT_WAIT, POLL); }
                  c.ajax ('delete', 'project/' + encodeURIComponent (project) + '/file/' + encodeURIComponent (filename), {}, '', function (error4) {
                     if (error4) { window._docsNestedError = 'delete'; return done (SHORT_WAIT, POLL); }
                     c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error5, rs5) {
                        var files2 = rs5 && rs5.body ? rs5.body : [];
                        if (error5 || files2.indexOf (filename) !== -1) window._docsNestedError = 'gone';
                        else window._docsNestedError = null;
                        done (SHORT_WAIT, POLL);
                     });
                  });
               });
            });
         });
      }, function () {
         if (window._docsNestedError) return 'Nested file (plan.md) failed at step: ' + window._docsNestedError;
         return true;
      }],

      ['Docs 18: Delete docs project via UI', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._docsProject);
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
         var item = findByText ('.file-name', window._docsProject);
         if (item) return 'Deleted docs project still appears in projects list';
         return true;
      }],

      // =============================================
      // *** UPLOADS ***
      // =============================================

      ['Uploads 1: Create project for uploads', function (done) {
         window._uploadsProject = 'test-uploads-' + testTimestamp ();
         mockPrompt (window._uploadsProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._uploadsProject || 'Failed to create uploads project';
      }],

      ['Uploads 2: Upload test-image.png via data URL', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'test-image.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._uploadsUploadImage = rs && rs.body;
            window._uploadsUploadImageError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsUploadImageError) return 'Image upload failed: ' + window._uploadsUploadImageError;
         var entry = window._uploadsUploadImage || {};
         if (entry.name !== 'test-image.png') return 'Upload response missing test-image.png';
         if (! entry.url) return 'Upload response missing url';
         return true;
      }],

      ['Uploads 3: Uploads list includes test-image.png metadata', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/uploads', {}, '', function (error, rs) {
            window._uploadsUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._uploadsUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'test-image.png') return item; });
         if (! image) return 'test-image.png not found in uploads list';
         if (! image.size || image.size <= 0) return 'test-image.png size invalid';
         if (! image.contentType || image.contentType.indexOf ('image/') !== 0) return 'test-image.png contentType invalid: ' + image.contentType;
         window._uploadsUploadImage = image;
         return true;
      }],

      ['Uploads 4: Fetch test-image.png bytes', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload/test-image.png', {}, '', function (error, rs) {
            window._uploadsUploadFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._uploadsUploadFetch || {};
         if (result.error) return 'Upload fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for test-image.png, got ' + status;
         var body = rs.body || '';
         if (! body || body.length === 0) return 'Upload fetch returned empty body';
         return true;
      }],

      ['Uploads 5: test-image.png content-type is image/png', function () {
         var rs = (window._uploadsUploadFetch || {}).rs || {};
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('image/png') === -1) return 'Expected image/png content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 6: Upload notes.txt via API', function (done) {
         var text = 'Hello from uploads test!';
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'notes.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._uploadsUploadText = rs && rs.body;
            window._uploadsUploadTextError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsUploadTextError) return 'Text upload failed: ' + window._uploadsUploadTextError;
         var entry = window._uploadsUploadText || {};
         if (entry.name !== 'notes.txt') return 'Upload response missing notes.txt';
         return true;
      }],

      ['Uploads 7: Uploads list includes test-image.png + notes.txt', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/uploads', {}, '', function (error, rs) {
            window._uploadsUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._uploadsUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'test-image.png') return item; });
         if (! image) return 'test-image.png not found in uploads list';
         var text = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'notes.txt') return item; });
         if (! text) return 'notes.txt not found in uploads list';
         return true;
      }],

      ['Uploads 8: Fetch notes.txt and verify content-type', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload/notes.txt', {}, '', function (error, rs) {
            window._uploadsNotesFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._uploadsNotesFetch || {};
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
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'my screenshot 2026.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._uploadsUploadScreenshot = rs && rs.body;
            window._uploadsUploadScreenshotError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsUploadScreenshotError) return 'Screenshot upload failed: ' + window._uploadsUploadScreenshotError;
         return true;
      }],

      ['Uploads 10: Uploads list includes my screenshot 2026.png', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/uploads', {}, '', function (error, rs) {
            window._uploadsUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._uploadsUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var screenshot = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'my screenshot 2026.png') return item; });
         if (! screenshot) return 'my screenshot 2026.png not found in uploads list';
         return true;
      }],

      ['Uploads 11: Fetch spaced filename upload returns image/png', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload/' + encodeURIComponent ('my screenshot 2026.png'), {}, '', function (error, rs) {
            window._uploadsSpaceFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._uploadsSpaceFetch || {};
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
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'my-file.v2.backup.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._uploadsUploadBackupError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsUploadBackupError) return 'Backup upload failed: ' + window._uploadsUploadBackupError;
         return true;
      }],

      ['Uploads 13: Invalid upload name ../etc/passwd returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: '../etc/passwd',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._uploadsInvalid1 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsInvalid1 !== 400) return 'Expected 400 for ../etc/passwd, got ' + window._uploadsInvalid1;
         return true;
      }],

      ['Uploads 14: Invalid upload name sub\\file.txt returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'sub\\file.txt',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._uploadsInvalid2 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsInvalid2 !== 400) return 'Expected 400 for sub\\file.txt, got ' + window._uploadsInvalid2;
         return true;
      }],

      ['Uploads 15: Invalid upload name /absolute.txt returns 400', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: '/absolute.txt',
            content: btoa ('bad'),
            contentType: 'text/plain'
         }, function (error) {
            window._uploadsInvalid3 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsInvalid3 !== 400) return 'Expected 400 for /absolute.txt, got ' + window._uploadsInvalid3;
         return true;
      }],

      ['Uploads 16: Upload nested/evil.png (subdir allowed)', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload', {}, {
            name: 'nested/evil.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._uploadsUploadNestedError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsUploadNestedError) return 'Nested upload failed: ' + window._uploadsUploadNestedError;
         return true;
      }],

      ['Uploads 17: Uploads list contains exactly 5 valid entries', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/uploads', {}, '', function (error, rs) {
            window._uploadsUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._uploadsUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         if (uploads.length !== 5) return 'Expected exactly 5 uploads, got ' + uploads.length;
         var names = dale.go (uploads, function (u) { return u.name; });
         var expected = ['test-image.png', 'notes.txt', 'my screenshot 2026.png', 'my-file.v2.backup.txt', 'nested/evil.png'];
         var missing = dale.stopNot (expected, undefined, function (name) { if (names.indexOf (name) === -1) return name; });
         if (missing) return 'Uploads list missing ' + missing;
         return true;
      }],

      ['Uploads 18: Fetch nonexistent upload returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._uploadsProject) + '/upload/nonexistent.png', {}, '', function (error, rs) {
            window._uploadsMissingStatus = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._uploadsMissingStatus !== 404) return 'Expected 404 for nonexistent.png, got ' + window._uploadsMissingStatus;
         return true;
      }],

      ['Uploads 19: Delete uploads project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._uploadsProject);
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
         var item = findByText ('.file-name', window._uploadsProject);
         if (item) return 'Deleted uploads project still appears in projects list';
         return true;
      }],

      // =============================================
      // *** STATIC APP ***
      // =============================================

      ['Static 1: Create project', function (done) {
         window._staticAppProject = 'test-static-app-' + testTimestamp ();
         mockPrompt (window._staticAppProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._staticAppProject || 'Failed to create static app project';
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
         c.ajax ('post', 'project/' + encodeURIComponent (window._staticAppProject) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Static 3: Create dialog draft (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._staticAppProject) + '/dialogs');
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
            window._staticAppFireError = 'Could not determine dialogId for orchestrator';
            return done (SHORT_WAIT, POLL);
         }
         window._staticAppFireError = null;
         fetch ('project/' + encodeURIComponent (window._staticAppProject) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({
               dialogId: parsed.dialogId,
               prompt: 'Please start. Read doc/main.md once, then implement immediately: create index.html and app.js in /workspace root. Do not re-fetch docs after the first read. After creating files, update doc/main.md with an embed block (port static, title Tictactoe, height 500).'
            })
         }).catch (function (error) {
            window._staticAppFireError = 'Failed to fire dialog: ' + (error && error.message ? error.message : String (error));
         });
         done (SHORT_WAIT, POLL);
      }, function () {
         return window._staticAppFireError ? window._staticAppFireError : true;
      }],

      ['Static 5: Poll until static page serves', function (done) {
         window._staticAppStaticPollError = null;
         var started = Date.now ();
         var attempt = function () {
            var elapsed = Date.now () - started;
            if (elapsed > 300000) {
               window._staticAppStaticPollError = 'Timed out after 5 minutes waiting for static page';
               return done (SHORT_WAIT, POLL);
            }
            console.log ('[Static poll] waiting for /static/ ... ' + Math.round (elapsed / 1000) + 's');
            c.ajax ('get', 'project/' + encodeURIComponent (window._staticAppProject) + '/static/', {}, '', function (error, rs) {
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
         return window._staticAppStaticPollError ? window._staticAppStaticPollError : true;
      }],

      ['Static 6: index.html has React + app.js', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._staticAppProject) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._staticAppIndexError = 'cat index.html failed';
            else {
               var out = (rs.body.stdout || '').toLowerCase ();
               if (out.indexOf ('react') === -1) window._staticAppIndexError = 'index.html missing React reference';
               else if (out.indexOf ('app.js') === -1) window._staticAppIndexError = 'index.html missing app.js reference';
               else window._staticAppIndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._staticAppIndexError ? window._staticAppIndexError : true;
      }],

      ['Static 7: app.js has tictactoe logic', function (done) {
         window._staticAppAppError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._staticAppAppError = 'Timed out waiting for static/app.js with game logic';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._staticAppProject) + '/static/app.js', {}, '', function (error, rs) {
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
         return window._staticAppAppError ? window._staticAppAppError : true;
      }],

      ['Static 8: Poll until embed block appears in doc/main.md', function (done) {
         window._staticAppEmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            var elapsed = Date.now () - started;
            if (elapsed > 300000) {
               window._staticAppEmbedPollError = 'Timed out after 5 minutes waiting for static embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            console.log ('[Static poll] waiting for embed block ... ' + Math.round (elapsed / 1000) + 's');
            c.ajax ('get', 'project/' + encodeURIComponent (window._staticAppProject) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._staticAppEmbedPollError ? window._staticAppEmbedPollError : true;
      }],

      ['Static 9: Verify embed block in doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._staticAppProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._staticAppEmbedContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var content = window._staticAppEmbedContent || '';
         if (content.indexOf ('əəəembed') === -1) return 'doc/main.md missing əəəembed block';
         if (content.indexOf ('port static') === -1) return 'doc/main.md embed missing port static';
         return true;
      }],

      // NOTE: Project is intentionally NOT deleted so the tictactoe embed remains playable

      // =============================================
      // *** APP WITH BACKEND ***
      // =============================================

      ['Backend 1: Create project', function (done) {
         window._backendAppProject = 'test-backend-app-' + testTimestamp ();
         mockPrompt (window._backendAppProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._backendAppProject || 'Failed to create backend app project';
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
            '- Before running the server, install Express in `/workspace` with npm (for example `npm init -y || true` and `npm install express`).',
            '- `index.html`: load React, ReactDOM, and Babel standalone from CDN (unpkg or cdnjs).',
            '  Include `<script src="app.js" type="text/babel"></script>` so JSX works.',
            '- `app.js`: a simple React tictactoe with a 3x3 grid of buttons, X/O turns, and a winner check.',
            '- The page title or heading must include "tictactoe" (case-insensitive).',
            '- No build step. Do not install React locally; use the CDN scripts in `index.html`.',
            '- Start the server only after installing Express. Run it with `node server.js > /tmp/tictactoe-server.log 2>&1 &` so it stays alive in the background and logs are captured.',
            '- After starting the server, verify it is running (for example with `ps aux | grep node` or `curl http://localhost:4000/`).',
            ''
         ].join ('\n') + '\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._backendAppProject) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Backend 3: Create dialog draft (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._backendAppProject) + '/dialogs');
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
         window._backendAppDialogId = parsed.dialogId;
         return true;
      }],

      ['Backend 4: Fire "please start" (non-blocking)', function (done) {
         var dialogId = window._backendAppDialogId;
         if (! dialogId) {
            var file = B.get ('currentFile');
            var parsed = file ? parseDialogFilename (file.name) : null;
            if (parsed && parsed.dialogId) dialogId = parsed.dialogId;
         }
         if (! dialogId) {
            window._backendAppFireError = 'Could not determine dialogId for orchestrator';
            return done (SHORT_WAIT, POLL);
         }
         window._backendAppDialogId = dialogId;
         window._backendAppFireError = null;
         fetch ('project/' + encodeURIComponent (window._backendAppProject) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify ({
               dialogId: dialogId,
               prompt: 'Please start. Read doc/main.md once, then implement immediately: create server.js (Express on port 4000 serving static files from /workspace), index.html, and app.js in /workspace root. Do not re-fetch docs after the first read. Before running the server, install Express in /workspace with npm (for example `npm init -y || true` and `npm install express`). Do not install React locally; use CDN scripts only. Then start the server with `node server.js > /tmp/tictactoe-server.log 2>&1 &`, verify it is running or that `curl http://localhost:4000/` succeeds, and only then update doc/main.md with an embed block (port 4000, title Tictactoe, height 500).'
            })
         }).catch (function (error) {
            window._backendAppFireError = 'Failed to fire dialog: ' + (error && error.message ? error.message : String (error));
         });
         done (SHORT_WAIT, POLL);
      }, function () {
         return window._backendAppFireError ? window._backendAppFireError : true;
      }],

      ['Backend 5: Poll until proxy serves the app on port 4000', function (done) {
         window._backendAppProxyPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._backendAppProxyPollError = 'Timed out after 5 minutes waiting for proxied app on port 4000';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._backendAppProject) + '/proxy/4000/', {}, '', function (error, rs) {
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
         return window._backendAppProxyPollError ? window._backendAppProxyPollError : true;
      }],

      ['Backend 6: Proxy serves index.html with React + app.js', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._backendAppProject) + '/proxy/4000/', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._backendAppIndexError = 'Failed to fetch index via proxy';
            else {
               var lower = (rs.body || '').toLowerCase ();
               if (lower.indexOf ('react') === -1) window._backendAppIndexError = 'index.html missing React reference';
               else if (lower.indexOf ('app.js') === -1) window._backendAppIndexError = 'index.html missing app.js reference';
               else window._backendAppIndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._backendAppIndexError ? window._backendAppIndexError : true;
      }],

      ['Backend 7: Proxy serves app.js with tictactoe logic', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._backendAppProject) + '/proxy/4000/app.js', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._backendAppAppError = 'Failed to fetch app.js via proxy';
            else {
               var lower = (rs.body || '').toLowerCase ();
               var hasBoardLogic = lower.indexOf ('board') !== -1 || lower.indexOf ('cell') !== -1 || lower.indexOf ('square') !== -1 || lower.indexOf ('grid') !== -1;
               window._backendAppAppError = hasBoardLogic ? null : 'app.js missing board/cell/square/grid logic';
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._backendAppAppError ? window._backendAppAppError : true;
      }],

      ['Backend 8: Server process is running', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._backendAppProject) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'ps aux | grep node || true'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._backendAppPsError = 'ps aux failed';
            else {
               var out = (rs.body.stdout || '') + (rs.body.stderr || '');
               window._backendAppPsError = out.indexOf ('server.js') !== -1 ? null : 'server.js process not found in ps output';
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._backendAppPsError ? window._backendAppPsError : true;
      }],

      ['Backend 9: Poll until embed block appears in doc/main.md', function (done) {
         window._backendAppEmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > 300000) {
               window._backendAppEmbedPollError = 'Timed out after 5 minutes waiting for port 4000 embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._backendAppProject) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port 4000') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 3000);
            });
         };
         attempt ();
      }, function () {
         return window._backendAppEmbedPollError ? window._backendAppEmbedPollError : true;
      }],

      ['Backend 10: Verify embed block in doc/main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._backendAppProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._backendAppEmbedContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var content = window._backendAppEmbedContent || '';
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
            window._viModeSettings = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._viModeSettings;
         if (! settings || ! settings.editor || settings.editor.viMode !== true) return 'Server settings do not reflect viMode true';
         return true;
      }],

      ['Vi 5: Create project + seed doc/main.md', function (done) {
         window._viModeProject = 'test-vi-mode-' + testTimestamp ();
         window._viModeContent = [
            'alpha beta gamma',
            'delta echo foxtrot',
            'golf hotel india',
            'juliet kilo lima'
         ].join ('\n');
         mockPrompt (window._viModeProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         if (B.get ('currentProject') !== window._viModeProject) return 'Failed to create vi mode project';
         return true;
      }],

      ['Vi 6: Write doc/main.md and open editor', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._viModeProject) + '/file/doc/main.md', {}, {content: window._viModeContent}, function () {
            B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._viModeProject) + '/docs/main.md');
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content !== window._viModeContent) return 'doc/main.md content mismatch';
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
         var endPos = window._viModeContent.length;
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
            window._viModeSettingsAfter = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._viModeSettingsAfter;
         if (! settings || ! settings.editor || settings.editor.viMode !== false) return 'Server settings do not reflect viMode false';
         return true;
      }],

      ['Vi 25: Delete project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._viModeProject);
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
         window._snapshotsProject = 'test-snapshots-' + testTimestamp ();
         mockPrompt (window._snapshotsProject);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._snapshotsProject || 'Failed to create flow #7 project';
      }],

      ['Snapshots 2: Write doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._snapshotsProject) + '/file/doc/main.md', {}, {content: '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 3: Write extra file doc/notes.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._snapshotsProject) + '/file/doc/notes.md', {}, {content: '# Notes\n\nSome extra notes.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 4: Create snapshot with label "before refactor"', function (done) {
         mockPrompt ('before refactor');
         window._vibeyExpectedAlerts = window._vibeyExpectedAlerts || [];
         window._vibeyExpectedAlerts.push ('Snapshot created: before refactor');
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
            if (snap.project === window._snapshotsProject) return snap;
         });
         if (! found) return 'Snapshot for project not found in list';
         if (found.label !== 'before refactor') return 'Snapshot label mismatch: ' + found.label;
         if (! found.id) return 'Snapshot missing id';
         if (type (found.fileCount) !== 'integer' || found.fileCount < 2) return 'Expected at least 2 files, got: ' + found.fileCount;
         window._snapshotsSnapshotId = found.id;
         window._snapshotsSnapshotProjectName = found.projectName;
         return true;
      }],

      ['Snapshots 6: Create second snapshot without label', function (done) {
         mockPrompt ('');
         window._vibeyExpectedAlerts = window._vibeyExpectedAlerts || [];
         window._vibeyExpectedAlerts.push (/^Snapshot created: /);
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
            if (snap.project === window._snapshotsProject) return snap;
         });
         if (ours.length < 2) return 'Expected at least 2 snapshots, got: ' + ours.length;
         window._snapshotsSnapshotId2 = ours [0].id !== window._snapshotsSnapshotId ? ours [0].id : ours [1].id;
         if (ours [0].id !== window._snapshotsSnapshotId2) return 'Expected newest snapshot first';
         return true;
      }],

      ['Snapshots 8: Download placeholder snapshot returns 404', function (done) {
         c.ajax ('get', 'snapshots/placeholder/download', {}, '', function (error) {
            window._snapshotsDownloadMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsDownloadMissing !== 404) return 'Expected 404 for placeholder download, got ' + window._snapshotsDownloadMissing;
         return true;
      }],

      ['Snapshots 9: Download first snapshot returns data', function (done) {
         c.ajax ('get', 'snapshots/' + encodeURIComponent (window._snapshotsSnapshotId) + '/download', {}, '', function (error, rs) {
            window._snapshotsDownloadError = error ? error.status : null;
            window._snapshotsDownloadBody = rs && rs.body ? rs.body : '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsDownloadError) return 'Snapshot download failed: ' + window._snapshotsDownloadError;
         if (! window._snapshotsDownloadBody || window._snapshotsDownloadBody.length === 0) return 'Snapshot download empty';
         return true;
      }],

      ['Snapshots 10: Restore snapshot as new project', function (done) {
         mockPrompt ('Restored Snapshot Test');
         B.call ('restore', 'snapshot', window._snapshotsSnapshotId, window._snapshotsSnapshotProjectName);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (! project) return 'No current project after restore';
         if (project === window._snapshotsProject) return 'Still on original project after restore';
         window._snapshotsRestoredProject = project;
         return true;
      }],

      ['Snapshots 11: Projects list includes restored project', function (done) {
         c.ajax ('get', 'projects', {}, '', function (error, rs) {
            window._snapshotsProjectList = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var projects = window._snapshotsProjectList || [];
         var found = dale.stopNot (projects, undefined, function (p) {
            if (p && p.name === 'Restored Snapshot Test') return p;
         });
         if (! found) return 'Restored project not found in projects list';
         return true;
      }],

      ['Snapshots 12: Restored project has both files', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._snapshotsRestoredProject) + '/files', {}, '', function (error, rs) {
            window._snapshotsRestoredFiles = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var files = window._snapshotsRestoredFiles;
         if (type (files) !== 'array') return 'Expected files array';
         if (! inc (files, 'doc/main.md')) return 'Restored project missing doc/main.md';
         if (! inc (files, 'doc/notes.md')) return 'Restored project missing doc/notes.md';
         return true;
      }],

      ['Snapshots 13: Restored doc/main.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._snapshotsRestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._snapshotsRestoredContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsRestoredContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored doc/main.md content mismatch';
         return true;
      }],

      ['Snapshots 14: Restored doc/notes.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._snapshotsRestoredProject) + '/file/doc/notes.md', {}, '', function (error, rs) {
            window._snapshotsRestoredNotes = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsRestoredNotes !== '# Notes\n\nSome extra notes.\n') return 'Restored notes.md content mismatch';
         return true;
      }],

      ['Snapshots 15: Modify original project doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._snapshotsProject) + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 16: Restored project unaffected by original modification', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._snapshotsRestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._snapshotsCheckContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsCheckContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored content was affected by original modification!';
         return true;
      }],

      ['Snapshots 17: Delete second snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._snapshotsSnapshotId2);
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
         if (inc (ids, window._snapshotsSnapshotId2)) return 'Deleted snapshot still in list';
         if (! inc (ids, window._snapshotsSnapshotId)) return 'First snapshot should still exist';
         return true;
      }],

      ['Snapshots 19: Delete original project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._snapshotsProject);
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
            if (snap.id === window._snapshotsSnapshotId) return snap;
         });
         if (! found) return 'Snapshot disappeared after project deletion';
         return true;
      }],

      ['Snapshots 21: Delete nonexistent snapshot returns 400', function (done) {
         c.ajax ('delete', 'snapshots/nonexistent-id-12345', {}, '', function (error) {
            window._snapshotsDeleteMissing = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsDeleteMissing !== 400) return 'Expected 400 for nonexistent snapshot delete, got ' + window._snapshotsDeleteMissing;
         return true;
      }],

      ['Snapshots 22: Download nonexistent snapshot returns 404', function (done) {
         c.ajax ('get', 'snapshots/nonexistent-id-12345/download', {}, '', function (error) {
            window._snapshotsDownloadMissing2 = error ? error.status : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._snapshotsDownloadMissing2 !== 404) return 'Expected 404 for nonexistent snapshot download, got ' + window._snapshotsDownloadMissing2;
         return true;
      }],

      ['Snapshots 23: Delete restored project', function (done) {
         if (! window._snapshotsRestoredProject) return done ();
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._snapshotsRestoredProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 24: Delete first snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._snapshotsSnapshotId);
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
            if (snap.project === window._snapshotsProject) return snap;
         });
         if (ours.length > 0) return 'Leftover snapshots from snapshot suite: ' + ours.length;
         return true;
      }],



   ];

   var SUITE_ORDER = ['project', 'dialog', 'docs', 'uploads', 'static', 'backend', 'vi', 'snapshots'];
   // Match test-server's convention: fast excludes dialog/static/backend-style slow suites.
   var FAST_SUITES = ['project', 'docs', 'uploads', 'vi', 'snapshots'];

   var filterValue = suiteFilter.toLowerCase ().trim ();

   var testsBySuite = dale.acc (allTests, {}, function (acc, test) {
      var suite = testSuite (test [0]);
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
   else if (filterValue === 'fast') {
      dale.go (FAST_SUITES, function (suite) {
         if (testsBySuite [suite]) filteredTests = filteredTests.concat (testsBySuite [suite]);
      });
   }
   else {
      filteredTests = testsBySuite [filterValue] || [];
   }

   var originalAlert = window.alert;
   var unexpectedAlert = null;
   var testControlledAlertPrefixes = [
      '❌ No tests found for suite:',
      '❌ Test FAILED:',
      '✅ All tests passed!'
   ];

   var matchesExpectedAlert = function (message, expected) {
      if (type (expected) === 'string') return message === expected;
      if (expected && expected.test && type (expected.test) === 'function') return expected.test (message);
      return false;
   };

   window._vibeyExpectedAlerts = window._vibeyExpectedAlerts || [];

   window.alert = function (message) {
      message = '' + message;
      var isTestControlled = dale.stopNot (testControlledAlertPrefixes, undefined, function (prefix) {
         if (message.indexOf (prefix) === 0) return true;
      });
      if (isTestControlled) return originalAlert.call (window, message);

      var expectedAlerts = window._vibeyExpectedAlerts || [];
      var expectedIndex = dale.stopNot (expectedAlerts, undefined, function (expected, k) {
         if (matchesExpectedAlert (message, expected)) return k;
      });
      if (expectedIndex !== undefined) {
         expectedAlerts.splice (expectedIndex, 1);
         console.log ('[vibey-test] expected alert:', message);
         return;
      }

      console.error ('[vibey-test] unexpected alert:', message);
      if (! unexpectedAlert) unexpectedAlert = message;
   };

   filteredTests = dale.go (filteredTests, function (test) {
      var name = test [0];
      if (test.length < 3) return [name, function () {
         if (unexpectedAlert) return 'Unexpected alert: ' + unexpectedAlert;
         return test [1] ();
      }];
      return [name, function (done) {
         if (unexpectedAlert) return done (SHORT_WAIT, POLL);
         return test [1] (done);
      }, function () {
         if (unexpectedAlert) return 'Unexpected alert: ' + unexpectedAlert;
         return test [2] ();
      }];
   });

   if (filteredTests.length === 0) {
      alert ('❌ No tests found for suite: ' + suiteFilter);
      return;
   }

   console.log ('Running ' + filteredTests.length + ' tests (suite: ' + suiteFilter + ')');

   c.test (filteredTests, function (error, time) {
      var label = filterValue === 'all' ? 'all suites' : suiteFilter;
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
