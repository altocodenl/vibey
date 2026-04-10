# Testing

## Running tests

Start the server first, then run the backend integration tests:

- `node test-server.js` — run all suites.
- `node test-server.js <suite>` — run one suite.
- `node test-server.js fast` — run the fast subset.
- `node test-server.js noslow` — run everything except the slow `static` and `backend` suites.

Run the client tests the same way, using `test-client.js` instead:

- `node test-client.js` — run all client flows.
- `node test-client.js <suite>` — run one client flow.
- `node test-client.js fast` — run the fast subset.
- `node test-client.js noslow` — run everything except the slow `static` and `backend` suites.

Note: if you change `test-client.js`, rebuild/restart vibey before running the client tests. The browser loads the test bundle from the running vibey server/container, so local file edits are not enough on their own.

Available server suite names: `project`, `doc`, `upload`, `snapshot`, `autogit`, `cloud`, `dialog`, `trigger`, `static`, `backend`, `vi`.

Available client suite names: `project`, `doc`, `upload`, `snapshot`, `dialog`, `trigger`, `static`, `backend`, `vi`, `settings`, `cloud`.

Notes:
- Client `cloud` is an alias for the settings/API-key surface tests.
- On the client, `doc` maps to `docs`, `upload` maps to `uploads`, and `snapshot` maps to `snapshots`.

## Test suites

**Project:**

1. `GET /projects` — verify it returns an array (may be empty or contain pre-existing projects).
   - Client: Projects tab loads and renders a list (may be empty).
2. `POST /projects` body `{name: "test-proj"}` — verify response has `{ok: true, slug, name}` and slug matches expected value.
   - Client: Create project via modal; navigates to Dialogs and sets `currentProject`.
3. `GET /projects` — verify the new project appears with matching slug and display name.
   - Client: Projects list shows the new project entry with the display name.
   - Client: Switching back to Projects refreshes the list, so projects created while viewing another tab appear.
4. `POST /projects` same name again — verify it succeeds idempotently (no error, same slug returned).
   - Client: try creating a project with the same name.
5. `DELETE /projects/:slug` — verify response is `{ok: true}`.
   - Client: Deleting via UI confirms and clears `currentProject`, navigates to `#/projects`.
6. `GET /projects` — verify the project no longer appears.
   - Client: Projects list no longer shows the deleted project.
7. `GET /project/:slug/files` — **404**. `GET /project/:slug/dialogs` — **404**.
   - Client: Navigating to a deleted project returns to Projects (no file/dialog view).
8. `DELETE /projects/nonexistent` — **404**.
9. `POST /projects` with empty name `""` — **400**.
   - Client: Empty project name leaves the modal open and sends no request.
10. `POST /projects` with whitespace-only name `"   "` — **400**.
   - Client: Whitespace-only project name leaves the modal open and sends no request.
11. For each of the following names, verify create → list (display name round-trips) → file write/read via slug → delete → gone from list:
    - `My Cool Project` (spaces; slug has no spaces, base64url-encoded between dots).
    - `🚀 Rocket App` (emoji).
    - `café étude` (accented/unicode).
    - `hello—world & friends!` (mixed special characters).
    - `日本語プロジェクト` (non-Latin only).
   - Client: ensure the names look like we expect them even with special characters.
12. **Cloud mode — unauthenticated gatekeeping**: `GET /projects` without session cookie — **403**.
13. **Cloud mode — CSRF required on mutations**: `POST /projects` body `{name: "no-csrf"}` with valid session cookie but without CSRF token — **403**.
14. **Cloud mode — project scoping by user**: Log in as user A, create project `"scoped-proj"`. Log in as user B, `GET /projects` — user A's project does not appear. `DELETE /projects/:slugOfUserA` — **404** (can't see or delete another user's project). Clean up both users.
15. **Cloud mode — container naming**: After creating a project in cloud mode, verify the Docker container name is prefixed with the user id (`vibey-proj-<userId>-<slug>`) so there are no collisions between users.
16. **Local mode — no auth needed**: `GET /csrf` returns body `"LOCAL"`. All project endpoints work without cookies.
   - Client: In local mode, no login view is shown; the app loads directly into Projects tab.

**Doc:**

1. `POST /projects` — create project.
   - Client: Create project via modal and land on Dialogs tab.
2. `POST /project/:p/file/doc/main.md` — write initial content.
   - Client: Create `main.md` via + New file prompt (stored as `doc/main.md`).
3. `GET /project/:p/file/doc/main.md` — read back, verify exact round-trip.
   - Client: Reload `main.md` and verify editor content matches.
4. `GET /project/:p/files` — list includes `doc/main.md`.
   - Client: Sidebar lists `main` (`.md` extension hidden).
   - Client: Sidebar hides `.md` extension from all doc filenames.
   - Client: Editor header shows `main` (no `.md` extension).
   - Client: When no file is selected, `doc/main.md` is auto-selected (not just the first file).
5. `POST /project/:p/file/doc/main.md` — overwrite with updated content.
   - Client: Edit content, verify dirty state, then save.
6. `GET /project/:p/file/doc/main.md` — verify updated content.
   - Client: Reload file and verify saved changes persisted.
7. `POST /project/:p/file/doc/notes.md` — write a second doc.
   - Client: Create `doc/notes.md` via prompt and open it.
