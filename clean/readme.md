# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

You already have AI. All you need now is files and a server.

## Why vibey?

So that you come alive when you work with computers.

So that your digital workspace feels as comfortable as an old shoe.

So that your digital memory is portable and reliable, now and in five years.

So that you are able to learn and build at the speed of thought.

So that you love your digital workspace and can't wait to get back to it when you're away.

So that you can finally build, plan or learn what you have been dreaming of for a while now.

So that what you do with a computer can make the world a more meaningful place.

## What is vibey?

A single workspace where you can have files, interact with AI and humans, and run your own apps.

Available in [cloud version](https://buildwithvibey.com) and local/self-hosted version.

## How vibey does it?

0. Bring your own AI credentials. Vibey works with openai & anthropic (more to come on request).
1. Auth: a simple identity layer where you log in through login links that you get in your inbox.
2. Project: a docker container that has your files, chats and apps.
3. Engine: a virtual server on top of which you run your projects.
4. File: upload, search and see files of all kinds. Edit text files.
5. Chat: talk to AI, interact with humans and send commands to your project, all in the same place. AI makes tool calls also in the chat.
6. App: create and host apps that run in your project.
7. Publish: provide public access to files (text or media) and apps. Point a domain to a project.

## Running vibey yourself

```
docker compose up --build
```

To run in cloud mode, set this line in `config.4tx`:

```
cloud 1
```

To run sending emails, set this line in `config.4tx`:

```
email enable 1
```

And set these three lines (with proper values) in `secret.4tx`:


```
email ses accessKeyId ...
          region ...
          secretAccessKey ...
```

If you're meddling with the Dockerfiles and you need to bust the cache:

```
docker compose build --no-cache && docker compose up
```

## Dataspace

### secret.4tx

```
backup bucket accessKeyId <accessKey>
              bucketName <bucketName>
              host <host>
              region <region>
              secretAccessKey <secretKey>
email ses accessKeyId <accessKey>
          region <region>
          secretAccessKey <secretKey>
```

### config.4tx

```
admin <adminEmail>
baseURL <url>
backup enable <0|1>
cloud <0|1>
cookie expires <expiration in seconds>
       name <cookieName>
email enable <0|1>
      from address <email>
           name <name>
port <portNumber>
redis db <number>
```

### Redis

```
accessBy:<projectId> 1 <verb>:<userId|email|PUBLIC>[:<prefix>] // set of recipients; verb is read or write (only read for PUBLIC)
                     2 <verb>:<userId|email>[:<prefix>]
                     ...
accessTo:<userId|email|PUBLIC> 1 <verb>:<projectId>[:<prefix>] // set of shared projects; prefix is optional
                        2 <verb>:<projectId>[:<prefix>]
                        ...
credentials:<userId> data <JSON> // {provider: {account: {access, expires, refresh, ...}, apiKey: "<key>"}}
email:<email> <userId>
lock:edit:<projectId>:<path> <integer> // per-file edit lock, expires 10s
loginLink:<link> <email>
loginLinkR:<email> <loginLink> // reverse login link
owner:<userId> 1 session:<sessionId>
               2 project:<projectId>
               ...
pkce:<userId>:<provider> <JSON> // {verifier: "<PKCE verifier>"}, expires after 900 seconds
project:<projectId> created <date>
                    id <id>
                    last <date>
                    name <name>
                    owner <userId>
                    slot <integer|undefined>
rateLimit:<identifier> <number>
session:<session> csrf <csrfToken>
                  expires <date>
                  last date <date>
                       ip <ip>
                  user <userId>
user:<id> count <integer>
          created <date>
          creator <1|undefined>
          email <email>
          id <id>
          last <date>
          settings <JSON> // {vi: true|false|undefined}; absent means {}
          username <username|undefined>
userCount <integer>
username:<username> <userId> // reverse username lookup; shares the user's expiry until verified, and can outlive a rename (user:<id> username is authoritative)
```

### Access

Set grants in `/project/vibey/access.md`, then run `vibey access` to sync them:

```
alice@example.com read
bob@example.com write chat/
PUBLIC read docs/
```

Each line is `<email|PUBLIC> <read|write> [prefix]`. Blank lines, lines starting with `#` and project grants (lines starting with `project:`, see below) are ignored by the sync. Emails are lowercased. Omitting the prefix grants whole-project access; otherwise, paths are matched by literal prefix. `write` includes `read`. Owners retain full access.

`PUBLIC` grants read access to everyone, including requests without a session, and only supports `read`. Projects with a `PUBLIC` grant, whatever its prefix, are listed for everyone. Requests without a session can't list or read `vibey/access.md`.

Prefixes and requested paths must be relative, without backslashes, control characters, doubled slashes or `.`/`..` segments. Symlinks are followed, not confined to the grant's prefix.

Tool calls can target another project: `tool-call: read <projectId>` (also write, edit and run). The target's `vibey/access.md` must grant `project:<originId> <read|write> [prefix]`. These process grants are checked on every call. Run requires whole-project write access. Omitting the ID targets the current project.

Syncing replaces the project's grants, removing entries no longer present. Invalid entries abort the sync. Grants for unverified recipients remain keyed by email until login verification transfers them to the user ID.

### API

#### Public

- **Static**: `GET /`.
- **Post error**: `POST /error`: accepts any body.
- **Project reads**: **Get projects**, **Resolve project by name**, **Get project**, **List files**, **Get file** and **Read message** don't require a session; requests without one are checked against `PUBLIC` grants. Like the other public routes, they skip the CSRF check.

#### Auth

Except for `GET /auth/user` and `PUT /auth/user`, all other auth routes will return a 404 in local mode.

- **Get user**: `GET /auth/user`: returns `{admin: true|undefined, count: <integer>, creator: <boolean>, credentials: <object>, csrf: <token>, email: <email>, id: <user id>, mode: 'cloud', settings: <object>, username: <username|undefined>}` in cloud mode and `{creator: true, credentials: <object>, mode: 'local', settings: <object>, username: <username|undefined>}` in local mode. `creator` is always `true` for the admin user. `credentials` lists stored providers and credential types as presence flags (for example, `anthropic.account: true`), never credential values or tokens. `settings` defaults to `{}` and can only contain `vi`, a boolean.
- **Update user**: `PUT /auth/user`: accepts `{settings: <object>|undefined, username: <string>|undefined}`, at least one of them. `settings` is `{vi: true|false}` or `{}` and replaces the settings object; omitting `vi` clears the preference (undefined), since JSON cannot represent an explicit `undefined`. `username` is lowercased and NFC-normalized, with a minimum length of 3 UTF-16 units. Allows Unicode letters, combining marks, numbers and single internal dashes; must start with a letter or number, cannot have a combining mark after a dash, and cannot be a UUID. Whitespace and mixing ASCII letters with non-ASCII characters are rejected; ASCII numbers and dashes can accompany non-ASCII names. Setting a new username releases the previous one. Returns `{settings, username}` with whichever was sent, using the normalized username. Rejects missing fields, unknown keys, invalid types and invalid usernames with 400, and a username owned by another user with 409; on any rejection nothing is changed. Available in local mode; cloud mode requires a valid session and CSRF token. This endpoint stores the settings only; it does not change editor bindings.
- **Login**: `POST /auth/login`: expects `{email: <email>}`. Returns 403 if rate limited. Creates a user for that email if it doesn't exist yet, with a username generated from the email: the local part (`hello@example.com` → `hello`), then local part plus domain without its TLD (`hello-example`), then that with `-1`, `-2`… until one is free. Candidates are lowercased, characters other than ASCII letters and digits become single dashes, and leading/trailing dashes are removed. Empty candidates become `user`; short candidates are padded with trailing ones to 3 characters (`a` → `a11`, `ab` → `ab1`). UUID candidates get `-1` appended. Sends a login link by email.
- **Verify login link**: `GET /auth/verify/<loginLink>`: Returns 403 if link not found. Returns the same than what `GET /auth/user` does, and sets a session cookie.
- **List sessions**: `GET /auth/list`: returns a list of sessions with `{expired: <boolean>, last: {date: <date>, ip: <ip>}}`.
- **Logout**: `POST /auth/logout`: deletes the current session and clears the cookie.
- **Delete account**: `POST /auth/delete`: deletes the user and all their resources (sessions, projects). Clears the cookie.

#### Project

File reads and message reads require read access to their path, which `PUBLIC` grants give to every caller. File writes, edits and messages require write access to their path. Shell commands and messages addressed to shell or AI additionally require whole-project write access. Denied access returns 404, except deletion of an accessible project by a non-owner returns 403.

- **Request creator access**: `POST /creator/request`: expects `{}`. Returns 409 if the user is already a creator. In local mode, this route returns a 404.
- **Get projects**: `GET /projects`: returns owned projects and projects shared with the user, including prefix-scoped grants, plus every project with a `PUBLIC` grant. Projects listed only through `PUBLIC` have `public: true`. Projects have `read: true` when the caller is anonymous or has no write access, including prefix-scoped or `PUBLIC` grants. Each project appears once. `slot` is only returned for projects the caller owns. Each project includes its owner's username as `ownerUsername`. Without a session, returns only the projects with a `PUBLIC` grant.
- **Create project**: `POST /project`: expects `{name: <name>, slot: <1–5|undefined>}`. Names must contain 2–500 UTF-16 units, and must stay encodable in `/p/` URLs (see **Resolve project by name**): a name can't be a UUID (in any case), contain `/` or `?`, have two spaces in a row, or have a space next to a dash; these return 400. Returns 403 if the user is not a creator, 409 if an owned or shared project already has that name, comparing lowercased names. Stored names retain their case. Assigning an occupied slot removes that slot only from a project owned by the caller.
- **Rename project**: `PUT /project`: expects `{id: <id>, name: <name>, slot: <1–5|undefined>}`. Names must contain 2–500 UTF-16 units, and must stay encodable in `/p/` URLs (see **Resolve project by name**): a name can't be a UUID (in any case), contain `/` or `?`, have two spaces in a row, or have a space next to a dash; these return 400. Existing projects keep a name that breaks these rules until renamed. Returns 404 if the project is missing or not owned by the caller, 409 if another owned or shared project has the new name, comparing lowercased names. Stored names retain their case; case-only renames are allowed. Assigning an occupied slot removes that slot only from another project owned by the caller.
- **Remove project**: `DELETE /project/<projectId>`: requires ownership. Returns 404 if the project is missing or inaccessible, 403 if it is shared with the caller but not owned by them.
- **Get project**: `GET /project/<projectId>`: returns `{id: <projectId>}` if the caller owns the project or has any read or write grant on it, whatever its path prefix. Returns 404 if the project is missing or inaccessible.
- **Resolve project by name**: `GET /p/<username or userId>/<projectName or projectId>[/<path>]`: finds the project among those owned by that user, then rewrites the URL to `/project/<projectId>` or `/project/<projectId>/file/<path>` and passes the request on (`rs.next`), so access is checked by those routes and the response is theirs. A UUID in either slot is taken as an id; otherwise the user slot is a username and the project slot an encoded name: each space is written as `-` and each dash as `--` (so `x-y z` is `x--y-z`), and anything else is percent-encoded. Resolution ignores access: a missing user or project returns 404 here, an inaccessible one returns 404 from the route it's passed to, so both look the same. A 404 for a file, here (with a path) or from **Get file**, returns the not-found page as HTML: a question mark drawn with spinnies and a `Take me to safety` link to the projects.
- **List files**: `GET /project/<projectId>/files`: returns `[{name: <relativePath>, size: <bytes>, mtime: <milliseconds since Unix epoch>}]`, sorted by name. Excludes `.git` contents and invalid paths; includes only files covered by the user's read or write grants (including `PUBLIC` ones), or all valid files for the owner. Without a session, excludes `vibey/access.md`. Returns 404 if the project is missing or inaccessible, and 500 if listing fails.
- **Get file**: `GET /project/<projectId>/file/<path>`: serves a file from `/project` through `docker.read`, with its MIME type or `application/octet-stream`. Returns 404 if access is denied or the file is missing, 400 for invalid paths, and 500 for other read errors. Symlinks are followed. Uses `cicek.cache` for ETags and 304 responses, with `Cache-Control: private, no-cache`. Sends `nosniff` and a sandbox CSP for safe previews.
- **Write file**: `POST /project/write`: expects `{id: <projectId>, path: <path>, content: <string>}` or multipart fields `id`, `path` and a single file in the `file` field. Writes content to the file. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Edit file**: `POST /project/edit`: expects `{id: <projectId>, path: <path>, oldText: <string>, newText: <string>}`. Replaces `oldText` with `newText` in the file. `oldText` must match exactly once, except for the reserved value `'[EOF]'`, which appends `newText` to the end of the file. Returns 400 if `oldText` is absent, matches multiple times, or the edit otherwise fails. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Run command**: `POST /project/run`: expects `{id: <projectId>, command: <string>, read: <boolean|undefined>}`. Runs the command inside the project's container. Requires whole-project write access even when `read` is true. The `read` flag only prevents updating the project's `last` timestamp. The special command `vibey access` syncs sharing grants.
- **Send message**: `POST /project/message`: expects `{id: <projectId>, file: <fileName>, base64: <boolean|undefined>, name: <fileName|undefined>, body: <text|base64>, to: <all|shell|ai-<model>|messageUUID>}`. Appends a message with server-generated UUID, timestamp and sender, creating the file and parent folders if needed. Rejects complete header/body marker lines in `body`. With `base64`, `body` must be valid base64, `to` must be `all` or a message UUID (files go to people, not to the shell or AI), and the head gets a `base64 1` line; `name` (only allowed with `base64`, no slashes or newlines) adds a `name <fileName>` line. Absent headers are omitted, not left as blank lines. When building AI prompts, the body of each `base64 1` message is replaced with `[BASE64 FILE: N BYTES OMITTED]`. Returns `{id: <messageUUID>, responseId: <messageUUID>}` for shell and AI messages, otherwise `{id: <messageUUID>}`; 400 if validation or persistence fails. During AI runs, each response or tool message is appended before the previous one is marked finished, so a pending chain never appears finished between steps.
- **Read message**: `PUT /project/message`: expects `{projectId: <projectId>, file: <fileName>, messageId: <messageUUID>}`. Returns `{message: <text>, next: [<messageUUID>, ...]}`: the message including its head and body markers, and the ids of the messages after it, in file order. Clients use `next` to append new messages without rereading the whole file. Returns 404 if access is denied, the path is invalid, the file is missing, or the message is not found; 400 for invalid body fields.

#### Credentials

- **Start PKCE**: `POST /credentials/:provider/start`: starts the OAuth PKCE flow for `:provider` (`anthropic` or `openai`). Returns a URL to open in the browser.
- **Complete PKCE**: `POST /credentials/:provider/complete`: expects `{code: <string>}`. Exchanges the authorization code for tokens and stores the account credential.
- **Add API key**: `POST /credentials/:provider/apiKey`: expects `{key: <string>}`. Stores the API key for the provider.
- **Remove credential**: `DELETE /credentials/:provider/:name`: removes a single credential type (`:name` is `account` or `apiKey`) for the given provider.

#### Admin

- **Grant/revoke creator access**: `POST /creator/grant`: expects `{email: <email>, grant: <boolean>}`. Returns 404 if `grant` is `false` and user does not exist. If `grant` is `true` and user does not exist, the endpoint creates the user, with a username generated as in **Login**. In local mode, this route returns a 404.
- **Run server tests**: `GET /test`. This is a `GET` so that it can be triggered from the browser. Returns the result of running the server test suite.
- **Get client tests**: `GET /test.js`.
- **Cleanup after tests**: `POST /test/cleanup`. Used to run after the client tests.

### Responders

#### Native

- `hashchange`: calls `read hash` whenever the URL hash changes.
- `fullscreenchange`: when the browser leaves full screen (Escape, or its own controls) while `file.full` is set, sets `file.full` to false.
- `DOMContentLoaded`, `resize`: sets `mobile` to true when the screen is narrower than tachyons' `-ns` breakpoint (30em), and removes it otherwise. Skips the update when the value is unchanged. The 403 reset and `logout` preserve `mobile`.
- `touchstart`, `touchend`: on mobile, with the right pane of the files view showing, a horizontal swipe of more than 60px (and more than twice as wide as tall) dispatches a Command+J (swipe left) or Command+K (swipe right) `keydown`, switching to the next or previous file. Listens in the capture phase so it works over the text editor. Ignores swipes that start inside an element that scrolls sideways (code blocks, tool output).
- `keydown`, `keyup`, `blur`: forwarded to `B.call` so responders can react to keyboard state (e.g. detecting the Command key).
- `visibilitychange`: when the tab regains focus and a login link has been requested, polls `GET /auth/user` to check if the user logged in via the link. On success, sets user state, loads projects and navigates to projects.
- `window.onerror`: reports client errors to the server via `report error`. Ignores ResizeObserver errors.

#### General

- `keydown *`: tracks the Command key and handles the global test shortcut:
  - Command+Shift+L: calls `test all` if the logged in user is admin (matches Command plus uppercase `L`).
  - Meta: sets `key.command` to true, showing keyboard shortcut tooltips.
- `keyup|blur *`: clears `key.command` when Meta is released or the window loses focus. On blur, if `file.full` is set and focus left the page (not just moved into an embedded frame), sets `file.full` to false, which also exits browser full screen.
- `test *`: sets `test` to `{enabled: true}`. Loads the client side test suite (`test.js`) only if the logged in user is admin.
- `navigate <targetPath>`: reads and optionally updates the hash. Code navigates to projects as `files/<projectId>[/<filename>]`, which is turned into the project's URL, `p/<owner>/<project>[/<filename>]` (see `read hash`), before comparing. If the current hash doesn't match the target path, it sets the hash. If the existing hash matches the target, it calls `read hash`.
- `read hash`: handles `verify/<loginLink>` and checks that the requested view is reachable by the user. Projects are shown at `p/<owner>/<project>/<filename>`, in the `files` view. The owner slot is the user's own username (or user id) for their projects and the owner's user id for shared ones; the project slot is the project name encoded as the server's `/p/` route expects (each dash as `--`, each space as `-`, the rest percent-encoded), or the project id for a project that isn't loaded yet. The URL is matched against the loaded projects by those slots, the owner's user id, or the project id in the project slot; if nothing matches (e.g. another owner's username), it is resolved through `GET /p/<owner>/<project>` and replaced by the project's own URL, or shows `Project not found` and goes to projects. Then validates the filename, sets `project.id` and `file.name`, and loads the file list if needed. Defaults to `main.md`, or the first available file. Leaving the files view clears `file` and `files`. If `extendClient` is set, leaving that project (including switching projects) reloads the page at the destination hash to discard extension runtime state.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message]`: shows a notification with type (`ok`, `warning`, `error`). Auto-clears after 4 seconds. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Puts the CSRF header in the request if the CSRF token is available. Adds `x-test: 1` when `test` is truthy. On 403 from a non-auth path, resets user state and redirects to login. Reports errors to the server.

