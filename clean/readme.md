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
email:<email> <userId>
loginLink:<link> <email>
loginLinkR:<email> <loginLink> // reverse login link
project:<projectId> created <date>
                    id <id>
                    last <date>
                    name <name>
                    owner <userId>
                    slot <integer|undefined>
owner:<userId> 1 session:<sessionId>
               2 project:<projectId>
               ...
credentials:<userId> data <JSON> // {provider: {account: {access, expires, refresh, ...}, apiKey: "<key>"}}
lock:edit:<projectId>:<path> <integer> // per-file edit lock, expires 10s
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
userCount <integer>
```

### API

#### Public

- **Static**: `GET /`.
- **Post error**: `POST /error`: accepts any body.

#### Auth

Except for `GET /auth/user`, all other auth routes will return a 404 in local mode.

- **Get user**: `GET /auth/user`: returns `{admin: true|undefined, count: <integer>, creator: <boolean>, credentials: <object>, csrf: <token>, email: <email>, id: <user id>, mode: 'cloud'}` in cloud mode and `{mode: 'local'}` in local mode. `credentials` lists stored providers and credential types as presence flags (for example, `anthropic.account: true`), never credential values or tokens.
- **Login**: `POST /auth/login`: expects `{email: <email>}`. Returns 403 if rate limited. Creates a user for that email if it doesn't exist yet. Sends a login link by email.
- **Verify login link**: `GET /auth/verify/<loginLink>`: Returns 403 if link not found. Returns the same than what `GET /auth/user` does, and sets a session cookie.
- **List sessions**: `GET /auth/list`: returns a list of sessions with `{expired: <boolean>, last: {date: <date>, ip: <ip>}}`.
- **Logout**: `POST /auth/logout`: deletes the current session and clears the cookie.
- **Delete account**: `POST /auth/delete`: deletes the user and all their resources (sessions, projects). Clears the cookie.

#### Project

- **Request creator access**: `POST /creator/request`: expects `{}`. Returns 409 if the user is already a creator. In local mode, this route returns a 404.
- **Get projects**: `GET /projects`.
- **Create project**: `POST /project`: expects `{name: <name>, slot: <positiveInteger|undefined>}`. Names must contain at least two characters. Returns 403 if the user is not a creator, 409 if the current user already has a project with that name. Assigning an occupied slot removes that slot from the project previously occupying it.
- **Rename project**: `PUT /project`: expects `{id: <id>, name: <name>, slot: <positiveInteger|undefined>}`. Names must contain at least two characters. Returns 404 if project is not found, 409 if the current user has another project with the new name. Assigning an occupied slot removes that slot from the project previously occupying it.
- **Serve file**: `GET /project/<projectId>/file/<path>`: serves a file from `/project` through `docker.read`, with its MIME type or `application/octet-stream`. Requires project ownership. Returns 404 if the project is not owned by the user or the file is missing, 400 for absolute paths, null bytes or `..` segments, and 500 for other read errors. Symlinks are followed. Uses `cicek.cache` for ETags and 304 responses, with `Cache-Control: private, no-cache`. Sends `nosniff` and a sandbox CSP for safe previews.
- **Read file**: `POST /project/read`: expects `{id: <projectId>, path: <path>}`. Returns the file contents. Returns 404 if file not found.
- **Write file**: `POST /project/write`: expects `{id: <projectId>, path: <path>, content: <string>, base64: <boolean|undefined>}`. Writes content to the file. If `base64` is `true`, decodes `content` from base64 before writing. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Edit file**: `POST /project/edit`: expects `{id: <projectId>, path: <path>, oldText: <string>, newText: <string>}`. Replaces `oldText` with `newText` in the file. `oldText` must match exactly once, except for the reserved value `'[EOF]'`, which appends `newText` to the end of the file. Returns 400 if `oldText` is absent, matches multiple times, or the edit otherwise fails. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Run command**: `POST /project/run`: expects `{id: <projectId>, command: <string>}`. Runs the command inside the project's container.
- **Send message**: `POST /project/message`: expects `{id: <projectId>, file: <fileName>, base64: <boolean|undefined>, body: <text|base64>, to: <all|shell|ai-gpt-6|ai-opus-4.6|messageUUID>}`. Appends a message with server-generated UUID, timestamp and sender, creating the file and parent folders if needed. Rejects complete header/body marker lines in `body`. Returns `{id: <messageUUID>, responseId: <messageUUID>}` for shell messages, otherwise `{id: <messageUUID>}`; 400 if validation or persistence fails.
- **Read message**: `PUT /project/message`: expects `{projectId: <projectId>, file: <fileName>, messageId: <messageUUID>}`. Returns the message as text, including its head and body markers. Returns 404 if the project is not owned by the user, the file is missing, or the message is not found; 400 for invalid input.
- **Remove project**: `DELETE /project/<projectId>`

#### Credentials

- **Start PKCE**: `POST /credentials/:provider/start`: starts the OAuth PKCE flow for `:provider` (`anthropic` or `openai`). Returns a URL to open in the browser.
- **Complete PKCE**: `POST /credentials/:provider/complete`: expects `{code: <string>}`. Exchanges the authorization code for tokens and stores the account credential.
- **Add API key**: `POST /credentials/:provider/apiKey`: expects `{key: <string>}`. Stores the API key for the provider.
- **Remove credential**: `DELETE /credentials/:provider/:name`: removes a single credential type (`:name` is `account` or `apiKey`) for the given provider.

#### Admin

- **Grant/revoke creator access**: `POST /creator/grant`: expects `{email: <email>, grant: <boolean>}`. Returns 404 if `grant` is `false` and user does not exist. If `grant` is `true` and user does not exist, the endpoint creates the user. In local mode, this route returns a 404.
- **Run server tests**: `GET /test`. This is a `GET` so that it can be triggered from the browser. Returns the result of running the server test suite.
- **Get client tests**: `GET /test.js`.
- **Cleanup after tests**: `POST /test/cleanup`. Used to run after the client tests.

### Responders

#### Native

- `hashchange`: calls `read hash` whenever the URL hash changes.
- `keydown`, `keyup`, `blur`: forwarded to `B.call` so responders can react to keyboard state (e.g. detecting the Command key).
- `visibilitychange`: when the tab regains focus and a login link has been requested, polls `GET /auth/user` to check if the user logged in via the link. On success, sets user state, loads projects and navigates to projects.
- `window.onerror`: reports client errors to the server via `report error`. Ignores ResizeObserver errors.

#### General

- `keydown *`: tracks the Command key and handles the global test shortcut:
  - Command+Shift+L: calls `test all` if the logged in user is admin (matches Command plus uppercase `L`).
  - Meta: sets `key.command` to true, showing keyboard shortcut tooltips.
- `keyup|blur *`: clears `key.command` when Meta is released or the window loses focus.
- `test *`: sets `test` to `{enabled: true}`. Loads the client side test suite (`test.js`) only if the logged in user is admin.
- `navigate <targetPath>`: reads and optionally updates the hash. If the current hash doesn't match the target path, it sets the hash. If the existing hash matches the target, it calls `read hash`.
- `read hash`: handles `verify/<loginLink>` and checks that the requested view is reachable by the user. For `files/<projectId>/<filename>`, validates the project and filename, sets `project` and `file.name`, and loads the file list if needed. Defaults to `main.md`, or the first available file. Leaving the files view clears `file` and `files`. If `extendClient` is set, leaving that project (including switching projects) reloads the page at the destination hash to discard extension runtime state.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message]`: shows a notification with type (`ok`, `warning`, `error`). Auto-clears after 4 seconds. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Puts the CSRF header in the request if the CSRF token is available. Adds `x-test: 1` when `test` is truthy. On 403 from a non-auth path, resets user state and redirects to login. Reports errors to the server.

