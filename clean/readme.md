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

- **Get user**: `GET /auth/user`: returns `{admin: true|undefined, count: <integer>, creator: <boolean>, csrf: <token>, email: <email>, mode: 'cloud'}` in cloud mode and `{mode: 'local'}` local mode.
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
- **Read file**: `POST /project/read`: expects `{id: <projectId>, path: <path>}`. Returns the file contents. Returns 404 if file not found.
- **Write file**: `POST /project/write`: expects `{id: <projectId>, path: <path>, content: <string>, base64: <boolean|undefined>}`. Writes content to the file. If `base64` is `true`, decodes `content` from base64 before writing. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Edit file**: `POST /project/edit`: expects `{id: <projectId>, path: <path>, oldText: <string>, newText: <string>}`. Replaces `oldText` with `newText` in the file. `oldText` must match exactly once. Returns 400 if `oldText` is absent, matches multiple times, or the edit otherwise fails. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Run command**: `POST /project/run`: expects `{id: <projectId>, command: <string>}`. Runs the command inside the project's container.
- **Remove project**: `DELETE /project/<projectId>`

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
- `read hash`: handles `verify/<loginLink>` and checks that the requested view is reachable by the user. For `files/<projectId>/<filename>`, validates the project and filename, sets `project` and `file.name`, and loads the file list if needed. Defaults to `main.md`, or the first available file. Leaving the files view clears `file` and `files`.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message]`: shows a notification with type (`ok`, `warning`, `error`). Auto-clears after 4 seconds. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Puts the CSRF header in the request if the CSRF token is available. Adds `x-test: 1` when `test` is truthy. On 403 from a non-auth path, resets user state and redirects to login. Reports errors to the server.

#### Auth

- `report error <error>`: posts an error to the server via `POST /error`.
- `load user`: if the hash contains a verification link, calls `read hash` directly. Otherwise, fetches user information from `GET /auth/user`. On success, sets `user` to the response body, loads projects and calls `read hash`. On 403, sets cloud mode and redirects to login; other errors show a snackbar.
- `login <email>`: trims and lowercases the email, then sends a login link via `POST /auth/login`. On success, sets `user.loginLinkRequested` and, when `test` is truthy, stores the returned link at `test.loginLink`.
- `verify <loginLink>`: verifies the login link via `GET /auth/verify/<loginLink>`. On success, stores the user info, loads projects, and navigates to projects. On error, shows a snackbar and navigates to login.
- `logout`: logs out via `POST /auth/logout`. Resets user state and navigates to login.

#### Projects

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
- `load projects`: gets all projects via `GET /projects`, sets them in `projects`.
- `create project`: creates a new project using the trimmed name at `new.project.name` and optional `new.project.slot` via `POST /project`. On success, clears the creation modal and project search, temporarily adds the project to `projects`, navigates to its `main.md` and reloads projects.
- `change new.project`: when `new.project` is set, focuses the new project name input field. Runs at low priority so the DOM is ready.
- `edit project`: renames and/or changes the slot of a project using the values at `edit.project` via `PUT /project`. On success, reloads projects and shows a snackbar.
- `remove project <project>`: asks for confirmation, then deletes the project via `DELETE /project/<id>`. On success, reloads projects and shows a snackbar.

#### Files

- `keydown *`: handles shortcuts while in the files view; returns without handling them during uploads. Rename submission shortcuts check for an enabled `#rename-file` button, which the current file rename modal does not provide.
  - Command+B: returns to projects.
  - Command+E: opens file creation; in the creation modal, creates when enabled. In rename, also attempts submission through `#rename-file`.
  - Enter: creates a file when the creation button is enabled, or attempts rename submission through `#rename-file`.
  - Escape: closes the creation or rename modal.
  - Command+F: in creation, selects file type.
  - Command+I: outside creation, toggles edit/view mode; in creation, selects dialog type.
  - Command+J: outside creation, selects the next file in the filtered list, wrapping at the end.
  - Command+K: outside creation, selects the previous file in the filtered list, wrapping at the beginning.
  - Command+R: in creation, opens folder upload.
  - Command+S: outside creation, focuses search.
  - Command+U: outside creation, deletes the selected file; in creation, opens file upload.
  - Command+X: closes the creation modal.
  - Command+Y: outside creation, opens rename if a file is selected and rename is not already open.