8. `GET /project/:p/files` — list includes both docs.
   - Client: Sidebar lists both `main` and `notes` (`.md` hidden).
   - Client: Switching away and back to Docs refreshes the sidebar, so docs created or deleted elsewhere appear correctly.
9. `GET /project/:p/file/doc/notes.md` — read second doc, verify content.
   - Client: Editor shows initial `notes.md` content.
10. `DELETE /project/:p/file/doc/notes.md` — delete second doc.
   - Client: Delete `notes.md` from sidebar; editor switches away if it was open.
11. `GET /project/:p/files` — `doc/notes.md` gone, `doc/main.md` remains.
   - Client: Sidebar no longer shows `notes.md`, `main.md` remains.
12. `GET /project/:p/file/doc/main.md` — still has updated content.
   - Client: `main.md` still shows saved edits.
13. `GET /project/:p/file/doc/notes.md` — **404** (deleted file).
   - Client: Navigating to deleted file clears selection.
14. `POST /project/:p/file/bad..name.md` — **400** (invalid name).
   - Client: upload a file with two dots in its name, get an error.
15. `POST /project/:p/file/bad.txt` — **400** (outside managed folders).
   - Client: upload a file with a colon in its name, get an error.
16. For each of the following filenames, verify write → read (exact round-trip) → listed in `GET /files` → delete → gone from list:
    - `doc/my notes.md` (spaces).
    - `doc/café.md` (accented characters).
    - `doc/日本語.md` (non-Latin characters).
   - Client: Create each file via prompt, ensure it appears in sidebar, open to verify content, delete, and confirm it disappears.
17. Verify nested managed path write works (parent dirs auto-created):
    - `POST /project/:p/file/doc/nested/plan.md` — **200**.
    - `GET /project/:p/file/doc/nested/plan.md` — exact content round-trip.
    - `GET /project/:p/files` — includes `doc/nested/plan.md`.
    - `DELETE /project/:p/file/doc/nested/plan.md` — **200**, then gone from list.
18. `DELETE /projects/:p` — delete project.
   - Client: Delete project via UI returns to Projects tab and clears state.
19. `GET /projects` — confirm gone.
   - Client: Projects list no longer shows deleted project.
20. **Cloud mode — unauthenticated file access**: `GET /project/:p/file/doc/main.md` without session cookie — **403**.
21. **Cloud mode — cross-user file access**: Log in as user B, `GET /project/:userA-project/file/doc/main.md` — **404** (project not visible to user B).
22. **Cloud mode — public doc access**: Log in as user A, create project, write `doc/main.md`, publish it via `POST /access` with `{project: slug, path: "doc/main.md", visibility: "ALL"}`. Then without any session cookie, `GET /public/<userA-id>/<slug>/doc/main.md` — **200**, returns rendered HTML page with markdown content and working embeds. Verify `X-Frame-Options` is set.
23. **Cloud mode — unpublished doc stays private**: `GET /public/<userA-id>/<slug>/doc/notes.md` (not published) — **404**.

**Upload:**

1. `POST /projects` — create a project.
   - Client: Create project via modal and land on Dialogs tab.
2. `POST /project/:project/upload` — upload an image via data URL with `{name, content, contentType}` (`test-image.png`, `image/png`). Verify response includes `name`, `size`, `mtime`, `contentType`, and `url`.
   - Client: Upload image via API; uploads section becomes visible.
3. `GET /project/:project/uploads` — list includes `test-image.png` with matching metadata.
   - Client: Uploads list includes `pixel.png` with metadata and sidebar entry.
4. `GET /project/:project/upload/test-image.png` — fetch bytes (non-empty).
   - Client: Fetch image upload returns non-empty body.
5. `GET /project/:project/upload/test-image.png` — verify `Content-Type: image/png` header.
   - Client: Image upload returns `image/png` Content-Type.
6. `POST /project/:project/upload` — upload `notes.txt` with base64 content and `contentType: text/plain`.
   - Client: Upload text file via API.
7. `GET /project/:project/uploads` — list includes both `test-image.png` and `notes.txt`.
   - Client: Uploads list includes `pixel.png` and `notes.txt`.
8. `GET /project/:project/upload/notes.txt` — verify `Content-Type: text/plain` and body contains `"Hello from uploads test!"`.
   - Client: Fetch `notes.txt` returns text and `text/plain` Content-Type.
9. `POST /project/:project/upload` — upload `my screenshot 2026.png` (filename with spaces).
   - Client: Upload file with spaces in name via API.
10. `GET /project/:project/uploads` — list includes `my screenshot 2026.png`.
    - Client: Uploads list includes `space name.txt`.
11. `GET /project/:project/upload/<encoded spaced filename>` — returns 200 and `Content-Type: image/png`.
    - Client: Fetch spaced filename returns 200 with correct Content-Type.
12. `POST /project/:project/upload` — upload `my-file.v2.backup.txt` (dots + dashes).
    - Client: n/a (server-only filename edge case).
13. `POST /project/:project/upload` with `name: "../etc/passwd"` — **400**.
    - Client: n/a (server-only validation).
14. `POST /project/:project/upload` with `name: "sub\\file.txt"` — **400**.
    - Client: n/a (server-only validation).
15. `POST /project/:project/upload` with `name: "/absolute.txt"` — **400**.
    - Client: n/a (server-only validation).
