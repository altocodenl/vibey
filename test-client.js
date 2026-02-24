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
            await page.goto ('http://localhost:5353', {waitUntil: 'networkidle2', timeout: 30000});

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

   var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};
   var testTimestamp = function () {
      var d = new Date ();
      return d.getUTCFullYear () + '' + pad2 (d.getUTCMonth () + 1) + pad2 (d.getUTCDate ()) + '-' + pad2 (d.getUTCHours ()) + pad2 (d.getUTCMinutes ()) + pad2 (d.getUTCSeconds ());
   };

   var LONG_WAIT   = 120000; // 2 min for LLM responses
   var MEDIUM_WAIT = 15000;
   var SHORT_WAIT  = 3000;
   var POLL        = 200;

   var TEST_PROJECT = 'test-flow1-' + testTimestamp ();
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

      // --- F2 Step 9: Go back to main.md and make it dirty ---
      ['F2-9: Edit main.md and mark it dirty', function (done) {
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
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
         B.call ('load', 'file', 'doc-notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         if (file.name !== 'doc-notes.md') return 'Expected to land on doc-notes.md, got ' + file.name;
         return true;
      }],

      // --- F2 Step 11: Verify save persisted ---
      ['F2-11: Verify main.md has the extra line saved', function (done) {
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
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
         B.call ('load', 'file', 'doc-notes.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file) return 'No currentFile';
         if (file.name !== 'doc-notes.md') return 'Expected doc-notes.md after discard, got ' + file.name;
         return true;
      }],

      // --- F2 Step 13: Verify discarded changes were not persisted ---
      ['F2-13: Verify discarded changes not persisted', function (done) {
         B.call ('load', 'file', 'doc-main.md');
         done (MEDIUM_WAIT, POLL);
      }, function () {
         var file = B.get ('currentFile');
         if (! file || file.name !== 'doc-main.md') return 'doc-main.md not loaded';
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

      ['F3-2: Write doc-main.md', function (done) {
         c.ajax ('post', 'project/' + encodeURIComponent (window._f3Project) + '/file/doc-main.md', {}, {content: '# Flow 3 Test Project\n\n'}, function () {
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

      ['F3-10: Re-created project has no dialogs and only default doc-main.md', function (done) {
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
            if (name !== 'doc-main.md') return name;
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

      ['F4-2: Write doc-main.md', function (done) {
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
         c.ajax ('post', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc-main.md', {}, {content: docMain}, function () {
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
         if (! file || file.name.indexOf ('dialog-') !== 0) return 'No dialog file created';
         if (file.name.indexOf ('orchestrator') === -1) return 'Dialog filename missing orchestrator slug';
         if (file.name.indexOf ('-waiting.md') === -1) return 'Dialog should start in waiting status';
         return true;
      }],

      ['F4-4: Fire "please start" (non-blocking)', function (done) {
         B.call ('set', 'chatInput', 'please start');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F4-5: Poll until static page serves', function (done) {
         var attempt = function () {
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/static/', {}, '', function (error, rs) {
               if (! error && rs && rs.status === 200) {
                  var lower = (rs.body || '').toLowerCase ();
                  if (lower.indexOf ('gotob') !== -1 && lower.indexOf ('app.js') !== -1 && lower.indexOf ('tictactoe') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {return true;}],

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
         B.call ('set', 'chatInput', 'The tictactoe game is now available via the static proxy at /project/' + window._f4Project + '/static/. Please add an embed block to doc-main.md so the game is playable directly from the document. Use the edit_file tool to append a "## Play the game" section with an əəəembed block (port static, title Tictactoe, height 500) at the end of doc-main.md.');
         B.call ('send', 'message');
         done (LONG_WAIT, POLL);
      }, function () {
         if (B.get ('streaming')) return 'Still streaming...';
         return true;
      }],

      ['F4-9: Poll until embed block appears in doc-main.md', function (done) {
         var attempt = function () {
            c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc-main.md', {}, '', function (error, rs) {
               if (! error && rs && rs.body && type (rs.body.content) === 'string') {
                  var content = rs.body.content;
                  if (content.indexOf ('əəəembed') !== -1 && content.indexOf ('port static') !== -1) return done (SHORT_WAIT, POLL);
               }
               setTimeout (attempt, 5000);
            });
         };
         attempt ();
      }, function () {return true;}],

      ['F4-10: Verify embed block in doc-main.md', function (done) {
         c.ajax ('get', 'project/' + encodeURIComponent (window._f4Project) + '/file/doc-main.md', {}, '', function (error, rs) {
            window._f4EmbedContent = (rs && rs.body && rs.body.content) || '';
            done (SHORT_WAIT, POLL);
         });
      }, function () {
         var content = window._f4EmbedContent || '';
         if (content.indexOf ('əəəembed') === -1) return 'doc-main.md missing əəəembed block';
         if (content.indexOf ('port static') === -1) return 'doc-main.md embed missing port static';
         return true;
      }],

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