- `change files`: rereads the hash and scrolls the selected file into the center of the left pane. Runs at low priority so the DOM is ready.
- `change file.name`: reads the selected file and scrolls its entry into the center of the left pane. Runs at low priority.
- `change new.file`: focuses the new file name input when the creation modal opens. Runs at low priority.
- `change edit.file`: focuses the rename input when the rename modal opens. Runs at low priority.
- `list files`: lists project files through `POST /project/run`, excluding `.git`, and sets `files` with each file's name, size and modification time. Waits for projects to load and ignores responses for a project that is no longer selected. Then reads the selected file.
- `read file`: fetches the selected file via `POST /project/read`. Clears the global `content` while loading, then sets it to text or a `Uint8Array` according to the `x-binary` response header and emits `change file`. Ignores responses if the selected project or filename has changed.
- `write file <name> <content> [new]`: saves through `POST /project/write`. On success, updates the file's size and modification time in the list. For a new file, navigates to it; otherwise, updates the global `content` if the file is still selected.
- `create file`: creates an empty file using the trimmed name at `new.file`, temporarily adds it to the file list, closes the creation modal and refreshes the list.
- `remove file <name>`: asks for confirmation, then deletes the file through `POST /project/run`. Refreshes the list and, if the deleted file was selected, navigates to the project's default file.
- `rename file <oldName> <newName>`: validates the new relative path, creates destination folders and moves the file without overwriting an existing destination through `POST /project/run`. On success, closes the rename modal, refreshes the list and updates navigation if the renamed file was selected.
- `download file`: downloads the currently loaded content using the selected file's basename and a temporary blob URL.
- `upload * <files>`: uploads a file or folder's files through `POST /project/write`, preserving relative paths and base64-encoding detected binary content. Tracks successful uploads in `upload.done` out of `upload.total`. When all uploads finish, clears progress and refreshes the list. On full success, closes the creation modal and navigates to the file for a single-file upload; otherwise, shows a failure summary and leaves the modal open.
- `change projects|project|file|image`: manages image preview blob URLs and recreates CodeMirror when an editor container is present. Runs at low priority, only in the files view. Enables Vim bindings, line wrapping and JavaScript/Python/Markdown modes; editor changes call `write file` immediately.

### Client state

For performance purposes, we use three globals outside of the store:

```
content <string|Uint8Array|undefined> // Text, binary data, or undefined while loading
editor <CodeMirror instance>
image content <string|Uint8Array> // Content used to create the preview
      url "<blob URL>"
```

Store:

```
edit file newName "<new name>"
          oldName "<original name>"
     project id <id>
             name "<project name>"
             slot <integer|undefined>
file actions <0|1> // Whether the filename pill shows Rename and Download; collapsed by default
     mode <edit|view>
     name "..."
files 1 mtime <integer> // Modification time in milliseconds since Unix epoch
        name "<filename>"
        size <integer> // File size in bytes
      ...
hover project <project> // The project (or free project slot) being hovered on
key command <0|1> // if set, the command key is pressed
new file "<file name>" // Name for a new file
    project name "<project name>" // Enables the new project modal
            slot <integer|undefined>
    type "dialog|file" // Whether the new file is a normal file or a dialog
project <projectId|undefined> // The current project selected
projects 1 created <date>
           id <id>
           last <date>
           name "..."
           owner <userId>
           slot <integer|undefined>
         ...
search file <text|undefined> // Filters filenames using String.match (input is interpreted as a regex)
       project <text|undefined> // Filters project names using String.match; undefined shows the spiral, a defined value shows the list
snackbar message <message>
         timeout "<JS timeout to clear the snackbar>"
         type "<notification type>" // Usually ok, warning, or error
test enabled <0|1> // Whether test mode is enabled
     loginLink // Login link for testing
upload done <integer> // Successfully uploaded files; upload exists only while uploading
       total <integer> // Total files in the upload
user admin <false|true>
     creator <false|true>
     csrf "<CSRF token>"
     email "<email entered in the login form>"
     loginLinkRequested <0|1> // Whether the login link was already sent
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
view "<view name>"
```
