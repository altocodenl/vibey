// *** SETUP ***

var fs    = require ('fs');
var Path  = require ('path');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');

var clog = console.log;

var type = teishi.type, eq = teishi.eq, last = teishi.last, inc = teishi.inc, reply = cicek.reply;

var stop = function (rs, rules) {
   return teishi.stop (rules, function (error) {
      reply (rs, 400, {error: error});
   }, true);
}

// *** HELPERS ***

var crypto = require ('crypto');
var http   = require ('http');

// *** PROMPTS ***

var PROMPTS_PATH = Path.join (__dirname, 'prompt.md');

var loadSystemPrompt = function () {
   try {
      var md = fs.readFileSync (PROMPTS_PATH, 'utf8');
      var match = md.match (/```\n([\s\S]*?)\n```/);
      return match ? match [1].trim () : '';
   }
   catch (e) {
      return 'You are a helpful assistant with access to local system tools.';
   }
};

// *** SECRET.JSON ***

var CONFIG_JSON_PATH = Path.join (__dirname, 'secret.json');

var loadConfigJson = function () {
   try {
      if (fs.existsSync (CONFIG_JSON_PATH)) return JSON.parse (fs.readFileSync (CONFIG_JSON_PATH, 'utf8'));
   }
   catch (e) {}
   return {};
};

var saveConfigJson = function (config) {
   fs.writeFileSync (CONFIG_JSON_PATH, JSON.stringify (config, null, 2), 'utf8');
};

var maskApiKey = function (key) {
   if (! key || key.length < 12) return key ? '••••••••' : '';
   return key.slice (0, 7) + '••••••••' + key.slice (-4);
};


// *** PKCE ***