#### Auth

- `report error <error>`: posts an error to the server via `POST /error`.
- `load user`: if the hash contains a verification link, calls `read hash` directly. Otherwise, fetches user information from `GET /auth/user`. On success, sets `user` to the response body, loads projects and calls `read hash`. On 403, sets `user` to `{anonymous: true, mode: 'cloud'}` and loads projects, which shows the projects with a `PUBLIC` grant; other errors show a snackbar.
- `login <email>`: trims and lowercases the email, then sends a login link via `POST /auth/login`. On success, sets `user.loginLinkRequested` and, when `test` is truthy, stores the returned link at `test.loginLink`.
- `verify <loginLink>`: verifies the login link via `GET /auth/verify/<loginLink>`. On success, stores the user info, loads projects, and navigates to projects. On error, shows a snackbar and navigates to login.
- `logout`: logs out via `POST /auth/logout`. Resets user state to anonymous and navigates to login.
- `update user <body>`: sends `body` (`{settings: <object>}` and/or `{username: <string>}`) through `PUT /auth/user`. On success, sets each key of the response under `user` (e.g. `user.settings`, `user.username`), showing an `ok` snackbar (`Username changed to <username>`) when the username differs from the current one; on failure, keeps the current values and shows the server's error (such as an invalid or taken username) in a snackbar, or `Could not update user`. In the right settings pane, the Username form calls it with `{username}` on submit, and the `vi mode` checkbox below the AI providers with the complete settings object as `{settings}`.
- `change user.settings`: updates the current editor's key map without recreating it. Uses Vim bindings when `user.settings.vi` is true, otherwise default bindings.