16. `POST /project/:project/upload` with `name: "nested/evil.png"` — **200** (subdirectories allowed).
    - Client: Upload `nested/evil.txt` (any content) via API to confirm subdir uploads work.
17. `GET /project/:project/uploads` — list contains exactly 5 valid entries and includes `test-image.png`, `notes.txt`, `my screenshot 2026.png`, `my-file.v2.backup.txt`, `nested/evil.png`.
    - Client: Uploads list includes `pixel.png`, `notes.txt`, `space name.txt`, `nested/evil.txt`.
    - Client: Selecting `pixel.png` shows image preview; selecting `notes.txt` and `space name.txt` shows metadata panel.
18. `GET /project/:project/upload/nonexistent.png` — **404**.
    - Client: n/a (server-only error case).
19. `DELETE /projects/:project` — delete project.
    - Client: Delete project via UI returns to Projects tab and clears state.
20. `GET /projects` — confirm project gone.
    - Client: Projects list no longer shows deleted project.

**Snapshot:**

1. `POST /projects` — create project.
   - Client: Create project via modal.
2. `POST /project/:project/file/doc/main.md` — write snapshot content.
   - Client: Seed `doc/main.md` content (currently via API in client flow).
3. `POST /project/:project/file/doc/notes.md` — write extra file.
   - Client: Seed `doc/notes.md` content (currently via API in client flow).
4. `POST /project/:project/snapshot` with label `"before refactor"` — verify entry has `id`, `project`, `label`, `.tar.gz` filename, `created`, and `fileCount >= 2`.
   - Client: Create snapshot from project header, entering label `before refactor`.
5. `GET /snapshots` — list includes the labeled snapshot with correct label.
   - Client: Load snapshots list and verify labeled entry appears.
6. `POST /project/:project/snapshot` (no label) — create second snapshot.
   - Client: Create second snapshot with empty label.
7. `GET /snapshots` — list contains both snapshots and is ordered newest-first.
   - Client: Snapshots view/list shows at least two entries for the project.
8. `GET /snapshots/placeholder/download` — **404** with error payload.
9. `GET /snapshots/:id/download` (first snapshot) — returns non-empty tar.gz content.
   - Client: Snapshot entry shows a Download action/button.
10. `POST /snapshots/:id/restore` with name `"Restored Flow7 Test"` — returns `{slug, name, snapshotId}`.
   - Client: Restore snapshot from snapshots view; prompt for new project name; app navigates to restored project.
11. `GET /projects` — restored project appears in list.
   - Client: `currentProject` switches to restored project after restore.
12. `GET /project/:restored/files` — includes `doc/main.md` and `doc/notes.md`.
   - Client: Restored project contains both files (verified in client flow via API).
13. `GET /project/:restored/file/doc/main.md` — content matches original.
   - Client: Restored `doc/main.md` content matches original snapshot.
14. `GET /project/:restored/file/doc/notes.md` — content matches original.
   - Client: Restored `doc/notes.md` content matches original snapshot.
15. `POST /project/:project/file/doc/main.md` — modify original project after snapshot.
   - Client: Modify original project doc content (currently via API in client flow).
16. `GET /project/:restored/file/doc/main.md` — still matches original (restore isolation).
   - Client: Restored project remains unchanged after original is modified.
17. `DELETE /snapshots/:id2` — delete second snapshot.
   - Client: Delete one snapshot from snapshots view (with confirm).
18. `GET /snapshots` — second snapshot gone, first still present.
   - Client: Reload snapshots and verify only the expected snapshot remains.
19. `DELETE /projects/:project` — delete original project.
   - Client: Delete original project from Projects UI.
20. `GET /snapshots` — first snapshot still listed (snapshot storage independent).
   - Client: Snapshot remains listed after original project deletion.
21. `DELETE /snapshots/nonexistent-id-12345` — **400** with error payload.
22. `GET /snapshots/nonexistent-id-12345/download` — **404** with error payload.
23. `DELETE /projects/:restored` — delete restored project.
   - Client: Delete restored project during cleanup.
24. `DELETE /snapshots/:id` — delete first snapshot.
   - Client: Delete remaining snapshot from snapshots view.
25. `GET /snapshots` — no leftover entries for this flow.
   - Client: Reload snapshots and verify none remain for this flow.
26. **Cloud mode — snapshot user scoping**: Log in as user A, create project and snapshot. Log in as user B, `GET /snapshots` — user A's snapshot does not appear. `POST /snapshots/:userA-snapshot-id/restore` — **404** (can't restore another user's snapshot). `DELETE /snapshots/:userA-snapshot-id` — **404**.
27. **Cloud mode — snapshot id prefix**: In cloud mode, verify snapshot `id` is prefixed with the user id so snapshots from different users never collide on disk.
28. **Cloud mode — unauthenticated snapshot access**: `GET /snapshots` without session cookie — **403**. `POST /project/:p/snapshot` without session cookie — **403**.

**Autogit:**

