# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

Turn your words into actions.

## Vibey in a nutshell

1. **Communication as the basis:** *Everything is a document*. Your description of what you're building. The dialogs with AI while building it. How you orchestrate your agents. Documents are the source of truth for everything. There is no database.
2. **Connected through the web:** *Everything in your browser*. Your documents are not only text: use images, audio, and embed small apps in your documents. Everything has an URL. No terminal or dedicated native app needed.
3. **Walled autonomy**: *Agents run YOLO within a self-contained project*. The agents don't ask for permission, they just run the commands that they need for the task you give them, so they work at full speed. **But** each project is fully isolated in its own container and volume. A rogue agent's blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.
4. **Transparent**: *Bring your own AI credentials,* whether personal or API keys. See every call that your agents make.
5. **Freedom**: Vibey is open source. Altocode, the company behind Vibey cloud, is an [openbound](https://altocode.nl/blog/altocode-is-an-openbound).

## Vibey is for those who don't code but want to

- Create their own agentic workflows to automate repeated tasks.
- Use agents to perform research in the background.
- Explore and iterate a product idea.
- Create small computer games.
- Create custom teaching materials.
- Run ad-hoc data analysis and create visualizations.

## Installation

Only requirement: Docker installed and running.

From any directory where you want a `vibey/` folder created, run:

```bash
curl -fsSL https://raw.githubusercontent.com/altocodenl/vibey/main/install.sh | sh
```

Then:

```bash
cd vibey
docker compose up --build
```

## Usage

1. To start Vibey:

```bash
docker compose up --build
```

You can now open Vibey at http://localhost:5353

2. To stop vibey:

```bash
docker compose down
```

3. To reset all vibey data

```bash
docker compose down -v
```

### Advanced: Vibey cloud

```bash
VIBEY_CLOUD=1 VIBEY_DISABLE_EMAIL=1 docker compose up --build
```

If you have configured emails, you can run:

```bash
VIBEY_CLOUD=1 docker compose up --build
```

## The concept

Think of a text-based agentic system as three things:

1. **Deed**: whatever final result you want to achieve. If it's code, the codebase, plus all of the data. If you're selling something, an interface to your CRM. If you're writing a game, your game.
2. **Docs**: a set of markdown pages that contain the specification of the deed: purpose, main entities, endpoints, constraints, core flows, coding standards. It also contains the list of things that need to be worked upon (ie: pending tasks).
3. **Dialogs**: the stream of consciousness of each agent. Most dialogs are complete, a few are ongoing for those agents that are working/alive *now*. A human can inspect at any time this stream of text, code changes and commands; a human can also enter the dialog. Dialogs are either active (running) or done (idle/completed). When an agent completes its work, the dialog is no longer alive but it still is accessible.

The first two are stocks: things that accumulate with time. The last one is a flow: changes to the deed and the docs.

The core of all this is one doc, `doc/main.md.` This file contains:

- A description of the deed.
- Links to other docs.
- Instructions to agents that are picking up work. For example:
   - Whether to use Claude Code, Codex, or whatever it is to spin an agent.
   - How many agents to spin at one time.
   - Standards of work and workflows.

Rather than hardcoding or customizing an agentic mesh, just describe it in your docs. Orchestration can just be prose.

Vibey is not experimental. It is an experiment.

## How can everything be markdown?

Well, everything except what you're building (unless you're building the Next American Novel). The state of the agents is also expressed in markdown.

What about versioning? You can snapshot a project at any point. Snapshots are tar.gz archives stored inside vibey's own data volume — not in any project container. You can restore any snapshot as a new project, download it, or delete it. There's also a dedicated snapshots view to browse and manage them.

We take great inspiration from Unix's "everything is a file": here, everything is text, except for the artifacts that your agents build, which might be something else than text.

We can also embed things in markdown: images, audio, even mini-windows with dynamic views. But each main center is a document, a page, built around text.

## How can everything be running from your browser?

Browsers are wonderfully plastic and powerful interfaces. At this stage, the server will also run locally. But, in the future, it's possible to envision vibey as a service, so that you don't have to deal with the server, and just express the system you want in pure text.

## Surrounded by a container?

Yes. Each project runs in its own Docker container with its own volume. No shared mounts. If an agent goes rogue, the blast radius is limited to that one project — it cannot touch other projects, vibey itself, or the host.

## How does it look?

- Two tabs only:
   - Docs: lush markdown editing, with embedded apps.
   - Dialogs: lush visual of each dialog, with the possibility to interrupt it and converse with it.

Docs and dialogs are markdown files under dedicated folders in each project:
   - `doc/<name>`
   - `dialog/<YYYYMMDD-HHMMSS (utc)>-<slug>-<status>.md`

Note that the deed is missing; if it's code, go use your IDE, or just open your browser and use it, if it's running.

## Spec

### Server: static assets

`GET /` serves an HTML shell that loads normalize.css, tachyons, gotoB, marked.js, and `client.js`. `GET /client.js` serves the client.

### Server: projects

Each project is a container (`vibey-proj-<name>`) with its own named volume (`vibey-vol-<name>`).

- `GET /projects` - list project names. Enumerates both running containers and labeled volumes (`vibey=project`), so volume-only projects (whose containers were removed on shutdown/rebuild) appear in the list and can be opened normally — their container is recreated on first access.
- `POST /projects` - create project. Body: `{name}`. Creates the project container and volume.
- `DELETE /projects/:name` - delete a project.
  - If any dialog streams are active for dialogs in that project, they are aborted before deletion.
  - Removes the container (`docker rm -f`) and volume (`docker volume rm`).

### Client: projects

Projects tab lists all projects with + New and × delete.

- Clicking a project opens its Docs tab.
- `+ New project` opens a centered modal with a large project-name input and explicit create/cancel actions.
- Submitting a non-empty name creates the project and opens its Dialogs tab.
- Empty or whitespace-only names do not submit; the modal stays open.
- Deleting asks for confirmation and removes the project from disk.
- If the deleted project is currently open, client state resets and navigation returns to `#/projects`.

### Server: snapshots

Snapshots are tar.gz archives of a project's `/workspace`, stored inside vibey's own data volume at `/app/data/snapshots/`. Snapshot metadata is stored in per-snapshot sidecar JSON files next to the archives, and listings are built by scanning the directory. Snapshots are not stored inside project containers — they survive project deletion. In cloud mode, each snapshot carries an `ownerId`, and all snapshot operations enforce ownership.

- `POST /project/:project/snapshot` — create a snapshot. Body: `{label?}`. Tars the project container's `/workspace` and stores it. Returns the snapshot entry.
- `GET /snapshots` — list the current user's snapshots, newest first (all snapshots in local mode). Returns array of snapshot entries.
- `POST /snapshots/:id/restore` — restore one of the current user's snapshots as a new project. Body: `{name?}`. Creates a new project container and unpacks the archive into it. Returns `{slug, name, snapshotId}`.
- `DELETE /snapshots/:id` — delete one of the current user's snapshots. Removes the archive file and metadata.
- `GET /snapshots/:id/download` — download one of the current user's snapshot archives as a `.tar.gz` file.

Snapshot entry shape:

```json
{
  "id": "20260225-122518-a1b2c3d4",
  "project": "my-project-slug",
  "projectName": "My Project",
  "label": "before refactor",
  "ownerId": "9f3c2a1b4d5e6f78",
  "file": "20260225-122518-a1b2c3d4.tar.gz",
  "created": "2026-02-25T12:25:18.000Z",
  "fileCount": 12
}
```

### Client: snapshots