#### Credentials

- `start pkce <provider>`: opens the provider's login page in a new tab and sets `pkce.step` to receive the code.
- `complete pkce <provider> <code>`: exchanges the authorization code for tokens via `POST /credentials/:provider/complete`. On success, clears `pkce` and reloads user.
- `save apiKey <provider> <key>`: saves the API key via `POST /credentials/:provider/apiKey`. On success, clears `pkce` and reloads user.
- `remove credential <provider> <name>`: asks for confirmation, then removes the credential via `DELETE /credentials/:provider/:name`. On success, reloads user.

#### Projects

- `request creator`: requests creator access via `POST /creator/request` with an empty body (`{}`). Ignores requests outside cloud mode, from existing creators, or when `user.creatorRequest` is already set. Sets `user.creatorRequest` to `pending` while sending and `sent` on success, showing a snackbar confirming admin review. On error, clears the request state to allow retrying and shows an error snackbar.
- `keydown *`: handles shortcuts while in the projects view:
  - Command+1–5: opens the project in that slot.
  - Command+B: in search mode, returns to the spiral.
  - Command+D: in the creation modal, generates a random name.
  - Command+E: in search mode, opens project creation; in the creation modal, creates the project when the button is enabled.
  - Enter: creates the project when the creation button is enabled.
  - Escape: closes the creation modal.
  - Command+S: opens and focuses search.
