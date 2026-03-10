// *** SETUP ***

var fs    = require ('fs');
var Path  = require ('path');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');

var clog = console.log;

var type = teishi.type, eq = teishi.eq, last = teishi.last, inc = teishi.inc;

var LOG_COLORS = {
   ok: '\033[37m\033[42m',
   failed: '\033[37m\033[41m',
   info: '\033[37m\033[46m'
};

var colorLog = function (text, color) {
   color = color || LOG_COLORS.info;
   return color + text + '\033[0m\033[1m';
};

var logCodeColor = function (code) {
   code = String (code || '0');
   return colorLog (code, '\033[37m\033[4' + ({1: 6, 2: 2, 3: 4, 4: 3, 5: 1}) [code [0] || '5'] + 'm');
};

var logSeq = 0;
var nextLogId = function () {
   logSeq++;
   return logSeq.toString (16).padStart (12, '0');
};

var logLine = function (kind, id) {
   var parts = Array.prototype.slice.call (arguments, 2);
   console.log ([kind, id].concat (parts).join (' '));
};

var logDockerStart = function (id, project, command) {
   logLine ('DOCKER REQ', id, project, command.slice (0, 200));
};

var logDockerEnd = function (id, project, ok, ms, detail) {
   var status = ok ? colorLog ('OK', LOG_COLORS.ok) : colorLog ('FAILED', LOG_COLORS.failed);
   logLine ('DOCKER RES', id, project, status, '(' + ms + 'ms)', detail ? detail.slice (0, 200) : '');
};

var logStreamEvent = function (kind, id, projectName, dialogId, eventType, extra) {
   logLine (kind, id, projectName, 'dialog=' + dialogId, 'type=' + eventType, extra || '');
};

var reply = function (rs, code, body, headers) {
   try {
      if (! rs) return;
      if (rs.headersSent || rs.writableEnded || rs.destroyed) return;
      if (rs.connection && rs.connection.writable === false) return;
      return cicek.reply (rs, code, body, headers);
   }
   catch (error) {}
}

var stop = function (rs, rules) {
   return teishi.stop (rules, function (error) {
      reply (rs, 400, {error: error});
   }, true);
}

// *** HELPERS ***

var crypto = require ('crypto');
var http   = require ('http');
var EventEmitter = require ('events');

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

   if (state && state !== verifier) throw new Error ('Anthropic OAuth state mismatch');

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

      server.listen (1455, '0.0.0.0', function () {
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
      if (parts [1] && parts [1] !== state) throw new Error ('OpenAI OAuth state mismatch');
      // Check for URL format
      try {
         var url = new URL (manualCode.trim ());
         var urlState = url.searchParams.get ('state');
         if (urlState && urlState !== state) throw new Error ('OpenAI OAuth state mismatch');
         code = url.searchParams.get ('code') || code;
      }
      catch (e) {
         if (e && /state mismatch/.test (e.message)) throw e;
      }
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

var SANDBOX_IMAGE = 'vibey-sandbox:latest';

// Promisified exec for non-blocking docker operations
var dockerCmdId = 0;
var dockerProject = function (command) {
   var match = command.match (/vibey-proj-(\S+)/);
   return match ? match [1] : 'system';
};
var execA = function (command, options) {
   var id = nextLogId ();
   dockerCmdId++;
   var project = dockerProject (command);
   logDockerStart (id, project, command);
   var t = Date.now ();
   return new Promise (function (resolve, reject) {
      exec (command, options || {encoding: 'utf8', maxBuffer: 5 * 1024 * 1024}, function (error, stdout, stderr) {
         if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            logDockerEnd (id, project, false, Date.now () - t, error.message || '');
            reject (error);
         }
         else {
            logDockerEnd (id, project, true, Date.now () - t);
            resolve ((stdout || '').toString ());
         }
      });
   });
};

// Promisified exec that returns a Buffer (for binary reads)
var execABuf = function (command, options) {
   var id = nextLogId ();
   dockerCmdId++;
   var project = dockerProject (command);
   logDockerStart (id, project, command);
   var t = Date.now ();
   return new Promise (function (resolve, reject) {
      exec (command, options || {encoding: 'buffer', maxBuffer: 5 * 1024 * 1024}, function (error, stdout, stderr) {
         if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            logDockerEnd (id, project, false, Date.now () - t, error.message || '');
            reject (error);
         }
         else {
            logDockerEnd (id, project, true, Date.now () - t);
            resolve (stdout);
         }
      });
   });
};

// Promisified exec with stdin piped in (for writes)
var execAWithInput = function (command, input, encoding) {
   var id = nextLogId ();
   dockerCmdId++;
   var project = dockerProject (command);
   logDockerStart (id, project, command);
   var t = Date.now ();
   return new Promise (function (resolve, reject) {
      var child = exec (command, {encoding: encoding || 'utf8', maxBuffer: 5 * 1024 * 1024}, function (error, stdout, stderr) {
         if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            logDockerEnd (id, project, false, Date.now () - t, error.message || '');
            reject (error);
         }
         else {
            logDockerEnd (id, project, true, Date.now () - t);
            resolve ((stdout || '').toString ());
         }
      });
      if (input !== undefined && input !== null) {
         child.stdin.write (input);
      }
      child.stdin.end ();
   });
};

var containerName = function (projectName) {
   return 'vibey-proj-' + projectName;
};

var volumeName = function (projectName) {
   return 'vibey-vol-' + projectName;
};

var dockerErrorText = function (error) {
   return [error && error.message, error && error.stderr, error && error.stdout].filter (Boolean).join ('\n').toLowerCase ();
};

var isNoSuchContainerError = function (error) {
   var text = dockerErrorText (error);
   return text.includes ('no such container');
};

var isAlreadyRunningContainerError = function (error) {
   var text = dockerErrorText (error);
   return text.includes ('is already running');
};

var isNoSuchFileError = function (error) {
   var text = dockerErrorText (error);
   return text.includes ('no such file or directory') || text.includes ('cannot stat') || text.includes ('can\'t stat');
};

var cleanupProjectContainers = async function () {
   try {
      var ids = (await execA ('docker ps -aq --filter label=vibey=project')).trim ();
      if (ids) {
         await execA ('docker rm -f ' + ids);
      }
   }
   catch (e) {
      // No containers to clean or docker not available
   }
};

var ensureProjectContainer = async function (projectName, options) {
   options = options || {};
   var name = containerName (projectName);
   var vol = volumeName (projectName);

   try {
      await execA ('docker start ' + name);
      return true;
   }
   catch (error) {
      if (! isNoSuchContainerError (error)) {
         if (isAlreadyRunningContainerError (error)) return true;
         throw error;
      }
   }

   if (options.createVolume) {
      try {
         await execA ('docker volume inspect ' + vol + ' >/dev/null 2>&1');
      }
      catch (e) {
         await execA ('docker volume create --label vibey=project --label vibey-project=' + projectName + ' ' + vol);
      }
   }
   else {
      if (! (await volumeExists (projectName))) return false;
   }

   await execA (
      'docker run -d' +
      ' --name ' + name +
      ' --label vibey=project' +
      ' --label vibey-project=' + projectName +
      ' -v ' + vol + ':/workspace' +
      ' -w /workspace' +
      ' ' + SANDBOX_IMAGE
   );
   return true;
};

var replyProjectMissing = function (rs) {
   if (rs) {
      reply (rs, 404, {error: 'Project not found'});
      return false;
   }
   throw new Error ('Project not found');
};

var withProjectContainerRecovery = async function (projectName, rs, fn) {
   try {
      return await fn ();
   }
   catch (error) {
      if (! isNoSuchContainerError (error)) throw error;
   }

   if (! (await ensureProjectContainer (projectName, {createVolume: false}))) {
      return replyProjectMissing (rs);
   }

   try {
      return await fn ();
   }
   catch (error) {
      if (isNoSuchContainerError (error)) return replyProjectMissing (rs);
      throw error;
   }
};

var removeProjectContainer = async function (projectName) {
   var name = containerName (projectName);
   var vol = volumeName (projectName);
   var removed = false;
   try {
      await execA ('docker rm -f ' + name);
      removed = true;
   }
   catch (e) {}
   try {
      await execA ('docker volume rm ' + vol);
      removed = true;
   }
   catch (e) {}
   // Clear cached git-repo-ready flag so resurrection re-initializes
   if (GIT_REPO_READY) delete GIT_REPO_READY [projectName];
   return removed;
};

var getContainerIP = async function (projectName, rs) {
   var name = containerName (projectName);
   var ip = await withProjectContainerRecovery (projectName, rs, function () {
      return execA ("docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' " + name);
   });
   if (ip === false) return false;
   ip = ip.trim ();
   if (! ip) throw new Error ('Container has no IP address');
   return ip;
};

