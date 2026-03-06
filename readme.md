# Vibey (codename)

An agentic interface for those who love text.

Build with ideas, not code.

I'm currently recording myself while building vibey. You can check out [the Youtube channel here](https://www.youtube.com/channel/UCEcfQSep8KzW7H2S0HBNj8g). The channel is from [cell](https://github.com/altocodenl/cell) but Vibey hijacked the channel starting on season 5.

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

## Vibey in a nutshell

1. **Everything is a document**: your description of what you're building. The dialogs with AI while building it. How you orchestrate your agents. Documents are the source of truth for everything. There is no database.
2. **Everything in your browser**: your documents are not only text: use images, audio, and even embed small apps in your documents. No terminal or dedicated native app required.
3. **Safe YOLO**: the agents don't ask for permission, they just run the commands that they deem useful for the task you give them, so they work at full speed. **But** each project is fully isolated in its own container and volume. A rogue agent's blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.

For the students of humanities stranded in the digital age: this is your chance to build a world with your words. Not cryptic commands, without the tens of hours of practice that are required to figure out misplaced semicolons. Describe your world and see it come to life.

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

Left sidebar lists all files with + New and × delete. Right side is a textarea editor. Cmd+S saves. Tracks dirty state, warns on close with unsaved changes. Deleting the currently open file clears the editor immediately. Loading a file that no longer exists silently deselects it.

### Server: uploads

Uploads live under `/workspace/uploads/` inside the project container.

- `GET /project/:project/uploads` — list uploads (newest first). Returns entries with `{name, size, mtime, contentType, url}`.
- `POST /project/:project/upload` — upload a file. Body: `{name, content, contentType?}` where `content` is base64 (data URL allowed). Returns the stored entry.
- `GET /project/:project/upload/:name` — download/stream the upload (Content-Type inferred from filename).

### Client: uploads

Docs sidebar shows an Uploads section at the bottom (always visible when uploads exist). Upload button opens a file picker (multi-select supported), uploads to `/uploads/`. Filenames can include spaces. Clicking an upload shows a preview: images/audio/video render inline; other files show metadata + a link.

### Server: dialogs

- `POST /project/:project/dialog/new` — create a done dialog draft (idle). Body: `{provider, model?, slug?}`.
- `POST /project/:project/dialog` — create a new dialog and run first turn. Body: `{provider, model?, prompt, slug?}`. Response: SSE.
  - Creates a file named `dialog/<YYYYMMDD-HHmmss>-<slug>-<status>.md`.
  - Stable `dialogId` is `<YYYYMMDD-HHmmss>-<slug>` (status is not part of the id).
  - Appends a `## User` message with canonical payload format, opens `## Assistant`, streams `chunk` events.
  - Tool calls execute immediately (YOLO), results are appended to the dialog and streamed back.

- `PUT /project/:project/dialog` — mutate or continue an existing dialog.
  - Canonical body: `{dialogId, status?, prompt?}`.
  - `status` can only be `done`.
  - If `status` is set without `prompt`, it is a pure status change (interrupt/mark done).
  - If `prompt` is present, append as `## User` and continue generation.
  - Whenever generation is kicked off on an existing dialog, server first sets status to `active`.
  - Response is SSE when generation continues; otherwise JSON.
- `GET /project/:project/dialogs` — list dialog files with `{dialogId, status, filename, mtime}` (filenames live under `dialog/`).
- `GET /project/:project/dialog/:id` — load one dialog.

SSE event types: `chunk`, `done`, `error`.

### Dialog markdown: canonical convention

Dialogs are files named:

`dialog/<YYYYMMDD-HHmmss>-<slug>-<status>.md`

Where `<status>` is one of: `active`, `done`.

Canonical section shape (for `User`, `Assistant`, `Tool Request`, `Tool Result`):

```md
## <Role>
> Id: <id>
> Time: <start_iso> - <end_iso>
> Resources: in=<n> out=<n> total=<n> tools=<n> ms=<n>

əəə<type>
<payload>
əəə
```

Rules:
- Markdown remains source of truth.
- All parseable payloads use schwa wrappers.
- `Resources` is always present. If provider usage is unavailable, use zeros.
- For one-shot user input, `start == end`.

Canonical dialog header:

```md
# Dialog
> DialogId: 20260216-201100-read-vibey
> Provider: openai
> Model: gpt-5
> Status: done
> Started: 2026-02-16T20:11:00Z
```