- `change projects`: rereads the hash to validate navigation against the refreshed project list.
- `change project.id`: clears `files` and `project.size` so the newly selected project's file list and disk usage can be loaded.
- `load clientExtension`: skips projects with `public: true`, so their code never runs in the visitor's session. Otherwise checks the loaded file list for root-level `extend-client.js`. If present and the files view is still showing the selected project, stores its project ID in `extendClient`, reads the script via `GET /project/<projectId>/file/extend-client.js`, and evaluates it in global scope with access to `B`, `views`, etc. Skips loading when `extendClient` is already set and ignores responses if the marker or destination project has changed. Loading and evaluation errors show a snackbar. Only use trusted project code: extensions run with full app privileges. Refresh the page inside the project to activate extension changes. Leaving the project reloads the page even if loading or evaluation failed. Logout clears the marker but does not undo already-running extension code.
- `load projects`: gets all projects via `GET /projects`, sets them in `projects`.
- `create project`: creates a new project using the trimmed name at `new.project.name` and optional `new.project.slot` via `POST /project`. On success, clears the creation modal and project search, temporarily adds the project to `projects`, navigates to its `main.md` and reloads projects.
- `change new.project`: when `new.project` is set, focuses the new project name input field. Runs at low priority so the DOM is ready.
- `edit project`: renames and/or changes the slot of a project using the values at `edit.project` via `PUT /project`. The slot selector's “None” option uses the string `null`, which is converted to `undefined` rather than parsed as a number. On success, reloads projects and shows a snackbar.
- `remove project <project>`: asks for confirmation, then deletes the project via `DELETE /project/<id>`. On success, reloads projects and shows a snackbar.