var base64urlEncode = function (buffer) {
   return buffer.toString ('base64').replace (/\+/g, '-').replace (/\//g, '_').replace (/=/g, '');
};

var generatePKCE = async function () {
   var verifierBytes = crypto.randomBytes (32);
   var verifier = base64urlEncode (verifierBytes);
   var challengeBuffer = crypto.createHash ('sha256').update (verifier).digest ();
   var challenge = base64urlEncode (challengeBuffer);
   return {verifier: verifier, challenge: challenge};
};

// *** OAUTH: ANTHROPIC ***

var ANTHROPIC_CLIENT_ID = Buffer.from ('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString ();
var ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
var ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
var ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
var ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

// In-flight PKCE state for Anthropic login
var anthropicPendingLogin = null;

var startAnthropicLogin = async function () {
   var pkce = await generatePKCE ();
   var params = new URLSearchParams ({
      code: 'true',
      client_id: ANTHROPIC_CLIENT_ID,
      response_type: 'code',
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      scope: ANTHROPIC_SCOPES,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state: pkce.verifier
   });
   var url = ANTHROPIC_AUTHORIZE_URL + '?' + params.toString ();
   anthropicPendingLogin = {verifier: pkce.verifier};
   return url;
};

var completeAnthropicLogin = async function (authCode) {
   if (! anthropicPendingLogin) throw new Error ('No pending Anthropic login');
   var verifier = anthropicPendingLogin.verifier;
   anthropicPendingLogin = null;

   var splits = authCode.split ('#');
   var code = splits [0];
   var state = splits [1];

   var response = await fetch (ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify ({
         grant_type: 'authorization_code',
         client_id: ANTHROPIC_CLIENT_ID,
         code: code,
         state: state,
         redirect_uri: ANTHROPIC_REDIRECT_URI,
         code_verifier: verifier
      })
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('Anthropic token exchange failed: ' + error);
   }

   var tokenData = await response.json ();
   var expiresAt = Date.now () + tokenData.expires_in * 1000 - 5 * 60 * 1000;

   var config = loadConfigJson ();
   if (! config.accounts) config.accounts = {};
   config.accounts.claudeOAuth = {
      type: 'oauth',
      access: tokenData.access_token,
      refresh: tokenData.refresh_token,
      expires: expiresAt
   };
   saveConfigJson (config);
   return {ok: true};
};

var refreshAnthropicToken = async function (cred) {
   var response = await fetch (ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify ({
         grant_type: 'refresh_token',
         client_id: ANTHROPIC_CLIENT_ID,
         refresh_token: cred.refresh
      })
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('Anthropic token refresh failed: ' + error);
   }

   var data = await response.json ();
   return {
      access: data.access_token,
      refresh: data.refresh_token,
      expires: Date.now () + data.expires_in * 1000 - 5 * 60 * 1000
   };
};

// *** OAUTH: OPENAI CODEX ***

var OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
var OPENAI_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
var OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
var OPENAI_REDIRECT_URI = 'http://localhost:1455/auth/callback';
var OPENAI_SCOPE = 'openid profile email offline_access';
var OPENAI_JWT_CLAIM_PATH = 'https://api.openai.com/auth';

var openaiPendingLogin = null;

var SUCCESS_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Authentication successful</title></head><body><p>Authentication successful. Return to vibey to continue.</p></body></html>';

var decodeJwt = function (token) {
   try {
      var parts = token.split ('.');
      if (parts.length !== 3) return null;
      return JSON.parse (Buffer.from (parts [1], 'base64').toString ());
   }
   catch (e) {return null;}
};

var extractOpenAIAccountId = function (accessToken) {
   var payload = decodeJwt (accessToken);
   var auth = payload && payload [OPENAI_JWT_CLAIM_PATH];
   var accountId = auth && auth.chatgpt_account_id;
   return (type (accountId) === 'string' && accountId.length > 0) ? accountId : null;
};

var startOpenAILogin = async function () {
   var pkce = await generatePKCE ();
   var state = crypto.randomBytes (16).toString ('hex');

   var params = new URLSearchParams ({
      response_type: 'code',
      client_id: OPENAI_CODEX_CLIENT_ID,
      redirect_uri: OPENAI_REDIRECT_URI,
      scope: OPENAI_SCOPE,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state: state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'vibey'
   });

   var url = OPENAI_AUTHORIZE_URL + '?' + params.toString ();

   // Start local callback server
   var callbackPromise = startOpenAICallbackServer (state);

   openaiPendingLogin = {
      verifier: pkce.verifier,
      state: state,
      callbackPromise: callbackPromise
   };

   return url;
};

var startOpenAICallbackServer = function (expectedState) {
   return new Promise (function (resolveOuter) {
      var lastCode = null;
      var cancelled = false;
      var server = http.createServer (function (req, res) {
         try {
            var url = new URL (req.url || '', 'http://localhost');
            if (url.pathname !== '/auth/callback') {
               res.statusCode = 404;
               res.end ('Not found');
               return;
            }
            if (url.searchParams.get ('state') !== expectedState) {
               res.statusCode = 400;
               res.end ('State mismatch');
               return;
            }
            var code = url.searchParams.get ('code');
            if (! code) {
               res.statusCode = 400;
               res.end ('Missing authorization code');
               return;
            }
            res.statusCode = 200;
            res.setHeader ('Content-Type', 'text/html; charset=utf-8');
            res.end (SUCCESS_HTML);
            lastCode = code;
         }
         catch (e) {
            res.statusCode = 500;
            res.end ('Internal error');
         }
      });

      server.listen (1455, '127.0.0.1', function () {
         resolveOuter ({
            close: function () {server.close ();},
            cancelWait: function () {cancelled = true;},
            waitForCode: function () {
               return new Promise (function (resolve) {
                  var attempts = 0;
                  var interval = setInterval (function () {
                     if (lastCode) {
                        clearInterval (interval);
                        resolve ({code: lastCode});
                     }
                     else if (cancelled || attempts > 600) {
                        clearInterval (interval);
                        resolve (null);
                     }
                     attempts++;
                  }, 100);
               });
            }
         });
      });

      server.on ('error', function () {
         resolveOuter ({
            close: function () {},
            cancelWait: function () {},
            waitForCode: function () {return Promise.resolve (null);}
         });
      });
   });
};

var completeOpenAILogin = async function (manualCode) {
   if (! openaiPendingLogin) throw new Error ('No pending OpenAI login');
   var verifier = openaiPendingLogin.verifier;
   var state = openaiPendingLogin.state;
   var callbackPromise = openaiPendingLogin.callbackPromise;
   openaiPendingLogin = null;

   var server = await callbackPromise;
   var code = null;

   if (manualCode) {
      // User pasted code manually
      server.cancelWait ();
      server.close ();
      var parts = manualCode.trim ().split ('#');
      code = parts [0];
      // Check for URL format
      try {
         var url = new URL (manualCode.trim ());
         code = url.searchParams.get ('code') || code;
      }
      catch (e) {}
   }
   else {
      // Wait for browser callback
      var result = await server.waitForCode ();
      server.close ();
      if (result) code = result.code;
   }

   if (! code) throw new Error ('No authorization code received');

   var response = await fetch (OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams ({
         grant_type: 'authorization_code',
         client_id: OPENAI_CODEX_CLIENT_ID,
         code: code,
         code_verifier: verifier,
         redirect_uri: OPENAI_REDIRECT_URI
      })
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('OpenAI token exchange failed: ' + error);
   }

   var tokenData = await response.json ();
   if (! tokenData.access_token || ! tokenData.refresh_token) throw new Error ('OpenAI token response missing fields');

   var accountId = extractOpenAIAccountId (tokenData.access_token);
   if (! accountId) throw new Error ('Failed to extract accountId from token');

   var config = loadConfigJson ();
   if (! config.accounts) config.accounts = {};
   config.accounts.openaiOAuth = {
      type: 'oauth',
      access: tokenData.access_token,
      refresh: tokenData.refresh_token,
      expires: Date.now () + tokenData.expires_in * 1000,
      accountId: accountId
   };
   saveConfigJson (config);
   return {ok: true};
};

var refreshOpenAIToken = async function (cred) {
   var response = await fetch (OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams ({
         grant_type: 'refresh_token',
         refresh_token: cred.refresh,
         client_id: OPENAI_CODEX_CLIENT_ID
      })
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('OpenAI token refresh failed: ' + error);
   }

   var data = await response.json ();
   if (! data.access_token || ! data.refresh_token) throw new Error ('OpenAI token refresh missing fields');

   var accountId = extractOpenAIAccountId (data.access_token);
   if (! accountId) throw new Error ('Failed to extract accountId from refreshed token');

   return {
      access: data.access_token,
      refresh: data.refresh_token,
      expires: Date.now () + data.expires_in * 1000,
      accountId: accountId
   };
};

// *** API KEY RESOLUTION (API key from secret.json > OAuth token) ***

var getApiKey = async function (provider) {
   var config = loadConfigJson ();
   var accounts = config.accounts || {};

   if (provider === 'claude') {
      // 1. OAuth subscription (preferred)
      if (accounts.claudeOAuth && accounts.claudeOAuth.type === 'oauth') {
         var cred = accounts.claudeOAuth;
         if (Date.now () >= cred.expires) {
            try {
               var refreshed = await refreshAnthropicToken (cred);
               config.accounts.claudeOAuth = {type: 'oauth', access: refreshed.access, refresh: refreshed.refresh, expires: refreshed.expires};
               saveConfigJson (config);
               cred = config.accounts.claudeOAuth;
            }
            catch (e) {
               clog ('Anthropic token refresh failed:', e.message);
               return {key: '', type: 'api_key'};
            }
         }
         return {key: cred.access, type: 'oauth'};
      }
      // 2. API key fallback
      if (accounts.claude && accounts.claude.apiKey) return {key: accounts.claude.apiKey, type: 'api_key'};
      // 3. No credentials configured
      return {key: '', type: 'api_key'};
   }

   if (provider === 'openai') {
      // 1. OAuth subscription (preferred)
      if (accounts.openaiOAuth && accounts.openaiOAuth.type === 'oauth') {
         var cred = accounts.openaiOAuth;
         if (Date.now () >= cred.expires) {
            try {
               var refreshed = await refreshOpenAIToken (cred);
               config.accounts.openaiOAuth = {type: 'oauth', access: refreshed.access, refresh: refreshed.refresh, expires: refreshed.expires, accountId: refreshed.accountId};
               saveConfigJson (config);
               cred = config.accounts.openaiOAuth;
            }
            catch (e) {
               clog ('OpenAI token refresh failed:', e.message);
               return {key: '', type: 'api_key'};
            }
         }
         return {key: cred.access, type: 'oauth', accountId: cred.accountId};
      }
      // 2. API key fallback
      if (accounts.openai && accounts.openai.apiKey) return {key: accounts.openai.apiKey, type: 'api_key'};
      // 3. No credentials configured
      return {key: '', type: 'api_key'};
   }

   return {key: '', type: 'api_key'};
};

// *** DOCKER CONTAINER MANAGEMENT ***

var exec = require ('child_process').exec;
var execSync = require ('child_process').execSync;

var SANDBOX_IMAGE = 'vibey-sandbox:latest';
var DOCKER_NETWORK = 'vibey-net';

var containerName = function (projectName) {
   return 'vibey-proj-' + projectName;
};

var volumeName = function (projectName) {
   return 'vibey-vol-' + projectName;
};

var ensureNetwork = function () {
   try {
      execSync ('docker network inspect ' + DOCKER_NETWORK + ' >/dev/null 2>&1', {encoding: 'utf8'});
   }
   catch (e) {
      execSync ('docker network create ' + DOCKER_NETWORK, {encoding: 'utf8'});
      clog ('Created Docker network: ' + DOCKER_NETWORK);
   }
};

var cleanupProjectContainers = function () {
   try {
      var ids = execSync ('docker ps -aq --filter label=vibey=project', {encoding: 'utf8'}).trim ();
      if (ids) {
         execSync ('docker rm -f ' + ids, {encoding: 'utf8'});
         clog ('Cleaned up orphaned project containers: ' + ids);
      }
   }
   catch (e) {
      // No containers to clean or docker not available
   }
};

var containerExists = function (projectName) {
   var name = containerName (projectName);
   try {
      var id = execSync ('docker ps -aq --filter name=^/' + name + '$', {encoding: 'utf8'}).trim ();
      return !! id;
   }
   catch (e) {
      return false;
   }
};

var containerRunning = function (projectName) {
   var name = containerName (projectName);
   try {
      var id = execSync ('docker ps -q --filter name=^/' + name + '$', {encoding: 'utf8'}).trim ();
      return !! id;
   }
   catch (e) {
      return false;
   }
};

var ensureProjectContainer = function (projectName) {
   var name = containerName (projectName);
   var vol = volumeName (projectName);

   // Already running
   if (containerRunning (projectName)) return;

   // Exists but stopped — start it
   if (containerExists (projectName)) {
      execSync ('docker start ' + name, {encoding: 'utf8'});
      clog ('Started existing container: ' + name);
      return;
   }

   // Create volume if it doesn't exist
   try {
      execSync ('docker volume inspect ' + vol + ' >/dev/null 2>&1', {encoding: 'utf8'});
   }
   catch (e) {
      execSync ('docker volume create --label vibey=project --label vibey-project=' + projectName + ' ' + vol, {encoding: 'utf8'});
   }

   // Create new container with its own volume on the vibey network
   execSync (
      'docker run -d' +
      ' --name ' + name +
      ' --label vibey=project' +
      ' --label vibey-project=' + projectName +
      ' --network ' + DOCKER_NETWORK +
      ' -v ' + vol + ':/workspace' +
      ' -w /workspace' +
      ' ' + SANDBOX_IMAGE,
      {encoding: 'utf8'}
   );
   clog ('Created project container: ' + name);
};

var removeProjectContainer = function (projectName) {
   var name = containerName (projectName);
   var vol = volumeName (projectName);
   try {
      execSync ('docker rm -f ' + name, {encoding: 'utf8'});
      clog ('Removed project container: ' + name);
   }
   catch (e) {}
   try {
      execSync ('docker volume rm ' + vol, {encoding: 'utf8'});
      clog ('Removed project volume: ' + vol);
   }
   catch (e) {}
};

var getContainerIP = function (projectName) {
   var name = containerName (projectName);
   var ip = execSync ("docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' " + name, {encoding: 'utf8'}).trim ();
   if (! ip) throw new Error ('Container has no IP address');
   return ip;
};

var dockerExec = function (projectName, command, cb) {
   var name = containerName (projectName);
   // Escape single quotes in command for sh -c
   var escaped = command.replace (/'/g, "'\\''");
   exec ('docker exec ' + name + " sh -c '" + escaped + "'", {timeout: 30000, maxBuffer: 1024 * 1024}, cb);
};

// *** PROJECT FS ***

// All project file operations go through the container boundary.
// These are synchronous (using execSync) for simplicity — ~20-50ms per call.

var pfs = {
   readdir: function (projectName) {
      var name = containerName (projectName);
      try {
         var output = execSync ('docker exec ' + name + ' ls /workspace', {encoding: 'utf8'}).trim ();
         if (! output) return [];
         return output.split ('\n');
      }
      catch (e) {
         return [];
      }
   },

   readFile: function (projectName, filename) {
      var name = containerName (projectName);
      return execSync ('docker exec ' + name + ' cat /workspace/' + filename, {encoding: 'utf8'});
   },

   writeFile: function (projectName, filename, content) {
      var name = containerName (projectName);
      execSync ('docker exec -i ' + name + " sh -c 'cat > /workspace/" + filename + "'", {input: content, encoding: 'utf8'});
   },

   appendFile: function (projectName, filename, content) {
      var name = containerName (projectName);
      execSync ('docker exec -i ' + name + " sh -c 'cat >> /workspace/" + filename + "'", {input: content, encoding: 'utf8'});
   },

   rename: function (projectName, oldName, newName) {
      var name = containerName (projectName);
      execSync ('docker exec ' + name + ' mv /workspace/' + oldName + ' /workspace/' + newName, {encoding: 'utf8'});
   },

   unlink: function (projectName, filename) {
      var name = containerName (projectName);
      execSync ('docker exec ' + name + ' rm /workspace/' + filename, {encoding: 'utf8'});
   },

   exists: function (projectName, filename) {
      var name = containerName (projectName);
      try {
         execSync ('docker exec ' + name + ' test -f /workspace/' + filename, {encoding: 'utf8'});
         return true;
      }
      catch (e) {
         return false;
      }
   },

   stat: function (projectName, filename) {
      var name = containerName (projectName);
      try {
         // stat -c %Y gives mtime as unix epoch seconds
         var output = execSync ('docker exec ' + name + ' stat -c %Y /workspace/' + filename, {encoding: 'utf8'}).trim ();
         return {mtime: new Date (Number (output) * 1000)};
      }
      catch (e) {
         return {mtime: new Date (0)};
      }
   },

   // Read a file from any path inside the container (for static proxy)
   readFileAt: function (projectName, path) {
      var name = containerName (projectName);
      return execSync ('docker exec ' + name + ' cat ' + path, {encoding: 'utf8'});
   },

   // Read a binary file from any path inside the container (for static proxy)
   readFileBinaryAt: function (projectName, path) {
      var name = containerName (projectName);
      return execSync ('docker exec ' + name + ' cat ' + path, {encoding: 'buffer'});
   },

   existsAt: function (projectName, path) {
      var name = containerName (projectName);
      try {
         execSync ('docker exec ' + name + ' test -f ' + path, {encoding: 'utf8'});
         return true;
      }
      catch (e) {
         return false;
      }
   },

   // mkdir -p for a path inside /workspace
   mkdirp: function (projectName, dirpath) {
      var name = containerName (projectName);
      execSync ('docker exec ' + name + ' mkdir -p /workspace/' + dirpath, {encoding: 'utf8'});
   },

   // Write file at any path inside /workspace (for tool write_file)
   writeFileAt: function (projectName, filepath, content) {
      var name = containerName (projectName);
      // Ensure parent directory exists
      var dir = filepath.replace (/\/[^/]+$/, '');
      if (dir && dir !== filepath) {
         try {
            execSync ('docker exec ' + name + ' mkdir -p /workspace/' + dir, {encoding: 'utf8'});
         }
         catch (e) {}
      }
      execSync ('docker exec -i ' + name + " sh -c 'cat > /workspace/" + filepath + "'", {input: content, encoding: 'utf8'});
   },

   // Read file at any path inside /workspace (for tool edit_file)
   readFileInWorkspace: function (projectName, filepath) {
      var name = containerName (projectName);
      return execSync ('docker exec ' + name + ' cat /workspace/' + filepath, {encoding: 'utf8'});
   }
};

// *** PROJECT HELPERS ***

var slugifyProjectName = function (name) {
   if (type (name) !== 'string' || ! name.trim ()) throw new Error ('Invalid project name');
   name = name.trim ();
   // Split into runs of pass-through chars [a-zA-Z0-9_-] and runs of everything else
   var parts = name.match (/[a-zA-Z0-9_\-]+|[^a-zA-Z0-9_\-]+/g) || [];
   var slug = dale.go (parts, function (part) {
      if (/^[a-zA-Z0-9_\-]+$/.test (part)) return part;
      return '.' + Buffer.from (part, 'utf8').toString ('base64url') + '.';
   }).join ('');
   if (! slug) throw new Error ('Invalid project name');
   return slug;
};

var unslugifyProjectName = function (slug) {
   // Split on dots: pass-through segments alternate with base64url-encoded segments
   // Encoded segments are wrapped in dots: .XXXX.
   // We find all .XXXX. blocks and decode them; everything else passes through
   return slug.replace (/\.([A-Za-z0-9_\-]+)\./g, function (match, encoded) {
      try {
         return Buffer.from (encoded, 'base64url').toString ('utf8');
      }
      catch (e) {
         return match;
      }
   });
};

var validateProjectName = function (projectName) {
   if (type (projectName) !== 'string' || ! projectName.trim ()) throw new Error ('Invalid project name');
   projectName = projectName.trim ();
   if (projectName.includes ('..') || projectName.includes ('/') || projectName.includes ('\\')) throw new Error ('Invalid project name');
   if (! /^[a-zA-Z0-9_.\-]+$/.test (projectName)) throw new Error ('Invalid project name');
   return projectName;
};

var projectExists = function (projectName) {
   return containerExists (projectName);
};

var ensureProject = function (projectName) {
   var slug = slugifyProjectName (projectName);
   ensureProjectContainer (slug);
   return slug;
};

var getExistingProject = function (projectName) {
   projectName = validateProjectName (projectName);
   if (! projectExists (projectName)) throw new Error ('Project not found');
   if (! containerRunning (projectName)) {
      execSync ('docker start ' + containerName (projectName), {encoding: 'utf8'});
   }
   return projectName;
};

var listProjects = function () {
   try {
      var output = execSync ('docker ps -a --filter label=vibey=project --format "{{.Names}}"', {encoding: 'utf8'}).trim ();
      if (! output) return [];
      var names = output.split ('\n');
      var projects = dale.fil (names, undefined, function (name) {
         if (name.indexOf ('vibey-proj-') === 0) {
            var slug = name.slice ('vibey-proj-'.length);
            return {slug: slug, name: unslugifyProjectName (slug)};
         }
      });
      projects.sort (function (a, b) {return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);});
      return projects;
   }
   catch (e) {
      return [];
   }
};

var ACTIVE_STREAMS = {};

var beginActiveStream = function (dialogId) {
   var controller = new AbortController ();
   ACTIVE_STREAMS [dialogId] = {controller: controller, requestedStatus: null};
   return controller;
};

var getActiveStream = function (dialogId) {
   return ACTIVE_STREAMS [dialogId] || null;
};

var endActiveStream = function (dialogId) {
   delete ACTIVE_STREAMS [dialogId];
};

// *** DOC-MAIN HELPERS ***

var compactText = function (text, maxLines, maxChars) {
   if (type (text) !== 'string') return '';
   maxLines = maxLines || 16;
   maxChars = maxChars || 1800;

   var lines = text.split ('\n');
   var compacted = lines.slice (0, maxLines).join ('\n');
   if (compacted.length > maxChars) compacted = compacted.slice (0, maxChars);

   if (text.length > compacted.length || lines.length > maxLines) compacted = compacted.replace (/\s+$/, '') + '\n...';
   return compacted;
};

var getDocMainContent = function (projectName) {
   if (! pfs.exists (projectName, 'doc-main.md')) return null;

   try {
      var content = pfs.readFile (projectName, 'doc-main.md');
      if (! content || ! content.trim ()) return null;
      return {name: 'doc-main.md', content: content.trim ()};
   }
   catch (error) {
      return null;
   }
};

var getDocMainInjection = function (projectName) {
   var docMain = getDocMainContent (projectName);
   if (! docMain) return '';
   return '\n\nProject instructions (' + docMain.name + '):\n\n' + docMain.content;
};

var upsertDocMainContextBlock = function (projectName, filename) {
   if (! pfs.exists (projectName, filename)) return;

   var markdown = pfs.readFile (projectName, filename);
   var blockRe = /<!-- DOC_MAIN_CONTEXT_START -->[\s\S]*?<!-- DOC_MAIN_CONTEXT_END -->\n\n?/;
   markdown = markdown.replace (blockRe, '');

   var docMain = getDocMainContent (projectName);
   if (! docMain) {
      pfs.writeFile (projectName, filename, markdown);
      return;
   }

   var preview = compactText (docMain.content, 12, 1200).split ('\n').join ('\n    ');
   var block = '<!-- DOC_MAIN_CONTEXT_START -->\n';
   block += '> Prompt context: ' + docMain.name + ' (' + docMain.content.length + ' chars, compacted)\n\n';
   block += '    ' + preview + '\n';
   block += '<!-- DOC_MAIN_CONTEXT_END -->\n\n';

   if (/> Started:[^\n]*\n\n/.test (markdown)) {
      markdown = markdown.replace (/(> Started:[^\n]*\n\n)/, '$1' + block);
   }
   else if (markdown.indexOf ('# Dialog\n\n') === 0) {
      markdown = '# Dialog\n\n' + block + markdown.slice (10);
   }
   else markdown = block + markdown;

   pfs.writeFile (projectName, filename, markdown);
};

// *** MCP TOOLS ***

// Tool definitions (written once, converted to both provider formats below)
var TOOLS = [
   {
      name: 'run_command',
      description: 'Run a shell command. Use for reading files (cat), listing directories (ls), HTTP requests (curl), git, and anything else the shell can do. 30s timeout.',
      input_schema: {
         type: 'object',
         properties: {
            command: {
               type: 'string',
               description: 'The shell command to execute'
            }
         },
         required: ['command']
      }
   },
   {
      name: 'write_file',
      description: 'Write content to a file, creating or overwriting it. Use this instead of shell redirects to avoid escaping issues.',
      input_schema: {
         type: 'object',
         properties: {
            path: {
               type: 'string',
               description: 'The file path to write to (relative to /workspace)'
            },
            content: {
               type: 'string',
               description: 'The full content to write'
            }
         },
         required: ['path', 'content']
      }
   },
   {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string with new content. The old_string must appear exactly once in the file. Read the file first (cat) to see its contents, then specify the exact text to replace. Include enough surrounding context in old_string to make it unique.',
      input_schema: {
         type: 'object',
         properties: {
            path: {
               type: 'string',
               description: 'The file path to edit (relative to /workspace)'
            },
            old_string: {
               type: 'string',
               description: 'The exact text to find (must be unique in the file)'
            },
            new_string: {
               type: 'string',
               description: 'The replacement text'
            }
         },
         required: ['path', 'old_string', 'new_string']
      }
   },
   {
      name: 'launch_agent',
      description: 'Spawn another top-level dialog. Equivalent to POST /dialog with provider, model, prompt, and optional slug.',
      input_schema: {
         type: 'object',
         properties: {
            provider: {
               type: 'string',
               description: 'claude or openai'
            },
            model: {
               type: 'string',
               description: 'Model name for the spawned agent'
            },
            prompt: {
               type: 'string',
               description: 'Initial prompt for the spawned agent'
            },
            slug: {
               type: 'string',
               description: 'Optional dialog slug'
            }
         },
         required: ['provider', 'model', 'prompt']
      }
   }
];

// Claude format: as-is
var CLAUDE_TOOLS = TOOLS;

// OpenAI format: wrapped in {type: 'function', function: {name, description, parameters}}
var OPENAI_TOOLS = dale.go (TOOLS, function (tool) {
   return {
      type: 'function',
      function: {
         name: tool.name,
         description: tool.description,
         parameters: tool.input_schema
      }
   };
});

// Sanitize a tool file path: must be relative, no .., no leading /
var sanitizeToolPath = function (path) {
   if (type (path) !== 'string' || ! path.trim ()) throw new Error ('Invalid path');
   path = path.trim ();
   // Strip leading / or ./ to make relative
   path = path.replace (/^\.?\/+/, '');
   if (path.includes ('..')) throw new Error ('Path must not contain ..');
   if (! path) throw new Error ('Invalid path');
   return path;
};

// Execute a tool inside the project container
var executeTool = function (toolName, toolInput, projectName) {
   return new Promise (function (resolve) {
      try {
         getExistingProject (projectName);
      }
      catch (error) {
         return resolve ({success: false, error: error.message});
      }

      if (toolName === 'run_command') {
         dockerExec (projectName, toolInput.command, function (error, stdout, stderr) {
            if (error) resolve ({success: false, error: error.message, stderr: stderr});
            else       resolve ({success: true, stdout: stdout, stderr: stderr});
         });
      }

      else if (toolName === 'write_file') {
         try {
            var writePath = sanitizeToolPath (toolInput.path);
            pfs.writeFileAt (projectName, writePath, toolInput.content);
            resolve ({success: true, message: 'File written: ' + toolInput.path});
         }
         catch (error) {
            resolve ({success: false, error: error.message});
         }
      }

      else if (toolName === 'edit_file') {
         try {
            var editPath = sanitizeToolPath (toolInput.path);
            var content = pfs.readFileInWorkspace (projectName, editPath);

            var count = content.split (toolInput.old_string).length - 1;

            if (count === 0) {
               resolve ({success: false, error: 'old_string not found in file'});
            }
            else if (count > 1) {
               resolve ({success: false, error: 'old_string found ' + count + ' times — must be unique. Add more surrounding context.'});
            }
            else {
               var updated = content.replace (toolInput.old_string, toolInput.new_string);
               pfs.writeFileAt (projectName, editPath, updated);
               resolve ({success: true, message: 'Edit applied to ' + toolInput.path});
            }
         }
         catch (error) {
            resolve ({success: false, error: error.message});
         }
      }

      else if (toolName === 'launch_agent') {
         if (toolInput.provider !== 'claude' && toolInput.provider !== 'openai') {
            return resolve ({success: false, error: 'launch_agent: provider must be claude or openai'});
         }
         if (type (toolInput.prompt) !== 'string' || ! toolInput.prompt.trim ()) {
            return resolve ({success: false, error: 'launch_agent: prompt is required'});
         }

         startDialogTurn (projectName, toolInput.provider, toolInput.prompt.trim (), toolInput.model, toolInput.slug, null)
            .then (function (result) {
               resolve ({
                  success: true,
                  launched: {
                     dialogId: result.dialogId,
                     filename: result.filename,
                     status: result.status,
                     provider: result.provider,
                     model: result.model
                  }
               });
            })
            .catch (function (error) {
               resolve ({success: false, error: 'launch_agent failed: ' + error.message});
            });
      }

      else {
         resolve ({success: false, error: 'Unknown tool: ' + toolName});
      }
   });
};

// *** LLM FUNCTIONS ***

var safeJsonParse = function (text, fallback) {
   try {
      return JSON.parse (text);
   }
   catch (error) {
      return fallback;
   }
};

var parseMetadata = function (markdown) {
   var metaMatch = markdown.match (/> Provider:\s*([^|]+)\|\s*Model:\s*([^\n]+)/);
   if (! metaMatch) return {};
   return {
      provider: metaMatch [1].trim (),
      model: metaMatch [2].trim ()
   };
};

var parseToolCalls = function (text, includePositions) {
   var toolCalls = [];
   var re = /---\nTool request:\s+([^\n\[]+?)(?:\s+\[([^\]]+)\])?\n\n([\s\S]*?)\n---/g;
   var match;
   while ((match = re.exec (text)) !== null) {
      var full = match [0];
      var name = match [1].trim ();
      var id = (match [2] || '').trim ();
      var body = match [3];
      var inputText = body;
      var result = null;
      var resultMatch = body.match (/\nResult:\n\n([\s\S]*)$/);
      if (resultMatch) {
         inputText = body.slice (0, resultMatch.index);
         var resultText = resultMatch [1].replace (/^\s+|\s+$/g, '').replace (/^    /gm, '');
         result = safeJsonParse (resultText, resultText);
      }
      inputText = inputText.replace (/^\s+|\s+$/g, '').replace (/^    /gm, '');
      var parsedInput = safeJsonParse (inputText || '{}', {});
      var parsed = {
         id: id || null,
         name: name,
         input: parsedInput,
         result: result
      };
      if (includePositions) {
         parsed.start = match.index;
         parsed.end = match.index + full.length;
         parsed.raw = full;
      }
      toolCalls.push (parsed);
   }
   return toolCalls;
};

var buildToolBlock = function (toolCall, result) {
   var block = '---\n';
   block += 'Tool request: ' + toolCall.name + ' [' + toolCall.id + ']\n\n';
   block += '    ' + JSON.stringify (toolCall.input || {}, null, 2).split ('\n').join ('\n    ') + '\n\n';
   if (result) {
      block += 'Result:\n\n';
      block += '    ' + JSON.stringify (result, null, 2).split ('\n').join ('\n    ') + '\n\n';
   }
   block += '---';
   return block;
};

var parseSections = function (markdown) {
   var sections = [];
   var re = /## (User|Assistant)\n([\s\S]*?)(?=\n## (?:User|Assistant)\n|$)/g;
   var match;
   while ((match = re.exec (markdown)) !== null) {
      sections.push ({
         role: match [1].toLowerCase (),
         content: (match [2] || '').replace (/^\n+/, '').replace (/\s+$/, '')
      });
   }
   return sections;
};

var stripSectionMetadata = function (text) {
   return dale.fil ((text || '').split ('\n'), undefined, function (line) {
      if (/^>\s*Time:/.test (line)) return;
      if (/^>\s*Usage(?: cumulative)?:/.test (line)) return;
      return line;
   }).join ('\n').trim ();
};

var parseUsageNumbers = function (usage) {
   if (! usage) return null;
   var input = usage.input_tokens;
   if (input === undefined) input = usage.prompt_tokens;
   if (input === undefined) input = usage.input;

   var output = usage.output_tokens;
   if (output === undefined) output = usage.completion_tokens;
   if (output === undefined) output = usage.output;

   if (input === undefined && output === undefined && usage.total_tokens === undefined && usage.total === undefined) return null;

   input = Number (input || 0);
   output = Number (output || 0);
   var total = usage.total_tokens !== undefined ? Number (usage.total_tokens) : (usage.total !== undefined ? Number (usage.total) : (input + output));

   return {input: input, output: output, total: total};
};

var getLastCumulativeUsage = function (projectName, filename) {
   if (! pfs.exists (projectName, filename)) return {input: 0, output: 0, total: 0};
   var text = pfs.readFile (projectName, filename);
   var re = /^> Usage cumulative:\s*input=(\d+)\s+output=(\d+)\s+total=(\d+)\s*$/gm;
   var match, lastMatch = null;
   while ((match = re.exec (text)) !== null) lastMatch = match;
   if (! lastMatch) return {input: 0, output: 0, total: 0};
   return {
      input: Number (lastMatch [1] || 0),
      output: Number (lastMatch [2] || 0),
      total: Number (lastMatch [3] || 0)
   };
};

var appendToDialog = function (projectName, filename, text) {
   pfs.appendFile (projectName, filename, text);
};

var appendUsageToAssistantSection = function (projectName, filename, usage) {
   var normalized = parseUsageNumbers (usage);
   if (! normalized) return;

   var cumulative = getLastCumulativeUsage (projectName, filename);
   cumulative.input += normalized.input;
   cumulative.output += normalized.output;
   cumulative.total += normalized.total;

   appendToDialog (projectName, filename,
      '> Usage: input=' + normalized.input + ' output=' + normalized.output + ' total=' + normalized.total + '\n' +
      '> Usage cumulative: input=' + cumulative.input + ' output=' + cumulative.output + ' total=' + cumulative.total + '\n\n'
   );
};

var finalizeAssistantTime = function (projectName, filename, startIso, endIso) {
   var marker = '> Time: ' + startIso + ' - ...';
   var replacement = '> Time: ' + startIso + ' - ' + endIso;
   var text = pfs.readFile (projectName, filename);
   var index = text.lastIndexOf (marker);
   if (index < 0) return;
   text = text.slice (0, index) + replacement + text.slice (index + marker.length);
   pfs.writeFile (projectName, filename, text);
};

var parseDialogForProvider = function (markdown, provider) {
   var messages = [];
   dale.go (parseSections (markdown), function (section) {
      if (section.role === 'user') {
         var userText = stripSectionMetadata (section.content);
         if (userText) messages.push ({role: 'user', content: userText});
         return;
      }

      var toolCalls = parseToolCalls (section.content, false);
      var assistantText = section.content.replace (/---\nTool request:\s+[^\n\[]+?(?:\s+\[[^\]]+\])?\n\n[\s\S]*?\n---/g, '');
      assistantText = stripSectionMetadata (assistantText);

      if (! toolCalls.length) {
         if (assistantText) messages.push ({role: 'assistant', content: assistantText});
         return;
      }

      if (provider === 'claude') {
         var assistantContent = [];
         if (assistantText) assistantContent.push ({type: 'text', text: assistantText});
         dale.go (toolCalls, function (tc) {
            assistantContent.push ({
               type: 'tool_use',
               id: tc.id,
               name: tc.name,
               input: tc.input
            });
         });
         messages.push ({role: 'assistant', content: assistantContent});

         var withResults = dale.fil (toolCalls, undefined, function (tc) {
            if (tc.result) return tc;
         });
         if (withResults.length) {
            messages.push ({role: 'user', content: dale.go (withResults, function (tc) {
               return {
                  type: 'tool_result',
                  tool_use_id: tc.id,
                  content: JSON.stringify (tc.result)
               };
            })});
         }
      }
      else {
         messages.push ({
            role: 'assistant',
            content: assistantText || null,
            tool_calls: dale.go (toolCalls, function (tc) {
               return {
                  id: tc.id,
                  type: 'function',
                  function: {
                     name: tc.name,
                     arguments: JSON.stringify (tc.input)
                  }
               };
            })
         });

         dale.go (toolCalls, function (tc) {
            if (! tc.result) return;
            messages.push ({
               role: 'tool',
               tool_call_id: tc.id,
               content: JSON.stringify (tc.result)
            });
         });
      }
   });
   return messages;
};

var DIALOG_STATUSES = ['active', 'waiting', 'done'];

var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};

var formatDialogTimestamp = function () {
   var d = new Date ();
   return d.getUTCFullYear () + '' + pad2 (d.getUTCMonth () + 1) + pad2 (d.getUTCDate ()) + '-' + pad2 (d.getUTCHours ()) + pad2 (d.getUTCMinutes ()) + pad2 (d.getUTCSeconds ());
};

var slugify = function (text) {
   text = (text || 'dialog').toLowerCase ().replace (/[^a-z0-9\-]+/g, '-').replace (/\-+/g, '-').replace (/^\-+|\-+$/g, '');
   return text || 'dialog';
};

var buildDialogFilename = function (dialogId, status) {
   return 'dialog-' + dialogId + '-' + status + '.md';
};

var parseDialogFilename = function (filename) {
   var match = (filename || '').match (/^dialog\-(.+)\-(active|waiting|done)\.md$/);
   if (! match) return null;
   return {dialogId: match [1], status: match [2]};
};

var findDialogFilename = function (projectName, dialogId) {
   var files = pfs.readdir (projectName);
   var found = dale.stopNot (files, undefined, function (file) {
      var parsed = parseDialogFilename (file);
      if (parsed && parsed.dialogId === dialogId) return file;
   });
   return found || null;
};

var createDialogId = function (projectName, slug) {
   var base = formatDialogTimestamp () + '-' + slugify (slug || 'dialog');
   var candidate = base;
   var counter = 2;
   while (findDialogFilename (projectName, candidate)) {
      candidate = base + '-' + counter;
      counter++;
   }
   return candidate;
};

var loadDialog = function (projectName, dialogId) {
   var filename = findDialogFilename (projectName, dialogId);
   if (! filename) {
      return {
         dialogId: dialogId,
         filename: buildDialogFilename (dialogId, 'active'),
         status: 'active',
         exists: false,
         markdown: '',
         metadata: {}
      };
   }

   var markdown = pfs.readFile (projectName, filename);
   var parsed = parseDialogFilename (filename) || {status: 'active'};

   return {
      dialogId: dialogId,
      filename: filename,
      status: parsed.status,
      exists: true,
      markdown: markdown,
      metadata: parseMetadata (markdown)
   };
};

var setDialogStatus = function (projectName, dialog, status) {
   if (! inc (DIALOG_STATUSES, status)) throw new Error ('Invalid status: ' + status);
   if (! dialog.exists) throw new Error ('Dialog not found: ' + dialog.dialogId);
   if (dialog.status === status) return dialog;

   var newFilename = buildDialogFilename (dialog.dialogId, status);
   pfs.rename (projectName, dialog.filename, newFilename);
   dialog.filename = newFilename;
   dialog.status = status;
   return dialog;
};

var ensureDialogFile = function (projectName, dialog, provider, model) {
   if (dialog.exists) {
      if (dialog.metadata.provider && dialog.metadata.model) {
         upsertDocMainContextBlock (projectName, dialog.filename);
         return;
      }
      var content = pfs.readFile (projectName, dialog.filename);
      var headerLine = '> Provider: ' + provider + ' | Model: ' + model + '\n';
      if (! /\n> Started:/.test (content)) headerLine += '> Started: ' + new Date ().toISOString () + '\n';
      headerLine += '\n';
      if (content.startsWith ('# Dialog\n\n')) content = '# Dialog\n\n' + headerLine + content.slice (10);
      else content = '# Dialog\n\n' + headerLine + content;
      pfs.writeFile (projectName, dialog.filename, content);
      upsertDocMainContextBlock (projectName, dialog.filename);
      dialog.markdown = pfs.readFile (projectName, dialog.filename);
      dialog.metadata = {provider: provider, model: model};
      return;
   }

   var header = '# Dialog\n\n';
   header += '> Provider: ' + provider + ' | Model: ' + model + '\n';
   header += '> Started: ' + new Date ().toISOString () + '\n\n';
   pfs.writeFile (projectName, dialog.filename, header);
   upsertDocMainContextBlock (projectName, dialog.filename);
   dialog.exists = true;
   dialog.markdown = pfs.readFile (projectName, dialog.filename);
};

var writeToolResults = function (projectName, filename, resultsById) {
   var markdown = pfs.readFile (projectName, filename);
   var toolCalls = parseToolCalls (markdown, true);

   // Collect replacements, then apply in reverse order to preserve positions
   var replacements = dale.fil (toolCalls, undefined, function (tc) {
      if (tc.result) return;
      var result = resultsById [tc.id];
      if (! result) return;
      return {start: tc.start, end: tc.end, text: buildToolBlock (tc, result)};
   });

   replacements.reverse ();
   dale.go (replacements, function (r) {
      markdown = markdown.slice (0, r.start) + r.text + markdown.slice (r.end);
   });

   pfs.writeFile (projectName, filename, markdown);
};

// Implementation function for Claude (streaming with tool support)
var chatWithClaude = async function (projectName, messages, model, onChunk, abortSignal) {
   model = model || 'claude-sonnet-4-20250514';

   var systemPrompt = loadSystemPrompt () + getDocMainInjection (projectName);

   var requestBody = {
      model: model,
      max_tokens: 64000,
      stream: true,
      messages: messages,
      tools: CLAUDE_TOOLS,
      system: systemPrompt
   };

   var auth = await getApiKey ('claude');
   var headers = {'Content-Type': 'application/json'};

   if (auth.type === 'oauth') {
      headers ['Authorization'] = 'Bearer ' + auth.key;
      headers ['anthropic-beta'] = 'oauth-2025-04-20';
      headers ['anthropic-dangerous-direct-browser-access'] = 'true';
   }
   else {
      headers ['x-api-key'] = auth.key;
      headers ['anthropic-version'] = '2023-06-01';
   }

   var response = await fetch ('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify (requestBody),
      signal: abortSignal
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('Claude API error: ' + response.status + ' - ' + error);
   }

   var fullContent = '';
   var toolCalls = [];
   var currentToolUse = null;
   var usage = null;
   var reader = response.body.getReader ();
   var decoder = new TextDecoder ();
   var buffer = '';

   while (true) {
      var result = await reader.read ();
      if (result.done) break;

      buffer += decoder.decode (result.value, {stream: true});
      var lines = buffer.split ('\n');
      buffer = lines.pop ();

      dale.go (lines, function (line) {
         if (line.startsWith ('data: ')) {
            var data = line.slice (6);
            if (data === '[DONE]') return;
            try {
               var parsed = JSON.parse (data);

               // Text content
               if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                  fullContent += parsed.delta.text;
                  if (onChunk) onChunk (parsed.delta.text);
               }

               // Tool use start
               if (parsed.type === 'content_block_start' && parsed.content_block && parsed.content_block.type === 'tool_use') {
                  currentToolUse = {
                     id: parsed.content_block.id,
                     name: parsed.content_block.name,
                     input: ''
                  };
               }

               // Tool use input delta
               if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.type === 'input_json_delta') {
                  if (currentToolUse) {
                     currentToolUse.input += parsed.delta.partial_json;
                  }
               }

               if (parsed.usage) usage = parsed.usage;

               // Tool use stop
               if (parsed.type === 'content_block_stop' && currentToolUse) {
                  try {
                     currentToolUse.input = JSON.parse (currentToolUse.input);
                  }
                  catch (e) {
                     currentToolUse.input = {};
                  }
                  toolCalls.push (currentToolUse);
                  currentToolUse = null;
               }
            }
            catch (e) {}
         }
      });
   }

   return {
      provider: 'claude',
      model: model,
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      usage: parseUsageNumbers (usage)
   };
};

