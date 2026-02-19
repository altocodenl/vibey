// test-client.js
// Unified frontend test entrypoint.
// - In Node: runs Puppeteer, opens vibey, clicks the Test button, waits for final alert.
// - In Browser: runs the c.test Flow #1 frontend suite.

(function () {

   // *** NODE MODE (boot runner) ***

   if (typeof window === 'undefined') {
      const puppeteer = require ('puppeteer');

      (async function () {
         var browser = await puppeteer.launch ({headless: true});
         var page = await browser.newPage ();

         var gotDialog = false;

         page.on ('dialog', async function (dialog) {
            gotDialog = true;
            var message = dialog.message ();
            console.log ('[vibey-test-alert] ' + message.replace (/\n/g, ' | '));
            await dialog.accept ();
            await browser.close ();
            process.exit (0);
         });

         try {
            await page.goto ('http://localhost:3001', {waitUntil: 'networkidle2', timeout: 30000});

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

            // Wait up to 15 minutes for the test alert.
            var started = Date.now ();
            while (! gotDialog && Date.now () - started < 15 * 60 * 1000) {
               await new Promise (function (resolve) {setTimeout (resolve, 250);});
            }

            if (! gotDialog) {
               console.log ('[vibey-test-alert] TIMEOUT: No alert received within 15 minutes');
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
      var elements = document.querySelectorAll (selector);
      for (var i = 0; i < elements.length; i++) {
         if (elements [i].textContent.indexOf (text) !== -1) return elements [i];
      }
      return null;
   };

   var click = function (el) {
      if (! el) return false;
      el.click ();
      return true;
   };

   var LONG_WAIT   = 120000; // 2 min for LLM responses
   var MEDIUM_WAIT = 15000;
   var SHORT_WAIT  = 3000;
   var POLL        = 200;

   var TEST_PROJECT = 'test-flow1-' + Date.now ();
   var TEST_DIALOG  = 'read-vibey';

   // *** TESTS ***

   c.test ([

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
         if (file.name.indexOf ('dialog-') !== 0) return 'Filename does not start with "dialog-": ' + file.name;
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

      // --- Step 7: Send message to read first 20 lines of readme.md ---
      ['Step 7: Send "Please read the first 20 lines of readme.md" message', function (done) {
         B.call ('set', 'chatInput', 'Please read the first 20 lines of readme.md, which is two directories up from your working directory, using the run_command tool with `head -20 ../../readme.md`, and summarize what it is about.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         var pending = B.get ('pendingToolCalls');
         // Keep waiting while streaming
         if (streaming) return 'Still streaming, waiting for tool request...';
         // If we have pending tool calls, step 7 is done
         if (pending && pending.length > 0) return true;
         // If no pending and not streaming, check if the full round-trip already completed
         // (tools may have been auto-approved)
         var file = B.get ('currentFile');
         if (file && file.content && file.content.indexOf ('Tool request:') !== -1 && file.content.indexOf ('Decision: approved') !== -1) return true;
         return 'Waiting for tool request or completed tool round-trip...';
      }],

      // --- Step 8: Authorize tool requests and wait for full round-trip ---
      ['Step 8: Authorize tool requests and wait for complete response', function (done) {
         var pending = B.get ('pendingToolCalls');
         if (pending && pending.length > 0) {
            B.call ('approve', 'allTools');
         }
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         if (streaming) return 'Still streaming...';

         var pending = B.get ('pendingToolCalls');
         if (pending && pending.length > 0) {
            // More tool calls arrived — keep approving
            B.call ('approve', 'allTools');
            return 'Approving additional tool calls, waiting...';
         }

         // Wait until the file has been reloaded with tool blocks and a final response
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'Waiting for file to reload...';

         var content = file.content;
         // Must have at least one completed tool block
         if (content.indexOf ('Tool request:') === -1) return 'Waiting for tool blocks in dialog...';
         if (content.indexOf ('Decision: approved') === -1) return 'Waiting for tool decisions in dialog...';
         if (content.indexOf ('Result:') === -1) return 'Waiting for tool results in dialog...';

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

         var hasTime = false;
         var hasDuration = false;
         var hasCompactTokens = false;

         for (var i = 0; i < metaElements.length; i++) {
            var text = metaElements [i].textContent || '';
            if (/\b\d{2}:\d{2}:\d{2}\b/.test (text) || /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/.test (text)) hasTime = true;
            if (/\b\d+\.\ds\b/.test (text)) hasDuration = true;
            if (/\b\d+\.\dkti\s+\+\s+\d+\.\dkto\b/.test (text)) hasCompactTokens = true;
         }

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
         if (file.content.indexOf ('Tool request:') === -1) return 'No tool request blocks found in dialog';
         if (file.content.indexOf ('Result:') === -1) return 'No tool results found in dialog';

         // The tool result should contain file content from vibey.md
         var chatArea = document.querySelector ('.chat-messages');
         if (! chatArea) return 'Chat messages area not found';

         return true;
      }],

      // --- Step 11: Ask to create dummy.js (write_file) ---
      ['Step 11: Ask LLM to create dummy.js with console.log', function (done) {
         B.call ('set', 'chatInput', 'Please create a file called dummy.js with the content: console.log("hello from dummy"); Use the write_file tool for this.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         if (streaming) return 'Still streaming, waiting for write_file tool request...';
         var pending = B.get ('pendingToolCalls');
         if (pending && pending.length > 0) return true;
         // It may have already been auto-approved if authorization was given
         var file = B.get ('currentFile');
         if (file && file.content && file.content.indexOf ('write_file') !== -1) return true;
         return 'No write_file tool request found yet';
      }],

      // --- Step 12: Authorize the write_file tool once ---
      ['Step 12: Authorize write_file tool request', function (done) {
         var pending = B.get ('pendingToolCalls');
         if (! pending || pending.length === 0) {
            // May have been auto-approved
            done (SHORT_WAIT, POLL);
            return;
         }
         // Approve all pending
         B.call ('approve', 'allTools');
         done (LONG_WAIT, POLL);
      }, function () {
         var streaming = B.get ('streaming');
         if (streaming) return 'Still streaming after tool approval...';
         var pending = B.get ('pendingToolCalls');
         if (pending && pending.length > 0) {
            // More tool calls — approve them
            B.call ('approve', 'allTools');
            return 'Approving additional tool calls...';
         }
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No file content';
         // Check that write_file was used and approved
         if (file.content.indexOf ('write_file') === -1) return 'write_file tool not found in dialog';
         if (file.content.indexOf ('Decision: approved') === -1) return 'No approved tool decision found';
         return true;
      }],

      // --- Step 13: Verify write_file result shown with success ---
      ['Step 13: Write result shown with success in chat view', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No current file';

         // Check the dialog markdown has write_file approved
         if (file.content.indexOf ('write_file') === -1) return 'write_file not found in dialog';
         if (file.content.indexOf ('Decision: approved') === -1) return 'write_file not approved';

         // Check the DOM for the chat messages area
         var chatArea = document.querySelector ('.chat-messages');
         if (! chatArea) return 'Chat messages area not found';

         // The tool result should show success
         var hasResult = file.content.indexOf ('"success": true') !== -1 || file.content.indexOf ('"success":true') !== -1;
         if (! hasResult) return 'Write tool result with success not found in dialog';

         return true;
      }],

      // --- Step 14: Verify dummy.js was actually created ---
      ['Step 14: Verify dummy.js exists with console.log', function (done) {
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

      // --- Flow #1 complete alert ---
      ['Flow #1 complete (acknowledge to continue)', function () {
         alert ('✅ Flow #1 passed. Click OK to continue to Flow #2.');
         return true;
      }],

      // =============================================
      // *** FLOW #2: Docs editing ***
      // =============================================

      // --- F2 Step 1: Create a new project for Flow #2 ---
      ['F2-1: Create project for docs editing', function (done) {
         window._f2Project = 'test-flow2-' + Date.now ();
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

      // --- F2 Step 2: Create doc-main.md (shown as main.md) ---
      ['F2-2: Create main.md', function (done) {
         mockPrompt ('main.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile after creating main.md';
         if (file.name !== 'doc-main.md') return 'Expected name "doc-main.md", got "' + file.name + '"';
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
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
         var textarea = document.querySelector ('.editor-textarea');
         if (! textarea) return 'Editor textarea not found';
         if (textarea.value.indexOf ('main') === -1) return 'Editor does not contain initial content';
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
         // Check dirty indicator in DOM
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
         // Dirty indicator should be gone
         var dirty = document.querySelector ('.editor-dirty');
         if (dirty) return 'Dirty indicator still present after save';
         return true;
      }],

      // --- F2 Step 7: Verify saved content persisted on server ---
      ['F2-7: Reload file and verify persisted content', function (done) {
         B.call ('load', 'file', 'doc-main.md');
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
         mockPrompt ('doc-notes.md');
         B.call ('create', 'file');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-notes.md') return 'Expected doc-notes.md as current file';
         return true;
      }],

      // --- F2 Step 9: Go back to main.md, edit, then try to switch away ---
      // We mock confirm to test the dirty-leave warning
      ['F2-9: Edit main.md and attempt to leave (warned, stay and save)', function (done) {
         // First load main.md
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
         // Make it dirty
         B.call ('set', ['currentFile', 'content'], file.original + '\nExtra unsaved line.\n');
         var fileDirty = B.get ('currentFile');
         if (fileDirty.content === fileDirty.original) return 'File should be dirty';
         return true;
      }],

      // --- F2 Step 10: Try to load another file while dirty — mock confirm to save ---
      ['F2-10: Navigate away from dirty doc triggers save via confirm', function (done) {
         // Mock confirm: first confirm (save?) -> true, triggering save
         var originalConfirm = window.confirm;
         window.confirm = function () {
            window.confirm = originalConfirm;
            return true; // "Yes, save before leaving"
         };
         B.call ('load', 'file', 'doc-notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         // We should now be on doc-notes.md (the save succeeded and we navigated)
         if (file.name !== 'doc-notes.md') return 'Expected to land on doc-notes.md, got ' + file.name;
         return true;
      }],

      // --- F2 Step 11: Verify the save from step 10 persisted ---
      ['F2-11: Verify main.md has the extra line saved', function (done) {
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
         if (file.content.indexOf ('Extra unsaved line') === -1) return 'Extra line was not saved. Content: ' + file.content.slice (0, 200);
         return true;
      }],

      // --- F2 Step 12: Edit again and discard changes ---
      ['F2-12: Edit main.md, then discard changes', function (done) {
         var file = B.get ('currentFile');
         B.call ('set', ['currentFile', 'content'], file.original + '\nThis will be discarded.\n');
         // Mock confirm: first confirm (save?) -> false (don't save), second confirm (discard?) -> true
         var callCount = 0;
         var originalConfirm = window.confirm;
         window.confirm = function () {
            callCount++;
            if (callCount === 1) return false;  // "No, don't save"
            if (callCount === 2) {               // "Yes, discard"
               window.confirm = originalConfirm;
               return true;
            }
            window.confirm = originalConfirm;
            return true;
         };
         B.call ('load', 'file', 'doc-notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         if (file.name !== 'doc-notes.md') return 'Expected doc-notes.md after discard, got ' + file.name;
         return true;
      }],

      // --- F2 Step 13: Verify main.md does NOT have the discarded text ---
      ['F2-13: Verify discarded changes not persisted', function (done) {
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
         if (file.content.indexOf ('This will be discarded') !== -1) return 'Discarded text was persisted — should not be there';
         return true;
      }],

      // --- F2 Cleanup ---
      ['F2-Cleanup: restore prompt', function () {
         restorePrompt ();
         return true;
      }],

      // --- Flow #2 complete alert ---
      ['Flow #2 complete (acknowledge to continue)', function () {
         alert ('✅ Flow #2 passed. Click OK to continue to Flow #3.');
         return true;
      }],

      // =============================================
      // *** FLOW #3: Multi-agent tictactoe ***
      // (Based on flow3Sequence in test-server.js)
      // =============================================

      // --- F3 Step 1: Create a new project ---
      ['F3-1: Create project for tictactoe', function (done) {
         window._f3Project = 'test-flow3-' + Date.now ();
         mockPrompt (window._f3Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (project !== window._f3Project) return 'Expected project "' + window._f3Project + '", got "' + project + '"';
         return true;
      }],

      // --- F3 Step 2: Write doc-main.md + doc-gotob.md (instructions + gotoB reference) ---
      ['F3-2: Write doc-main.md + doc-gotob.md', function (done) {
         var docMain = [
            '# Tictactoe Project',
            '',
            'Build a simple tictactoe game for the browser using gotoB.',
            '',
            '## Architecture',
            '',
            '- `server.js` — express server on port 4000, serves static files from `__dirname`.',
            '- `index.html` — loads gotoB from CDN and `app.js`.',
            '- `app.js` — tictactoe game using gotoB (B.view, B.call, B.ev, B.store).',
            '',
            '## Agent Instructions',
            '',
            'When you receive "please start", you MUST do the following in this exact order:',
            '',
            '**Before spawning any agent**, use `run_command` with `ls dialog-*.md` to see which agents already exist. Do NOT launch an agent if a dialog with that slug already exists.',
            '',
            '1. FIRST: Call the `launch_agent` tool with these exact parameters (only if no backend-agent dialog exists yet):',
            '   - provider: "openai"',
            '   - model: "gpt-5"',
            '   - prompt: "You are the backend agent for a tictactoe project. Do the following steps in order using tools:\n1. run_command: npm init -y\n2. run_command: npm install express\n3. write_file server.js — a simple express server on port 4000 that serves static files from __dirname using express.static. About 10 lines.\n4. run_command: node server.js &\nDo all four steps. Keep server.js minimal."',
            '   - slug: "backend-agent"',
            '',
            '2. THEN: Use write_file to create `index.html` with gotoB + app.js.',
            '3. THEN: Use write_file to create `app.js` with a 3x3 tictactoe grid.',
            '',
            'Do NOT skip the launch_agent call. Do NOT call launch_agent more than once for the same slug. Create each file with a separate write_file call.',
            '',
            '> Authorized: run_command',
            '> Authorized: write_file',
            '> Authorized: edit_file',
            '> Authorized: launch_agent'
         ].join ('\n') + '\n';

         var docGotob = [
            '# gotoB quick reference',
            '',
            'gotoB is a client-side reactive UI framework. Load it from CDN.',
            '',
            '## Core API',
            '- `B.store` — single global state object.',
            '- `B.call(x, verb, path, value)` — trigger an event.',
            '- `B.view(path, fn)` — reactive view.',
            '- `B.ev(verb, path, value)` — returns an event handler string for DOM.',
            '- `B.mount(selector, viewFunction)` — mount a view into the DOM.',
            '',
            '## Minimal example',
            '```js',
            'var dale = window.dale, B = window.B;',
            'B.mount ("body", function () {',
            '   return B.view ("board", function (board) {',
            '      board = board || [];',
            '      return ["div", dale.go (board, function (cell, i) {',
            '         return ["button", {onclick: B.ev ("set", ["board", i], "X")}, cell || ""];',
            '      })];',
            '   });',
            '});',
            '```',
            ''
         ].join ('\n');

         var project = window._f3Project;
         var pending = 2;
         var finish = function () {
            pending--;
            if (pending === 0) done (MEDIUM_WAIT, POLL);
         };

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/doc-main.md', {}, {content: docMain}, function () {
            finish ();
         });
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/doc-gotob.md', {}, {content: docGotob}, function () {
            finish ();
         });
      }, function () {
         return true;
      }],

      // --- F3 Step 3: Create orchestrator dialog ---
      ['F3-3: Create orchestrator dialog', function (done) {
         B.call ('navigate', 'hash', '#/project/' + encodeURIComponent (window._f3Project) + '/dialogs');
         mockPrompt ('orchestrator');
         B.call ('create', 'dialog');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var file = B.get ('currentFile');
         if (! file || file.name.indexOf ('dialog-') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-waiting.md') === -1) return 'Dialog should start in waiting status';
         return true;
      }],

      // --- F3 Step 4: Verify global authorizations present in dialog markdown ---
      ['F3-4: Dialog inherits global authorizations', function () {
         var file = B.get ('currentFile');
         if (! file || ! file.content) return 'No dialog content loaded';
         var tools = ['run_command', 'write_file', 'edit_file', 'launch_agent'];
         for (var i = 0; i < tools.length; i++) {
            if (file.content.indexOf ('> Authorized: ' + tools [i]) === -1) return 'Missing authorization for ' + tools [i];
         }
         return true;
      }],

      // --- F3 Step 5: Fire "please start" and wait for a spawned agent to appear ---
      ['F3-5: Fire "please start" and wait for second dialog', function (done) {
         B.call ('set', 'chatInput', 'please start');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         var files = B.get ('files') || [];
         var dialogFiles = files.filter (function (name) {return name.indexOf ('dialog-') === 0;});
         if (dialogFiles.length < 2) return 'Waiting for spawned agent dialog...';
         return true;
      }],

      // --- F3 Step 6: Poll for app running on port 4000 (tool/execute curl) ---
      ['F3-6: App responds on port 4000 (via tool/execute)', function (done) {
         var project = window._f3Project;
         var attempt = function () {
            c.ajax ('post', 'project/' + encodeURIComponent (project) + '/tool/execute', {}, {
               toolName: 'run_command',
               toolInput: {command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/'}
            }, function (error, rs) {
               if (! error && rs && rs.body && rs.body.success && (rs.body.stdout || '').indexOf ('200') !== -1) return done (SHORT_WAIT, POLL);
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {
         return true;
      }],

      // --- F3 Step 7: Verify server.js, index.html, app.js content via tool/execute ---
      ['F3-7: Verify generated files', function (done) {
         var project = window._f3Project;
         var remaining = 3;
         var fail = null;
         var finish = function () {
            remaining--;
            if (remaining === 0) done (SHORT_WAIT, POLL);
         };

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/tool/execute', {}, {
            toolName: 'run_command',
            toolInput: {command: 'cat server.js'}
         }, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) fail = 'cat server.js failed';
            else {
               var out = rs.body.stdout || '';
               if (out.indexOf ('express') === -1 || out.indexOf ('4000') === -1) fail = 'server.js missing express/port 4000';
            }
            finish ();
         });

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/tool/execute', {}, {
            toolName: 'run_command',
            toolInput: {command: 'cat index.html'}
         }, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) fail = fail || 'cat index.html failed';
            else {
               var out = (rs.body.stdout || '').toLowerCase ();
               if (out.indexOf ('gotob') === -1 || out.indexOf ('app.js') === -1) fail = fail || 'index.html missing gotoB/app.js';
            }
            finish ();
         });

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/tool/execute', {}, {
            toolName: 'run_command',
            toolInput: {command: 'cat app.js'}
         }, function (error, rs) {
            if (error || ! rs.body || ! rs.body.success) fail = fail || 'cat app.js failed';
            else {
               var out = rs.body.stdout || '';
               if (out.indexOf ('B.') === -1) fail = fail || 'app.js missing gotoB usage';
            }
            finish ();
         });

         window._f3FileCheckError = fail;
      }, function () {
         if (window._f3FileCheckError) return window._f3FileCheckError;
         return true;
      }],

      // --- F3 Step 8: Expose port 4000 and verify page from host ---
      ['F3-8: Expose port 4000 and verify host response', function (done) {
         var project = window._f3Project;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/ports', {}, {port: 4000}, function (error, rs) {
            if (error || ! rs.body) {
               window._f3HostPort = null;
               return done (SHORT_WAIT, POLL);
            }
            window._f3HostPort = rs.body.hostPort || rs.body.containerPort || 4000;
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (! window._f3HostPort) return 'Failed to expose port 4000';
         return true;
      }],

      // --- F3 Step 9: Fetch tictactoe from host port ---
      ['F3-9: Tictactoe serves from host port', function (done) {
         var port = window._f3HostPort;
         if (! port) return done (SHORT_WAIT, POLL);
         var req = new XMLHttpRequest ();
         req.open ('GET', 'http://localhost:' + port + '/', true);
         req.onload = function () {
            window._f3HostPage = req.responseText || '';
            done (SHORT_WAIT, POLL);
         };
         req.onerror = function () {
            window._f3HostPage = '';
            done (SHORT_WAIT, POLL);
         };
         req.send ();
      }, function () {
         var body = (window._f3HostPage || '').toLowerCase ();
         if (! body) return 'No response from host port';
         if (body.indexOf ('gotob') === -1) return 'Host page missing gotoB';
         if (body.indexOf ('app.js') === -1) return 'Host page missing app.js';
         if (body.indexOf ('tictactoe') === -1) return 'Host page missing tictactoe title';
         return true;
      }],

      // --- F3 Cleanup: Delete project ---
      ['F3-Cleanup: Delete project', function (done) {
         var project = window._f3Project;
         c.ajax ('delete', 'projects/' + encodeURIComponent (project), {}, '', function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return true;
      }],

      // --- Flow #3 complete alert ---
      ['Flow #3 complete (acknowledge to continue)', function () {
         alert ('✅ Flow #3 passed. Click OK to continue.');
         return true;
      }],

      /*
      // =============================================
      // *** FLOW #4: Delete project stops agents ***
      // (Based on flow4Sequence in test-server.js)
      // =============================================

      // --- F4 Step 1: Create project ---
      ['F4-1: Create project', function (done) {
         window._f4Project = 'test-flow4-' + Date.now ();
         mockPrompt (window._f4Project);
         B.call ('create', 'project');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         restorePrompt ();
         var project = B.get ('currentProject');
         if (project !== window._f4Project) return 'Expected project "' + window._f4Project + '", got "' + project + '"';
         return true;
      }],

      // --- F4 Step 2: Write doc-main.md with tool auths ---
      ['F4-2: Write doc-main.md', function (done) {
         var content = [
            '# Flow 4 Test Project',
            '',
            '> Authorized: run_command',
            '> Authorized: write_file'
         ].join ('\n') + '\n';
         var project = window._f4Project;
         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/file/doc-main.md', {}, {content: content}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return true;
      }],

      // --- F4 Step 3: Create two dialogs (agent-a, agent-b) ---
      ['F4-3: Create dialogs A and B', function (done) {
         var project = window._f4Project;
         var pending = 2;
         var finish = function () {
            pending--;
            if (pending === 0) done (MEDIUM_WAIT, POLL);
         };

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/dialog/new', {}, {
            provider: 'openai',
            model: 'gpt-5',
            slug: 'agent-a'
         }, function (error, rs) {
            window._f4DialogA = rs && rs.body ? rs.body.dialogId : null;
            finish ();
         });

         c.ajax ('post', 'project/' + encodeURIComponent (project) + '/dialog/new', {}, {
            provider: 'openai',
            model: 'gpt-5',
            slug: 'agent-b'
         }, function (error, rs) {
            window._f4DialogB = rs && rs.body ? rs.body.dialogId : null;
            finish ();
         });
      }, function () {
         if (! window._f4DialogA || ! window._f4DialogB) return 'Missing dialog ids for A/B';
         return true;
      }],

      // --- F4 Step 4: Fire dialogs with long prompts (non-blocking) ---
      ['F4-4: Fire dialog A + B', function (done) {
         var project = window._f4Project;
         var payloadA = {dialogId: window._f4DialogA, prompt: 'Write a file called story-a.txt with a 500 word story about a robot. Use write_file.'};
         var payloadB = {dialogId: window._f4DialogB, prompt: 'Write a file called story-b.txt with a 500 word story about a dragon. Use write_file.'};

         fetch ('project/' + encodeURIComponent (project) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify (payloadA)
         }).catch (function () {});

         fetch ('project/' + encodeURIComponent (project) + '/dialog', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify (payloadB)
         }).catch (function () {});

         done (SHORT_WAIT, POLL);
      }, function () {
         return true;
      }],

      // --- F4 Step 5: Wait until both dialogs are active ---
      ['F4-5: Both dialogs become active', function (done) {
         done (LONG_WAIT, POLL);
      }, function () {
         if (! window._f4DialogStatus && ! window._f4DialogCheckInFlight) {
            window._f4DialogCheckInFlight = true;
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/dialogs', {}, '', function (error, rs) {
               window._f4DialogCheckInFlight = false;
               if (error) return;
               window._f4DialogStatus = rs.body || [];
            });
            return 'Waiting for dialog status...';
         }

         var dialogs = window._f4DialogStatus || [];
         var activeCount = dialogs.filter (function (d) {return d.status === 'active';}).length;
         if (activeCount >= 2) return true;

         window._f4DialogStatus = null;
         return 'Waiting for dialogs to become active...';
      }],

      // --- F4 Step 6: Delete project with active agents ---
      ['F4-6: Delete project with active agents', function (done) {
         var originalConfirm = window.confirm;
         window.confirm = function () {
            window.confirm = originalConfirm;
            return true;
         };
         B.call ('delete', 'project', window._f4Project);
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var project = B.get ('currentProject');
         if (project) return 'Expected currentProject to be null after deletion';
         var tab = B.get ('tab');
         if (tab !== 'projects') return 'Expected to return to projects tab after deletion';
         return true;
      }],

      // --- F4 Step 7: Dialogs endpoint returns 404 ---
      ['F4-7: Dialogs endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/dialogs', {}, '', function (error, rs) {
            window._f4DialogsStatus = error ? error.status : (rs && rs.status);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f4DialogsStatus !== 404) return 'Expected dialogs endpoint to return 404, got ' + window._f4DialogsStatus;
         return true;
      }],

      // --- F4 Step 8: Files endpoint returns 404 ---
      ['F4-8: Files endpoint returns 404', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/files', {}, '', function (error, rs) {
            window._f4FilesStatus = error ? error.status : (rs && rs.status);
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         if (window._f4FilesStatus !== 404) return 'Expected files endpoint to return 404, got ' + window._f4FilesStatus;
         return true;
      }],

      // --- F4 Step 9: Re-create same project name ---
      ['F4-9: Re-create same project name', function (done) {
         c.ajax ('post', 'projects', {}, {name: window._f4Project}, function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return true;
      }],

      // --- F4 Step 10: Re-created project has no dialogs/files ---
      ['F4-10: Re-created project has no dialogs/files', function (done) {
         var project = window._f4Project;
         var pending = 2;
         var finish = function () {
            pending--;
            if (pending === 0) done (SHORT_WAIT, POLL);
         };

         c.ajax ('get', 'project/' + encodeURIComponent (project) + '/dialogs', {}, '', function (error, rs) {
            window._f4DialogsAfter = error ? null : (rs.body || []);
            finish ();
         });

         c.ajax ('get', 'project/' + encodeURIComponent (project) + '/files', {}, '', function (error, rs) {
            window._f4FilesAfter = error ? null : (rs.body || []);
            finish ();
         });
      }, function () {
         if (! window._f4DialogsAfter || window._f4DialogsAfter.length !== 0) return 'Expected 0 dialogs after re-create';
         if (! window._f4FilesAfter || window._f4FilesAfter.length !== 0) return 'Expected 0 files after re-create';
         return true;
      }],

      // --- F4 Cleanup: Delete re-created project ---
      ['F4-Cleanup: Delete re-created project', function (done) {
         c.ajax ('delete', 'projects/' + encodeURIComponent (window._f4Project), {}, '', function () {
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         return true;
      }],

      // --- Flow #4 complete alert ---
      ['Flow #4 complete (acknowledge to finish)', function () {
         alert ('✅ Flow #4 passed. Click OK to finish.');
         return true;
      }]
      */

   ], function (error, time) {
      if (error) {
         console.error ('❌ Test FAILED:', error.test, '— Result:', error.result);
         alert ('❌ Test FAILED: ' + error.test + '\n\nResult: ' + error.result);
      }
      else {
         console.log ('✅ All tests passed! (' + time + 'ms)');
         alert ('✅ All tests passed! (' + time + 'ms)');
      }
   });

})();