var shQuote = function (value) {
   return "'" + String (value).replace (/'/g, "'\\''") + "'";
};

var dockerExec = async function (projectName, command, rs) {
   var name = containerName (projectName);
   // Escape single quotes in command for sh -c
   var escaped = command.replace (/'/g, "'\\''");
   // Use setsid so that backgrounded processes (e.g. `node server.js &`) survive
   // the docker exec session ending. Without setsid, docker kills orphaned children
   // when the sh process exits.
   var run = function () {
      return new Promise (function (resolve) {
         exec ('docker exec ' + name + " setsid sh -c '" + escaped + "'", {timeout: 30000, maxBuffer: 1024 * 1024}, function (error, stdout, stderr) {
            if (error) {
               error.stdout = stdout;
               error.stderr = stderr;
               resolve ({error: error, stdout: stdout, stderr: stderr});
            }
            else resolve ({error: null, stdout: stdout, stderr: stderr});
         });
      });
   };

   var result = await run ();
   if (! result.error || ! isNoSuchContainerError (result.error)) return result;

   if (! (await ensureProjectContainer (projectName, {createVolume: false}))) {
      return replyProjectMissing (rs);
   }

   result = await run ();
   if (result.error && isNoSuchContainerError (result.error)) return replyProjectMissing (rs);
   return result;
};

// *** PROJECT FS ***

// All project file operations go through the container boundary.
// These are async (using exec) to avoid blocking the event loop.

var pfs = {
   readdir: async function (projectName, rs) {
      var name = containerName (projectName);
      try {
         var output = await withProjectContainerRecovery (projectName, rs, function () {
            return execA ('docker exec ' + name + " sh -c 'find /workspace -type f'");
         });
         if (output === false) return false;
         output = output.trim ();
         if (! output) return [];
         return dale.fil (output.split ('\n'), undefined, function (line) {
            if (! line) return;
            return line.replace (/^\/workspace\//, '');
         });
      }
      catch (e) {
         return [];
      }
   },

   readFile: async function (projectName, filename, rs) {
      var name = containerName (projectName);
      var content = await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' cat ' + shQuote ('/workspace/' + filename));
      });
      return content;
   },

   writeFile: async function (projectName, filename, content, rs) {
      var name = containerName (projectName);
      var dir = filename.replace (/\/[^/]+$/, '');
      var command = (dir && dir !== filename ? 'mkdir -p ' + shQuote ('/workspace/' + dir) + ' && ' : '') + 'cat > ' + shQuote ('/workspace/' + filename);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execAWithInput ('docker exec -i ' + name + ' sh -c ' + JSON.stringify (command), content);
      });
   },

   appendFile: async function (projectName, filename, content, rs) {
      var name = containerName (projectName);
      var dir = filename.replace (/\/[^/]+$/, '');
      var command = (dir && dir !== filename ? 'mkdir -p ' + shQuote ('/workspace/' + dir) + ' && ' : '') + 'cat >> ' + shQuote ('/workspace/' + filename);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execAWithInput ('docker exec -i ' + name + ' sh -c ' + JSON.stringify (command), content);
      });
   },

   rename: async function (projectName, oldName, newName, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' mv ' + shQuote ('/workspace/' + oldName) + ' ' + shQuote ('/workspace/' + newName));
      });
   },

   unlink: async function (projectName, filename, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' rm ' + shQuote ('/workspace/' + filename));
      });
   },

   statsDetailed: async function (projectName, filenames, rs) {
      var name = containerName (projectName);
      filenames = filenames || [];
      if (! filenames.length) return [];

      var command = 'for f in';
      dale.go (filenames, function (filename) {
         command += ' ' + shQuote ('/workspace/' + filename);
      });
      command += '; do stat -c "%Y %s %n" "$f"; done';

      var output = await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' sh -c ' + shQuote (command));
      });
      if (output === false) return false;
      output = output.trim ();
      if (! output) return [];

      return dale.fil (output.split ('\n'), undefined, function (line) {
         line = line.trim ();
         if (! line) return;
         var match = line.match (/^(\d+)\s+(\d+)\s+\/workspace\/(.+)$/);
         if (! match) return;
         return {
            name: match [3],
            mtime: new Date (Number (match [1]) * 1000),
            size: Number (match [2] || 0)
         };
      });
   },

   // Read a file from any path inside the container (for static proxy)
   readFileAt: async function (projectName, path, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' cat ' + shQuote (path));
      });
   },

   // Read a binary file from any path inside the container (for static proxy)
   readFileBinaryAt: async function (projectName, path, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execABuf ('docker exec ' + name + ' cat ' + shQuote (path));
      });
   },

   // mkdir -p for a path inside /workspace
   mkdirp: async function (projectName, dirpath, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' mkdir -p ' + shQuote ('/workspace/' + dirpath));
      });
   },

   // Write file at any path inside /workspace (for tool write_file)
   writeFileAt: async function (projectName, filepath, content, rs) {
      var name = containerName (projectName);
      var dir = filepath.replace (/\/[^/]+$/, '');
      var command = (dir && dir !== filepath ? 'mkdir -p ' + shQuote ('/workspace/' + dir) + ' && ' : '') + 'cat > ' + shQuote ('/workspace/' + filepath);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execAWithInput ('docker exec -i ' + name + ' sh -c ' + JSON.stringify (command), content);
      });
   },

   // Write binary file at any path inside /workspace (for uploads)
   writeFileBinaryAt: async function (projectName, filepath, content, rs) {
      var name = containerName (projectName);
      var dir = filepath.replace (/\/[^/]+$/, '');
      var command = (dir && dir !== filepath ? 'mkdir -p ' + shQuote ('/workspace/' + dir) + ' && ' : '') + 'cat > ' + shQuote ('/workspace/' + filepath);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execAWithInput ('docker exec -i ' + name + ' sh -c ' + JSON.stringify (command), content, 'buffer');
      });
   },

   // Read file at any path inside /workspace (for tool edit_file)
   readFileInWorkspace: async function (projectName, filepath, rs) {
      var name = containerName (projectName);
      return await withProjectContainerRecovery (projectName, rs, function () {
         return execA ('docker exec ' + name + ' cat ' + shQuote ('/workspace/' + filepath));
      });
   }
};

// *** AUTO COMMIT ***

var PROJECT_COMMIT_QUEUES = {};

var withProjectCommitLock = function (projectName, fn) {
   var previous = PROJECT_COMMIT_QUEUES [projectName] || Promise.resolve ();

   var next = previous.then (function () {
      return fn ();
   });

   var settled = next.catch (function () {});
   PROJECT_COMMIT_QUEUES [projectName] = settled;

   return next.finally (function () {
      if (PROJECT_COMMIT_QUEUES [projectName] === settled) delete PROJECT_COMMIT_QUEUES [projectName];
   });
};

var PROJECT_MUTATION_QUEUES = {};

var withProjectMutationLock = function (projectName, fn) {
   var previous = PROJECT_MUTATION_QUEUES [projectName] || Promise.resolve ();

   var next = previous.then (function () {
      return fn ();
   });

   var settled = next.catch (function () {});
   PROJECT_MUTATION_QUEUES [projectName] = settled;

   return next.finally (function () {
      if (PROJECT_MUTATION_QUEUES [projectName] === settled) delete PROJECT_MUTATION_QUEUES [projectName];
   });
};

var gitExecAsync = function (projectName, command) {
   var name = containerName (projectName);
   var cmd = 'docker exec ' + name + ' sh -lc ' + shQuote (command);
   return new Promise (function (resolve, reject) {
      exec (cmd, {encoding: 'utf8', maxBuffer: 5 * 1024 * 1024}, function (error, stdout, stderr) {
         if (error) reject (error);
         else resolve ((stdout || '').trim ());
      });
   });
};

var gitExecQuietAsync = function (projectName, command) {
   return gitExecAsync (projectName, command).catch (function () {return '';});
};

var GIT_REPO_READY = {};

var ensureProjectGitRepo = function (projectName) {
   if (GIT_REPO_READY [projectName]) return Promise.resolve ();

   return gitExecAsync (projectName, 'test -d /workspace/.git && echo ok || echo no').then (function (out) {
      if (out !== 'ok') return gitExecAsync (projectName, 'git -C /workspace init');
   }).then (function () {
      return gitExecQuietAsync (projectName, 'git -C /workspace config --get user.name');
   }).then (function (userName) {
      if (! userName) return gitExecAsync (projectName, 'git -C /workspace config user.name ' + shQuote ('vibey'));
   }).then (function () {
      return gitExecQuietAsync (projectName, 'git -C /workspace config --get user.email');
   }).then (function (userEmail) {
      if (! userEmail) return gitExecAsync (projectName, 'git -C /workspace config user.email ' + shQuote ('vibey@local'));
   }).then (function () {
      GIT_REPO_READY [projectName] = true;
   });
};

var autoCommitMessage = function (meta) {
   meta = meta || {};
   if (meta.kind === 'tool') return 'vibey:auto tool ' + (meta.tool || 'unknown');
   if (meta.kind === 'api') {
      var method = (meta.method || 'MUTATE').toUpperCase ();
      return 'vibey:auto api ' + method + ' ' + (meta.path || '/');
   }
   return 'vibey:auto commit';
};

var maybeAutoCommit = function (projectName, meta) {
   return withProjectCommitLock (projectName, function () {
      var message = autoCommitMessage (meta);
      return ensureProjectGitRepo (projectName).then (function () {
         return gitExecAsync (projectName, 'cd /workspace && if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -m ' + shQuote (message) + ' && git rev-parse HEAD; else echo NOCOMMIT; fi');
      }).then (function (output) {
         if (output === 'NOCOMMIT') return {committed: false};
         return {committed: true, hash: output.split ('\n').pop (), message: message};
      });
   });
};

// *** SNAPSHOTS ***

var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};

var formatDialogTimestamp = function () {
   var d = new Date ();
   return d.getUTCFullYear () + '' + pad2 (d.getUTCMonth () + 1) + pad2 (d.getUTCDate ()) + '-' + pad2 (d.getUTCHours ()) + pad2 (d.getUTCMinutes ()) + pad2 (d.getUTCSeconds ());
};

var DATA_DIR = Path.join (__dirname, 'data');
var SNAPSHOTS_DIR = Path.join (DATA_DIR, 'snapshots');

var ensureSnapshotsDir = function () {
   if (! fs.existsSync (SNAPSHOTS_DIR)) fs.mkdirSync (SNAPSHOTS_DIR, {recursive: true});
};

var SNAPSHOTS_INDEX = Path.join (SNAPSHOTS_DIR, 'snapshots.json');

var loadSnapshotsIndex = function () {
   ensureSnapshotsDir ();
   try {
      if (fs.existsSync (SNAPSHOTS_INDEX)) return JSON.parse (fs.readFileSync (SNAPSHOTS_INDEX, 'utf8'));
   }
   catch (e) {}
   return [];
};

var saveSnapshotsIndex = function (index) {
   ensureSnapshotsDir ();
   fs.writeFileSync (SNAPSHOTS_INDEX, JSON.stringify (index, null, 2), 'utf8');
};

var generateSnapshotId = function () {
   return formatDialogTimestamp () + '-' + crypto.randomBytes (4).toString ('hex');
};

