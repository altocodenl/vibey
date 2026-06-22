# Vibey

> "Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

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

TODO: complete

### API

#### Public

- **Static**: `GET /`.
- **Post error**: `POST /error`: accepts any body.

#### Auth

- **Get CSRF token**: `GET /auth/csrf`: returns `{csrf: <token>}` in cloud mode and `{mode: 'local'}` otherwise.
- **Request invite*: `POST /auth/signup/request`: expects `{email: <email>}`. Returns 409 if the invite or user exists. 200 if successful.

TODO: complete
- login
- verify
- list
- verify
- logout
- delete

#### Admin

- **Accept invite**: `POST /auth/signup/accept`: expects `{email: <email>}`. Returns 404 if invite not found, 409 if user exists. 200 if successful.

### Responders

TODO: complete

### Client

```
auth csrf "<CSRF token>"
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
view "<view name>"
```