Canonical user input:

```md
## User
> Id: msg_20260216_201100_u1
> Time: 2026-02-16T20:11:00Z - 2026-02-16T20:11:00Z
> Resources: in=0 out=0 total=0 tools=0 ms=0

əəəinput/markdown
Please read readme.md and summarize it.
əəə
```

If UI sends structured input, use JSON instead:

```md
əəəinput/json
{"text":"Please read readme.md and summarize it."}
əəə
```

Canonical assistant output:

```md
## Assistant
> Id: msg_20260216_201101_a1
> Time: 2026-02-16T20:11:01Z - 2026-02-16T20:11:14Z
> Resources: in=123 out=456 total=579 tools=1 ms=12982

əəəoutput/markdown
Summary goes here.
əəə
```

Optional cumulative line (if desired):

```md
> Resources cumulative: in=1200 out=3400 total=4600 tools=14 ms=248392
```

### Server: tools for dialogs

The LLM always receives four tools:

- `run_command` - run a shell command (30s timeout, 1MB max output). Use for reading files (`cat`), listing directories (`ls`), HTTP requests (`curl`), git, and anything else the shell can do.
- `write_file` - create or overwrite a file. Takes `{path, content}`. Bypasses the shell so content with quotes, backticks, template literals, etc. is written cleanly.
- `edit_file` - surgical find-and-replace. Takes `{path, old_string, new_string}`. `old_string` must appear exactly once in the file; if it appears zero times or more than once, the tool returns an error asking for more context. The LLM should read the file first (`cat` via `run_command`) before editing.
- `launch_agent` - spawn another top-level dialog (flat structure, no subagent tree). Takes `{provider, model, prompt, slug?}` and is equivalent to `POST /project/:project/dialog`.

Tool definitions are written once and converted to both Claude and OpenAI formats.

**No server-side state.** All tool-call state lives in dialog markdown. The server reconstructs tool history by parsing markdown each request.

#### Tool request/result canonical blocks

Tool calls execute immediately (YOLO). The server records both the request and the result in markdown.

Tool request:

```md
## Tool Request
> Id: toolu_abc123
> Parent: msg_20260216_201101_a1
> Time: 2026-02-16T20:11:02Z - 2026-02-16T20:11:02Z
> Resources: in=0 out=0 total=0 tools=0 ms=0
> Tool: run_command
> Status: requested

əəətool/input/json
{"command":"ls"}
əəə
```

Tool result:

```md
## Tool Result
> Id: toolu_abc123
> Parent: msg_20260216_201101_a1
> Time: 2026-02-16T20:11:03Z - 2026-02-16T20:11:04Z
> Resources: in=0 out=0 total=0 tools=1 ms=812
> Tool: run_command
> Status: executed

əəətool/result/json
{"success":true,"stdout":"file1.txt"}
əəə
```

Status values: `requested | executed | error`.

#### Tool-call flow

1. LLM emits tool calls. Server writes `Tool Request` sections.
2. Server executes each tool immediately.
3. Results are written as `Tool Result` sections and fed back to the LLM.
4. Stream continues; there are no tool approvals or pause states for tool calls.

No separate tool-execution endpoint is needed in normal flow.

#### Parsing dialog for provider messages

`parseDialog` reconstructs API history from markdown:
- `## User` / `## Assistant` sections become text messages.
- `## Tool Request` sections become assistant `tool_use`/`tool_calls` entries.
- `## Tool Result` sections become `tool_result`/`tool` messages.

Markdown is the source of truth. Restart-safe by design.

### Client: dialogs

Left sidebar lists dialog files (those under `dialog/`). Right side is a chat view: messages parsed from the file, rendered as bubbles.

Input area: provider select (Claude/OpenAI), textarea (Cmd+Enter to send), Send button. During streaming, partial response shown with block cursor. Input is disabled while streaming.

User messages are rendered optimistically (shown immediately when sent).

Message resources/tokens are shown from each section's `> Resources:` metadata line.

### Client: tools for dialogs

All tool calls execute immediately (YOLO) — there is no approval/denial UI. Tool requests and results are displayed inline in the chat view as they happen.

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

Embed blocks use schwa wrappers, consistent with the rest of the dialog/doc conventions. Use the schwa character `ə` (U+0259) — avoid look‑alikes like Arabic `ە` (U+06D5).

```md
əəəembed
port 4000
height 500
title Tictactoe
əəə
```

