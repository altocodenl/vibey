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

1. **Everything is a document**: your description of what you're building. The dialogs with AI while building it. Views of your app or images are embedded. A document as the gateway to everything. There is no database.
2. **Everything in your browser**: allows to see not just text, but images, audio, and even embed small apps in your documents. No terminal or dedicated native app required.
3. **Safe(r) YOLO**: the agents don't ask for permission, they just run the commands that they deem useful for the task you give them, so they work at full speed. **But** each project is fully isolated in its own container and volume. A rogue agent's blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.
4. **Orchestration as prose**: there's no agent graph, no task queue, no state machine. You write a small doc describing what you want (including how many agents to use), start one dialog, and that agent reads the doc and decides what to do, including spawning other sibling agents. The "agentic mesh" is just text instructions that you can edit. Agents can read each other's dialogs to coordinate.
5. **Run locally and bring your own inference**: connect with your openai or claude subscription or API key.

For the students of humanities stranded in the digital age: this is your chance to build a world with your words. Not cryptic commands, without the tens of hours of practice that are required to figure out misplaced semicolons. Describe your world and see it come to life.

## Vibey cloud in a nutshell

*WARNING: vaporware, will only build if Vibey itself makes sense*

1. **Automatic infra**: accessible anywhere with a browser; put projects (containers) onto servers, proxy traffic from/to your apps, HTTPS (bring your DNS record), receive emails, vibey session cookies.
2. **Aligned pricing**: An annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.
3. **Zero lock-in**: the whole thing being open source, so you can always run the same thing yourself elsewhere, also in the cloud.

All you need is an AI provider, no need to install anything.

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

Rather than hardcoding or customizing an agentic mesh, just describe it.

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
   - Docs: lush markdown editing
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

- `GET /projects` - list project names. Includes projects backed by containers and volume-only projects (for example after rebuilds).
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

## Dockerization [TO IMPLEMENT]

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
| Vibey shutdown | Stop all project containers (`docker stop` with label `vibey=project`) |
| Vibey startup | Clean up orphaned project containers from previous runs; restart containers for existing projects on demand |

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

## Test flows

Flow #1 — Dialog + tool-use happy path

- Open Vibey (`GET /`) and confirm the HTML shell loads `client.js`.
- Create a project with `POST /projects`.
- Start by creating a **done (idle)** dialog draft with `POST /project/:project/dialog/new` (provider `openai`, model `gpt-5`, custom slug).
- Check `GET /project/:project/dialogs`: the new dialog is present and status is `done`.
- Seed an input file for the agent (`test-sample.txt`) using `POST /project/:project/tool/execute` with `write_file`.
- Continue that dialog via `PUT /project/:project/dialog` with a prompt that explicitly asks for `run_command`.
  - Response should stream as SSE and finish with a `done` event.
  - `GET /project/:project/dialog/:id` should show canonical evidence in markdown: `> Time:`, a `run_command` tool request, and a tool result block.
- Send a second continuation prompt (same endpoint) asking for `write_file` to create `dummy.js`.
  - Again, SSE finishes with `done`.
  - Dialog markdown shows `write_file` + corresponding result.
- Validate output by calling `POST /project/:project/tool/execute` with `run_command: cat dummy.js`; file should contain `console.log`.
- Cleanup: `DELETE /projects/:name`, then verify project is gone from `GET /projects`.

Flow #2 — Docs CRUD + filename guards

- Create a project.
- Save `doc/main.md` using `POST /project/:project/file/doc/main.md`, then read it back with `GET /project/:project/file/doc/main.md` and verify exact content round-trip.
- Confirm file discovery with `GET /project/:project/files` (must include `doc/main.md`).
- Overwrite `doc/main.md` through the same write endpoint, read again, and verify updated content is persisted.
- Create a second doc (`doc/notes.md`), verify both files are listed, then delete `doc/notes.md` via `DELETE /project/:project/file/doc/notes.md`.
- Re-list files to confirm `doc/notes.md` is removed while `doc/main.md` remains unchanged.
- Validate filename/path guardrails:
  - Reading deleted file returns `404`.
  - Invalid managed name like `bad..name.md` returns `400`.
  - Writing outside managed folders (for example `bad.txt`) returns `400`.
- Cleanup: delete the project and verify it no longer appears in `GET /projects`.

Flow #3 — Deleting a project aborts active agents

- Create a project and seed `doc/main.md` so it behaves like a real workspace.
- Create two done dialog drafts (`agent-a`, `agent-b`) with `POST /project/:project/dialog/new`.
- Trigger both dialogs with long prompts (non-blocking `PUT /project/:project/dialog`) and poll `GET /project/:project/dialogs` until both are `active`.
- While they are still running, delete the project with `DELETE /projects/:name`.
- Verify hard-stop semantics:
  - Project is absent from `GET /projects`.
  - Project endpoints return `404` (`GET /project/:project/dialogs`, `GET /project/:project/files`, `GET /project/:project/dialog/:id`).
- Re-create a project with the same slug to prove full cleanup happened.
  - New project has no old dialogs.
  - File list contains only default `doc/main.md`.