var normalizeMessagesForResponsesApi = function (messages) {
   var normalized = [];

   dale.go (messages || [], function (message) {
      if (! message || type (message) !== 'object') return;

      if (message.role === 'tool') {
         var toolText = '[Tool result ' + (message.tool_call_id || 'unknown') + ']\n' + (message.content || '');
         normalized.push ({role: 'user', content: toolText});
         return;
      }

      var content = message.content;
      if (content === null || content === undefined) content = '';

      if (type (content) !== 'string') {
         try {content = JSON.stringify (content);} catch (error) {content = '' + content;}
      }

      if (message.tool_calls && message.tool_calls.length) {
         content += (content ? '\n\n' : '') + '[Assistant tool calls]\n' + dale.go (message.tool_calls, function (tc) {
            return '- ' + ((tc.function && tc.function.name) || tc.name || 'unknown') + ' id=' + (tc.id || 'unknown') + ' args=' + ((tc.function && tc.function.arguments) || tc.arguments || '{}');
         }).join ('\n');
      }

      normalized.push ({role: message.role || 'user', content: content});
   });

   return normalized;
};

// Implementation function for OpenAI (streaming with tool support)
var chatWithOpenAI = async function (projectName, messages, model, onChunk, abortSignal) {
   model = model || 'gpt-5';

   var systemPrompt = loadSystemPrompt () + getDocMainInjection (projectName);

   var requestBody = {
      model: model,
      stream: true,
      stream_options: {include_usage: true},
      messages: [{
         role: 'system',
         content: systemPrompt
      }].concat (messages),
      tools: OPENAI_TOOLS
   };

   var auth = await getApiKey ('openai');
   var apiUrl = 'https://api.openai.com/v1/chat/completions';
   var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + auth.key
   };
   var usingResponsesApi = false;

   if (auth.type === 'oauth' && auth.accountId) {
      usingResponsesApi = true;
      apiUrl = 'https://chatgpt.com/backend-api/codex/responses';
      headers ['chatgpt-account-id'] = auth.accountId;
      headers ['OpenAI-Beta'] = 'responses=experimental';
      headers ['originator'] = 'vibey';
      // Responses API uses `input` + `instructions`, not `messages`
      requestBody.instructions = systemPrompt;
      requestBody.input = normalizeMessagesForResponsesApi (messages);
      requestBody.store = false;
      // Responses API tool format: {type, name, description, parameters} (flat, not nested under `function`)
      requestBody.tools = dale.go (TOOLS, function (tool) {
         return {type: 'function', name: tool.name, description: tool.description, parameters: tool.input_schema};
      });
      delete requestBody.messages;
      delete requestBody.stream_options;
   }

   var response = await fetch (apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify (requestBody),
      signal: abortSignal
   });

   if (! response.ok) {
      var error = await response.text ();
      throw new Error ('OpenAI API error: ' + response.status + ' - ' + error);
   }

   var fullContent = '';
   var toolCalls = [];
   var toolCallsInProgress = {}; // Chat Completions stream: {index: {id, name, arguments}}
   var responseToolCalls = {};   // Responses stream: {item_id: {id, name, arguments}}
   var usage = null;
   var reader = response.body.getReader ();
   var decoder = new TextDecoder ();
   var buffer = '';

   while (true) {
      var result = await reader.read ();
      if (result.done) break;

      buffer += decoder.decode (result.value, {stream: true});
      var lines = buffer.split ('\n');
      buffer = lines.pop ();

      dale.go (lines, function (line) {
         if (! line.startsWith ('data: ')) return;

         var data = line.slice (6);
         if (data === '[DONE]') return;

         try {
            var parsed = JSON.parse (data);
            if (parsed.usage) usage = parsed.usage;

            if (usingResponsesApi) {
               // Text deltas
               if (parsed.type === 'response.output_text.delta' && type (parsed.delta) === 'string') {
                  fullContent += parsed.delta;
                  if (onChunk) onChunk (parsed.delta);
               }

               // Tool call scaffold
               if (parsed.type === 'response.output_item.added' && parsed.item && parsed.item.type === 'function_call') {
                  responseToolCalls [parsed.item.id] = {
                     id: parsed.item.call_id || parsed.item.id,
                     name: parsed.item.name || '',
                     arguments: parsed.item.arguments || ''
                  };
               }

               // Tool args deltas
               if (parsed.type === 'response.function_call_arguments.delta') {
                  if (! responseToolCalls [parsed.item_id]) {
                     responseToolCalls [parsed.item_id] = {id: parsed.item_id, name: '', arguments: ''};
                  }
                  responseToolCalls [parsed.item_id].arguments += parsed.delta || '';
               }

               if (parsed.type === 'response.function_call_arguments.done') {
                  if (! responseToolCalls [parsed.item_id]) {
                     responseToolCalls [parsed.item_id] = {id: parsed.item_id, name: '', arguments: ''};
                  }
                  if (type (parsed.arguments) === 'string') responseToolCalls [parsed.item_id].arguments = parsed.arguments;
               }

               // Final tool item data (name/call_id/arguments)
               if (parsed.type === 'response.output_item.done' && parsed.item && parsed.item.type === 'function_call') {
                  if (! responseToolCalls [parsed.item.id]) responseToolCalls [parsed.item.id] = {id: parsed.item.id, name: '', arguments: ''};
                  if (parsed.item.call_id) responseToolCalls [parsed.item.id].id = parsed.item.call_id;
                  if (parsed.item.name) responseToolCalls [parsed.item.id].name = parsed.item.name;
                  if (type (parsed.item.arguments) === 'string') responseToolCalls [parsed.item.id].arguments = parsed.item.arguments;
               }

               // Usage is delivered on completion for responses streams
               if (parsed.type === 'response.completed' && parsed.response && parsed.response.usage) usage = parsed.response.usage;

               return;
            }

            // Chat Completions stream format
            var delta = parsed.choices && parsed.choices [0] && parsed.choices [0].delta;
            if (! delta) return;

            if (delta.content) {
               fullContent += delta.content;
               if (onChunk) onChunk (delta.content);
            }

            if (delta.tool_calls) {
               dale.go (delta.tool_calls, function (tc) {
                  var idx = tc.index;
                  if (! toolCallsInProgress [idx]) toolCallsInProgress [idx] = {id: tc.id, name: '', arguments: ''};
                  if (tc.id) toolCallsInProgress [idx].id = tc.id;
                  if (tc.function && tc.function.name) toolCallsInProgress [idx].name += tc.function.name;
                  if (tc.function && tc.function.arguments) toolCallsInProgress [idx].arguments += tc.function.arguments;
               });
            }
         }
         catch (e) {}
      });
   }

   // Convert in-progress tool calls to final format (chat completions)
   dale.go (toolCallsInProgress, function (tc) {
      try {
         toolCalls.push ({id: tc.id, name: tc.name, input: JSON.parse (tc.arguments)});
      }
      catch (e) {
         toolCalls.push ({id: tc.id, name: tc.name, input: {}});
      }
   });

   // Convert in-progress tool calls to final format (responses API)
   dale.go (responseToolCalls, function (tc) {
      try {
         toolCalls.push ({id: tc.id, name: tc.name, input: JSON.parse (tc.arguments || '{}')});
      }
      catch (e) {
         toolCalls.push ({id: tc.id, name: tc.name, input: {}});
      }
   });

   return {
      provider: 'openai',
      model: model,
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      usage: parseUsageNumbers (usage)
   };
};