Snapshots view lists all snapshots with restore, download, and delete actions. Creating a snapshot is available from the project header. Restoring a snapshot creates a new project and navigates to it.

### Server: auto commits

In addition to manual snapshots, each project workspace will be a Git repository so changes are versioned continuously.

#### Goal

After each tool call and each mutating API call, the server attempts an automatic commit **only if `/workspace` changed**. If there is no filesystem diff, no commit is created.

This gives agents first-class history they can use directly from tools (`git log`, `git show`, `git checkout <sha> -- <path>`), without a dedicated restore endpoint for every case.

#### Repository lifecycle

Auto-commit uses one repo per project at `/workspace/.git` inside the project container.

- On first auto-commit attempt, if `.git` does not exist:
  - initialize repo (`git init`)
  - set local identity if missing:
    - `user.name = vibey`
    - `user.email = vibey@local`
- Server checks for changes with `git status --porcelain`.
- If dirty:
  - `git add -A`
  - `git commit -m <auto message>`
- If clean: no-op.

#### Commit trigger points

Auto-commit runs at operation boundaries (not per low-level file append/write), to keep history readable and avoid commit spam. For consistency, each operation performs its own commit attempt before the operation is considered complete.

1. **Tool calls**
   - `run_command` (because shell commands may mutate files)
   - `write_file`
   - `edit_file`
   - `launch_agent` (creates/updates dialog files)
2. **Mutating project APIs**
   - `POST /projects`
   - `POST /project/:project/file/:name`
   - `DELETE /project/:project/file/:name`
   - `POST /project/:project/upload`
   - `POST /project/:project/dialog/new`
   - `POST /project/:project/dialog`
   - `PUT /project/:project/dialog` (when status/prompt causes writes)
   - `POST /project/:project/tool/execute`

Read-only routes (`GET ...`) do not trigger auto-commit.

#### Commit messages

Commit messages include the source of the mutation for traceability, for example:

- `vibey:auto api POST /project/:project/file/doc/main.md`
- `vibey:auto tool write_file`

Metadata such as dialog id may be appended when available.

#### Concurrency and failure behavior

- Auto-commit is serialized **per project** to avoid overlapping Git operations (`status/add/commit` runs in a per-project critical section).
- This lock is currently in-process memory, so strict ordering assumes a **single vibey server process** (no cluster/multi-instance).
- If vibey runs in cluster mode or multiple instances, per-project locking must move to a shared coordinator (for example Redis lock, DB advisory lock, or filesystem lock) to preserve ordering guarantees.
- Commit mode is **consistent/strict**: each mutating tool/API operation performs its own commit attempt in sequence, so commit history preserves operation order.
- Target granularity is one operation → one commit attempt (or a no-op when no diff exists).
- Because strict mode waits for commit completion, mutating requests may be slightly slower than non-committing flows.
- If auto-commit itself fails, the operation is treated as failed and returns an error (consistency over availability).

### Client: auto commits

No dedicated UI is required for MVP. Agents can inspect and restore history through existing tool execution (`run_command`). A future UX may add commit browsing in the project header/sidebar.

### Server: files

All files live inside `/workspace/` in the project container. All file I/O goes through the `projectFS` abstraction. Managed files are under `doc/` and `dialog/`; no `..`.

- `GET /project/:project/files` - list all managed files (`doc/*`, `dialog/*`), sorted by mtime descending.
- `GET /project/:project/file/:name` - read file. Returns `{name, content}`.
- `POST /project/:project/file/:name` - write file. Body: `{content}`.
- `DELETE /project/:project/file/:name` - delete file.

`name` may include subpaths (for example `doc/main.md` or `dialog/<id>-<status>.md`).

### Client: files

Left sidebar lists all files with + New and × delete. The `.md` extension is hidden in the sidebar and editor header (e.g. `doc/main.md` displays as `main`). When no file is selected and the Docs tab loads, `doc/main.md` is auto-selected if it exists (otherwise the first doc file). Right side is a textarea editor. Cmd+S saves. Tracks dirty state, warns on close with unsaved changes. Deleting the currently open file clears the editor immediately. Loading a file that no longer exists silently deselects it.

### Server: uploads

Uploads live under `/workspace/uploads/` inside the project container.

- `GET /project/:project/uploads` — list uploads (newest first). Returns entries with `{name, size, mtime, contentType, url}`.
- `POST /project/:project/upload` — upload a file. Body: `{name, content, contentType?}` where `content` is base64 (data URL allowed). Returns the stored entry.
- `GET /project/:project/upload/:name` — download/stream the upload (Content-Type inferred from filename).

### Client: uploads

Docs sidebar shows an Uploads section at the bottom (always visible when uploads exist). Upload button opens a file picker (multi-select supported), uploads to `/uploads/`. Filenames can include spaces. Clicking an upload shows a preview: images/audio/video render inline; other files show metadata + a link.

### Server: dialogs

- `POST /project/:project/dialog/new` — create a done dialog draft (idle). Body: `{provider, model?, slug?}`.
- `POST /project/:project/dialog` — create a new dialog and start the first turn **asynchronously**. Body: `{provider, model?, prompt, slug?}`. Response: **JSON** `{dialogId, filename, status: "active"}`.
  - Creates a file named `dialog/<YYYYMMDD-HHmmss>-<slug>-<status>.md`.
  - Stable `dialogId` is `<YYYYMMDD-HHmmss>-<slug>` (status is not part of the id).
  - Appends a `## User` message with canonical payload format, opens `## Assistant`, and begins generation in the background.
  - Tool calls execute immediately (YOLO), results are appended to the dialog.
  - The POST returns immediately — no SSE. The client connects to the stream endpoint to follow live output.

- `PUT /project/:project/dialog` — mutate or continue an existing dialog.
  - Canonical body: `{dialogId, status?, prompt?}`.
  - `status` can only be `done`.
  - If `status` is set without `prompt`, it is a pure status change (interrupt/mark done). Response: **JSON**.
  - If `prompt` is present, append as `## User` and continue generation **asynchronously**. Response: **JSON** `{dialogId, filename, status: "active"}`.
  - Whenever generation is kicked off on an existing dialog, server first sets status to `active`.
  - **Per-dialog concurrency**: each dialog has a logical lock. If a PUT arrives while another PUT is already processing the same `dialogId` (or the dialog is already `active`), the server returns **409 Conflict** immediately. First request wins; no racing on file renames.
  - No SSE on PUT — the client connects to the stream endpoint separately.

- `GET /project/:project/dialog/:id/stream` — **SSE** endpoint for live dialog output.
  - If the dialog is **active**, streams live `chunk` and tool events as they happen. Ends with a `done` event when generation completes.
  - If the dialog is **done** (already finished or never started), immediately sends a `done` event and closes.
  - Multiple clients can connect to the same stream simultaneously (fan-out).
  - If the client disconnects and reconnects, it re-reads the file via `GET /dialog/:id` and reattaches to the stream if still active.

- `GET /project/:project/dialogs` — list dialog files with `{dialogId, status, filename, mtime}` (filenames live under `dialog/`).
- `GET /project/:project/dialog/:id` — load one dialog. Always returns the current markdown from disk (full content, regardless of whether the dialog is active or done).

SSE event types: `snapshot`, `markdown_append`, `markdown_replace`, `chunk`, `tool_request`, `tool_result`, `context`, `done`, `error`.

### Dialog markdown format

Dialogs are files named:

`dialog/<YYYYMMDD-HHmmss>-<slug>-<status>.md`

Where `<status>` is one of: `active`, `done`.

#### Dialog header

```md
# Dialog

> Provider: openai
> Model: gpt-5
> Started: 2026-02-16T20:11:00Z
```

#### Doc context block