var createSnapshot = async function (projectName, label) {
   projectName = validateProjectName (projectName);
   ensureSnapshotsDir ();

   var id = generateSnapshotId ();
   var archiveName = id + '.tar.gz';
   var archivePath = Path.join (SNAPSHOTS_DIR, archiveName);
   var name = containerName (projectName);

   // Create tar.gz of /workspace inside the project container, pipe it out
   var archived = await withProjectContainerRecovery (projectName, null, function () {
      return execA ('docker exec ' + name + ' tar czf - -C /workspace . > ' + JSON.stringify (archivePath), {encoding: 'buffer', shell: '/bin/sh'});
   });
   if (archived === false) throw new Error ('Project not found');

   var fileCount = 0;
   try {
      // Count all files recursively under /workspace
      var counted = await withProjectContainerRecovery (projectName, null, function () {
         return execA ('docker exec ' + name + " sh -c 'find /workspace -type f | wc -l'");
      });
      if (counted !== false) fileCount = Number (counted.trim ()) || 0;
   }
   catch (e) {}

   var displayName = unslugifyProjectName (projectName);

   var entry = {
      id: id,
      project: projectName,
      projectName: displayName,
      label: label || '',
      file: archiveName,
      created: new Date ().toISOString (),
      fileCount: fileCount
   };

   var index = loadSnapshotsIndex ();
   index.unshift (entry);
   saveSnapshotsIndex (index);

   return entry;
};

var restoreSnapshot = async function (snapshotId, newProjectName) {
   var index = loadSnapshotsIndex ();
   var entry = dale.stopNot (index, undefined, function (e) {
      if (e.id === snapshotId) return e;
   });
   if (! entry) throw new Error ('Snapshot not found: ' + snapshotId);

   var archivePath = Path.join (SNAPSHOTS_DIR, entry.file);
   if (! fs.existsSync (archivePath)) throw new Error ('Snapshot archive missing: ' + entry.file);

   var displayName = newProjectName || (entry.projectName + ' (restored ' + formatDialogTimestamp () + ')');
   var slug = await ensureProject (displayName);

   var name = containerName (slug);
   // Pipe the tar.gz into the new container's /workspace
   await execA ('cat ' + JSON.stringify (archivePath) + ' | docker exec -i ' + name + ' tar xzf - -C /workspace', {encoding: 'buffer', shell: '/bin/sh'});

   return {slug: slug, name: displayName, snapshotId: snapshotId};
};

var deleteSnapshot = function (snapshotId) {
   var index = loadSnapshotsIndex ();
   var found = false;
   var newIndex = dale.fil (index, undefined, function (e) {
      if (e.id === snapshotId) {
         found = true;
         // Delete archive file
         var archivePath = Path.join (SNAPSHOTS_DIR, e.file);
         try {
            if (fs.existsSync (archivePath)) fs.unlinkSync (archivePath);
         }
         catch (err) {}
         return;
      }
      return e;
   });
   if (! found) throw new Error ('Snapshot not found: ' + snapshotId);
   saveSnapshotsIndex (newIndex);
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

var volumeExists = async function (projectName) {
   var vol = volumeName (projectName);
   try {
      await execA ('docker volume inspect ' + vol + ' >/dev/null 2>&1');
      return true;
   }
   catch (e) {
      return false;
   }
};

var validProjectNameOrReply = function (rs, projectName) {
   try {
      return validateProjectName (projectName);
   }
   catch (error) {
      reply (rs, 400, {error: error.message});
      return false;
   }
};

var ensureProject = async function (projectName) {
   var slug = slugifyProjectName (projectName);
   await ensureProjectContainer (slug, {createVolume: true});
   await ensureProjectLayout (slug);
   return slug;
};

var listProjects = async function () {
   try {
      var projectsBySlug = {};

      var output = (await execA ('docker ps -a --filter label=vibey=project --format "{{.Names}}"')).trim ();
      if (output) {
         var names = output.split ('\n');
         dale.go (names, function (name) {
            if (name.indexOf ('vibey-proj-') !== 0) return;
            var slug = name.slice ('vibey-proj-'.length);
            projectsBySlug [slug] = {slug: slug, name: unslugifyProjectName (slug)};
         });
      }

      var volumes = (await execA ('docker volume ls -q --filter label=vibey=project')).trim ();
      if (volumes) {
         var volumeNames = volumes.split ('\n').filter (Boolean);
         if (volumeNames.length) {
            var format = '{{.Name}} {{index .Labels "vibey-project"}}';
            var inspect = (await execA ('docker volume inspect -f ' + shQuote (format) + ' ' + dale.go (volumeNames, shQuote).join (' '))).trim ();
            if (inspect) {
               dale.go (inspect.split ('\n'), function (line) {
                  line = line.trim ();
                  if (! line) return;
                  var parts = line.split (' ');
                  var volName = parts [0] || '';
                  var labelSlug = parts.slice (1).join (' ').trim ();
                  var slug = labelSlug;
                  if (! slug && volName.indexOf ('vibey-vol-') === 0) slug = volName.slice ('vibey-vol-'.length);
                  if (! slug) return;
                  if (! projectsBySlug [slug]) projectsBySlug [slug] = {slug: slug, name: unslugifyProjectName (slug)};
               });
            }
         }
      }

      var projects = dale.go (projectsBySlug, function (project) {return project;});
      projects.sort (function (a, b) {return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);});
      return projects;
   }
   catch (e) {
      return [];
   }
};

var ACTIVE_STREAMS = {};
var DIALOG_START_LOCKS = {};

var activeStreamKey = function (projectName, dialogId) {
   return projectName + '::' + dialogId;
};

var dialogLockKey = function (projectName, dialogId) {
   return projectName + '::' + dialogId;
};

var beginActiveStream = function (projectName, dialogId) {
   var controller = new AbortController ();
   var emitter = new EventEmitter ();
   emitter.setMaxListeners (50);
   var resolve;
   var settled = new Promise (function (r) { resolve = r; });
   ACTIVE_STREAMS [activeStreamKey (projectName, dialogId)] = {controller: controller, requestedStatus: null, emitter: emitter, settled: settled, settle: resolve};
   return {controller: controller, emitter: emitter, settle: resolve};
};

var getActiveStream = function (projectName, dialogId) {
   return ACTIVE_STREAMS [activeStreamKey (projectName, dialogId)] || null;
};

var endActiveStream = function (projectName, dialogId) {
   var stream = ACTIVE_STREAMS [activeStreamKey (projectName, dialogId)];
   if (stream && stream.emitter) stream.emitter.removeAllListeners ();
   delete ACTIVE_STREAMS [activeStreamKey (projectName, dialogId)];
};

var DOC_DIR = 'doc';
var DIALOG_DIR = 'dialog';
var UPLOAD_DIR = 'uploads';
var DOC_MAIN_FILE = DOC_DIR + '/main.md';

var managedFilePath = function (name) {
   if (type (name) !== 'string') return false;
   return name.indexOf (DOC_DIR + '/') === 0 || name.indexOf (DIALOG_DIR + '/') === 0;
};

var isUploadPath = function (name) {
   if (type (name) !== 'string') return false;
   return name.indexOf (UPLOAD_DIR + '/') === 0;
};