1. `POST /projects` — create project.
2. `POST /project/:project/tool/execute` (`run_command: test -d .git && echo yes || echo no`) — verify `.git` exists.
3. `POST /project/:project/tool/execute` (`run_command: git rev-list --count HEAD`) — capture baseline commit count (>= 1).
4. `GET /project/:project/files` — verify commit count unchanged.
5. `POST /project/:project/file/doc/notes.md` — commit count increments by exactly 1.
6. `POST /project/:project/file/doc/notes.md` (same content) — commit count unchanged.
7. `POST /project/:project/tool/execute` (`run_command: echo from-flow9 > touched-by-tool.txt`) — commit count increments by exactly 1.
8. `POST /project/:project/tool/execute` (`run_command: echo noop`) — commit count unchanged.
9. Two concurrent `POST /project/:project/file/doc/concurrent-*.md` writes — both succeed; commit count increases by exactly 2; `git fsck --no-progress` passes; no `.git/index.lock` remains.
10. `DELETE /projects/:project` — delete project.
11. `GET /projects` — confirm project gone.

**Settings (cloud mode):**

1. **Cloud mode — settings stored in Redis**: In cloud mode, `GET /settings` reads from `user:<id>` `settings` field in Redis (not `secret.json`). `POST /settings` writes to Redis. Verify round-trip.
2. **Cloud mode — settings per user**: User A saves `{editor: {viMode: true}}`. User B's `GET /settings` does not include user A's vi mode setting.
3. **Cloud mode — settings do not include old API key fields**: `GET /settings` response has no `userApiKey` field.
4. **Local mode — settings in secret.json**: In local mode, `GET /settings` reads from `secret.json`. `POST /settings` writes to `secret.json`. Unchanged from current behavior.

**Dialog:**

1. `GET /` — confirm HTML shell loads `client.js`.
2. `POST /projects` — create project. Client: create via modal, verify `currentProject` is set and app navigates to Dialogs tab.
3. `POST /project/:p/dialog/new` (openai, gpt-5.2-codex, slug `flow1-read-vibey`) — response has `dialogId`, `filename`, `provider`, `model`, `status: done`, filename ends `-done.md`.
4. `GET /project/:p/dialogs` — draft is listed, status `done`.
   - Client: Switching away and back to Dialogs refreshes the list, so dialogs created while viewing another tab appear.
5. `POST /project/:p/tool/execute` (write_file `test-sample.txt`) — seed a file.
6. `PUT /project/:p/dialog` (prompt: "read test-sample.txt with run_command") — returns **JSON** `{dialogId, filename, status: "active"}`.
7. `GET /project/:p/dialog/:id/stream` — **SSE** stream. Collect events until `done`. Verify the first event is `snapshot`, and verify a `context` event with valid `percent/used/limit`.
8. `GET /project/:p/dialog/:id` — markdown has `> Time:`, `> Context:`, `run_command` tool request + result.
9. `PUT /project/:p/dialog` (same dialogId, prompt: "create dummy.js with write_file") — returns **JSON** with `status: "active"`.
10. `GET /project/:p/dialog/:id/stream` — SSE stream. Collect events until `done`. Verify streamed tool-block header/content is present in `chunk` and `markdown_append` events.
11. `GET /project/:p/dialog/:id` — markdown has `write_file` tool request + result.
12. Client: contiguous tool calls inside one assistant turn render as separate chat bubbles, not merged into one bubble.
13. Client: reconnect/page refresh resumes the live bubble from compact status text (for example a `write_file` shows the action/description, not raw file contents).
12. `POST /project/:p/tool/execute` (run_command `cat dummy.js`) — stdout contains `console.log`.
13. `PUT /project/:p/dialog` (same dialogId, prompt: "continue without provider", no provider field) — returns JSON (provider/model resolved from multi-line header).
14. `GET /project/:p/dialog/:id/stream` — SSE stream finishes with `done`.
15. `PUT /project/:p/dialog` (prompt: "Repeat your previous assistant message verbatim; if any line starts with '>' include it.") — returns JSON.
16. `GET /project/:p/dialog/:id/stream` — collect SSE output. Verify it **does not** contain `> Id:`, `> Provider:`, or `> Model:`. Time/context metadata remain visible to the LLM.
17. `POST /project/:p/dialog` (provider, model, prompt: "read test-sample.txt", slug: "async-test") — returns **JSON** `{dialogId, filename, status: "active"}` immediately (no SSE on POST).
18. `GET /project/:p/dialog/:id/stream` (for the new dialog) — SSE stream finishes with `done`.
19. `GET /project/:p/dialog/:id` — markdown has tool request + result for `run_command`.
20. `GET /project/:p/dialog/:id/stream` (dialog already done) — immediately sends `done` event and closes.
21. `POST /project/:p/dialog/new` (slug `agent-a`) — save dialogId. Status `done`, filename `-done.md`.
22. `POST /project/:p/dialog/new` (slug `agent-b`) — save dialogId. Status `done`, filename `-done.md`.
23. Fire agent-a with slow prompt (PUT with `sleep 12` + 200 word essay). Fire agent-b with slow prompt. Both return JSON immediately.
24. Poll `GET /project/:p/dialogs` until agent-a is `active` with filename `-active.md`, then immediately `PUT /project/:p/dialog` (agent-a dialogId + new prompt) — **409** rejected.
25. `GET /project/:p/dialog/:id/stream` (agent-b) — connect SSE. Verify events are arriving (other active dialog is live).
26. Confirm active status was observed for agent-a before stop.
27. `PUT /project/:p/dialog` (agent-a dialogId, `status: "done"`) — **200**, stopped.
28. Poll `GET /project/:p/dialogs` — agent-a is `done`, filename `-done.md`. Confirm active was observed before done.
29. Fire two concurrent `PUT /project/:p/dialog` on agent-a (now done) with different prompts. Exactly one returns **200** `{status: "active"}`, the other returns **409**.
30. `PUT /project/:p/dialog` (agent-a dialogId, `status: "done"`) — stop the newly restarted agent-a.
31. `DELETE /projects/:p` — delete while agent-b still active. 200.
32. `GET /projects` — project gone.
33. `GET /project/:p/dialogs` — **404**.
34. `GET /project/:p/files` — **404**.
35. `POST /projects` (same name) — fresh project.
36. `GET /project/:p/dialogs` — empty array.
37. `GET /project/:p/files` — only `doc/main.md`.
38. `DELETE /projects/:p` — cleanup.
39. `GET /projects` — confirm gone.
40. After a dialog that used tools (tests 6–11), `GET /project/:p/dialog/:id/messages` returns provider message formats. Verify:
    - `responsesApi` array contains no string with `[Assistant tool calls]` (tool calls must be structured `function_call` items, not flattened text).
    - `responsesApi` array contains at least one item with `type: "function_call"` and valid `name`, `call_id`, `arguments` fields.
    - `responsesApi` array contains at least one item with `type: "function_call_output"` and a `call_id` field.
    - `openai` array contains at least one message with `role: "assistant"` and a `tool_calls` array.
    - `openai` array contains at least one message with `role: "tool"` and a `tool_call_id`.
