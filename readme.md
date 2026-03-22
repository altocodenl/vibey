# Vibey

Build your ideas with your words.

## Vibey in a nutshell

1. **Everything is a document**: your description of what you're building. The dialogs with AI while building it. How you orchestrate your agents. Documents are the source of truth for everything. There is no database.
2. **Everything in your browser**: your documents are not only text: use images, audio, and embed small apps in your documents. No terminal or dedicated native app required.
3. **Safe YOLO**: the agents don't ask for permission, they just run the commands that they need for the task you give them, so they work at full speed. **But** each project is fully isolated in its own container and volume. A rogue agent's blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.

## Vibey is for

- **Students of humanities** stranded in the digital age: bring your ideas for tools, games or small apps just by using your words.

- **Researchers** who need custom software to explore data, run analyses, and generate visualizations.

- **Teachers** who want to create interactive learning materials.

- **Founders** who want to explore or quickly iterate a product idea.

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

Snapshots are tar.gz archives of a project's `/workspace`, stored inside vibey's own data volume at `/app/data/snapshots/`. A `snapshots.json` index file tracks metadata. Snapshots are not stored inside project containers — they survive project deletion.

- `POST /project/:project/snapshot` — create a snapshot. Body: `{label?}`. Tars the project container's `/workspace` and stores it. Returns the snapshot entry.
- `GET /snapshots` — list all snapshots, newest first. Returns array of snapshot entries.
- `POST /snapshots/:id/restore` — restore a snapshot as a new project. Body: `{name?}`. Creates a new project container and unpacks the archive into it. Returns `{slug, name, snapshotId}`.
- `DELETE /snapshots/:id` — delete a snapshot. Removes the archive file and index entry.
- `GET /snapshots/:id/download` — download the snapshot archive as a `.tar.gz` file.

Snapshot entry shape:

