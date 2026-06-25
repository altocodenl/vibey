# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

You already have AI. All you need now is files and a server.

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
invite:<email> created <date>
               email <email>
owner:<userId> session:<sessionId>
               ...
otp:<userId> <otp>
rateLimit:<identifier> <number>
session:<session> csrf <csrfToken>
                  expires <date>
                  last date <date>
                       ip <ip>
                  user <userId>
user:<id> created <date>
          email <email>
          id <id>
          invite <date>
          last <date>
```

### secret.js

```
{
   ses: {
      accessKeyId: '...',
      secretAccessKey: '...+d9PrIV/Z4Jes',
   }
}
```

### Environment variables

```
cloud <"1"|anything else> // To enable cloud mode
email <"1"|anything else> // To enable sending emails
```

### Server config

```
admin <adminEmail>
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

- **Get CSRF token**: `GET /auth/csrf`: returns `{csrf: <token>}` in cloud mode and `{mode: 'local'}` otherwise.
- **Request invite*: `POST /auth/signup/request`: expects `{email: <email>}`. Returns 409 if the invite or user exists. 200 if successful.

- **Login**: `POST /auth/login`: expects `{email: <email>}`. Returns 403 if rate limited or email not found. Sends a 6-digit OTP by email. 200 if successful.
- **Verify OTP**: `POST /auth/verify`: expects `{email: <email>, otp: <otp>}`. Returns 403 if rate limited, email not found, or OTP invalid. Returns `{csrf: <token>}` with a session cookie. 200 if successful.
- **List sessions**: `GET /auth/list`: returns a list of sessions with `{expired: <boolean>, last: {date: <date>, ip: <ip>}}`.
- **Logout**: `POST /auth/logout`: deletes the current session and clears the cookie. 200 if successful.
- **Delete account**: `POST /auth/delete`: deletes the user and all their sessions. Clears the cookie. 200 if successful.

#### Admin

- **Accept invite**: `POST /auth/signup/accept`: expects `{email: <email>}`. Returns 404 if invite not found, 409 if user exists. 200 if successful.

### Responders

- `navigate <targetPath>`: reads and optionally updates the hash. If the current hash doesn't match the target path, it sets the hash. If the existing hash matches the target, it calls `read hash`.
- `read hash`: checks that the view in the hash exists and should be reachable by the user. If on the `projects` view, sets `project`. If on the `project` view, it sets `file`.
- `stop propagation`: a helper to stop the bubbling up of an event (like a click).
- `snackbar <type> [message]`: shows a notification with type (`ok`, `warning`, `error`). Auto-clears after 4 seconds. `snackbar clear` dismisses it immediately.
- `get|post|put|delete <path> [body] [callback]`: makes an AJAX request. Attaches the CSRF header if available. On 403 from a non-auth path, resets auth state and redirects to login. Reports errors to the server.
- `report error <error>`: posts an error to the server via `POST /error`.
- `load csrf`: fetches the CSRF token from `GET /auth/csrf`. Sets `auth.mode` to `local` or `cloud`. If cloud and no valid session, redirects to login. Otherwise calls `read hash`.
- `signup <email>`: requests a signup invite via `POST /auth/signup/request`. Shows a snackbar with the result.
- `login <email>`: requests an OTP via `POST /auth/login`. On success, sets `auth.otpRequested`.
- `verify <email> <otp>`: verifies the OTP via `POST /auth/verify`. On success, stores the CSRF token, loads models/projects/settings, and navigates to projects.
- `logout`: logs out via `POST /auth/logout`. Resets auth state and navigates to login.

### Client

```
auth admin <0|1>
     csrf "<CSRF token>"
     email "<email entered in the login/signupform>"
     mode <local|cloud> // Determines if we're in local vibey or cloud vibey.
     otp "<otp code entered in the login form>"
     otpRequested <0|1> // Whether the OTP request was sent
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
    project "<project name>" // Enables the new project modal
    type "dialog|file" // Whether the new file is a normal file or a dialog
project "<project slug>" // The current project selected
projects 1 name "<project name>"
           slug "<project slug>"
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
     otp // OTP for logging in
view "<view name>"
```
