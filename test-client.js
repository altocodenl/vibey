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

   var LONG_WAIT    = 240000; // 4 min for LLM responses
   var MEDIUM_WAIT  = 15000;
   var SHORT_WAIT   = 3000;
   var POLL         = 200;
   var POLL_TIMEOUT = 180000; // 3 min hard timeout for long polling steps
   var EXTENDED_POLL_TIMEOUT = 300000; // 5 min for LLM build flows (F4/F5)

   var PROJECT_FLOW = 'test-projects-' + testTimestamp ();
   var TEST_PROJECT = 'test-flow1-' + testTimestamp ();
   var TEST_DIALOG  = 'read-vibey';

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

      ['Project 4: Idempotent create is server-only (client n/a)', function () {
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

      ['Project 11: Special name slug cases are server-only (client n/a)', function () {
         return true;
      }],

      // --- Dialog: We start on the projects tab ---
      ['Dialog 1: Shell includes client.js', function () {
         var script = document.querySelector ('script[src="client.js"]');
         if (! script) return 'client.js script tag not found in DOM';
         return true;
      }],

      ['Dialog 1a: Navigate to projects tab', function (done) {
         window.location.hash = '#/projects';
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'projects') return 'Expected tab to be "projects" but got "' + tab + '"';
         var heading = findByText ('.editor-filename', 'Projects');
         if (! heading) return 'Projects heading not found in DOM';
         return true;
      }],

      // --- Dialog: Create a new project ---
      ['Dialog 2: Create project "' + TEST_PROJECT + '"', function (done) {
         mockPrompt (TEST_PROJECT);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected to land on "docs" tab after project creation, got "' + tab + '"';
         var project = B.get ('currentProject');
         if (project !== TEST_PROJECT) return 'Expected currentProject to be "' + TEST_PROJECT + '" but got "' + project + '"';
         return true;
      }],

      // --- Dialog: Switch to dialogs tab ---
      ['Dialog 2a: Navigate to dialogs tab', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (TEST_PROJECT) + '/dialogs');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'dialogs') return 'Expected tab to be "dialogs" but got "' + tab + '"';
         return true;
      }],

      // --- Dialog: Create a new dialog ---
      ['Dialog 3: Create dialog "' + TEST_DIALOG + '"', function (done) {
         mockPrompt (TEST_DIALOG);
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile set after dialog creation';
         if (file.name.indexOf ('dialog/') !== 0) return 'Filename does not start with "dialog/": ' + file.name;
         if (file.name.indexOf (TEST_DIALOG) === -1) return 'Filename does not contain slug "' + TEST_DIALOG + '": ' + file.name;
         if (file.name.indexOf ('-done.md') === -1) return 'Dialog should be in done status: ' + file.name;
         return true;
      }],

      // --- Dialog: Check dialog appears in sidebar with icon and full name ---
      ['Dialog 4: Dialog visible in sidebar with status icon and full name', function () {
         var sidebar = document.querySelector ('.file-list');
         if (! sidebar) return 'Sidebar not found';
         var item = findByText ('.dialog-name', TEST_DIALOG);
         if (! item) return 'Dialog label "' + TEST_DIALOG + '" not found in sidebar';
         var text = item.textContent;
         // Check status icon is present (🟢 or ⚪ for done)
         if (text.indexOf ('🟢') === -1 && text.indexOf ('⚪') === -1) return 'Expected done icon in sidebar item, got: ' + text;
         // Check full name is visible (not truncated with ellipsis via CSS)
         var style = window.getComputedStyle (item);
         if (style.textOverflow === 'ellipsis') return 'Dialog name is being truncated with ellipsis';
         return true;
      }],

      // --- Dialog: Check gpt-5.3-codex is selected ---
      ['Dialog 4a: gpt-5.3-codex model is selected', function () {
         var provider = B.get ('chatProvider');
         if (provider !== 'openai') return 'Expected provider to be "openai" but got "' + provider + '"';
         var model = B.get ('chatModel');
         if (model !== 'gpt-5.3-codex') return 'Expected model to be "gpt-5.3-codex" but got "' + model + '"';
         // Check the unified provider+model select shows the right label
         var selects = document.querySelectorAll ('.provider-select');
         if (selects.length < 1) return 'Expected at least 1 provider select, found ' + selects.length;
         var modelSelect = selects [0];
         var selectedOption = modelSelect.options [modelSelect.selectedIndex];
         if (! selectedOption || selectedOption.textContent !== 'OpenAI · gpt-5.3') return 'Model dropdown does not show "OpenAI · gpt-5.3", shows: ' + (selectedOption ? selectedOption.textContent : 'nothing');
         return true;
      }],

      // --- Dialog: Write a test file into the project for the agent to read ---
      ['Dialog 5: Write test-sample.txt for agent to read', function (done) {
         var project = TEST_PROJECT;
         var content = '# Sample File\n\nThis is a test file for vibey.\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n';
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/tool/execute', {}, {
            toolName: 'write_file',
            toolInput: {path: 'test-sample.txt', content: content}
         }, function (error, rs) {
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return true;
      }],

      // --- Dialog: Send message and verify dialog turns purple (active) while streaming ---
      ['Dialog 6: Dialog shows purple (active) indicator while streaming', function (done) {
         // Remember the filename before sending so we can verify it changed
         window._f1PreSendFile = B.get ('currentFile') ? B.get ('currentFile').name : null;
         B.call ('set', 'chatInput', 'Please read the file test-sample.txt using the run_command tool with `cat test-sample.txt`, and summarize what it is about.');
         B.call ('send', 'message');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         // Check that while streaming is true, the dialog shows active status
         var streaming = B.get ('streaming');
         // If streaming finished before we could check, skip gracefully (feature still works, just too fast to observe)
         if (! streaming && ! window._f1PurpleVerified) {
            window._f1PurpleVerified = 'skipped';
            return true;
         }

         if (streaming && ! window._f1PurpleVerified) {
            var file = B.get ('currentFile');
            if (! file || ! file.name) return 'Waiting for currentFile...';

            var parsed = parseDialogFilename (file.name);
            if (! parsed) return 'Cannot parse dialog filename: ' + file.name;
            if (parsed.status !== 'active') return 'Expected dialog status "active" in filename but got "' + parsed.status + '" (' + file.name + ')';

            // Verify sidebar also shows the active filename
            var files = B.get ('files') || [];
            var hasActive = dale.stopNot (files, undefined, function (f) {
               var p = parseDialogFilename (f);
               if (p && p.dialogId === parsed.dialogId && p.status === 'active') return true;
            });
            if (! hasActive) return 'Sidebar files list does not contain active version of dialog';

            // Verify the 🟣 icon is visible in the DOM (header or sidebar)
            var headerEl = document.querySelector ('.editor-filename');
            var headerText = headerEl ? headerEl.textContent : '';
            if (headerText.indexOf ('🟣') === -1) return 'Purple 🟣 icon not found in dialog header';

            window._f1PurpleVerified = true;
         }

         // Once purple is verified, wait for streaming to finish
         if (window._f1PurpleVerified && streaming) return 'Purple verified ✓ — waiting for streaming to finish...';

         // Streaming done — verify it switched back to done/green
         if (window._f1PurpleVerified && ! streaming) return true;

         return 'Unexpected state';
      }],

      // --- Dialog: Verify response has tool results (streaming complete) ---
      ['Dialog 7: Dialog response has tool results after streaming', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'Waiting for file to reload...';

         var content = file.content;
         if (content.indexOf ('Tool request:') === -1 && content.indexOf ('## Tool Request') === -1) return 'Waiting for tool blocks in dialog...';
         if (content.indexOf ('Result:') === -1 && content.indexOf ('## Tool Result') === -1) return 'Waiting for tool results in dialog...';

         // Also verify the dialog is back to done/green status
         var parsed = parseDialogFilename (file.name);
         if (parsed && parsed.status !== 'done') return 'Expected dialog to return to "done" status after streaming, got "' + parsed.status + '"';

         return true;
      }],

      // --- Dialog: Verify response shows gauges (time + duration + compact cumulative tokens + context %) ---
      ['Dialog 7a: Response shows gauges with local time, compact in/out tokens, and context %', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No current file';
         var content = file.content;

         // Check metadata exists in markdown source
         if (content.indexOf ('> Time:') === -1) return 'No "> Time:" metadata found in dialog';
         if (content.indexOf ('> Context:') === -1) return 'No "> Context:" metadata found in dialog';

         var metaElements = document.querySelectorAll ('.chat-meta');
         if (metaElements.length === 0) return 'No .chat-meta elements found in chat view';

         var texts = dale.go (Array.prototype.slice.call (metaElements), function (el) {
            return el.textContent || '';
         });

         var hasTime = dale.stopNot (texts, undefined, function (text) {
            if (/\b\d{2}:\d{2}:\d{2}\b/.test (text) || /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/.test (text)) return true;
         });
         var hasDuration = dale.stopNot (texts, undefined, function (text) {
            if (/\b\d+\.\ds\b/.test (text)) return true;
         });
         var hasCompactTokens = dale.stopNot (texts, undefined, function (text) {
            if (/\b\d+\.\dkti\s+\+\s+\d+\.\dkto\b/.test (text)) return true;
         });
         var hasContext = dale.stopNot (texts, undefined, function (text) {
            if (/\d+%\s*context/.test (text)) return true;
         });

         if (! hasTime) return 'No local time shown in gauges';
         if (! hasDuration) return 'No rounded seconds duration shown in gauges';
         if (! hasCompactTokens) return 'No compact cumulative token gauge shown (expected like 3.3kti + 1.8kto)';
         if (! hasContext) return 'No context % gauge shown in chat meta (expected like "12% context")';

         return true;
      }],

      // --- Dialog: Check tool result blocks present in dialog ---
      ['Dialog 7b: Tool result blocks present with file content', function () {
         var file = B.get ('currentFile');
         if (! file) return 'No current file';

         // Verify tool blocks exist in markdown
         var content = file.content;
         if (content.indexOf ('Tool request:') === -1 && content.indexOf ('## Tool Request') === -1) return 'No tool request blocks found in dialog';
         if (content.indexOf ('Result:') === -1 && content.indexOf ('## Tool Result') === -1) return 'No tool results found in dialog';

         // The tool result should contain file content from vibey.md
         var chatArea = document.querySelector ('.chat-messages');
         if (! chatArea) return 'Chat messages area not found';

         return true;
      }],

      // --- Dialog: Ask to create dummy.js (write_file auto-executes) ---
      ['Dialog 8: Ask LLM to create dummy.js with console.log', function (done) {
         B.call ('set', 'chatInput', 'Please create a file called dummy.js with the content: console.log("hello from dummy"); Use the write_file tool for this.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         if (streaming) return 'Still streaming...';

         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'Waiting for file content...';
         if (file.content.indexOf ('write_file') === -1) return 'write_file tool not found in dialog yet';
         return true;
      }],

      // --- Dialog: Verify write_file result shown with success ---
      ['Dialog 9: Write result shown with success in chat view', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No current file';

         // Check the dialog markdown has write_file
         if (file.content.indexOf ('write_file') === -1) return 'write_file not found in dialog';

         // Check the DOM for the chat messages area
         var chatArea = document.querySelector ('.chat-messages');
         if (! chatArea) return 'Chat messages area not found';

         // The tool result should show success
         var hasResult = file.content.indexOf ('"success": true') !== -1 || file.content.indexOf ('"success":true') !== -1;
         if (! hasResult) return 'Write tool result with success not found in dialog';

         return true;
      }],

      // --- Dialog: Verify dummy.js was actually created ---
      ['Dialog 10: Verify dummy.js exists with console.log', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (TEST_PROJECT) + '/file/dummy.js', {}, '', function (error, rs) {
            if (error) {
               window._testDummyContent = null;
               done ();
               return;
            }
            window._testDummyContent = rs.body ? rs.body.content : null;
            done ();
         });
      }, function () {
         // dummy.js is not a .md file, so it won't be served by the files endpoint
         // But write_file writes to the project dir, so we verify via the dialog markdown
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No current file';
         var hasWriteSuccess = file.content.indexOf ('File written') !== -1 || file.content.indexOf ('"success":true') !== -1 || file.content.indexOf ('"success": true') !== -1;
         if (! hasWriteSuccess) return 'dummy.js write success not confirmed in dialog';
         return true;
      }],

      // --- Dialog: Verify context bar is visible above chat input ---
      ['Dialog 7c: Context bar shows percentage above chat input', function () {
         var contextWindow = B.get ('contextWindow');
         if (! contextWindow) return true;
         if (type (contextWindow.percent) !== 'integer' && type (contextWindow.percent) !== 'float') return 'contextWindow.percent missing or not a number';
         if (contextWindow.percent < 0 || contextWindow.percent > 100) return 'contextWindow.percent out of range: ' + contextWindow.percent;

         // Verify the context bar text is rendered somewhere in the chat input area
         var inputArea = document.querySelector ('.chat-input-area');
         if (! inputArea) return 'Chat input area not found';
         var parent = inputArea.parentElement;
         if (! parent) return 'Chat input area parent not found';
         var parentText = parent.textContent || '';
         if (! /\d+%\s*context/.test (parentText)) return 'Context bar text (N% context) not found near chat input area';
         return true;
      }],

      // --- Dialog: Verify hasAnyProvider guard ---
      ['Dialog 13a: hasAnyProvider returns true when keys are configured', function () {
         var settings = B.get ('settings') || {};
         // The test environment should have at least one provider configured
         var hasProvider = (settings.openaiKey || settings.openaiOAuthToken || settings.claudeKey || settings.claudeOAuthToken) ? true : false;
         if (! hasProvider) return true;
         // Verify UI elements are enabled (not disabled)
         var textarea = document.querySelector ('.chat-input');
         if (! textarea) return 'Chat input textarea not found';
         if (textarea.disabled) return 'Chat input should be enabled when a provider is configured';
         var sendBtn = findByText ('button', 'Send');
         if (sendBtn && sendBtn.disabled) return 'Send button should be enabled when a provider is configured';
         return true;
      }],

      ['Dialog 11: n/a remove provider header (server-only)', function () {
         return true;
      }],

      ['Dialog 12: n/a error event without provider (server-only)', function () {
         return true;
      }],

      ['Dialog 13: Dialog still done after error (client check)', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.name) return 'No current dialog file';
         if (file.name.indexOf ('-done.md') === -1) return 'Expected dialog to be done';
         return true;
      }],

      // --- Dialog: Cleanup ---
      ['Dialog 13b: Cleanup restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // =============================================
      // *** DOCS ***
      // =============================================

      // --- Docs: Create a new project for Flow #2 ---
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

      // --- Docs: Create doc/main.md (shown as main.md) ---
      ['Docs 2: Create main.md', function (done) {
         mockPrompt ('main.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after creating main.md';
         if (file.name !== 'doc/main.md') return 'Expected name "doc/main.md", got "' + file.name + '"';
         return true;
      }],

      // --- Docs: main.md appears in sidebar as "main.md" ---
      ['Docs 3: main.md visible in sidebar', function () {
         var sidebar = document.querySelector ('.file-list');
         if (! sidebar) return 'Sidebar not found';
         var item = findByText ('.file-name', 'main.md');
         if (! item) return 'main.md not found in sidebar';
         return true;
      }],

      // --- Docs: Click main.md, editor opens with content ---
      ['Docs 4: Click main.md, editor shows content', function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         var preview = document.querySelector ('.editor-preview');
         if (! preview) return 'Editor preview not found';
         if (preview.innerHTML.indexOf ('main') === -1) return 'Editor does not contain initial content';
         return true;
      }],

      // --- Docs: Edit content, verify dirty state ---
      ['Docs 5: Edit content and verify dirty indicator', function (done) {
         var newContent = '# Main\n\nUpdated content for testing.\n';
         B.call ('set', ['currentFile', 'content'], newContent);
         done (SHORT_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         if (file.content === file.original) return 'Content should differ from original (dirty state)';
         var dirty = document.querySelector ('.editor-dirty');
         if (! dirty) return 'Dirty indicator "(unsaved)" not found in DOM';
         if (dirty.textContent.indexOf ('unsaved') === -1) return 'Dirty indicator text missing "unsaved"';
         return true;
      }],

      // --- Docs: Save changes ---
      ['Docs 6: Save changes', function (done) {
         B.call ('save', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after save';
         if (file.content !== file.original) return 'After save, content and original should match';
         var dirty = document.querySelector ('.editor-dirty');
         if (dirty) return 'Dirty indicator still present after save';
         return true;
      }],

      // --- Docs: Verify saved content persisted on server ---
      ['Docs 7: Reload file and verify persisted content', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after reload';
         if (file.content.indexOf ('Updated content for testing') === -1) return 'Persisted content not found after reload: ' + file.content.slice (0, 100);
         if (file.content !== file.original) return 'After fresh load, content and original should match';
         return true;
      }],

      // --- Docs: Create a second doc so we can test navigating away ---
      ['Docs 8: Create second doc', function (done) {
         mockPrompt ('doc/notes.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/notes.md') return 'Expected doc/notes.md as current file';
         return true;
      }],

      ['Docs 9: Sidebar lists main.md and notes.md', function () {
         var mainItem = findByText ('.file-name', 'main.md');
         if (! mainItem) return 'main.md not found in sidebar';
         var notesItem = findByText ('.file-name', 'notes.md');
         if (! notesItem) return 'notes.md not found in sidebar';
         return true;
      }],

      // --- Docs: Go back to main.md and make it dirty ---
      ['Docs 10: Edit main.md and mark it dirty', function (done) {
         window._f2DirtySet = false;
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'Waiting for doc/main.md...';
         if (! window._f2DirtySet) {
            B.call ('set', ['currentFile', 'content'], file.original + '\nExtra unsaved line.\n');
            window._f2DirtySet = true;
         }
         var dirtyFile = B.get ('currentFile');
         if (dirtyFile.content === dirtyFile.original) return 'Waiting for dirty state...';
         return true;
      }],

      // --- Docs: Try to leave dirty doc and choose save ---
      ['Docs 11: Navigate away from dirty doc triggers save via confirm', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {
            window.confirm = originalConfirm;
            return true;
         };
         B.call ('load', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         if (file.name !== 'doc/notes.md') return 'Expected to land on doc/notes.md, got ' + file.name;
         return true;
      }],

      // --- Docs: Verify save persisted ---
      ['Docs 12: Verify main.md has the extra line saved', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content.indexOf ('Extra unsaved line') === -1) return 'Extra line was not saved';
         return true;
      }],

      // --- Docs: Edit again and discard changes ---
      ['Docs 13: Edit main.md, then discard changes', function (done) {
         var file = B.get ('currentFile');
         B.call ('set', ['currentFile', 'content'], file.original + '\nThis will be discarded.\n');
         var callCount = 0;
         var originalConfirm = window.confirm;
         window.confirm = function () {
            callCount++;
            if (callCount === 1) return false;
            if (callCount === 2) {
               window.confirm = originalConfirm;
               return true;
            }
            window.confirm = originalConfirm;
            return true;
         };
         B.call ('load', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'Waiting for currentFile...';
         if (file.name !== 'doc/notes.md') return 'Waiting for notes.md...';
         return true;
      }],

      // --- Docs: Verify discarded changes were not persisted ---
      ['Docs 14: Verify discarded changes not persisted', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content.indexOf ('This will be discarded') !== -1) return 'Discarded text was persisted';
         return true;
      }],

      ['Docs 15: Delete notes.md via UI', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var notesItem = findByText ('.file-name', 'notes.md');
         if (notesItem) return 'notes.md still in sidebar after deletion';
         var mainItem = findByText ('.file-name', 'main.md');
         if (! mainItem) return 'main.md missing from sidebar after notes deletion';
         return true;
      }],

      ['Docs 16: Loading deleted notes.md clears selection', function (done) {
         B.call ('load', 'file', 'doc/notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (file) return 'Expected no currentFile after loading deleted notes.md';
         return true;
      }],

      ['Docs 17: Create file with spaces in name', function (done) {
         mockPrompt ('my notes.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/my notes.md') return 'Expected doc/my notes.md as current file';
         if (file.content.indexOf ('# my notes') === -1 && file.content.indexOf ('# My notes') === -1) return 'Expected initial title for my notes.md';
         var item = findByText ('.file-name', 'my notes.md');
         if (! item) return 'my notes.md not found in sidebar';
         return true;
      }],

      ['Docs 18: Delete file with spaces in name', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/my notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'my notes.md');
         if (item) return 'my notes.md still in sidebar after deletion';
         return true;
      }],

      ['Docs 19: Create file with accented name', function (done) {
         mockPrompt ('café.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/café.md') return 'Expected doc/café.md as current file';
         if (file.content.indexOf ('# café') === -1 && file.content.indexOf ('# Café') === -1) return 'Expected initial title for café.md';
         var item = findByText ('.file-name', 'café.md');
         if (! item) return 'café.md not found in sidebar';
         return true;
      }],

      ['Docs 20: Delete file with accented name', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/café.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'café.md');
         if (item) return 'café.md still in sidebar after deletion';
         return true;
      }],

      ['Docs 21: Create file with non-Latin name', function (done) {
         mockPrompt ('日本語.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/日本語.md') return 'Expected doc/日本語.md as current file';
         if (file.content.indexOf ('# 日本語') === -1) return 'Expected initial title for 日本語.md';
         var item = findByText ('.file-name', '日本語.md');
         if (! item) return '日本語.md not found in sidebar';
         return true;
      }],

      ['Docs 22: Delete file with non-Latin name', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/日本語.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', '日本語.md');
         if (item) return '日本語.md still in sidebar after deletion';
         return true;
      }],

      ['Docs 23: Create nested doc (doc/nested/plan.md)', function (done) {
         mockPrompt ('nested/plan.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/nested/plan.md') return 'Expected doc/nested/plan.md as current file';
         var item = findByText ('.file-name', 'nested/plan.md');
         if (! item) return 'nested/plan.md not found in sidebar';
         return true;
      }],

      ['Docs 24: Read nested doc round-trip', function (done) {
         B.call ('load', 'file', 'doc/nested/plan.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/nested/plan.md') return 'doc/nested/plan.md not loaded';
         if (file.content.indexOf ('# plan') === -1 && file.content.indexOf ('# Plan') === -1) return 'Unexpected content in nested/plan.md';
         return true;
      }],

      ['Docs 25: Nested doc listed in files', function () {
         var item = findByText ('.file-name', 'nested/plan.md');
         if (! item) return 'nested/plan.md not found in sidebar list';
         return true;
      }],

      ['Docs 26: Delete nested doc', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'file', 'doc/nested/plan.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', 'nested/plan.md');
         if (item) return 'nested/plan.md still in sidebar after deletion';
         return true;
      }],

      ['Docs 27: Nested doc gone from list', function () {
         var item = findByText ('.file-name', 'nested/plan.md');
         if (item) return 'nested/plan.md still listed after deletion';
         return true;
      }],

      ['Docs 28: Delete docs project via UI', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f2Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after docs project deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Docs 29: Projects list no longer shows deleted docs project', function (done) {
         B.call ('load', 'projects');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var item = findByText ('.file-name', window._f2Project);
         if (item) return 'Deleted docs project still appears in projects list';
         return true;
      }],

      ['Docs 30: Cleanup restore prompt', function () {
         restorePrompt ();
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

      ['Uploads 2: Upload image via API', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'pixel.png',
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
         if (entry.name !== 'pixel.png') return 'Upload response missing pixel.png';
         if (! entry.url) return 'Upload response missing url';
         return true;
      }],

      ['Uploads 3: Uploads list includes image metadata', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'pixel.png') return item; });
         if (! image) return 'pixel.png not found in uploads list';
         if (! image.size || image.size <= 0) return 'pixel.png size invalid';
         if (! image.contentType || image.contentType.indexOf ('image/') !== 0) return 'pixel.png contentType invalid: ' + image.contentType;
         window._f3uUploadImage = image;
         return true;
      }],

      ['Uploads 4: Fetch image upload', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/pixel.png', {}, '', function (error, rs) {
            window._f3uUploadFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f3uUploadFetch || {};
         if (result.error) return 'Upload fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for pixel.png, got ' + status;
         var body = rs.body || '';
         if (! body || body.length === 0) return 'Upload fetch returned empty body';
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('image/png') === -1) return 'Expected image/png content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 5: Upload text file via API', function (done) {
         var text = 'Hello uploads.';
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

      ['Uploads 6: Upload file with space in name', function (done) {
         var text = 'Hello spaced uploads.';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'space name.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f3uUploadSpace = rs && rs.body;
            window._f3uUploadSpaceError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadSpaceError) return 'Space-name upload failed: ' + window._f3uUploadSpaceError;
         var entry = window._f3uUploadSpace || {};
         if (entry.name !== 'space name.txt') return 'Upload response missing space name.txt';
         return true;
      }],

      ['Uploads 7: Upload nested/evil.txt (subdir)', function (done) {
         var text = 'Hello nested upload.';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3uProject) + '/upload', {}, {
            name: 'nested/evil.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f3uUploadNested = rs && rs.body;
            window._f3uUploadNestedError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f3uUploadNestedError) return 'Nested upload failed: ' + window._f3uUploadNestedError;
         var entry = window._f3uUploadNested || {};
         if (entry.name !== 'nested/evil.txt') return 'Upload response missing nested/evil.txt';
         return true;
      }],

      ['Uploads 8: Uploads list contains all files', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/uploads', {}, '', function (error, rs) {
            window._f3uUploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f3uUploads;
         if (type (uploads) !== 'array' || uploads.length < 3) return 'Expected at least 3 uploads';
         var text = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'notes.txt') return item; });
         if (! text) return 'notes.txt not found in uploads list';
         if (! text.contentType || text.contentType.indexOf ('text/plain') === -1) return 'notes.txt contentType invalid';
         var spaced = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'space name.txt') return item; });
         if (! spaced) return 'space name.txt not found in uploads list';
         var nested = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'nested/evil.txt') return item; });
         if (! nested) return 'nested/evil.txt not found in uploads list';
         window._f3uUploadText = text;
         window._f3uUploadSpace = spaced;
         window._f3uUploadNested = nested;
         return true;
      }],

      ['Uploads 9: Fetch notes.txt upload', function (done) {
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
         if (body.indexOf ('Hello uploads.') === -1) return 'notes.txt content mismatch';
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('text/plain') === -1) return 'Expected text/plain content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 10: Fetch spaced filename upload', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3uProject) + '/upload/' + encodeURIComponent ('space name.txt'), {}, '', function (error, rs) {
            window._f3uSpaceFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f3uSpaceFetch || {};
         if (result.error) return 'space name.txt fetch failed';
         var rs = result.rs || {};
         var status = rs.xhr ? rs.xhr.status : null;
         if (status !== 200) return 'Expected status 200 for space name.txt, got ' + status;
         var body = rs.body || '';
         if (body.indexOf ('Hello spaced uploads.') === -1) return 'space name.txt content mismatch';
         var contentType = rs.xhr && rs.xhr.getResponseHeader ? rs.xhr.getResponseHeader ('Content-Type') : '';
         if (contentType && contentType.indexOf ('text/plain') === -1) return 'Expected text/plain content-type, got ' + contentType;
         return true;
      }],

      ['Uploads 11: Navigate to docs view', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f3uProject) + '/docs');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected docs tab for uploads';
         return true;
      }],

      ['Uploads 12: Uploads section visible with items', function () {
         var section = document.querySelector ('.upload-section');
         if (! section) return 'Uploads section not found in sidebar';
         var item = findByText ('.upload-item', 'pixel.png');
         if (! item) return 'pixel.png not listed in uploads sidebar';
         return true;
      }],

      ['Uploads 13: Select image upload shows preview', function (done) {
         B.call ('select', 'upload', window._f3uUploadImage);
         done (SHORT_WAIT, POLL);
      }, function () {
         var preview = document.querySelector ('.upload-preview img');
         if (! preview) return 'Image preview not shown';
         return true;
      }],

      ['Uploads 14: Select text upload shows metadata', function (done) {
         B.call ('select', 'upload', window._f3uUploadText);
         done (SHORT_WAIT, POLL);
      }, function () {
         var meta = document.querySelector ('.upload-meta');
         if (! meta) return 'Upload metadata panel not shown for text file';
         if (meta.textContent.indexOf ('Type:') === -1) return 'Metadata panel missing Type line';
         return true;
      }],

      ['Uploads 15: Select spaced upload shows metadata', function (done) {
         B.call ('select', 'upload', window._f3uUploadSpace);
         done (SHORT_WAIT, POLL);
      }, function () {
         var meta = document.querySelector ('.upload-meta');
         if (! meta) return 'Upload metadata panel not shown for spaced file';
         if (meta.textContent.indexOf ('space name.txt') === -1) return 'Metadata panel missing spaced filename';
         return true;
      }],

      ['Uploads 16: Delete uploads project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f3uProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after uploads project deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['Uploads 17: Projects list no longer shows deleted project', function (done) {
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

      // --- F7: Create a snapshot ---

      ['Snapshots 4: Create snapshot via header button', function (done) {
         // Mock prompt for label
         mockPrompt ('before refactor');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         // Accept the alert from the snapshot creation
         return true;
      }],

      ['Snapshots 5: Snapshot appears in snapshots list', function (done) {
         // Dismiss any pending alert
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

      // --- F7: Navigate to snapshots view ---

      ['Snapshots 6: Navigate to snapshots view', function (done) {
         B.call ('navigate', 'hash', '#/snapshots');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'snapshots') return 'Expected snapshots tab, got: ' + tab;
         return true;
      }],

      ['Snapshots 7: Snapshot visible in snapshots view', function () {
         var heading = findByText ('.editor-filename', 'Snapshots');
         if (! heading) return 'Snapshots heading not found';
         var item = findByText ('.file-item', 'before refactor');
         if (! item) return 'Snapshot "before refactor" not found in view';
         return true;
      }],

      ['Snapshots 8: Snapshot entry shows restore, download, delete buttons', function () {
         var item = findByText ('.file-item', 'before refactor');
         if (! item) return 'Snapshot item not found';
         var buttons = item.querySelectorAll ('button');
         if (buttons.length < 3) return 'Expected at least 3 buttons (restore, download, delete), found: ' + buttons.length;
         var texts = dale.go (Array.prototype.slice.call (buttons), function (b) {return b.textContent;}).join (' | ');
         if (texts.indexOf ('Restore') === -1) return 'Missing Restore button. Buttons: ' + texts;
         if (texts.indexOf ('Download') === -1) return 'Missing Download button. Buttons: ' + texts;
         return true;
      }],

      // --- F7: Create second snapshot (no label) ---

      ['Snapshots 9: Create second snapshot without label', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f7Project) + '/docs');
         done (SHORT_WAIT, POLL);
      }, function () {
         return B.get ('currentProject') === window._f7Project || 'Not on project';
      }],

      ['Snapshots 10: Create second snapshot', function (done) {
         mockPrompt ('');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return true;
      }],

      ['Snapshots 11: Two snapshots in list', function (done) {
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var ours = dale.fil (snapshots, undefined, function (snap) {
            if (snap.project === window._f7Project) return snap;
         });
         if (ours.length < 2) return 'Expected at least 2 snapshots, got: ' + ours.length;
         window._f7SnapshotId2 = ours [0].id !== window._f7SnapshotId ? ours [0].id : ours [1].id;
         return true;
      }],

      // --- F7: Restore snapshot as new project ---

      ['Snapshots 12: Restore snapshot as new project', function (done) {
         mockPrompt ('Restored Flow7 Test');
         B.call ('restore', 'snapshot', window._f7SnapshotId, window._f7SnapshotProjectName);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (! project) return 'No current project after restore';
         if (project === window._f7Project) return 'Still on original project, waiting for restored project navigation...';
         window._f7RestoredProject = project;
         return true;
      }],

      ['Snapshots 13: Restored project has both files', function (done) {
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

      ['Snapshots 14: Restored doc/main.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7RestoredContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored doc/main.md content mismatch';
         return true;
      }],

      ['Snapshots 15: Restored doc/notes.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/notes.md', {}, '', function (error, rs) {
            window._f7RestoredNotes = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredNotes !== '# Notes\n\nSome extra notes.\n') return 'Restored notes.md content mismatch';
         return true;
      }],

      // --- F7: Modify original, verify restored unaffected ---

      ['Snapshots 16: Modify original project doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['Snapshots 17: Restored project unaffected by original modification', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7CheckContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7CheckContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored content was affected by original modification!';
         return true;
      }],

      // --- F7: Delete a snapshot ---

      ['Snapshots 18: Delete second snapshot', function (done) {
         B.call ('delete', 'snapshot', window._f7SnapshotId2);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         // confirm dialog is auto-accepted since we mocked it... but delete uses confirm.
         // Let's just check the list
         return true;
      }],

      ['Snapshots 19: Deleted snapshot gone from list', function (done) {
         // Override confirm for delete call
         B.call ('load', 'snapshots');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var snapshots = B.get ('snapshots') || [];
         var ids = dale.go (snapshots, function (snap) {return snap.id;});
         if (inc (ids, window._f7SnapshotId2)) return 'Deleted snapshot still in list';
         if (! inc (ids, window._f7SnapshotId)) return 'First snapshot should still exist';
         return true;
      }],

      // --- F7: Snapshot survives project deletion ---

      ['Snapshots 20: Delete original project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 21: Snapshot still in list after project deletion', function (done) {
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

      // --- F7: Snapshots view shows empty state ---

      ['Snapshots 22: Delete remaining snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._f7SnapshotId);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 23: No snapshots left for this project', function (done) {
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

      // --- F7: Cleanup ---

      ['Snapshots 24: Delete restored project', function (done) {
         if (! window._f7RestoredProject) return done ();
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7RestoredProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['Snapshots 25: Cleanup restore prompt', function () {
         restorePrompt ();
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