Static embed (no backend):

```md
əəəembed
port static
path /
height 500
title Static app
əəə
```

Fields:

| Field    | Default  | Meaning                                                              |
|----------|----------|----------------------------------------------------------------------|
| `port`   | `static` | Port number **or** the string `static` for the static proxy          |
| `path`   | `/`      | Initial path to load (used for both proxy and static)                |
| `height` | `400`    | Iframe height in px                                                  |
| `title`  | `App`    | Shown in a small header bar above the embed                          |

One embed = one port + path. Multiple embeds are multiple blocks.

Parsing rules: ignore blank lines, ignore lines starting with `#`, each line is `key value`.

Example inside a doc:

```md
# Tictactoe Project

Here's the running game:

əəəembed
port 4000
title Tictactoe
height 500
əəə

Here's a static app:

əəəembed
port static
path /
title Static app
height 500
əəə

## Architecture
...
```

### Client: embed rendering

When rendering markdown (doc preview or dialog view), the client detects `əəəembed ... əəə` blocks and replaces them with an iframe:

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

#### Not in scope (yet)

- **WebSocket proxying**: can add `Upgrade` handling later.
- **Hot reload**: iframe is static; user refreshes or a reload button is added to the embed chrome.
- **Absolute path rewriting**: deferred; agents can be told to use relative paths.

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
│  - NO volume mounts to project data      │
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

### Embed proxy (updated for isolation)

The proxy route `ALL /project/:project/proxy/:port/*` resolves the project container's IP on `vibey-net` and proxies to `http://<container-ip>:<port>/<path>`. No host port exposure needed for project containers.

The static route `GET /project/:project/static/*` reads the file from the project container via `docker cp` or `docker exec cat` and serves it to the browser.

Agent prompt says: *"Your working directory is /workspace. If you run a server, listen on port 4000. Embeds use `port 4000`."* The agent never knows or cares about host ports or container IPs.

### Tool execution (updated for isolation)

- `run_command`: already runs via `docker exec` in the project container. No change needed.
- `write_file`: goes through `projectFS.writeFile` (pipes content into the container).
- `edit_file`: `projectFS.readFile` → find/replace in vibey's memory → `projectFS.writeFile`.
- `launch_agent`: spawns a new dialog in the same project container (same container, new dialog file).

### Vi mode

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

## Test suites

**Project:**

1. `GET /projects` — verify it returns an array (may be empty or contain pre-existing projects).
   - Client: Projects tab loads and renders a list (may be empty).
2. `POST /projects` body `{name: "test-proj"}` — verify response has `{ok: true, slug, name}` and slug matches expected value.
   - Client: Create project via prompt; navigates to Docs and sets `currentProject`.
3. `GET /projects` — verify the new project appears with matching slug and display name.
   - Client: Projects list shows the new project entry with the display name.
4. `POST /projects` same name again — verify it succeeds idempotently (no error, same slug returned).
   - Client: n/a (server-only idempotency behavior).
5. `DELETE /projects/:slug` — verify response is `{ok: true}`.
   - Client: Deleting via UI confirms and clears `currentProject`, navigates to `#/projects`.
6. `GET /projects` — verify the project no longer appears.
   - Client: Projects list no longer shows the deleted project.
7. `GET /project/:slug/files` — **404**. `GET /project/:slug/dialogs` — **404**.
   - Client: Navigating to a deleted project returns to Projects (no file/dialog view).
8. `DELETE /projects/nonexistent` — **404**.
   - Client: n/a (server-only error case).
9. `POST /projects` with empty name `""` — **400**.
   - Client: UI ignores empty prompt (no request sent).
10. `POST /projects` with whitespace-only name `"   "` — **400**.
   - Client: UI ignores whitespace-only prompt (no request sent).
11. For each of the following names, verify create → list (display name round-trips) → file write/read via slug → delete → gone from list:
    - `My Cool Project` (spaces; slug has no spaces, base64url-encoded between dots).
    - `🚀 Rocket App` (emoji).
    - `café étude` (accented/unicode).
    - `hello—world & friends!` (mixed special characters).
    - `日本語プロジェクト` (non-Latin only).
   - Client: ensure the names look like we expect them even with special characters.

**Doc:**

1. `POST /projects` — create project.
   - Client: Create project via prompt and land on Docs tab.
2. `POST /project/:p/file/doc/main.md` — write initial content.
   - Client: Create `main.md` via + New file prompt (stored as `doc/main.md`).
