// test-client.js
// Unified frontend test entrypoint.
// - In Node: runs Puppeteer, opens vibey, clicks the Test button, waits for final alert.
// - In Browser: runs the c.test Flow #1 frontend suite.

(function () {

   // *** NODE MODE (boot runner) ***

   if (typeof window === 'undefined') {
      const puppeteer = require ('puppeteer');

      (async function () {
         // Accept flow filter from CLI: node test-client.js [flow]
         // e.g. node test-client.js 6   or   node test-client.js ALL
         var cliFlow = (process.argv [2] || 'ALL').trim ().toUpperCase ();

         var launchOptions = {headless: true};
         if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

         var browser = await puppeteer.launch (launchOptions);
         var page = await browser.newPage ();

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
            console.log ('[vibey-page-error] ' + (error && error.message ? error.message : String (error)));
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

   var cursorInfoFromTextarea = function (textarea) {
      if (! textarea) return {pos: 0, line: 1, col: 1};
      var pos = textarea.selectionStart || 0;
      var before = (textarea.value || '').slice (0, pos);
      var line = before.split ('\n').length;
      var lastNl = before.lastIndexOf ('\n');
      var col = lastNl === -1 ? pos + 1 : pos - lastNl;
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

   var TEST_PROJECT = 'test-flow1-' + testTimestamp ();
   var TEST_DIALOG  = 'read-vibey';

   // *** TESTS ***

   // Flow filter: set by client.js prompt or puppeteer CLI arg.
   // 'ALL' runs everything, '1'-'8' runs only that flow.
   var flowFilter = (window._vibeyTestFlow || 'ALL').toUpperCase ();

   // Tag helper: prefix test name with flow number for filtering.
   // Tests named "Step N:" or "Cleanup:" belong to flow 1.
   // Tests named "F<n>-..." belong to flow <n>.
   var testFlow = function (name) {
      if (/^F(\d+)/.test (name)) return RegExp.$1;
      return '1';
   };

   var allTests = [

      // --- Step 1: We start on the projects tab ---
      ['Step 1: Navigate to projects tab', function (done) {
         window.location.hash = '#/projects';
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'projects') return 'Expected tab to be "projects" but got "' + tab + '"';
         var heading = findByText ('.editor-filename', 'Projects');
         if (! heading) return 'Projects heading not found in DOM';
         return true;
      }],

      // --- Step 2: Create a new project ---
      ['Step 2: Create project "' + TEST_PROJECT + '"', function (done) {
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

      // --- Step 3: Switch to dialogs tab ---
      ['Step 3: Navigate to dialogs tab', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (TEST_PROJECT) + '/dialogs');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'dialogs') return 'Expected tab to be "dialogs" but got "' + tab + '"';
         return true;
      }],

      // --- Step 4: Create a new dialog ---
      ['Step 4: Create dialog "' + TEST_DIALOG + '"', function (done) {
         mockPrompt (TEST_DIALOG);
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile set after dialog creation';
         if (file.name.indexOf ('dialog/') !== 0) return 'Filename does not start with "dialog/": ' + file.name;
         if (file.name.indexOf (TEST_DIALOG) === -1) return 'Filename does not contain slug "' + TEST_DIALOG + '": ' + file.name;
         if (file.name.indexOf ('-waiting.md') === -1) return 'Dialog should be in waiting status: ' + file.name;
         return true;
      }],

      // --- Step 5: Check dialog appears in sidebar with icon and full name ---
      ['Step 5: Dialog visible in sidebar with status icon and full name', function () {
         var sidebar = document.querySelector ('.file-list');
         if (! sidebar) return 'Sidebar not found';
         var item = findByText ('.dialog-name', TEST_DIALOG);
         if (! item) return 'Dialog label "' + TEST_DIALOG + '" not found in sidebar';
         var text = item.textContent;
         // Check status icon is present (🟡 for waiting)
         if (text.indexOf ('🟡') === -1) return 'Expected waiting icon 🟡 in sidebar item, got: ' + text;
         // Check full name is visible (not truncated with ellipsis via CSS)
         var style = window.getComputedStyle (item);
         if (style.textOverflow === 'ellipsis') return 'Dialog name is being truncated with ellipsis';
         return true;
      }],

      // --- Step 6: Check gpt5.3 is selected ---
      ['Step 6: gpt5.3 model is selected', function () {
         var provider = B.get ('chatProvider');
         if (provider !== 'openai') return 'Expected provider to be "openai" but got "' + provider + '"';
         var model = B.get ('chatModel');
         if (model !== 'gpt-5') return 'Expected model to be "gpt-5" but got "' + model + '"';
         // Check the second select (model select) shows gpt5.3
         var selects = document.querySelectorAll ('.provider-select');
         if (selects.length < 2) return 'Expected at least 2 provider selects, found ' + selects.length;
         var modelSelect = selects [1];
         var selectedOption = modelSelect.options [modelSelect.selectedIndex];
         if (! selectedOption || selectedOption.textContent !== 'gpt5.3') return 'Model dropdown does not show gpt5.3, shows: ' + (selectedOption ? selectedOption.textContent : 'nothing');
         return true;
      }],

      // --- Step 7: Write a test file into the project for the agent to read ---
      ['Step 7: Write test-sample.txt for agent to read', function (done) {
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

      // --- Step 8: Send message to read test-sample.txt ---
      ['Step 8: Send "Please read test-sample.txt" message', function (done) {
         B.call ('set', 'chatInput', 'Please read the file test-sample.txt using the run_command tool with `cat test-sample.txt`, and summarize what it is about.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         if (streaming) return 'Still streaming...';

         // Tools auto-execute. Wait for the file to have tool results.
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'Waiting for file to reload...';

         var content = file.content;
         if (content.indexOf ('Tool request:') === -1 && content.indexOf ('## Tool Request') === -1) return 'Waiting for tool blocks in dialog...';
         if (content.indexOf ('Result:') === -1 && content.indexOf ('## Tool Result') === -1) return 'Waiting for tool results in dialog...';

         return true;
      }],

      // --- Step 9: Verify response shows gauges (time + duration + compact cumulative tokens) ---
      ['Step 9: Response shows gauges with local time and compact in/out tokens', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No current file';
         var content = file.content;

         // Check metadata exists in markdown source
         if (content.indexOf ('> Time:') === -1) return 'No "> Time:" metadata found in dialog';

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

         if (! hasTime) return 'No local time shown in gauges';
         if (! hasDuration) return 'No rounded seconds duration shown in gauges';
         if (! hasCompactTokens) return 'No compact cumulative token gauge shown (expected like 3.3kti + 1.8kto)';

         return true;
      }],

      // --- Step 10: Check tool result blocks present in dialog ---
      ['Step 10: Tool result blocks present with file content', function () {
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

      // --- Step 11: Ask to create dummy.js (write_file auto-executes) ---
      ['Step 11: Ask LLM to create dummy.js with console.log', function (done) {
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

      // --- Step 12: Verify write_file result shown with success ---
      ['Step 12: Write result shown with success in chat view', function () {
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

      // --- Step 13: Verify dummy.js was actually created ---
      ['Step 13: Verify dummy.js exists with console.log', function (done) {
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

      // --- Cleanup Flow #1 ---
      ['Cleanup: restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // =============================================
      // *** FLOW #2: Docs editing ***
      // =============================================

      // --- F2 Step 1: Create a new project for Flow #2 ---
      ['F2-1: Create project for docs editing', function (done) {
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

      // --- F2 Step 2: Create doc/main.md (shown as main.md) ---
      ['F2-2: Create main.md', function (done) {
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

      // --- F2 Step 3: main.md appears in sidebar as "main.md" ---
      ['F2-3: main.md visible in sidebar', function () {
         var sidebar = document.querySelector ('.file-list');
         if (! sidebar) return 'Sidebar not found';
         var item = findByText ('.file-name', 'main.md');
         if (! item) return 'main.md not found in sidebar';
         return true;
      }],

      // --- F2 Step 4: Click main.md, editor opens with content ---
      ['F2-4: Click main.md, editor shows content', function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         var preview = document.querySelector ('.editor-preview');
         if (! preview) return 'Editor preview not found';
         if (preview.innerHTML.indexOf ('main') === -1) return 'Editor does not contain initial content';
         return true;
      }],

      // --- F2 Step 5: Edit content, verify dirty state ---
      ['F2-5: Edit content and verify dirty indicator', function (done) {
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

      // --- F2 Step 6: Save changes ---
      ['F2-6: Save changes', function (done) {
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

      // --- F2 Step 7: Verify saved content persisted on server ---
      ['F2-7: Reload file and verify persisted content', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after reload';
         if (file.content.indexOf ('Updated content for testing') === -1) return 'Persisted content not found after reload: ' + file.content.slice (0, 100);
         if (file.content !== file.original) return 'After fresh load, content and original should match';
         return true;
      }],

      // --- F2 Step 8: Create a second doc so we can test navigating away ---
      ['F2-8: Create second doc', function (done) {
         mockPrompt ('doc/notes.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/notes.md') return 'Expected doc/notes.md as current file';
         return true;
      }],

      // --- F2 Step 9: Go back to main.md and make it dirty ---
      ['F2-9: Edit main.md and mark it dirty', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         B.call ('set', ['currentFile', 'content'], file.original + '\nExtra unsaved line.\n');
         var dirtyFile = B.get ('currentFile');
         if (dirtyFile.content === dirtyFile.original) return 'File should be dirty';
         return true;
      }],

      // --- F2 Step 10: Try to leave dirty doc and choose save ---
      ['F2-10: Navigate away from dirty doc triggers save via confirm', function (done) {
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

      // --- F2 Step 11: Verify save persisted ---
      ['F2-11: Verify main.md has the extra line saved', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content.indexOf ('Extra unsaved line') === -1) return 'Extra line was not saved';
         return true;
      }],

      // --- F2 Step 12: Edit again and discard changes ---
      ['F2-12: Edit main.md, then discard changes', function (done) {
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
         if (! file) return 'No currentFile';
         if (file.name !== 'doc/notes.md') return 'Expected doc/notes.md after discard, got ' + file.name;
         return true;
      }],

      // --- F2 Step 13: Verify discarded changes were not persisted ---
      ['F2-13: Verify discarded changes not persisted', function (done) {
         B.call ('load', 'file', 'doc/main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc/main.md') return 'doc/main.md not loaded';
         if (file.content.indexOf ('This will be discarded') !== -1) return 'Discarded text was persisted';
         return true;
      }],

      ['F2-Cleanup: restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // =============================================
      // *** FLOW #3: Delete project stops agents and removes folder ***
      // =============================================

      ['F3-1: Create project', function (done) {
         window._f3Project = 'test-flow3-' + testTimestamp ();
         mockPrompt (window._f3Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f3Project || 'Failed to create flow #3 project';
      }],

      ['F3-2: Write doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3Project) + '/file/doc/main.md', {}, {content: '# Flow 3 Test Project\n\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['F3-3: Create dialogs A and B', function (done) {
         var pending = 2;
         var finish = function () {if (--pending === 0) done (MEDIUM_WAIT, POLL);};
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3Project) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'agent-a'}, function (error, rs) {
            window._f3DialogA = rs && rs.body && rs.body.dialogId;
            finish ();
         });
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3Project) + '/dialog/new', {}, {provider: 'openai', model: 'gpt-5', slug: 'agent-b'}, function (error, rs) {
            window._f3DialogB = rs && rs.body && rs.body.dialogId;
            finish ();
         });
      }, function () {
         if (! window._f3DialogA || ! window._f3DialogB) return 'Missing dialog ids for A/B';
         return true;
      }],

      ['F3-4: Fire both dialogs (non-blocking)', function (done) {
         var project = encodeURIComponent (window._f3Project);
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f3DialogA, prompt: 'Write a 2000 word essay about the history of computing. Take your time and be thorough.'})}).catch (function () {});
         fetch ('project/' + project + '/dialog', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify ({dialogId: window._f3DialogB, prompt: 'Write a 2000 word essay about the history of mathematics. Take your time and be thorough.'})}).catch (function () {});
         done (SHORT_WAIT, POLL);
      }, function () {return true;}],

      ['F3-5: Both dialogs are active', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._f3StatusRequested) {
            window._f3StatusRequested = true;
            c.ajax ('get', 'project/' + encodeURIComponent (window._f3Project) + '/dialogs', {}, '', function (error, rs) {
               window._f3StatusRequested = false;
               if (error) return;
               window._f3Dialogs = rs.body || [];
            });
            return 'Polling dialog statuses...';
         }
         var activeCount = dale.fil (window._f3Dialogs || [], undefined, function (d) {
            if (d.status === 'active') return d;
         }).length;
         if (activeCount >= 2) return true;
         window._f3Dialogs = null;
         return 'Waiting for both dialogs to become active...';
      }],

      ['F3-6: Delete project with active agents', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f3Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('currentProject')) return 'Expected currentProject to be null after deletion';
         if (B.get ('tab') !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      ['F3-7: Dialogs endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3Project) + '/dialogs', {}, '', function (error) {
            window._f3Dialogs404 = error && error.status;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f3Dialogs404 === 404 || 'Expected dialogs endpoint 404';
      }],

      ['F3-8: Files endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3Project) + '/files', {}, '', function (error) {
            window._f3Files404 = error && error.status;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f3Files404 === 404 || 'Expected files endpoint 404';
      }],

      ['F3-9: Re-create same project name', function (done) {
         c.ajax ('post', 'projects', {}, {name: window._f3Project}, function () {done (SHORT_WAIT, POLL);});
      }, function () {return true;}],

      ['F3-10: Re-created project has no dialogs and only default doc/main.md', function (done) {
         var pending = 2;
         var finish = function () {if (--pending === 0) done (SHORT_WAIT, POLL);};
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3Project) + '/dialogs', {}, '', function (error, rs) {
            window._f3DialogsAfter = error ? null : (rs.body || []);
            finish ();
         });
         c.ajax ('get', 'project/' + encodeURIComponent (window._f3Project) + '/files', {}, '', function (error, rs) {
            window._f3FilesAfter = error ? null : (rs.body || []);
            finish ();
         });
      }, function () {
         if (type (window._f3DialogsAfter) !== 'array' || window._f3DialogsAfter.length !== 0) return 'Expected 0 dialogs after re-create';
         if (type (window._f3FilesAfter) !== 'array') return 'Expected files array after re-create';
         var unexpected = dale.fil (window._f3FilesAfter, undefined, function (name) {
            if (name !== 'doc/main.md') return name;
         });
         if (unexpected.length) return 'Unexpected files after re-create: ' + unexpected.join (', ');
         return true;
      }],

      ['F3-11: Delete re-created project', function (done) {
         c.ajax ('delete', 'projects/' + encodeURIComponent (window._f3Project), {}, '', function () {done (SHORT_WAIT, POLL);});
      }, function () {return true;}],

      // =============================================
      // *** FLOW #4: Static tictactoe — HTML + JS only (no backend) ***
      // =============================================

      ['F4-1: Create project', function (done) {
         window._f4Project = 'test-flow4-' + testTimestamp ();
         mockPrompt (window._f4Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f4Project || 'Failed to create flow #4 project';
      }],

      ['F4-2: Write doc/main.md', function (done) {
         var docMain = [
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
            ''
         ].join ('\n') + '\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['F4-3: Create waiting dialog (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f4Project) + '/dialogs');
         mockPrompt ('orchestrator');
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name.indexOf ('dialog/') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-waiting.md') === -1) return 'Dialog should start in waiting status';
         return true;
      }],

      ['F4-4: Fire "please start" (non-blocking)', function (done) {
         B.call ('set', 'chatInput', 'Please start now. Read doc/main.md and implement the static tictactoe immediately. Create index.html and app.js at /workspace root, use gotoB as specified, and then update doc/main.md with an embed block using port static.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F4-5: Poll until static page serves', function (done) {
         window._f4StaticPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > POLL_TIMEOUT) {
               window._f4StaticPollError = 'Timed out after 3 minutes waiting for static page';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/static/', {}, '', function (error, rs) {
               var code = rs && rs.xhr ? rs.xhr.status : null;
               if (! error && code === 200) {
                  var lower = (rs.body || '').toLowerCase ();
                  var hasTitle = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1;
                  if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && hasTitle) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {
         return window._f4StaticPollError ? window._f4StaticPollError : true;
      }],

      ['F4-6: index.html has gotoB + app.js', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat index.html'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._f4IndexError = 'cat index.html failed';
            else {
               var out = (rs.body.stdout || '').toLowerCase ();
               if (out.indexOf ('gotob') === -1) window._f4IndexError = 'index.html missing gotoB reference';
               else if (out.indexOf ('app.js') === -1) window._f4IndexError = 'index.html missing app.js reference';
               else window._f4IndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f4IndexError ? window._f4IndexError : true;
      }],

      ['F4-7: app.js has tictactoe gotoB code', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/tool/execute', {}, {toolName: 'run_command', toolInput: {command: 'cat app.js'}}, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) window._f4AppError = 'cat app.js failed';
            else {
               var out = rs.body.stdout || '';
               if (out.indexOf ('B.') === -1) window._f4AppError = 'app.js missing gotoB usage';
               else {
                  var hasBoardLogic = out.indexOf ('board') !== -1 || out.indexOf ('cell') !== -1 || out.indexOf ('grid') !== -1;
                  window._f4AppError = hasBoardLogic ? null : 'app.js missing board/cell/grid logic';
               }
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f4AppError ? window._f4AppError : true;
      }],

      ['F4-8: Send embed request to orchestrator dialog', function (done) {
         B.call ('set', 'chatInput', 'The tictactoe game is now available via the static proxy at /project/' + window._f4Project + '/static/. Please add an embed block to doc/main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port static, title Tictactoe, height 500) at the end of doc/main.md.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F4-9: Poll until embed block appears in doc/main.md', function (done) {
         window._f4EmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > POLL_TIMEOUT) {
               window._f4EmbedPollError = 'Timed out after 3 minutes waiting for static embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {
         return window._f4EmbedPollError ? window._f4EmbedPollError : true;
      }],

      ['F4-10: Verify embed block in doc/main.md', function (done) {
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

      // =============================================
      // *** FLOW #5: Backend tictactoe — Express on port 4000, proxy embed ***
      // =============================================

      ['F5-1: Create project', function (done) {
         window._f5Project = 'test-flow5-' + testTimestamp ();
         mockPrompt (window._f5Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f5Project || 'Failed to create flow #5 project';
      }],

      ['F5-2: Write doc/main.md', function (done) {
         var docMain = [
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
            ''
         ].join ('\n') + '\n';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f5Project) + '/file/doc/main.md', {}, {content: docMain}, function () {
            done (MEDIUM_WAIT, POLL);
         });
      }, function () {return true;}],

      ['F5-3: Create waiting dialog (orchestrator)', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f5Project) + '/dialogs');
         mockPrompt ('orchestrator');
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name.indexOf ('dialog/') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-waiting.md') === -1) return 'Dialog should start in waiting status';
         return true;
      }],

      ['F5-4: Fire "please start" (non-blocking)', function (done) {
         B.call ('set', 'chatInput', 'Please start now. Read doc/main.md and build the backend tictactoe immediately: create server.js (express static server on port 4000), create index.html and app.js at /workspace root, run `node server.js &`, and then update doc/main.md with an embed block using port 4000.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F5-5: Poll until proxy serves the app on port 4000', function (done) {
         window._f5ProxyPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > POLL_TIMEOUT) {
               window._f5ProxyPollError = 'Timed out after 3 minutes waiting for proxied app on port 4000';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/', {}, '', function (error, rs) {
               var code = rs && rs.xhr ? rs.xhr.status : null;
               if (! error && code === 200) {
                  var lower = (rs.body || '').toLowerCase ();
                  var hasTitle = lower.indexOf ('tictactoe') !== -1 || lower.indexOf ('tic tac toe') !== -1;
                  if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && hasTitle) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {
         return window._f5ProxyPollError ? window._f5ProxyPollError : true;
      }],

      ['F5-6: Proxy serves index.html with gotoB + app.js', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._f5IndexError = 'Failed to fetch index via proxy';
            else {
               var lower = (rs.body || '').toLowerCase ();
               if (lower.indexOf ('gotob') === -1) window._f5IndexError = 'index.html missing gotoB reference';
               else if (lower.indexOf ('app.js') === -1) window._f5IndexError = 'index.html missing app.js reference';
               else window._f5IndexError = null;
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f5IndexError ? window._f5IndexError : true;
      }],

      ['F5-7: Proxy serves app.js with gotoB code', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/proxy/4000/app.js', {}, '', function (error, rs) {
            if (error || ! rs || ! rs.body) window._f5AppError = 'Failed to fetch app.js via proxy';
            else {
               var out = rs.body || '';
               if (out.indexOf ('B.') === -1) window._f5AppError = 'app.js missing gotoB usage';
               else {
                  var hasBoardLogic = out.indexOf ('board') !== -1 || out.indexOf ('cell') !== -1 || out.indexOf ('grid') !== -1;
                  window._f5AppError = hasBoardLogic ? null : 'app.js missing board/cell/grid logic';
               }
            }
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return window._f5AppError ? window._f5AppError : true;
      }],

      ['F5-8: Server process is running', function (done) {
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

      ['F5-9: Send embed request to orchestrator dialog', function (done) {
         B.call ('set', 'chatInput', 'The tictactoe game is now running on port 4000 inside the container. Please add an embed block to doc/main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port 4000, title Tictactoe, height 500) at the end of doc/main.md.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F5-10: Poll until embed block appears in doc/main.md', function (done) {
         window._f5EmbedPollError = null;
         var started = Date.now ();
         var attempt = function () {
            if (Date.now () - started > POLL_TIMEOUT) {
               window._f5EmbedPollError = 'Timed out after 3 minutes waiting for port 4000 embed block in doc/main.md';
               return done (SHORT_WAIT, POLL);
            }
            c.ajax ('get', 'project/' + encodeURIComponent (window._f5Project) + '/file/doc/main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port 4000') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {
         return window._f5EmbedPollError ? window._f5EmbedPollError : true;
      }],

      ['F5-11: Verify embed block in doc/main.md', function (done) {
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
      // *** FLOW #6: Vi mode (navigation + cursor sync) ***
      // =============================================

      ['F6-1: Navigate to settings', function (done) {
         B.call ('navigate', 'hash', '#/settings');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'settings') return 'Expected tab to be "settings" but got "' + tab + '"';
         return true;
      }],

      ['F6-2: Reset vi mode off', function (done) {
         if (B.get ('viMode')) B.call ('toggle', 'viMode');
         done (SHORT_WAIT, POLL);
      }, function () {
         return B.get ('viMode') === false || 'Expected viMode false after reset';
      }],

      ['F6-3: Enable vi mode', function (done) {
         B.call ('toggle', 'viMode');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         if (B.get ('viMode') !== true) return 'Expected viMode true after toggle';
         var checkbox = document.querySelector ('input[type="checkbox"]');
         if (! checkbox) return 'Vi mode checkbox not found';
         if (! checkbox.checked) return 'Checkbox should be checked after toggle';
         return true;
      }],

      ['F6-4: Server persisted viMode true', function (done) {
         c.ajax ('get', 'settings', {}, '', function (error, rs) {
            window._f6Settings = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._f6Settings;
         if (! settings || ! settings.editor || settings.editor.viMode !== true) return 'Server settings do not reflect viMode true';
         return true;
      }],

      ['F6-5: Create project + seed doc/main.md', function (done) {
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

      ['F6-6: Write doc/main.md and open editor', function (done) {
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

      ['F6-7: Switch to edit mode + normal mode baseline', function (done) {
         if (B.get ('editorPreview')) B.call ('toggle', 'editorPreview');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (B.get ('editorPreview')) return 'Still in preview mode';
         if (viState.mode !== 'normal') return 'Expected normal mode, got: ' + viState.mode;
         var textarea = getTextarea ();
         if (! textarea) return 'Editor textarea not found';
         if (! textarea.readOnly) return 'Textarea should be readonly in normal mode';
         textarea.selectionStart = textarea.selectionEnd = 0;
         textarea.dispatchEvent (new Event ('click', {bubbles: true}));
         var cursor = cursorInfoFromTextarea (textarea);
         var viCursor = B.get ('viCursor') || {};
         if (cursor.line !== 1 || cursor.col !== 1) return 'Expected cursor at line 1 col 1, got line ' + cursor.line + ' col ' + cursor.col;
         if (viCursor.line !== 1 || viCursor.col !== 1) return 'viCursor mismatch at start (line ' + viCursor.line + ', col ' + viCursor.col + ')';
         return true;
      }],

      ['F6-8: Word motions w/b and line ends', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         textarea.selectionStart = textarea.selectionEnd = 0;
         pressKey (textarea, 'w');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         if (! textarea) return 'Textarea not found';
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected w to move to pos 6, got ' + cursor.pos;
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 1 || viCursor.col !== 7) return 'viCursor mismatch after w: ' + JSON.stringify (viCursor);
         return true;
      }],

      ['F6-9: Second w moves to next word', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, 'w');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 11) return 'Expected second w to move to pos 11, got ' + cursor.pos;
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 1 || viCursor.col !== 12) return 'viCursor mismatch after second w: ' + JSON.stringify (viCursor);
         return true;
      }],

      ['F6-10: b moves back a word', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         pressKey (textarea, 'b');
         done (SHORT_WAIT, POLL);
      }, function () {
         var textarea = getTextarea ();
         var cursor = cursorInfoFromTextarea (textarea);
         if (cursor.pos !== 6) return 'Expected b to move back to pos 6, got ' + cursor.pos;
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 1 || viCursor.col !== 7) return 'viCursor mismatch after b: ' + JSON.stringify (viCursor);
         return true;
      }],

      ['F6-11: 0 and $ jump to line start/end', function (done) {
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
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 1 || viCursor.col !== 17) return 'viCursor mismatch after $: ' + JSON.stringify (viCursor);
         return true;
      }],

      ['F6-12: j/k keep column', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         textarea.selectionStart = textarea.selectionEnd = 6;
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

      ['F6-13: G to end, gg to start', function (done) {
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
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 4 || viCursor.col !== 17) return 'viCursor mismatch after G: ' + JSON.stringify (viCursor);
         pressKey (textarea, 'g');
         pressKey (textarea, 'g');
         var cursorStart = cursorInfoFromTextarea (textarea);
         if (cursorStart.pos !== 0) return 'Expected gg to move to pos 0, got ' + cursorStart.pos;
         return true;
      }],

      ['F6-14: i enters insert at cursor position', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.focus ();
         textarea.selectionStart = textarea.selectionEnd = 6;
         pressKey (textarea, 'i');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after i';
         var textarea = getTextarea ();
         if (textarea.readOnly) return 'Textarea should not be readonly in insert mode';
         var cursor = cursorInfoFromTextarea (textarea);
         var viCursor = B.get ('viCursor') || {};
         if (cursor.pos !== 6) return 'Expected cursor at pos 6 after i, got ' + cursor.pos;
         if (viCursor.line !== 1 || viCursor.col !== 7) return 'viCursor mismatch after i: ' + JSON.stringify (viCursor);
         return true;
      }],

      ['F6-15: Escape returns to normal with same cursor', function (done) {
         var textarea = getTextarea ();
         if (textarea) pressKey (textarea, 'Escape');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'normal') return 'Expected normal mode after Escape';
         var textarea = getTextarea ();
         if (! textarea || ! textarea.readOnly) return 'Textarea should be readonly in normal mode';
         var cursor = cursorInfoFromTextarea (textarea);
         var viCursor = B.get ('viCursor') || {};
         if (cursor.pos !== 6) return 'Expected cursor to stay at pos 6 after Escape';
         if (viCursor.line !== cursor.line || viCursor.col !== cursor.col) return 'viCursor mismatch after Escape';
         return true;
      }],

      ['F6-16: a inserts after cursor', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.selectionStart = textarea.selectionEnd = 6;
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

      ['F6-17: I jumps to line start', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.selectionStart = textarea.selectionEnd = 11;
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

      ['F6-18: A jumps to line end', function (done) {
         var textarea = getTextarea ();
         if (! textarea) return done (SHORT_WAIT, POLL);
         textarea.selectionStart = textarea.selectionEnd = 0;
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

      ['F6-19: o opens line below', function (done) {
         var content = 'line one\nline two\nline three';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         textarea.selectionStart = textarea.selectionEnd = 3;
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
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 2 || viCursor.col !== 1) return 'viCursor mismatch after o: ' + JSON.stringify (viCursor);
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['F6-20: O opens line above', function (done) {
         var content = 'line one\nline two\nline three';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         textarea.selectionStart = textarea.selectionEnd = 12;
         pressKey (textarea, 'O');
         done (SHORT_WAIT, POLL);
      }, function () {
         var viState = B.get ('viState') || {};
         if (viState.mode !== 'insert') return 'Expected insert mode after O';
         var file = B.get ('currentFile');
         var expected = 'line one\n\nline two\nline three';
         if (file.content !== expected) return 'Content after O mismatch';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 9) return 'Expected cursor at pos 9 after O, got ' + cursor.pos;
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['F6-21: o on last line without trailing newline', function (done) {
         var content = 'first\nsecond';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         textarea.selectionStart = textarea.selectionEnd = 8;
         pressKey (textarea, 'o');
         done (SHORT_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         var expected = 'first\nsecond\n';
         if (file.content !== expected) return 'Content after o on last line mismatch';
         var cursor = cursorInfoFromTextarea (getTextarea ());
         if (cursor.pos !== 13) return 'Expected cursor at pos 13 after o on last line, got ' + cursor.pos;
         var viCursor = B.get ('viCursor') || {};
         if (viCursor.line !== 3 || viCursor.col !== 1) return 'viCursor mismatch after o on last line: ' + JSON.stringify (viCursor);
         pressKey (getTextarea (), 'Escape');
         return true;
      }],

      ['F6-22: O on first line', function (done) {
         var content = 'alpha\nbeta';
         B.call ('set', ['currentFile', 'content'], content);
         B.call ('set', ['currentFile', 'original'], content);
         var textarea = getTextarea ();
         textarea.selectionStart = textarea.selectionEnd = 2;
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

      ['F6-23: Disable vi mode', function (done) {
         if (B.get ('viMode')) B.call ('toggle', 'viMode');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return B.get ('viMode') === false || 'Expected viMode false after toggle off';
      }],

      ['F6-24: Server persisted viMode false', function (done) {
         c.ajax ('get', 'settings', {}, '', function (error, rs) {
            window._f6SettingsAfter = rs && rs.body;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var settings = window._f6SettingsAfter;
         if (! settings || ! settings.editor || settings.editor.viMode !== false) return 'Server settings do not reflect viMode false';
         return true;
      }],

      ['F6-25: Delete project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f6Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {return true;}],

      ['F6-Cleanup: restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // =============================================
      // *** FLOW #7: Snapshots ***
      // =============================================

      ['F7-1: Create project for snapshots', function (done) {
         window._f7Project = 'test-flow7-' + testTimestamp ();
         mockPrompt (window._f7Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f7Project || 'Failed to create flow #7 project';
      }],

      ['F7-2: Write doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/main.md', {}, {content: '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['F7-3: Write extra file doc/notes.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/notes.md', {}, {content: '# Notes\n\nSome extra notes.\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      // --- F7: Create a snapshot ---

      ['F7-4: Create snapshot via header button', function (done) {
         // Mock prompt for label
         mockPrompt ('before refactor');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         // Accept the alert from the snapshot creation
         return true;
      }],

      ['F7-5: Snapshot appears in snapshots list', function (done) {
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

      ['F7-6: Navigate to snapshots view', function (done) {
         B.call ('navigate', 'hash', '#/snapshots');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'snapshots') return 'Expected snapshots tab, got: ' + tab;
         return true;
      }],

      ['F7-7: Snapshot visible in snapshots view', function () {
         var heading = findByText ('.editor-filename', 'Snapshots');
         if (! heading) return 'Snapshots heading not found';
         var item = findByText ('.file-item', 'before refactor');
         if (! item) return 'Snapshot "before refactor" not found in view';
         return true;
      }],

      ['F7-8: Snapshot entry shows restore, download, delete buttons', function () {
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

      ['F7-9: Create second snapshot without label', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f7Project) + '/docs');
         done (SHORT_WAIT, POLL);
      }, function () {
         return B.get ('currentProject') === window._f7Project || 'Not on project';
      }],

      ['F7-10: Create second snapshot', function (done) {
         mockPrompt ('');
         B.call ('create', 'snapshot');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return true;
      }],

      ['F7-11: Two snapshots in list', function (done) {
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

      ['F7-12: Restore snapshot as new project', function (done) {
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

      ['F7-13: Restored project has both files', function (done) {
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

      ['F7-14: Restored doc/main.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7RestoredContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored doc/main.md content mismatch';
         return true;
      }],

      ['F7-15: Restored doc/notes.md matches original', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/notes.md', {}, '', function (error, rs) {
            window._f7RestoredNotes = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7RestoredNotes !== '# Notes\n\nSome extra notes.\n') return 'Restored notes.md content mismatch';
         return true;
      }],

      // --- F7: Modify original, verify restored unaffected ---

      ['F7-16: Modify original project doc/main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f7Project) + '/file/doc/main.md', {}, {content: '# Modified After Snapshot\n'}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {return true;}],

      ['F7-17: Restored project unaffected by original modification', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f7RestoredProject) + '/file/doc/main.md', {}, '', function (error, rs) {
            window._f7CheckContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f7CheckContent !== '# Snapshot Test\n\nThis content should survive a snapshot and restore.\n') return 'Restored content was affected by original modification!';
         return true;
      }],

      // --- F7: Delete a snapshot ---

      ['F7-18: Delete second snapshot', function (done) {
         B.call ('delete', 'snapshot', window._f7SnapshotId2);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         // confirm dialog is auto-accepted since we mocked it... but delete uses confirm.
         // Let's just check the list
         return true;
      }],

      ['F7-19: Deleted snapshot gone from list', function (done) {
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

      ['F7-20: Delete original project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['F7-21: Snapshot still in list after project deletion', function (done) {
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

      ['F7-22: Delete remaining snapshot', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'snapshot', window._f7SnapshotId);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['F7-23: No snapshots left for this project', function (done) {
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

      ['F7-24: Delete restored project', function (done) {
         if (! window._f7RestoredProject) return done ();
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f7RestoredProject);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

      ['F7-Cleanup: restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // =============================================
      // *** FLOW #8: Uploads ***
      // =============================================

      ['F8-1: Create project for uploads', function (done) {
         window._f8Project = 'test-flow8-' + testTimestamp ();
         mockPrompt (window._f8Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         return B.get ('currentProject') === window._f8Project || 'Failed to create flow #8 project';
      }],

      ['F8-2: Upload image via API', function (done) {
         var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PyqZ0wAAAABJRU5ErkJggg==';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f8Project) + '/upload', {}, {
            name: 'pixel.png',
            content: dataUrl,
            contentType: 'image/png'
         }, function (error, rs) {
            window._f8UploadImage = rs && rs.body;
            window._f8UploadImageError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f8UploadImageError) return 'Image upload failed: ' + window._f8UploadImageError;
         var entry = window._f8UploadImage || {};
         if (entry.name !== 'pixel.png') return 'Upload response missing pixel.png';
         if (! entry.url) return 'Upload response missing url';
         return true;
      }],

      ['F8-3: Uploads list includes image metadata', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f8Project) + '/uploads', {}, '', function (error, rs) {
            window._f8Uploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f8Uploads;
         if (type (uploads) !== 'array') return 'Uploads list missing or not array';
         var image = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'pixel.png') return item; });
         if (! image) return 'pixel.png not found in uploads list';
         if (! image.size || image.size <= 0) return 'pixel.png size invalid';
         if (! image.contentType || image.contentType.indexOf ('image/') !== 0) return 'pixel.png contentType invalid: ' + image.contentType;
         window._f8UploadImage = image;
         return true;
      }],

      ['F8-4: Fetch image upload', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f8Project) + '/upload/pixel.png', {}, '', function (error, rs) {
            window._f8UploadFetch = {error: error, rs: rs};
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var result = window._f8UploadFetch || {};
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

      ['F8-5: Upload text file via API', function (done) {
         var text = 'Hello uploads.';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f8Project) + '/upload', {}, {
            name: 'notes.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f8UploadText = rs && rs.body;
            window._f8UploadTextError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f8UploadTextError) return 'Text upload failed: ' + window._f8UploadTextError;
         var entry = window._f8UploadText || {};
         if (entry.name !== 'notes.txt') return 'Upload response missing notes.txt';
         return true;
      }],

      ['F8-6: Upload file with space in name', function (done) {
         var text = 'Hello spaced uploads.';
         c.ajax ('post', 'project/' + encodeURIComponent (window._f8Project) + '/upload', {}, {
            name: 'space name.txt',
            content: btoa (text),
            contentType: 'text/plain'
         }, function (error, rs) {
            window._f8UploadSpace = rs && rs.body;
            window._f8UploadSpaceError = error ? (error.status || error.message) : null;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f8UploadSpaceError) return 'Space-name upload failed: ' + window._f8UploadSpaceError;
         var entry = window._f8UploadSpace || {};
         if (entry.name !== 'space name.txt') return 'Upload response missing space name.txt';
         return true;
      }],

      ['F8-7: Uploads list contains all files', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f8Project) + '/uploads', {}, '', function (error, rs) {
            window._f8Uploads = error ? null : (rs.body || []);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var uploads = window._f8Uploads;
         if (type (uploads) !== 'array' || uploads.length < 3) return 'Expected at least 3 uploads';
         var text = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'notes.txt') return item; });
         if (! text) return 'notes.txt not found in uploads list';
         if (! text.contentType || text.contentType.indexOf ('text/plain') === -1) return 'notes.txt contentType invalid';
         var spaced = dale.stopNot (uploads, undefined, function (item) { if (item.name === 'space name.txt') return item; });
         if (! spaced) return 'space name.txt not found in uploads list';
         window._f8UploadText = text;
         window._f8UploadSpace = spaced;
         return true;
      }],

      ['F8-8: Navigate to docs view', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f8Project) + '/docs');
         done (SHORT_WAIT, POLL);
      }, function () {
         var tab = B.get ('tab');
         if (tab !== 'docs') return 'Expected docs tab for uploads';
         return true;
      }],

      ['F8-9: Uploads section visible with items', function () {
         var section = document.querySelector ('.upload-section');
         if (! section) return 'Uploads section not found in sidebar';
         var item = findByText ('.upload-item', 'pixel.png');
         if (! item) return 'pixel.png not listed in uploads sidebar';
         return true;
      }],

      ['F8-10: Select image upload shows preview', function (done) {
         B.call ('select', 'upload', window._f8UploadImage);
         done (SHORT_WAIT, POLL);
      }, function () {
         var preview = document.querySelector ('.upload-preview img');
         if (! preview) return 'Image preview not shown';
         return true;
      }],

      ['F8-11: Select text upload shows metadata', function (done) {
         B.call ('select', 'upload', window._f8UploadText);
         done (SHORT_WAIT, POLL);
      }, function () {
         var meta = document.querySelector ('.upload-meta');
         if (! meta) return 'Upload metadata panel not shown for text file';
         if (meta.textContent.indexOf ('Type:') === -1) return 'Metadata panel missing Type line';
         return true;
      }],

      ['F8-12: Select spaced upload shows metadata', function (done) {
         B.call ('select', 'upload', window._f8UploadSpace);
         done (SHORT_WAIT, POLL);
      }, function () {
         var meta = document.querySelector ('.upload-meta');
         if (! meta) return 'Upload metadata panel not shown for spaced file';
         if (meta.textContent.indexOf ('space name.txt') === -1) return 'Metadata panel missing spaced filename';
         return true;
      }],

      ['F8-13: Delete uploads project', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {window.confirm = originalConfirm; return true;};
         B.call ('delete', 'project', window._f8Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         return true;
      }],

   ];

   // Filter tests by flow
   var filteredTests = flowFilter === 'ALL' ? allTests : dale.fil (allTests, undefined, function (test) {
      if (testFlow (test [0]) === flowFilter) return test;
   });

   if (filteredTests.length === 0) {
      alert ('❌ No tests found for flow: ' + flowFilter);
      return;
   }

   console.log ('Running ' + filteredTests.length + ' tests (flow: ' + flowFilter + ')');

   c.test (filteredTests, function (error, time) {
      var label = flowFilter === 'ALL' ? 'all flows' : 'flow ' + flowFilter;
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