var appendToolCallsToAssistantSection = function (projectName, filename, toolCalls) {
   if (! toolCalls || ! toolCalls.length) return;
   dale.go (toolCalls, function (tc) {
      appendToDialog (projectName, filename, buildToolBlock (tc) + '\n\n');
   });
};

var runCompletion = async function (projectName, dialog, provider, model, onChunk, abortSignal) {
   var autoExecutedAll = [];
   var lastContent = '';

   for (var round = 0; round < 20; round++) {
      upsertDocMainContextBlock (projectName, dialog.filename);
      var markdown = pfs.readFile (projectName, dialog.filename);
      var messages = parseDialogForProvider (markdown, provider);

      var assistantStart = new Date ().toISOString ();
      appendToDialog (projectName, dialog.filename, '## Assistant\n> Time: ' + assistantStart + ' - ...\n\n');

      var writeChunk = function (chunk) {
         appendToDialog (projectName, dialog.filename, chunk);
         if (onChunk) onChunk (chunk);
      };

      try {
         var result = provider === 'claude'
            ? await chatWithClaude (projectName, messages, model, writeChunk, abortSignal)
            : await chatWithOpenAI (projectName, messages, model, writeChunk, abortSignal);

         lastContent = result.content || '';

         appendToDialog (projectName, dialog.filename, '\n\n');
         appendUsageToAssistantSection (projectName, dialog.filename, result.usage);
         appendToolCallsToAssistantSection (projectName, dialog.filename, result.toolCalls);

         var resultsById = {};
         var executed = [];
         var toolCalls = result.toolCalls || [];

         for (var i = 0; i < toolCalls.length; i++) {
            var tc = toolCalls [i];
            var toolResult = await executeTool (tc.name, tc.input, projectName);
            resultsById [tc.id] = toolResult;
            executed.push ({id: tc.id, name: tc.name, result: toolResult});
         }

         if (dale.keys (resultsById).length) writeToolResults (projectName, dialog.filename, resultsById);
         if (executed.length) autoExecutedAll = autoExecutedAll.concat (executed);

         if (! toolCalls.length) {
            return {
               dialogId: dialog.dialogId,
               filename: dialog.filename,
               provider: provider,
               model: model,
               content: lastContent,
               toolCalls: null,
               autoExecuted: autoExecutedAll
            };
         }
      }
      finally {
         try {
            finalizeAssistantTime (projectName, dialog.filename, assistantStart, new Date ().toISOString ());
         }
         catch (error) {}
      }
   }

   throw new Error ('Exceeded maximum auto-tool continuation rounds');
};