Injected after the header, before the first user message. Contains a compacted snapshot of `doc/main.md` so the LLM has project context on every turn.

```md
<!-- DOC_MAIN_CONTEXT_START -->
> Prompt context: doc/main.md (1234 chars, compacted)

    # My Project

    Description of the project...
<!-- DOC_MAIN_CONTEXT_END -->
```

This block is updated in place before each LLM call. This is done in case `doc/main.md` changes between calls.

#### User section

```md
## User
> Time: 2026-02-16T20:11:00Z

Please read readme.md and summarize it.
```

#### Assistant section

```md
## Assistant
> Model: gpt-5
> Time: 2026-02-16T20:11:01Z - 2026-02-16T20:11:14Z

Here is the summary.

> Usage: input=1453 output=183 total=1636
> Usage cumulative: input=1453 output=183 total=1636

> Context: used=1636 limit=272000 percent=1%
```

- `> Time:` end is `...` while the assistant is still generating; replaced with the actual timestamp when done.
- `> Usage:` is this turn's token counts.
- `> Usage cumulative:` tracks cumulative output tokens across the dialog (input is per-turn since it includes the full conversation each time).
- `> Context:` shows how much of the model's context window is used.

#### Tool blocks (inline in assistant sections)

Tool calls are **not** separate `## Tool Request` / `## Tool Result` sections. They live inside the `## Assistant` section as fenced blocks delimited by `---`:

```md
---
Tool request: run_command [call_abc123]
> Description: List project files to check structure

    {
      "command": "ls /workspace"
    }

Result:

    {
      "success": true,
      "stdout": "file1.txt\nfile2.txt",
      "stderr": ""
    }

---
```