41. **Streaming tool deltas — `write_file`**: `POST /project/:p/dialog` (prompt: "create a file called streamed.txt with write_file containing at least 200 words of prose"). Connect to `GET /project/:p/dialog/:id/stream`. Collect all SSE events. Verify:
    - At least one `tool_delta` event is received before the `tool_request` event for the same tool call id.
    - Each `tool_delta` event has `{type: "tool_delta", tool: {id, name, delta}}` where `delta` is a string (partial JSON fragment).
    - Concatenating all `tool_delta` deltas for a given tool id produces valid JSON when parsed.
    - The parsed JSON contains `path` and `content` fields matching the final `tool_request` input.
    - A `tool_request` event is still emitted with the complete input after all deltas.
    - A `tool_result` event follows with `success: true`.
42. **Streaming tool deltas — `edit_file`**: seed a file via `POST /project/:p/tool/execute` (`write_file` a 10-line file). Then `PUT /project/:p/dialog` (prompt: "use edit_file to replace line 5 of the file"). Connect to stream. Verify:
    - At least one `tool_delta` event arrives for the `edit_file` call before its `tool_request`.
    - The final `tool_request` input contains `path`, `old_string`, and `new_string`.
43. **Streaming tool deltas — `run_command`**: `PUT /project/:p/dialog` (prompt: "list files with run_command"). Connect to stream. Verify:
    - `tool_delta` events arrive for the `run_command` call (even though arguments are small, deltas are still emitted).
    - `tool_request` and `tool_result` events follow as before.
44. **No tool deltas for text-only responses**: `PUT /project/:p/dialog` (prompt: "say hello, do not use any tools"). Connect to stream. Verify:
    - Zero `tool_delta` events are received.
    - At least one `chunk` event is received.
    - Stream ends with `done`.
45. **Multiple tool calls in one turn — deltas interleaved correctly**: `PUT /project/:p/dialog` (prompt: "create two files: alpha.txt and beta.txt, both with write_file, each with at least 100 words"). Connect to stream. Verify:
    - `tool_delta` events arrive for two distinct tool ids.
    - Each tool id's concatenated deltas parse to valid JSON with distinct `path` values.
    - Two `tool_request` events and two `tool_result` events follow.
46. **Client rendering of streamed tool deltas**: (Client test) During a `write_file` dialog with streaming tool deltas:
    - Client: As `tool_delta` events arrive, the tool call bubble shows a live preview of the file content being generated.
    - Client: The preview updates incrementally (not blank until complete).
    - Client: Once the streamed `write_file` block is parseable, expanding it shows the same friendly added-lines diff used for normal `write_file` tool bubbles (green `+` lines, not raw JSON clutter).
    - Client: `tool_result` renders inline as before.
47. **Tool call description in markdown**: `POST /project/:p/dialog` (prompt: "use run_command to run `echo hello`"). After completion, `GET /project/:p/dialog/:id` — markdown has `> Description:` line after `Tool request:` header, description is non-empty, and `description` field is stripped from the input JSON in the block.
    - Client: Tool block in markdown contains `> Description:` line. `formatToolBlocksForMessage` shows the description in both compact and expanded views.
    - Client: Compact tool rendering shows only the tool type/icon + description (no command/output preview until expanded).
    - Client: Expanded tool rendering shows readable input/output text with preserved line breaks.
48. **tool_request event still has description in input**: `POST /project/:p/dialog` (prompt: "use write_file to create a file"). Collect SSE. The `tool_request` event's `tool.input` object contains a `description` field (the raw LLM output before stripping).
49. **tool/execute strips description from input**: `POST /project/:p/tool/execute` with `toolInput` including a `description` field. Verify the tool executes successfully (description does not interfere).
49b. **Cloud mode — unauthenticated dialog access**: `POST /project/:p/dialog` without session cookie — **403**. `GET /project/:p/dialogs` without session cookie — **403**. `GET /project/:p/dialog/:id/stream` without session cookie — **403**.
49c. **Cloud mode — cross-user dialog access**: Log in as user B, `POST /project/:userA-project/dialog` — **404** (project not visible). `GET /project/:userA-project/dialogs` — **404**.
50. **Friendly dialog labels + no blank streaming bubble**:
    - Client: chat bubbles are labeled `You` and `Agent`.
    - Client: there is no visible raw `user` / `assistant` role label in the dialog UI.
    - Client: during streaming, if the agent has not emitted visible content yet, a non-empty friendly placeholder is shown instead of a blank agent bubble.