#### Auth

- `report error <error>`: posts an error to the server via `POST /error`.
- `load user`: if the hash contains a verification link, calls `read hash` directly. Otherwise, fetches user information from `GET /auth/user`. On success, sets `user` to the response body, loads projects and calls `read hash`. On 403, sets cloud mode and redirects to login; other errors show a snackbar.
- `login <email>`: trims and lowercases the email, then sends a login link via `POST /auth/login`. On success, sets `user.loginLinkRequested` and, when `test` is truthy, stores the returned link at `test.loginLink`.
- `verify <loginLink>`: verifies the login link via `GET /auth/verify/<loginLink>`. On success, stores the user info, loads projects, and navigates to projects. On error, shows a snackbar and navigates to login.
- `logout`: logs out via `POST /auth/logout`. Resets user state and navigates to login.

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
- `change project`: clears `files` so the newly selected project's file list can be loaded.
- `load clientExtension`: checks the loaded file list for root-level `extend-client.js`. If present and the hash still points to the selected project, stores its project ID in `extendClient`, reads the script via `POST /project/read`, and evaluates it in global scope with access to `B`, `views`, etc. Skips loading when `extendClient` is already set and ignores responses if the marker or destination project has changed. Loading and evaluation errors show a snackbar. Only use trusted project code: extensions run with full app privileges. Refresh the page inside the project to activate extension changes. Leaving the project reloads the page even if loading or evaluation failed. Logout clears the marker but does not undo already-running extension code.
- `load projects`: gets all projects via `GET /projects`, sets them in `projects`.
- `create project`: creates a new project using the trimmed name at `new.project.name` and optional `new.project.slot` via `POST /project`. On success, clears the creation modal and project search, temporarily adds the project to `projects`, navigates to its `main.md` and reloads projects.
- `change new.project`: when `new.project` is set, focuses the new project name input field. Runs at low priority so the DOM is ready.
- `edit project`: renames and/or changes the slot of a project using the values at `edit.project` via `PUT /project`. The slot selector's “None” option uses the string `null`, which is converted to `undefined` rather than parsed as a number. On success, reloads projects and shows a snackbar.
- `remove project <project>`: asks for confirmation, then deletes the project via `DELETE /project/<id>`. On success, reloads projects and shows a snackbar.