#### Files

- `keydown *`: handles shortcuts while in the files view; returns without handling them during uploads. Rename submission shortcuts check for an enabled `#rename-file` button, which the current file rename modal does not provide.
  - Command+B: on mobile, from the right pane, shows the left pane; otherwise returns to projects.
  - Command+D: when the chat recipient input is present, focuses it and selects its text.
  - Command+Enter: when the chat editor is present, calls `create message` with the current recipient, filename and draft body (the same action as Boom).
  - Command+E: opens file creation; in the creation modal, creates when enabled. In rename, also attempts submission through `#rename-file`.
  - Enter: creates a file when the creation button is enabled, or attempts rename submission through `#rename-file`.
  - Escape: closes the creation or rename modal.
  - Command+F: in creation, selects file type.
  - Command+I: outside creation, scrolls down by chat message when the chat is visible, otherwise toggles edit/view mode; in creation, selects chat type.
  - Command+O: outside creation, scrolls up by chat message when the chat is visible.
  - Command+M: outside creation, focuses the chat editor when present.
  - Command+J: outside creation, selects the next file in the filtered list, wrapping at the end.
  - Command+K: outside creation, selects the previous file in the filtered list, wrapping at the beginning. Both do nothing when the filter matches no files. On mobile, swiping left or right on the right pane dispatches them.
  - Command+R: in creation, opens folder upload.
  - Command+S: outside creation, focuses search.
  - Command+/: toggles content search in chat and text editors; opening focuses and selects the input.
  - Enter/Shift+Enter in text search: selects the next/previous match, wrapping around.
  - Escape in text search: clears the query and highlights, and returns focus to the editor at its cursor.
  - Command+U: outside creation, deletes the selected file; in creation, opens file upload.
  - Command+X: closes the creation modal.
  - Command+Y: outside creation, opens rename if a file is selected and rename is not already open.
  - Command+9: toggles settings.
  - Command+\: toggles full screen on the right pane (`file.full`).