51. **Streaming tool bubble can expand while streaming**:
    - Client: while a tool call is still streaming, the live agent bubble stays compact by default and shows only the tool type/icon + description.
    - Client: expanding the live bubble reveals the in-progress detailed input/output text available so far.
    - Client: for `write_file`, the expanded live bubble renders the friendly added-lines diff view (green `+` lines) both during direct streaming and after a page refresh while the dialog is still active.
    - Client: if one tool call in the active turn is already complete and a second tool call is still in progress, the completed call remains its own tool bubble and the in-progress call stays in a separate live bubble.
52. **Previous/next message navigation buttons**:
    - Client: dialog header shows previous/next arrow buttons.
    - Client: clicking them scrolls the dialog area to the previous/next message.
53. **Continue in fresh dialog (manual compaction)**:
    - Client: when viewing a done dialog, a `Fresh` button is visible in the dialog header.
    - Client: clicking it sends a fixed compaction prompt to the current dialog, waits for that turn to finish, then opens a brand-new dialog automatically.
    - Client: the new dialog's first user prompt contains the handoff text prefixed with `This is a manual compaction handoff from dialog ...`.
    - Client: the source dialog keeps the compaction turn in its markdown history.
    - Client: after the handoff, compaction state is cleared and both source + fresh dialogs appear in the dialogs list.
54. **Spawning an agent with `launch_agent`**:
    - `POST /project/:p/dialog` (prompt instructing the model to use `launch_agent` exactly once) — parent dialog returns JSON immediately.
    - `GET /project/:p/dialog/:id/stream` (parent) — stream finishes with `done` and includes a `tool_request` event for `launch_agent` plus a successful `tool_result` whose payload contains `launched.dialogId`, `filename`, `status`, `provider`, and `model`.
    - `GET /project/:p/dialog/:id` (parent) — markdown contains a `launch_agent` tool block with a `Result:` section.
    - **Non-blocking launch**: when the spawned agent is intentionally slow, the parent dialog still finishes first; `GET /project/:p/dialogs` shows the spawned sibling dialog present and still `active` while the launcher is already `done`.
    - `GET /project/:p/dialog/:spawnedId/stream` (spawned dialog) — stream finishes with `done`.
    - `GET /project/:p/dialog/:spawnedId` — spawned dialog markdown contains its user prompt and assistant reply.
    - Client: `launch_agent` tool bubbles render a compact description by default and, when expanded, show the spawned agent summary (provider/model/slug + prompt preview + launched dialog result) instead of raw JSON clutter.
    - Client: after a dialog spawns an agent, the spawned sibling dialog appears in the dialogs list and can be opened from the UI.

**Static app:**

1. `POST /projects` — create project.
   - Client: Create project via modal.
2. `POST /project/:project/file/doc/main.md` — write constraints for a static-only React tictactoe (no backend process).
   - Client: Seed static-app constraints into `doc/main.md` (current client flow seeds via API).
3. `POST /project/:project/dialog/new` — create orchestrator draft.
   - Client: Create a new dialog draft in the Dialogs tab.
4. Fire `"please start"` (non-blocking).
   - Client: Send `please start` from chat input and continue without waiting for completion.
5. Poll `GET /project/:project/static/` until HTML includes React, `app.js`, and `tictactoe` markers.
   - Client: Verify static app is reachable via the static route and contains expected markers.
6. `POST /project/:project/tool/execute` (`run_command: cat index.html`) — verify React and `app.js` references.
   - Client: Trigger `run_command` from dialog/tool flow and validate `index.html` references.
7. `GET /project/:project/static/app.js` — verify board/cell/square/grid logic exists.
   - Client: Verify static `app.js` is served and contains game logic markers.
8. Poll `GET /project/:project/file/doc/main.md` until an `əəembed` block appears with `port static`.
   - Client: Wait for `doc/main.md` to include an embed block for static mode.
9. `GET /project/:project/file/doc/main.md` — verify embed block contains `port static`.
   - Client: Open `doc/main.md` and confirm `port static` embed syntax.

This project is intentionally kept alive so the embedded game remains available.

10. **Cloud mode — public static app**: Publish the static app route via `POST /access` with `{project: slug, path: "static/", visibility: "ALL"}`. Then without session cookie, `GET /public/<userId>/<slug>/static/` — **200**, returns the game HTML. `GET /public/<userId>/<slug>/static/app.js` — **200**. Verify sub-paths under a published prefix are also accessible.
11. **Cloud mode — unpublished static route**: Without publishing, `GET /public/<userId>/<slug>/static/secret.html` — **404** (not published).

**App with backend:**

1. `POST /projects` — create project.
   - Client: Create project via modal.
2. `POST /project/:project/file/doc/main.md` — write backend tictactoe constraints (Express on port 4000, install Express with npm before running).
   - Client: Seed backend-app constraints into `doc/main.md` (current client flow seeds via API).
3. `POST /project/:project/dialog/new` — create orchestrator draft.
   - Client: Create a new dialog draft in the Dialogs tab.