```json
{
  "id": "20260225-122518-a1b2c3d4",
  "project": "my-project-slug",
  "projectName": "My Project",
  "label": "before refactor",
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

This block is updated in place before each LLM call.

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

- `run_command` - run a shell command (30s timeout, 1MB max output). Use for reading files (`cat`), listing directories (`ls`), HTTP requests (`curl`), git, and anything else the shell can do. Takes `{description, command}`.
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
- **Project containers**: one per project. Named `vibey-proj-<name>`. Main process is `/bin/sh` — a living shell session that keeps the container alive and can parent long-running processes (e.g., `node server.js &` started by an agent). No published ports — only reachable by vibey via the `vibey-net` Docker network.
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

- `run_command`: already runs via `docker exec` in the project container. No change needed.
- `write_file`: goes through `projectFS.writeFile` (pipes content into the container).
- `edit_file`: `projectFS.readFile` → find/replace in vibey's memory → `projectFS.writeFile`.
- `launch_agent`: spawns a new dialog in the same project container (same container, new dialog file).

### Vi mode [TODO]

Vi mode is available for the docs editor and the chat input. Toggle it in **Settings → Editor → Vi mode**. The setting is persisted in `secret.json` under `editor.viMode` and loaded via `GET /settings`.

**Docs editor**
- Modes: normal / insert / command.
- Save with `:w`, close with `:q`, save+close with `:wq`, force close with `:q!`.
- Status bar shows mode or command input + cursor position.

**Chat input (lighter)**
- Modes: normal / insert (no command mode).
- `Ctrl+Enter` sends in both modes.

**Keymap (normal mode)**
- Movement: `h` `j` `k` `l`, `w`/`b`, `0`/`$`, `gg`/`G`, `Ctrl-d`/`Ctrl-u`.
- Insert: `i` `a` `o` `O` `A` `I`.
- Editing: `x`, `dd`, `yy`, `p`, `u`, `Ctrl-r`.
- Search: `/` then `n`/`N`.
- Commands: `:` enters command mode.

### Client implementation

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

## TODO

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

- Guidelines: write & inject them into the beginning prompt. Make them editable in the advanced section of settings (also prompt.md).
- Demo videos
   - A 3D solar system I can rotate and zoom
   - A quick expense tracker
   - A visual timeline of the French Revolution, with key events I can click to expand
- Literate clanking: server.md & client.md
   - Refactor client: proper store organization, improve rfuns (remove almost all timeouts), improve vfuns (bring state down)
      - Properly organize the store, using nested objects. Everything related to dialog state (except the list of dialogs) should be on a single object. Same for loading, it should be an object. Same for current.
      - If a variable's value is used in one place and it's not a magic value, use it inline instead wherever it is needed. Make the code more flowing.
      - The UI redraws synchronously because of gotoB, so there should be
- Please fix vi mode. Take your time to test that the existing functionality really works. Extend the tests in test-client to avoid regressions. You can build and rebuild vibey as you need to.

## Vibey cloud in a nutshell

*WARNING: vaporware, will only build if Vibey itself is useful*

Why use Vibey cloud and not locally?

1. **Always running**: your agents can work while you're away and while your computer is closed.
2. **Available from any device**.
3. **You can share your projects with others**.

How does it work?

1. **Automatic infra**: accessible anywhere with a browser; put projects (containers) onto engines (servers), proxy traffic from/to your apps, HTTPS (bring your DNS record), receive emails, vibey session cookies.
2. **Aligned pricing**: An annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.
3. **Zero lock-in**: the whole thing being open source, so you can always run the same thing yourself elsewhere, also in the cloud.

All you need is an AI provider, no need to install anything.

### TODO vibey cloud design

- There's a switch between running vibey locally and in cloud mode.
- The client should not know or care if we're running locally or in cloud mode? Yes, with the exception of logging in. Locally, you're in automatically, and in the cloud, you have to identify yourself.
- This is going to be an initial version in that we won't support the spinning up of engines (Hetzner VPS), but run everything in a local server.
- How to make this seamless?
   - When in local mode, everything as it is now
   - When in cloud mode:
      - Add auth gatekeeping.
      - There are no port collisions because the proxying is done through ids.
      - Docker containers are prepended with the id of their owner, so it's all scoped without making DB calls.
- Allow users to set a certain project's URLs (not the entire project) to public. Add a `/public` route family for explicitly published project surfaces. These routes always check who you are if a session cookie is present, but they still allow anonymous access when no session exists. If cookies are present, they can be used to identify the caller, but not to deny public access. In MVP, only selected `static`, `proxy`, and `doc` URLs can be published. Publishing a proxied app exposes that app's HTTP interface publicly, including mutating requests if the app supports them. The blast radius is limited to that single project.

Lower-level details:
- No password, no SSO (for now). Let's just do OTP over email.
- Form to request invite, sends me an email.
- Cookie handling done as in tagaway, also with CSRF tokens.
- When the client starts, it asks for the CSRF token. Three things can happen: the server responds with 'LOCAL' to indicate that we're in local mode; or with the token (cloud, user logged in); or with a 403, user must login.
- New client views: signup (request invite), login. Add logout button if in cloud.
- New endpoints: POST /auth/signup, POST /auth/login, POST /auth/logout, POST /admin/createUser (body: `{email}`; admin-only), GET /admin/signups (list pending signup requests; admin-only), GET & POST /access (complete overwrite of what's public or not in all your projects). GET /public/<user-id>/<project-id>/static|proxy|doc/<rest-of-the-path>. Allow POST /public for proxy. GET of a doc should give the entire markdown page with embeds working (let's make it a static page generated with lith).
- For vibey cloud, we need a database. We have redis already and it's awesome. Let's use it. We'll store:
   - user:<id> (hash)
      - id
      - email
      - createdAt
      - lastActive
      - settings (what we currently store in secret.json)
      - admin (set to 1 only for my user)
   - session:<id> -> <user id> (string)
   - csrf:<id> -> <session id> (string)
   - otp:<user-id>
   - access:<user-id> (hash)
      - <project-id>:<path> -> ALL/<JSON with user ids>
- To generate OTPs, session cookies and CSRF tokens, let's see if there are good node native crypto calls. Let's use what tagaway uses which is nodemailer + SES.
- The user settings are in secret.json (for local) and inside redis for cloud
- Dockers for projects are generated at the level of the host, like it happens on local vibey. There's no vibey inside vibey.
- The dialog state is still held in memory on a single process. A more serious version can later put these states in redis.
- POST /auth/signup stores the request and sends me (admin) a notification email. I approve via an admin view in the client (new tab, only visible to admin users) that lists pending signups (`GET /admin/signups`) with an "Approve" button per entry. Approving calls `POST /admin/createUser` with `{email}`, which creates the user and sends them a welcome OTP email.
- Cookies expire after seven days automatically with SETEX. Set them exactly like tagaway does, so that they are httponly, expires set very well in the future (so the server controls when they expire through setex + 403). CSRF tokens last exactly as much as the session to which they are bound.
- Snapshots should be prepended with the user id. We need to get rid of the silliness of snapshots.json and not be afraid to use fs.scandir or something to that effect.

- POST to trigger an agent! Without a response, to avoid abuse. Just a wake up. It should also be protected.
- Not everyone needs to build an app; many could have better use for agents researching and writing documents and sending API calls.

#### For later

- Choose your own adventure website: local vs cloud
   BYOAI
   open source
   aligned pricing
- Hosted services? (email, DB)