- Final cleanup: delete the re-created project.

Flow #4 — Static tictactoe via `/static`

- Create a project and write `doc/main.md` with explicit constraints for a static-only gotoB tictactoe (no backend process).
- Create an orchestrator dialog (`POST /project/:project/dialog/new`) and trigger it with `"please start"` (`PUT /project/:project/dialog`).
- Poll until the static app is reachable at `GET /project/:project/static/` and the HTML includes expected markers (`gotob`, `app.js`, `tictactoe`).
- Validate generated artifacts with tool execution:
  - `index.html` references gotoB and `app.js`.
  - `app.js` includes gotoB usage (`B.`) plus board/cell/grid game logic.
- Send a second orchestrator prompt asking it to append an embed section in `doc/main.md`.
- Poll `GET /project/:project/file/doc/main.md` until an `əəəembed` block appears with `port static`.
- Final assertion: `doc/main.md` contains the playable embed configuration.
- This project is intentionally kept alive so the embedded game remains available.

Flow #5 — Backend tictactoe via proxy on port 4000

- Create a project and write `doc/main.md` requiring a backend version of the game: Express server on port `4000`, gotoB frontend assets, and background boot via `node server.js &`.
- Create an orchestrator dialog and kick it off with `"please start"`.
- Poll `GET /project/:project/proxy/4000/` until the app is live and HTML includes `gotob`, `app.js`, and `tictactoe`.
- Verify routed assets via proxy endpoints:
  - `GET /project/:project/proxy/4000/` serves index HTML.
  - `GET /project/:project/proxy/4000/app.js` serves JS containing `B.` and board/cell/grid logic.
- Verify the backend process truly runs inside the project container by executing `ps aux | grep node` through `POST /project/:project/tool/execute`; output should include `server.js`.
- Ask the agent to append an embed block to `doc/main.md` using `port 4000`.
- Poll doc content until `əəəembed` + `port 4000` appear.
- Keep project running intentionally so the embedded backend app stays playable.

Flow #6 — Vi mode settings + persistence

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

Flow #7 — Snapshots lifecycle (create/list/download/restore/delete)

- Create a project and write at least two files (`doc/main.md`, `doc/notes.md`) so snapshot contents are meaningful.
- Create snapshot with label using `POST /project/:project/snapshot`.
  - Returned entry should include `id`, `project`, `created`, `.tar.gz` filename, label, and `fileCount >= 2`.
- Confirm discoverability with `GET /snapshots`.
- Create a second snapshot without label; verify list contains both snapshots and is ordered newest-first.
- Download one snapshot via `GET /snapshots/:id/download` and verify non-empty tar.gz content is returned.
- Restore snapshot into a new project with `POST /snapshots/:id/restore` (optionally passing a name).
  - Verify restored project appears in `GET /projects`.
  - Verify restored files and file contents match original snapshot state exactly.
- Mutate the original project afterward and verify restored project stays unchanged (restore isolation).
- Delete the second snapshot and confirm only that entry disappears from `GET /snapshots`.
- Delete original project and confirm snapshot entries still exist (snapshot storage is independent of project lifecycle).
- Error paths:
  - `DELETE /snapshots/nonexistent` returns `400` with error payload.
  - `GET /snapshots/nonexistent/download` returns `404` with error payload.
- Cleanup: delete restored project, delete remaining snapshot, and confirm no leftovers for this flow.

Flow #8 — Uploads (create/list/preview)

- Create a project and open its Docs tab.
- Upload an image via `POST /project/:project/upload` with `{name, content, contentType}` (base64 or data URL).
  - Verify response includes `name`, `size`, `mtime`, `contentType`, and `url`.
- Call `GET /project/:project/uploads` and verify the uploaded entry is listed with matching metadata.
- Fetch the upload via `GET /project/:project/upload/:name` and verify the file bytes and `Content-Type`.
- Upload a non-media file (for example `notes.txt`) and verify the list contains both entries.
- In the client, confirm the uploads section appears in the Docs sidebar, clicking the image shows a preview, and clicking the text file shows metadata + link.
- Cleanup: delete the project.

## TODO

Intro prompt: Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

- Please fix vi mode. Take your time to test that the existing functionality really works. Extend the tests in test-client to avoid regressions. You can build and rebuild vibey as you need to.
- Compaction: show the percentage of the window, with yellow after 50% and red after 80%. Allow to compact through a call, opens a new dialog (so there's no magic).
- Keep all diffs: rather than snapshotting, make all edits and rms go through tool calls, and we deterministically store diffs in a folder in the container/volume. Then, we have a "git like" list of diffs, minus commits. You basically have the history of all that happened in the FS.
- A fifth tool that is that the server stops agents after a certain size of the token window, after a message is responded. The server auto-calls that tool. I want this to be specified in main.md or one of the files referenced in it. Or an agent can call it?

## TODO vibey cloud

- Make a document public
- For hosted vibey on Ubuntu, Docker-in-Docker or sibling containers via the Docker socket. Same architecture — each project is a container with a volume, vibey proxies to container IPs. The transition from local to hosted is: add DNS, TLS, and session cookies. The container topology stays the same.
