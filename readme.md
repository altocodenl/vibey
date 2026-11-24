# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

You already have AI. All you need now is files and a server.

## What is vibey?

1. A *place* where you can have agents, files and a server, working together. Each place is a *project*.
2. Vibey lives on the web. This has two consequences:
   A. You access it through a browser from any device with an internet connection: computer, phone, tablet.
   B. You can share your place with anyone.
3. You bring your own AI subscriptions or credentials.
4. How to use it? A fork in the road!
   A. Run it locally or in your server. Here are the [installation instructions](#installation). Vibey is fully open source.
   B. Set up a subscription to vibey cloud: 10 bucks a month, plus whatever servers you use charged at cost (25 bucks/mo total should be enough).

## How is it different from...

Claude Code/Codex:

1. Your agents are on the web and can do things on a server.
2. Markdown files are both chat and context.
3. Use different providers in the same place, even checking each other.

Replit/Lovable:

1. A project is not just an app: documents, chats.
2. You bring your own AI subscription.
3. Based on open source and open standards.

OpenClaw:

1. Already on the web.
2. Considerably more secure by default.
3. Multi-user.

Glitch/Sandstorm/Val.town:

1. Includes a full server.
2. You bring your own AI subscription.
3. Apps don't need to be ported, any code can run.

## What can I do with vibey?

1. Workflows: run processes with agents, scripts, intervals and API/email triggers.
2. Communication: interact with colleagues and agents in a shared workspace with chat and files.
3. Websites: ask an agent to create a website for you. The hosting is already included in vibey.
4. Apps: create small apps, for internal or external use.

## Installation

### Local

Requires Docker ([installation instructions here](https://docs.docker.com/engine/install)).

#1: download the latest version of vibey from the [releases page](https://github.com/altocodenl/vibey/releases).

#1 alternative: if you have git installed, you can just clone the repo:

```
git clone https://github.com/altocodenl/vibey.git
```

#2: Run it, just like that

```
docker compose up --build
```

#3: open http://localhost:5353

### Remote

You'll need:
1. A command line with rsync in your computer.
2. A Linux server that you can access through SSH, with Docker, Node and rsync installed.
3. A static IP for the server, with DNS A records for both your domain and its subdomains (`example.com` and `*.example.com`) pointing to it.
4. A reverse proxy (like Caddy or nginx) with a wildcard HTTPS certificate, forwarding to `127.0.0.1:5353` and keeping the `Host` header. (Please don't run vibey through http, it's a bad idea, especially if you set up AI credentials). This can be done for free with certbot and Let's Encrypt.
5. AWS SES credentials.

#1: in `config.4tx`, change `admin` to your email and `email from address` to an address verified in SES.

#2: change the `HOST` and `BASE_URL` variables in `deploy.sh` to that of your server and your domain, respectively.

#3: create `secret.4tx` with your AWS SES credentials:

```
email ses accessKeyId ...
          region ...
          secretAccessKey ...
```

#4: deploy with:

```
./deploy.sh prod confirm
```

#4 alternative: if you need to rebuild the containers, deploy with the command below. The script rebuilds the project image on the host; on startup, the server rebuilds it on every engine and recreates the project containers that run an outdated image.

```
./deploy.sh prod rebuild confirm
```

## How vibey does it?

0. Bring your own AI credentials. Vibey works with openai & anthropic (more to come on request).
1. Auth: a simple identity layer where you log in through login links that you get in your inbox.
2. Project: a docker container that has your files, chats and apps.
3. Engine: a virtual server on top of which you run your projects.
4. File: upload, search and see files of all kinds. Edit text files.
5. Chat: talk to AI, interact with humans and send commands to your project, all in the same place. AI makes tool calls also in the chat.
6. App: create and host apps that run in your project.
7. Publish: provide public access to files (text or media) and apps. Point a domain to a project.

### Interesting design decisions

1. The chat as a markdown file with a simple format.
2. The chat as a place that merges communication between humans, between agents, between humans and agents, and between humans/agents and computers. Also (soon), as a space for receiving/sending email.
3. A project as an unrestricted docker container.
4. Autogit + autobackup running in the background.
5. Permissions expressed as a file inside the project.
6. Projects exposed in a subdomain of the host, to achieve isolation in the browser.
7. Engines as servers that have docker installed and get calls through ssh. Project containers run with `--restart unless-stopped`, so they come back up when an engine restarts.
8. The host as a web service that is a sort of hypervisor, in that it handles all the traffic to a project, adding an auth layer.
9. Auto-login to a project if you have credentials on the host, through redirects.

## The feeling of vibey

- So that you come alive when you work with computers.
- So that your digital workspace feels as comfortable as an old shoe.
- So that your digital memory is portable and reliable, now and in five years.
- So that you are able to learn and build at the speed of thought.
- So that you love your digital workspace and can't wait to get back to it when you're away.
- So that you can finally build, plan or learn what you have been dreaming of for a while now.
- So that what you do with a computer can make the world a more meaningful place.

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
accessBy:<projectId> 1 <read|write>:<userId|email|PUBLIC|token:<secret>>
                     2 <read|write>:<userId|email|PUBLIC|token:<secret>>:<prefix>
                     3 list:PUBLIC
                     ...
accessTo:<userId|email|PUBLIC|token:<secret>> 1 <verb>:<projectId>
                                              2 <verb>:<projectId>:<prefix>
                                              3 list:<projectId> // Only in accessTo:PUBLIC
                               ...
credentials:<userId> data <JSON> // {<anthropic|openai>: {account: {access, expires, refresh, ...}, apiKey: "<key>"}}
email:<email> <userId>
engine:<engineId> created <date>
                  id <id>
                  ip <ip>
                  knownHost <known_hosts lines> // from ssh-keyscan when the engine is created
                  name <name>
                  owner <userId>
                  privateKey <OpenSSH private key> // never returned by the API
                  publicKey <OpenSSH public key>
hostEmails 1 <email> // lowercased; can create projects on the host, before or after signing up
           ...
lock:commit:<projectId> <1|undefined>
     edit:<projectId>:<path> <1|undefined>
loginLink:<link> <email>
loginLinkR:<email> <loginLink> // reverse login link
owner:<userId> 1 session-h:<sessionId>
               2 session-p:<sessionId>
               3 project:<projectId>
               4 engine:<engineId>
               5 credentials:<userId>
               ...
pkce:<userId>:<provider> <JSON>
project:<projectId> created <date>
                    id <id>
                    last <date>
                    name <name>
                    owner <userId>
rateLimit:<identifier> <number>
session-code:<code> hostSession <sessionId>
                    state <state>
                    subdomain <projectId>
                    user <userId>
session-h:<sessionId> csrf <csrfToken>
                      expires <date>
                      last <JSON> // {date: <date>, ip: <ip>}
                      user <userId>
session-p:<sessionId> csrf <csrfToken> // expires through the key's TTL
                      hostSession <sessionId>
                      project <projectId>
                      user <userId>
user:<id> count <integer>
          created <date>
          creator <1|undefined> // can create engines
          email <email>
          id <id>
          last <date>
          settings <JSON> // {pinned: [<projectId>, ...]|undefined, vi: true|false|undefined}; absent means {}
          username <username|undefined>
userCount <integer>
username:<username> <userId>
```

### vibey/access.md

This file determines who can access a project, and for what purposes.

Each line has the shape `<email|PUBLIC|token:<secret>> <read|write|list> [prefix]`, with `prefix` being optional. In the example below, Alice can read the entire project, Bob can read and write files and run commands in the `chat` folder, Eve can read and write the entire project (including `vibey/access.md`, so she can change everyone's access), and everyone (even anonymous users) can read the files in `docs`:

```
alice@example.com read
bob@example.com write chat/
eve@example.com write
PUBLIC read docs/
```

All prefixes are relative to the working directory of each project (`/project`).

Writing also enables reading. If a user can write anywhere in the project (no prefix, like Eve above), they can also run commands and calls to AI in the project.

Apps on a certain port can also be opened. Below, Alice can send GET and HEAD methods to an app at port 8000, and Bob can do the same.

```
alice@example.com read APP:8000
bob@example.com write APP:8000
```

A line without a prefix covers the whole project, apps included. A line with a file prefix never covers apps, and `APP:8000` covers only port 8000. Prefixes match literally, so `docs` also matches `docs.md` and `docs-private/`. To cover only a folder, end the prefix with `/`, as in `docs/`. Prefixes must be relative paths, without backslashes, control characters, doubled slashes or `.`/`..` segments.

`PUBLIC` lines only support `read`. By default, a public project can be read by anyone with its URL, but it doesn't show up in anyone's project list. To list it for everyone, add:

```
PUBLIC list
```

Lines starting with `project:` give other projects access to this one; see [Apps](#apps).

```
project:<projectId1> read scripts/
project:<projectId2> write
```

Lines starting with `token:` give access to any request that sends the secret in the `x-token` header. Tokens only work on project hosts and only when the request has no session. Secrets are 32 to 256 characters from `A-Z`, `a-z`, `0-9`, `_` and `-`, and are case-sensitive. Requests with a token don't need `x-csrf`, and apps never receive the `x-token` header. Request logs show `token` instead of the secret.

```
token:<secret> read docs/
token:<secret> write
```

A few things always hold, whatever the file says:

- The owner has full access.
- Anything inside `.git` requires `write` on the whole project, even to read it.
- `vibey/access.md` itself can only be read or changed by the owner and by whole-project writers, since it holds token secrets; read lines, prefixed lines and `PUBLIC` lines don't cover it.

Once the file is updated, to put the changes in effect, run this shell command in any chat of the project: `vibey access`.

### Cron

`vibey/cron.md` schedules commands inside the project's container. An optional `timezone <offset from UTC>` line (`-3`, `+5:30`) sets the timezone the selectors are written in; the container always runs in UTC and the schedule is converted to it. Every other line is `<time selector> <command>`, with the selector in double quotes when it contains spaces: a weekday (`Monday`), a day of the month (`3rd`), a time (`18:00`), an interval under a day (`5m`, `6h30m`, counted from midnight), a day plus a time or interval (`"Friday 18:00"`, `"18th 5m"`), or `start` (on container start). A day without a time runs at a fixed minute between 00:30 and 01:29, derived from the line. Each command goes through the host as a shell message, from `cron`, in `vibey/cron-YYYYMMDD.chat.md`, dated in the file's timezone; its stdout and stderr are both recorded there. If the host can't be reached or rejects the call, the container writes the failure, from `cron`, to that same chat directly. To put the changes in effect, run `vibey cron`, or press Update cron on `vibey/cron.md`; without `vibey/cron.md`, it clears the schedule. The schedule is restored whenever the project's container is recreated.

### Apps

Any TCP port listening inside a project's container is an app, served at `<port>--<subdomain>.<host>`. Usernames can't be only digits, so a leading `<digits>--` always names a port. The gatekeeper rewrites every request on an app host to `/p/<port><path>`, a public route that checks access itself; `/p/` returns 404 on every other host. App hosts use their own project session cookie, obtained through the same `/auth/project/` exchange as project hosts.

Tool calls can target another project: `tool-call: read <projectId>` (also write, edit and run; agent calls only work on the current project). The target's `vibey/access.md` must grant `project:<originId> <read|write> [prefix]`. These process grants are checked on every call. Run requires whole-project write access. Omitting the ID targets the current project. A target that isn't an existing project ID returns `Access denied`.

Shell messages can also target another project: `vibey project <projectId> <command>`. The target's `vibey/access.md` must grant `project:<originId> write`, for the whole project; otherwise, or if the target isn't an existing project ID, returns 404.

Shell messages can also start an agent in the same chat: `vibey agent <model> <body>` posts `<body>` from `shell` to `ai-<model>` and returns `{id, responseId}` with the AI response's id. An unknown model returns 400.

Syncing replaces the project's grants, removing entries no longer present. Invalid entries abort the sync. Grants for unverified recipients remain keyed by email until login verification transfers them to the user ID.

### Chat files

A `.chat.md` is a list of messages. Each one is a head and a body, both marked with the message's UUID:

```
əəə head <id>
<key> <value>
...
əəə body <id>
<body>
```

A body runs until the next `əəə head` line or the end of the file.

Head keys, one per line:

- `base64 1`: binary message; the body is base64 and goes to `all` or a message UUID. `name` gives its file name.
- `cancelled <ISO date>`: when the reply was stopped; comes with `pending 0`.
- `credential`: kind of AI credential used for the reply: `account`, `apiKey` or `test`.
- `from`: user id, `shell`, `ai-<model>`, `systemPrompt`, `main.md`, `cron` (a cron job, or its failure to reach the host) or `token` (an access token).
- `id`: the message's UUID.
- `name`: file name of a `base64` message.
- `pending 1`: the reply is still being written.
- `reply`: chat file where the outcome gets posted back.
- `session`: Codex thread id of an AI reply; the next turn resumes that thread, sending only the new part of the prompt.
- `t`: when a sent message was written.
- `t-end`, `t-start`: when a reply finished and started.
- `to`: `all`, `shell`, `ai-<model>`, or the UUID of the message it answers.
- `tokens-cache`, `tokens-in`, `tokens-out`: AI token usage.

Body lines starting with `əəə head` or `əəə body` are escaped as `> əəə`.

### API

`HEAD` requests are handled as `GET` requests; the response carries the same status and headers, without a body. The CSRF check applies only to `POST`, `PUT` and `DELETE` requests. Requests with `x-test: 1` return 403 unless `baseURL` is `http://localhost:5353`.

#### Public

- **Static**: `GET /`, `/assets/*`, `/cell.js`, `/client.js`, `/favicon.svg`, `/icon/icon-<180|192|512>.png` and `/manifest.json`.
- **Post error**: `POST /error`: accepts any body.
- **Project reads**: **Get projects**, **Get project**, **Get file** and **Read message** don't require a session; requests without one are checked against `PUBLIC` grants. Like the other public routes, they skip the CSRF check.
- **Get user on a project host**: `GET /auth/user` doesn't require a session on a project host (see **Get user**).

#### Auth

Except for `GET /auth/user` and `PUT /auth/user`, all other auth routes will return a 404 in local mode.

- **Get user**: `GET /auth/user`: returns `{admin: true|undefined, count: <integer>, creator: true|undefined, credentials: <object>, csrf: <token>, email: <email>, engines: [<engineId>, ...], id: <user id>, mode: 'cloud', settings: <object>, username: <username|undefined>}` in cloud mode and `{credentials: <object>, engines: ['host'], mode: 'local', settings: <object>, username: <username|undefined>}` in local mode. On a project host, `email` is omitted. `engines` lists the ids of the engines the user owns (the `engine:<id>` keys in `owner:<userId>`), sorted, preceded by `host` for the admin and for emails in `hostEmails`. `credentials` lists stored providers and credential types as presence flags (for example, `anthropic.account: true`), never credential values or tokens. `settings` defaults to `{}` and can only contain `pinned`, an array of project ids, and `vi`, a boolean. Without a session on a project host, returns `{anonymous: true, mode: 'cloud'}` if the project has a `PUBLIC` grant and the request carries a `__Host-<cookie name>-project-state` cookie; otherwise, sets that cookie, expiring in 10 minutes, and returns 403 with `{location: <url>}`, the **Project code** URL whose `returnUrl` is the root of the project host, with `optional=1` if the project has a `PUBLIC` grant. Clients navigate to `location` to open a project session. Without a session elsewhere, returns 403.
- **Update user**: `PUT /auth/user`: accepts `{settings: <object>|undefined, username: <string>|undefined}`, at least one of them. `settings` is an object with optional `pinned` (an array of strings, the ids of the projects pinned to the top of the projects view) and `vi` (a boolean), and replaces the settings object; omitting a key clears it (undefined), since JSON cannot represent an explicit `undefined`. `username` is lowercased and NFC-normalized, with a minimum length of 3 UTF-16 units. Allows Unicode letters, combining marks, numbers and single internal dashes; must start with a letter or number, cannot have a combining mark after a dash, and cannot be a UUID. Whitespace and mixing ASCII letters with non-ASCII characters are rejected; ASCII numbers and dashes can accompany non-ASCII names. Setting a new username releases the previous one. Returns `{settings, username}` with whichever was sent, using the normalized username. Rejects missing fields, unknown keys, invalid types and invalid usernames with 400, and a username owned by another user with 409; on any rejection nothing is changed. Available in local mode; cloud mode requires a valid session and CSRF token. This endpoint stores the settings only; it does not change editor bindings.
- **Login**: `POST /auth/login`: expects `{email: <email>}`. Returns 403 if rate limited. Creates a user for that email if it doesn't exist yet, with a username generated from the email: the local part (`hello@example.com` → `hello`), then local part plus domain without its TLD (`hello-example`), then that with `-1`, `-2`… until one is free. Candidates are lowercased, characters other than ASCII letters and digits become single dashes, and leading/trailing dashes are removed. Empty candidates become `user`; short candidates are padded with trailing ones to 3 characters (`a` → `a11`, `ab` → `ab1`). UUID candidates get `-1` appended. Sends a login link by email. With `x-test: 1`, returns `{loginLink}`.
- **Verify login link**: `GET /auth/verify/<loginLink>`: Returns 403 if link not found. Returns the same than what `GET /auth/user` does, and sets a session cookie.
- **Get project code**: `GET /auth/project/<subdomain>?returnUrl=<url>&state=<state>[&optional=1]`: `<subdomain>` must be 1–63 lowercase letters, digits or dashes, and the origin of `returnUrl` must be its project host (`<subdomain>.<host>`). Returns 400 for an invalid subdomain or `returnUrl`, or a missing `state`. Without a session, redirects to `returnUrl` if `optional` is set, otherwise to `/#/login/<this path, URI-encoded>`. Otherwise, redirects to `returnUrl` with a single-use `sessionCode` that is bound to the host session, the subdomain and `state`, and expires in 60 seconds. It doesn't check access to the project: the project session only says who the user is, and the project routes decide what they can see.
- **List sessions**: `GET /auth/list`: returns a list of sessions with `{expired: <boolean>, last: {date: <date>, ip: <ip>}}`.
- **Logout**: `POST /auth/logout`: deletes the current session and the project sessions it issued, and clears the cookie.
- **Delete account**: `POST /auth/delete`: deletes the user and all their resources (sessions, projects). Clears the cookie.

#### Project (host)

- **Request subscription**: `POST /subscription/request`: expects `{type: 'full'|'byoe'}` and emails the admin with the request. Returns 400 for any other body. In local mode, this route returns a 404.
- **Get projects**: `GET /projects`: returns owned projects and projects shared with the user, including prefix-scoped grants, plus every project with a `PUBLIC read` grant and a `PUBLIC list` line, most recently active (`last`) first. Projects listed only through `PUBLIC` have `public: true`. Projects have `read: true` when the caller is anonymous or has no write access, including prefix-scoped or `PUBLIC` grants. Each project appears once. Each project includes its owner's username as `ownerUsername`. Projects whose `<ownerUsername>--<encoded name>` is a valid subdomain (lowercased, each dash as `--`, each space as `-`) include it as `subdomain`. Without a session, returns only those listed projects.
- **Create project**: `POST /project`: expects `{name: <name>, engine: <engineId|undefined>}`. Names must contain 2–500 UTF-16 units, and must stay encodable in readable subdomains: a name can't be a UUID (in any case), contain `/` or `?`, have two spaces in a row, or have a space next to a dash; these return 400. In cloud mode, returns 403 if `engine` is absent or `host` and the user is neither the admin nor in `hostEmails`: only they can create projects on the host. Test requests (`x-test: 1`) skip this check. Returns 404 if `engine` is not owned by the user, 409 if an owned or shared project already has that name, comparing lowercased names. Stored names retain their case. Returns `{id: <projectId>, subdomain: <subdomain>|undefined}`.
- **Update project**: `PUT /project`: expects `{id: <id>, name: <name>}`. Names follow the same rules as in **Create project**; breaking them returns 400. Existing projects keep a name that breaks these rules until renamed. Returns 404 if the project is missing or not owned by the caller, 409 if another owned or shared project has the new name, comparing lowercased names. Stored names retain their case; case-only renames are allowed.
- **Delete project**: `DELETE /project/<projectId>`: requires ownership. Returns 404 if the project is missing or inaccessible, 403 if it is shared with the caller but not owned by them.

#### Engine (host)

- **Create engine**: `POST /engine`: expects `{ip: <IPv4|IPv6>, name: <name>}`. Names must contain 1–500 UTF-16 units. Returns 400 for an invalid body or IP. In cloud mode, returns 403 unless the user is the admin or has `creator` set. Generates an ed25519 key pair with `ssh-keygen` and stores both keys in the engine. Trusts the engine's host keys on first use: reads them with `ssh-keyscan` and stores them as `knownHost`, which every later ssh connection to the engine requires (`StrictHostKeyChecking=yes`). Returns 400 if the engine doesn't answer over ssh. Returns `{id: <engineId>, publicKey: <OpenSSH public key>}`; add the public key to the engine's `authorized_keys`.
- **List engines**: `GET /engines`: returns the engines owned by the user, without `privateKey`.
- **Update engine**: `PUT /engine`: expects `{id: <id>, name: <name>}`, with the same name rules as **Create engine**. Only the name can change. Returns 404 if the engine is missing or not owned by the caller.
- **Delete engine**: `DELETE /engine/<engineId>`: returns 404 if the engine is missing or not owned by the caller, 409 if any of the caller's projects run on it.

#### Project (subdomain)

Project routes (**Get project**, **Get recent projects**, **Get file**, **Write file**, **Edit file**, **Run command**, **Read message** and **Send message**) are served on the project host, `<subdomain>.<host>`, and act on that project. `<subdomain>` is either the project id or `<username>--<encoded name>`, where the name is lowercased, each dash is written as `--` and each space as `-` (so `x-y z` under `alice` is `alice--x--y-z`). An unknown subdomain resolves to no project, so its project routes return 404. On the main host, project routes return 404; on a project host, every route other than the project routes, the static routes and `GET /auth/user` returns 404.

File reads and message reads require read access to their path, which `PUBLIC` grants give to every caller. File writes, edits and messages require write access to their path. Shell commands and messages addressed to shell or AI additionally require whole-project write access. Denied access returns 404.

- **Readable redirect**: on a project id subdomain whose readable subdomain is valid (2–56 characters, starting and ending with a letter or digit), `GET /` redirects to the same URL on the readable subdomain if the caller owns the project or has any read or write grant on it, and `GET /f/<path>` redirects there after its access check.
- **Open project session**: any request on a project host with a `sessionCode` query parameter exchanges it: returns 403 if the code is missing or expired, or if its subdomain or the `__Host-<cookie name>-project-state` cookie doesn't match. Otherwise, creates a project session for that project, sets the `__Host-<cookie name>-project` cookie, clears the state cookie and redirects to the same path without `sessionCode`, with `Referrer-Policy: no-referrer`. A project session is valid only for its project and only while the host session that issued it is valid.

- **Get project**: `GET /project`: returns `{apps: [<port>], files: [{name: <relativePath>, size: <bytes>, mtime: <milliseconds since Unix epoch>}], project: {access: [<grant>]|undefined, id: <projectId>, name: <name>, ownerId: <userId>, subdomain: <subdomain>|undefined}}`. `apps` lists the container's listening TCP ports that answer HTTP, in ascending order, limited to those covered by the caller's whole-project or `APP:<port>` grants. `files` is sorted by name, excludes `.git` contents and invalid paths, and includes only files covered by the caller's read or write grants (including `PUBLIC` ones), or all valid files for the owner. It excludes `vibey/access.md` unless the caller is the owner or has a whole-project write grant. `access` is omitted for the owner; otherwise, it lists the caller's grants on the project as `<read|write>[:<prefix>]`. `subdomain` is the request's subdomain when it isn't the project id. Returns 404 if the project is missing or the caller has no read or write grant on it, and 500 if listing fails.
- **Get recent projects**: `GET /project/recent`: returns `[{id: <projectId>, name: <name>}]`: up to three projects owned by the user, other than the current one, most recently active (`last`) first. Returns 403 without a session.
- **Get file**: `GET /f/<path>`: serves a file from `/project` through `docker.read`, with its MIME type or `application/octet-stream`, except `.md` files, which are rendered to HTML with a Download link unless `?raw=1` is set. Responses carry `Cache-Control: private, no-cache`, `nosniff` and `Access-Control-Allow-Origin: *`. Browsers don't let pages read `*` responses to requests sent with cookies, so other origins, including sandboxed pages, can only read files that `PUBLIC` can read. HTML and SVG files also get `Content-Security-Policy: sandbox` with scripts, forms, modals, popups that escape the sandbox, and downloads allowed, but not `allow-same-origin`: they run on an opaque origin, so their scripts can't use the viewer's session or read the project API. `localStorage` and cookies are unavailable, and their requests to the project host, including `fetch`, go out without cookies, so in projects without a `PUBLIC` grant they get the login redirect. Uses `cicek.cache` for ETags and 304 responses. `.mp4` files are streamed with support for byte ranges, with their own CSP (`default-src 'none'; media-src 'self'`). Symlinks are followed. Returns 400 for invalid paths and 500 for other read errors. Without access, requests without a session set a `__Host-<cookie name>-project-state` cookie that expires in 10 minutes and redirect to **Project code**, with this URL as `returnUrl`; requests with a session get 404. A 404, for a denied or missing file, returns the not-found page as HTML: a question mark drawn with spinnies and a `Take me to safety` link to the projects.
- **App**: `<any method> /p/<port><path>`, reached only through an app host's rewrite: forwards the request to `http://127.0.0.1:<port><path>` inside the container through `curl`, keeping method, query, headers and body, without the project session and state cookies, `x-csrf` and `x-token`, and adding `x-forwarded-proto`. `GET` requires read access to `APP:<port>`; other methods require write access. On a project id app host whose readable app subdomain is at most 63 characters, redirects there first. Without access, `GET` requests without a session set a `__Host-<cookie name>-project-state` cookie and redirect to **Project code**, like **Get file**; other denied requests get 404. The body is forwarded byte for byte: on app hosts, cicek doesn't read or parse it, so multipart uploads, forms and binary bodies arrive unchanged. Returns 502 when nothing listens on the port or the request fails. Responses are buffered and passed through without `Connection`, `Keep-Alive` and `Transfer-Encoding`.
- **Write file**: `POST /project/write`: expects `{path: <path>, content: <string>}` or a multipart field `path` and a single file in the `file` field. Writes content to the file. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Edit file**: `POST /project/edit`: expects `{path: <path>, oldText: <string>, newText: <string>}`. Replaces `oldText` with `newText` in the file. `oldText` must match exactly once, except for the reserved value `'[EOF]'`, which appends `newText` to the end of the file. Returns 400 if `oldText` is absent, matches multiple times, or the edit otherwise fails. If operation concludes with a non-zero code, returns 400 instead of 200.
- **Run command**: `POST /project/run`: expects `{command: <string>, read: <boolean|undefined>}`. Runs the command inside the project's container. Requires whole-project write access even when `read` is true. The `read` flag only prevents updating the project's `last` timestamp and committing. The special commands `vibey access` and `vibey cron` sync sharing grants and the cron schedule. Returns 200 with the command's `code`, `stdout` and `stderr`, even if it fails.
- **Send message**: `POST /project/message`: expects `{file: <fileName>, base64: <boolean|undefined>, name: <fileName|undefined>, body: <text|base64>, from: <sender|undefined>, reply: <fileName|undefined>, to: <all|shell|ai-<model>|messageUUID>}`. The sender is `from` when given, taken at face value, otherwise the user ID. `reply` requires `from` and adds a `reply <fileName>` line; when the AI run for that message finishes, the result goes back to `reply`: in the same chat, `All agents finished.` is posted from `shell` to `from` once no other run started by `from` with `reply` is pending; in another chat, the final message is posted from the AI to `from`. `from` and `reply` must be single lines. Appends a message with server-generated UUID, timestamp and sender, creating the file and parent folders if needed. Rejects complete header/body marker lines in `body`. With `base64`, `body` must be valid base64, `to` must be `all` or a message UUID (files go to people, not to the shell or AI), and the head gets a `base64 1` line; `name` (only allowed with `base64`, no slashes or newlines) adds a `name <fileName>` line. Absent headers are omitted, not left as blank lines. AI messages require the provider's account or API key credentials (API key only for models that require one); otherwise, returns 400. Expired account tokens are refreshed first; if refreshing fails, the error is appended as the response. Before each AI run, the system prompt (once per chat) and `main.md` (when changed since its last copy) are appended to the chat. When building AI prompts, the body of each `base64 1` message is replaced with `[BASE64 FILE: N BYTES OMITTED]`, and other bodies over 10000 characters keep only their first and last 5000. AI responses carry `credential <account|apiKey>` and `tokens-in`, `tokens-cache` and `tokens-out` head lines. An AI run stops after 50 responses. With `x-test: 1`, the AI is replaced by a fake that outputs `word0` to `word999`; if the message body starts with a `fake-output:` line, the first response is the rest of the body instead, so tests can script tool calls. Returns `{id: <messageUUID>, responseId: <messageUUID>}` for shell and AI messages, otherwise `{id: <messageUUID>}`; 400 if validation or persistence fails. During AI runs, each response or tool message is appended before the previous one is marked finished, so a pending chain never appears finished between steps.
- **Read message**: `GET /project/message/<messageUUID>/<path>`: returns `{message: <text>, next: [<messageUUID>, ...]}`: the message including its head and body markers, and the ids of the messages after it, in file order. Clients use `next` to append new messages without rereading the whole file. Returns 404 if access is denied, the file is missing, or the message is not found, and 500 for other read errors.

#### Credentials

- **Start PKCE**: `POST /credentials/:provider/start`: starts the OAuth PKCE flow for `:provider` (`anthropic` or `openai`). Returns a URL to open in the browser.
- **Complete PKCE**: `POST /credentials/:provider/complete`: expects `{code: <string>}`. Exchanges the authorization code for tokens and stores the account credential.
- **Add API key**: `POST /credentials/:provider/apiKey`: expects `{key: <string>}`. Stores the API key for the provider.
- **Remove credential**: `DELETE /credentials/:provider/:name`: removes a single credential type (`:name` is `account` or `apiKey`) for the given provider.

#### Admin

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
- `visibilitychange`: when the tab regains focus and a login link has been requested, polls `GET /auth/user` to check if the user logged in via the link. On success, opens `returnTo` if set; otherwise sets user state, loads projects, navigates to projects and shows a welcome snackbar.
- `window.onerror`: reports client errors to the server via `report error`. Ignores ResizeObserver errors.

#### General

- `keydown *`: tracks the Command key and handles the global test shortcut:
  - Command+Shift+L: calls `test all` if the logged in user is admin (matches Command plus uppercase `L`).
  - Meta: sets `key.command` to true, showing keyboard shortcut tooltips.
  - Command+1–3: in the files view, opens the recent file in that position of `recent.files`.
  - Command+9: opens settings when logged in; in settings, Command+9 and Command+B call `go back`.
- `keyup|blur *`: clears `key.command` when Meta is released or the window loses focus. On blur, if `file.full` is set and focus left the page (not just moved into an embedded frame), sets `file.full` to false, which also exits browser full screen.
- `test *`: sets `test` to `{enabled: true}`. Loads the client side test suite (`test.js`) only if the logged in user is admin.
- `navigate <targetPath>`: reads and optionally updates the hash. On a project host, `projects` and `settings` open the main host. Code navigates to projects as `files/<projectId>[/<filename>]`, which loads the project's subdomain of the main host (from the loaded `projects`, or the project id), at `#/f[/<filename>]`, from either host. If the current hash doesn't match the target path, it sets the hash. If the existing hash matches the target, it calls `read hash`.
- `go back`: calls `history.back ()` if there is a referrer, otherwise navigates to projects.
- `read hash`: handles `verify/<loginLink>` and checks that the requested view is reachable by the user. On a project host (when the page's host differs from its `base-host` meta tag), the only view is `files`, at `f/<filename>`, and other hashes navigate to `f`; on the main host, `f` hashes navigate to `projects`. `login/<path>`, with a path under `/auth/project/`, opens the path if logged in; otherwise stores it at `returnTo` and navigates to login. Anonymous users navigating to `settings` go to login. In the files view, sets `project.id` to the subdomain and `file.name` to the filename, and calls `read project` if `files` isn't loaded. Defaults to `main.md`, or the first available file; a filename that isn't in the loaded file list navigates to the default. In the settings view, calls `read engines`.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message] [keep]`: shows a notification with type (`ok`, `warning`, `error`, or `yellow`, which shows spinnies). Auto-clears after 4 seconds unless `keep` is set. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Puts the CSRF header in `post`, `put` and `delete` requests if the CSRF token is available. Adds `x-test: 1` when `test` is truthy. On 403 from a non-auth path, resets user state and redirects to login. Reports errors to the server.

#### Auth

- `report error <error>`: posts an error to the server via `POST /error`.
- `read user`: if the hash contains a verification link, calls `read hash` directly. Otherwise, fetches user information from `GET /auth/user`. On 403 with a `location`, navigates to it, keeping the hash, to open a project session; other non-403 errors show a snackbar. Otherwise, sets `user` to the response body, or to `{anonymous: true, mode: 'cloud'}` on 403, calls `read projects` on the main host and calls `read hash`.
- `login <email>`: trims and lowercases the email, then sends a login link via `POST /auth/login`. On success, sets `user.loginLinkRequested` and, when `test` is truthy, stores the returned link at `test.loginLink`.
- `keydown *`: in the login view, Enter calls `login` when the `#login` button is enabled.
- `verify <loginLink>`: verifies the login link via `GET /auth/verify/<loginLink>`. On success, opens `returnTo` if set; otherwise stores the user info, loads projects, navigates to projects and shows a welcome snackbar. On error, shows a snackbar and navigates to login.
- `logout`: logs out via `POST /auth/logout`. Resets user state to anonymous and navigates to login.
- `update user <body>`: sends `body` (`{settings: <object>}` and/or `{username: <string>}`) through `PUT /auth/user`. On success, sets each key of the response under `user` (e.g. `user.settings`, `user.username`), showing an `ok` snackbar (`Username changed to <username>`) when the username differs from the current one; on failure, keeps the current values and shows the server's error (such as an invalid or taken username) in a snackbar, or `Could not update user`. When `body` includes `username`, clears `edit.username` on success. At the top of the settings view, the pencil button next to the username opens an inline form that calls it with `{username}` on submit; the `vi mode` checkbox below the engines calls it with the complete settings object as `{settings}`.
- `change user.settings`: updates the current editor's key map without recreating it. Uses Vim bindings when `user.settings.vi` is true and not on mobile, otherwise default bindings.

#### Credentials

- `start pkce <provider>`: opens the provider's login page in a new tab and sets `pkce.account.provider` to receive the code.
- `complete pkce <provider> <code>`: exchanges the authorization code for tokens via `POST /credentials/:provider/complete`. On success, clears `pkce` and reloads user.
- `save apiKey <provider> <key>`: saves the API key via `POST /credentials/:provider/apiKey`. On success, clears `pkce` and reloads user.
- `remove credential <provider> <name>`: asks for confirmation, then removes the credential via `DELETE /credentials/:provider/:name`. On success, reloads user.

#### Engines

- `read engines`: gets the user's engines via `GET /engines`, sorted by name, and sets them in `engines`.
- `create engine`: creates an engine using the trimmed values at `new.engine.name` and `new.engine.ip` via `POST /engine`. Shows a snackbar while the server reaches the engine. On success, clears `new.engine`, reloads engines and reloads user, so that `user.engines` includes the new engine; on failure, shows the server's error (such as an unreachable engine) in a snackbar.
- `edit engine <id> <name>`: ignores blank names, otherwise renames the engine via `PUT /engine`. On success, shows a snackbar and reloads engines.
- `delete engine <id> <name>`: asks for confirmation, then deletes the engine via `DELETE /engine/<id>`. On success, reloads engines and user; on failure, shows the server's error (such as projects still running on the engine) in a snackbar.

#### Projects

- `request subscription <full|byoe>`: requests a subscription via `POST /subscription/request` with `{type}`. Ignores requests outside cloud mode or when `user.subscriptionRequest` is already set. Sets `user.subscriptionRequest` to `pending` while sending and `sent` on success, showing a snackbar confirming admin review. On error, clears the request state to allow retrying and shows an error snackbar.
- `keydown *`: handles shortcuts while in the projects view:
  - Command+1–5: opens the nth project shown (see `views.projectList`).
  - Command+D: in the creation modal, generates a random name.
  - Command+E: when logged in, calls `start project`; in the creation modal, creates the project when the button is enabled.
  - Enter: creates the project when the creation button is enabled, or renames it when `#rename-project` is enabled.
  - Escape: closes the creation and subscription modals.
  - Command+S: focuses search.
- `read clientExtension`: runs only for projects the user owns, so shared and public projects' code never runs in another user's session. Otherwise checks the loaded file list for root-level `extend-client.js`. If present and the files view is still showing, sets `extendClient`, reads the script via `GET /f/extend-client.js`, and evaluates it in global scope with access to `B`, `views`, etc. Skips loading when `extendClient` is already set and ignores responses if the marker is cleared or the view has changed. Loading and evaluation errors show a snackbar. Only use trusted project code: extensions run with full app privileges. Refresh the page to activate extension changes. Logout clears the marker but does not undo already-running extension code.
- `read projects`: gets all projects via `GET /projects`, sets them in `projects`. If `user.settings.pinned` has ids that are not in the list, removes them through `update user`.
- `create project`: creates a new project using the trimmed name at `new.project.name` and the engine at `new.project.engine` via `POST /project`. Shows a snackbar while creating. On success, clears the creation modal and project search, and opens `#/f/main.md` on the project's subdomain.
- `change new.project`: when `new.project` is set, focuses the new project name input field. Runs at low priority so the DOM is ready.
- `start project`: opens the creation modal (sets `new.project` to `{engine: <first of user.engines>}`) when `user.engines` is non-empty: in local mode, for the admin, for users in `hostEmails` and for users who own an engine. The modal shows an engine picker when there is more than one engine, labeled with engine names from `engines` (`host` and engines not yet loaded show their id), and calls `read engines` to load them; otherwise sets `show.subscribe`, which opens the subscription modal.
- `pin project <id>`: adds the id to `user.settings.pinned`, or removes it if present, through `update user`.
- `edit project`: renames a project using the values at `edit.project` via `PUT /project`. On success, reloads projects and shows a snackbar.
- `remove project <project>`: asks for confirmation, then deletes the project via `DELETE /project/<id>`. On success, reloads projects and shows a snackbar.
- `download project <project>`: zips `/project` through `POST /project/run` with `read: true` and downloads it as `vibey-backup-<timestamp>-<name>.zip`. Shows a `yellow` snackbar while preparing.

#### Files

- `keydown *`: handles shortcuts while in the files view; returns without handling them during uploads.
  - Command+B: on mobile, from the right pane, shows the left pane; otherwise returns to projects.
  - Command+D: when the chat recipient input is present, focuses it and selects its text.
  - In the chat recipient input: Escape blurs it, Enter picks the only or exactly matching option, and ArrowUp/ArrowDown move through the options.
  - Command+Enter: when the chat editor is present, calls `create message` with the current recipient, filename and draft body (the same action as Boom).
  - Command+E: opens file creation; in the creation modal, creates when enabled.
  - Enter: creates a file when the creation button is enabled, or renames the file when `#edit-file` is enabled.
  - Escape: closes the creation or rename modal; exits full screen when the editor doesn't have focus.
  - Command+F: in creation, selects file type.
  - Command+I: outside creation, scrolls down by chat message when the chat is visible, otherwise toggles edit/view mode; in creation, selects chat type.
  - Command+O: outside creation, scrolls up by chat message when the chat is visible.
  - Command+M: outside creation, focuses the chat editor when present.
  - Command+J: outside creation, selects the next file shown in the left pane (matching the search, or inside expanded folders when not searching), wrapping at the end.
  - Command+K: outside creation, selects the previous file shown in the left pane, wrapping at the beginning. Both do nothing when the filter matches no files. On mobile, swiping left or right on the right pane dispatches them.
  - Command+R: in creation, opens folder upload.
  - Command+S: outside creation, focuses search.
  - Command+/: toggles content search in chat and text editors; opening focuses and selects the input.
  - Enter/Shift+Enter in text search: selects the next/previous match, wrapping around.
  - Escape in text search: clears the query and highlights, and returns focus to the editor at its cursor.
  - Command+U: outside creation, deletes the selected file; in creation, opens file upload.
  - Command+X: closes the creation modal.
  - Command+Y: outside creation, opens rename if a file is selected and rename is not already open.
  - Command+\: toggles full screen on the right pane (`file.full`).
- `change files`: rereads the hash and scrolls the selected file into the center of the left pane. Runs at low priority so the DOM is ready.
- `change file.name`: reads the selected file and scrolls its entry into the center of the left pane. Runs at low priority.
- `change new.file`: focuses the new file name input when the creation modal opens. Runs at low priority.
- `change edit.file`: focuses the rename input when the rename modal opens. Runs at low priority.
- `change show.pane`: on mobile, after rendering, scrolls the window and the shown pane to the top.
- `read project <noRead>`: sets `files` to `[]` if unset, to avoid concurrent calls. Lists readable project files through `GET /project`, excluding `.git`, and sets `files` with each file's name, size and modification time, plus `apps`, `project.name`, `project.ownerId` and `project.read` (set unless the caller owns the project or has a write grant). After a successful listing, also runs `du -sk /project` through `POST /project/run` with `read: true`, converting KiB to bytes in `project.size.bytes`. This measures disk usage including `.git`; `views.inner` displays it as a `size: <size>` pill beside the project title, using the same `size()` formatter as file sizes. The same command then estimates what `clear history` would free: it commits the worktree into a temporary repository (via `GIT_DIR`/`GIT_WORK_TREE`, leaving `/project/.git` untouched), runs `git gc` on it, and prints the difference between both `.git` sizes in bytes, stored (floored at 0) in `project.size.history`. When nonzero, `views.inner` shows a `clear history (<size>)` pill after the project size. Failed or denied size requests are silently ignored; command execution requires whole-project write access, and it is skipped when `project.read` is set. Then calls `read clientExtension` and `read recentProjects` and, unless `noRead` is set, reads the selected file.
- `read recentProjects`: gets up to three other projects through `GET /project/recent` and sets them in `recent.projects`. They appear above the project title as boxes with the project's color and the initials of its first three words, which navigate to `files/<projectId>`; empty slots are shown as dashed boxes. Errors are ignored.
- `read file`: unless the file is an app, stores it in `recent.files` with the current time, keeping at most three files and replacing the one opened longest ago. The three appear as buttons above the file list, colored by filename, showing the file's icon and its name without extension (stems over 24 characters are shortened with `…` in the middle) on up to two lines; files other than the current one are dimmed, and empty slots are dashed. Then clears the global `content` and emits `change file`. If `fileEdits` contains pending edits for this file, returns without fetching potentially stale server content; the edit queue resumes the read when that file's edits finish, provided it is still selected and `content` is undefined. For apps, images (`avif`, `bmp`, `gif`, `jpg`, `jpeg`, `png`, `webp`), PDFs and `mp4` videos (case-insensitive), returns without fetching content; the view loads them directly through `GET /f/<path>`. Images show a snackbar on load failure; PDFs provide a download fallback. For other files, fetches through the same GET endpoint with `?raw=1` as bytes, decodes them as text only if they contain no null bytes and are valid UTF-8, otherwise retains a `Uint8Array`, and emits `change file`. For text chats, if the recipient is blank, restores the latest human message's recipient when it is `shell` or an `ai-<model>` the user has credentials for, otherwise uses `all`, and scrolls to the bottom. Ignores responses if the selected filename has changed. Clears `sqlite` on every read; if the bytes start with the SQLite header, sets `sqlite` to `{name, page: 0}` and calls `query sqlite`.
- `query sqlite`: loads sql.js from `assets/sql.js/dist/` on first use, opens global `content` as a database, reads the tables and either runs `sqlite.query` and keeps its last result set, or reads up to 100 rows of `sqlite.table` (default: the first) at `sqlite.page`, closes the database and replaces `sqlite` with the result. Blobs become `[BLOB <n> bytes]`. Ignores the result if `sqlite.name` changed while sql.js loaded.
- `edit file <name> <newContent>`: compares global `content` with the full editor text using an internal chunking function. Splits into lines while preserving line endings, uses `B.diff` to group contiguous additions/deletions, and expands each chunk with unchanged lines above/below until its `oldText` is unique. Each chunk's context accounts for preceding chunks. A shared sentinel works around gotoB dropping leading additions during backtracking; remove it once gotoB uses `x > 0 || D > 0` instead of `x > 0`. A diff timeout shows a snackbar without enqueueing edits. Appends chunks with the captured filename to `fileEdits` and immediately advances `content` to the editor text. An initially empty queue starts a recursive, callback-driven drain, keeping the in-flight entry at the head and sending one request at a time through `POST /project/edit`; no timers or separate saving flag. Empty originals and originals exactly `[EOF]` use unconditional `POST /project/write` entries instead. The queue survives file navigation. On failure, logs the error and removes all queued edits for the failed file, retaining other files' edits. If that document is still selected and loaded in the file editor, a native confirmation offers overwriting with its current editor text or discarding edits and loading the server version. Otherwise, shows an error snackbar and rereads the failed file only if it is still selected. Successful requests remove the head and continue draining; deferred reads resume when their file has no remaining edits.
- `write file <name> <content> [new]`: saves through `POST /project/write`. On success, updates the file's size and modification time in the list. For a new file, navigates to it and refreshes the list after the write succeeds; otherwise, updates the global `content` if the file is still selected.
- `create file`: creates an empty file from the trimmed name at `new.file`, adding `.md` when it has no extension, or `.chat.md` (unless already present) when `new.type` is `chat`. Temporarily adds it to the file list, closes the creation modal and, on mobile, shows the right pane. The successful write triggers the list refresh. The modal checks for a name conflict against this same final path, so creating never overwrites an existing file or chat.
- `clear history`: asks for confirmation, then replaces the project's git history with a single commit through `POST /project/run` with `read: true`: deletes `/project/.git`, reinitializes it on `main` with the `vibey` user, commits all files as `Fresh start` and runs `git gc`. Files are unchanged; past versions, and when they were made, are gone for everyone with access. On success, subtracts `project.size.history` from `project.size.bytes` and clears `project.size.history` (hiding the pill), and shows a snackbar.
- `remove file <name>`: asks for confirmation, then deletes the file through `POST /project/run`. Refreshes the list and, if the deleted file was selected, navigates to the project's default file.
- `rename file <oldName> <newName>`: validates the new relative path, creates destination folders and moves the file without overwriting an existing destination through `POST /project/run`. Removes the old folder if left empty. On success, closes the rename modal, temporarily adds the new name to `files`, refreshes the list and updates navigation if the renamed file was selected.
- `download file`: downloads the selected file's server copy through `GET /f/<path>`, with the path URI-encoded. Uses a temporary anchor with the file's basename as its download name; does not require loaded content.
- `upload file|folder <files> [options]`: uploads a file or folder's files through `POST /project/write`, preserving relative paths and sending file content as multipart without base64 encoding. `options.prefix` writes each file as prefix + file name instead; `options.cb` is called with the written names by index (undefined for failures) instead of refreshing the list and navigating. Tracks successful uploads in `upload.done` out of `upload.total`. When all uploads finish, clears progress and refreshes the list. On full success, closes the creation modal and navigates to the file for a single-file upload; otherwise, shows a failure summary and leaves the modal open.
- `change project|file`: recreates CodeMirror when an editor container is present. Runs at low priority, only in the files view; ignores `project.size`. Enables Vim bindings when `user.settings.vi` is true and not on mobile, line wrapping and JavaScript/Python/Markdown modes; file editors show line numbers, restore the cursor and scroll position stored at `editor.position.<project>.<file>` (opening at the top when there is none) and store them silently on every cursor move and scroll; the chat editor places the cursor at the end of the draft. File editors are read-only while `content` is undefined or `project.read` is set, the chat editor disables `Cmd-D`, and loaded file editor changes call `edit file` with the filename and full editor text, while chat editor changes update `message.body`. Calls `highlight content` after editor setup and file edits.
- `change search.content.query`: calls `highlight content`; when search opens in the files view, focuses and selects the input after rendering.
- `change view`: calls `highlight content` at low priority, after rendering.
- `change file.full`: enters browser full screen on `document.documentElement` when `file.full` is set, and exits it when unset. Also matches changes to `file` as a whole, so leaving the files view exits full screen. Does nothing if the browser is already in the matching state. Browsers only allow entering full screen from a click or key press; B.call runs synchronously inside those handlers, so the icon and Command+\ qualify. A refused request is ignored and only the in-page layout changes. With `user.settings.vi`, locks Escape through `navigator.keyboard.lock` while in full screen.
- `highlight content`: highlights literal, case-insensitive matches for `search.content.query`, sets `search.content.count` and resets `search.content.current` to 0. Clears both integers when the query is empty or no text editor is active.
- `find content <backwards>`: selects, outlines and scrolls to the next/previous match, wrapping at either end. Sets the 1-based `search.content.current` without moving focus from search.

#### Chat

- `cancel message <id>`: replaces `pending 1` in the message header with `cancelled <ISO timestamp>` and `pending 0` through `POST /project/edit`. Sets `message.cancelling.<id>` while saving and clears it afterward. On success, rereads the selected chat; on failure, shows a snackbar. The server checks for cancellation every 100ms while an AI, shell message or run tool process is active and kills its process group when cancelled.
- `scroll chat <direction>`: scrolls the visible chat by message, up for negative values and down otherwise. Aligns a partially visible message before advancing to the adjacent one.
- `scroll message <id>`: smoothly scrolls the message with that lowercased UUID to the top of the chat, if it is rendered.
- `change content|file|view`: finds chat messages with `pending 1` in their headers and sets `pending.messages` to their `file/messageId` keys. Clears the list outside a loaded chat.
- `change pending.messages`: starts a 100ms polling interval for each new key and clears intervals for keys no longer pending. Calls `GET /project/message/<messageId>/<file>`, skipping ticks while a request or its follow-up appends are in flight. Checks file and interval before replacing only that message in local `content`, then emits `change content`. Fetches each id in `next` that is not yet in `content` through the same endpoint and appends it in order, so new pending messages start their own polling. When the updated message is no longer pending, refreshes the file list without rereading the chat (`read project` with `noRead`); does not write to the server or recreate the draft editor directly. When no message is pending in the open chat, polls the chat every two seconds for updates: it rereads the last message and appends any ids in `next`, or rereads the whole chat through `GET /f/<path>?raw=1` when it has no messages yet.
- `change content|file` (priority `1001`): before views redraw, stores in `message.atBottom` (via `mset`, without a change event) whether the first `.messages` element is within 50px of its bottom. Measuring before rendering keeps large appends, such as tool-call messages, from breaking the stick-to-bottom behaviour.
- `change content|file` (priority `-1001`): after rendering, scrolls the first `.messages` element to its `scrollHeight` if `message.atBottom` is set.
- `create message <to> <name> <body>`: posts to `POST /project/message`, trimming the recipient and defaulting it to `all` when blank. Ignores blank messages and files other than the selected one. On mobile, reads the body from the chat editor to include text still being composed. Shows a warning snackbar instead of posting to an AI model without credentials. On success, if the same project and file are selected, clears the draft if unchanged and refreshes the file list and chat. Preserves the draft on failure.
- `download message <id>`: downloads the file in a `base64 1` message of the loaded chat, triggered by the Save button under the message number. Decodes the single-line body into a Blob and downloads it through a temporary anchor named after the message's `name` header (`file` if absent). Ignores messages without the `base64 1` header.
- `upload message <files>`: sends files picked with the paperclip button next to Boom to the selected chat. Writes them through `upload file` with the prefix `<chat>-` (e.g. `chat/party.md-X.png`, overwriting any existing file), then posts one message per uploaded file, in the order picked and each after the previous one: a markdown link to the file (`[X.png](<chat/party.md-X.png>)`), which the chat renders inline. Messages go to the recipient if it is a message UUID, otherwise to `all`, so the shell or AI don't get one run per file. A failed post stops the remaining ones with a snackbar. Then refreshes the file list and rereads the chat if it is still selected.
- `update vibey <access|cron>`: posts `vibey access` to `shell` in `vibey/access.chat.md`, or `vibey cron` in `vibey/cron-YYYYMMDD.chat.md` (dated in the timezone of `vibey/cron.md`), through `POST /project/message`, triggered by the Update access and Update cron buttons at the top right of `vibey/access.md` and `vibey/cron.md` (shown without `project.read`). On success, refreshes the file list and opens the chat; on failure, shows a snackbar.

### Client state

For performance purposes, we use two globals outside of the store:

```
content <string|Uint8Array|undefined> // Text, binary data (or undefined while loading/waiting for pending edits)
editor <CodeMirror instance>
```

#### Store

```
apps <array of ports> // Listening ports the caller can access, shown as `APP:<port>` entries above the files
edit engine <engineId>
     file newName "<new name>"
          oldName "<original name>"
     project id <id>
             name "<project name>"
     username <true|undefined>
editor position <project name> <filename> ch <integer>
                                          left <integer> // Horizontal scroll in pixels
                                          line <integer>
                                          top <integer> // Vertical scroll in pixels
engines 1 created <date>
          id <engineId>
          ip <IP>
          knownHost <known_hosts lines>
          name "<engine name>"
          owner <userId>
          publicKey <OpenSSH public key>
        ...
extendClient <true|undefined>
file actions <false|true>
     full <false|true>
     mode <edit|view>
     name "..." // `APP:<port>` when an app is open
fileEdits 1 content <string|undefined> // Overwrite the entire file with this, fallback to newText/oldText
            file <filename>
            newText <string|undefined>
            oldText <string|undefined>
          ...
files 1 mtime <integer> // Modification time in milliseconds since Unix epoch
        name "<filename>"
        size <integer> // File size in bytes
      ...
key command <true|undefined>
message atBottom <false|true>
        body <text|undefined>
        cancelling <messageId> <true|undefined>
        to <all|shell|ai|ai-<model>|messageUUID>
mobile <true|undefined>
new engine ip "<IP>"
           name "<engine name>"
    file "<file name>"
    project engine "<engineId>" // Defaults to the first of `user.engines`
            name "<project name>"
    type "chat|file"
pkce account confirm <provider|undefined>
             loading <provider|undefined>
             provider <provider|undefined>
     apiKey <provider|undefined>
     code "<string>"
pending messages <array of "file/messageId">
        idle <timeout ID|undefined> // Checks for new messages while nothing is pending
        requests <map of "file/messageId" to interval ID>
project id <subdomain|undefined>
        name "<project name>"
        ownerId <userId>
        read <true|undefined>
        size bytes <integer>
             history <integer> // Bytes that `clear history` would free
projects 1 created <date>
           id <id>
           last <date>
           name "..."
           owner <userId>
           ownerUsername <username|undefined>
           public <true|undefined> // Listed only because it has `PUBLIC read` and `PUBLIC list` grants; hidden from logged-in users' projects view unless `show.public` is set, and never runs its client extension
           subdomain <subdomain|undefined>
         ...
recent files <filename> <ISO date> // Up to three recently opened files, excluding apps
       projects <array of {id, name}> // Up to three other owned projects, most recently active first
returnTo "</auth/project/... path>" // Set from `#/login/<path>`; opened instead of the projects view once the user logs in
search content count <integer>
               current <integer>
               query <text|undefined>
       file <text|undefined>
       project <text|undefined>
show chats <true|undefined> // Set by the chat button next to the file actions; the file list shows only `.chat.md` files and hides apps
     public <true|undefined> // Shows public projects to logged-in users in the projects view; set by the Show public switch, which logged-out users see on and can't change
     files <prefix> <true|false|undefined> // Folder prefix ending in `/`, such as `a/b/`; undefined means expanded only if it contains the current file
     message <filename> <messageId> <true|undefined>
     pane <left|right|undefined>
     projectDetails <true|undefined>
     subscribe <true|undefined> // Subscription modal, opened by `start project` for users who can't create projects
snackbar message <message>
         timeout "<JS timeout to clear the snackbar>"
         type "<ok|warning|error>"
sqlite name <filename> // Set while an SQLite file is open
       page <integer> // 0-based, 100 rows per page
       query <string|undefined>
       pages <integer>
       tables <array of table and view names|undefined> // undefined while loading
       table <name>
       count <integer>
       columns <array of names>
       rows <array of arrays>
       error <message|undefined>
swipe x <integer|undefined>
      y <integer|undefined>
test enabled <true|undefined>
     loginLink
upload done <integer>
       total <integer>
user admin <true|undefined>
     anonymous <true|undefined>
     subscriptionRequest <pending|sent|undefined>
     credentials anthropic account <true|undefined>
                           apiKey <true|undefined>
                 openai account <true|undefined>
                        apiKey <true|undefined>
     csrf "<CSRF token>"
     email "<email>" // Entered in the login form; set from the server once logged in
     engines <array of engineIds> // `host` first for the admin, for users in `hostEmails` and in local mode
     id <userId>
     loginLinkRequested <true|undefined>
     mode <local|cloud>
     settings pinned <array of projectIds|undefined>
              vi <boolean|undefined>
     username "<username>"
view <login|verify|projects|files|settings> // `projects` renders `views.outer`, `files` renders `views.inner`
```

## License

Vibey is written by [Altocode](https://altocode.nl) and released into the public domain.