3. `GET /project/:p/file/doc/main.md` — read back, verify exact round-trip.
   - Client: Reload `main.md` and verify editor content matches.
4. `GET /project/:p/files` — list includes `doc/main.md`.
   - Client: Sidebar lists `main.md`.
5. `POST /project/:p/file/doc/main.md` — overwrite with updated content.
   - Client: Edit content, verify dirty state, then save.
6. `GET /project/:p/file/doc/main.md` — verify updated content.
   - Client: Reload file and verify saved changes persisted.
7. `POST /project/:p/file/doc/notes.md` — write a second doc.
   - Client: Create `doc/notes.md` via prompt and open it.
8. `GET /project/:p/files` — list includes both docs.
   - Client: Sidebar lists both `main.md` and `notes.md`.
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
   - Client: n/a (server-only validation).
15. `POST /project/:p/file/bad.txt` — **400** (outside managed folders).
   - Client: n/a (server-only validation).
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

**Upload:**

1. `POST /projects` — create a project.
   - Client: Create project via prompt and land on Docs tab.
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
2. `POST /project/:project/file/doc/main.md` — write snapshot content.
3. `POST /project/:project/file/doc/notes.md` — write extra file.
4. `POST /project/:project/snapshot` with label `"before refactor"` — verify entry has `id`, `project`, `label`, `.tar.gz` filename, `created`, and `fileCount >= 2`.
5. `GET /snapshots` — list includes the labeled snapshot with correct label.
6. `POST /project/:project/snapshot` (no label) — create second snapshot.
7. `GET /snapshots` — list contains both snapshots and is ordered newest-first.
8. `GET /snapshots/placeholder/download` — **404** with error payload.
9. `GET /snapshots/:id/download` (first snapshot) — returns non-empty tar.gz content.
10. `POST /snapshots/:id/restore` with name `"Restored Flow7 Test"` — returns `{slug, name, snapshotId}`.
11. `GET /projects` — restored project appears in list.
12. `GET /project/:restored/files` — includes `doc/main.md` and `doc/notes.md`.
13. `GET /project/:restored/file/doc/main.md` — content matches original.
14. `GET /project/:restored/file/doc/notes.md` — content matches original.
15. `POST /project/:project/file/doc/main.md` — modify original project after snapshot.
16. `GET /project/:restored/file/doc/main.md` — still matches original (restore isolation).
17. `DELETE /snapshots/:id2` — delete second snapshot.
18. `GET /snapshots` — second snapshot gone, first still present.
19. `DELETE /projects/:project` — delete original project.
20. `GET /snapshots` — first snapshot still listed (snapshot storage independent).
21. `DELETE /snapshots/nonexistent-id-12345` — **400** with error payload.
22. `GET /snapshots/nonexistent-id-12345/download` — **404** with error payload.
23. `DELETE /projects/:restored` — delete restored project.
24. `DELETE /snapshots/:id` — delete first snapshot.
25. `GET /snapshots` — no leftover entries for this flow.

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

**Dialog:**