4. Fire `"please start"` (non-blocking), instructing the agent to install Express with npm, start the server with `nohup` and logs redirected, verify it is running, and then add the embed block.
   - Client: Send `please start` from chat input and continue without waiting for completion.
5. Poll `GET /project/:project/proxy/4000/` until HTML includes React, `app.js`, and `tictactoe` markers.
   - Client: Verify proxied app route is reachable and contains expected markers.
6. `GET /project/:project/proxy/4000/` — verify index HTML includes React + `app.js`.
   - Client: Confirm proxied index HTML contains React + `app.js` references.
7. `GET /project/:project/proxy/4000/app.js` — verify board/cell/square/grid logic exists.
   - Client: Confirm proxied `app.js` contains game logic markers.
8. `POST /project/:project/tool/execute` (`run_command: ps aux | grep node || true`) — verify `server.js` process is running.
   - Client: Trigger `run_command` from dialog/tool flow and verify Node backend process is present.
9. Poll `GET /project/:project/file/doc/main.md` until `əəembed` block appears with `port 4000`.
   - Client: Wait for `doc/main.md` to include an embed block targeting port 4000.
10. `GET /project/:project/file/doc/main.md` — verify embed block includes `port 4000`.
   - Client: Open `doc/main.md` and confirm `port 4000` embed syntax.

Keep this project running intentionally so the embedded backend app stays playable. Because commands are not detached automatically, long-running processes in this suite should be launched explicitly with `nohup ... >/tmp/... 2>&1 &`.

11. **Cloud mode — public proxy app**: Publish the proxied app via `POST /access` with `{project: slug, path: "proxy/4000/", visibility: "ALL"}`. Without session cookie, `GET /public/<userId>/<slug>/proxy/4000/` — **200**, returns game HTML. `POST /public/<userId>/<slug>/proxy/4000/api/move` (if the app supports it) — **200** (mutating requests through published proxy are allowed; blast radius is limited to the project).
12. **Cloud mode — unpublished proxy route**: `GET /public/<userId>/<slug>/proxy/4000/admin` where only `/` was published — returns **200** (sub-paths under a published prefix are accessible). `GET /public/<userId>/<slug>/proxy/5000/` (different port, not published) — **404**.
13. **Cloud mode — public route with session cookie**: `GET /public/<userId>/<slug>/proxy/4000/` with a valid session cookie — **200** (session is identified but does not block public access).

**Cloud (auth, admin, access, scoping):** [CLOUD MODE ONLY — skipped gracefully if server is in local mode]

Tests connect to Redis directly (same instance as the server) to read OTPs and verify state. No test hooks on the server.

The suite detects the server mode via `GET /auth/csrf`. If the response is `{mode: 'LOCAL'}`, the entire suite is skipped.

*Mode detection:*
1. `GET /auth/csrf` — detect mode. If `{mode: 'LOCAL'}`, skip remaining tests. If **403**, server is in cloud mode and no session is active (expected).

*Signup:*
2. `POST /auth/signup` body `{email}` — **200** `{ok: true}`. Stores `signup:<email>` hash in Redis. Sends admin notification email (logged in dev).
3. `POST /auth/signup` with invalid email (no `@`) — **400**.
4. `POST /auth/signup` with empty email — **400**.

*Bootstrap admin (no users exist):*
5. `POST /admin/createUser` body `{email}` **without** session — **200** `{ok: true, id}`. Allowed because no users exist yet. First user is created as admin (`admin: '1'` in Redis).
6. Verify via Redis: `user:<id>` hash has `admin: '1'`, `email` matches.

*Login flow:*
7. `POST /auth/login` body `{email}` — **200** `{ok: true}`. OTP stored in Redis at `otp:<userId>`. Read OTP directly from Redis.
8. `POST /auth/login` with non-existent email — **403** `{error: 'user not found'}`.
9. `POST /auth/verify` with wrong OTP — **403** `{error: 'invalid otp'}`.
10. `POST /auth/verify` with correct OTP — **200** `{csrf: '<token>', admin: true}`. Response sets `Set-Cookie` with `vibey=<session>` cookie. OTP is deleted from Redis.
11. Verify `Set-Cookie` header includes `HttpOnly`, `SameSite=Lax`.

*CSRF:*
12. `GET /auth/csrf` with valid session cookie — **200** `{csrf: '<token>'}`. CSRF matches the one returned at login.
13. `POST /projects` with valid cookie but **no CSRF** in body — **403** `{error: 'csrf'}`.

*Admin — signups:*
14. `GET /admin/signups` with admin session — **200**, array includes the pending signup email from test 2.
15. `GET /admin/signups` without auth — **403**.

*Admin — create user:*
16. `POST /admin/createUser` body `{email}` with admin session + CSRF — **200** `{ok: true, id}`. Signup entry deleted from Redis.
17. Verify via Redis: new user has `admin: '0'` (or absent).
18. `POST /admin/createUser` with duplicate email — **409** `{error: 'User already exists'}`.
19. `POST /admin/createUser` without auth (users exist) — **403**.

*Member login:*
20. Full OTP login as the newly created member user. Verify `admin` is absent/falsy in verify response.
21. Non-admin `GET /admin/signups` — **403**.
22. Non-admin `POST /admin/createUser` — **403**.