- `change files`: rereads the hash and scrolls the selected file into the center of the left pane. Runs at low priority so the DOM is ready.
- `change file.name`: reads the selected file and scrolls its entry into the center of the left pane. Runs at low priority.
- `change new.file`: focuses the new file name input when the creation modal opens. Runs at low priority.
- `change edit.file`: focuses the rename input when the rename modal opens. Runs at low priority.
- `list files <noRead>`: lists readable project files through `GET /project/<projectId>/files`, excluding `.git`, and sets `files` with each file's name, size and modification time. Waits for projects to load and ignores responses for a project that is no longer selected. After a successful listing, also runs `du -sk /project` through `POST /project/run` with `read: true`, converting KiB to bytes in `project.size.bytes`. This measures disk usage including `.git`; `views.files` displays it as a `size: <size>` pill beside the project title, using the same `size()` formatter as file sizes. The same command then estimates what `clear history` would free: it commits the worktree into a temporary repository (via `GIT_DIR`/`GIT_WORK_TREE`, leaving `/project/.git` untouched), runs `git gc` on it, and prints the difference between both `.git` sizes in bytes, stored (floored at 0) in `project.size.history`. When nonzero, `views.files` shows a `clear history (<size>)` pill after the project size. Failed or denied size requests are silently ignored; command execution requires whole-project write access, and anonymous users skip it. Then calls `load clientExtension` and, unless `noRead` is set, reads the selected file.
- `read file`: clears the global `content` and emits `change file`. If `fileEdits` contains pending edits for this project/file, returns without fetching potentially stale server content; the edit queue resumes the read when that file's edits finish, provided it is still selected and `content` is undefined. For images (`avif`, `bmp`, `gif`, `jpg`, `jpeg`, `png`, `webp`) and PDFs (case-insensitive), returns without fetching content; the view loads them directly through `GET /project/<projectId>/file/<path>`. Images show a snackbar on load failure; PDFs provide a download fallback. For other files, fetches through the same GET endpoint as bytes, decodes them as text only if they contain no null bytes and are valid UTF-8, otherwise retains a `Uint8Array`, and emits `change file`. For text chats, if the recipient is blank, restores the latest human message's recipient when it is `shell` or starts with `ai-`, otherwise uses `all`. Ignores responses if the selected project or filename has changed.
- `edit file <name> <newContent>`: compares global `content` with the full editor text using an internal chunking function. Splits into lines while preserving line endings, uses `B.diff` to group contiguous additions/deletions, and expands each chunk with unchanged lines above/below until its `oldText` is unique. Each chunk's context accounts for preceding chunks. A shared sentinel works around gotoB dropping leading additions during backtracking; remove it once gotoB uses `x > 0 || D > 0` instead of `x > 0`. A diff timeout shows a snackbar without enqueueing edits. Appends chunks with captured project/file identifiers to `fileEdits` and immediately advances `content` to the editor text. An initially empty queue starts a recursive, callback-driven drain, keeping the in-flight entry at the head and sending one request at a time through `POST /project/edit`; no timers or separate saving flag. Empty originals and originals exactly `[EOF]` use unconditional `POST /project/write` entries instead. The queue survives project/file navigation. On failure, logs the error and removes all queued edits for the failed project/file, retaining other files' edits. If that document is still selected and loaded in the file editor, a native confirmation offers overwriting with its current editor text or discarding edits and loading the server version. Otherwise, shows an error snackbar and rereads the failed file only if it is still selected. Successful requests remove the head and continue draining; deferred reads resume when their file has no remaining edits.
- `write file <name> <content> [new]`: saves through `POST /project/write`. On success, updates the file's size and modification time in the list. For a new file, navigates to it and refreshes the list after the write succeeds; otherwise, updates the global `content` if the file is still selected.
- `create file`: creates an empty file from the trimmed name at `new.file`, adding `.md` when it has no extension and the `chat/` prefix when `new.type` is `chat`. Temporarily adds it to the file list, closes the creation modal and, on mobile, shows the right pane. The successful write triggers the list refresh. The modal checks for a name conflict against this same final path, so creating never overwrites an existing file or chat.
- `clear history`: asks for confirmation, then replaces the project's git history with a single commit through `POST /project/run` with `read: true`: deletes `/project/.git`, reinitializes it on `main` with the `vibey` user, commits all files as `Fresh start` and runs `git gc`. Files are unchanged; past versions, and when they were made, are gone for everyone with access. On success, subtracts `project.size.history` from `project.size.bytes` and clears `project.size.history` (hiding the pill), if the project is still selected, and shows a snackbar.
- `remove file <name>`: asks for confirmation, then deletes the file through `POST /project/run`. Refreshes the list and, if the deleted file was selected, navigates to the project's default file.
- `rename file <oldName> <newName>`: validates the new relative path, creates destination folders and moves the file without overwriting an existing destination through `POST /project/run`. On success, closes the rename modal, refreshes the list and updates navigation if the renamed file was selected.
- `download file`: downloads the selected file's server copy through `GET /project/<projectId>/file/<path>`, encoding each file path segment. Uses a temporary anchor with the file's basename as its download name; does not require loaded content.
- `upload file|folder <files> [options]`: uploads a file or folder's files through `POST /project/write`, preserving relative paths and sending file content as multipart without base64 encoding. `options.prefix` writes each file as prefix + file name instead; `options.cb` is called with the written names by index (undefined for failures) instead of refreshing the list and navigating. Tracks successful uploads in `upload.done` out of `upload.total`. When all uploads finish, clears progress and refreshes the list. On full success, closes the creation modal and navigates to the file for a single-file upload; otherwise, shows a failure summary and leaves the modal open.
- `change projects|project|file|settings`: recreates CodeMirror when an editor container is present. Runs at low priority, only in the files view. Enables Vim bindings when `user.settings.vi` is true, line wrapping and JavaScript/Python/Markdown modes; file editors are read-only while `content` is undefined, and loaded file editor changes call `edit file` with the filename and full editor text, while chat editor changes update `message.body`. Calls `highlight content` after editor setup and file edits.
- `change search.content.query`: calls `highlight content`; opening search in the files view focuses and selects the input after rendering.
- `change view`: calls `highlight content` at low priority, after rendering.
- `change file.full`: enters browser full screen on `document.documentElement` when `file.full` is set, and exits it when unset. Also matches changes to `file` as a whole, so leaving the files view exits full screen. Does nothing if the browser is already in the matching state. Browsers only allow entering full screen from a click or key press; B.call runs synchronously inside those handlers, so the icon and Command+\ qualify. A refused request is ignored and only the in-page layout changes.
- `highlight content`: highlights literal, case-insensitive matches for `search.content.query`, sets `search.content.count` and resets `search.content.current` to 0. Clears both integers when the query is empty or no text editor is active.
- `find content <backwards>`: selects, outlines and scrolls to the next/previous match, wrapping at either end. Sets the 1-based `search.content.current` without moving focus from search.