var createWaitingDialog = function (projectName, provider, model, slug) {
   if (provider !== 'claude' && provider !== 'openai') {
      throw new Error ('Unknown provider: ' + provider + '. Use "claude" or "openai".');
   }

   getExistingProject (projectName);
   var defaultModel = model || (provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-5');
   var dialogId = createDialogId (projectName, slug || 'dialog');
   var filename = buildDialogFilename (dialogId, 'waiting');
   var dialog = {
      dialogId: dialogId,
      filename: filename,
      status: 'waiting',
      exists: false,
      markdown: '',
      metadata: {}
   };

   ensureDialogFile (projectName, dialog, provider, defaultModel);

   return {
      dialogId: dialog.dialogId,
      filename: dialog.filename,
      status: dialog.status,
      provider: provider,
      model: defaultModel
   };
};

var startDialogTurn = async function (projectName, provider, prompt, model, slug, onChunk, abortSignal) {
   if (provider !== 'claude' && provider !== 'openai') {
      throw new Error ('Unknown provider: ' + provider + '. Use "claude" or "openai".');
   }

   getExistingProject (projectName);
   var defaultModel = model || (provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-5');
   var dialogId = createDialogId (projectName, slug);
   var dialog = {
      dialogId: dialogId,
      filename: buildDialogFilename (dialogId, 'active'),
      status: 'active',
      exists: false,
      markdown: '',
      metadata: {}
   };

   ensureDialogFile (projectName, dialog, provider, defaultModel);
   appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + prompt + '\n\n');

   var result = await runCompletion (projectName, dialog, provider, defaultModel, onChunk, abortSignal);
   result.filename = dialog.filename;
   result.status = dialog.status;
   return result;
};

var updateDialogTurn = async function (projectName, dialogId, status, prompt, provider, model, onChunk, abortSignal) {
   var dialog = loadDialog (projectName, dialogId);
   if (! dialog.exists) throw new Error ('Dialog not found: ' + dialogId);

   var shouldContinue = (type (prompt) === 'string' && prompt.trim ());

   if (shouldContinue) {
      setDialogStatus (projectName, dialog, 'active');
      if (type (prompt) === 'string' && prompt.trim ()) {
         appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + prompt.trim () + '\n\n');
      }

      var meta = parseMetadata (pfs.readFile (projectName, dialog.filename));
      var resolvedProvider = provider || meta.provider;
      if (resolvedProvider !== 'claude' && resolvedProvider !== 'openai') {
         throw new Error ('Unable to determine provider for dialog update');
      }
      var resolvedModel = model || meta.model || (resolvedProvider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-5');
      var result = await runCompletion (projectName, dialog, resolvedProvider, resolvedModel, onChunk, abortSignal);

      if (status && inc (['waiting', 'done'], status)) setDialogStatus (projectName, dialog, status);

      result.filename = dialog.filename;
      result.status = dialog.status;
      return result;
   }

   if (status && inc (['waiting', 'done'], status)) setDialogStatus (projectName, dialog, status);

   return {
      dialogId: dialog.dialogId,
      filename: dialog.filename,
      status: dialog.status,
      updated: true
   };
};

// Validate filename: only alphanumeric, dash, underscore, dot; must end in .md
var validFilename = function (name) {
   if (type (name) !== 'string') return false;
   if (! name.endsWith ('.md')) return false;
   if (name.includes ('..')) return false;
   if (name.includes ('/') || name.includes ('\\')) return false;
   return true;
}

// Resolve project for route handlers; replies with error and returns null on failure
var resolveProject = function (rs, projectName) {
   try {
      return getExistingProject (projectName);
   }
   catch (error) {
      reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
      return null;
   }
};

// *** ROUTES ***

var routes = [

   // *** STATIC ***

   ['get', '/', reply, lith.g ([
      ['!DOCTYPE HTML'],
      ['html', [
         ['head', [
            ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
            ['meta', {charset: 'utf-8'}],
            ['title', 'vibey'],
            ['link', {rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'}],
            ['link', {rel: 'stylesheet', href: 'https://unpkg.com/tachyons@4.12.0/css/tachyons.min.css'}],
         ]],
         ['body', [
            ['script', {src: 'https://cdn.jsdelivr.net/gh/fpereiro/gotob@434aa5a532fa0f9012743e935c4cd18eb5b3b3c5/gotoB.min.js'}],
            ['script', {src: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],
   ['get', 'client.js', cicek.file],
   ['get', 'test-client.js', cicek.file],

   // *** ACCOUNTS ***

   ['get', 'accounts', function (rq, rs) {
      var config = loadConfigJson ();
      var accounts = config.accounts || {};
      reply (rs, 200, {
         openai: {
            apiKey: maskApiKey ((accounts.openai && accounts.openai.apiKey) || ''),
            hasKey: !! (accounts.openai && accounts.openai.apiKey)
         },
         claude: {
            apiKey: maskApiKey ((accounts.claude && accounts.claude.apiKey) || ''),
            hasKey: !! (accounts.claude && accounts.claude.apiKey)
         },
         openaiOAuth: {
            loggedIn: !! (accounts.openaiOAuth && accounts.openaiOAuth.type === 'oauth'),
            expired: accounts.openaiOAuth ? Date.now () >= (accounts.openaiOAuth.expires || 0) : false
         },
         claudeOAuth: {
            loggedIn: !! (accounts.claudeOAuth && accounts.claudeOAuth.type === 'oauth'),
            expired: accounts.claudeOAuth ? Date.now () >= (accounts.claudeOAuth.expires || 0) : false
         }
      });
   }],

   ['post', 'accounts', function (rq, rs) {
      var config = loadConfigJson ();
      if (! config.accounts) config.accounts = {};

      if (type (rq.body.openaiKey) === 'string') {
         if (! config.accounts.openai) config.accounts.openai = {};
         config.accounts.openai.apiKey = rq.body.openaiKey.trim ();
      }
      if (type (rq.body.claudeKey) === 'string') {
         if (! config.accounts.claude) config.accounts.claude = {};
         config.accounts.claude.apiKey = rq.body.claudeKey.trim ();
      }

      saveConfigJson (config);
      reply (rs, 200, {ok: true});
   }],

   // OAuth login: start flow
   ['post', 'accounts/login/:provider', async function (rq, rs) {
      var provider = rq.data.params.provider;
      try {
         if (provider === 'claude') {
            var url = await startAnthropicLogin ();
            reply (rs, 200, {url: url, flow: 'paste_code'});
         }
         else if (provider === 'openai') {
            var url = await startOpenAILogin ();
            reply (rs, 200, {url: url, flow: 'callback'});
         }
         else {
            reply (rs, 400, {error: 'Unknown provider: ' + provider});
         }
      }
      catch (error) {
         reply (rs, 500, {error: error.message});
      }
   }],

   // OAuth login: complete flow (paste code or wait for callback)
   ['post', 'accounts/login/:provider/callback', async function (rq, rs) {
      var provider = rq.data.params.provider;
      try {
         if (provider === 'claude') {
            if (type (rq.body.code) !== 'string' || ! rq.body.code.trim ()) return reply (rs, 400, {error: 'code is required'});
            var result = await completeAnthropicLogin (rq.body.code.trim ());
            reply (rs, 200, result);
         }
         else if (provider === 'openai') {
            // manualCode is optional; if not provided, waits for browser callback
            var result = await completeOpenAILogin (rq.body.code || null);
            reply (rs, 200, result);
         }
         else {
            reply (rs, 400, {error: 'Unknown provider: ' + provider});
         }
      }
      catch (error) {
         reply (rs, 500, {error: error.message});
      }
   }],

   // OAuth logout
   ['post', 'accounts/logout/:provider', function (rq, rs) {
      var provider = rq.data.params.provider;
      var config = loadConfigJson ();
      if (! config.accounts) config.accounts = {};

      if (provider === 'claude') {
         delete config.accounts.claudeOAuth;
      }
      else if (provider === 'openai') {
         delete config.accounts.openaiOAuth;
      }
      else {
         return reply (rs, 400, {error: 'Unknown provider: ' + provider});
      }

      saveConfigJson (config);
      reply (rs, 200, {ok: true});
   }],

   // *** PROJECTS ***

   ['get', 'projects', function (rq, rs) {
      try {
         reply (rs, 200, listProjects ());
      }
      catch (error) {
         reply (rs, 500, {error: error.message});
      }
   }],

   ['post', 'projects', function (rq, rs) {
      if (stop (rs, [['name', rq.body.name, 'string']])) return;
      try {
         var displayName = rq.body.name.trim ();
         var slug = ensureProject (displayName);
         if (! pfs.exists (slug, 'doc-main.md')) {
            pfs.writeFile (slug, 'doc-main.md', '# ' + displayName + '\n');
         }
         reply (rs, 200, {ok: true, slug: slug, name: displayName});
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   ['delete', 'projects/:name', function (rq, rs) {
      var projectName = rq.data.params.name;

      try {
         validateProjectName (projectName);
      }
      catch (error) {
         return reply (rs, 400, {error: error.message});
      }

      if (! projectExists (projectName)) return reply (rs, 404, {error: 'Project not found'});

      // Abort active dialog streams
      try {
         var files = pfs.readdir (projectName);
         dale.go (files, function (file) {
            var parsed = parseDialogFilename (file);
            if (! parsed) return;
            var active = getActiveStream (parsed.dialogId);
            if (! active) return;
            active.requestedStatus = 'done';
            active.controller.abort ();
            endActiveStream (parsed.dialogId);
         });
      }
      catch (error) {}

      removeProjectContainer (projectName);
      reply (rs, 200, {ok: true, name: projectName});
   }],

   ['post', 'project/:project/snapshot', function (rq, rs) {
      if (stop (rs, [['type', rq.body.type, 'string', {oneOf: ['zip', 'project']}]])) return;

      var projectName = rq.data.params.project;
      try {
         getExistingProject (projectName);
         var stamp = formatDialogTimestamp ();

         if (rq.body.type === 'project') {
            var snapshotName = (rq.body.name && rq.body.name.trim ()) || ('snapshot-' + projectName + '-' + stamp);
            ensureProject (snapshotName);
            // Copy files from source container to snapshot container
            var files = pfs.readdir (projectName);
            dale.go (files, function (file) {
               try {
                  var content = pfs.readFile (projectName, file);
                  pfs.writeFile (snapshotName, file, content);
               }
               catch (e) {}
            });
            return reply (rs, 200, {ok: true, type: 'project', name: snapshotName});
         }

         // zip snapshot: create zip inside the container, then we just report success
         var zipName = (rq.body.name && rq.body.name.trim ()) || (projectName + '-snapshot-' + stamp + '.zip');
         if (! /\.zip$/i.test (zipName)) zipName += '.zip';
         dockerExec (projectName, 'cd /workspace && zip -r ' + JSON.stringify (zipName) + ' .', function (error, stdout, stderr) {
            if (error) return reply (rs, 500, {error: 'zip failed: ' + error.message, stderr: stderr});
            reply (rs, 200, {ok: true, type: 'zip', file: zipName});
         });
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   // *** FILES ***

   ['get', 'project/:project/files', function (rq, rs) {
      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var files = pfs.readdir (projectName);
         var mdFiles = dale.fil (files, undefined, function (file) {
            if (file.endsWith ('.md')) return file;
         });
         // Sort by modification time, most recent first
         var withStats = dale.go (mdFiles, function (file) {
            var stat = pfs.stat (projectName, file);
            return {name: file, mtime: stat.mtime.getTime ()};
         });
         withStats.sort (function (a, b) { return b.mtime - a.mtime; });
         reply (rs, 200, dale.go (withStats, function (f) { return f.name; }));
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read directory'});
      }
   }],

   ['get', 'project/:project/file/:name', function (rq, rs) {
      var name = rq.data.params.name;
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         if (! pfs.exists (projectName, name)) return reply (rs, 404, {error: 'File not found'});
         var content = pfs.readFile (projectName, name);
         reply (rs, 200, {name: name, content: content});
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read file'});
      }
   }],

   ['post', 'project/:project/file/:name', function (rq, rs) {
      var name = rq.data.params.name;
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      if (stop (rs, [
         ['content', rq.body.content, 'string'],
      ])) return;

      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         pfs.writeFile (projectName, name, rq.body.content);
         reply (rs, 200, {ok: true, name: name});
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to write file'});
      }
   }],

   ['delete', 'project/:project/file/:name', function (rq, rs) {
      var name = rq.data.params.name;
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         if (! pfs.exists (projectName, name)) return reply (rs, 404, {error: 'File not found'});
         pfs.unlink (projectName, name);
         reply (rs, 200, {ok: true});
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to delete file'});
      }
   }],

   // *** LLM ***

   // Create a waiting dialog draft
   ['post', 'project/:project/dialog/new', function (rq, rs) {
      if (stop (rs, [
         ['provider', rq.body.provider, 'string', {oneOf: ['claude', 'openai']}],
      ])) return;

      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});
      if (rq.body.slug !== undefined && type (rq.body.slug) !== 'string') return reply (rs, 400, {error: 'slug must be a string'});

      try {
         var created = createWaitingDialog (rq.data.params.project, rq.body.provider, rq.body.model, rq.body.slug || 'dialog');
         reply (rs, 200, created);
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   // Create dialog + first turn (SSE)
   ['post', 'project/:project/dialog', async function (rq, rs) {
      if (stop (rs, [
         ['provider', rq.body.provider, 'string', {oneOf: ['claude', 'openai']}],
         ['prompt', rq.body.prompt, 'string'],
      ])) return;

      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});
      if (rq.body.slug !== undefined && type (rq.body.slug) !== 'string') return reply (rs, 400, {error: 'slug must be a string'});

      rs.writeHead (200, {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         'Connection': 'keep-alive'
      });

      try {
         var result = await startDialogTurn (
            rq.data.params.project,
            rq.body.provider,
            rq.body.prompt,
            rq.body.model,
            rq.body.slug,
            function (chunk) {
               rs.write ('data: ' + JSON.stringify ({type: 'chunk', content: chunk}) + '\n\n');
            }
         );

         rs.write ('data: ' + JSON.stringify ({type: 'done', result: result}) + '\n\n');
         rs.end ();
      }
      catch (error) {
         clog ('Chat error:', error.message);
         rs.write ('data: ' + JSON.stringify ({type: 'error', error: error.message}) + '\n\n');
         rs.end ();
      }
   }],

   // Update dialog (optional SSE when continuing)
   ['put', 'project/:project/dialog', async function (rq, rs) {
      if (stop (rs, [
         ['dialogId', rq.body.dialogId, 'string'],
      ])) return;

      if (rq.body.status !== undefined && ! inc (['waiting', 'done'], rq.body.status)) return reply (rs, 400, {error: 'status must be waiting or done'});
      if (rq.body.prompt !== undefined && type (rq.body.prompt) !== 'string') return reply (rs, 400, {error: 'prompt must be a string'});
      if (rq.body.provider !== undefined && (type (rq.body.provider) !== 'string' || ! inc (['claude', 'openai'], rq.body.provider))) return reply (rs, 400, {error: 'provider must be claude or openai'});
      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});

      var continues = type (rq.body.prompt) === 'string' && !! rq.body.prompt.trim ();

      if (! continues) {
         var active = getActiveStream (rq.body.dialogId);
         if (active && rq.body.status && inc (['waiting', 'done'], rq.body.status)) {
            active.requestedStatus = rq.body.status;
            active.controller.abort ();
            return reply (rs, 200, {ok: true, dialogId: rq.body.dialogId, interrupted: true, status: rq.body.status});
         }

         try {
            var result = await updateDialogTurn (rq.data.params.project, rq.body.dialogId, rq.body.status, null, rq.body.provider, rq.body.model, null);
            return reply (rs, 200, result);
         }
         catch (error) {
            return reply (rs, 400, {error: error.message});
         }
      }

      rs.writeHead (200, {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         'Connection': 'keep-alive'
      });

      var controller = beginActiveStream (rq.body.dialogId);

      try {
         var result = await updateDialogTurn (
            rq.data.params.project,
            rq.body.dialogId,
            rq.body.status,
            rq.body.prompt,
            rq.body.provider,
            rq.body.model,
            function (chunk) {
               rs.write ('data: ' + JSON.stringify ({type: 'chunk', content: chunk}) + '\n\n');
            },
            controller.signal
         );

         rs.write ('data: ' + JSON.stringify ({type: 'done', result: result}) + '\n\n');
         rs.end ();
      }
      catch (error) {
         if (error && error.name === 'AbortError') {
            try {
               var activeAfterAbort = getActiveStream (rq.body.dialogId);
               var requestedStatus = activeAfterAbort && activeAfterAbort.requestedStatus ? activeAfterAbort.requestedStatus : 'waiting';
               var dialogAfterAbort = loadDialog (rq.data.params.project, rq.body.dialogId);
               if (dialogAfterAbort.exists) setDialogStatus (rq.data.params.project, dialogAfterAbort, requestedStatus);
               rs.write ('data: ' + JSON.stringify ({type: 'done', result: {dialogId: rq.body.dialogId, filename: dialogAfterAbort.filename, status: requestedStatus, interrupted: true}}) + '\n\n');
               rs.end ();
            }
            catch (interruptError) {
               rs.write ('data: ' + JSON.stringify ({type: 'error', error: interruptError.message}) + '\n\n');
               rs.end ();
            }
         }
         else {
            clog ('Dialog update error:', error.message);
            rs.write ('data: ' + JSON.stringify ({type: 'error', error: error.message}) + '\n\n');
            rs.end ();
         }
      }
      finally {
         endActiveStream (rq.body.dialogId);
      }
   }],

   // Execute a tool directly
   ['post', 'project/:project/tool/execute', async function (rq, rs) {
      if (stop (rs, [
         ['toolName', rq.body.toolName, 'string'],
         ['toolInput', rq.body.toolInput, 'object'],
      ])) return;

      try {
         var result = await executeTool (rq.body.toolName, rq.body.toolInput, rq.data.params.project);
         reply (rs, 200, result);
      }
      catch (error) {
         clog ('Tool execution error:', error.message);
         reply (rs, 500, {success: false, error: error.message});
      }
   }],

   // Get dialog by ID
   ['get', 'project/:project/dialog/:id', function (rq, rs) {
      var dialogId = rq.data.params.id;
      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      var dialog = loadDialog (projectName, dialogId);
      if (! dialog.exists) return reply (rs, 404, {error: 'Dialog not found'});

      try {
         var content = pfs.readFile (projectName, dialog.filename);
         reply (rs, 200, {
            dialogId: dialogId,
            filename: dialog.filename,
            messages: parseSections (content),
            markdown: content
         });
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read dialog'});
      }
   }],

   // List all dialogs
   ['get', 'project/:project/dialogs', function (rq, rs) {
      var projectName = resolveProject (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var files = pfs.readdir (projectName);
         var dialogFiles = dale.fil (files, undefined, function (file) {
            if (file.startsWith ('dialog-') && file.endsWith ('.md')) return file;
         });
         // Sort by modification time, most recent first
         var withStats = dale.fil (dialogFiles, undefined, function (file) {
            var parsed = parseDialogFilename (file);
            if (! parsed) return;
            var stat = pfs.stat (projectName, file);
            return {dialogId: parsed.dialogId, status: parsed.status, filename: file, mtime: stat.mtime.getTime ()};
         });
         withStats.sort (function (a, b) { return b.mtime - a.mtime; });
         reply (rs, 200, withStats);
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read directory'});
      }
   }],

   // *** STATIC PROXY ***

   ['get', /^\/project\/([^/]+)\/static(\/.*)?$/, function (rq, rs) {
      var projectName = decodeURIComponent (rq.data.params [0]);
      var rawPath = rq.data.params [1] || '/';

      if (rq.rawurl) {
         var rawMatch = rq.rawurl.match (/\/static(\/[^?]*)?(\?.*)?$/);
         if (rawMatch) rawPath = rawMatch [1] || '/';
      }

      // Validate project exists
      var resolved = resolveProject (rs, projectName);
      if (! resolved) return;

      var filePath = rawPath || '/';
      if (filePath [0] !== '/') filePath = '/' + filePath;
      if (filePath === '/' || filePath [filePath.length - 1] === '/') filePath += 'index.html';
      filePath = filePath.replace (/^\//, '');

      // Prevent path traversal
      if (filePath.includes ('..')) return reply (rs, 400, {error: 'Invalid path'});

      try {
         var fullPath = '/workspace/' + filePath;
         if (! pfs.existsAt (projectName, fullPath)) return reply (rs, 404, {error: 'File not found'});

         var content = pfs.readFileBinaryAt (projectName, fullPath);

         // Determine content type from extension
         var ext = Path.extname (filePath).toLowerCase ();
         var contentTypes = {
            '.html': 'text/html', '.htm': 'text/html',
            '.js': 'application/javascript', '.mjs': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
            '.txt': 'text/plain', '.md': 'text/markdown',
            '.xml': 'application/xml',
            '.pdf': 'application/pdf',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
            '.mp4': 'video/mp4', '.webm': 'video/webm'
         };
         var contentType = contentTypes [ext] || 'application/octet-stream';

         rs.writeHead (200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'X-Frame-Options': 'SAMEORIGIN'
         });
         rs.end (content);
      }
      catch (error) {
         if (! rs.headersSent) reply (rs, 500, {error: 'Failed to serve file'});
      }
   }],

   // *** EMBED PROXY ***

   ['all', /^\/project\/([^/]+)\/proxy\/(\d+)(\/.*)?$/, function (rq, rs) {
      var projectName = decodeURIComponent (rq.data.params [0]);
      var port = Number (rq.data.params [1]);
      var proxyPath = rq.data.params [2] || '/';

      // cicek strips query strings from rq.url; reconstruct from rq.rawurl
      if (rq.rawurl) {
         var rawMatch = rq.rawurl.match (/\/proxy\/\d+(\/[^?]*)?(\?.*)?$/);
         if (rawMatch) {
            proxyPath = (rawMatch [1] || '/') + (rawMatch [2] || '');
         }
      }

      // Validate port
      if (port < 1 || port > 65535 || isNaN (port)) return reply (rs, 400, {error: 'Invalid port'});

      // Validate project exists
      try {
         getExistingProject (projectName);
      }
      catch (error) {
         return reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
      }

      // Resolve container IP on vibey-net
      var targetHost;
      try {
         targetHost = getContainerIP (projectName);
      }
      catch (e) {
         return reply (rs, 502, {error: 'Could not resolve container IP: ' + e.message});
      }

      // Build forwarded headers (strip hop-by-hop)
      var HOP_BY_HOP = {host: 1, connection: 1, 'keep-alive': 1, 'proxy-authenticate': 1, 'proxy-authorization': 1, te: 1, trailer: 1, 'transfer-encoding': 1, upgrade: 1, 'content-length': 1};
      var forwardHeaders = {};
      dale.go (rq.headers, function (v, k) {
         if (! HOP_BY_HOP [k]) forwardHeaders [k] = v;
      });
      forwardHeaders.host = targetHost + ':' + port;

      // Recalculate content-length since cicek already consumed the body
      if (rq.body && rq.method !== 'GET' && rq.method !== 'HEAD') {
         var bodyBuf = type (rq.body) === 'string' ? rq.body : JSON.stringify (rq.body);
         forwardHeaders ['content-length'] = Buffer.byteLength (bodyBuf);
      }

      var proxyReq = http.request ({
         hostname: targetHost,
         port: port,
         path: proxyPath,
         method: rq.method,
         headers: forwardHeaders
      }, function (proxyRes) {
         // Copy response headers, add X-Frame-Options
         var resHeaders = {};
         dale.go (proxyRes.headers, function (v, k) {
            if (! HOP_BY_HOP [k]) resHeaders [k] = v;
         });
         resHeaders ['x-frame-options'] = 'SAMEORIGIN';

         rs.writeHead (proxyRes.statusCode, resHeaders);
         proxyRes.pipe (rs);
      });

      proxyReq.on ('error', function (error) {
         if (! rs.headersSent) reply (rs, 502, {error: 'Proxy error: ' + error.message});
         else rs.end ();
      });

      // cicek already consumed the body into rq.body; write it through
      if (rq.body && rq.method !== 'GET' && rq.method !== 'HEAD') {
         var bodyStr = type (rq.body) === 'string' ? rq.body : JSON.stringify (rq.body);
         proxyReq.end (bodyStr);
      }
      else {
         proxyReq.end ();
      }
   }],
];

// *** SERVER ***

process.on ('uncaughtException', function (error, origin) {
   clog ({priority: 'critical', type: 'server error', error: error, stack: error.stack, origin: origin});
   process.exit (1);
});

// Docker housekeeping: ensure network exists, cleanup orphaned containers on startup
clog ('Ensuring Docker network and cleaning up orphaned project containers...');
ensureNetwork ();
cleanupProjectContainers ();

// Docker housekeeping: kill project containers on shutdown
var cleanupAndExit = function (signal) {
   clog ('Received ' + signal + ', cleaning up...');
   cleanupProjectContainers ();
   process.exit (0);
};

process.on ('SIGTERM', function () {cleanupAndExit ('SIGTERM');});
process.on ('SIGINT',  function () {cleanupAndExit ('SIGINT');});

var port = 5353;
cicek.listen ({port: port}, routes);

clog ('vibey server running on port ' + port);