*Project scoping:*
23. Admin creates project `"admin-proj-cloud"` — **200** `{ok: true, slug}`.
24. Member `GET /projects` — admin's project does **not** appear.
25. `GET /projects` without auth — **403**.

*Trigger-id access control:*
25b. Owner `GET /project/:project/trigger-id` — **200** with `triggerId`.
25c. Member `GET /project/:project/trigger-id` on admin's project — **404** (scoped, so trigger not found for wrong user).
25d. Unauthenticated `GET /project/:project/trigger-id` — **403**.

*Access:*
26. `GET /access` with admin session — **200** `{rules: {}}` (initially empty).
27. `POST /access` body `{rules: {"<slug>:static/": "ALL"}}` — **200** `{ok: true}`.
28. `GET /access` — reflects saved rule.
29. `POST /access` with different rules — overwrites completely (old rule gone, new rule present).
30. `GET /access` without auth — **403**.

*Logout:*
31. `POST /auth/logout` with session + CSRF — **200** `{ok: true}`. Session, CSRF, and sessioncsrf keys deleted from Redis.
32. `GET /auth/csrf` with old cookie — **403**.

*Cleanup:*
33. Re-login admin, delete the test project.
34. Flush all test-created Redis keys.

**Triggers (cloud mode, at end of Dialog suite):**
- In cloud mode, trigger tests live at the end of the Dialog suite.
- Tests:
  1. Create a project. Verify `projecttrigger:<userId>:<slug>` exists in Redis and maps to a trigger ID. Verify `trigger:<triggerId>` maps back to `<userId>:<slug>`.
  2. `POST /trigger` with `Authorization: Bearer <triggerId>`, body `{prompt: "echo hello", slug: "api-trigger"}` — returns `202 {ok: true, dialogId}`. Model and provider are autodetected.
  3. `POST /trigger` with `Authorization: Bearer <triggerId>`, body `{data: {from: "test@example.com", subject: "Test trigger", body: "Run echo hello"}, slug: "email-trigger"}` — returns `202 {ok: true, dialogId}`. Model and provider are autodetected.
  4. `POST /trigger` with explicit model `{model: "gpt-4.1", prompt: "echo hello"}` — returns `202`. Provider resolved from model name.
  5. `POST /trigger` with invalid trigger ID — returns `403`.
  6. `POST /trigger` with no `prompt` and no `data` — returns `400`.
  7. `POST /trigger` with explicit invalid model (not in known models) — returns `400`.
  8. Autodetect prefers OpenAI: clear user settings to have both providers, trigger without model — verify the dialog header contains `Provider: openai`.
  9. Autodetect falls back to Claude: clear OpenAI credentials from user settings so only Claude remains, trigger without model — verify the dialog header contains `Provider: claude`. Restore settings afterward.
  10. No provider credentials: clear all provider credentials from user settings, trigger without model — returns `422`. Restore settings afterward.
  11. Cleanup: delete the project. Verify both `trigger:<id>` and `projecttrigger:<userId>:<slug>` are deleted from Redis.
- In local mode, trigger tests are skipped.

**Models endpoint:**

1. `GET /models` — returns `{openai: {<model>: {context: <number>}, ...}, anthropic: {<model>: {context: <number>}, ...}}`. All known models are present (including `apiKeyOnly` models when the user has an API key).
2. `GET /models` without an OpenAI API key — `apiKeyOnly` models (like `gpt-4.1`) are excluded from the response.
3. `GET /models` with an OpenAI API key — `apiKeyOnly` models (like `gpt-4.1`) are included in the response with `apiKeyOnly: true`.

**Client: trigger copy buttons:**

1. With `triggerId` set (id + domain), the ⚡ API and ⚡ Email buttons are visible in the dialogs header.
2. Clicking ⚡ API writes `Bearer <id>` to the clipboard via the `copy trigger` responder.
3. Clicking ⚡ Email writes `trigger+<id>@<domain>` to the clipboard via the `copy trigger` responder.
4. Without `triggerId`, neither button is visible.
5. With `triggerId` set but empty `domain`, ⚡ API is visible but ⚡ Email is hidden.
6. Clicking ⚡ API opens the Trigger API modal. The modal's `curl` snippet contains both `"prompt"` and `"model"`, so the user can see that a model can optionally be passed in the request body.

**Triggers migration:**
- Tested as part of server startup. Verified indirectly: after the migration runs, existing projects have `projecttrigger:*` entries in Redis, and `userapikey:*` / `apikey:*` / `userapikeyreveal:*` keys are gone.

**Vi mode:** [COMMENTED OUT, BROKEN]

- Confirm baseline state: `GET /settings` returns `editor.viMode = false`.
- Enable vi mode with `POST /settings` payload `{editor:{viMode:true}}`, then verify with `GET /settings`.
- Disable again with `{editor:{viMode:false}}`, and verify it returns to false.
- Verify settings merge behavior (no accidental clobber):
  - Set `viMode=true`.
  - Save only `{openaiKey: ...}` via `POST /settings`.
  - Confirm `GET /settings` still reports `editor.viMode=true` and `openai.hasKey=true`.
- Verify backward compatibility: top-level payload `{viMode:false}` also updates `editor.viMode`.
- Sanity-check editor persistence while vi mode exists:
  - Create project.
  - Write/read `doc/main.md`.
  - Overwrite it (simulating `:w`) and verify new content persists.
- Cleanup: reset vi mode false, delete project.