#### Chat

- `cancel message <id>`: replaces `pending 1` in the message header with `cancelled <ISO timestamp>` and `pending 0` through `POST /project/edit`. Sets `message.cancelling.<id>` while saving and clears it afterward. On success, rereads the selected chat; on failure, shows a snackbar. The server checks for cancellation every 100ms while an AI, shell message or run tool process is active and kills its process group when cancelled.
- `scroll chat <direction>`: scrolls the visible chat by message, up for negative values and down otherwise. Aligns a partially visible message before advancing to the adjacent one.
- `change content|file|project|view`: finds chat messages with `pending 1` in their headers and sets `pending.messages` to their `projectId/file/messageId` keys. Clears the list outside a loaded chat.
- `change pending.messages`: starts a 100ms polling interval for each new key and clears intervals for keys no longer pending. Calls `PUT /project/message`, skipping ticks while a request or its follow-up appends are in flight. Checks project/file and interval before replacing only that message in local `content`, then emits `change content`. Fetches each id in `next` that is not yet in `content` through the same endpoint and appends it in order, so new pending messages start their own polling. When the updated message is no longer pending, refreshes the file list without rereading the chat (`list files` with `noRead`); does not write to the server or recreate the draft editor directly.
- `change content|file` (priority `1001`): before views redraw, stores in `message.atBottom` (via `mset`, without a change event) whether the first `.messages` element is within 100px of its bottom. Measuring before rendering keeps large appends, such as tool-call messages, from breaking the stick-to-bottom behaviour.
- `change content|file` (priority `-1001`): after rendering, scrolls the first `.messages` element to its `scrollHeight` if `message.atBottom` is set.
- `create message <to> <name> <body>`: posts to `POST /project/message`, trimming the recipient and defaulting it to `all` when blank. Ignores blank messages. On success, if the same project and file are selected, clears the draft if unchanged and refreshes the file list and chat. Preserves the draft on failure.
- `download message <id>`: downloads the file in a `base64 1` message of the loaded chat, triggered by the Save button under the message number. Decodes the single-line body into a Blob and downloads it through a temporary anchor named after the message's `name` header (`file` if absent). Ignores messages without the `base64 1` header.
- `upload message <files>`: sends files picked with the paperclip button next to Boom to the selected chat. Writes them through `upload file` with the prefix `<chat>-` (e.g. `chat/party.md-X.png`, overwriting any existing file), then posts one message per uploaded file, in the order picked and each after the previous one: a markdown link to the file (`[X.png](<chat/party.md-X.png>)`), which the chat renders inline. Messages go to the recipient if it is a message UUID, otherwise to `all`, so the shell or AI don't get one run per file. A failed post stops the remaining ones with a snackbar. Then refreshes the file list and rereads the chat if it is still selected.

### Client state

For performance purposes, we use two globals outside of the store:

```
content <string|Uint8Array|undefined> // Text, binary data, or undefined while loading/waiting for pending edits; text advances immediately on enqueue, serving as the baseline for subsequent editor changes rather than an acknowledged server snapshot
editor <CodeMirror instance>
```

Store:

```
edit file newName "<new name>"
          oldName "<original name>"
     project id <id>
             name "<project name>"
             slot <integer|numeric string|"null"|undefined> // "null" is the edit selector's None option
expand <projectId> <filename> <messageIndex> <true|undefined> // Chat message expansion; index is the zero-padded display number (e.g. "0001"), not UUID. Only bodies over 10,000 characters are collapsible, except file (`base64 1`) messages, which are never truncated: true shows the full body; undefined keeps the lines around the first and last 50 characters with an "(omitting N lines)" marker. Toggled by Expand (Nk)/Collapse.
extendClient <projectId|undefined> // Project whose client extension started loading
file actions <false|true> // Whether the filename pill shows Rename and Download; collapsed by default
     full <false|true> // Whether the right pane fills the screen: it covers the window (the left pane stays rendered underneath), hides the project header and Settings/Logout buttons, and enters browser full screen; toggled by the fullscreen icon in the file header or Command+\. Exiting browser full screen clears it. Persists across files, cleared when leaving the files view
     mode <edit|view> // For markdown files, view renders the doc: images fit the pane; relative image srcs and link hrefs resolve against the doc's folder, with srcs loading through the file endpoint and hrefs opening the file in vibey through its `p/` URL; relative links to images also show the image inside the link, and links to audio or video show a player after the link. Chat messages render the same way, with paths relative to the project root
     name "..."
fileEdits <array|undefined> // Persistent pending-edit queue; initialized silently on first edit, mutated without change events, and retained across navigation. The head stays queued while its request is in flight; no separate saving flag
          1 project <projectId> // Captured destination project
            file <filename> // Captured destination file
            oldText <string|undefined> // Unique replacement anchor, including unchanged context
            newText <string|undefined> // Replacement including the same unchanged context
            content <string|undefined> // Full-write fallback or confirmed overwrite; used instead of oldText/newText
          ...
files 1 mtime <integer> // Modification time in milliseconds since Unix epoch
        name "<filename>"
        size <integer> // File size in bytes
      ...
hover project <project> // The project (or free project slot) being hovered on
key command <true|undefined> // if set, the command key is pressed
message atBottom <false|true> // Whether the chat was within 100px of the bottom before the latest content/file change; set with mset, so it does not trigger a change event
        body <text> // Current chat draft, initially empty
        cancelling <messageId> <true|undefined> // Whether a cancellation edit is being saved
        to <all|shell|ai|ai-<model>|messageUUID> // Recipient; restored from chat when blank, defaults to all. Options list only ai-<model> entries with usable credentials, or a bare ai when there are none
mobile <true|undefined> // Whether the screen is narrower than tachyons' `-ns` breakpoint (30em)
new file "<file name>" // Name for a new file
    project name "<project name>" // Enables the new project modal
            slot <integer|undefined>
    type "chat|file" // Whether the new file is a normal file or a chat
pkce apiKey <provider|undefined> // When set, shows the API key modal for the provider
     code "<string>" // Code or API key being entered
     confirm <provider|undefined> // When set, shows the PKCE confirmation modal
     loading <provider|undefined> // Provider currently opening a browser tab
     step flow "paste_code"
          provider <provider> // Active PKCE code-entry step
pending messages <array of "projectId/file/messageId"> // Pending messages in the current chat; initially empty
        requests <map of "projectId/file/messageId" to interval ID> // Active 100ms polling intervals; initially empty
project id <projectId|undefined> // The current project selected
        size bytes <integer> // Disk usage including .git, displayed beside the project title; cleared when `project.id` changes
             history <integer> // Bytes that `clear history` would free; shows the clear history pill when nonzero
projects 1 created <date>
           id <id>
           last <date>
           name "..."
           owner <userId>
           ownerUsername <username|undefined> // The owner's username; the list shows projects owned by someone else as username/name
           public <true|undefined> // Listed only because it has a PUBLIC grant; hidden from logged-in users' projects view and slot shortcuts, and never runs its client extension
           slot <integer|undefined>
         ...
search content count <integer> // Number of text-editor matches; 0 for an empty query or no active text editor
               current <integer> // 1-based selected match; 0 when no match is selected; resets when highlighting is rebuilt
               query <text|undefined> // Undefined hides search; empty string shows it unfiltered. Toggled by Search or Command+/. Literal, case-insensitive text-editor search; smartcase filtering of message bodies, filenames, senders and destinations
       file <text|undefined> // Filters filenames
       project <text|undefined> // Filters project; undefined shows the spiral, a defined value shows the list. Anonymous users always see the list
show account <true|undefined> // On mobile, whether the account modal (who you're logged in as) is open in the projects view.
     pane <left|right|undefined> // On mobile, which pane of the files view is shown; undefined shows the left pane. Clicking a file in the list sets it to right; the ‹ chevron in the file header and Command+B remove it. The right pane hides the project header, so it takes the full height. Ignored on wider screens
     settings <false|true> // Whether the settings panel is visible
snackbar message <message>
         timeout "<JS timeout to clear the snackbar>"
         type "<notification type>" // Usually ok, warning, or error
swipe <{x, y}|undefined> // Where the current touch started; undefined when it started inside something that scrolls sideways. Set with mset, so it does not trigger a change event
test enabled <true|undefined> // Whether test mode is enabled
     loginLink // Login link for testing
upload done <integer> // Successfully uploaded files, or files sent as chat messages; upload exists only while uploading
       total <integer> // Total files in the upload
user admin <true|undefined>
     anonymous <true|undefined> // Cloud mode without a session: the projects view shows the list of public projects, and the header shows Login instead of Logout and hides Settings
     settings vi <boolean|undefined> // Vim bindings for file and chat editors; unset means off
     count <integer>
     creator <false|true>
     creatorRequest <pending|sent|undefined> // Creator access request state
     credentials anthropic account <true|undefined>
                          apiKey <true|undefined>
                openai account <true|undefined>
                       apiKey <true|undefined>
     csrf "<CSRF token>"
     email "<email>" // Entered in the login form; set from the server once logged in
     id <userId>
     loginLinkRequested <true|undefined> // Whether the login link was already sent
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
     username "<username>"
view "<view name>"
```