#### Files

- `keydown *`: handles shortcuts while in the files view; returns without handling them during uploads. Rename submission shortcuts check for an enabled `#rename-file` button, which the current file rename modal does not provide.
  - Command+B: returns to projects.
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
  - Command+K: outside creation, selects the previous file in the filtered list, wrapping at the beginning.
  - Command+R: in creation, opens folder upload.
  - Command+S: outside creation, focuses search.
  - Command+/: focuses the visible content search input.
  - Enter/Shift+Enter in text search: selects the next/previous match, wrapping around.
  - Escape in text search: clears the query and highlights.
  - Command+U: outside creation, deletes the selected file; in creation, opens file upload.
  - Command+X: closes the creation modal.
  - Command+Y: outside creation, opens rename if a file is selected and rename is not already open.
  - Command+9: toggles settings.
- `change files`: rereads the hash and scrolls the selected file into the center of the left pane. Runs at low priority so the DOM is ready.
- `change file.name`: reads the selected file and scrolls its entry into the center of the left pane. Runs at low priority.
- `change new.file`: focuses the new file name input when the creation modal opens. Runs at low priority.
- `change edit.file`: focuses the rename input when the rename modal opens. Runs at low priority.
- `list files`: lists project files through `POST /project/run`, excluding `.git`, and sets `files` with each file's name, size and modification time. Waits for projects to load and ignores responses for a project that is no longer selected. Then calls `load clientExtension` and reads the selected file.
- `read file`: clears the global `content` and emits `change file`. For images (`avif`, `bmp`, `gif`, `jpg`, `jpeg`, `png`, `webp`, case-insensitive), returns without fetching content; the view loads the image directly through `GET /project/<projectId>/file/<path>` and shows a snackbar on load failure. For other files, fetches via `POST /project/read`, sets `content` to text or a `Uint8Array` according to the `x-binary` response header and emits `change file`. For chats, if the recipient is blank, restores the latest human message's recipient when it is `shell` or starts with `ai-`, otherwise uses `all`. Ignores responses if the selected project or filename has changed.
- `write file <name> <content> [new]`: saves through `POST /project/write`. On success, updates the file's size and modification time in the list. For a new file, navigates to it; otherwise, updates the global `content` if the file is still selected.
- `create file`: creates an empty file using the trimmed name at `new.file`, temporarily adds it to the file list, closes the creation modal and refreshes the list.
- `remove file <name>`: asks for confirmation, then deletes the file through `POST /project/run`. Refreshes the list and, if the deleted file was selected, navigates to the project's default file.
- `rename file <oldName> <newName>`: validates the new relative path, creates destination folders and moves the file without overwriting an existing destination through `POST /project/run`. On success, closes the rename modal, refreshes the list and updates navigation if the renamed file was selected.
- `download file`: downloads the selected file's server copy through `GET /project/<projectId>/file/<path>`, encoding the project ID and each path segment. Uses a temporary anchor with the file's basename as its download name; does not require loaded content.
- `upload * <files>`: uploads a file or folder's files through `POST /project/write`, preserving relative paths and base64-encoding detected binary content. Tracks successful uploads in `upload.done` out of `upload.total`. When all uploads finish, clears progress and refreshes the list. On full success, closes the creation modal and navigates to the file for a single-file upload; otherwise, shows a failure summary and leaves the modal open.
- `change projects|project|file|settings`: recreates CodeMirror when an editor container is present. Runs at low priority, only in the files view. Enables Vim bindings for admins, line wrapping and JavaScript/Python/Markdown modes; file editor changes call `write file` immediately, while chat editor changes update `message.body`. Calls `highlight content` after editor setup and file edits.
- `change search.content.query`: calls `highlight content`.
- `change view`: calls `highlight content` at low priority, after rendering.
- `highlight content`: highlights literal, case-insensitive matches for `search.content.query`, sets `search.content.count` and resets `search.content.current` to 0. Clears both integers when the query is empty or no text editor is active.
- `find content <backwards>`: selects, outlines and scrolls to the next/previous match, wrapping at either end. Sets the 1-based `search.content.current` without moving focus from search.