var ensureProjectLayout = async function (projectName) {
   try {
      await pfs.mkdirp (projectName, DOC_DIR);
      await pfs.mkdirp (projectName, DIALOG_DIR);
      await pfs.mkdirp (projectName, UPLOAD_DIR);
   }
   catch (e) {}
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

var getDocMainContent = async function (projectName) {
   try {
      var content = await pfs.readFile (projectName, DOC_MAIN_FILE);
      if (! content || ! content.trim ()) return null;
      return {name: DOC_MAIN_FILE, content: content.trim ()};
   }
   catch (error) {
      if (isNoSuchFileError (error)) return null;
      throw error;
   }
};

var getDocMainInjection = async function (projectName) {
   var docMain = await getDocMainContent (projectName);
   if (! docMain) return '';
   return '\n\nProject instructions (' + docMain.name + '):\n\n' + docMain.content;
};

var upsertDocMainContextBlock = async function (projectName, filename) {
   var markdown;
   try {
      markdown = await pfs.readFile (projectName, filename);
   }
   catch (error) {
      if (isNoSuchFileError (error)) return;
      throw error;
   }
   var blockRe = /<!-- DOC_MAIN_CONTEXT_START -->[\s\S]*?<!-- DOC_MAIN_CONTEXT_END -->\n\n?/;
   markdown = markdown.replace (blockRe, '');

   var docMain = await getDocMainContent (projectName);
   if (! docMain) {
      await pfs.writeFile (projectName, filename, markdown);
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

   await pfs.writeFile (projectName, filename, markdown);
};

// *** MCP TOOLS ***

// Context window sizes (tokens) per model
// Sources:
//   OpenAI: user-provided for gpt-5.4 (2026-03-09)
//   Claude: docs.anthropic.com/en/docs/about-claude/models (200K standard)
var CONTEXT_WINDOWS = {
   'gpt-5.4':                    1050000,
   'gpt-5.2-codex':              272000,
   'claude-opus-4-6':            200000,
   'claude-sonnet-4-6':          200000,
};

var getContextWindowSize = function (model) {
   return CONTEXT_WINDOWS [model] || 200000;
};

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
var executeTool = async function (toolName, toolInput, projectName, rs) {
   try {
      projectName = validateProjectName (projectName);
   }
   catch (error) {
      return {success: false, error: error.message};
   }

   var finalizeTool = async function (result) {
      try {
         await maybeAutoCommit (projectName, {kind: 'tool', tool: toolName});
      }
      catch (error) {
         return {success: false, error: 'Auto-commit failed after tool ' + toolName + ': ' + error.message};
      }
      return result;
   };

   if (toolName === 'run_command') {
      var r = await dockerExec (projectName, toolInput.command, rs);
      if (r === false) return false;
      if (r.error) return await finalizeTool ({success: false, error: r.error.message, stderr: r.stderr});
      else         return await finalizeTool ({success: true, stdout: r.stdout, stderr: r.stderr});
   }

   if (toolName === 'write_file') {
      try {
         var writePath = sanitizeToolPath (toolInput.path);
         var written = await pfs.writeFileAt (projectName, writePath, toolInput.content, rs);
         if (written === false) return false;
         return await finalizeTool ({success: true, message: 'File written: ' + toolInput.path});
      }
      catch (error) {
         return await finalizeTool ({success: false, error: error.message});
      }
   }

   if (toolName === 'edit_file') {
      try {
         var editPath = sanitizeToolPath (toolInput.path);
         var content = await pfs.readFileInWorkspace (projectName, editPath, rs);
         if (content === false) return false;

         var count = content.split (toolInput.old_string).length - 1;

         if (count === 0) {
            return await finalizeTool ({success: false, error: 'old_string not found in file'});
         }
         if (count > 1) {
            return await finalizeTool ({success: false, error: 'old_string found ' + count + ' times — must be unique. Add more surrounding context.'});
         }
         var updated = content.replace (toolInput.old_string, toolInput.new_string);
         var edited = await pfs.writeFileAt (projectName, editPath, updated, rs);
         if (edited === false) return false;
         return await finalizeTool ({success: true, message: 'Edit applied to ' + toolInput.path});
      }
      catch (error) {
         return await finalizeTool ({success: false, error: error.message});
      }
   }

   if (toolName === 'launch_agent') {
      if (toolInput.provider !== 'claude' && toolInput.provider !== 'openai') {
         return await finalizeTool ({success: false, error: 'launch_agent: provider must be claude or openai'});
      }
      if (type (toolInput.prompt) !== 'string' || ! toolInput.prompt.trim ()) {
         return await finalizeTool ({success: false, error: 'launch_agent: prompt is required'});
      }

      try {
         var result = await startDialogTurn (projectName, toolInput.provider, toolInput.prompt.trim (), toolInput.model, toolInput.slug, null);
         return await finalizeTool ({
            success: true,
            launched: {
               dialogId: result.dialogId,
               filename: result.filename,
               status: result.status,
               provider: result.provider,
               model: result.model
            }
         });
      }
      catch (error) {
         return await finalizeTool ({success: false, error: 'launch_agent failed: ' + error.message});
      }
   }

   return await finalizeTool ({success: false, error: 'Unknown tool: ' + toolName});
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
   var providerMatch = markdown.match (/^> Provider:\s*([^\n]+)\s*$/m);
   var modelMatch = markdown.match (/^> Model:\s*([^\n]+)\s*$/m);
   if (! providerMatch || ! modelMatch) return {};
   return {
      provider: providerMatch [1].trim (),
      model: modelMatch [1].trim ()
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
   var metaRe = /^>\s*(Id|Time|Resources(?: cumulative)?|Usage(?: cumulative)?|Context|Provider|Model|Started|Status)\s*:/;
   return dale.fil ((text || '').split ('\n'), undefined, function (line) {
      if (metaRe.test (line)) return;
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

var getLastCumulativeUsage = async function (projectName, filename) {
   var text;
   try {
      text = await pfs.readFile (projectName, filename);
   }
   catch (error) {
      if (isNoSuchFileError (error)) return {input: 0, output: 0, total: 0};
      throw error;
   }
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

var appendToDialog = async function (projectName, filename, text) {
   await pfs.appendFile (projectName, filename, text);
};

var appendUsageToAssistantSection = async function (projectName, filename, usage) {
   var normalized = parseUsageNumbers (usage);
   if (! normalized) return;

   var cumulative = await getLastCumulativeUsage (projectName, filename);
   // Input tokens already include the full conversation history each turn,
   // so cumulative input = this turn's input (not a running sum).
   // Output tokens are genuinely new each turn, so those accumulate.
   cumulative.input = normalized.input;
   cumulative.output += normalized.output;
   cumulative.total = normalized.input + cumulative.output;

   await appendToDialog (projectName, filename,
      '> Usage: input=' + normalized.input + ' output=' + normalized.output + ' total=' + normalized.total + '\n' +
      '> Usage cumulative: input=' + cumulative.input + ' output=' + cumulative.output + ' total=' + cumulative.total + '\n\n'
   );
};

var finalizeAssistantTime = async function (projectName, filename, startIso, endIso) {
   var marker = '> Time: ' + startIso + ' - ...';
   var replacement = '> Time: ' + startIso + ' - ' + endIso;
   var text = await pfs.readFile (projectName, filename);
   var index = text.lastIndexOf (marker);
   if (index < 0) return;
   text = text.slice (0, index) + replacement + text.slice (index + marker.length);
   await pfs.writeFile (projectName, filename, text);
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

var DIALOG_STATUSES = ['active', 'done'];

var sanitizeForFilename = function (text) {
   text = (text || 'dialog').trim ();
   // Remove characters unsafe for filenames: / \ null and control chars
   text = text.replace (/[\/\\\u0000-\u001f]/g, '');
   // Prevent path traversal
   text = text.replace (/\.\./g, '');
   return text || 'dialog';
};

var buildDialogFilename = function (dialogId, status) {
   return DIALOG_DIR + '/' + dialogId + '-' + status + '.md';
};

var parseDialogFilename = function (filename) {
   if (type (filename) !== 'string') return null;

   // New format: dialog/<dialogId>-<status>.md
   if (filename.indexOf (DIALOG_DIR + '/') === 0) {
      filename = filename.slice ((DIALOG_DIR + '/').length);
      var match = filename.match (/^(.+)\-(active|done)\.md$/);
      if (! match) return null;
      return {dialogId: match [1], status: match [2]};
   }

   // Legacy format (backward compatibility): dialog-<dialogId>-<status>.md
   var legacy = filename.match (/^dialog\-(.+)\-(active|done)\.md$/);
   if (! legacy) return null;
   return {dialogId: legacy [1], status: legacy [2]};
};

var findDialogFilename = async function (projectName, dialogId, rs) {
   var files = await pfs.readdir (projectName, rs);
   if (files === false) return false;
   var found = dale.stopNot (files, undefined, function (file) {
      var parsed = parseDialogFilename (file);
      if (parsed && parsed.dialogId === dialogId) return file;
   });
   return found || null;
};

var createDialogId = async function (projectName, slug, rs) {
   var base = formatDialogTimestamp () + '-' + sanitizeForFilename (slug || 'dialog');
   var candidate = base;
   var counter = 2;
   while (true) {
      var existing = await findDialogFilename (projectName, candidate, rs);
      if (existing === false) return false;
      if (! existing) return candidate;
      candidate = base + '-' + counter;
      counter++;
   }
};

var loadDialog = async function (projectName, dialogId, rs) {
   var filename = await findDialogFilename (projectName, dialogId, rs);
   if (filename === false) return false;
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

   var markdown = await pfs.readFile (projectName, filename, rs);
   if (markdown === false) return false;
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

var setDialogStatus = async function (projectName, dialog, status, context) {
   context = context || 'unknown';

   if (! inc (DIALOG_STATUSES, status)) throw new Error ('Invalid status: ' + status);
   if (! dialog || ! dialog.dialogId) throw new Error ('Dialog not found');
   if (! dialog.filename) throw new Error ('Dialog filename not set: ' + dialog.dialogId);

   var currentFilename = dialog.filename;
   var parsed = parseDialogFilename (currentFilename);
   var currentStatus = parsed ? parsed.status : dialog.status;

   dialog.exists = true;
   dialog.filename = currentFilename;
   dialog.status = currentStatus;

   if (currentStatus === status) return dialog;

   var newFilename = buildDialogFilename (dialog.dialogId, status);

   try {
      await pfs.rename (projectName, currentFilename, newFilename);
      dialog.filename = newFilename;
      dialog.status = status;
      return dialog;
   }
   catch (error) {
      throw error;
   }
};

var ensureDialogFile = async function (projectName, dialog, provider, model) {
   if (dialog.exists) {
      if (dialog.metadata.provider && dialog.metadata.model) {
         await upsertDocMainContextBlock (projectName, dialog.filename);
         return;
      }
      var content = await pfs.readFile (projectName, dialog.filename);
      var headerLine = '> Provider: ' + provider + '\n' + '> Model: ' + model + '\n';
      if (! /\n> Started:/.test (content)) headerLine += '> Started: ' + new Date ().toISOString () + '\n';
      headerLine += '\n';
      if (content.startsWith ('# Dialog\n\n')) content = '# Dialog\n\n' + headerLine + content.slice (10);
      else content = '# Dialog\n\n' + headerLine + content;
      await pfs.writeFile (projectName, dialog.filename, content);
      await upsertDocMainContextBlock (projectName, dialog.filename);
      dialog.markdown = await pfs.readFile (projectName, dialog.filename);
      dialog.metadata = {provider: provider, model: model};
      return;
   }

   var header = '# Dialog\n\n';
   header += '> Provider: ' + provider + '\n' + '> Model: ' + model + '\n';
   header += '> Started: ' + new Date ().toISOString () + '\n\n';
   await pfs.writeFile (projectName, dialog.filename, header);
   await upsertDocMainContextBlock (projectName, dialog.filename);
   dialog.exists = true;
   dialog.markdown = await pfs.readFile (projectName, dialog.filename);
};

var writeToolResults = async function (projectName, filename, resultsById) {
   var markdown = await pfs.readFile (projectName, filename);
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

   await pfs.writeFile (projectName, filename, markdown);
};

// Implementation function for Claude (streaming with tool support)
var chatWithClaude = async function (projectName, messages, model, onChunk, abortSignal) {
   model = model || 'claude-sonnet-4-6';

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
      headers ['anthropic-version'] = '2023-06-01';
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
   model = model || 'gpt-5.4';

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

var appendToolCallsToAssistantSection = async function (projectName, filename, toolCalls) {
   if (! toolCalls || ! toolCalls.length) return;
   for (var i = 0; i < toolCalls.length; i++) {
      await appendToDialog (projectName, filename, buildToolBlock (toolCalls [i]) + '\n\n');
   }
};

var runCompletion = async function (projectName, dialog, provider, model, onChunk, abortSignal) {
   var autoExecutedAll = [];
   var lastContent = '';

   while (true) {
      await upsertDocMainContextBlock (projectName, dialog.filename);
      var markdown = await pfs.readFile (projectName, dialog.filename);
      var messages = parseDialogForProvider (markdown, provider);

      var assistantStart = new Date ().toISOString ();
      await appendToDialog (projectName, dialog.filename, '## Assistant\n> Model: ' + model + '\n> Time: ' + assistantStart + ' - ...\n\n');

      // writeChunk is called synchronously from the LLM stream handlers.
      // We queue async writes so they execute sequentially without blocking
      // the event loop or the stream reader.
      var writeQueue = Promise.resolve ();
      var queuedWriteError = null;
      var llmStreamId = nextLogId ();
      var writeChunk = function (chunk) {
         var eventType = type (chunk) === 'string' ? 'chunk' : ((chunk && chunk.type) || 'event');
         var extra = type (chunk) === 'string' ? 'chars=' + chunk.length : '';
         logStreamEvent ('   LLM STREAM', llmStreamId, projectName, dialog.dialogId, eventType, extra);
         writeQueue = writeQueue.then (function () {
            if (queuedWriteError) return;
            return appendToDialog (projectName, dialog.filename, chunk);
         }).catch (function (error) {
            if (abortSignal && abortSignal.aborted) return;
            queuedWriteError = queuedWriteError || error;
         });
         if (onChunk) onChunk (chunk);
      };

      try {
         var result = provider === 'claude'
            ? await chatWithClaude (projectName, messages, model, writeChunk, abortSignal)
            : await chatWithOpenAI (projectName, messages, model, writeChunk, abortSignal);

         lastContent = result.content || '';

         // Wait for all queued chunk writes to complete before continuing
         await writeQueue;
         if (queuedWriteError) throw queuedWriteError;
         await appendToDialog (projectName, dialog.filename, '\n\n');
         await appendUsageToAssistantSection (projectName, dialog.filename, result.usage);

         // Compute and emit context window usage
         // result.usage.input already includes the full conversation history for this turn,
         // so the next turn's context ≈ this turn's input + this turn's output
         var contextLimit = getContextWindowSize (model);
         var normalized = parseUsageNumbers (result.usage);
         var contextUsed = normalized ? normalized.input + normalized.output : 0;
         var contextPercent = contextUsed ? Math.round (contextUsed / contextLimit * 100) : 0;
         await appendToDialog (projectName, dialog.filename, '> Context: used=' + contextUsed + ' limit=' + contextLimit + ' percent=' + contextPercent + '%\n');
         if (onChunk) onChunk ({type: 'context', context: {used: contextUsed, limit: contextLimit, percent: contextPercent}});

         await appendToolCallsToAssistantSection (projectName, dialog.filename, result.toolCalls);

         var resultsById = {};
         var executed = [];
         var toolCalls = result.toolCalls || [];

         if (onChunk && toolCalls.length) {
            dale.go (toolCalls, function (tc) {
               onChunk ({type: 'tool_request', tool: {id: tc.id, name: tc.name, input: tc.input}});
            });
         }

         for (var i = 0; i < toolCalls.length; i++) {
            var tc = toolCalls [i];
            var toolResult = await executeTool (tc.name, tc.input, projectName);
            resultsById [tc.id] = toolResult;
            executed.push ({id: tc.id, name: tc.name, result: toolResult});
         }

         if (dale.keys (resultsById).length) await writeToolResults (projectName, dialog.filename, resultsById);
         if (executed.length) autoExecutedAll = autoExecutedAll.concat (executed);
         if (onChunk && executed.length) {
            dale.go (executed, function (tc) {
               onChunk ({type: 'tool_result', tool: {id: tc.id, name: tc.name, result: tc.result}});
            });
         }

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
            await finalizeAssistantTime (projectName, dialog.filename, assistantStart, new Date ().toISOString ());
         }
         catch (error) {}
      }
   }

};

var createDialogDraft = async function (projectName, provider, model, slug) {
   if (provider !== 'claude' && provider !== 'openai') {
      throw new Error ('Unknown provider: ' + provider + '. Use "claude" or "openai".');
   }

   projectName = validateProjectName (projectName);
   var defaultModel = model || (provider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5.4');
   var dialogId = await createDialogId (projectName, slug || 'dialog');
   var filename = buildDialogFilename (dialogId, 'done');
   var dialog = {
      dialogId: dialogId,
      filename: filename,
      status: 'done',
      exists: false,
      markdown: '',
      metadata: {}
   };

   await ensureDialogFile (projectName, dialog, provider, defaultModel);

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

   projectName = validateProjectName (projectName);
   var defaultModel = model || (provider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5.4');
   var dialogId = await createDialogId (projectName, slug);
   var dialog = {
      dialogId: dialogId,
      filename: buildDialogFilename (dialogId, 'active'),
      status: 'active',
      exists: false,
      markdown: '',
      metadata: {}
   };

   await ensureDialogFile (projectName, dialog, provider, defaultModel);
   await appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + prompt + '\n\n');

   // Register active stream so /stream endpoint can connect
   var stream = beginActiveStream (projectName, dialogId);
   var wrappedOnChunk = function (chunk) {
      if (chunk && type (chunk) === 'object' && chunk.type) {
         stream.emitter.emit ('event', chunk);
      }
      else {
         stream.emitter.emit ('event', {type: 'chunk', content: chunk});
      }
      if (onChunk) onChunk (chunk);
   };

   try {
      var result = await runCompletion (projectName, dialog, provider, defaultModel, wrappedOnChunk, abortSignal || stream.controller.signal);
      await setDialogStatus (projectName, dialog, 'done', 'startDialogTurn/success');
      result.filename = dialog.filename;
      result.status = dialog.status;
      stream.emitter.emit ('event', {type: 'done', result: result});
      endActiveStream (projectName, dialogId);
      return result;
   }
   catch (error) {
      try {
         await setDialogStatus (projectName, dialog, 'done', 'startDialogTurn/error');
      }
      catch (statusError) {
      }
      stream.emitter.emit ('event', {type: 'error', error: error.message});
      endActiveStream (projectName, dialogId);
      throw error;
   }
};

var updateDialogTurn = async function (projectName, dialogId, status, prompt, provider, model, onChunk, abortSignal) {
   var dialog = await loadDialog (projectName, dialogId);
   if (! dialog.exists) throw new Error ('Dialog not found: ' + dialogId);

   var shouldContinue = (type (prompt) === 'string' && prompt.trim ());

   if (shouldContinue) {
      await setDialogStatus (projectName, dialog, 'active', 'updateDialogTurn/before-run');
      if (type (prompt) === 'string' && prompt.trim ()) {
         await appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + prompt.trim () + '\n\n');
      }

      var meta = parseMetadata (await pfs.readFile (projectName, dialog.filename));
      var resolvedProvider = provider || meta.provider;
      if (resolvedProvider !== 'claude' && resolvedProvider !== 'openai') {
         throw new Error ('Unable to determine provider for dialog update');
      }
      var resolvedModel = model || meta.model || (resolvedProvider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5.4');

      try {
         var result = await runCompletion (projectName, dialog, resolvedProvider, resolvedModel, onChunk, abortSignal);
         await setDialogStatus (projectName, dialog, 'done', 'updateDialogTurn/success');
         result.filename = dialog.filename;
         result.status = dialog.status;
         return result;
      }
      catch (error) {
         try {
            await setDialogStatus (projectName, dialog, 'done', 'updateDialogTurn/error');
         }
         catch (statusError) {
         }
         throw error;
      }
   }

   if (status && status === 'done') await setDialogStatus (projectName, dialog, status, 'updateDialogTurn/status-only');

   return {
      dialogId: dialog.dialogId,
      filename: dialog.filename,
      status: dialog.status,
      updated: true
   };
};

// Validate file path: managed folders only (doc/ or dialog/), no traversal
var validFilename = function (name) {
   if (type (name) !== 'string') return false;
   if (! name.trim ()) return false;
   if (name.includes ('..')) return false;
   if (name [0] === '/' || name.includes ('\\')) return false;
   if (/[\u0000\r\n]/.test (name)) return false;
   if (! managedFilePath (name)) return false;
   return true;
}

var validUploadName = function (name) {
   if (type (name) !== 'string') return false;
   if (! name.trim ()) return false;
   if (name.includes ('..')) return false;
   if (name [0] === '/' || name.includes ('\\')) return false;
   if (/[\u0000\r\n]/.test (name)) return false;
   return true;
};

var uploadContentType = function (name, provided) {
   if (type (provided) === 'string' && provided.trim ()) return provided.trim ();
   var lower = (name || '').toLowerCase ();
   if (lower.match (/\.png$/)) return 'image/png';
   if (lower.match (/\.jpe?g$/)) return 'image/jpeg';
   if (lower.match (/\.gif$/)) return 'image/gif';
   if (lower.match (/\.webp$/)) return 'image/webp';
   if (lower.match (/\.svg$/)) return 'image/svg+xml';
   if (lower.match (/\.mp3$/)) return 'audio/mpeg';
   if (lower.match (/\.wav$/)) return 'audio/wav';
   if (lower.match (/\.ogg$/)) return 'audio/ogg';
   if (lower.match (/\.mp4$/)) return 'video/mp4';
   if (lower.match (/\.webm$/)) return 'video/webm';
   if (lower.match (/\.mov$/)) return 'video/quicktime';
   if (lower.match (/\.pdf$/)) return 'application/pdf';
   if (lower.match (/\.json$/)) return 'application/json';
   if (lower.match (/\.txt$/)) return 'text/plain';
   if (lower.match (/\.md$/)) return 'text/markdown';
   return 'application/octet-stream';
};

var listUploads = async function (projectName, rs) {
   var files = await pfs.readdir (projectName, rs);
   if (files === false) return false;
   var uploadFiles = dale.fil (files, undefined, function (file) {
      if (isUploadPath (file)) return file;
   });

   var stats = await pfs.statsDetailed (projectName, uploadFiles, rs);
   if (stats === false) return false;

   var entries = dale.go (stats, function (stat) {
      var shortName = stat.name.slice (UPLOAD_DIR.length + 1);
      return {
         name: shortName,
         path: stat.name,
         size: stat.size || 0,
         mtime: stat.mtime.getTime (),
         contentType: uploadContentType (shortName),
      };
   });

   entries.sort (function (a, b) { return b.mtime - a.mtime; });
   return entries;
};

var autoCommitApi = function (projectName, method, path) {
   return maybeAutoCommit (projectName, {kind: 'api', method: method, path: path}).catch (function (error) {
      throw error;
   });
};

// *** ROUTES ***

var buildSettingsResponse = function (config) {
   config = config || {};
   var accounts = config.accounts || {};
   var editor = config.editor || {};

   return {
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
      },
      editor: {
         viMode: !! editor.viMode
      },
      testButton: !! config.testButton
   };
};

var applySettingsUpdate = function (config, body) {
   config = config || {};
   body = body || {};
   if (! config.accounts) config.accounts = {};

   if (type (body.openaiKey) === 'string') {
      if (! config.accounts.openai) config.accounts.openai = {};
      config.accounts.openai.apiKey = body.openaiKey.trim ();
   }
   if (type (body.claudeKey) === 'string') {
      if (! config.accounts.claude) config.accounts.claude = {};
      config.accounts.claude.apiKey = body.claudeKey.trim ();
   }

   var editorInput = body.editor || {};
   if (type (body.viMode) === 'boolean') editorInput = {viMode: body.viMode};

   if (type (editorInput.viMode) === 'boolean') {
      if (! config.editor) config.editor = {};
      config.editor.viMode = editorInput.viMode;
   }

   return config;
};

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
            ['script', {src: 'client-css.js'}],
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],
   ['get', 'client-css.js', cicek.file],
   ['get', 'client.js', cicek.file],
   ['get', 'test-client.js', cicek.file],

   // *** SETTINGS ***

   ['get', 'settings', function (rq, rs) {
      var config = loadConfigJson ();
      reply (rs, 200, buildSettingsResponse (config));
   }],

   ['post', 'settings', function (rq, rs) {
      var config = loadConfigJson ();
      config = applySettingsUpdate (config, rq.body);
      saveConfigJson (config);
      reply (rs, 200, {ok: true});
   }],

   // OAuth login: start flow
   ['post', 'settings/login/:provider', async function (rq, rs) {
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
   ['post', 'settings/login/:provider/callback', async function (rq, rs) {
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
   ['post', 'settings/logout/:provider', function (rq, rs) {
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

   // Backward-compatible accounts routes
   ['get', 'accounts', function (rq, rs) {
      var config = loadConfigJson ();
      reply (rs, 200, buildSettingsResponse (config));
   }],
   ['post', 'accounts', function (rq, rs) {
      var config = loadConfigJson ();
      config = applySettingsUpdate (config, rq.body);
      saveConfigJson (config);
      reply (rs, 200, {ok: true});
   }],
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
   ['post', 'accounts/login/:provider/callback', async function (rq, rs) {
      var provider = rq.data.params.provider;
      try {
         if (provider === 'claude') {
            if (type (rq.body.code) !== 'string' || ! rq.body.code.trim ()) return reply (rs, 400, {error: 'code is required'});
            var result = await completeAnthropicLogin (rq.body.code.trim ());
            reply (rs, 200, result);
         }
         else if (provider === 'openai') {
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

   ['get', 'projects', async function (rq, rs) {
      try {
         reply (rs, 200, await listProjects ());
      }
      catch (error) {
         reply (rs, 500, {error: error.message});
      }
   }],

   ['post', 'projects', async function (rq, rs) {
      if (stop (rs, [['name', rq.body.name, 'string']])) return;
      try {
         var displayName = rq.body.name.trim ();
         var slug = await ensureProject (displayName);
         try {
            await pfs.readFile (slug, DOC_MAIN_FILE);
         }
         catch (error) {
            if (! isNoSuchFileError (error)) throw error;
            await pfs.writeFile (slug, DOC_MAIN_FILE, '# ' + displayName + '\n');
         }
         await autoCommitApi (slug, 'POST', '/projects');
         reply (rs, 200, {ok: true, slug: slug, name: displayName});
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   ['delete', 'projects/:name', async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, rq.data.params.name);
      if (! projectName) return;

      if (! (await volumeExists (projectName))) return reply (rs, 404, {error: 'Project not found'});

      // Abort active dialog streams and wait for them to settle
      var settledPromises = [];
      try {
         var files = await pfs.readdir (projectName, rs);
         if (files === false) files = [];
         dale.go (files, function (file) {
            var parsed = parseDialogFilename (file);
            if (! parsed) return;
            var active = getActiveStream (projectName, parsed.dialogId);
            if (! active) return;
            active.requestedStatus = 'done';
            settledPromises.push (active.settled);
            active.controller.abort ();
         });
      }
      catch (error) {}

      if (settledPromises.length) await Promise.all (settledPromises);

      await removeProjectContainer (projectName);
      reply (rs, 200, {ok: true, name: projectName});
   }],

   ['post', 'project/:project/snapshot', async function (rq, rs) {
      var projectName = rq.data.params.project;
      try {
         var label = (rq.body.label && type (rq.body.label) === 'string') ? rq.body.label.trim () : '';
         var entry = await createSnapshot (projectName, label);
         reply (rs, 200, entry);
      }
      catch (error) {
         reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
      }
   }],

   // *** SNAPSHOTS ***

   ['get', 'snapshots', function (rq, rs) {
      try {
         reply (rs, 200, loadSnapshotsIndex ());
      }
      catch (error) {
         reply (rs, 500, {error: error.message});
      }
   }],

   ['post', 'snapshots/:id/restore', async function (rq, rs) {
      var snapshotId = rq.data.params.id;
      try {
         var newName = (rq.body.name && type (rq.body.name) === 'string') ? rq.body.name.trim () : null;
         var result = await restoreSnapshot (snapshotId, newName);
         reply (rs, 200, result);
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   ['delete', 'snapshots/:id', function (rq, rs) {
      var snapshotId = rq.data.params.id;
      try {
         deleteSnapshot (snapshotId);
         reply (rs, 200, {ok: true});
      }
      catch (error) {
         reply (rs, 400, {error: error.message});
      }
   }],

   ['get', 'snapshots/:id/download', function (rq, rs) {
      var snapshotId = rq.data.params.id;
      try {
         var index = loadSnapshotsIndex ();
         var entry = dale.stopNot (index, undefined, function (e) {
            if (e.id === snapshotId) return e;
         });
         if (! entry) return reply (rs, 404, {error: 'Snapshot not found'});

         var archivePath = Path.join (SNAPSHOTS_DIR, entry.file);
         if (! fs.existsSync (archivePath)) return reply (rs, 404, {error: 'Snapshot archive missing'});

         var stat = fs.statSync (archivePath);
         var downloadName = (entry.projectName || 'snapshot') + '-' + entry.id + '.tar.gz';

         rs.writeHead (200, {
            'Content-Type': 'application/gzip',
            'Content-Length': stat.size,
            'Content-Disposition': 'attachment; filename="' + downloadName.replace (/"/g, '\\"') + '"'
         });
         fs.createReadStream (archivePath).pipe (rs);
      }
      catch (error) {
         if (! rs.headersSent) reply (rs, 500, {error: error.message});
      }
   }],

   // *** FILES ***

   ['get', 'project/:project/files', async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var files = await pfs.readdir (projectName, rs);
         if (files === false) return;
         var managedFiles = dale.fil (files, undefined, function (file) {
            if (managedFilePath (file)) return file;
         });
         var stats = await pfs.statsDetailed (projectName, managedFiles, rs);
         if (stats === false) return;
         stats.sort (function (a, b) { return b.mtime - a.mtime; });
         reply (rs, 200, dale.go (stats, function (stat) { return stat.name; }));
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read directory'});
      }
   }],

   ['get', /^\/project\/([^/]+)\/file\/(.+)$/, async function (rq, rs) {
      var projectSlug = decodeURIComponent (rq.data.params [0]);
      var name = decodeURIComponent (rq.data.params [1]);
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      var projectName = validProjectNameOrReply (rs, projectSlug);
      if (! projectName) return;

      try {
         var content = await pfs.readFile (projectName, name, rs);
         if (content === false) return;
         reply (rs, 200, {name: name, content: content});
      }
      catch (error) {
         if (isNoSuchFileError (error)) return reply (rs, 404, {error: 'File not found'});
         reply (rs, 500, {error: 'Failed to read file'});
      }
   }],

   ['post', /^\/project\/([^/]+)\/file\/(.+)$/, async function (rq, rs) {
      var projectSlug = decodeURIComponent (rq.data.params [0]);
      var name = decodeURIComponent (rq.data.params [1]);
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      if (stop (rs, [
         ['content', rq.body.content, 'string'],
      ])) return;

      var projectName = validProjectNameOrReply (rs, projectSlug);
      if (! projectName) return;

      return withProjectMutationLock (projectName, async function () {
         try {
            var written = await pfs.writeFile (projectName, name, rq.body.content, rs);
            if (written === false) return;
            await autoCommitApi (projectName, 'POST', '/project/' + projectName + '/file/' + name);
            reply (rs, 200, {ok: true, name: name});
         }
         catch (error) {
            reply (rs, 500, {error: error.message || 'Failed to write file'});
         }
      });
   }],

   ['delete', /^\/project\/([^/]+)\/file\/(.+)$/, async function (rq, rs) {
      var projectSlug = decodeURIComponent (rq.data.params [0]);
      var name = decodeURIComponent (rq.data.params [1]);
      if (! validFilename (name)) return reply (rs, 400, {error: 'Invalid filename'});

      var projectName = validProjectNameOrReply (rs, projectSlug);
      if (! projectName) return;

      try {
         var removed = await pfs.unlink (projectName, name, rs);
         if (removed === false) return;
         await autoCommitApi (projectName, 'DELETE', '/project/' + projectName + '/file/' + name);
         reply (rs, 200, {ok: true});
      }
      catch (error) {
         if (isNoSuchFileError (error)) return reply (rs, 404, {error: 'File not found'});
         reply (rs, 500, {error: error.message || 'Failed to delete file'});
      }
   }],

   // *** UPLOADS ***

   ['get', 'project/:project/uploads', async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var entries = await listUploads (projectName, rs);
         if (entries === false) return;
         reply (rs, 200, dale.go (entries, function (entry) {
            entry.url = '/project/' + encodeURIComponent (projectName) + '/upload/' + encodeURIComponent (entry.name);
            return entry;
         }));
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to list uploads'});
      }
   }],

   ['post', 'project/:project/upload', async function (rq, rs) {
      if (stop (rs, [
         ['name', rq.body.name, 'string'],
         ['content', rq.body.content, 'string']
      ])) return;

      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      var name = rq.body.name.trim ();
      if (! validUploadName (name)) return reply (rs, 400, {error: 'Invalid upload name'});

      try {
         var content = rq.body.content;
         var contentType = rq.body.contentType || '';
         var base64 = content;
         if (content.indexOf ('data:') === 0) {
            var splits = content.split (',');
            if (splits.length > 1) {
               var header = splits [0];
               base64 = splits.slice (1).join (',');
               var match = header.match (/data:([^;]+)/);
               if (match && ! contentType) contentType = match [1];
            }
         }
         var buffer = Buffer.from (base64, 'base64');
         var filepath = UPLOAD_DIR + '/' + name;
         var written = await pfs.writeFileBinaryAt (projectName, filepath, buffer, rs);
         if (written === false) return;
         await autoCommitApi (projectName, 'POST', '/project/' + projectName + '/upload');

         var stats = await pfs.statsDetailed (projectName, [filepath], rs);
         if (stats === false) return;
         var stat = stats [0] || {size: buffer.length, mtime: new Date ()};
         reply (rs, 200, {
            ok: true,
            name: name,
            size: stat.size || buffer.length,
            mtime: stat.mtime.getTime (),
            contentType: uploadContentType (name, contentType),
            url: '/project/' + encodeURIComponent (projectName) + '/upload/' + encodeURIComponent (name)
         });
      }
      catch (error) {
         reply (rs, 500, {error: error.message || 'Failed to save upload'});
      }
   }],

   ['get', /^\/project\/([^/]+)\/upload\/(.+)$/, async function (rq, rs) {
      var projectSlug = decodeURIComponent (rq.data.params [0]);
      var name = decodeURIComponent (rq.data.params [1]);
      if (! validUploadName (name)) return reply (rs, 400, {error: 'Invalid upload name'});

      var projectName = validProjectNameOrReply (rs, projectSlug);
      if (! projectName) return;

      try {
         var filepath = UPLOAD_DIR + '/' + name;
         var buffer = await pfs.readFileBinaryAt (projectName, '/workspace/' + filepath, rs);
         if (buffer === false) return;
         var contentType = uploadContentType (name);
         rs.writeHead (200, {
            'Content-Type': contentType,
            'Content-Length': buffer.length
         });
         rs.end (buffer);
      }
      catch (error) {
         if (isNoSuchFileError (error)) return reply (rs, 404, {error: 'Upload not found'});
         if (! rs.headersSent) reply (rs, 500, {error: 'Failed to read upload'});
      }
   }],

   // *** LLM ***

   // Create a dialog draft (idle, status=done)
   ['post', 'project/:project/dialog/new', async function (rq, rs) {
      if (stop (rs, [
         ['provider', rq.body.provider, 'string', {oneOf: ['claude', 'openai']}],
      ])) return;

      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});
      if (rq.body.slug !== undefined && type (rq.body.slug) !== 'string') return reply (rs, 400, {error: 'slug must be a string'});

      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var created = await createDialogDraft (projectName, rq.body.provider, rq.body.model, rq.body.slug || 'dialog');
         await autoCommitApi (projectName, 'POST', '/project/' + projectName + '/dialog/new');
         reply (rs, 200, created);
      }
      catch (error) {
         reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
      }
   }],

   // Create dialog + first turn (async, returns JSON immediately)
   ['post', 'project/:project/dialog', async function (rq, rs) {
      if (stop (rs, [
         ['provider', rq.body.provider, 'string', {oneOf: ['claude', 'openai']}],
         ['prompt', rq.body.prompt, 'string'],
      ])) return;

      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});
      if (rq.body.slug !== undefined && type (rq.body.slug) !== 'string') return reply (rs, 400, {error: 'slug must be a string'});

      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;
      var provider = rq.body.provider;
      var prompt = rq.body.prompt;
      var model = rq.body.model;
      var slug = rq.body.slug;

      // Create the dialog file and set it to active
      var defaultModel = model || (provider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5.4');
      var dialogId;
      var filename;
      var dialog;
      try {
         dialogId = await createDialogId (projectName, slug, rs);
         if (dialogId === false) return;
         filename = buildDialogFilename (dialogId, 'active');
         dialog = {
            dialogId: dialogId,
            filename: filename,
            status: 'active',
            exists: false,
            markdown: '',
            metadata: {}
         };

         await ensureDialogFile (projectName, dialog, provider, defaultModel);
         await appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + prompt + '\n\n');
      }
      catch (error) {
         return reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
      }

      // Set up active stream with emitter for fan-out
      var stream = beginActiveStream (projectName, dialogId);

      // Return JSON immediately
      reply (rs, 200, {dialogId: dialogId, filename: dialog.filename, status: 'active'});

      // Run generation in the background
      (async function () {
         try {
            var result = await runCompletion (projectName, dialog, provider, defaultModel, function (chunk) {
               if (chunk && type (chunk) === 'object' && chunk.type) {
                  stream.emitter.emit ('event', chunk);
               }
               else {
                  stream.emitter.emit ('event', {type: 'chunk', content: chunk});
               }
            }, stream.controller.signal);
            await setDialogStatus (projectName, dialog, 'done', 'route/post-dialog/success');
            result.filename = dialog.filename;
            result.status = dialog.status;
            await autoCommitApi (projectName, 'POST', '/project/' + projectName + '/dialog');
            stream.emitter.emit ('event', {type: 'done', result: result});
            endActiveStream (projectName, dialogId);
            stream.settle ();
         }
         catch (error) {
            if (error && error.name === 'AbortError') {
               try {
                  var activeAfterAbort = getActiveStream (projectName, dialogId);
                  var requestedStatus = activeAfterAbort && activeAfterAbort.requestedStatus ? activeAfterAbort.requestedStatus : 'done';
                  var dialogAfterAbort = await loadDialog (projectName, dialogId);
                  if (dialogAfterAbort.exists) await setDialogStatus (projectName, dialogAfterAbort, requestedStatus, 'route/post-dialog/abort');
                  stream.emitter.emit ('event', {type: 'done', result: {dialogId: dialogId, filename: dialogAfterAbort.filename, status: requestedStatus, interrupted: true}});
               }
               catch (interruptError) {
                  stream.emitter.emit ('event', {type: 'error', error: interruptError.message});
               }
            }
            else {
               try {
                  var dialogAfterError = await loadDialog (projectName, dialogId);
                  if (dialogAfterError.exists) await setDialogStatus (projectName, dialogAfterError, 'done', 'route/post-dialog/error');
               }
               catch (statusError) {
               }
               stream.emitter.emit ('event', {type: 'error', error: error.message});
            }
            endActiveStream (projectName, dialogId);
            stream.settle ();
         }
      }) ();
   }],

   // Update dialog (returns JSON; generation runs in background)
   ['put', 'project/:project/dialog', async function (rq, rs) {
      if (stop (rs, [
         ['dialogId', rq.body.dialogId, 'string'],
      ])) return;

      if (rq.body.status !== undefined && rq.body.status !== 'done') return reply (rs, 400, {error: 'status must be done'});
      if (rq.body.prompt !== undefined && type (rq.body.prompt) !== 'string') return reply (rs, 400, {error: 'prompt must be a string'});
      if (rq.body.provider !== undefined && (type (rq.body.provider) !== 'string' || ! inc (['claude', 'openai'], rq.body.provider))) return reply (rs, 400, {error: 'provider must be claude or openai'});
      if (rq.body.model !== undefined && type (rq.body.model) !== 'string') return reply (rs, 400, {error: 'model must be a string'});

      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;
      var dialogId = rq.body.dialogId;
      var continues = type (rq.body.prompt) === 'string' && !! rq.body.prompt.trim ();

      if (! continues) {
         var active = getActiveStream (projectName, dialogId);
         if (active && rq.body.status === 'done') {
            active.requestedStatus = rq.body.status;
            active.controller.abort ();
            return reply (rs, 200, {ok: true, dialogId: dialogId, interrupted: true, status: rq.body.status});
         }

         try {
            var result = await updateDialogTurn (projectName, dialogId, rq.body.status, null, rq.body.provider, rq.body.model, null);
            await autoCommitApi (projectName, 'PUT', '/project/' + projectName + '/dialog');
            return reply (rs, 200, result);
         }
         catch (error) {
            return reply (rs, error.message === 'Project not found' ? 404 : 400, {error: error.message});
         }
      }

      // Continuing with a prompt — check for conflicts
      var lockKey = dialogLockKey (projectName, dialogId);
      if (DIALOG_START_LOCKS [lockKey]) {
         return reply (rs, 409, {error: 'Dialog is already being started. Stop it before sending a new prompt.', dialogId: dialogId, status: 'active'});
      }

      var alreadyActive = getActiveStream (projectName, dialogId);
      if (alreadyActive) {
         return reply (rs, 409, {error: 'Dialog is active. Stop it before sending a new prompt.', dialogId: dialogId, status: 'active'});
      }

      var dialog;
      DIALOG_START_LOCKS [lockKey] = true;
      try {
         dialog = await loadDialog (projectName, dialogId, rs);
         if (dialog === false) {
            delete DIALOG_START_LOCKS [lockKey];
            return;
         }
         if (! dialog.exists) {
            delete DIALOG_START_LOCKS [lockKey];
            return reply (rs, 404, {error: 'Dialog not found'});
         }
         if (dialog.status === 'active') {
            delete DIALOG_START_LOCKS [lockKey];
            return reply (rs, 409, {error: 'Dialog is active. Stop it before sending a new prompt.', dialogId: dialogId, status: 'active'});
         }

         // Set dialog to active, append user message
         await setDialogStatus (projectName, dialog, 'active', 'updateDialogTurn/before-run');
         await appendToDialog (projectName, dialog.filename, '## User\n> Time: ' + new Date ().toISOString () + '\n\n' + rq.body.prompt.trim () + '\n\n');
      }
      catch (dialogStateError) {
         delete DIALOG_START_LOCKS [lockKey];
         return reply (rs, dialogStateError.message === 'Project not found' ? 404 : 400, {error: dialogStateError.message});
      }

      var dialogMarkdown = await pfs.readFile (projectName, dialog.filename, rs);
      if (dialogMarkdown === false) {
         delete DIALOG_START_LOCKS [lockKey];
         return;
      }
      var meta = parseMetadata (dialogMarkdown);
      var resolvedProvider = rq.body.provider || meta.provider;
      if (resolvedProvider !== 'claude' && resolvedProvider !== 'openai') {
         delete DIALOG_START_LOCKS [lockKey];
         return reply (rs, 400, {error: 'Unable to determine provider for dialog update'});
      }
      var resolvedModel = rq.body.model || meta.model || (resolvedProvider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5.4');

      // Set up active stream with emitter for fan-out
      var stream = beginActiveStream (projectName, dialogId);

      // Return JSON immediately
      reply (rs, 200, {dialogId: dialogId, filename: dialog.filename, status: 'active'});

      // Run generation in the background
      (async function () {
         try {
            var result = await runCompletion (projectName, dialog, resolvedProvider, resolvedModel, function (chunk) {
               if (chunk && type (chunk) === 'object' && chunk.type) {
                  stream.emitter.emit ('event', chunk);
               }
               else {
                  stream.emitter.emit ('event', {type: 'chunk', content: chunk});
               }
            }, stream.controller.signal);
            await setDialogStatus (projectName, dialog, 'done', 'route/put-dialog/success');
            result.filename = dialog.filename;
            result.status = dialog.status;
            await autoCommitApi (projectName, 'PUT', '/project/' + projectName + '/dialog');
            stream.emitter.emit ('event', {type: 'done', result: result});
            endActiveStream (projectName, dialogId);
            delete DIALOG_START_LOCKS [lockKey];
            stream.settle ();
         }
         catch (error) {
            if (error && error.name === 'AbortError') {
               try {
                  var activeAfterAbort = getActiveStream (projectName, dialogId);
                  var requestedStatus = activeAfterAbort && activeAfterAbort.requestedStatus ? activeAfterAbort.requestedStatus : 'done';
                  var dialogAfterAbort = await loadDialog (projectName, dialogId);
                  if (dialogAfterAbort.exists) await setDialogStatus (projectName, dialogAfterAbort, requestedStatus, 'route/put-dialog/abort');
                  await autoCommitApi (projectName, 'PUT', '/project/' + projectName + '/dialog').catch (function () {});
                  stream.emitter.emit ('event', {type: 'done', result: {dialogId: dialogId, filename: dialogAfterAbort.filename, status: requestedStatus, interrupted: true}});
               }
               catch (interruptError) {
                  stream.emitter.emit ('event', {type: 'error', error: interruptError.message});
               }
            }
            else {
               try {
                  var dialogAfterError = await loadDialog (projectName, dialogId);
                  if (dialogAfterError.exists) await setDialogStatus (projectName, dialogAfterError, 'done', 'route/put-dialog/error');
               }
               catch (statusError) {
               }
               stream.emitter.emit ('event', {type: 'error', error: error.message});
            }
            endActiveStream (projectName, dialogId);
            delete DIALOG_START_LOCKS [lockKey];
            stream.settle ();
         }
      }) ();
   }],

   // Execute a tool directly
   ['post', 'project/:project/tool/execute', async function (rq, rs) {
      if (stop (rs, [
         ['toolName', rq.body.toolName, 'string'],
         ['toolInput', rq.body.toolInput, 'object'],
      ])) return;

      try {
         var result = await executeTool (rq.body.toolName, rq.body.toolInput, rq.data.params.project, rs);
         if (result === false) return;
         reply (rs, 200, result);
      }
      catch (error) {
         reply (rs, 500, {success: false, error: error.message});
      }
   }],

   // SSE stream for live dialog output
   ['get', /^\/project\/([^/]+)\/dialog\/([^/]+)\/stream$/, async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, decodeURIComponent (rq.data.params [0]));
      if (! projectName) return;
      var dialogId = decodeURIComponent (rq.data.params [1]);

      var dialog;
      try {
         dialog = await loadDialog (projectName, dialogId, rs);
      }
      catch (error) {
         return reply (rs, error.message === 'Project not found' ? 404 : 500, {error: error.message});
      }
      if (dialog === false) return;
      if (! dialog.exists) return reply (rs, 404, {error: 'Dialog not found'});

      // Set up SSE headers — Connection: close prevents client agents from
      // pooling this socket, which would poison the pool on client disconnect.
      rs.writeHead (200, {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache, no-transform',
         'Connection': 'close',
         'X-Accel-Buffering': 'no'
      });
      if (rs.flushHeaders) rs.flushHeaders ();
      rs.write (':ok\n\n');

      var sseStreamId = nextLogId ();
      logLine ('SSE REQ', sseStreamId, 'GET', rq.url || rq.rawurl || '/project/' + projectName + '/dialog/' + dialogId + '/stream', rq.connection && rq.connection.remoteAddress ? rq.connection.remoteAddress : '');

      // If dialog is done (no active stream), send done immediately and close
      var activeStream = getActiveStream (projectName, dialogId);
      if (! activeStream) {
         var donePayload = JSON.stringify ({type: 'done', result: {dialogId: dialogId, filename: dialog.filename, status: dialog.status}});
         logStreamEvent ('   SSE STREAM', sseStreamId, projectName, dialogId, 'done', 'bytes=' + Buffer.byteLength (donePayload));
         rs.write ('data: ' + donePayload + '\n\n');
         rs.end ();
         logLine ('SSE RES', sseStreamId, 'GET', rq.url || rq.rawurl || '/project/' + projectName + '/dialog/' + dialogId + '/stream', colorLog ('OK', LOG_COLORS.ok), '(done)');
         return;
      }

      // Subscribe to the active stream's emitter
      var onEvent = function (event) {
         try {
            var payload = JSON.stringify (event);
            logStreamEvent ('   SSE STREAM', sseStreamId, projectName, dialogId, event.type || 'event', 'bytes=' + Buffer.byteLength (payload));
            rs.write ('data: ' + payload + '\n\n');
            if (rs.flush) rs.flush ();
         }
         catch (e) {}

         // Close on terminal events
         if (event.type === 'done' || event.type === 'error') {
            activeStream.emitter.removeListener ('event', onEvent);
            rs.end ();
            logLine ('SSE RES', sseStreamId, 'GET', rq.url || rq.rawurl || '/project/' + projectName + '/dialog/' + dialogId + '/stream', colorLog (event.type === 'error' ? 'FAILED' : 'OK', event.type === 'error' ? LOG_COLORS.failed : LOG_COLORS.ok), '(' + event.type + ')');
         }
      };

      activeStream.emitter.on ('event', onEvent);

      // Clean up if client disconnects
      rq.connection.on ('close', function () {
         if (activeStream && activeStream.emitter) {
            activeStream.emitter.removeListener ('event', onEvent);
         }
         if (! rs.writableEnded) logLine ('SSE RES', sseStreamId, 'GET', rq.url || rq.rawurl || '/project/' + projectName + '/dialog/' + dialogId + '/stream', colorLog ('OK', LOG_COLORS.info), '(client-closed)');
      });
   }],

   // Get dialog by ID
   ['get', 'project/:project/dialog/:id', async function (rq, rs) {
      var dialogId = rq.data.params.id;
      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      var dialog;
      try {
         dialog = await loadDialog (projectName, dialogId, rs);
      }
      catch (error) {
         return reply (rs, error.message === 'Project not found' ? 404 : 500, {error: error.message});
      }
      if (dialog === false) return;
      if (! dialog.exists) return reply (rs, 404, {error: 'Dialog not found'});

      try {
         var content = await pfs.readFile (projectName, dialog.filename, rs);
         if (content === false) return;
         reply (rs, 200, {
            dialogId: dialogId,
            filename: dialog.filename,
            status: dialog.status,
            messages: parseSections (content),
            markdown: content
         });
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read dialog'});
      }
   }],

   // List all dialogs
   ['get', 'project/:project/dialogs', async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, rq.data.params.project);
      if (! projectName) return;

      try {
         var files = await pfs.readdir (projectName, rs);
         if (files === false) return;
         var dialogFiles = dale.fil (files, undefined, function (file) {
            var parsed = parseDialogFilename (file);
            if (parsed) return file;
         });
         var stats = await pfs.statsDetailed (projectName, dialogFiles, rs);
         if (stats === false) return;
         var withStats = dale.fil (stats, undefined, function (stat) {
            var parsed = parseDialogFilename (stat.name);
            if (! parsed) return;
            return {dialogId: parsed.dialogId, status: parsed.status, filename: stat.name, mtime: stat.mtime.getTime ()};
         });
         withStats.sort (function (a, b) { return b.mtime - a.mtime; });
         reply (rs, 200, withStats);
      }
      catch (error) {
         reply (rs, 500, {error: 'Failed to read directory'});
      }
   }],

   // *** STATIC PROXY ***

   ['get', /^\/project\/([^/]+)\/static(\/.*)?$/, async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, decodeURIComponent (rq.data.params [0]));
      if (! projectName) return;
      var rawPath = rq.data.params [1] || '/';

      if (rq.rawurl) {
         var rawMatch = rq.rawurl.match (/\/static(\/[^?]*)?(\?.*)?$/);
         if (rawMatch) rawPath = rawMatch [1] || '/';
      }

      var filePath = rawPath || '/';
      if (filePath [0] !== '/') filePath = '/' + filePath;
      if (filePath === '/' || filePath [filePath.length - 1] === '/') filePath += 'index.html';
      filePath = filePath.replace (/^\//, '');

      // Prevent path traversal
      if (filePath.includes ('..')) return reply (rs, 400, {error: 'Invalid path'});

      try {
         var fullPath = '/workspace/' + filePath;
         var content = await pfs.readFileBinaryAt (projectName, fullPath, rs);
         if (content === false) return;

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

         reply (rs, 200, content, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'X-Frame-Options': 'SAMEORIGIN'
         });
      }
      catch (error) {
         if (isNoSuchFileError (error)) return reply (rs, 404, {error: 'File not found'});
         if (! rs.headersSent) reply (rs, 500, {error: 'Failed to serve file'});
      }
   }],

   // *** EMBED PROXY ***

   ['all', /^\/project\/([^/]+)\/proxy\/(\d+)(\/.*)?$/, async function (rq, rs) {
      var projectName = validProjectNameOrReply (rs, decodeURIComponent (rq.data.params [0]));
      if (! projectName) return;
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

      // Resolve container IP
      var targetHost;
      try {
         targetHost = await getContainerIP (projectName, rs);
         if (targetHost === false) return;
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

// Docker housekeeping: cleanup orphaned containers on startup
cleanupProjectContainers ().catch (function (error) {});

// Docker housekeeping: kill project containers on shutdown
var cleanupAndExit = async function (signal) {
   try {
      await cleanupProjectContainers ();
   }
   catch (error) {}
   process.exit (0);
};

process.on ('SIGTERM', function () {cleanupAndExit ('SIGTERM');});
process.on ('SIGINT',  function () {cleanupAndExit ('SIGINT');});

var port = 5353;

// Lean server logs: print req/res without headers or bodies
cicek.logconsole = function (message) {
   if (message [2] === 'request') {
      logLine ('HTTP REQ', message [3].id, message [3].method.toUpperCase (), message [3].url, message [3].origin);
   }
   else if (message [2] === 'response') {
      logLine ('HTTP RES', message [3].id, message [3].method.toUpperCase (), message [3].url, logCodeColor (message [3].code), '(' + message [3].duration + 'ms)');
   }
};

cicek.listen ({port: port}, routes);

clog ('vibey server running on port ' + port);
