# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

You already have AI. All you need now is files and a server.

## Why vibey?

So that you come alive when you work with computers.

So that your digital workspace feels as comfortable as an old shoe.

So that your digital memory is portable and reliable, now and in five years.

So that you are able to learn and build at the speed of thought.

So that you love your digital workspace and can't wait to get back to it when you're away.

So that you can finally build, plan or learn what you have been dreaming of for years.

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
5. Chat: conversate with AI, interact with humans and send commands to your project, all in the same place. AI makes tool calls also in the chat.
6. App: create and host apps that run in your project.
7. Publish: provide public access to files (text or media) and apps. Point a domain to a project.

## Running vibey yourself

```
docker compose up --build
```

To run in cloud mode:

```
cloud=1 docker compose up --build
```

To run with both email on and cloud mode on:

```
cloud=1 email=1 docker compose up --build
```

If you're meddling with the Dockerfiles and you need to bust the cache:

```
docker compose build --no-cache && cloud=1 docker compose up
```

## Dataspace

### Redis

```
email:<email> <userId>
loginLink:<link> <email>
loginLinkR:<email> <loginLink> // reverse login link
project created <date>
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

### secret.js

```
{
   backup: {
      accessKeyId:     '...',
      bucketName:      '...',
      host:            '...',
      region:          '...',
      secretAccessKey: '...'
   },
   ses: {
      accessKeyId:     '...',
      secretAccessKey: '...'
   }
}
```

### Environment variables

```
baseURL <string> // To set the base domain (defaults to `http://localhost:5353`
backup <"1"|anything else> // To enable backups to a S3-like bucket
cloud <"1"|anything else> // To enable cloud mode
email <"1"|anything else> // To enable sending emails
```

### Server config

```
admin <adminEmail>
backup accessKey <accessKey>
       bucketName <bucketName>
       enable <0|1>
       host <host>
       secretAccessKey <secretKey>
baseUrl <url>
cloud <0|1>
cookie expires <expiration in seconds>
       name <cookieName>
email enable <0|1>
      from address <email>
           name <name>
      ses accessKeyId <accessKey>
          region <region>
          secretAccessKey <secretKey>
port <portNumber>
redis db <number>
```

### API

#### Public

- **Static**: `GET /`.
- **Post error**: `POST /error`: accepts any body.

#### Auth

Except for `GET /auth/user`, all other routes will return a 404 in local mode.

- **Get user**: `GET /auth/user`: returns `{admin: true|undefined, count: <integer>, creator: <boolean>, csrf: <token>, email: <email>, mode: 'cloud'}` in cloud mode and `{mode: 'local'}` local mode.
- **Login**: `POST /auth/login`: expects `{email: <email>}`. Returns 403 if rate limited. Creates a user for that email if it doesn't exist yet. Sends a login link by email.
- **Verify login link**: `GET /auth/verify/<loginLink>`: Returns 403 if link not found. Returns the same than what `GET /auth/user` does, and sets a session cookie.
- **List sessions**: `GET /auth/list`: returns a list of sessions with `{expired: <boolean>, last: {date: <date>, ip: <ip>}}`.
- **Logout**: `POST /auth/logout`: deletes the current session and clears the cookie.
- **Delete account**: `POST /auth/delete`: deletes the user and all their resources (sessions, projects). Clears the cookie.

#### Project

- **Request creator access**: `POST /creator/request`: expects `{}`.
- **Get projects**: `GET /projects`.
- **Create project**: `POST /project`: expects `{name: <name>}`. Returns 409 if a project with that names exists.
- **Rename project**: `PUT /project`: expects `{id: <id>, name: <name>}`. Returns 404 if project is not found, 409 if another project with the new name exists.
- **Delete project**: `DELETE /project/<projectId>`

#### Admin

- **Grant/revoke creator access**: `POST /creator/grant`: expects `{email: <email>, grant: <boolean>}`. Returns 404 if `grant` is `false` and user does not exist. If `grant` is `true` and user does not exist, the endpoint creates the user.
- **Run server tests**: `GET /test`. This is a `GET` so that it can be triggered from the browser. Returns the result of running the server test suite.
- **Get client tests**: `GET /test.js`.
- **Cleanup after tests**: used to run after the client tests.

### Responders

- `navigate <targetPath>`: reads and optionally updates the hash. If the current hash doesn't match the target path, it sets the hash. If the existing hash matches the target, it calls `read hash`.
- `read hash`: if the hash is `verify/<loginLink>`, calls `verify` with the login link. Otherwise, checks that the view in the hash exists and should be reachable by the user. If on the `projects` view, sets `project`. If on the `project` view, it sets `file`.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message]`: shows a notification with type (`ok`, `warning`, `error`). Auto-clears after 4 seconds. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Puts the CSRF header in the request if the CSRF token is available. On 403 from a non-auth path, resets user state and redirects to login. Reports errors to the server.
- `report error <error>`: posts an error to the server via `POST /error`.
- `visibilitychange`: when the tab regains focus and a login link has been requested, polls `GET /auth/user` to check if the user logged in via the link. On success, sets user state, loads projects and navigates to projects.
- `load user`: fetches the user information from `GET /auth/user`. Sets `user` to the response body. If cloud and no valid session, redirects to login. Otherwise calls `read hash`.
- `login <email>`: sends a login link via `POST /auth/login`. On success, sets `user.loginLinkRequested`.
- `verify <loginLink>`: verifies the login link via `GET /auth/verify/<loginLink>`. On success, stores the user info, loads projects, and navigates to projects. On error, shows a snackbar and navigates to login.
- `logout`: logs out via `POST /auth/logout`. Resets user state and navigates to login.
- `load projects` gets all projects via `GET /projects`.

### Client state

```
file content "..." // Current file selected
     dialogMode <ai|human|terminal> // Dialog mode
     mode <edit|view> // Whether we're editing the file we're viewing or not
     name "..."
     remove // If set, when clicking on a file we show crosses to remove them.
files 1 "<filename 1>" // List of files for current project
      ...
key command <0|1> // if set, the command key is pressed
models anthropic "<model name>" context <size of context window in tokens>
                 ...
       openai "<model name> context <size of context window in tokens>
              ...
new file "<file name>" // Name for a new file
    project name "<project name>" // Enables the new project modal
            slot <integer|undefined>
    type "dialog|file" // Whether the new file is a normal file or a dialog
project "<project slug>" // The current project selected
projects 1 created <date>
           id <id>
           last <date>
           name "..."
           owner <userId>
           slot <integer|undefined>
         ...
oauth code "<pasted callback URL or code>" // Manual OAuth code input
      loading "<provider>" // Provider currently in OAuth flow (openai or claude)
      step flow <paste_code|waiting> // Whether user must paste a code or wait for auto-callback
           provider "<provider>" // Current OAuth step
snackbar color <color>
         message <message>
         timeout "<JS timeout to clear the snackbar>"
settings claude hasKey <0|1>
         claudeOAuth expired <0|1>
                     loggedIn <0|1>
         openai hasKey <0|1>
         openaiOAuth expired <0|1>
                     loggedIn <0|1>
         show <0|1> // Flips the settings panel open
         testButton <0|1>
test enabled <0|1> // Whether test mode is enabled
     loginLink // Login link for testing
user admin <false|true>
     creator <false|true>
     csrf "<CSRF token>"
     email "<email entered in the login form>"
     loginLinkRequested <0|1> // Whether the login link was already sent
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
view "<view name>"
```