#### Chat

- `cancel message <id>`: replaces `pending 1` in the message header with `cancelled <ISO timestamp>` and `pending 0` through `POST /project/edit`. Sets `cancelling.<id>` while saving and clears it afterward. On success, rereads the selected chat; on failure, shows a snackbar. The server checks for cancellation every 100ms while an AI, shell message or run tool process is active and kills its process group when cancelled.
- `scroll chat <direction>`: scrolls the visible chat by message, up for negative values and down otherwise. Aligns a partially visible message before advancing to the adjacent one.
- `change content|file|project|view`: finds chat messages with `pending 1` in their headers and sets `pending.messages` to their `projectId/file/messageId` keys. Clears the list outside a loaded chat.
- `change pending.messages`: starts a 100ms polling interval for each new key and clears intervals for keys no longer pending. Calls `PUT /project/message`, skipping ticks while a request is in flight. Checks project/file and interval before replacing only that message in local `content`, then emits `change content`. Refreshes the file list when the updated message is no longer pending; does not write to the server or recreate the draft editor directly.
- `change content|file`: uses `match: B.changeResponder` and priority `-1001` to scroll the first `.messages` element to its `scrollHeight` after rendering.
- `create message <to> <name> <body>`: posts to `POST /project/message`, trimming the recipient and defaulting it to `all` when blank. Ignores blank messages. On success, if the same project and file are selected, clears the draft if unchanged and refreshes the file list and chat. Preserves the draft on failure.

### Client state

For performance purposes, we use two globals outside of the store:

```
content <string|Uint8Array|undefined> // Text, binary data, or undefined while loading
editor <CodeMirror instance>
```

Store:

```
cancelling <messageId> <true|undefined> // Whether a cancellation edit is being saved
edit file newName "<new name>"
          oldName "<original name>"
     project id <id>
             name "<project name>"
             slot <integer|numeric string|"null"|undefined> // "null" is the edit selector's None option
extendClient <projectId|undefined> // Project whose client extension started loading; prevents duplicate loads and triggers a page reload when leaving; cleared on logout
file actions <0|1> // Whether the filename pill shows Rename and Download; collapsed by default
     mode <edit|view>
     name "..."
files 1 mtime <integer> // Modification time in milliseconds since Unix epoch
        name "<filename>"
        size <integer> // File size in bytes
      ...
hover project <project> // The project (or free project slot) being hovered on
key command <0|1> // if set, the command key is pressed
message body <text> // Current chat draft, initially empty
        to <all|shell|ai-gpt-6|ai-opus-4.6|messageUUID> // Recipient; restored from chat when blank, defaults to all
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
project <projectId|undefined> // The current project selected
projects 1 created <date>
           id <id>
           last <date>
           name "..."
           owner <userId>
           slot <integer|undefined>
         ...
search content count <integer> // Number of text-editor matches; 0 for an empty query or no active text editor
               current <integer> // 1-based selected match; 0 when no match is selected; resets when highlighting is rebuilt
               query <text> // Shared content search input, initially empty; literal, case-insensitive text-editor search; filters message bodies, senders (own ID as "you") and destinations with smartcase (uppercase in query makes matching case-sensitive)
       file <text|undefined> // Filters filenames using String.match (input is interpreted as a regex)
       project <text|undefined> // Filters project names using String.match; undefined shows the spiral, a defined value shows the list
settings show <0|1> // Whether the settings panel is visible
snackbar message <message>
         timeout "<JS timeout to clear the snackbar>"
         type "<notification type>" // Usually ok, warning, or error
test enabled <0|1> // Whether test mode is enabled
     loginLink // Login link for testing
upload done <integer> // Successfully uploaded files; upload exists only while uploading
       total <integer> // Total files in the upload
user admin <false|true>
     count <integer>
     creator <false|true>
     creatorRequest <pending|sent|undefined> // Creator access request state
     credentials anthropic account <true|undefined>
                          apiKey <true|undefined>
                openai account <true|undefined>
                       apiKey <true|undefined>
     csrf "<CSRF token>"
     email "<email entered in the login form>"
     id <userId>
     loginLinkRequested <0|1> // Whether the login link was already sent
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
view "<view name>"
```