Format:
- Opens with `---` on its own line.
- `Tool request: <name> [<id>]` — tool name and provider-assigned call ID.
- `> Description: <text>` — LLM-generated description of what this tool call does. This line is optional but always produced by current tool definitions (the `description` parameter is required in each tool's input schema). The description is stripped from the input JSON displayed below.
- Input JSON is 4-space indented and pretty-printed (with the `description` field removed since it's shown above).
- `Result:` section is appended after execution, also 4-space indented.
- Closes with `---` on its own line.

**Why no schwa wrappers?** JSON payloads are always `JSON.stringify`'d, which escapes newlines within string values as `\n`. Combined with the 4-space indentation, a raw `\n---` at column 0 can never appear inside a tool block's JSON payload. The `---` delimiters are therefore unambiguous without additional wrappers.

Multiple tool calls in one assistant turn produce multiple `---...---` blocks in sequence.

A tool block without a `Result:` section means execution hasn't completed yet (the block is still streaming or the dialog was interrupted).

#### Tool block streaming

Tool argument deltas from the LLM stream into both the `.md` file and SSE through the same write buffer as regular text chunks. The block builds up incrementally:

1. Tool call starts → `---\nTool request: name [id]\n\n` is written.
2. Argument JSON fragments arrive → written as raw (unindented) partial JSON.
3. Tool call ends → `\n\n---` closes the block.
4. Tool executes → `writeToolResults` reads the `.md`, finds the raw block, and replaces it with the pretty-printed version (4-space indented JSON + Result section).

The SSE `markdown_append` and `markdown_replace` events mirror these writes exactly, so a client reconstructing markdown from SSE events produces a byte-for-byte match with the on-disk file.

#### Parsing rules

`parseSections` splits the dialog on `## User` and `## Assistant` headings. Each section's content is everything up to the next heading.

`parseToolCalls` finds `---\nTool request:...\n---` blocks within a section using a regex. It extracts the tool name, ID, input JSON, and optional result JSON.

`parseDialogForProvider` reconstructs the provider-specific message array from parsed sections — assistant text becomes text messages, tool blocks become `tool_use`/`tool_calls` entries, results become `tool_result`/`tool` messages.

`stripSectionMetadata` removes `> Time:`, `> Model:`, `> Usage:`, `> Context:`, etc. lines before sending content to the LLM, so the model only sees the actual text and tool blocks.

Markdown is the source of truth. No server-side state. Restart-safe by design.

### Server: tools for dialogs

The LLM always receives four tools:

- `run_command` - run a shell command (300s timeout, 4MB max output). Use for reading files (`cat`), listing directories (`ls`), HTTP requests (`curl`), git, and anything else the shell can do. Takes `{description, command}`.
- `write_file` - create or overwrite a file. Takes `{description, path, content}`. Bypasses the shell so content with quotes, backticks, template literals, etc. is written cleanly.
- `edit_file` - surgical find-and-replace. Takes `{description, path, old_string, new_string}`. `old_string` must appear exactly once in the file; if it appears zero times or more than once, the tool returns an error asking for more context. The LLM should read the file first (`cat` via `run_command`) before editing.
- `launch_agent` - spawn another top-level dialog (flat structure, no subagent tree). Takes `{description, provider, model, prompt, slug?}` and is equivalent to `POST /project/:project/dialog`.

All tools require a `description` parameter — a brief LLM-generated summary of what the call does (e.g. "List project files to check structure"). This description is stored as metadata in the tool block (`> Description: <text>`) and displayed as the primary label in the client UI.

Tool definitions are written once and converted to both Claude and OpenAI formats.

**No server-side state.** All tool-call state lives in dialog markdown. The server reconstructs tool history by parsing markdown each request.

#### Tool-call flow

1. LLM streams tool call arguments. Server writes the tool block header and argument deltas to the `.md` and SSE in real time.
2. Tool call completes. Server closes the `---` block.
3. Server executes the tool immediately (YOLO).
4. `writeToolResults` replaces the raw block in the `.md` with the pretty-printed version including the `Result:` section. A `markdown_replace` SSE event mirrors this.
5. The loop continues — if the LLM emits more tool calls or text, they stream through the same mechanism.

No separate tool-execution endpoint is needed in normal flow. No tool approvals or pause states.

### Client: dialogs

Left sidebar lists dialog files (those under `dialog/`). Right side is a chat view: messages parsed from the file, rendered as bubbles.

Bubbles are labeled **You** and **Agent** (never raw `user`/`assistant` labels). Tool calls render as their own separate bubbles in the chat view — even when multiple tool blocks are contiguous inside a single `## Assistant` section in markdown. URLs and markdown links in dialog content are clickable and open in a new tab (`target="_blank"`). While the agent is streaming, there must never be an empty-looking agent bubble: if the current assistant section has no visible content yet, the client shows a friendly live placeholder instead of a blank message.

Input area: provider select (Claude/OpenAI), textarea (Cmd+Enter to send), Send button. During streaming, partial response shown with block cursor. Input is disabled while streaming.

At the top right of the dialog area, arrow buttons jump to the previous/next message inside the scroll area.

When viewing a done dialog, the user can choose **Continue in fresh dialog**. The client implements this as a manual compaction flow:
1. send a fixed handoff-summary prompt to the current dialog,
2. wait for that compaction turn to finish,
3. start a brand-new dialog whose first user prompt is the produced handoff text.

This uses the existing dialog routes only — no special server compaction endpoint or extra tool call is required.

User messages are rendered optimistically (shown immediately when sent).

Message resources/tokens are shown from each section's `> Resources:` metadata line.

#### Client dialog lifecycle

1. **Starting a dialog**: POST to `/dialog` returns JSON `{dialogId, filename, status}`. Client immediately opens `GET /dialog/:id/stream` (SSE) to follow live output.
2. **Continuing a dialog**: PUT to `/dialog` with a prompt returns JSON. Client opens the stream endpoint to follow the new turn.
3. **Opening an existing dialog**: GET `/dialog/:id` returns the full markdown. If `status` is `active`, client also opens `GET /dialog/:id/stream` to follow live output.
4. **Reconnect (page refresh)**: Client re-reads the file via `GET /dialog/:id`. If the dialog is still active, it reattaches to the stream. Any content already in the file is rendered immediately; new chunks arrive via SSE.
5. **Stream ends**: When a `done` event arrives, the client closes the EventSource and re-enables input.

### Client: tools for dialogs

All tool calls execute immediately (YOLO) — there is no approval/denial UI. Tool requests and results are displayed inline in the chat view as they happen.

#### Tool call descriptions

Each tool call includes a `description` parameter — a brief LLM-generated summary of what the call does and why (e.g. "List project files to check structure"). This description is:
- Stored in the tool block markdown as `> Description: <text>` after the tool request header line.
- Stripped from the input JSON displayed in the block.
- Shown in the client as the primary label: the compact (collapsed) view shows only the tool type icon and the description.
- Expanding ("More") reveals a readable presentation of the input and output, with line breaks preserved and common tool payloads rendered without raw JSON clutter where possible.

#### Diff rendering for `edit_file`

When an `edit_file` tool call is displayed (pending or decided), the client renders a unified diff of `old_string` → `new_string`:

- Lines starting with `-` are shown in red (removed).
- Lines starting with `+` are shown in green (added).
- Context lines (unchanged) are shown in gray.

By default, only 3 context lines around each change are visible. A "Show full diff" toggle expands to all lines. This is purely a client rendering concern - the markdown stores the full `old_string` and `new_string` as-is.

#### Bootstrapping

There is no orchestration loop. To get the system going, the user starts a single dialog. That first agent reads `doc/main.md` and decides what to do - including spawning more agents via the `launch_agent` tool if needed. Each spawned agent is a flat, independent dialog that can itself spawn further agents.

### Server: embed proxy

Apps running inside a project (e.g. a tictactoe game on port 4000) can be embedded in any doc via a reverse proxy through the vibey server.

#### Proxy route

`ALL /project/:project/proxy/:port/*` — reverse-proxies to the target app.

- Resolves the project container's IP on `vibey-net` and proxies to `http://<container-ip>:<port>/<path>`. No host port exposure needed.

The wildcard captures the full URL path and query string. Behavior:

1. Validates `:port` is a number in 1–65535.
2. Validates `:project` exists.
3. Forwards method, headers, and body (stripping hop-by-hop headers like `host`, `connection`).
4. Streams the response back (status, headers, body) — no buffering, so large files and SSE from the embedded app work.
5. Sets `X-Frame-Options: SAMEORIGIN` so the iframe loads but external sites can't frame it.

No URL rewriting is needed: the iframe's `src` is `/project/<project>/proxy/<port>/`, so relative URLs inside the app (like `app.js`) resolve naturally to `/project/<project>/proxy/<port>/app.js`.

Embedded apps should use relative paths. Apps that use absolute paths (e.g. `/style.css`) would escape the proxy — this can be addressed later with a `<base>` tag injection if it becomes a pain point.

### Server: static proxy

Projects that are just static HTML/JS/CSS can be embedded without running a backend.

#### Static route

`GET /project/:project/static/*` — serves files from the project.

Behavior:

1. Validates `:project` exists.
2. Resolves the requested path (no `..`).
3. If the path is empty or ends in `/`, serves `index.html`.
4. Reads the file from the project container via `projectFS` and serves it.
5. Sets `X-Frame-Options: SAMEORIGIN`.

#### Embed markdown syntax

Embed blocks use schwa wrappers. Use the schwa character `ə` (U+0259) — avoid look‑alikes like Arabic `ە` (U+06D5). The canonical delimiter is two schwas (`əə`). Three schwas (`əəə`) are also accepted for backward compatibility.

```md
əəembed
port 4000
height 500
title Tictactoe
əə
```

Static embed (no backend):

```md
əəembed
port static
path /
height 500
title Static app
əə
```

Fields:

| Field    | Default  | Meaning                                                              |
|----------|----------|----------------------------------------------------------------------|
| `port`   | `static` | Port number **or** the string `static` for the static proxy          |
| `path`   | `/`      | Initial path to load (used for both proxy and static)                |
| `height` | `400`    | Iframe height in px                                                  |
| `title`  | `App`    | Shown in a small header bar above the embed                          |

One embed = one port + path. Multiple embeds are done by using multiple blocks.

Parsing rules: ignore blank lines, ignore lines starting with `#`, each line is `key value`.

Example inside a doc:

```md
# Tictactoe Project

Here's the running game:

əəembed
port 4000
title Tictactoe
height 500
əə

Here's a static app:

əəembed
port static
path /
title Static app
height 500
əə

## Architecture
...
```

### Client: embed rendering

When rendering markdown (doc preview or dialog view), the client detects `əəembed ... əə` blocks (or `əəəembed ... əəə` for backward compatibility) and replaces them with an iframe:

```html
<!-- port number -->
<iframe src="/project/{project}/proxy/{port}/{path}"
        style="width:100%; height:{height}px; border:1px solid #333; border-radius:8px;"
        title="{title}"
        sandbox="allow-scripts allow-forms allow-same-origin">
</iframe>

<!-- port static -->
<iframe src="/project/{project}/static/{path}"
        style="width:100%; height:{height}px; border:1px solid #333; border-radius:8px;"
        title="{title}"
        sandbox="allow-scripts allow-forms allow-same-origin">
</iframe>
```

`sandbox` keeps the embedded app from navigating the top frame; `allow-same-origin` lets it talk to the proxy (same origin as vibey).

## Dockerization

### Architecture: full container isolation

Every project runs in its own Docker container with its own named volume. Vibey itself runs in a separate container. There are **no shared volume mounts** between vibey and project containers. If an agent goes rogue in a project, the blast radius is completely limited to that project — it cannot read, write, or delete files in other projects or in vibey itself.

```
┌──────────────────────────────────────────┐
│  vibey container (port 5353 on host)     │
│  - serves UI + API                       │
│  - projectFS: reads/writes via docker    │
│  - reverse-proxies to container IPs      │
│  - manages container lifecycle           │
│                                          │
└────────┬─────────────────────────────────┘
         │ docker network (vibey-net)
    ┌────┴────┐    ┌────┴────┐
    │ proj-A  │    │ proj-B  │
    │ vol-A   │    │ vol-B   │
    │ /workspace   │ /workspace
    └─────────┘    └─────────┘
```

### Container details

- **Vibey container**: runs the vibey server. Has access to the Docker socket to manage project containers. Published port: 5353 (host).
- **Project containers**: one per project. Named `vibey-proj-<name>`. Main process is `/bin/sh` — a living shell session that keeps the container alive. Long-running child processes must be launched explicitly in a way that survives the shell returning, for example `nohup node server.js >/tmp/app.log 2>&1 &`. No published ports — only reachable by vibey via the `vibey-net` Docker network.
- **Project volumes**: one named volume per project (`vibey-vol-<name>`), mounted at `/workspace` inside the project container. This is the project's entire world. All agent work (code, data, servers) lives here.
- **Sandbox image**: `vibey-sandbox:latest` — a base image with common tools (node, npm, git, curl, etc.) that all project containers use.

### projectFS: file operations across the container boundary

Since there are no shared volume mounts, vibey cannot use `fs.readFileSync` / `fs.writeFileSync` on project files. All file operations go through Docker:

| Operation | Implementation |
|---|---|
| List files | `docker exec proj-A ls /workspace` |
| Read file | `docker exec proj-A cat /workspace/file.md` or `docker cp proj-A:/workspace/file.md -` |
| Write file | Pipe content via `docker exec -i proj-A sh -c 'cat > /workspace/file.md'` |
| Rename file | `docker exec proj-A mv /workspace/old.md /workspace/new.md` |
| Delete file | `docker exec proj-A rm /workspace/file.md` |
| Check exists | `docker exec proj-A test -f /workspace/file.md` |

These are wrapped in a `projectFS` abstraction in server.js.

Latency per `docker exec` call is ~20-50ms. For human-speed UI operations (loading a doc, saving a file) this is fine. For tight loops (e.g., reconstructing dialog history before an LLM call), batch reads into a single `docker exec` (e.g., `cat /workspace/dialog/*.md`).

### Container lifecycle

| Event | Action |
|---|---|
| Project created | Spin up container with fresh named volume, main process `/bin/sh` |
| First dialog turn / tool execution | Container already running (created at project creation) |
| Project deleted | Abort active dialog streams → `docker rm -f vibey-proj-<name>` → `docker volume rm vibey-vol-<name>` |
| Vibey shutdown | Remove all project containers (`docker rm -f` with label `vibey=project`). Volumes are kept. |
| Vibey startup | Remove any leftover project containers from previous runs. Volumes survive — projects whose volumes still exist appear in `GET /projects` as usual. |
| Project accessed (any API call) | If the volume exists but the container is gone (normal state after a restart/rebuild), a fresh container is created and attached to the existing volume. This happens lazily on first access, not eagerly at startup. All project data (code, docs, dialogs, uploads) is intact because it lives on the volume. |

### Embed proxy

The proxy route `ALL /project/:project/proxy/:port/*` resolves the project container's IP on `vibey-net` and proxies to `http://<container-ip>:<port>/<path>`. No host port exposure needed for project containers.

The static route `GET /project/:project/static/*` reads the file from the project container via `docker cp` or `docker exec cat` and serves it to the browser.

Agent prompt says: *"Your working directory is /workspace. If you run a server, listen on port 4000. Embeds use `port 4000`."* The agent never knows or cares about host ports or container IPs.

### Tool execution

- `run_command`: already runs via `docker exec` in the project container. Commands are not detached automatically; if an agent wants a process to keep running after the command returns, it must launch it explicitly in the background with redirection (for example `nohup ... >/tmp/app.log 2>&1 &`).
- `write_file`: goes through `projectFS.writeFile` (pipes content into the container).
- `edit_file`: `projectFS.readFile` → find/replace in vibey's memory → `projectFS.writeFile`.
- `launch_agent`: spawns a new dialog in the same project container (same container, new dialog file).

## Cloud mode

Vibey runs in one of two modes: **local** (the default) or **cloud**. The mode is determined by the presence of a `VIBEY_CLOUD` environment variable. In local mode, there is no authentication — the user is implicitly logged in. In cloud mode, all routes (except auth routes and public routes) require a valid session cookie and CSRF token.

### Server: mode detection

`GET /auth/csrf` — the client calls this on startup to determine the mode.

- **Local mode**: returns `{mode: 'LOCAL'}`. No cookie or CSRF needed.
- **Cloud mode, logged in**: returns `{csrf: '<token>'}`. The session cookie is already set.
- **Cloud mode, not logged in**: returns `403 {error: 'session'}`.

### Server: cloud configuration

Cloud mode requires additional fields in `secret.json`:

```json
{
  "cookieSecret": "a-long-random-string",
  "ses": {
    "accessKeyId": "...",
    "secretAccessKey": "...",
    "region": "eu-west-1"
  },
  "email": {
    "name": "Vibey",
    "address": "no-reply@yourdomain.com"
  },
  "adminEmail": "admin@yourdomain.com"
}
```

- `cookieSecret` — used by cicek for cookie signing. Required in cloud mode; ignored in local mode.
- `ses` — AWS SES credentials for nodemailer (`nodemailer-ses-transport`). All transactional emails (OTPs, signup notifications, welcome emails) go through SES.
- `email.name` / `email.address` — the `From:` header on outgoing emails.
- `adminEmail` — where signup notification emails are sent.

### Server: auth

Authentication is OTP-over-email. No passwords, no SSO. Emails are sent via nodemailer with the SES transport configured in `secret.json`.

- `POST /auth/signup` — request an invite. Body: `{email}`. Stores the request in redis (`signup:<email>` hash with `email`, `createdAt`) and sends a notification email to `adminEmail`. Returns `{ok: true}`. Idempotent — re-requesting with the same email overwrites the previous request.

- `POST /auth/login` — request an OTP. Body: `{email}`. If the user exists, generates a 6-digit OTP, stores it in redis (`otp:<user-id>` with a 10-minute TTL via `SETEX`), and emails it to the user via SES. Returns `{ok: true}`. If the user does not exist, returns `403 {error: 'user not found'}`.

- `POST /auth/verify` — verify an OTP and create a session. Body: `{email, otp}`. Validates the OTP against `otp:<user-id>`. On success:
  - Deletes the OTP key.
  - Generates a session id (`crypto.randomBytes(32).toString('hex')`).
  - Stores `session:<id>` → `<user-id>` with a 7-day TTL (`SETEX`, `604800` seconds).
  - Generates a CSRF token (`crypto.randomBytes(32).toString('hex')`).
  - Stores `csrf:<csrf-token>` → `<session-id>` with the same TTL.
  - Sets an `httponly` cookie named `vibey` with `samesite=Lax`, `path=/`, and a far-future `expires` (so the server controls expiry via `SETEX` + 403, not the browser).
  - Returns `{csrf: '<token>'}`.
  - On failure: `403 {error: 'invalid otp'}`.

- `POST /auth/logout` — destroy the current session. Deletes `session:<id>` and `csrf:<token>` from redis. Clears the cookie. Returns `{ok: true}`.

### Server: session & CSRF gatekeeping

A catch-all route early in the route list handles session validation for cloud mode:

1. If not in cloud mode, call `rs.next ()`.
2. If the route is an auth route (`/auth/*`) or a public route (`/public/*`), call `rs.next ()`.
3. If no cookie or no `vibey` cookie: return `403 {error: 'nocookie'}`.
4. Look up `session:<cookie-value>` in redis. If missing or expired: return `403 {error: 'session'}`.
5. Look up the user from `user:<user-id>`. Attach `rq.user` with `{id, email, admin}`.
6. Refresh the session and CSRF TTLs (`EXPIRE`, 604800 seconds) on every authenticated request.
7. Look up `csrf:<token>` and attach `rq.user.csrf`.
8. Call `rs.next ()`.

For `POST`/`PUT`/`DELETE` requests (except auth routes and Bearer-authenticated trigger endpoints), a subsequent route validates the CSRF token against `rq.user.csrf`. For `POST`/`PUT` the client sends it in `rq.body.csrf`; for `DELETE` the server also accepts `X-CSRF-Token` or `?csrf=...`. On mismatch: `403 {error: 'csrf'}`. When present in the JSON body, the CSRF token is stripped before the route handler runs.

### Server: admin

- `GET /admin/signups` — list pending signup requests (admin-only). Returns array of `{email, createdAt}`, newest first. Scans redis keys matching `signup:*`.

- `POST /admin/createUser` — approve a signup (admin-only). Body: `{email}`. Creates the user:
  - Generates a user id (`crypto.randomBytes(16).toString('hex')`).
  - Stores `user:<id>` hash with `{id, email, createdAt, lastActive, settings: '{}'}`.
  - Stores `email:<email>` → `<user-id>` for email-to-id lookup.
  - Deletes `signup:<email>`.
  - Sends the user a welcome email with a login link.
  - Returns `{ok: true, id: '<user-id>'}`.

Admin-only routes check `rq.user.admin === '1'`; non-admins receive `403`.

### Server: user scoping

In cloud mode, projects and snapshots are scoped to the authenticated user:

- Project containers are named `vibey-proj-<user-id>-<name>` (instead of `vibey-proj-<name>`).
- Project volumes are named `vibey-vol-<user-id>-<name>`.
- `GET /projects` lists only the current user's projects (filtered by `<user-id>` prefix in container/volume names).
- Snapshots are stored in the shared snapshots directory, but each snapshot entry carries an `ownerId` in its metadata. Listing, download, restore, and delete operations all enforce ownership, so users can only access their own snapshots.

In local mode, scoping is unchanged (no user id prefix).

### Server: user settings

- In **local mode**, settings live in `secret.json` on disk (current behavior).
- In **cloud mode**, settings live in the `settings` field of `user:<id>` in redis. `GET /settings` reads from redis; `POST /settings` writes to redis.
- In cloud mode, OAuth credentials are also stored per-user inside that user's settings. Pending OAuth login state is stored in Redis with a TTL, keyed by user and provider, so concurrent users do not share OAuth flow state.
- `GET /settings` returns masked provider keys (OpenAI/Anthropic). In cloud mode, also includes the project trigger ID for the currently open project (if any).

### Server: triggers

Each project has a unique, crypto-strong trigger ID generated at project creation time (`crypto.randomBytes(16).toString('hex')`). The trigger ID is stored in redis:

- `trigger:<id>` → `<userId>:<projectSlug>` — maps a trigger ID to the owning user and project.
- `projecttrigger:<userId>:<projectSlug>` → `<trigger-id>` — reverse lookup from project to trigger ID.

The trigger ID can be used in two ways:

1. **API**: `POST /trigger` with `Authorization: Bearer <trigger-id>`. Body: `{model?, prompt?, slug?, data?}`. Returns `202 {ok: true, dialogId}`.
2. **Email**: send an email to `trigger+<trigger-id>@<VIBEY_TRIGGER_EMAIL_DOMAIN>`. The email's `from`, `subject`, and `body` are placed in the `data` property and used to construct the prompt.

If `model` is specified, the provider is derived from the model name (e.g. `gpt-*` → OpenAI, `claude-*` → Anthropic). If the model is unknown, the trigger returns `400`. If `model` is not specified, the server autodetects: it checks the user's settings for configured providers (OpenAI API key or OAuth, Anthropic API key or OAuth). If both are available, OpenAI is preferred (higher rate limits). If neither is available, the trigger returns `422`.

The prompt is constructed as follows:
- If `prompt` is present in the body, use it directly.
- If `data` is present, construct the prompt from `data`: `"Trigger from <from>\n\nSubject: <subject>\n\n<body>"`.
- If neither `prompt` nor `data` is present, return `400`.

#### Models endpoint

`GET /models` — returns the list of known models, scoped by provider:

```json
{
  "openai": {
    "gpt-5.4": {"context": 1000000},
    "gpt-5.2": {"context": 272000},
    "gpt-4.1": {"context": 1000000, "apiKeyOnly": true}
  },
  "anthropic": {
    "claude-opus-4-6": {"context": 1000000},
    "claude-sonnet-4-6": {"context": 200000},
    "claude-haiku-4-5": {"context": 200000}
  }
}
```

The client fetches this on startup to populate the model selector and context window sizes.

Some models are marked `apiKeyOnly: true` — they require a provider API key and cannot be used through OAuth/fixed-rate subscriptions. The `GET /models` endpoint filters these out when the user has no API key for the corresponding provider (i.e. the model won't appear in the response). When such a model is selected for a dialog, the server uses the API key directly, bypassing OAuth even if OAuth credentials are available.

#### SMTP server (cloud mode)

When `VIBEY_CLOUD=1` and `VIBEY_DISABLE_EMAIL` is not set, vibey starts an embedded SMTP server on port 25 using the `smtp-server` npm package. The trigger email domain is configured via the `VIBEY_TRIGGER_EMAIL_DOMAIN` environment variable (set in `utils/deploy.sh`).

The SMTP server:
1. Validates `rcptTo` against the pattern `trigger+<id>@<domain>`.
2. Parses the email with `mailparser`.
3. Extracts `{from, subject, body}` into a `data` object.
4. Calls the same shared `executeTrigger` function used by `POST /trigger`.

### Client: triggers

When a project has a `triggerId`, the dialogs header shows two buttons:

- **⚡ API** — copies `Bearer <trigger-id>` to the clipboard and opens a Trigger API modal with three copyable snippets: the POST endpoint, the `Authorization` header, and a ready-to-run `curl` example. The `curl` example body includes both `prompt` and `model` so users see that the model can be specified optionally (provider is derived from the model name; when omitted, the server autodetects).
- **⚡ Email** — copies `trigger+<trigger-id>@<domain>` to the clipboard. Hidden when the trigger email domain is empty.

#### Migration: triggers-v1

On server startup, if the `migration:triggers-v1` key does not exist in redis:
1. Scan Docker volumes matching the name pattern `vibey-vol-*` to find all existing projects (including sleeping ones without running containers).
2. For each volume, parse the userId and project slug from the volume name. Generate a trigger ID and store `trigger:<id>` and `projecttrigger:<userId>:<slug>`.
3. Remove all old API key redis keys: scan and delete `userapikey:*`, `apikey:*`, `userapikeyreveal:*`.
4. Set `migration:triggers-v1` → `1` in redis.

### Server: public access

Users can publish specific project surfaces (static files, proxied apps, docs) for anonymous access.

- `GET /access` — list all access rules for the current user. Returns `{rules: {<project>:<path>: 'ALL', ...}}`.
- `POST /access` — overwrite access rules. Body: `{rules: {<project>:<path>: 'ALL', ...}}`. Stores in `access:<user-id>` hash in redis.

Public routes:

- `GET /public/:userId/:project/static/*` — serve a static file if the path is published.
- `ALL /public/:userId/:project/proxy/:port/*` — reverse-proxy to a running app if the path is published. `POST` is allowed (the app handles its own mutations).
- `GET /public/:userId/:project/doc/:name` — serve a rendered doc page (HTML generated with `lith` from the markdown source, with working embeds). Only if the doc path is published.

Public routes check for a session cookie if one is present (to identify the caller) but never deny access based on authentication. If the requested path is not in the user's `access:<user-id>` hash, return `404`.

### Server: redis data model

All cloud state lives in redis. Key schema:

| Key pattern | Type | TTL | Contents |
|---|---|---|---|
| `user:<id>` | hash | — | `id`, `email`, `createdAt`, `lastActive`, `settings` (JSON string), `admin` (`'1'` or absent) |
| `email:<email>` | string | — | `<user-id>` — reverse lookup |
| `session:<id>` | string | 7 days | `<user-id>` |
| `sessioncsrf:<session-id>` | string | 7 days | `<csrf-token>` — quick lookup for `GET /auth/csrf` |
| `csrf:<token>` | string | 7 days | `<session-id>` |
| `otp:<user-id>` | string | 10 min | `<6-digit code>` |
| `signup:<email>` | hash | — | `email`, `createdAt` |
| `trigger:<id>` | string | — | `<userId>:<projectSlug>` — maps trigger ID to user and project |
| `projecttrigger:<userId>:<projectSlug>` | string | — | `<trigger-id>` — reverse lookup from project to trigger ID |
| `access:<user-id>` | hash | — | `<project>:<path>` → `ALL` or JSON array of user ids |
| `migration:triggers-v1` | string | — | `1` when migration has run |

### Client: auth

- On startup, the client calls `GET /auth/csrf`.
  - If response is `{mode: 'LOCAL'}`: skip all auth UI, proceed as today.
  - If response is `{csrf: '...'}`: store the CSRF token, proceed as today. Show a **Logout** button in the header.
  - If response is `403`: show the login view.

- **Login view**: email input → "Send code" button → OTP input → "Verify" button. On success, store CSRF token, navigate to projects.
- **Signup view**: email input → "Request invite" button. Shows confirmation message after submit.
- **Logout**: `POST /auth/logout`, clear local state, show login view.

All `POST`/`PUT`/`DELETE` requests from the client include `csrf` in the body (stripped by the server before the route handler sees it).

### Client: admin

A new **Admin** tab is visible only when `rq.user.admin === '1'` (the server includes `admin: true` in the CSRF response for admin users: `{csrf: '...', admin: true}`).

- **Signups list**: fetched from `GET /admin/signups`. Each entry shows the email and a "Create user" button that calls `POST /admin/createUser`.

### Client: public access

A new **Access** section in the project header (cloud mode only). Shows a list of published paths with toggles. Calls `GET /access` to load and `POST /access` to save.

## Client implementation

#### State variables (alphabetical, 40 total)

| # | Key | Type / Purpose |
|---|-----|----------------|
| 1 | `contextWindow` | `object\|null` — `{used, limit, percent}` from last assistant turn |
| 2 | `currentFile` | `object\|null` — `{name, content, original}` for open file |
| 3 | `currentProject` | `string\|null` — slug of open project |
| 4 | `currentUpload` | `string\|null` — name of selected upload |
| 5 | `dialog` | `object` — dialog/chat UI state container |
| 6 | `dialog.autoStick` | `bool` — auto-scroll chat to bottom |
| 7 | `dialog.input` | `string` — current dialog textarea value |
| 8 | `dialog.model` | `string` — selected LLM model |
| 9 | `dialog.provider` | `string` — `'claude'` or `'openai'` |
| 10 | `dialog.voiceActive` | `bool` — voice input active |
| 11 | `dialog.voiceRecognition` | `object\|null` — SpeechRecognition instance |
| 12 | `dialog.voiceSupported` | `bool` — browser supports speech recognition |
| 13 | `editorPreview` | `bool` — show markdown preview in docs editor |
| 14 | `files` | `array` — file list for current project |
| 15 | `hashTarget` | `object\|null` — parsed URL hash target |
| 16 | `loadingFile` | `bool\|null` — file loading in progress |
| 17 | `oauth` | `object` — OAuth UI state container |
| 18 | `oauth.code` | `string` — manual OAuth code input (`code#state`) |
| 19 | `oauth.loading` | `string\|null` — provider currently in OAuth flow (`openai` or `claude`) |
| 20 | `oauth.step` | `object\|null` — current OAuth UI step, eg `{provider, flow, url}` |
| 21 | `optimisticUserMessage` | `string\|null` — optimistic user message shown before server confirms |
| 22 | `projects` | `array` — project list |
| 23 | `savingFile` | `bool\|null` — file save in progress |
| 24 | `savingSettings` | `bool\|null` — settings save in progress |
| 25 | `settings` | `object` — loaded from server (`GET /settings`) |
| 26 | `settingsEdits` | `object\|null` — pending settings edits |
| 27 | `settingsShowMore` | `bool\|null` — show advanced settings |
| 28 | `snapshots` | `array` — snapshot list |
| 29 | `streaming` | `bool\|null` — SSE stream active |
| 30 | `streamingContent` | `string\|null` — accumulated SSE content |
| 31 | `streamingDialogId` | `string\|null` — dialogId of active stream |
| 32 | `tab` | `string` — current tab (`projects`, `docs`, `dialogs`, `settings`, `snapshots`) |
| 33 | `toolMessageExpanded` | `object` — `{key: bool}` toggle state for tool messages |
| 34 | `uploading` | `bool` — upload in progress |
| 35 | `uploads` | `array` — upload list for current project |
| 36 | `viCursor` | `object` — `{line, col}` vi cursor position |
| 37 | `viMode` | `bool` — vi mode enabled |
| 38 | `viOverlayChat` | DOM ref — vi cursor overlay for chat input |
| 39 | `viOverlayEditor` | DOM ref — vi cursor overlay for editor |
| 40 | `viState` | `object` — `{mode, pending, register, lastSearch, message, commandPrefix, undoStack, redoStack}` |

#### Timeouts & intervals (8 total)

| # | Line | Type | Delay | Purpose | Status |
|---|------|------|-------|---------|--------|
| 1 | 980 | `setTimeout` | 0ms | Auto-scroll chat to bottom after DOM update | 🟡 Could use `requestAnimationFrame` |
| 2 | 1158 | `setTimeout` | 50ms | Focus textarea + init vi cursor after toggling vi mode | 🟡 Waiting for DOM redraw; fragile timing |
| 3 | 1261 | `setTimeout` | 0ms | Auto-select first file after loading file list (if no file/hash target) | 🟡 Deferred to let `apply hashTarget` run first; could be a callback |
| 4 | 1398 | `setTimeout` | 50ms | Init vi cursor overlay after loading a new file | 🟡 Same DOM-wait pattern as #2 |
| 5 | 1554 | `setTimeout` | 0ms | Fallback for `requestAnimationFrame` (vi cursor restore) | 🟢 Fine — browser compat fallback |
| 6 | 2012 | `clearTimeout` | — | Cancel pending voice command timer | 🟢 Fine — part of voice command debounce |
| 7 | 2027 | `setTimeout` | 50ms | Delay `send message` after voice command to let `recognition.stop()` settle | 🟡 Fragile; should use `onend` callback |
| 8 | 2054 | `setTimeout` | 1500ms | Voice command confirmation delay — wait to see if more speech follows | 🟢 Fine — intentional debounce for UX |

#### Big `B.view` dependency lists (redraw hotspots)

The two main views have very wide dependency lists, meaning they redraw on almost any state change:

1. **Docs sidebar+editor view** (line 2107) — **13 dependencies**: `files`, `currentFile`, `loadingFile`, `savingFile`, `editorPreview`, `currentProject`, `viMode`, `viState`, `viCursor`, `viOverlayEditor`, `uploads`, `currentUpload`, `uploading`.

2. **Dialogs view** (line 2979) — **15 dependencies**: `files`, `currentFile`, `loadingFile`, `dialog`, `streaming`, `streamingContent`, `optimisticUserMessage`, `toolMessageExpanded`, `currentProject`, `viMode`, `viState`, `viOverlayChat`, `settings`, `contextWindow`, `vibeyingSpin`.

These are the main sources of redraw storms. For example, every keystroke in the dialog input (`dialog.input`) triggers a full redraw of the entire dialogs view. Similarly, every `viState` sub-key change (pending, register, message, etc.) redraws the full docs view.

#### What to address

Quick wins:
- The 50ms `setTimeout` calls for vi cursor (lines 1158, 1398) use the same pattern — extract a shared helper.

Bigger refactors:
- Break up the two mega-views into smaller nested `B.view`s so that e.g. `dialog.input` changes only redraw the input area, not the entire dialog view. The B.views can be inline, no need to extract them to a separate variable. Bring state down to where it's needed, instead of up as in react.
- The `setTimeout(fn, 0)` calls for auto-file-select (line 1261) and auto-scroll (line 980) are workarounds for ordering issues — replace with explicit sequencing in responders.

### Mobile UX (implemented)

The current client has a dedicated phone layout for viewports narrower than `768px`; desktop layout remains unchanged at `768px` and above.

#### Navigation and layout

- Phone uses a **single-pane layout** instead of the desktop multi-pane layout.
- A persistent **bottom navigation** provides four primary entries: **Projects**, **Docs**, **Dialogs**, and **More**.
- A phone-specific **top bar** shows the current surface and project context.
- The **More** entry opens a phone-only secondary-actions sheet, including access to **Settings**, **Snapshots**, test runner, and logout, without changing desktop navigation.

#### Docs on phone

- The desktop left sidebar is replaced by phone-only sheets for:
  - the **docs/files list**
  - the **uploads list**
- Docs use a single primary surface at a time: there is **no split editor/preview** on phone.
- The editor header exposes explicit phone actions to:
  - open the docs list
  - open uploads
  - toggle **Edit / Preview**
  - **Save** while dirty
- When no doc is selected, phone users get explicit actions to browse docs or uploads.
- Uploads remain available on phone through the uploads sheet, including upload, selection, and preview.

#### Dialogs on phone

- The desktop dialog list sidebar is replaced by a phone-only **dialogs sheet**.
- Dialogs keep the conversation as the primary surface, with an explicit button to open the dialog list.
- The composer is **sticky above the keyboard** on phone.
- Streaming keeps the same readable bubble rendering as desktop, avoiding blank-looking assistant bubbles.
- Tool calls remain compact/collapsible in the chat UI, which keeps the mobile dialog surface readable.

#### Projects, settings, and snapshots on phone

- Projects use a phone-specific **card layout** with larger tap targets and explicit **Open** / **Delete** actions.
- Settings-related surfaces use a phone-specific stacked-card layout with **full-width actions**.
- Snapshots use phone-specific stacked cards and wrapped action buttons, without changing desktop snapshots behavior.
- Destructive actions remain behind explicit buttons or confirmations.

#### Mobile behavior details

- The client tracks phone/desktop viewport mode and updates the UI when the viewport crosses the `768px` breakpoint.
- Focused textareas and inputs are scrolled into view on phone to better handle the **soft keyboard**.
- Phone-specific layout elements account for mobile viewport constraints, including safe bottom spacing for sticky controls.

## TODO now

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- Server
   - Make dialog status depend on server status, not filename. Remove date too, autogenerate a suffix with number if there's a repetition on the name.
   - Move CSRF to a header for every method
   - Clean up settings to have 1) no vi mode or editor key; 2) credentials: {<provider>: {api: ..., oauth: {...}}, ...}
   - Don't display slugs for projects, just use project names and let the slugs be an internal thing, resolved inside past the router. Don't return slugs for projects.
   - Block deletion of the main doc
   - Return last modified date for the project by checking on git
   - Please allow specifying of a model in the subject of an email in the trigger.
   - Add mkdir -p as a fallback only to increase speed
   - Remove snapshots
   - Remove compaction of main.md. If main.md changes, reattach it below to avoid busting cache.
   - Support renaming of project
   - Serve static proxy through a normal GET file call
   - Security: public routes must not be served from the same origin as the authenticated app. If `/public/*` stays on the same origin, a malicious published app/doc can use the viewer's session cookie to call private endpoints like `/settings`, `/projects`, `/snapshots`, etc. Serve public content from a separate origin such as `public.vibey.app`, and do not scope the main app's session cookie to the parent domain.
   - Replace puppeteer with playwright

- cclient
   - Dialog
      - Show tooltip to delete current file when on delete mode.
      - Configure AI provider modal: openai, claude (special usage), api keys
      - Select model
      - Send message/stop stream
      - Show streaming dialog
      - Keep on streaming after refresh
      - Show dialog status as color
      - Expand/compress tool call
      - Show main.md as hidden but sent, expandable.
      - Show dialog gauges (N.n ktcache / N.n ktin / N.n ktout, NN.n % window)
      - Cloud only: API trigger modal & email trigger modal (one, email at top, API call below)
   - Project:
      - Download, upload with name
      - Access:
         - Make doc/folder/project public
            - Autorender public markdown files to nice HTML
            - Allow making an entire project public. What's public is the read-only of everything's that in there. It could be just like the vibey interface, but with the editing off.
         - Make project open to another user
   - Docs & dialogs
      - Embedding in doc
      - Open/close tabs
      - Upload/download files/folders
      - See files in other folders (support for special view of image, video and audio). Show edit for textual files.
      - See open processes in the bar too, perhaps tailing logs
      - Send commands to the terminal: start with `term`.
      - Share project with another user
      - Dialog without AI: slider to turn off.
      - Syntax highlighting for code.
      - Multiple tabs open at the same time, split the screen
   - Vi mode
      - Enable/disable in settings.
      - Normal vs insert mode: to normal with escape or command+l. To insert with i I, a A, o O.
      - Navigate with hjkl.
      - Jump word with b w.
      - Go to prev next char with f F.
      - Search with slash + entry + enter: move with n and N.
      - Move tabs with tj tk.
      - Delete last word with Ctrl+W.
      - Copy with yy or N lines with N yy
      - Delete line with dd or N lines with N dd
      - Paste with p
      - Undo with u, redo with ctrl+r
      - Replace with r, delete with x
      - Go to beginning of line with 0, end with $
      - shift + space to add an indent level, ctrl + space to remove it

Calls at a glance:
   - Auth: user, session, csrf token
   - Access: read/write project/doc/dialog
   - Project: create, list, rename, delete, download, upload
   - File: create, list, rename, update, delete.
   - Dialog: create, list, rename, delete, send message, stream, stop, tool call.
   - Proxy: live

To understand a system:
   - System calls: what goes in and what comes out
   - Data at rest on both sides (DB, container structure, in-memory server state for LLM calls, client state)

State:
- Client
- Redis
- Server in-memory
- Files in container

### Client state

```
auth csrf "<CSRF token>"
     email "<email entered in the login/signupform>"
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
     otp "<otp code entered in the login form>"
     otpRequested <0|1> // Whether the OTP request was sent
     signupRequested <0|1> // Whether a signup was just requested
key command <0|1> // if set, the command key is pressed
file content "..." // Current file selected
     mode <edit|view> // Whether we're editing the file we're viewing or not
     remove // If set, when clicking on a file we show crosses to remove them.
     name "..."
files 1 "<filename 1>" // List of files for current project
      ...
models anthropic "<model name>" context <size of context window in tokens>
                 ...
       openai "<model name> context <size of context window in tokens>
              ...
new file "<file name>" // Name for a new file
    project "<project name>" // Enables the new project modal
    type "dialog|file" // Whether the new file is a normal file or a dialog
project "<project slug>" // The current project selected
projects 1 name "<project name>"
           slug "<project slug>"
snackbar color <color>
         message <message>
         timeout "<JS timeout to clear the snackbar>"
settings claude hasKey <0|1>
         claudeOAuth expired <0|1>
                     loggedIn <0|1>
         openai hasKey <0|1>
         openaiOAuth expired <0|1>
                     loggedIn <0|1>
         testButton <0|1>
view "<view name>"
```

### TODO later

- Delete upload
- Poll new dialogs
- Pass a model in the trigger (email & API)
- Use 4.1 with API token, only show it if there is one
- Add test for launching agent
- Add cron triggers.
- How would vibey apps look like? Basically, shareable docs that you can browse, and which have been audited.
- Spin Hetzner engines and bind projects to them.
- Put dialog state in memory [perhaps, but what about sockets]
- Hosted services? (email, DB)
- Billing: aligned pricing: an annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.

## License

Vibey is written by [Altocode](https://altocode.nl) and released into the public domain.