1. `GET /` — confirm HTML shell loads `client.js`.
2. `POST /projects` — create project.
3. `POST /project/:p/dialog/new` (openai, gpt-5.2-codex, slug `flow1-read-vibey`) — response has `dialogId`, `filename`, `provider`, `model`, `status: done`, filename ends `-done.md`.
4. `GET /project/:p/dialogs` — draft is listed, status `done`.
5. `POST /project/:p/tool/execute` (write_file `test-sample.txt`) — seed a file.
6. `PUT /project/:p/dialog` (prompt: "read test-sample.txt with run_command") — SSE finishes with `done` event, includes `context` event with valid `percent/used/limit`.
7. `GET /project/:p/dialog/:id` — markdown has `> Time:`, `> Context:`, `run_command` tool request + result.
8. `PUT /project/:p/dialog` (same dialogId, prompt: "create dummy.js with write_file") — SSE finishes with `done`.
9. `GET /project/:p/dialog/:id` — markdown has `write_file` tool request + result.
10. `POST /project/:p/tool/execute` (run_command `cat dummy.js`) — stdout contains `console.log`.
11. `POST /project/:p/tool/execute` (run_command `sed -i '/^> Provider:/d' dialog/<dialogId>-done.md`) — remove provider header line.
12. `PUT /project/:p/dialog` (same dialogId, prompt: "try without provider", no provider field) — SSE returns `error` event.
13. `GET /project/:p/dialogs` — dialog still `done`, filename `-done.md`.
14. `POST /project/:p/dialog/new` (slug `agent-a`) — save dialogId. Status `done`, filename `-done.md`.
15. `POST /project/:p/dialog/new` (slug `agent-b`) — save dialogId. Status `done`, filename `-done.md`.
16. Fire agent-a with slow prompt (fire-and-forget, `sleep 12` + 200 word essay). Fire agent-b with slow prompt. Wait ~2s.
17. Poll `GET /project/:p/dialogs` until agent-a is `active` with filename `-active.md`. Record observed.
18. `PUT /project/:p/dialog` (agent-a dialogId + new prompt) — **409** rejected.
19. `PUT /project/:p/dialog` (agent-a dialogId, `status: "done"`) — **200**, stopped.
20. Poll `GET /project/:p/dialogs` — agent-a is `done`, filename `-done.md`. Confirm active was observed before done.
21. `DELETE /projects/:p` — delete while agent-b still active. 200.
22. `GET /projects` — project gone.
23. `GET /project/:p/dialogs` — **404**.
24. `GET /project/:p/files` — **404**.
25. `POST /projects` (same name) — fresh project.
26. `GET /project/:p/dialogs` — empty array.
27. `GET /project/:p/files` — only `doc/main.md`.
28. `DELETE /projects/:p` — cleanup.
29. `GET /projects` — confirm gone.

**Static app:**

1. `POST /projects` — create project.
2. `POST /project/:project/file/doc/main.md` — write constraints for a static-only React tictactoe (no backend process).
3. `POST /project/:project/dialog/new` — create orchestrator draft.
4. Fire `"please start"` (non-blocking).
5. Poll `GET /project/:project/static/` until HTML includes React, `app.js`, and `tictactoe` markers.
6. `POST /project/:project/tool/execute` (`run_command: cat index.html`) — verify React and `app.js` references.
7. `GET /project/:project/static/app.js` — verify board/cell/square/grid logic exists.
8. Poll `GET /project/:project/file/doc/main.md` until an `əəəembed` block appears with `port static`.
9. `GET /project/:project/file/doc/main.md` — verify embed block contains `port static`.

This project is intentionally kept alive so the embedded game remains available.

**App with backend:**

1. `POST /projects` — create project.
2. `POST /project/:project/file/doc/main.md` — write backend tictactoe constraints (Express on port 4000).
3. `POST /project/:project/dialog/new` — create orchestrator draft.
4. Fire `"please start"` (non-blocking).
5. Poll `GET /project/:project/proxy/4000/` until HTML includes React, `app.js`, and `tictactoe` markers.
6. `GET /project/:project/proxy/4000/` — verify index HTML includes React + `app.js`.
7. `GET /project/:project/proxy/4000/app.js` — verify board/cell/square/grid logic exists.
8. `POST /project/:project/tool/execute` (`run_command: ps aux | grep node || true`) — verify `server.js` process is running.
9. Poll `GET /project/:project/file/doc/main.md` until `əəəembed` block appears with `port 4000`.
10. `GET /project/:project/file/doc/main.md` — verify embed block includes `port 4000`.

Keep this project running intentionally so the embedded backend app stays playable.

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
- Cleanup: reset vi mode false, clear API key, delete project.

## TODO

Intro prompt: Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

- Finish refactoring backend tests. Then frontend tests. Make sure everything except for vi passes.
- Please fix vi mode. Take your time to test that the existing functionality really works. Extend the tests in test-client to avoid regressions. You can build and rebuild vibey as you need to.


## Vibey cloud in a nutshell

*WARNING: vaporware, will only build if Vibey itself makes sense*

1. **Automatic infra**: accessible anywhere with a browser; put projects (containers) onto servers, proxy traffic from/to your apps, HTTPS (bring your DNS record), receive emails, vibey session cookies.
2. **Aligned pricing**: An annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.
3. **Zero lock-in**: the whole thing being open source, so you can always run the same thing yourself elsewhere, also in the cloud.

All you need is an AI provider, no need to install anything.

## TODO vibey cloud

- Make a document public
- For hosted vibey on Ubuntu, Docker-in-Docker or sibling containers via the Docker socket. Same architecture — each project is a container with a volume, vibey proxies to container IPs. The transition from local to hosted is: add DNS, TLS, and session cookies. The container topology stays the same.
