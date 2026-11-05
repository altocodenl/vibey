var mode = typeof window === 'undefined' ? 'server' : 'client';

var clog = console.log;

if (mode === 'server') {

   // *** SETUP ***

   var dale   = require ('dale');
   var teishi = require ('teishi');
   var hitit  = require ('hitit');
   var cicek  = require ('cicek');
   var fs     = require ('fs');
   var os     = require ('os');
   var path   = require ('path');
   var {inc, last, type} = teishi;

   dale.async = async function (input, fun, options) {

      if (input === undefined) return [];
      if (teishi.simple (input)) input = [input];

      options = options || {};
      if (options.concurrent === undefined) options.concurrent = 1;
      if (options.concurrent === true) options.concurrent = dale.keys (input).length;

      var index = 0, keys = dale.keys (input), results = [], error;

      var inner = async function () {
         while (true) {
            if (error) return;
            var i = index++;
            if (i >= keys.length) return;

            try {
               results [keys [i]] = await fun (input [keys [i]], keys [i]);
            }
            catch (Error) {
               if (error) return;
               error = Error;
               throw Error;
            }
         }
      }

      try {
         await Promise.all (dale.go (dale.times (Math.min (keys.length, options.concurrent)), inner));
      }
      catch (error) {
         if (options.catch) options.catch (error);
         else               throw error;
      }

      return results;
   }

   var getCookie = function (headers) {
      return headers ['set-cookie'] [0];
   }

   module.exports = {};

   // We export this so we can use it also after client tests, otherwise we'd just call it after the server tests automatically.
   module.exports.cleanup = async function (redis, run) {
      var keys = await redis ('keys', '*');
      var emails = dale.fil (keys, undefined, function (key) {
         // Cleanup is contingent on all test users using `example.com` as their email's domain, and on no real users using this domain.
         // Tests are not designed to run on prod environments.
         if (! key.match (/example\.com$/)) return;
         if (key.match (/^email:/)) return key;
      });
      // Grants to invited emails that never signed up are keyed by email rather than user ID.
      var invites = dale.fil (keys, undefined, function (key) {
         if (key.match (/^accessTo:.+example\.com$/)) return key;
      });

      if (invites.length) await redis ('del', ... invites);

      if (emails.length === 0) return;

      var userIds = await redis ('mget', ... emails);

      var resources = await redis ('sunion', ... dale.go (userIds, function (userId) {
         return 'owner:' + userId;
      }));

      await redis ('del', ... [
         ... dale.go (emails, (email) => [email, 'rateLimit:login:' + email.replace ('email:', '')]).flat (),
         ... dale.go (userIds, (userId) => ['user:' + userId, 'owner:' + userId, 'accessTo:' + userId]).flat (),
         ... dale.fil (resources, undefined, function (resource) {
            if (resource.match (/^project:/)) return resource.replace ('project:', 'accessBy:');
         }),
         ... resources,
      ]);

      var containerIds = dale.fil (resources, undefined, function (resource) {
         if (resource.match (/^project:/)) return resource.replace ('project:', 'vibey-project-');
      });

      if (containerIds.length === 0) return;

      await run ('docker', 'stop',         ... containerIds, {catch: true});
      await run ('docker', 'rm',           ... containerIds, {catch: true});
      await run ('docker', 'volume', 'rm', ... containerIds, {catch: true});
   }

   module.exports.run = function (CONFIG) {
      return function (suite, cb, admin, redis, run) {

         var adminHeaders = {'x-csrf': admin.csrf, cookie: admin.cookie};

         var suites = {};
         var validationError;

         var assert = function (assertion) {
            var result = teishi.v (assertion, true);
            if (result === true) return true;
            validationError = result;
            return false;
         }

         var assertBody = function (body) {
            return function (s, rq, rs) {
               return assert (['body', rs.body, body, teishi.test.equal]);
            }
         }

         // Commits run in the background after the request returns; poll git log until it has `length` commits, then check the latest one.
         var waitForCommits = function (tag, length, name) {
            return [tag, 'get', '/', 200, function (s, rq, rs, next) {
               var started = Date.now ();
               var check = async function () {
                  var response = await fetch ('http://' + s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname + ':' + CONFIG.port + '/project/run', {
                     body: JSON.stringify ({command: 'git log --format=%s', read: true}),
                     headers: {... s.headers, 'content-type': 'application/json', 'x-csrf': s.projectCsrf},
                     method: 'POST',
                  });
                  var subjects = response.ok ? ((await response.json ()).stdout || '').split ('\n').slice (0, -1) : [];
                  if (subjects.length >= length) {
                     if (! assert ([
                        ['commit length', subjects.length, length, teishi.test.equal],
                        ['last commit name', subjects [0], name, teishi.test.equal]
                     ])) return next (validationError + ' ' + JSON.stringify (subjects, null, '   '));
                     return next (null, rs);
                  }
                  if (Date.now () - started > 10000) return next ('Expected ' + length + ' commits, found ' + subjects.length + ' ' + JSON.stringify (subjects, null, '   '));
                  setTimeout (check, 50);
               }
               check ();
            }];
         }

         var cookie = function (type) {
            return '__Host-' + CONFIG.cookie.name + '-' + type;
         }

         var projectHost = function (s) {
            return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname;
         }

         var appHost = function (s) {
            return '3000--' + projectHost (s);
         }

         var projectCookie = function (s) {
            var match = (s.headers.cookie || '').match (new RegExp (cookie ('project') + '="[0-9a-f]+"'));
            return match ? match [0] + '; ' : '';
         }

         var projectFetch = function (s, path, body) {
            return fetch ('http://' + projectHost (s) + ':' + CONFIG.port + path, body ? {
               body: JSON.stringify (body),
               headers: {... s.headers, 'content-type': 'application/json', 'x-csrf': s.projectCsrf},
               method: 'POST',
            } : {headers: s.headers}).then (function (response) {
               return response.ok ? response.json () : null;
            });
         }

         var projectRaw = function (s, path) {
            return fetch ('http://' + projectHost (s) + ':' + CONFIG.port + '/f/' + encodeURIComponent (path) + '?raw=1', {headers: s.headers}).then (function (response) {
               return response.ok ? response.text () : '';
            });
         }

         var agentScript = function (calls) {
            return 'fake-output:\n' + dale.go (calls, function (call) {
               return ['tool-call: agent', call.description, 'path: ' + call.path].concat (call.to ? ['to: ' + call.to] : [], [call.body]).join ('\n');
            }).join ('\n');
         }

         var agentsDone = function (path, check) {
            return function (s) {
               return projectRaw (s, path).then (function (text) {
                  return ! /^pending 1$/m.test (text) && check (text);
               });
            };
         }

         var count = function (text, regex) {
            return (text.match (regex) || []).length;
         }

         var waitFor = function (tag, check) {
            return [tag, 'get', '/', 200, function (s, rq, rs, next) {
               var started = Date.now ();
               var attempt = async function () {
                  if (await check (s)) return next (null, rs);
                  if (Date.now () - started > 10000) return next ('Timed out: ' + tag);
                  setTimeout (attempt, 50);
               }
               attempt ().catch (next);
            }];
         }

         // *** PUBLIC ***

         suites.public = dale.go ([
            ['get', '/'],
            ['get', '/cell.js'],
            ['get', '/favicon.svg'],
            ['get', '/manifest.json'],
            ... dale.go ([180, 192, 512], function (size) {
               return ['get', '/icon/icon-' + size + '.png'];
            }),
            ... dale.go (['normalize.css/normalize', 'tachyons/css/tachyons.min', 'bootstrap-icons/font/bootstrap-icons.min'], function (v) {
               return ['get', '/assets/' + v + (v.match (/\.woff\d?$/) ? '' : '.css')];
            }),
            ... dale.go (['client', 'assets/gotob/gotoB.min', 'assets/marked/lib/marked.umd'], function (v) {
               return ['get', '/' + v + '.js'];
            }),
            ['post', '/error'],
         ], function (route) {
            if (route [0] === 'get') return ['Get public route: ' + route [1], 'get', route [1], 200];
            return ['Post public route: ' + route [1], 'post', route [1], {test: 'hello'}, 200];
         });

         // *** ROUTING ***

         suites.routing = [
            {tag: 'HEAD on public route', method: 'head', path: '/', code: 200, apres: function (s, rq, rs) {
               return assert (['empty body', rs.body === '' || rs.body === undefined, true, teishi.test.equal]);
            }},
            {tag: 'Host outside base domain', method: 'get', host: new URL (CONFIG.baseURL).hostname, headers: {host: 'example.org:' + CONFIG.port}, path: '/', code: 404},
            {tag: 'Nested subdomain', method: 'get', host: 'a.b.' + new URL (CONFIG.baseURL).hostname, path: '/', code: 404},
            dale.go ([['get', '/f/main.md'], ['get', '/project'], ['post', '/project/run']], function (route) {
               return {tag: 'Project route on host: ' + route.join (' '), method: route [0], host: new URL (CONFIG.baseURL).hostname, path: route [1], body: route [0] === 'post' ? {command: 'true'} : '', code: 404};
            }),
            dale.go ([['get', '/projects'], ['get', '/auth/list'], ['post', '/auth/login']], function (route) {
               return {tag: 'Host route on subdomain: ' + route.join (' '), method: route [0], host: 'anything.' + new URL (CONFIG.baseURL).hostname, path: route [1], body: route [0] === 'post' ? {email: 'hello@example.com'} : '', code: 404};
            }),
            {tag: 'App path on subdomain without port', method: 'get', host: 'anything.' + new URL (CONFIG.baseURL).hostname, path: '/p/3000/', code: 404},
            ['Reject dots in asset path', 'get', '/assets/normalize.css/../normalize.css/normalize.css', 400],
            ['Missing asset', 'get', '/assets/nothing.css', 404],
         ];

         // *** TEST ***

         suites.test = CONFIG.cloud ? ['Trigger tests without session', 'get', '/test', 403, assertBody ({error: 'No session'})] : [];

         // *** ERROR REPORTING ***

         suites.error = [
            ['Submit error: object', 'post', '/error', {error: 'Opa'}, 200],
            ['Submit error: array', 'post', '/error', ['error', 'Opa'], 200],
            ['Submit error: string', 'post', '/error', 'There was a problem...', 200],
         ];

         // *** AUTH ***

         // Create an account, check its generated username, then restore the main session.
         var usernameAccount = function (email, username, grant) {
            return [
               grant ? ['Create username fixture through creator grant', 'post', '/creator/grant', {email, grant: true}, 200, adminHeaders] : [],
               ['Login username fixture ' + email, 'post', '/auth/login', {email}, 200, function (s, rq, rs) {
                  s.usernameLoginLink = rs.body.loginLink;
                  s.usernameMainSession = {cookie: s.headers.cookie, csrf: s.headers ['x-csrf']};
                  return true;
               }],
               ['Verify username fixture ' + email, 'get', function (s) {
                  return '/auth/verify/' + s.usernameLoginLink;
               }, 200, function (s, rq, rs) {
                  if (! assert (['username', rs.body.username, username, teishi.test.equal])) return false;
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  if (! s.usernameSessions) s.usernameSessions = {};
                  s.usernameSessions [email] = {cookie: s.headers.cookie, csrf: rs.body.csrf};
                  return true;
               }],
               ['Read username fixture ' + email, 'get', '/auth/user', 200, function (s, rq, rs) {
                  s.headers.cookie = s.usernameMainSession.cookie;
                  s.headers ['x-csrf'] = s.usernameMainSession.csrf;
                  return assert (['username', rs.body.username, username, teishi.test.equal]);
               }],
            ];
         };

         var deleteUsernameAccount = function (email) {
            return [
               ['Select username fixture ' + email, 'get', '/', 200, function (s, rq, rs) {
                  s.headers.cookie = s.usernameSessions [email].cookie;
                  s.headers ['x-csrf'] = s.usernameSessions [email].csrf;
                  return true;
               }],
               ['Delete username fixture ' + email, 'post', '/auth/delete', {}, 200, function (s, rq, rs) {
                  s.headers.cookie = s.usernameMainSession.cookie;
                  s.headers ['x-csrf'] = s.usernameMainSession.csrf;
                  return true;
               }],
            ];
         };

         var authSettings = [
            dale.go ([{}, {vi: true}, {vi: false}, {}], function (settings, index) {
               return [
                  ['Set settings #' + index, 'put', '/auth/user', {settings}, 200, assertBody ({settings})],
                  ['Read settings #' + index, 'get', '/auth/user', 200, function (s, rq, rs) {
                     return assert (['settings', rs.body.settings, settings, teishi.test.equal]);
                  }],
               ];
            }),
            ['Set settings before invalid requests', 'put', '/auth/user', {settings: {vi: true}}, 200, assertBody ({settings: {vi: true}})],
            dale.go ([
               {settings: null},
               {settings: []},
               {settings: 'vi'},
               {settings: true},
               {settings: 1},
               {settings: {}, extra: true},
               {settings: {extra: true}},
               {settings: {vi: false, extra: true}},
               {settings: {vi: null}},
               {settings: {vi: 0}},
               {settings: {vi: 1}},
               {settings: {vi: 'true'}},
               {settings: {vi: 'false'}},
               {settings: {vi: []}},
               {settings: {vi: {}}},
            ], function (body, index) {
               return ['Reject invalid settings #' + index, 'put', '/auth/user', body, 400];
            }),
            ['Reject update without settings or username', 'put', '/auth/user', {}, 400, assertBody ({error: 'Provide settings or username'})],
            CONFIG.cloud ? [
               ['Set settings without session', 'put', '/auth/user', {settings: {}}, 403, assertBody ({error: 'No session'}), {cookie: ''}],
               ['Set settings with invalid CSRF', 'put', '/auth/user', {settings: {}}, 403, assertBody ({error: 'Invalid csrf token'}), {'x-csrf': 'invalid'}],
            ] : [],
            ['Rejected updates preserve settings', 'get', '/auth/user', 200, function (s, rq, rs) {
               return assert (['settings', rs.body.settings, {vi: true}, teishi.test.equal]);
            }],
            ['Clear settings', 'put', '/auth/user', {settings: {}}, 200, assertBody ({settings: {}})],
            ['Read cleared settings', 'get', '/auth/user', 200, function (s, rq, rs) {
               return assert (['settings', rs.body.settings, {}, teishi.test.equal]);
            }],
         ];

         suites.auth = [
            ['Get /auth/user without session', 'get', '/auth/user', '*', function (s, rq, rs) {
               if (CONFIG.cloud) return assert ([
                  ['code', rs.code, 403, teishi.test.equal],
                  ['body', rs.body, {error: 'No session'}, teishi.test.equal],
               ]);
               return assert ([
                  ['code', rs.code, 200, teishi.test.equal],
                  ['body.mode', rs.body.mode, 'local', teishi.test.equal],
                  ['body.creator', rs.body.creator, true, teishi.test.equal],
                  ['body.credentials', rs.body.credentials, 'object'],
               ]);
            }],
            dale.go (['/creator/grant', '/auth/login'], function (path, k) {
               if (CONFIG.cloud) return [
                  ['Call auth path without email', 'post', path, {}, 400, assertBody ({error: 'email should have as type string but instead is undefined with type undefined'}), path === '/creator/grant' ? adminHeaders : {}],
                  dale.go ([undefined, null, 1, '', '1', 'a@a', 'hello@example', 'this@is.not.really.an.emai.l'], function (email, k) {
                     return ['Call auth path with invalid email: #' + (k + 1), 'post', path, {email: email}, 400, function (s, rq, rs) {
                        return assert ([
                           ['body', rs.body, 'object'],
                           function () {
                              return ['body.error', rs.body.error, 'string'];
                           },
                           function () {
                              return ['body.error', rs.body.error, /^email should/, teishi.test.match];
                           }
                        ]);
                     }, path === '/creator/grant' ? adminHeaders : {}];
                  }),
               ];

               if (! CONFIG.cloud) return ['Call auth path in local mode', 'post', path, {}, 404, assertBody ({error: 'Not in cloud mode'})];
            }),
            CONFIG.cloud ? [
               ['Login with an extra key', 'post', '/auth/login', {email: 'hello@example.com', extra: true}, 400, function (s, rq, rs) {
                  return assert (['error', rs.body.error, /keys of body/, teishi.test.match]);
               }],
               ['Login', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify login (invalid link)', 'get', '/auth/verify/bogus', 403, assertBody ({error: 'Invalid login link', loginLink: 'bogus'})],
               ['Verify login again', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  if (! assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (cookie ('host') + '="[a-f0-9]{64}"; Expires=.+ ' + (parseInt (new Date ().toISOString ().slice (0, 4)) + 10) + ' .+ HttpOnly; Path=\\/; SameSite=None;'), teishi.test.match],
                     ['csrf token', rs.body.csrf, 'string']
                  ])) return false;
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Request first login link', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.firstLoginLink = rs.body.loginLink;
                  return true;
               }],
               ['Request second login link with uppercase email', 'post', '/auth/login', {email: 'HELLO@Example.com'}, 200, function (s, rq, rs, next) {
                  redis ('get', 'loginLink:' + rs.body.loginLink).then (function (email) {
                     if (! assert (['link email', email, 'hello@example.com', teishi.test.equal])) return next (new Error (validationError));
                     next (null, rs);
                  }, next);
               }],
               ['Verify replaced login link', 'get', function (s) {return '/auth/verify/' + s.firstLoginLink}, 403, function (s, rq, rs, next) {
                  if (! assert (['body', rs.body, {error: 'Invalid login link', loginLink: s.firstLoginLink}, teishi.test.equal])) return false;
                  redis ('del', 'rateLimit:login:hello@example.com').then (function () {next (null, rs)}, next);
               }],
               ['Request creator access', 'post', '/creator/request', {}, 200],
               ['Request creator access again', 'post', '/creator/request', {}, 200],
               ['Grant creator access', 'post', '/creator/grant', {email: 'hello@example.com', grant: true}, 200, adminHeaders],
               ['Grant creator access for nonexisting account', 'post', '/creator/grant', {email: 'foo@example.com', grant: true}, 200, adminHeaders],
               ['Get user', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert ([
                     ['body', rs.body, 'object'],
                     ['body.admin', rs.body.admin, undefined, teishi.test.equal],
                     ['body.count', rs.body.count, 'integer'],
                     ['body.creator', rs.body.creator, true, teishi.test.equal],
                     ['body.credentials', rs.body.credentials, {}, teishi.test.equal],
                     ['body.csrf', rs.body.csrf, s.headers ['x-csrf'], teishi.test.equal],
                     ['body.email', rs.body.email, 'hello@example.com', teishi.test.equal],
                     ['body.settings', rs.body.settings, {}, teishi.test.equal],
                     ['body.username', rs.body.username, 'hello', teishi.test.equal],
                  ]);
               }],
               ['Age host session', 'get', '/', 200, function (s, rq, rs, next) {
                  s.agedSession = s.headers.cookie.match (/"([0-9a-f]+)"/) [1];
                  redis ([
                     ['hset', 'session-h:' + s.agedSession, 'expires', new Date (Date.now () + 60000).toISOString ()],
                     ['hset', 'session-h:' + s.agedSession, 'last', JSON.stringify ({date: '2000-01-01T00:00:00.000Z', ip: 'aged'})],
                  ]).then (function () {next (null, rs)}, next);
               }, {cookie: ''}],
               ['Request with aged session', 'get', '/auth/user', 200],
               ['Request refreshes session', 'get', '/', 200, function (s, rq, rs, next) {
                  redis ('hmget', 'session-h:' + s.agedSession, 'expires', 'last').then (function (session) {
                     if (! assert ([
                        ['expires extended', new Date (session [0]).getTime () > Date.now () + 3600000, true, teishi.test.equal],
                        ['last updated', JSON.parse (session [1]).date === '2000-01-01T00:00:00.000Z', false, teishi.test.equal],
                     ])) return next (new Error (validationError));
                     next (null, rs);
                  }, next);
               }, {cookie: ''}],
               ['Admin flag for admin', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert (['body.admin', rs.body.admin, true, teishi.test.equal]);
               }, adminHeaders],
               ['Non-admin cannot grant creator access', 'post', '/creator/grant', {email: 'foo@example.com', grant: true}, 403, assertBody ({error: 'Not admin'})],
               ['Non-admin cannot download tests', 'get', '/test.js', 403, assertBody ({error: 'Not admin'})],
               ['Request creator access as creator', 'post', '/creator/request', {}, 409, assertBody ({error: 'Already a creator'})],
               ['Request creator access with a body', 'post', '/creator/request', {extra: true}, 400, function (s, rq, rs) {
                  return assert (['error', rs.body.error, /body should be equal to/, teishi.test.match]);
               }],
               ['Revoke creator access', 'post', '/creator/grant', {email: 'hello@example.com', grant: false}, 200, adminHeaders],
               ['Get user after revocation', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert (['body.creator', rs.body.creator, false, teishi.test.equal]);
               }],
               ['Create project after revocation', 'post', '/project', {name: 'not allowed'}, 403, assertBody ({error: 'Please request creator access'})],
               ['Revoke creator access for nonexisting account', 'post', '/creator/grant', {email: 'nobody@example.com', grant: false}, 404, adminHeaders],
               ['Restore creator access', 'post', '/creator/grant', {email: 'hello@example.com', grant: true}, 200, adminHeaders],
               // Both creation paths allocate usernames; collisions use the first available suffix.
               usernameAccount ('hello@example.net', 'hello-example'),
               usernameAccount ('hello@example.org', 'hello-example-1'),
               usernameAccount ('hello@example.io', 'hello-example-2', true),
               usernameAccount ('hello+tag@example.com', 'hello-tag'),
               usernameAccount ('a@example.com', 'a11'),
               usernameAccount ('ab@example.com', 'ab1', true),
               usernameAccount ('abc@example.com', 'abc'),
               deleteUsernameAccount ('a@example.com'),
               deleteUsernameAccount ('ab@example.com'),
               deleteUsernameAccount ('abc@example.com'),
               dale.go ([
                  ['HELLO-RENAMED', 'hello-renamed'],
                  ['用户名', '用户名'],
                  ['用户1', '用户1'],
                  ['用户-1', '用户-1'],
                  ['ΑΒΓ', 'αβγ'],
                  ['α\u0301βγ', 'άβγ'],
                  ['किरण', 'किरण'],
               ], function (test) {
                  return ['Normalize username ' + test [0], 'put', '/auth/user', {username: test [0]}, 200, assertBody ({username: test [1]})];
               }),
               ['Set username without changing settings', 'put', '/auth/user', {username: 'hello-renamed'}, 200, assertBody ({username: 'hello-renamed'})],
               ['Read renamed user', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert ([
                     ['username', rs.body.username, 'hello-renamed', teishi.test.equal],
                     ['settings', rs.body.settings, {}, teishi.test.equal],
                  ]);
               }],
               ['Set same username', 'put', '/auth/user', {username: 'hello-renamed'}, 200, assertBody ({username: 'hello-renamed'})],
               ['Set username and settings', 'put', '/auth/user', {username: 'hello-renamed', settings: {vi: true}}, 200, assertBody ({username: 'hello-renamed', settings: {vi: true}})],
               ['Reject occupied username', 'put', '/auth/user', {username: 'hello-example'}, 409, assertBody ({error: 'Username already taken'})],
               ['Reject occupied username from creator grant', 'put', '/auth/user', {username: 'hello-example-2'}, 409, assertBody ({error: 'Username already taken'})],
               ['Reject conflict before changing settings', 'put', '/auth/user', {username: 'hello-example', settings: {vi: false}}, 409, assertBody ({error: 'Username already taken'})],
               dale.go ([
                  null, true, 123, [], {},
                  '', 'hello world', 'hello_world', 'hello@example.com',
                  '-hello', 'hello-', 'hello--world', 'hello/world',
                  'c79f2829-1086-43f2-b477-88abbcdbda11',
               ], function (username, index) {
                  return ['Reject invalid username #' + index, 'put', '/auth/user', {username}, 400];
               }),
               dale.go ([
                  ['ab', 'Username must have at least 3 characters'],
                  ['a b', 'Username cannot contain whitespace'],
                  ['ab\n', 'Username cannot contain whitespace'],
                  ['a用户', 'Username cannot mix ASCII letters with non-ASCII characters'],
                  ['hello--world', 'Username cannot contain double dashes'],
                  ['hello_world', 'Username can only contain letters, combining marks, numbers and dashes'],
                  ['-hello', 'Username must start with a letter or number'],
                  ['\u0301用户', 'Username must start with a letter or number'],
                  ['hello-', 'Username cannot end with a dash'],
                  ['用户-\u0301名', 'A combining mark cannot follow a dash'],
                  ['12345', 'Username cannot be only digits'],
                  ['c79f2829-1086-43f2-b477-88abbcdbda11', 'Username cannot be a UUID'],
               ], function (test) {
                  // Rejection must preserve settings as well as the username.
                  return ['Reject username ' + test [0], 'put', '/auth/user', {settings: {vi: false}, username: test [0]}, 400, assertBody ({error: test [1]})];
               }),
               ['Reject invalid settings before changing username', 'put', '/auth/user', {username: 'should-not-be-saved', settings: {vi: null}}, 400],
               ['Rejected updates preserve username and settings', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert ([
                     ['username', rs.body.username, 'hello-renamed', teishi.test.equal],
                     ['settings', rs.body.settings, {vi: true}, teishi.test.equal],
                  ]);
               }],
               ['Settings-only update', 'put', '/auth/user', {settings: {}}, 200, assertBody ({settings: {}})],
               ['Settings-only update preserves username', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert (['username', rs.body.username, 'hello-renamed', teishi.test.equal]);
               }],
               // Renaming releases the old name; deleting an account allows reclaiming its name.
               usernameAccount ('hello@example.dev', 'hello'),
               ['Old username now belongs to another account', 'put', '/auth/user', {username: 'hello'}, 409, assertBody ({error: 'Username already taken'})],
               deleteUsernameAccount ('hello@example.dev'),
               ['Reclaim username after account deletion', 'put', '/auth/user', {username: 'hello'}, 200, assertBody ({username: 'hello'})],
               deleteUsernameAccount ('hello@example.org'),
               usernameAccount ('hello@example.app', 'hello-example-1'),
               deleteUsernameAccount ('hello@example.app'),
               deleteUsernameAccount ('hello@example.net'),
               deleteUsernameAccount ('hello@example.io'),
               deleteUsernameAccount ('hello+tag@example.com'),
               ['Create unverified username fixture', 'post', '/auth/login', {email: 'username-expiry@example.com'}, 200, function (s, rq, rs, next) {
                  (async function () {
                     var id = await redis ('get', 'email:username-expiry@example.com');
                     s.usernameExpiryId = id;
                     var [owner, userTTL, nameTTL] = await redis ([
                        ['get', 'username:username-expiry'],
                        ['pttl', 'user:' + id],
                        ['pttl', 'username:username-expiry'],
                     ]);
                     if (! assert ([
                        ['username owner', owner, id, teishi.test.equal],
                        ['user has expiry', userTTL > 0, true, teishi.test.equal],
                        ['username shares user expiry', nameTTL > 0 && Math.abs (userTTL - nameTTL) < 100, true, teishi.test.equal],
                     ])) return next (new Error (validationError));
                     await redis ([
                        ['pexpire', 'user:' + id, 60000],
                        ['pexpire', 'email:username-expiry@example.com', 60000],
                        ['pexpire', 'username:username-expiry', 60000],
                     ]);
                     next (null, rs);
                  }) ().catch (next);
               }],
               ['Another login renews username expiry', 'post', '/auth/login', {email: 'username-expiry@example.com'}, 200, function (s, rq, rs, next) {
                  (async function () {
                     var [userTTL, nameTTL] = await redis ([
                        ['pttl', 'user:' + s.usernameExpiryId],
                        ['pttl', 'username:username-expiry'],
                     ]);
                     if (! assert ([
                        ['user expiry renewed', userTTL > 290000, true, teishi.test.equal],
                        ['username expiry renewed', nameTTL > 290000 && Math.abs (userTTL - nameTTL) < 100, true, teishi.test.equal],
                     ])) return next (new Error (validationError));
                     // Accelerate the matching expiries instead of waiting five minutes.
                     var deadline = Date.now () + 50;
                     await redis ([
                        ['pexpireat', 'user:' + s.usernameExpiryId, deadline],
                        ['pexpireat', 'email:username-expiry@example.com', deadline],
                        ['pexpireat', 'username:username-expiry', deadline],
                     ]);
                     await new Promise (function (resolve) {setTimeout (resolve, 100)});
                     var remaining = await redis ([
                        ['exists', 'user:' + s.usernameExpiryId],
                        ['exists', 'email:username-expiry@example.com'],
                        ['exists', 'username:username-expiry'],
                     ]);
                     if (! assert (['expired user, email and username', remaining, [0, 0, 0], teishi.test.equal])) return next (new Error (validationError));
                     next (null, rs);
                  }) ().catch (next);
               }],
               usernameAccount ('username-expiry@example.com', 'username-expiry'),
               ['Verified username has no expiry', 'get', '/', 200, function (s, rq, rs, next) {
                  (async function () {
                     var ttl = await redis ('pttl', 'username:username-expiry');
                     if (! assert (['username expiry', ttl, -1, teishi.test.equal])) return next (new Error (validationError));
                     next (null, rs);
                  }) ().catch (next);
               }],
               deleteUsernameAccount ('username-expiry@example.com'),
               authSettings,
               ['Logout', 'post', '/auth/logout', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (cookie ('host') + '="false"; HttpOnly; Path=\\/; SameSite=None'), teishi.test.match],
                  ]);
               }],
               ['Logout again', 'post', '/auth/logout', {}, 403, assertBody ({error: 'Invalid session'})],
               dale.go (dale.times (5), function (v) {
                  return ['Login buildup for rate limit #' + (v + 1), 'post', '/auth/login', {email: 'hello@example.com'}, 200];
               }),
               ['Login rate limited', 'post', '/auth/login', {email: 'hello@example.com'}, 403, function (s, rq, rs, next) {
                  if (! assert (['body', rs.body, {error: 'Rate limited'}, teishi.test.equal])) return false;
                  (async function () {
                     await redis ('del', 'rateLimit:login:hello@example.com');
                     next (null, rs);
                  }) ();
               }],
               dale.go (dale.times (4), function (v) {
                  return ['Login buildup for almost rate limit #' + (v + 1), 'post', '/auth/login', {email: 'hello@example.com'}, 200];
               }),
               ['Login', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify login after almost rate limited', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Login again also OK (rate limit resetted by successful verify)', 'post', '/auth/login', {email: 'hello@example.com'}, 200],
               ['Verify with already used login link', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 403, function (s, rq, rs) {
                  return assert ([
                     ['body.error', rs.body.error, 'Invalid login link', teishi.test.equal],
                     ['body.loginLink', rs.body.loginLink, s.loginLink, teishi.test.equal],
                  ]);
               }],

               ['Private route with invalid session', 'get', '/auth/user', 403, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (cookie ('host') + '="false"; HttpOnly; Path=\\/; SameSite=None'), teishi.test.match],
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                  ]);
               }, {cookie: cookie ('host') + '="foo"'}],
               ['Private route with no session', 'get', '/auth/user', 403, assertBody ({error: 'No session'}), {cookie: ''}],
               ['Public route with invalid session', 'get', '/', 200, {cookie: cookie ('host') + '="foo"'}],
               ['Private route with invalid csrf token', 'post', '/auth/logout', {}, 403, assertBody ({error: 'Invalid csrf token'}), {'x-csrf': 'foo'}],
               ['Public route with invalid csrf token', 'post', '/error', {hi: 'there'}, 200],
               ['Login again (second session)', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify second login', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  // Store old and new session
                  s.sessions = [{cookie: s.headers.cookie, csrf: s.headers ['x-csrf']}, {cookie: getCookie (rs.headers), csrf: rs.body.csrf}];
                  // Update csrf token but not cookie so there's a mismatch for the next test
                  s.headers ['x-csrf'] = s.sessions [1].csrf;
                  return true;
               }],
               ['Private route with mismatched csrf token', 'post', '/auth/logout', {}, 403, assertBody ({error: 'Invalid csrf token'})],
               ['Public route with mismatched csrf token', 'post', '/error', {hi: 'there'}, 200, function (s, rq, rs) {
                  // Restore correct csrf token
                  s.headers ['x-csrf'] = s.sessions [0].csrf;
                  return true;
               }],

               // *** SESSION LIST & DELETE ***

               ['List sessions', 'get', '/auth/list', 200, function (s, rq, rs) {
                  if (! assert ([
                     ['body', rs.body, 'array'],
                     ['body.length', rs.body.length, 2, teishi.test.equal],
                  ])) return false;

                  return dale.stop (rs.body, false, function (session) {
                     return assert ([
                        ['session.expired', session.expired, false, teishi.test.equal],
                        ['session.last.date', session.last.date, 'string'],
                        ['session.last.ip', session.last.ip, 'string'],
                     ]);
                  }) !== false;
               }],
               ['Expire a session', 'get', '/', 200, function (s, rq, rs, next) {
                  (async function () {
                     await redis ('hset', 'session-h:' + s.sessions [1].cookie.match (/"[0-9a-f]+"/) [0].replace (/"/g, ''), 'expires', new Date ().toISOString ());
                     next (null, rs);
                  }) ();
               }],
               ['List sessions (one expired)', 'get', '/auth/list', 200, function (s, rq, rs) {
                  var expired = dale.fil (rs.body, undefined, function (v) { if (v.expired) return v });
                  var active  = dale.fil (rs.body, undefined, function (v) { if (! v.expired) return v });

                  // Switch to expired session
                  s.headers.cookie     = s.sessions [1].cookie;
                  s.headers ['x-csrf'] = s.sessions [1].csrf;

                  return assert ([
                     ['expired count', expired.length, 1, teishi.test.equal],
                     ['active count',  active.length,  1, teishi.test.equal],
                  ]);
               }],
               ['List sessions with expired session', 'get', '/auth/list', 403, function (s, rq, rs) {

                  // Switch to active session
                  s.headers.cookie     = s.sessions [0].cookie;
                  s.headers ['x-csrf'] = s.sessions [0].csrf;

                  return assert ([
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (cookie ('host') + '="false"; HttpOnly; Path=\\/; SameSite=None'), teishi.test.match],
                  ]);
               }],
               ['Delete account', 'post', '/auth/delete', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (cookie ('host') + '="false"; HttpOnly; Path=\\/; SameSite=None'), teishi.test.match],
                  ]);
               }],
               ['List sessions after delete', 'get', '/auth/list', 403, assertBody ({error: 'Invalid session'})],
               ['Get user after delete', 'get', '/auth/user', 403, assertBody ({error: 'Invalid session'})],
            ] : [],
            ! CONFIG.cloud ? [
               ['Logout', 'post', '/auth/logout', {}, 404, assertBody ({error: 'Not in cloud mode'})],
               ['Get user in local mode', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert ([
                     ['body.mode', rs.body.mode, 'local', teishi.test.equal],
                     ['body.creator', rs.body.creator, true, teishi.test.equal],
                     ['body.credentials', rs.body.credentials, 'object'],
                  ]);
               }],
               ['List sessions', 'get', '/auth/list', 404, assertBody ({error: 'Not in cloud mode'})],
               authSettings,
            ] : [],
         ];

         var hostLogin = function (tag, email) {
            return [
               ['Login ' + tag, 'post', '/auth/login', {email}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify ' + tag, 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
            ];
         }

         var sessionId = function (s, type) {
            return s.headers.cookie.match (new RegExp (cookie (type) + '="([0-9a-f]+)"')) [1];
         }

         // Asks the host for a code to open a session on `subdomain`, which comes back to `path` on that subdomain.
         var mintSessionCode = function (tag, subdomain, state, path) {
            return ['Mint session code ' + tag, 'get', function (s) {
               var base = new URL (CONFIG.baseURL);
               return '/auth/project/' + subdomain (s) + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + subdomain (s) + '.' + base.host + (path || '/f/main.md')) + '&state=' + state (s);
            }, 302, function (s, rq, rs) {
               var location = new URL (rs.headers.location);
               s.mintedCodePath = location.pathname + location.search;
               return true;
            }];
         }

         // Makes `s [key]` the subdomain that project routes go to.
         var useProject = function (key) {
            return ['Use project ' + key, 'get', '/', 200, function (s) {
               s.projectSubdomain = s [key];
               return true;
            }];
         }

         // Switches to a session opened by `projectLogin`, including its user's host session.
         var useSession = function (tag) {
            return ['Switch to ' + tag, 'get', '/', 200, function (s) {
               var session = s.projectSessions [tag];
               s.headers.cookie = session.cookie;
               s.headers ['x-csrf'] = session.hostCsrf;
               s.projectCsrf = session.projectCsrf;
               s.projectSubdomain = session.projectSubdomain;
               return true;
            }];
         }

         // Opens a session for the current user on `s [key]`'s subdomain, makes it the current project and saves it as `tag` for `useSession`.
         var projectLogin = function (tag, key) {
            return [
               useProject (key),
               mintSessionCode ('for ' + tag, function (s) {return s.projectSubdomain}, function (s) {return 'foo'}),
               ['Exchange session code for ' + tag, 'get', function (s) {return s.mintedCodePath}, 302, function (s, rq, rs) {
                  s.headers.cookie = s.headers.cookie.split (';') [0] + '; ' + rs.headers ['set-cookie'] [0].split (';') [0];
                  return true;
               }, {cookie: cookie ('project-state') + '="foo"'}],
               {
                  tag: 'Get project csrf for ' + tag,
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/auth/user',
                  code: 200,
                  apres: function (s, rq, rs) {
                     s.projectCsrf = rs.body.csrf;
                     s.projectSessions = s.projectSessions || {};
                     s.projectSessions [tag] = {cookie: s.headers.cookie, hostCsrf: s.headers ['x-csrf'], projectCsrf: s.projectCsrf, projectSubdomain: s.projectSubdomain};
                     return true;
                  },
               },
            ];
         }

         suites.project = [

            // *** PROJECT (HOST) ***

            CONFIG.cloud ? [
               ['Grant creator access', 'post', '/creator/grant', {email: 'hello@example.com', grant: true}, 200, adminHeaders],
               ['Login', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify login', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
            ] : [],
            ['List projects before creation', 'get', '/projects', 200, assertBody ([])],
            ['Create project without a name', 'post', '/project', {}, 400, assertBody ({error: 'name should have as type string but instead is undefined with type undefined'})],
            ['Create project with a short name', 'post', '/project', {name: 'a'}, 400, assertBody ({error: 'length of name should be in range {"max":500,"min":2} but instead is 1'})],
            ['Reject 501-character project name', 'post', '/project', {name: 'A'.repeat (501)}, 400],
            dale.go ([0, 6, '3', 1.5], function (slot) {
               return ['Reject slot ' + JSON.stringify (slot), 'post', '/project', {name: 'slotted', slot}, 400, function (s, rq, rs) {
                  return assert (['error', rs.body.error, /slot should be/, teishi.test.match]);
               }];
            }),
            ['Create project with 500-character name', 'post', '/project', {name: 'A'.repeat (500)}, 200, function (s, rq, rs) {
               s.longNameProjectId = rs.body.id;
               return assert (['subdomain', rs.body.subdomain, undefined, teishi.test.equal]);
            }],
            ['Retain case on creation', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['name', rs.body [0].name, 'A'.repeat (500), teishi.test.equal],
                  ['subdomain', rs.body [0].subdomain, undefined, teishi.test.equal],
               ]);
            }],
            ['Reject lowercase duplicate of long name', 'post', '/project', {name: 'a'.repeat (500)}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Delete long-name fixture', 'delete', function (s) {
               return '/project/' + s.longNameProjectId;
            }, 200],
            ['Create project', 'post', '/project', {name: 'el norte'}, 200, function (s, rq, rs) {
               if (! CONFIG.cloud) return true;
               return assert (['subdomain', rs.body.subdomain, /^[a-z0-9-]+--el-norte$/, teishi.test.match]);
            }],
            ['List projects after creation', 'get', '/projects', 200, function (s, rq, rs) {
               if (! assert (['length', rs.body.length, 1, teishi.test.equal])) return false;
               if (CONFIG.cloud && ! assert ([
                  ['ownerUsername', rs.body [0].ownerUsername, 'string'],
                  function () {return ['subdomain', rs.body [0].subdomain, rs.body [0].ownerUsername + '--el-norte', teishi.test.equal]},
               ])) return false;
               s.projectId = rs.body [0].id;
               return true;
            }],
            ['Create a second project with the same name', 'post', '/project', {name: 'el norte'}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Reject differently cased duplicate', 'post', '/project', {name: 'EL NORTE'}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Create a second project with another name and a slot', 'post', '/project', {name: 'second', slot: 3}, 200],
            ['List projects after second project creation', 'get', '/projects', 200, function (s, rq, rs) {
               if (! assert (['length', rs.body.length, 2, teishi.test.equal])) return false;
               if (new Date (rs.body [0].last) < new Date (rs.body [1].last)) {
                  validationError = 'Last project should come first';
                  return false;
               }
               if (! assert ([
                  ['second project slot', rs.body [0].slot, 3, teishi.test.equal],
                  ['first project slot', rs.body [1].slot, undefined, teishi.test.equal],
               ])) return false;
               s.secondProjectId = rs.body [0].id;
               return true;
            }],
            ['Create project taking another project\'s slot', 'post', '/project', {name: 'slot thief', slot: 3}, 200, function (s, rq, rs) {
               s.slotThiefId = rs.body.id;
               return true;
            }],
            ['Taken slot moves to the new project', 'get', '/projects', 200, function (s, rq, rs) {
               var slots = dale.obj (rs.body, function (p) {return [p.id, p.slot]});
               return assert ([
                  ['new project slot', slots [s.slotThiefId], 3, teishi.test.equal],
                  ['second project slot', slots [s.secondProjectId], undefined, teishi.test.equal],
               ]);
            }],
            ['Delete slot thief', 'delete', function (s) {return '/project/' + s.slotThiefId}, 200],
            ['Restore second project slot', 'put', '/project', function (s) {return {id: s.secondProjectId, name: 'second', slot: 3}}, 200],
            ['Rename project', 'put', '/project', {name: 'el norte'}, 400, assertBody ({error: 'id should have as type string but instead is undefined with type undefined'})],
            ['Rename nonexistent project', 'put', '/project', {id: 'nonexistent', name: 'whatever'}, 404],
            ['Rename project (noop)', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte'}}, 200],
            ['Rename project to existing name', 'put', '/project', function (s) {return {id: s.projectId, name: 'second'}}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Reject differently cased rename conflict', 'put', '/project', function (s) {
               return {
                  id: s.projectId,
                  name: 'SECOND',
               };
            }, 409, assertBody ({error: 'There is already a project with that name'})],
            dale.go (['El Norte', 'B'.repeat (500)], function (name) {
               return [
                  ['Rename and retain case', 'put', '/project', function (s) {
                     return {
                        id: s.projectId,
                        name,
                     };
                  }, 200],
                  ['Read renamed project', 'get', '/projects', 200, function (s, rq, rs) {
                     var project = dale.stopNot (rs.body, undefined, function (project) {
                        if (project.id === s.projectId) return project;
                     });
                     return assert (['name', project.name, name, teishi.test.equal]);
                  }],
               ];
            }),
            ['Reject 501-character rename', 'put', '/project', function (s) {
               return {
                  id: s.projectId,
                  name: 'B'.repeat (501),
               };
            }, 400],
            ['Restore project name', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte'}}, 200],
            dale.go ([
               ['is a UUID', '0b1f6c2e-8d3a-4f5b-9c7d-1e2f3a4b5c6d'],
               ['is an uppercase UUID', '0B1F6C2E-8D3A-4F5B-9C7D-1E2F3A4B5C6D'],
               ['has two spaces in a row', 'el  norte'],
               ['has a space before a dash', 'el -norte'],
               ['has a dash before a space', 'el- norte'],
               ['has a slash', 'el/norte'],
               ['has a question mark', 'el norte?'],
            ], function (entry) {
               return [
                  ['Create project with a name that ' + entry [0], 'post', '/project', {name: entry [1]}, 400, assertBody ({error: 'Project names cannot be a UUID, contain / or ?, have two spaces in a row, or have a space next to a dash'})],
                  ['Rename project to ' + entry [0], 'put', '/project', function (s) {return {id: s.projectId, name: entry [1]}}, 400, assertBody ({error: 'Project names cannot be a UUID, contain / or ?, have two spaces in a row, or have a space next to a dash'})],
               ];
            }),
            ['Rename project and set slot', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte!', slot: 4}}, 200],
            ['List projects after setting slot', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['length', rs.body.length, 2, teishi.test.equal],
                  function () {return [
                     ['project id', rs.body [0].id, s.projectId, teishi.test.equal],
                     ['project name', rs.body [0].name, 'el norte!', teishi.test.equal],
                     ['project slot', rs.body [0].slot, 4, teishi.test.equal],
                  ]}
               ]);
            }],
            ['Rename project and remove slot', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte!'}}, 200],
            ['List projects after removing slot', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['length', rs.body.length, 2, teishi.test.equal],
                  function () {return [
                     ['project id', rs.body [0].id, s.projectId, teishi.test.equal],
                     ['project name', rs.body [0].name, 'el norte!', teishi.test.equal],
                     ['project slot', rs.body [0].slot, undefined, teishi.test.equal],
                  ]}
               ]);
            }],
            ['Set slot to same value as another project', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte!', slot: 3}}, 200],
            ['List projects after slot conflict', 'get', '/projects', 200, function (s, rq, rs) {
               var first = dale.stopNot (rs.body, undefined, function (p) { if (p.id === s.projectId) return p });
               var second = dale.stopNot (rs.body, undefined, function (p) { if (p.id === s.secondProjectId) return p });
               return assert ([
                  ['first project slot', first.slot, 3, teishi.test.equal],
                  ['second project slot', second.slot, undefined, teishi.test.equal],
               ]);
            }],
            ['Delete nonexistent project', 'delete', '/project/nonexistent', 404],
            ['Delete project', 'delete', function (s) {return '/project/' + s.secondProjectId}, 200],
            ['List projects after second project deletion', 'get', '/projects', 200, function (s, rq, rs) {
               s.projectSubdomain = s.projectId;
               return assert (['length', rs.body.length, 1, teishi.test.equal]);
            }],

            // *** PROJECT (SUBDOMAIN) ***

            CONFIG.cloud ? [
               ['Get username', 'get', '/auth/user', 200, function (s, rq, rs) {
                  if (! assert (['username', rs.body.username, 'string'])) return false;
                  s.username = rs.body.username;
                  return true;
               }],
               {
                  tag: 'Redirect to project login for nonexistent project',
                  method: 'get',
                  host: '00000000-0000-4000-8000-000000000000.' + new URL (CONFIG.baseURL).hostname,
                  path: '/f/main.md',
                  code: 302,
                  apres: function (s, rq, rs) {
                     var base = new URL (CONFIG.baseURL);
                     var location = new URL (rs.headers.location);
                     return assert ([
                        ['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/00000000-0000-4000-8000-000000000000', teishi.test.equal],
                        ['returnUrl', location.searchParams.get ('returnUrl'), base.protocol + '//00000000-0000-4000-8000-000000000000.' + base.host + '/f/main.md', teishi.test.equal],
                        ['cookie', getCookie (rs.headers), new RegExp ('^' + cookie ('project-state') + '='), teishi.test.match],
                     ]);
                  },
               },
               {
                  tag: 'Redirect to project login with invalid project session',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/f/main.md',
                  headers: function (s) {return {cookie: s.headers.cookie.split (';') [0] + '; ' + cookie ('project') + '="' + 'f'.repeat (64) + '"'}},
                  code: 302,
                  apres: function (s, rq, rs) {
                     var location = new URL (rs.headers.location);
                     return assert ([
                        ['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal],
                        ['only sets state cookie', rs.headers ['set-cookie'].length, 1, teishi.test.equal],
                        ['cookie', getCookie (rs.headers), new RegExp ('^' + cookie ('project-state') + '='), teishi.test.match],
                     ]);
                  },
               },
               ['Redirect to project login', 'get', '/f/main.md', 302, function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  var location = new URL (rs.headers.location);
                  if (! assert ([
                     ['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal],
                     ['returnUrl', location.searchParams.get ('returnUrl'), base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/f/main.md', teishi.test.equal],
                     ['state', location.searchParams.get ('state'), /^[a-f0-9]{64}$/, teishi.test.match],
                     ['cookie', getCookie (rs.headers), new RegExp ('^' + cookie ('project-state') + '='), teishi.test.match],
                  ])) return false;
                  s.authProjectPath = location.pathname + location.search;
                  s.projectState = location.searchParams.get ('state');
                  s.hostCookie = s.headers.cookie.split (';') [0];
                  s.headers.cookie = s.hostCookie + '; ' + getCookie (rs.headers).split (';') [0];
                  return true;
               }],
               ['Get project session code with invalid subdomain', 'get', function (s) {
                  var base = new URL (CONFIG.baseURL);
                  return '/auth/project/bad_subdomain?returnUrl=' + encodeURIComponent (base.protocol + '//bad_subdomain.' + base.host + '/') + '&state=foo';
               }, 400, assertBody ({error: 'Invalid subdomain'})],
               ['Get project session code without returnUrl', 'get', function (s) {
                  return '/auth/project/' + s.projectSubdomain + '?state=foo';
               }, 400, assertBody ({error: 'Invalid returnUrl'})],
               dale.go ([
                  ['another site', function (s, base) {return 'https://evil.com/'}],
                  ['the host', function (s, base) {return CONFIG.baseURL + '/'}],
                  ['another subdomain', function (s, base) {return base.protocol + '//other.' + base.host + '/'}],
                  ['another scheme', function (s, base) {return (base.protocol === 'https:' ? 'http:' : 'https:') + '//' + s.projectSubdomain + '.' + base.host + '/'}],
                  ['another port', function (s, base) {return base.protocol + '//' + s.projectSubdomain + '.' + base.hostname + ':' + (parseInt (base.port || 80) + 1) + '/'}],
               ], function (v) {
                  return ['Get project session code with returnUrl on ' + v [0], 'get', function (s) {
                     return '/auth/project/' + s.projectSubdomain + '?returnUrl=' + encodeURIComponent (v [1] (s, new URL (CONFIG.baseURL))) + '&state=foo';
                  }, 400, assertBody ({error: 'Invalid returnUrl'})];
               }),
               ['Get project session code without state', 'get', function (s) {
                  var base = new URL (CONFIG.baseURL);
                  return '/auth/project/' + s.projectSubdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/f/main.md');
               }, 400, assertBody ({error: 'Invalid state'})],
               ['Get project session code with empty state', 'get', function (s) {
                  var base = new URL (CONFIG.baseURL);
                  return '/auth/project/' + s.projectSubdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/f/main.md') + '&state=';
               }, 400, assertBody ({error: 'Invalid state'})],
               ['Get project session code without session redirects to login', 'get', function (s) {
                  var base = new URL (CONFIG.baseURL);
                  return '/auth/project/' + s.projectSubdomain + '?returnUrl=' + encodeURIComponent (base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/f/main.md?foo=bar') + '&state=foo';
               }, 302, function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  var returnUrl = base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/f/main.md?foo=bar';
                  if (! assert (['location', rs.headers.location, CONFIG.baseURL + '/#/login/' + encodeURIComponent ('/auth/project/' + s.projectSubdomain + '?returnUrl=' + encodeURIComponent (returnUrl) + '&state=foo'), teishi.test.equal])) return false;
                  s.loginReturnPath = decodeURIComponent (rs.headers.location.split ('#/login/') [1]);
                  return true;
               }, {cookie: ''}],
               ['Get project session code from login return path', 'get', function (s) {return s.loginReturnPath}, 302, function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  var location = new URL (rs.headers.location);
                  return assert ([
                     ['origin', location.origin, base.protocol + '//' + s.projectSubdomain + '.' + base.host, teishi.test.equal],
                     ['path', location.pathname, '/f/main.md', teishi.test.equal],
                     ['foo', location.searchParams.get ('foo'), 'bar', teishi.test.equal],
                     ['sessionCode', location.searchParams.get ('sessionCode'), /^[a-f0-9]{64}$/, teishi.test.match],
                  ]);
               }],
               ['Get project session code', 'get', function (s) {return s.authProjectPath}, 302, function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  var location = new URL (rs.headers.location);
                  if (! assert ([
                     ['origin', location.origin, base.protocol + '//' + s.projectSubdomain + '.' + base.host, teishi.test.equal],
                     ['path', location.pathname, '/f/main.md', teishi.test.equal],
                     ['sessionCode', location.searchParams.get ('sessionCode'), /^[a-f0-9]{64}$/, teishi.test.match],
                  ])) return false;
                  s.sessionCodePath = location.pathname + location.search;
                  return true;
               }],
               ['Exchange unknown session code', 'get', '/f/main.md?sessionCode=' + 'f'.repeat (64), 403, assertBody ({error: 'Missing session code'})],
               mintSessionCode ('for another subdomain', function (s) {return 'other'}, function (s) {return s.projectState}),
               ['Exchange session code on another subdomain', 'get', function (s) {return s.mintedCodePath}, 403, assertBody ({error: 'Invalid session code'})],
               mintSessionCode ('to exchange without cookies', function (s) {return s.projectSubdomain}, function (s) {return s.projectState}),
               ['Exchange session code without cookies', 'get', function (s) {return s.mintedCodePath}, 403, assertBody ({error: 'Invalid session code'}), {cookie: ''}],
               mintSessionCode ('with another state', function (s) {return s.projectSubdomain}, function (s) {return 'foo'}),
               ['Exchange session code with mismatched state', 'get', function (s) {return s.mintedCodePath}, 403, assertBody ({error: 'Invalid session code'})],
               ['Exchange session code for project session', 'get', function (s) {return s.sessionCodePath}, 302, function (s, rq, rs) {
                  if (! assert ([
                     ['location', rs.headers.location, '/f/main.md', teishi.test.equal],
                     ['referrer-policy', rs.headers ['referrer-policy'], 'no-referrer', teishi.test.equal],
                     ['project cookie', rs.headers ['set-cookie'] [0], new RegExp ('^' + cookie ('project') + '="[a-f0-9]{64}"; Expires=.+; HttpOnly; Path=\\/; SameSite=None; Secure'), teishi.test.match],
                     ['state cookie cleared', rs.headers ['set-cookie'] [1], new RegExp ('^' + cookie ('project-state') + '=("false"|false)'), teishi.test.match],
                  ])) return false;
                  s.headers.cookie = s.hostCookie + '; ' + rs.headers ['set-cookie'] [0].split (';') [0];
                  return true;
               }],
               ['Exchange used session code', 'get', function (s) {return s.sessionCodePath}, 403, assertBody ({error: 'Missing session code'})],
               mintSessionCode ('with query', function (s) {return s.projectSubdomain}, function (s) {return 'foo'}, '/f/main.md?foo=bar'),
               ['Exchange session code keeps other query parameters', 'get', function (s) {return s.mintedCodePath}, 302, function (s, rq, rs) {
                  return assert (['location', rs.headers.location, '/f/main.md?foo=bar', teishi.test.equal]);
               }, {cookie: cookie ('project-state') + '="foo"'}],
               {
                  tag: 'UUID root without readable name serves app',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/',
                  code: 200,
                  apres: function (s, rq, rs) {
                     return assert (['location', rs.headers.location, undefined, teishi.test.equal]);
                  },
               },
               ['Rename project to a readable name', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte'}}, 200],
               {
                  tag: 'Redirect UUID root to readable subdomain',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/',
                  code: 302,
                  apres: function (s, rq, rs) {
                     var base = new URL (CONFIG.baseURL);
                     return assert (['location', rs.headers.location, base.protocol + '//' + s.username + '--el-norte.' + base.host + '/', teishi.test.equal]);
                  },
               },
               {
                  tag: 'Redirect UUID root keeping query',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/?foo=bar',
                  code: 302,
                  apres: function (s, rq, rs) {
                     var base = new URL (CONFIG.baseURL);
                     return assert (['location', rs.headers.location, base.protocol + '//' + s.username + '--el-norte.' + base.host + '/?foo=bar', teishi.test.equal]);
                  },
               },
               ['Redirect UUID file keeping query', 'get', '/f/main.md?foo=bar', 302, function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  return assert (['location', rs.headers.location, base.protocol + '//' + s.username + '--el-norte.' + base.host + '/f/main.md?foo=bar', teishi.test.equal]);
               }],
               ['List files on UUID subdomain', 'get', '/project', 200, function (s, rq, rs) {
                  return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['main.md'], teishi.test.equal]);
               }],
               {
                  tag: 'Anonymous UUID root redirects to login',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/',
                  headers: {cookie: ''},
                  code: 302,
                  apres: function (s, rq, rs) {
                     var location = new URL (rs.headers.location);
                     return assert (['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal]);
                  },
               },
               {
                  tag: 'Anonymous user on private project requires project login',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/auth/user',
                  headers: {cookie: cookie ('project-state') + '="foo"'},
                  code: 403,
                  apres: function (s, rq, rs) {
                     var location = new URL (rs.body.location);
                     return assert ([
                        ['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal],
                        ['optional', location.searchParams.get ('optional'), null, teishi.test.equal],
                     ]);
                  },
               },
               ['Anonymous cannot list files on UUID subdomain', 'get', '/project', 404, function (s, rq, rs) {
                  // The project cookie belongs to the UUID subdomain, so the browser doesn't send it to the readable one.
                  s.projectSubdomain = s.username + '--el-norte';
                  s.headers.cookie = s.hostCookie;
                  return true;
               }, {cookie: ''}],
               ['Readable subdomain without session redirects to login', 'get', '/f/main.md', 302, function (s, rq, rs) {
                  var location = new URL (rs.headers.location);
                  return assert (['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal]);
               }],
               mintSessionCode ('for readable subdomain', function (s) {return s.projectSubdomain}, function (s) {return 'foo'}),
               ['Exchange session code on readable subdomain', 'get', function (s) {return s.mintedCodePath}, 302, function (s, rq, rs) {
                  if (! assert (['project cookie', rs.headers ['set-cookie'] [0], new RegExp ('^' + cookie ('project') + '='), teishi.test.match])) return false;
                  s.headers.cookie = s.hostCookie + '; ' + rs.headers ['set-cookie'] [0].split (';') [0];
                  return true;
               }, {cookie: cookie ('project-state') + '="foo"'}],
               ['Read file on readable subdomain', 'get', '/f/main.md?raw=1', 200, assertBody ('# el norte\n\n')],
               {
                  tag: 'Readable root serves app without redirect',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/',
                  code: 200,
                  apres: function (s, rq, rs) {
                     return assert (['location', rs.headers.location, undefined, teishi.test.equal]);
                  },
               },
               ['List files on readable subdomain', 'get', '/project', 200, function (s, rq, rs) {
                  return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['main.md'], teishi.test.equal]);
               }],
               {
                  tag: 'Get project session csrf',
                  method: 'get',
                  host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/auth/user',
                  code: 200,
                  apres: function (s, rq, rs) {
                     if (! assert ([
                        ['csrf', rs.body.csrf, 'string'],
                        ['no email on subdomain', rs.body.email, undefined, teishi.test.equal],
                     ])) return false;
                     s.projectCsrf = rs.body.csrf;
                     return true;
                  },
               },
               dale.go ([
                  ['without csrf', function (s) {return ''}],
                  ['with invalid csrf', function (s) {return 'invalid'}],
                  ['with host csrf', function (s) {return s.headers ['x-csrf']}],
               ], function (entry) {
                  return {
                     tag: 'Write on subdomain ' + entry [0],
                     method: 'post',
                     host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
                     path: '/project/write',
                     headers: function (s) {return {'x-csrf': entry [1] (s)}},
                     body: {path: 'csrf.md', content: 'forbidden'},
                     code: 403,
                     apres: assertBody ({error: 'Invalid csrf token'}),
                  };
               }),
               ['Rejected csrf writes left no file', 'get', '/f/csrf.md', 404],
            ] : [],
            ['List files', 'post', '/project/run', function (s) {return {command: 'find . -type f -not -path \'./.git/*\''}}, 200, assertBody ({stdout: './main.md\n'})],
            ['Run command without command', 'post', '/project/run', function (s) {return {}}, 400, assertBody ({error: 'command should have as type string but instead is undefined with type undefined'})],
            ['Run command that fails', 'post', '/project/run', function (s) {return {command: 'exit 1'}}, 200, function (s, rq, rs) {
               return assert (['body.code', rs.body.code, 1, teishi.test.equal]);
            }],
            ['Sync access without access.md', 'post', '/project/run', {command: 'vibey access'}, 200, function (s, rq, rs) {
               return assert ([
                  ['code', rs.body.code, 1, teishi.test.equal],
                  ['error', rs.body.error, /No such file or directory/, teishi.test.match],
               ]);
            }],
            waitForCommits ('List commits when there is only the initial commit', 1, "Write 'main.md'"),
            {
               tag: 'Read file from nonexistent project',
               method: 'get',
               host: '00000000-0000-4000-8000-000000000000.' + new URL (CONFIG.baseURL).hostname,
               path: '/f/main.md',
               code: 404,
            },
            ['Read absolute path', 'get', '/f/' + encodeURIComponent ('/main.md'), 400, assertBody ({error: 'Invalid path'})],
            ['Read parent traversal path', 'get', '/f/' + encodeURIComponent ('../main.md'), 400, assertBody ({error: 'Invalid path'})],
            ['Read path with null byte', 'get', '/f/' + encodeURIComponent ('main.md\0'), 400, assertBody ({error: 'Invalid path'})],
            dale.go (['/main.md', '../main.md', 'doc//main.md', 'doc/./main.md'], function (path) {
               return [
                  ['Write to invalid path ' + path, 'post', '/project/write', {path, content: 'x'}, 404],
                  ['Edit invalid path ' + path, 'post', '/project/edit', {path, oldText: 'el', newText: 'EL'}, 404],
                  ['Message to invalid path ' + path, 'post', '/project/message', {file: path, body: 'hi', to: 'all'}, 404],
               ];
            }),
            ['Get file that is not there', 'get', '/f/' + encodeURIComponent ('doc/whatevs.md'), 404],
            ['Get main file', 'get', '/f/' + encodeURIComponent ('main.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert ([
                  ['body', rs.body, '# el norte\n\n', teishi.test.equal],
                  ['content-type', rs.headers ['content-type'], /text\/markdown/, teishi.test.match],
                  ['cache-control', rs.headers ['cache-control'], 'private, no-cache', teishi.test.equal],
                  ['x-content-type-options', rs.headers ['x-content-type-options'], 'nosniff', teishi.test.equal],
                  ['access-control-allow-origin', rs.headers ['access-control-allow-origin'], '*', teishi.test.equal],
                  ['content-security-policy', rs.headers ['content-security-policy'], undefined, teishi.test.equal],
               ]);
            }],
            ['Write HTML file', 'post', '/project/write', {path: 'page.html', content: '<script>document.title = "x"</script>'}, 200],
            ['Get HTML file', 'get', '/f/page.html', 200, function (s, rq, rs) {
               return assert (['content-security-policy', rs.headers ['content-security-policy'], 'sandbox allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts', teishi.test.equal]);
            }],
            ['Edit file without path', 'post', '/project/edit', function (s) {return {oldText: 'a', newText: 'b'}}, 400, assertBody ({error: 'path should have as type string but instead is undefined with type undefined'})],
            ['Edit file without oldText', 'post', '/project/edit', function (s) {return {path: 'main.md', newText: 'b'}}, 400, assertBody ({error: 'oldText should have as type string but instead is undefined with type undefined'})],
            ['Edit file without newText', 'post', '/project/edit', {path: 'main.md', oldText: 'a'}, 400, assertBody ({error: 'newText should have as type string but instead is undefined with type undefined'})],
            ['Edit with an extra key', 'post', '/project/edit', {path: 'main.md', oldText: 'a', newText: 'b', extra: true}, 400, function (s, rq, rs) {
               return assert (['error', rs.body.error, /keys of body/, teishi.test.match]);
            }],
            ['Edit missing file', 'post', '/project/edit', {path: 'missing.md', oldText: 'a', newText: 'b'}, 400, function (s, rq, rs) {
               return assert ([
                  ['code', rs.body.code, 'integer'],
                  ['error', rs.body.error, /missing\.md/, teishi.test.match],
               ]);
            }],
            ['Write below a file', 'post', '/project/write', {path: 'main.md/below.md', content: 'x'}, 400, function (s, rq, rs) {
               return assert ([
                  ['code', rs.body.code, 'integer'],
                  ['error', rs.body.error, /File exists|Not a directory/, teishi.test.match],
               ]);
            }],
            ['Edit main file (old text found multiple times)', 'post', '/project/edit', function (s) {return {path: 'main.md', oldText: 'e', newText: 'E'}}, 400, function (s, rq, rs) {
               return assert (['body.error', rs.body.error, /Old text found .+ times/, teishi.test.match]);
            }],
            ['Edit main file', 'post', '/project/edit', function (s) {return {path: 'main.md', oldText: 'el norte', newText: 'El Norte!'}}, 200, assertBody ({})],
            waitForCommits ('List commits after edit', 3, "Edit 'main.md'"),
            ['Get main file after edit', 'get', '/f/' + encodeURIComponent ('main.md') + '?raw=1', 200, assertBody ('# El Norte!\n\n')],
            ['Edit main file (old text not found)', 'post', '/project/edit', function (s) {return {path: 'main.md', oldText: 'this is not in the file', newText: 'whatever'}}, 400, function (s, rq, rs) {
               return assert (['body.error', rs.body.error, /Old text not found/, teishi.test.match]);
            }],
            ['Edit main file (noop)', 'post', '/project/edit', function (s) {return {path: 'main.md', oldText: 'Norte!', newText: 'Norte!'}}, 200, assertBody ({})],
            waitForCommits ('List commits after noop edit', 3, "Edit 'main.md'"),
            ['Overwrite file', 'post', '/project/write', function (s) {return {path: 'main.md', content: '# el norte\n\n'}}, 200, assertBody ({})],
            waitForCommits ('List commits after write', 4, "Write 'main.md'"),
            ['Overwrite file (noop)', 'post', '/project/write', function (s) {return {path: 'main.md', content: '# el norte\n\n'}}, 200, assertBody ({})],
            waitForCommits ('List commits after noop write', 4, "Write 'main.md'"),
            ['Write empty file', 'post', '/project/write', function (s) {return {path: 'doc/empty.md', content: ''}}, 200, assertBody ({})],
            ['Read back empty file', 'get', '/f/' + encodeURIComponent ('doc/empty.md') + '?raw=1', 200, assertBody ('')],
            ['Reject base64 file write', 'post', '/project/write', function (s) {return {path: 'doc/binary.txt', content: 'aGVsbG8=', base64: true}}, 400],
            ['Write text file with multipart', 'post', '/project/write', function (s) {
               return {multipart: [
                  {name: 'path', value: 'doc/binary.txt'},
                  {name: 'file', filename: 'upload', value: 'hello multipart'},
               ]};
            }, 200, assertBody ({})],
            ['Read back multipart-written file', 'get', '/f/' + encodeURIComponent ('doc/binary.txt'), 200, assertBody ('hello multipart')],
            ['Write binary file with multipart', 'post', '/project/write', function (s) {
               // Hitit requires a file path to send arbitrary binary bytes unchanged.
               s.uploadDir = fs.mkdtempSync (path.join (os.tmpdir (), 'vibey-upload-'));
               var file = path.join (s.uploadDir, 'upload.bin');
               fs.writeFileSync (file, Buffer.from ([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));
               return {multipart: [
                  {name: 'path', value: 'doc/binary.bin'},
                  {name: 'file', path: file, contentType: 'application/octet-stream'},
               ]};
            }, 200, function (s, rq, rs) {
               fs.rmSync (s.uploadDir, {recursive: true, force: true});
               delete s.uploadDir;
               return assertBody ({}) (s, rq, rs);
            }],
            {
               tag: 'Read back binary file',
               method: 'get',
               host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/f/' + encodeURIComponent ('doc/binary.bin'),
               code: 200,
               raw: true,
               apres: function (s, rq, rs) {
                  var expected = Buffer.from ([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]);
                  return assert ([
                     ['content-type', rs.headers ['content-type'], /application\/octet-stream/, teishi.test.match],
                     ['body length', rs.body.length, expected.length, teishi.test.equal],
                     ['body bytes', rs.body.equals (expected), true, teishi.test.equal],
                  ]);
               },
            },
            ['Write file with spaces in name', 'post', '/project/write', function (s) {return {path: 'doc/come back.md', content: 'hello spaces'}}, 200, assertBody ({})],
            ['Read file with spaces in name', 'get', '/f/' + encodeURIComponent ('doc/come back.md') + '?raw=1', 200, assertBody ('hello spaces')],
            ['Run a command with pipe', 'post', '/project/run', function (s) {return {command: 'cat main.md | grep norte'}}, 200, assertBody ({stdout: '# el norte\n'})],
            ['Run a command whose output has no trailing newline', 'post', '/project/run', function (s) {return {command: 'printf foo', read: true}}, 200, assertBody ({stdout: 'foo'})],
            ['Run command with an extra key', 'post', '/project/run', {command: 'true', extra: true}, 400, function (s, rq, rs) {
               return assert (['error', rs.body.error, /keys of body/, teishi.test.match]);
            }],
            ['Read project timestamp', 'get', '/projects', 200, function (s, rq, rs) {
               s.projectLast = dale.stopNot (rs.body, undefined, function (p) {if (p.id === s.projectId) return p.last});
               return assert (['last', s.projectLast, 'string']);
            }],
            ['Read-only command', 'post', '/project/run', {command: 'cat main.md', read: true}, 200],
            ['Read-only command keeps timestamp', 'get', '/projects', 200, function (s, rq, rs) {
               var last = dale.stopNot (rs.body, undefined, function (p) {if (p.id === s.projectId) return p.last});
               return assert (['last', last, s.projectLast, teishi.test.equal]);
            }],
            ['Run a command with change and output', 'post', '/project/run', function (s) {return {command: 'echo foo > doc/another.md && cat doc/another.md'}}, 200, assertBody ({stdout: 'foo\n'})],
            waitForCommits ('List commits after command with change and output', 9, "Run 'echo foo > doc/another.md && cat doc/another.md'"),
            ['Stop project container', 'get', '/', 200, function (s, rq, rs, next) {
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],
            waitForCommits ('List commits after container restart', 9, "Run 'echo foo > doc/another.md && cat doc/another.md'"),

            ['Upload multipart file', 'post', '/project/write', function (s) {
               return {multipart: [
                  {name: 'path', value: 'doc/upload test.txt'},
                  {name: 'file', filename: 'upload', value: 'hello multipart\nこんにちは\0'},
               ]};
            }, 200, assertBody ({})],
            ['Read multipart upload', 'get', '/f/' + encodeURIComponent ('doc/upload test.txt'), 200, assertBody ('hello multipart\nこんにちは\0')],
            ['Upload empty multipart file', 'post', '/project/write', function (s) {
               return {multipart: [
                  {name: 'path', value: 'doc/upload test.txt'},
                  {name: 'file', filename: 'upload', value: ''},
               ]};
            }, 200],
            ['Read empty multipart upload', 'get', '/f/' + encodeURIComponent ('doc/upload test.txt'), 200, assertBody ('')],
            dale.go ([
               ['missing file', []],
               ['wrong file field', [{name: 'other', filename: 'upload', value: 'hello'}]],
               ['duplicate files', [
                  {name: 'file', filename: 'upload1', value: 'hello'},
                  {name: 'file', filename: 'upload2', value: 'hello'},
               ]],
               ['unexpected body field', [
                  {name: 'content', value: 'hello'},
                  {name: 'file', filename: 'upload', value: 'hello'},
               ]],
            ], function (test) {
               return ['Reject multipart ' + test [0], 'post', '/project/write', function (s) {
                  return {multipart: [
                     {name: 'path', value: 'doc/upload test.txt'},
                  ].concat (test [1])};
               }, 400];
            }),

            ['Append at EOF of empty file', 'post', '/project/edit', function (s) {return {path: 'doc/empty.md', oldText: '[EOF]', newText: 'first message\n'}}, 200, assertBody ({})],
            ['Read file after append to empty file', 'get', '/f/' + encodeURIComponent ('doc/empty.md') + '?raw=1', 200, assertBody ('first message\n')],
            ['Append at EOF preserving existing content', 'post', '/project/edit', function (s) {return {path: 'doc/empty.md', oldText: '[EOF]', newText: 'second message\n'}}, 200, assertBody ({})],
            waitForCommits ('List commits after appends', 13, "Edit 'doc/empty.md'"),
            ['Read file after second append', 'get', '/f/' + encodeURIComponent ('doc/empty.md') + '?raw=1', 200, function (s, rq, rs, next) {
               if (! assertBody ('first message\nsecond message\n') (s, rq, rs)) return false;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],

            ['Get main file rendered', 'get', '/f/main.md', 200, function (s, rq, rs) {
               return assert ([
                  ['content-type', rs.headers ['content-type'], /text\/html/, teishi.test.match],
                  ['content-security-policy', rs.headers ['content-security-policy'], /^sandbox /, teishi.test.match],
                  ['title', rs.body, /<title>main\.md<\/title>/, teishi.test.match],
                  ['heading', rs.body, /<h1[^>]*>el norte<\/h1>/, teishi.test.match],
                  ['download link', rs.body, /href="\/f\/main\.md\?raw=1"/, teishi.test.match],
               ]);
            }],
            ['Rendered download link encodes path', 'get', '/f/' + encodeURIComponent ('doc/come back.md'), 200, function (s, rq, rs) {
               return assert (['download link', rs.body, /href="\/f\/doc\/come%20back\.md\?raw=1"/, teishi.test.match]);
            }],
            ['Read file for etag', 'get', '/f/main.md?raw=1', 200, function (s, rq, rs) {
               s.etag = rs.headers.etag;
               return assert (['etag', s.etag, 'string']);
            }],
            {tag: 'Unchanged file is not modified', method: 'get', host: projectHost, path: '/f/main.md?raw=1', headers: function (s) {return {'if-none-match': s.etag}}, code: 304},
            {tag: 'HEAD on project file', method: 'head', host: projectHost, path: '/f/main.md?raw=1', code: 200, apres: function (s, rq, rs) {
               return assert ([
                  ['content-length', rs.headers ['content-length'], '12', teishi.test.equal],
                  ['empty body', rs.body === '' || rs.body === undefined, true, teishi.test.equal],
               ]);
            }},
            ['Write SVG file', 'post', '/project/write', {path: 'icon.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'}, 200],
            ['Get SVG file', 'get', '/f/icon.svg', 200, function (s, rq, rs) {
               return assert ([
                  ['content-type', rs.headers ['content-type'], /image\/svg\+xml/, teishi.test.match],
                  ['content-security-policy', rs.headers ['content-security-policy'], 'sandbox allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts', teishi.test.equal],
               ]);
            }],

            ['Write video', 'post', '/project/write', {path: 'clip.mp4', content: '0123456789'}, 200],
            ['Write empty video', 'post', '/project/write', {path: 'empty.mp4', content: ''}, 200],
            dale.go ([
               ['full video', {}, 200, '0123456789'],
               ['video range', {range: 'bytes=2-5'}, 206, '2345', 'bytes 2-5/10'],
               ['open-ended video range', {range: 'bytes=7-'}, 206, '789', 'bytes 7-9/10'],
               ['suffix video range', {range: 'bytes=-3'}, 206, '789', 'bytes 7-9/10'],
               ['video range past the end', {range: 'bytes=4-100'}, 206, '456789', 'bytes 4-9/10'],
               ['video range with if-range', {range: 'bytes=2-5', 'if-range': 'whatever'}, 200, '0123456789'],
            ], function (test) {
               return {
                  tag: 'Read ' + test [0],
                  method: 'get',
                  host: projectHost,
                  path: '/f/clip.mp4',
                  headers: test [1],
                  code: test [2],
                  raw: true,
                  apres: function (s, rq, rs) {
                     return assert ([
                        ['body', rs.body.toString (), test [3], teishi.test.equal],
                        ['content-type', rs.headers ['content-type'], 'video/mp4', teishi.test.equal],
                        ['accept-ranges', rs.headers ['accept-ranges'], 'bytes', teishi.test.equal],
                        ['content-range', rs.headers ['content-range'], test [4], teishi.test.equal],
                     ]);
                  },
               };
            }),
            dale.go ([
               ['start past the end', 'clip.mp4', 'bytes=10-', 'bytes */10'],
               ['empty suffix', 'clip.mp4', 'bytes=-0', 'bytes */10'],
               ['empty video', 'empty.mp4', 'bytes=0-', 'bytes */0'],
            ], function (test) {
               return {
                  tag: 'Reject video range: ' + test [0],
                  method: 'get',
                  host: projectHost,
                  path: '/f/' + test [1],
                  headers: {range: test [2]},
                  code: 416,
                  apres: function (s, rq, rs) {
                     return assert (['content-range', rs.headers ['content-range'], test [3], teishi.test.equal]);
                  },
               };
            }),
            ['Read empty video', 'get', '/f/empty.mp4', 200, function (s, rq, rs) {
               return assert (['content-length', rs.headers ['content-length'], '0', teishi.test.equal]);
            }],
            ['Read missing video', 'get', '/f/missing.mp4', 404],

            ['Write script', 'post', '/project/write', {path: 'run.sh', content: 'echo one\n'}, 200],
            ['Make script executable', 'post', '/project/run', {command: 'chmod 755 run.sh'}, 200],
            ['Overwrite script', 'post', '/project/write', {path: 'run.sh', content: 'echo two\n'}, 200],
            ['Edit script', 'post', '/project/edit', {path: 'run.sh', oldText: 'two', newText: 'three'}, 200],
            ['Script keeps its mode', 'post', '/project/run', {command: 'stat -c %a run.sh && ./run.sh', read: true}, 200, assertBody ({stdout: '755\nthree\n'})],

            ['Write message without body marker', 'post', '/project/write', {path: 'chat/broken.md', content: '\nəəə head 11111111-1111-1111-1111-111111111111\nfrom x\n'}, 200],
            ['Read message without body marker', 'get', '/project/message/11111111-1111-1111-1111-111111111111/chat/broken.md', 404],

            ['Write app', 'post', '/project/write', {path: 'app.js', content: [
               'require ("http").createServer (function (rq, rs) {',
               '   var body = "";',
               '   rq.on ("data", function (chunk) {body += chunk});',
               '   rq.on ("end", function () {',
               '      rs.writeHead (201, {"content-type": "application/json", "set-cookie": ["a=1", "b=2"], "x-app": "yes"});',
               '      rs.end (JSON.stringify ({body, cookie: rq.headers.cookie, csrf: rq.headers ["x-csrf"], host: rq.headers.host, method: rq.method, proto: rq.headers ["x-forwarded-proto"], url: rq.url}));',
               '   });',
               '}).listen (3000);',
            ].join ('\n')}, 200],
            ['Start app', 'post', '/project/run', {command: 'nohup node app.js < /dev/null > /dev/null 2>&1 & for i in $(seq 50); do curl -s -o /dev/null http://127.0.0.1:3000/ && exit 0; sleep 0.1; done; exit 1', read: true}, 200, function (s, rq, rs) {
               return assert (['code', rs.body.code, undefined, teishi.test.equal]);
            }],
            ['List files with app', 'get', '/project', 200, function (s, rq, rs) {
               return assert ([
                  ['apps', rs.body.apps, [3000], teishi.test.equal],
                  ['project id', rs.body.project.id, s.projectId, teishi.test.equal],
                  ['project name', rs.body.project.name, CONFIG.cloud ? 'el norte' : 'el norte!', teishi.test.equal],
                  ['project owner', rs.body.project.ownerId, 'string'],
                  ['owner access', rs.body.project.access, undefined, teishi.test.equal],
                  ['project subdomain', rs.body.project.subdomain, CONFIG.cloud ? s.projectSubdomain : undefined, teishi.test.equal],
               ]);
            }],
            {
               tag: 'Proxy GET to app',
               method: 'get',
               host: appHost,
               path: '/hello?x=1',
               headers: function (s) {return {cookie: projectCookie (s) + 'foo=bar', 'x-csrf': 'secret'}},
               code: 201,
               apres: function (s, rq, rs) {
                  var body = type (rs.body) === 'string' ? JSON.parse (rs.body) : rs.body;
                  return assert ([
                     ['x-app', rs.headers ['x-app'], 'yes', teishi.test.equal],
                     ['set-cookie', rs.headers ['set-cookie'], ['a=1', 'b=2'], teishi.test.equal],
                     ['method', body.method, 'GET', teishi.test.equal],
                     ['url', body.url, '/hello?x=1', teishi.test.equal],
                     ['vibey cookies stripped', body.cookie, 'foo=bar', teishi.test.equal],
                     ['csrf stripped', body.csrf, undefined, teishi.test.equal],
                     ['host', body.host, /^3000--/, teishi.test.match],
                     ['proto', body.proto, new URL (CONFIG.baseURL).protocol.slice (0, -1), teishi.test.equal],
                  ]);
               },
            },
            {
               tag: 'Proxy POST body to app',
               method: 'post',
               host: appHost,
               path: '/submit',
               body: 'hello',
               code: 201,
               apres: function (s, rq, rs) {
                  var body = type (rs.body) === 'string' ? JSON.parse (rs.body) : rs.body;
                  return assert ([
                     ['method', body.method, 'POST', teishi.test.equal],
                     ['body', body.body, 'hello', teishi.test.equal],
                  ]);
               },
            },
            CONFIG.cloud ? [
               {tag: 'Anonymous POST to private app', method: 'post', host: appHost, path: '/submit', headers: {cookie: ''}, body: 'hello', code: 404},
               {
                  tag: 'Anonymous GET to private app redirects to login',
                  method: 'get',
                  host: appHost,
                  path: '/hello',
                  headers: {cookie: ''},
                  code: 302,
                  apres: function (s, rq, rs) {
                     var location = new URL (rs.headers.location);
                     return assert (['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/3000--' + s.projectSubdomain, teishi.test.equal]);
                  },
               },
               {
                  tag: 'Redirect UUID app subdomain to readable',
                  method: 'get',
                  host: function (s) {return '3000--' + s.projectId + '.' + new URL (CONFIG.baseURL).hostname},
                  path: '/hello?x=1',
                  code: 302,
                  apres: function (s, rq, rs) {
                     var base = new URL (CONFIG.baseURL);
                     return assert (['location', rs.headers.location, base.protocol + '//3000--' + s.projectSubdomain + '.' + base.host + '/hello?x=1', teishi.test.equal]);
                  },
               },
            ] : [],
            ['Stop app', 'get', '/', 200, function (s, rq, rs, next) {
               run ('docker', 'stop', 'vibey-project-' + s.projectId).then (function () {next (null, rs)}, next);
            }],

            ['Post message to new chat in missing folder', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', body: 'Hello everyone!', to: 'all'}}, 200, function (s, rq, rs) {
               s.messageId = rs.body.id;
               return assert (['message id', rs.body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, teishi.test.match]);
            }],
            ['Read new chat message', 'get', '/f/' + encodeURIComponent ('chat/nested/test.md') + '?raw=1', 200, function (s, rq, rs) {
               s.chatContent = rs.body;
               return assert ([
                  ['head marker', rs.body.indexOf ('\nəəə head ' + s.messageId + '\n'), 0, teishi.test.equal],
                  ['id header', rs.body.indexOf ('\nid ' + s.messageId + '\n') !== -1, true, teishi.test.equal],
                  ['from header', rs.body, /\nfrom [^\s]+\n/, teishi.test.match],
                  ['timestamp header', rs.body, /\nt [^\s]+\n/, teishi.test.match],
                  ['recipient and body', rs.body.endsWith ('\nto all\nəəə body ' + s.messageId + '\nHello everyone!'), true, teishi.test.equal],
                  ['no base64 header', /\nbase64 /.test (rs.body), false, teishi.test.equal],
               ]);
            }],
            ['Read message by id', 'get', function (s) {return '/project/message/' + s.messageId + '/chat/nested/test.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['message', rs.body.message, s.chatContent.slice (1), teishi.test.equal],
                  ['next', rs.body.next, [], teishi.test.equal],
               ]);
            }],
            ['Read message with invalid id', 'get', '/project/message/invalid/chat/nested/test.md', 404],
            ['Read message without file', 'get', function (s) {return '/project/message/' + s.messageId}, 404],
            ['Read missing message', 'get', '/project/message/00000000-0000-0000-0000-000000000000/chat/nested/test.md', 404],
            ['Read message from missing file', 'get', function (s) {return '/project/message/' + s.messageId + '/chat/missing.md'}, 404],
            ['Reject name without base64', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', body: 'hi', name: 'a.png', to: 'all'}}, 400],
            ['Reject name with a slash', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', base64: true, body: 'aGk=', name: 'a/b.png', to: 'all'}}, 400],
            ['Reject invalid base64 body', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', base64: true, body: 'not base64!', to: 'all'}}, 400],
            ['Reject base64 message to shell', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', base64: true, body: 'aGk=', to: 'shell'}}, 400],
            dale.go ([
               ['head marker at start', 'əəə head 00000000-0000-0000-0000-000000000000\nhi'],
               ['body marker after a newline', 'hi\nəəə body 00000000-0000-0000-0000-000000000000'],
            ], function (test) {
               return ['Reject message with ' + test [0], 'post', '/project/message', {file: 'chat/nested/test.md', body: test [1], to: 'all'}, 400, function (s, rq, rs) {
                  return assert (['error', rs.body.error, /body without marker lines/, teishi.test.match]);
               }];
            }),
            dale.go ([
               ['unknown recipient', {body: 'hi', to: 'nobody'}, /to must be all, shell, /],
               ['missing recipient', {body: 'hi'}, /to should have as type string/],
               ['name with a newline', {base64: true, body: 'aGk=', name: 'a\nb.png', to: 'all'}, /name must be a file name without slashes or newlines/],
               ['extra key', {body: 'hi', extra: true, to: 'all'}, /keys of body/],
            ], function (test) {
               return ['Reject message with ' + test [0], 'post', '/project/message', {file: 'chat/nested/test.md', ... test [1]}, 400, function (s, rq, rs) {
                  return assert (['error', rs.body.error, test [2], teishi.test.match]);
               }];
            }),
            ['Post base64 reply to existing message', 'post', '/project/message', function (s) {return {file: 'chat/nested/test.md', base64: true, body: Buffer.from ('Hello back!').toString ('base64'), name: 'hello.txt', to: s.messageId}}, 200, function (s, rq, rs) {
               s.replyId = rs.body.id;
               return assert ([
                  ['reply id', rs.body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, teishi.test.match],
                  ['distinct id', rs.body.id === s.messageId, false, teishi.test.equal],
               ]);
            }],
            ['Read chat with appended reply', 'get', '/f/' + encodeURIComponent ('chat/nested/test.md') + '?raw=1', 200, function (s, rq, rs, next) {
               var appended = rs.body.slice (s.chatContent.length);
               if (! assert ([
                  ['original message preserved', rs.body.slice (0, s.chatContent.length), s.chatContent, teishi.test.equal],
                  ['reply head', appended.indexOf ('\nəəə head ' + s.replyId + '\n'), 0, teishi.test.equal],
                  ['base64 header', appended, /\nbase64 1\n/, teishi.test.match],
                  ['name header', appended, /\nname hello\.txt\n/, teishi.test.match],
                  ['reply id header', appended.indexOf ('\nid ' + s.replyId + '\n') !== -1, true, teishi.test.equal],
                  ['reply recipient and body', appended.endsWith ('\nto ' + s.messageId + '\nəəə body ' + s.replyId + '\n' + Buffer.from ('Hello back!').toString ('base64')), true, teishi.test.equal],
                  ['no blank header lines', /\n\n/.test (appended), false, teishi.test.equal],
               ])) return false;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],

            ['Read first message without appended reply', 'get', function (s) {return '/project/message/' + s.messageId + '/chat/nested/test.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['message', rs.body.message, s.chatContent.slice (1), teishi.test.equal],
                  ['next', rs.body.next, [s.replyId], teishi.test.equal],
               ]);
            }],
            ['Reject uppercase message id', 'get', function (s) {return '/project/message/' + s.replyId.toUpperCase () + '/chat/nested/test.md'}, 404],
            ['Read reply by id', 'get', function (s) {return '/project/message/' + s.replyId + '/chat/nested/test.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['reply head', rs.body.message.indexOf ('əəə head ' + s.replyId + '\n'), 0, teishi.test.equal],
                  ['reply body', rs.body.message.endsWith ('əəə body ' + s.replyId + '\n' + Buffer.from ('Hello back!').toString ('base64')), true, teishi.test.equal],
                  ['next', rs.body.next, [], teishi.test.equal],
               ]);
            }],
            ['Send command to shell', 'post', '/project/message', {file: 'chat/shell.md', body: 'echo out; echo err >&2', to: 'shell'}, 200, function (s, rq, rs) {
               s.shellResponseId = rs.body.responseId;
               return assert (['response id', s.shellResponseId, 'string']);
            }],
            waitFor ('Wait for shell response', function (s) {
               return projectFetch (s, '/project/message/' + s.shellResponseId + '/chat/shell.md').then (function (body) {
                  return body && /^t-end /m.test (body.message);
               });
            }),
            ['Read shell response', 'get', function (s) {return '/project/message/' + s.shellResponseId + '/chat/shell.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['from shell', rs.body.message, /^from shell$/m, teishi.test.match],
                  ['not pending', /^pending /m.test (rs.body.message), false, teishi.test.equal],
                  ['stdout', rs.body.message, /^out$/m, teishi.test.match],
                  ['stderr', rs.body.message, /^err$/m, teishi.test.match],
               ]);
            }],
            ['Send long command to shell', 'post', '/project/message', {file: 'chat/shell.md', body: 'sleep 30; echo late', to: 'shell'}, 200, function (s, rq, rs) {
               s.shellResponseId = rs.body.responseId;
               return true;
            }],
            waitFor ('Wait for shell process', function (s) {
               return projectFetch (s, '/project/run', {command: 'test -e /tmp/vibey-process-' + s.shellResponseId, read: true}).then (function (body) {
                  return body && body.code === undefined;
               });
            }),
            ['Cancel shell command', 'post', '/project/edit', function (s) {
               return {path: 'chat/shell.md', oldText: 'əəə head ' + s.shellResponseId + '\n', newText: 'əəə head ' + s.shellResponseId + '\ncancelled ' + new Date ().toISOString () + '\n'};
            }, 200],
            waitFor ('Wait for shell process to be killed', function (s) {
               return projectFetch (s, '/project/run', {command: 'test -e /tmp/vibey-process-' + s.shellResponseId, read: true}).then (function (body) {
                  return body && body.code === 1;
               });
            }),
            ['Cancelled command did not finish', 'get', function (s) {return '/project/message/' + s.shellResponseId + '/chat/shell.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['cancelled', rs.body.message, /^cancelled /m, teishi.test.match],
                  ['no t-end', /^t-end /m.test (rs.body.message), false, teishi.test.equal],
                  ['no late output', /^late$/m.test (rs.body.message), false, teishi.test.equal],
               ]);
            }],

            ['Send message to AI', 'post', '/project/message', {file: 'chat/ai.md', body: 'Hello AI', to: 'ai-opus-5.5'}, 200, function (s, rq, rs) {
               s.aiResponseId = rs.body.responseId;
               return assert (['response id', s.aiResponseId, 'string']);
            }],
            waitFor ('Wait for AI response', function (s) {
               return projectFetch (s, '/project/message/' + s.aiResponseId + '/chat/ai.md').then (function (body) {
                  return body && /^t-end /m.test (body.message);
               });
            }),
            ['Read AI response', 'get', function (s) {return '/project/message/' + s.aiResponseId + '/chat/ai.md'}, 200, function (s, rq, rs) {
               var words = Array.from ({length: 1000}, function (v, k) {return 'word' + k}).join (' ');
               return assert ([
                  ['from ai', rs.body.message, /^from ai-opus-5\.5$/m, teishi.test.match],
                  ['credential', rs.body.message, /^credential test$/m, teishi.test.match],
                  ['not pending', /^pending /m.test (rs.body.message), false, teishi.test.equal],
                  ['body', rs.body.message.endsWith ('əəə body ' + s.aiResponseId + '\n' + words), true, teishi.test.equal],
               ]);
            }],
            ['Read AI chat has system prompt', 'get', '/f/' + encodeURIComponent ('chat/ai.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert (['system prompt', rs.body, /^from systemPrompt$/m, teishi.test.match]);
            }],
            ['Send message to AI to cancel', 'post', '/project/message', {file: 'chat/ai.md', body: 'Hello again', to: 'ai-opus-5.5'}, 200, function (s, rq, rs) {
               s.aiResponseId = rs.body.responseId;
               return true;
            }],
            waitFor ('Wait for AI to start streaming', function (s) {
               return projectFetch (s, '/project/message/' + s.aiResponseId + '/chat/ai.md').then (function (body) {
                  return body && /word0/.test (body.message);
               });
            }),
            ['Cancel AI response', 'post', '/project/edit', function (s) {
               return {path: 'chat/ai.md', oldText: 'əəə head ' + s.aiResponseId + '\n', newText: 'əəə head ' + s.aiResponseId + '\ncancelled ' + new Date ().toISOString () + '\n'};
            }, 200],
            waitFor ('Wait for AI to stop', function (s) {
               return projectFetch (s, '/project/message/' + s.aiResponseId + '/chat/ai.md').then (function (body) {
                  if (! body) return false;
                  if (body.message !== s.aiLast) {
                     s.aiLast = body.message;
                     s.aiChanged = Date.now ();
                     return false;
                  }
                  return Date.now () - s.aiChanged > 500;
               });
            }),
            ['Cancelled AI response did not finish', 'get', function (s) {return '/project/message/' + s.aiResponseId + '/chat/ai.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['cancelled', rs.body.message, /^cancelled /m, teishi.test.match],
                  ['no t-end', /^t-end /m.test (rs.body.message), false, teishi.test.equal],
                  ['no last word', /word999$/.test (rs.body.message), false, teishi.test.equal],
               ]);
            }],

            ['Reject reply without from', 'post', '/project/message', {file: 'chat/agents.md', body: 'hi', reply: 'chat/agents.md', to: 'all'}, 400],
            ['Reject from with newline', 'post', '/project/message', {file: 'chat/agents.md', body: 'hi', from: 'ai-gpt-6\nto all', to: 'all'}, 400],
            ['Reject reply with newline', 'post', '/project/message', {file: 'chat/agents.md', body: 'hi', from: 'ai-gpt-6', reply: 'a\nb', to: 'all'}, 400],
            ['Post message with from', 'post', '/project/message', {file: 'chat/from.md', body: 'hi', from: 'ai-gpt-6', to: 'all'}, 200],
            ['Message with from keeps it', 'get', '/f/' + encodeURIComponent ('chat/from.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert (['from', rs.body, /^from ai-gpt-6$/m, teishi.test.match]);
            }],

            ['Start two agents in the same chat', 'post', '/project/message', {file: 'chat/agents.md', to: 'ai-opus-5.5', body: agentScript ([
               {description: 'Start A', path: 'chat/agents.md', body: 'fake-output:\nresult A'},
               {description: 'Start B', path: 'chat/agents.md', body: 'fake-output:\nresult B'},
            ])}, 200],
            waitFor ('Wait for agents and wake to finish', agentsDone ('chat/agents.md', function (text) {
               return /^All agents finished\.$/m.test (text) && count (text, /^from ai-opus-5\.5$/gm) === 6;
            })),
            ['Agents ran and woke the caller once', 'get', '/f/' + encodeURIComponent ('chat/agents.md') + '?raw=1', 200, function (s, rq, rs) {
               var shellId = (rs.body.match (/^əəə head (\S+)\nfrom shell$/m) || []) [1];
               return assert ([
                  ['tool call and wake note from shell', count (rs.body, /^from shell$/gm), 2, teishi.test.equal],
                  ['two started calls', count (rs.body, /^\{"id":"[0-9a-f-]{36}","responseId":"[0-9a-f-]{36}"\}$/gm), 2, teishi.test.equal],
                  ['exit code', rs.body, /^Exit code: 0$/m, teishi.test.match],
                  ['two requests', count (rs.body, /^reply chat\/agents\.md$/gm), 2, teishi.test.equal],
                  ['result A', rs.body, /^əəə body [0-9a-f-]{36}\nresult A$/m, teishi.test.match],
                  ['result B', rs.body, /^əəə body [0-9a-f-]{36}\nresult B$/m, teishi.test.match],
                  ['one wake', count (rs.body, /^All agents finished\.$/gm), 1, teishi.test.equal],
                  ['wake note from shell', rs.body, /^from shell\nid [0-9a-f-]{36}\nt \S+\nto ai-opus-5\.5\nəəə body [0-9a-f-]{36}\nAll agents finished\.$/m, teishi.test.match],
                  ['caller turn ended at the agent call', new RegExp ('^to ' + shellId + '$', 'm').test (rs.body), false, teishi.test.equal],
               ]);
            }],

            ['Start an agent in another chat', 'post', '/project/message', {file: 'chat/agents-caller.md', to: 'ai-opus-5.5', body: agentScript ([
               {description: 'Start C', path: 'chat/agents-other.md', body: 'fake-output:\nresult C'},
            ])}, 200],
            waitFor ('Wait for cross-chat agent and wake to finish', agentsDone ('chat/agents-caller.md', function (text) {
               return /^əəə body [0-9a-f-]{36}\nresult C$/m.test (text) && /word999/.test (text);
            })),
            ['Other chat has the request', 'get', '/f/' + encodeURIComponent ('chat/agents-other.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert ([
                  ['request from caller', rs.body, /^from ai-opus-5\.5$/m, teishi.test.match],
                  ['reply line', rs.body, /^reply chat\/agents-caller\.md$/m, teishi.test.match],
                  ['result', rs.body, /^əəə body [0-9a-f-]{36}\nresult C$/m, teishi.test.match],
               ]);
            }],
            ['Caller chat got the result, not a wake note', 'get', '/f/' + encodeURIComponent ('chat/agents-caller.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert ([
                  ['result posted to caller', rs.body, /^from ai-opus-5\.5\nid [0-9a-f-]{36}\nt \S+\nto ai-opus-5\.5\nəəə body [0-9a-f-]{36}\nresult C$/m, teishi.test.match],
                  ['no wake note', /^All agents finished\.$/m.test (rs.body), false, teishi.test.equal],
               ]);
            }],

            ['Agent call to all keeps the turn going', 'post', '/project/message', {file: 'chat/agents-all.md', to: 'ai-opus-5.5', body: agentScript ([
               {description: 'Note for everyone', path: 'chat/agents-all.md', to: 'all', body: 'note'},
            ])}, 200],
            waitFor ('Wait for caller to continue', agentsDone ('chat/agents-all.md', function (text) {
               return /word999/.test (text);
            })),
            ['Caller continued after the tool call', 'get', '/f/' + encodeURIComponent ('chat/agents-all.md') + '?raw=1', 200, function (s, rq, rs) {
               var shellId = (rs.body.match (/^əəə head (\S+)\nfrom shell$/m) || []) [1];
               return assert ([
                  ['note posted', rs.body, /^to all\nəəə body [0-9a-f-]{36}\nnote$/m, teishi.test.match],
                  ['continuation replies to shell', rs.body, new RegExp ('^to ' + shellId + '$', 'm'), teishi.test.match],
               ]);
            }],

            ['Agent call to another project fails', 'post', '/project/message', {file: 'chat/agents-bad.md', to: 'ai-opus-5.5', body: 'fake-output:\ntool-call: agent 00000000-0000-4000-8000-000000000000\nStart\npath: chat/x.md\nhi'}, 200],
            waitFor ('Wait for failed agent call', agentsDone ('chat/agents-bad.md', function (text) {
               return /word999/.test (text);
            })),
            ['Failed agent call reports the error', 'get', '/f/' + encodeURIComponent ('chat/agents-bad.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert ([
                  ['error', rs.body, /^agent only works on the current project$/m, teishi.test.match],
                  ['exit code', rs.body, /^Exit code: 1$/m, teishi.test.match],
               ]);
            }],

            ['Run a command after container has been turned off', 'post', '/project/run', function (s) {return {command: 'ls doc'}}, 200, function (s, rq, rs, next) {
               if (! assert (['stdout', rs.body.stdout, 'another.md\nbinary.bin\nbinary.txt\ncome back.md\nempty.md\nupload test.txt\n', teishi.test.equal])) return false;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],
            ['Read file after container has been turned off', 'get', '/f/' + encodeURIComponent ('main.md') + '?raw=1', 200, assertBody ('# el norte\n\n')],
            ['Stop and remove container for next test', 'post', '/project/run', function (s) {return {command: 'true'}}, 200, function (s, rq, rs, next) {
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  await run ('docker', 'rm', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],
            ['Run a command after container has been removed', 'post', '/project/run', function (s) {return {command: 'ls doc'}}, 200, function (s, rq, rs, next) {
               if (! assert (['stdout', rs.body.stdout, 'another.md\nbinary.bin\nbinary.txt\ncome back.md\nempty.md\nupload test.txt\n', teishi.test.equal])) return false;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  await run ('docker', 'rm', 'vibey-project-' + s.projectId);
                  next (null, rs);
               }) ();
            }],
            ['Read file after container has been removed', 'get', '/f/' + encodeURIComponent ('main.md') + '?raw=1', 200, assertBody ('# el norte\n\n')],
            ['Create a third project', 'post', '/project', {name: 'third'}, 200, function (s, rq, rs, next) {
               s.thirdProjectId = rs.body.id;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.thirdProjectId);
                  next (null, rs);
               }) ();
            }],
            ['Delete project with a stopped container', 'delete', function (s) {return '/project/' + s.thirdProjectId}, 200],
            ['Create a fourth project', 'post', '/project', {name: 'fourth'}, 200, function (s, rq, rs, next) {
               s.fourthProjectId = rs.body.id;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.fourthProjectId);
                  await run ('docker', 'rm', 'vibey-project-' + s.fourthProjectId);
                  next (null, rs);
               }) ();
            }],
            ['Delete project with a removed container', 'delete', function (s) {return '/project/' + s.fourthProjectId}, 200],
            CONFIG.cloud ? [
               ['Login as non-creator', 'post', '/auth/login', {email: 'user2@example.com'}, 200, function (s, rq, rs) {
                  s.user1Headers = {cookie: s.headers.cookie, 'x-csrf': s.headers ['x-csrf']};
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify non-creator login', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Create project as non-creator', 'post', '/project', {name: 'should fail'}, 403, assertBody ({error: 'Please request creator access'})],
               ['Update another user\'s project', 'put', '/project', function (s) {return {id: s.projectId, name: 'hacked'}}, 404],
               projectLogin ('another user\'s project', 'projectId'),
               ['Read file from another user\'s project', 'get', '/f/' + encodeURIComponent ('main.md'), 404],
               ['Read message from another user\'s project', 'get', function (s) {return '/project/message/' + s.messageId + '/chat/nested/test.md'}, 404],
               ['Write file to another user\'s project', 'post', '/project/write', function (s) {return {path: 'doc/hack.md', content: 'hacked'}}, 404],
               ['Edit file in another user\'s project', 'post', '/project/edit', function (s) {return {path: 'main.md', oldText: 'el', newText: 'EL'}}, 404],
               ['Run command on another user\'s project', 'post', '/project/run', function (s) {return {command: 'ls'}}, 404],
               ['Delete another user\'s project', 'delete', function (s) {return '/project/' + s.projectId}, 404],
               ['Delete non-creator account', 'post', '/auth/delete', {}, 200, function (s, rq, rs) {
                  s.headers.cookie = s.user1Headers.cookie;
                  s.headers ['x-csrf'] = s.user1Headers ['x-csrf'];
                  return true;
               }],
            ] : [],
            CONFIG.cloud ? [
               projectLogin ('owner before host session expiry', 'projectId'),
               ['Expire host session', 'get', '/', 200, function (s, rq, rs, next) {
                  s.expiredProjectSession = sessionId (s, 'project');
                  redis ('hset', 'session-h:' + sessionId (s, 'host'), 'expires', new Date (Date.now () - 1000).toISOString ()).then (function () {next (null, rs)}, next);
               }, {cookie: ''}],
               ['Expired host session rejects project session', 'post', '/project/run', {command: 'true'}, 403, function (s, rq, rs, next) {
                  if (! assert ([
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                     ['cookie', getCookie (rs.headers), new RegExp ('^' + cookie ('project') + '=("false"|false)'), teishi.test.match],
                  ])) return false;
                  redis ('exists', 'session-p:' + s.expiredProjectSession).then (function (exists) {
                     if (! assert (['project session deleted', exists, 0, teishi.test.equal])) return next (new Error (validationError));
                     next (null, rs);
                  }, next);
               }],
               hostLogin ('after host session expiry', 'hello@example.com'),
               projectLogin ('owner before logout', 'projectId'),
               ['Logout deletes project sessions', 'post', '/auth/logout', {}, 200, function (s, rq, rs, next) {
                  redis ('exists', 'session-p:' + sessionId (s, 'project')).then (function (exists) {
                     if (! assert (['project session deleted', exists, 0, teishi.test.equal])) return next (new Error (validationError));
                     next (null, rs);
                  }, next);
               }],
               ['Project session after logout', 'post', '/project/run', {command: 'true'}, 403, assertBody ({error: 'Invalid session'})],
               hostLogin ('to delete account', 'hello@example.com'),
               ['Delete account', 'post', '/auth/delete', {}, 200],
            ] : [],
         ];

         // *** ACCESS ***

         var accessLogin = function (who) {
            return [
               ['Login as access ' + who, 'post', '/auth/login', {email: 'access-' + who + '@example.com'}, 200, function (s, rq, rs) {
                  s.accessLoginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify access ' + who, 'get', function (s) {return '/auth/verify/' + s.accessLoginLink}, 200, function (s, rq, rs) {
                  s.accessUsers = s.accessUsers || {};
                  s.accessUsers [who] = {
                     cookie: getCookie (rs.headers),
                     'x-csrf': rs.body.csrf,
                  };
                  Object.assign (s.headers, s.accessUsers [who]);
                  return true;
               }],
            ];
         }

         var accessAs = function (who) {
            return ['Switch to access ' + who, 'get', '/', 200, function (s) {
               Object.assign (s.headers, s.accessUsers [who]);
               delete s.projectCsrf;
               return true;
            }];
         }

         var accessFile = function (path) {
            return '/f/' + encodeURIComponent (path);
         }

         var accessWrite = function (path, content, code) {
            return ['Write ' + path + ' expecting ' + code, 'post', '/project/write', function (s) {
               return {path, content};
            }, code];
         }

         var accessSync = ['Sync access', 'post', '/project/run', function (s) {
            return {command: 'vibey access'};
         }, 200, function (s, rq, rs) {
            return assert ([
               ['sync error', rs.body.error, undefined, teishi.test.equal],
               ['sync output', rs.body.stdout, /^Access synced for:/, teishi.test.match],
            ]);
         }];

         // Shell messages reply before the command runs; poll the response message until its header has `t-end`.
         var accessWait = ['Wait for shell command', 'get', '/', 200, function (s, rq, rs, next) {
            var started = Date.now ();
            var check = async function () {
               var response = await fetch ('http://' + s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname + ':' + CONFIG.port + '/project/message/' + s.accessResponseId + '/chat/thread.md', {
                  headers: s.headers,
               });
               var body = response.ok ? await response.json () : {};
               if (/^t-end /m.test (body.message || '')) return next (null, rs);
               if (Date.now () - started > 10000) return next ({code: 0, error: 'Shell response ' + s.accessResponseId + ' did not finish', request: rq});
               setTimeout (check, 1);
            }
            check ();
         }];

         // Sends `vibey project <id> <command>` to the shell from the shared project's chat; `target` is 'target' or 'origin'.
         var accessShell = function (tag, target, command, code) {
            return ['Cross-project shell ' + tag + ' expecting ' + code, 'post', '/project/message', function (s) {
               var id = target === 'target' ? s.accessTargetId : s.accessProjectId;
               return {file: 'chat/thread.md', to: 'shell', body: 'vibey project ' + id + ' ' + command};
            }, code, function (s, rq, rs) {
               if (code === 200) s.accessResponseId = rs.body.responseId;
               return true;
            }];
         }

         // Grants the shared project `verb` on the target, next to a user grant so the sync must skip the project line.
         var targetAccess = function (verb) {
            return [
               useSession ('A on target project'),
               ['Grant origin ' + verb + ' on target', 'post', '/project/write', function (s) {
                  return {path: 'vibey/access.md', content: 'access-b@example.com read\nproject:' + s.accessProjectId + ' ' + verb + '\n'};
               }, 200],
               useSession ('A on shared project'),
            ];
         }

         suites.access = CONFIG.cloud ? [
            ['Grant A creator status', 'post', '/creator/grant', {email: 'access-a@example.com', grant: true}, 200, adminHeaders],
            accessLogin ('a'),
            accessLogin ('b'),
            accessAs ('a'),
            // Readable subdomains are <username>--<project name>, with each space as `-` and each dash as `--`.
            ['A reads own username', 'get', '/auth/user', 200, function (s, rq, rs) {
               return assert (['username', rs.body.username, 'access-a', teishi.test.equal]);
            }],
            ['A creates shared project', 'post', '/project', {name: 'access test'}, 200, function (s, rq, rs) {
               s.accessProjectId = rs.body.id;
               s.accessProject = 'access-a--access-test';
               return assert (['project id', s.accessProjectId, 'string']);
            }],
            projectLogin ('A on shared project', 'accessProject'),
            accessWrite ('outside.txt', 'original', 200),
            accessWrite ('chat/inside.txt', 'original', 200),
            accessWrite ('chatty/outside.txt', 'original', 200),
            ['A creates message', 'post', '/project/message', function (s) {
               return {file: 'chat/thread.md', to: 'all', body: 'Shared message'};
            }, 200, function (s, rq, rs) {
               s.accessMessageId = rs.body.id;
               return assert (['message id', s.accessMessageId, 'string']);
            }],
            // The project grant must be skipped by the sync rather than abort it.
            accessWrite ('vibey/access.md', 'access-b@example.com read\nproject:00000000-0000-0000-0000-000000000000 write\naccess-c@example.com write\n', 200),
            accessSync,

            ['A reads file on readable subdomain', 'get', accessFile ('outside.txt'), 200, assertBody ('original')],
            ['A reads .git as owner', 'get', accessFile ('.git/HEAD'), 200, assertBody ('ref: refs/heads/main\n')],
            ['A reads nested file on readable subdomain', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('original')],
            ['Missing file on readable subdomain', 'get', accessFile ('missing.txt'), 404],
            dale.go ([
               ['Unknown username', 'no-such-user--access-test'],
               ['Unknown project name', 'access-a--no-such-project'],
            ], function (entry) {
               return {
                  tag: entry [0],
                  method: 'get',
                  host: entry [1] + '.' + new URL (CONFIG.baseURL).hostname,
                  path: '/project',
                  code: 404,
               };
            }),
            ['A creates project with a dash', 'post', '/project', {name: 'x-y z'}, 200, function (s, rq, rs) {
               s.accessDashId = rs.body.id;
               s.accessDashProject = 'access-a--x--y-z';
               return assert (['project id', s.accessDashId, 'string']);
            }],
            projectLogin ('A on dash project', 'accessDashProject'),
            ['Double dash decodes to a dash', 'get', '/project', 200],
            {
               tag: 'Single dash decodes to a space',
               method: 'get',
               host: 'access-a--x-y-z.' + new URL (CONFIG.baseURL).hostname,
               path: '/project',
               code: 404,
            },
            ['A deletes project with a dash', 'delete', function (s) {return '/project/' + s.accessDashId}, 200],
            ['Deleted project no longer resolves', 'get', '/project', 404],
            useSession ('A on shared project'),

            // B already existed when the grants were synced.
            accessAs ('b'),
            ['B sees shared project', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['project ids', dale.go (rs.body, function (p) {return p.id}), [s.accessProjectId], teishi.test.equal],
                  ['read-only', rs.body [0].read, true, teishi.test.equal],
               ]);
            }],
            projectLogin ('B on shared project', 'accessProject'),
            ['B lists files', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['outside file visible', inc (dale.go (rs.body.files, function (f) {return f.name}), 'outside.txt'), true, teishi.test.equal]);
            }],
            ['B reads file', 'get', accessFile ('outside.txt'), 200, assertBody ('original')],
            ['B lists access.md with own whole-project grant', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['access.md visible', inc (dale.go (rs.body.files, function (f) {return f.name}), 'vibey/access.md'), true, teishi.test.equal]);
            }],
            ['B reads access.md with own whole-project grant', 'get', accessFile ('vibey/access.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert (['access.md', rs.body, /^access-b@example\.com read\n/, teishi.test.match]);
            }],
            ['B cannot read .git as reader', 'get', accessFile ('.git/HEAD'), 404],
            {
               tag: 'Project name under a user who does not own it',
               method: 'get',
               host: 'access-b--access-test.' + new URL (CONFIG.baseURL).hostname,
               path: '/project',
               code: 404,
            },
            ['B reads message', 'get', function (s) {return '/project/message/' + s.accessMessageId + '/chat/thread.md'}, 200, function (s, rq, rs) {
               return assert ([
                  ['message', rs.body.message, 'string'],
                  function () {return ['message body', rs.body.message.endsWith ('Shared message'), true, teishi.test.equal]},
                  ['next messages', rs.body.next, [], teishi.test.equal],
               ]);
            }],
            accessWrite ('outside.txt', 'forbidden', 404),
            ['B cannot upload', 'post', '/project/write', function (s) {
               return {multipart: [
                  {name: 'path', value: 'outside.txt'},
                  {name: 'file', filename: 'upload', value: 'forbidden'},
               ]};
            }, 404],
            ['B cannot edit', 'post', '/project/edit', function (s) {
               return {path: 'outside.txt', oldText: 'original', newText: 'forbidden'};
            }, 404],
            ['B cannot send messages', 'post', '/project/message', function (s) {
               return {file: 'chat/thread.md', to: 'all', body: 'Forbidden'};
            }, 404],
            dale.go ([false, true], function (read) {
               return ['B cannot run commands with read=' + read, 'post', '/project/run', function (s) {
                  return {command: 'printf forbidden > outside.txt', read};
               }, 404];
            }),
            ['B mutations left file unchanged', 'get', accessFile ('outside.txt'), 200, assertBody ('original')],

            // C signs up after being invited: verification must transfer the grant.
            accessLogin ('c'),
            ['C sees shared project', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['project ids', dale.go (rs.body, function (p) {return p.id}), [s.accessProjectId], teishi.test.equal],
                  ['writable', rs.body [0].read, undefined, teishi.test.equal],
               ]);
            }],
            projectLogin ('C on shared project', 'accessProject'),
            accessWrite ('outside.txt', 'written by C', 200),
            ['C edits file', 'post', '/project/edit', function (s) {
               return {path: 'outside.txt', oldText: 'written', newText: 'edited'};
            }, 200],
            ['C reads edited file', 'get', accessFile ('outside.txt'), 200, assertBody ('edited by C')],
            ['C uploads file', 'post', '/project/write', function (s) {
               return {multipart: [
                  {name: 'path', value: 'upload.txt'},
                  {name: 'file', filename: 'upload', value: 'uploaded by C'},
               ]};
            }, 200],
            ['C reads uploaded file', 'get', accessFile ('upload.txt'), 200, assertBody ('uploaded by C')],
            ['C sends message', 'post', '/project/message', function (s) {
               return {file: 'chat/thread.md', to: 'all', body: 'Hello from C'};
            }, 200],
            ['C runs command', 'post', '/project/run', function (s) {
               return {command: 'printf "command by C" > outside.txt'};
            }, 200],
            ['C command changed file', 'get', accessFile ('outside.txt'), 200, assertBody ('command by C')],
            ['C reads .git as whole-project writer', 'get', accessFile ('.git/HEAD'), 200, assertBody ('ref: refs/heads/main\n')],
            ['C cannot rename project', 'put', '/project', function (s) {
               return {id: s.accessProjectId, name: 'not the owner'};
            }, 404],
            ['C cannot delete project', 'delete', function (s) {return '/project/' + s.accessProjectId}, 403],

            // Replace C's whole-project grant with a prefix-scoped grant.
            useSession ('A on shared project'),
            accessWrite ('vibey/access.md', 'access-b@example.com read\naccess-c@example.com write chat/\n', 200),
            accessSync,
            useSession ('C on shared project'),
            ['C lists only scoped files', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['chat/inside.txt', 'chat/thread.md'], teishi.test.equal]);
            }],
            ['C reads scoped file', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('original')],
            accessWrite ('chat/inside.txt', 'scoped write', 200),
            ['C edits scoped file', 'post', '/project/edit', function (s) {
               return {path: 'chat/inside.txt', oldText: 'write', newText: 'edit'};
            }, 200],
            ['C reads scoped edit', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('scoped edit')],
            ['C sends scoped message', 'post', '/project/message', function (s) {
               return {file: 'chat/thread.md', to: 'all', body: 'Still allowed'};
            }, 200],
            accessWrite ('chat/.git/config', 'forbidden', 404),
            dale.go (['outside.txt', 'chatty/outside.txt'], function (path) {
               return [
                  ['C cannot read ' + path, 'get', accessFile (path), 404],
                  accessWrite (path, 'forbidden', 404),
                  ['C cannot edit ' + path, 'post', '/project/edit', function (s) {
                     return {path, oldText: '[EOF]', newText: 'forbidden'};
                  }, 404],
               ];
            }),
            ['C cannot send out-of-scope message', 'post', '/project/message', function (s) {
               return {file: 'outside.txt', to: 'all', body: 'Forbidden'};
            }, 404],
            dale.go ([false, true], function (read) {
               return ['Scoped C cannot run commands with read=' + read, 'post', '/project/run', function (s) {
                  return {command: 'printf forbidden > outside.txt', read};
               }, 404];
            }),
            dale.go (['shell', 'ai-gpt-6'], function (to) {
               return ['Scoped C cannot message ' + to, 'post', '/project/message', function (s) {
                  return {file: 'chat/thread.md', to, body: 'printf forbidden'};
               }, 404];
            }),

            useSession ('B on shared project'),
            ['B retains whole-project read; denied writes had no effect', 'get', accessFile ('outside.txt'), 200, assertBody ('command by C')],
            ['Prefix lookalike file unchanged', 'get', accessFile ('chatty/outside.txt'), 200, assertBody ('original')],
            useSession ('A on shared project'),
            accessWrite ('vibey/access.md', 'access-b@example.com read chat/\naccess-c@example.com write chat/\n', 200),
            accessSync,
            useSession ('B on shared project'),
            ['B lists only scoped files', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['chat/inside.txt', 'chat/thread.md'], teishi.test.equal]);
            }],
            ['B reads scoped file', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('scoped edit')],
            ['B cannot read outside scope', 'get', accessFile ('outside.txt'), 404],
            ['B cannot read prefix lookalike', 'get', accessFile ('chatty/outside.txt'), 404],
            ['B cannot read access.md outside scope', 'get', accessFile ('vibey/access.md'), 404],
            useSession ('A on shared project'),
            ['A retains write outside prefix', 'post', '/project/edit', function (s) {
               return {path: 'outside.txt', oldText: 'command by C', newText: 'owner still writes'};
            }, 200],

            // Invalid entries abort the sync without touching existing grants.
            dale.go ([
               ['invalid email', 'not-an-email read\n'],
               ['unknown verb', 'access-b@example.com admin\n'],
               ['parent prefix', 'access-b@example.com read ../x\n'],
               ['absolute prefix', 'access-b@example.com read /chat/\n'],
               ['doubled slash prefix', 'access-b@example.com read chat//\n'],
            ], function (entry) {
               return [
                  accessWrite ('vibey/access.md', 'access-c@example.com write chat/\n' + entry [1], 200),
                  ['Sync with ' + entry [0] + ' fails', 'post', '/project/run', function (s) {
                     return {command: 'vibey access'};
                  }, 200, function (s, rq, rs) {
                     return assert (['sync error', rs.body.error, /^Invalid vibey\/access\.md (line|prefix)/, teishi.test.match]);
                  }],
               ];
            }),
            accessWrite ('vibey/access.md', 'access-c@example.com write chat/\nPUBLIC write\n', 200),
            ['Sync with PUBLIC write fails', 'post', '/project/run', {command: 'vibey access'}, 200, function (s, rq, rs) {
               return assert (['sync error', rs.body.error, 'PUBLIC can only be granted read at line: PUBLIC write', teishi.test.equal]);
            }],
            useSession ('B on shared project'),
            ['B keeps scoped read after failed syncs', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('scoped edit')],

            // Comments, blank lines and email case don't affect the sync. Syncing replaces grants, so B would lose access if its line were skipped.
            useSession ('A on shared project'),
            accessWrite ('vibey/access.md', '# Shared with the team\n\nACCESS-B@Example.com read chat/\naccess-c@example.com write chat/\n', 200),
            accessSync,
            useSession ('B on shared project'),
            ['B keeps access through comment, blank line and uppercase email', 'get', accessFile ('chat/inside.txt'), 200, assertBody ('scoped edit')],

            // A read prefix also scopes messages.
            useSession ('A on shared project'),
            ['A posts message outside B scope', 'post', '/project/message', function (s) {
               return {file: 'notes/thread.md', to: 'all', body: 'Not for B'};
            }, 200, function (s, rq, rs) {
               s.accessNotesMessageId = rs.body.id;
               return assert (['message id', s.accessNotesMessageId, 'string']);
            }],
            useSession ('B on shared project'),
            ['B cannot read message outside scope', 'get', function (s) {return '/project/message/' + s.accessNotesMessageId + '/notes/thread.md'}, 404],

            // Cross-project shell commands: `vibey project <targetId> <command>`, authorized by `project:<originId> write` in the target's access.md.
            useSession ('A on shared project'),
            ['A creates target project', 'post', '/project', {name: 'access target'}, 200, function (s, rq, rs) {
               s.accessTargetId = rs.body.id;
               s.accessTarget = 'access-a--access-target';
               return assert (['target id', s.accessTargetId, 'string']);
            }],
            projectLogin ('A on target project', 'accessTarget'),
            {
               tag: 'Project session does not carry over to another project',
               method: 'post',
               host: function (s) {return s.accessTarget + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/project/write',
               headers: function (s) {
                  var session = s.projectSessions ['A on shared project'];
                  return {cookie: session.cookie, 'x-csrf': session.projectCsrf};
               },
               body: {path: 'carried.txt', content: 'forbidden'},
               code: 403,
               apres: assertBody ({error: 'Invalid session'}),
            },
            useSession ('A on shared project'),
            accessShell ('without target access.md', 'target', 'printf denied > cross.txt', 404),
            dale.go (['11111111-1111-1111-1111-111111111111', 'not-a-project'], function (id) {
               return ['Cross-project shell to unknown project ' + id, 'post', '/project/message', {file: 'chat/thread.md', to: 'shell', body: 'vibey project ' + id + ' true'}, 404, function (s, rq, rs, next) {
                  run ('docker', 'ps', '-aq', '-f', 'name=^/vibey-project-' + id + '$').then (function (result) {
                     if (! assert (['container for ' + id, result.stdout || '', '', teishi.test.equal])) return next ({code: 0, error: validationError, request: rq});
                     next (null, rs);
                  }, next);
               }];
            }),
            targetAccess ('read'),
            accessShell ('with read grant', 'target', 'printf denied > cross.txt', 404),
            targetAccess ('write chat/'),
            accessShell ('with prefixed write grant', 'target', 'printf denied > cross.txt', 404),
            targetAccess ('write'),
            accessShell ('syncs target access', 'target', 'vibey access', 200),
            accessWait,
            accessShell ('runs command in target', 'target', 'printf cross > cross.txt', 200),
            accessWait,
            accessShell ('targeting the origin', 'origin', 'printf self > self.txt', 200),
            accessWait,
            ['A runs shell command that prints a marker', 'post', '/project/message', {file: 'chat/thread.md', to: 'shell', body: "printf 'əəə head 00000000-0000-0000-0000-000000000000\\n'"}, 200, function (s, rq, rs) {
               s.accessResponseId = rs.body.responseId;
               return true;
            }],
            accessWait,
            ['Shell output markers are escaped', 'get', accessFile ('chat/thread.md') + '?raw=1', 200, function (s, rq, rs) {
               return assert ([
                  ['escaped', rs.body.indexOf ('\n> əəə head 00000000-0000-0000-0000-000000000000\n') !== -1, true, teishi.test.equal],
                  ['not unescaped', /^əəə head 00000000-0000-0000-0000-000000000000$/m.test (rs.body), false, teishi.test.equal],
               ]);
            }],
            useSession ('A on target project'),
            ['Target has cross-project output', 'get', accessFile ('cross.txt'), 200, assertBody ('cross')],
            useSession ('A on shared project'),
            ['Origin unaffected by cross-project command', 'get', accessFile ('cross.txt'), 404],
            ['Origin has self-targeted output', 'get', accessFile ('self.txt'), 200, assertBody ('self')],
            accessAs ('b'),
            ['B sees target after cross-project sync', 'get', '/projects', 200, function (s, rq, rs) {
               return assert (['includes target', inc (dale.go (rs.body, function (p) {return p.id}), s.accessTargetId), true, teishi.test.equal]);
            }],
            useSession ('A on target project'),
            ['A revokes project grant without syncing', 'post', '/project/write', function (s) {
               return {path: 'vibey/access.md', content: 'access-b@example.com read\n'};
            }, 200],
            useSession ('A on shared project'),
            accessShell ('after revocation', 'target', 'printf denied > cross.txt', 404),
            useSession ('A on target project'),
            ['Target file unchanged by denied commands', 'get', accessFile ('cross.txt'), 200, assertBody ('cross')],
            ['A deletes target project', 'delete', function (s) {return '/project/' + s.accessTargetId}, 200],

            // PUBLIC grants: one project public as a whole, another only under chat/.
            ['A creates full public project', 'post', '/project', {name: 'public full', slot: 2}, 200, function (s, rq, rs) {
               s.publicFullId = rs.body.id;
               s.publicFull = 'access-a--public-full';
               return true;
            }],
            ['A creates partial public project', 'post', '/project', {name: 'public partial'}, 200, function (s, rq, rs) {
               s.publicPartialId = rs.body.id;
               s.publicPartial = 'access-a--public-partial';
               return true;
            }],
            dale.go ([
               ['publicFull', [
                  ['notes.md', 'Notes'],
                  ['src/app.js', 'console.log ("app");'],
                  ['vibey/access.md', 'PUBLIC read\n'],
               ]],
               ['publicPartial', [
                  ['chat/one.txt', 'one'],
                  ['chat/two.txt', 'two'],
                  ['APP:3000.txt', 'app lookalike'],
                  ['vibey/access.md', 'PUBLIC read chat/\nPUBLIC read APP:3000\n'],
               ]],
            ], function (project) {
               return [
                  projectLogin ('A on ' + project [0], project [0]),
                  dale.go (project [1], function (file) {
                     return ['A writes ' + file [0] + ' to ' + project [0], 'post', '/project/write', {path: file [0], content: file [1]}, 200];
                  }),
                  ['Sync access for ' + project [0], 'post', '/project/run', {command: 'vibey access'}, 200, function (s, rq, rs) {
                     return assert (['sync error', rs.body.error, undefined, teishi.test.equal]);
                  }],
               ];
            }),
            ['A sees own public projects unflagged, with slot', 'get', '/projects', 200, function (s, rq, rs) {
               var full = dale.stopNot (rs.body, undefined, function (p) {if (p.id === s.publicFullId) return p});
               var partial = dale.stopNot (rs.body, undefined, function (p) {if (p.id === s.publicPartialId) return p});
               return assert ([
                  ['full public', full.public, undefined, teishi.test.equal],
                  ['partial public', partial.public, undefined, teishi.test.equal],
                  ['full slot', full.slot, 2, teishi.test.equal],
                  ['partial slot', partial.slot, undefined, teishi.test.equal],
               ]);
            }],
            ['Switch to anonymous', 'get', '/', 200, function (s) {
               delete s.headers.cookie;
               delete s.headers ['x-csrf'];
               delete s.projectCsrf;
               return true;
            }],
            ['Anonymous lists public projects without slots', 'get', '/projects', 200, function (s, rq, rs) {
               var listed = dale.fil (rs.body, undefined, function (p) {
                  if (p.id === s.publicFullId || p.id === s.publicPartialId) return p;
               });
               return assert ([
                  ['both listed', listed.length, 2, teishi.test.equal],
                  ['public', dale.go (listed, function (p) {return p.public}), [true, true], teishi.test.equal],
                  ['slots', dale.go (listed, function (p) {return p.slot}), [undefined, undefined], teishi.test.equal],
               ]);
            }],
            useProject ('publicFull'),
            {
               tag: 'Anonymous user on public project tries optional project login',
               method: 'get',
               host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/auth/user',
               code: 403,
               apres: function (s, rq, rs) {
                  var base = new URL (CONFIG.baseURL);
                  var location = new URL (rs.body.location);
                  if (! assert ([
                     ['location', location.origin + location.pathname, CONFIG.baseURL + '/auth/project/' + s.projectSubdomain, teishi.test.equal],
                     ['returnUrl', location.searchParams.get ('returnUrl'), base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/', teishi.test.equal],
                     ['optional', location.searchParams.get ('optional'), '1', teishi.test.equal],
                     ['cookie', getCookie (rs.headers), new RegExp ('^' + cookie ('project-state') + '='), teishi.test.match],
                  ])) return false;
                  s.optionalLoginPath = location.pathname + location.search;
                  s.optionalStateCookie = getCookie (rs.headers).split (';') [0];
                  return true;
               },
            },
            ['Optional project login without session returns to project', 'get', function (s) {return s.optionalLoginPath}, 302, function (s, rq, rs) {
               var base = new URL (CONFIG.baseURL);
               return assert (['location', rs.headers.location, base.protocol + '//' + s.projectSubdomain + '.' + base.host + '/', teishi.test.equal]);
            }],
            {
               tag: 'Anonymous user on public project after optional project login',
               method: 'get',
               host: function (s) {return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/auth/user',
               headers: function (s) {return {cookie: s.optionalStateCookie}},
               code: 200,
               apres: assertBody ({anonymous: true, mode: 'cloud'}),
            },
            ['Anonymous lists full public project files', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['main.md', 'notes.md', 'src/app.js'], teishi.test.equal]);
            }],
            ['Anonymous reads full public project file', 'get', '/f/notes.md?raw=1', 200, assertBody ('Notes')],
            ['Anonymous cannot read access.md', 'get', '/f/vibey/access.md', 302],
            ['Anonymous cannot read .git', 'get', '/f/.git/HEAD', 302],
            ['Anonymous cannot write', 'post', '/project/write', {path: 'notes.md', content: 'forbidden'}, 403],
            useProject ('publicPartial'),
            ['Anonymous lists partial public project files', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['chat/one.txt', 'chat/two.txt'], teishi.test.equal]);
            }],
            ['Anonymous reads partial public project file', 'get', '/f/chat/one.txt', 200, assertBody ('one')],
            ['Anonymous cannot read outside partial public prefix', 'get', '/f/main.md', 302],
            {
               tag: 'Anonymous reaches app granted by APP:3000',
               method: 'get',
               host: function (s) {return '3000--' + s.publicPartial + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/',
               code: 502,
               apres: assertBody ({error: 'Nothing is listening on port 3000'}),
            },
            {
               tag: 'APP:3000 does not grant other ports',
               method: 'get',
               host: function (s) {return '3001--' + s.publicPartial + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/',
               code: 302,
            },
            useSession ('A on publicPartial'),
            ['A grants PUBLIC a file prefix that APP:3000 starts with', 'post', '/project/write', {path: 'vibey/access.md', content: 'PUBLIC read A\n'}, 200],
            ['Sync file prefix grant', 'post', '/project/run', {command: 'vibey access'}, 200, function (s, rq, rs) {
               return assert (['sync error', rs.body.error, undefined, teishi.test.equal]);
            }],
            ['Switch to anonymous again', 'get', '/', 200, function (s) {
               delete s.headers.cookie;
               delete s.headers ['x-csrf'];
               delete s.projectCsrf;
               return true;
            }],
            {
               tag: 'File prefix does not grant apps',
               method: 'get',
               host: function (s) {return '3000--' + s.publicPartial + '.' + new URL (CONFIG.baseURL).hostname},
               path: '/',
               code: 302,
            },
            ['File prefix lists app lookalike file', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['APP:3000.txt'], teishi.test.equal]);
            }],
            ['File prefix reads app lookalike file', 'get', '/f/APP:3000.txt', 200, assertBody ('app lookalike')],
            accessAs ('b'),
            ['B gets session code from optional project login', 'get', function (s) {return s.optionalLoginPath}, 302, function (s, rq, rs) {
               var base = new URL (CONFIG.baseURL);
               var location = new URL (rs.headers.location);
               return assert ([
                  ['origin', location.origin, base.protocol + '//' + s.publicFull + '.' + base.host, teishi.test.equal],
                  ['sessionCode', location.searchParams.get ('sessionCode'), /^[a-f0-9]{64}$/, teishi.test.match],
               ]);
            }],
            ['B sees public projects without slots', 'get', '/projects', 200, function (s, rq, rs) {
               var listed = dale.fil (rs.body, undefined, function (p) {
                  if (p.id === s.publicFullId || p.id === s.publicPartialId) return p;
               });
               return assert ([
                  ['both listed', listed.length, 2, teishi.test.equal],
                  ['public', dale.go (listed, function (p) {return p.public}), [true, true], teishi.test.equal],
                  ['slots', dale.go (listed, function (p) {return p.slot}), [undefined, undefined], teishi.test.equal],
               ]);
            }],
            projectLogin ('B on publicFull', 'publicFull'),
            ['B reads full public project file', 'get', '/f/notes.md?raw=1', 200, assertBody ('Notes')],
            ['B cannot read access.md on public project', 'get', '/f/vibey/access.md', 404],
            ['B does not list access.md on public project', 'get', '/project', 200, function (s, rq, rs) {
               return assert (['file names', dale.go (rs.body.files, function (f) {return f.name}), ['main.md', 'notes.md', 'src/app.js'], teishi.test.equal]);
            }],
            ['B cannot read .git on public project', 'get', '/f/.git/HEAD', 404],
            ['B cannot write to public project', 'post', '/project/write', {path: 'notes.md', content: 'forbidden'}, 404],
            accessAs ('a'),
            ['A deletes full public project', 'delete', function (s) {return '/project/' + s.publicFullId}, 200],
            ['A deletes partial public project', 'delete', function (s) {return '/project/' + s.publicPartialId}, 200],

            // Removing a user's line entirely revokes their access on the next sync.
            useSession ('A on shared project'),
            accessWrite ('vibey/access.md', 'access-c@example.com write chat/\n', 200),
            accessSync,
            useSession ('B on shared project'),
            ['B no longer sees revoked project', 'get', '/projects', 200, assertBody ([])],
            ['B cannot list revoked project files', 'get', '/project', 404],
            ['B cannot read revoked file', 'get', accessFile ('chat/inside.txt'), 404],
            accessAs ('a'),
            ['Delete A while C still has access', 'post', '/auth/delete', {}, 200],
            accessAs ('c'),
            ['C no longer sees project', 'get', '/projects', 200, assertBody ([])],
            useSession ('C on shared project'),
            ['C cannot list deleted owner\'s project', 'get', '/project', 404],
            accessAs ('c'),
            ['Delete C', 'post', '/auth/delete', {}, 200],
            accessAs ('b'),
            ['B no longer sees project', 'get', '/projects', 200, assertBody ([])],
            ['Delete B', 'post', '/auth/delete', {}, 200],
         ] : [];

         suites.all = Object.values (suites);

         hitit.seq ({port: CONFIG.port, headers: {'x-test': '1'}}, suites [suite], function (error, rdata) {
            if (error) {
               if (error.request) error = {
                  rq: {
                     method: error.request.method,
                     path: error.request.path,
                     body: error.request.body,
                     expectedCode: error.request.code,
                  },
                  rs: {
                     code: error.code,
                     body: error.body
                  },
                  tag: error.request.tag,
                  validationError,
               };
            }

            cb (error ? error : undefined, dale.go (rdata, function (v) {
               var prepend = function (s, n) {
                  return dale.go (dale.times (n - s.length), function () {return ''}).join (' ') + s;
               }

               if (v === undefined) return;

               var prefix = 'OK ' + prepend ('(' + (v.time [1] - v.time [0]) + 'ms): ', 12);
               return prefix + v.request.tag;
            }).join ('\n'));

         }, function (test) {
            if (type (test) === 'object') return test; // Allow verbose object format
            var noBody = inc (['get', 'delete'], test [1]);
            var headers = type (last (test)) === 'object' ? last (test) : {};

            var host = function (s) {

               var method = type (test [1]) === 'function' ? test [1] (s) : test [1];
               var path = type (test [2]) === 'function' ? test [2] (s) : test [2];

               var matchRoute = function (routes) {
                  return dale.stop (routes, true, function (endpoint) {
                     if (type (endpoint [1]) === 'string') endpoint [1] = new RegExp ('^' + cicek.escape (endpoint [1]) + '$');
                     return method === endpoint [0] && !! path.match (endpoint [1]);
                  });
               }

               if (matchRoute ([
                  ['get', '/project'],
                  ['get', /^\/f\/.+/],
                  ['get', /^\/project\/message\/.+/],
                  ['post', '/project/write'],
                  ['post', '/project/edit'],
                  ['post', '/project/run'],
                  ['post', '/project/message'],
               ])) return s.projectSubdomain + '.' + new URL (CONFIG.baseURL).hostname;
            }

            return {
               host,
               tag:    test [0],
               method: test [1],
               path:   test [2],
               headers: function (s) {return host (s) && s.projectCsrf ? {... headers, 'x-csrf': s.projectCsrf} : headers},
               body:   noBody ? '' : test [3],
               code:   test [noBody ? 3 : 4],
               apres:  type (test [noBody ? 4 : 5]) === 'function' ? test [noBody ? 4 : 5] : undefined,
            };
         });
      }
   }
}

if (mode === 'client') {

   var adminEmail = B.get ('user', 'email');

   var validationError;

   var assert = function (assertion) {
      var result = teishi.v (assertion, true);
      if (result === true) return true;
      validationError = result;
      return false;
   }

   var suites = {};

   var find = function (selector, text) {

      var toEscape = ['-', '[', ']', '{', '}', '(', ')', '|', '+', '*', '?', '.', '/', '\\', '^', '$'];
      text = text.replace (new RegExp ('[' + toEscape.join ('\\') + ']', 'g'), '\\$&');

      return dale.stopNot (c (selector), undefined, function (element) {
         if (element.innerHTML.match (text)) return element;
      });
   }

   suites.auth = [
      ['Logout to begin', function (next) {
         find ('button', 'Logout').click ();
         next (1000, 1);
      }, function () {
         return assert ([
            ['user.csrf', B.get ('user', 'csrf'), undefined, teishi.test.equal],
            ['view', B.get ('view'), 'login', teishi.test.equal],
            ['inputs present', c ('input').length, 1, teishi.test.equal],
         ]);
      }],
      ['Login button disabled with invalid email', function (next) {
         var input = c ('input') [0];
         input.value = 'not-an-email';
         c.fire (input, 'input');
         next (500, 1);
      }, function () {
         var button = c ('button') [0];
         return assert ([
            ['button disabled', button.disabled, true, teishi.test.equal],
            ['button text', button.innerHTML, 'Enter your email', teishi.test.equal],
         ]);
      }],
      ['Login button enabled with valid email', function (next) {
         var input = c ('input') [0];
         input.value = 'hello@example.com';
         c.fire (input, 'input');
         next (500, 1);
      }, function () {
         var button = c ('button') [0];
         return assert ([
            ['button enabled', button.disabled, false, teishi.test.equal],
            ['button text', button.innerHTML, 'Let me in', teishi.test.equal],
         ]);
      }],
      ['Send login link', function (next) {
         find ('button', 'Let me in').click ();
         next (1000, 1);
      }, function () {
         return assert ([
            ['loginLinkRequested', B.get ('user', 'loginLinkRequested'), true, teishi.test.equal],
            ['loginLink', B.get ('test', 'loginLink'), 'string'],
         ]);
      }],
      ['Snackbar after login link sent', function (next) {
         next (500, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['snackbar type', snackbar.type, 'ok', teishi.test.equal],
            ['snackbar message', snackbar.message, 'Login link sent, please check your inbox', teishi.test.equal],
         ]);
      }],
      ['Button text changes to Send another link', function (next) {
         next (500, 1);
      }, function () {
         var button = c ('button') [0];
         return assert ([
            ['button text', button.innerHTML, 'Send another link', teishi.test.equal],
         ]);
      }],
      ['Subtitle shows check inbox message', function (next) {
         next (500, 1);
      }, function () {
         return assert ([
            ['subtitle', !! find ('div', 'Check your inbox for a login link'), true, teishi.test.equal],
         ]);
      }],
      ['Verify with invalid login link', function (next) {
         window.location.hash = '#/verify/bogus';
         next (1000, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['snackbar type', snackbar.type, 'error', teishi.test.equal],
            ['snackbar message', snackbar.message, 'Invalid or expired login link', teishi.test.equal],
            ['view', B.get ('view'), 'login', teishi.test.equal],
         ]);
      }],
      ['Verify with valid login link', function (next) {
         window.location.hash = '#/verify/' + B.get ('test', 'loginLink');
         next (1000, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['csrf', B.get ('user', 'csrf'), 'string'],
            ['view', B.get ('view'), 'projects', teishi.test.equal],
            ['snackbar type', snackbar.type, 'ok', teishi.test.equal],
            ['snackbar message', snackbar.message, 'Welcome back to vibey!', teishi.test.equal],
         ]);
      }],
   ];

   suites.project = [
      ['Login as admin', function (next) {
         B.call ('logout', []);
         setTimeout (function () { B.call ('login', adminEmail) }, 200);
         next (2000, 1);
      }, function () {
         return assert ([['loginLink', B.get ('test', 'loginLink'), 'string']]);
      }],
      ['Verify admin and grant creator', function (next) {
         B.call ('verify', B.get ('test', 'loginLink'));
         next (1000, 1);
      }, function () {
         B.call ('post', '/creator/grant', {email: 'projects@example.com', grant: true});
         return assert ([['view', B.get ('view'), 'projects', teishi.test.equal]]);
      }],
      ['Login test user', function (next) {
         B.call ('login', 'projects@example.com');
         next (1500, 1);
      }, function () {
         return assert ([['loginLink', B.get ('test', 'loginLink'), 'string']]);
      }],
      ['Verify test user', function (next) {
         B.call ('verify', B.get ('test', 'loginLink'));
         next (1000, 1);
      }, function () {
         return assert ([
            ['view', B.get ('view'), 'projects', teishi.test.equal],
            ['empty', B.get ('projects').length, 0, teishi.test.equal],
         ]);
      }],
      ['Create project', function (next) {
         B.call ('set', ['new', 'project'], {name: 'test project'});
         setTimeout (function () { find ('button', 'Boom').click () }, 300);
         next (3000, 1);
      }, function () {
         return assert ([
            ['view', B.get ('view'), 'files', teishi.test.equal],
            ['project', dale.stopNot (B.get ('projects'), undefined, function (project) {
               if (project.id === B.get ('project', 'id')) return project.name;
            }), 'test project', teishi.test.equal],
         ]);
      }],
      ['Back to projects', function (next) {
         window.location.hash = '#/projects';
         next (1000, 1);
      }, function () {
         return assert ([['count', B.get ('projects').length, 1, teishi.test.equal]]);
      }],
      ['Duplicate name blocked', function (next) {
         B.call ('set', ['new', 'project'], {name: 'test project'});
         next (500, 1);
      }, function () {
         var result = assert ([['disabled', find ('button', "That name's taken").disabled, true, teishi.test.equal]]);
         B.call ('rem', 'new', 'project');
         return result;
      }],
      ['Search filters', function (next) {
         B.call ('set', ['search', 'project'], 'zzz');
         next (500, 1);
      }, function () {
         return assert ([['hidden', ! find ('span', 'test project'), true, teishi.test.equal]]);
      }],
      ['Search finds', function (next) {
         B.call ('set', ['search', 'project'], '');
         next (500, 1);
      }, function () {
         return assert ([['found', !! find ('span', 'test project'), true, teishi.test.equal]]);
      }],
      ['Rename project', function (next) {
         c ('[title="Rename"]') [0].click ();
         setTimeout (function () {
            var input = c ('.edit-project-input') [0];
            input.value = 'renamed';
            c.fire (input, 'input');
         }, 300);
         setTimeout (function () { find ('button', 'Rename').click () }, 600);
         next (2000, 1);
      }, function () {
         return assert ([['snackbar', (B.get ('snackbar') || {}).message, 'Project renamed', teishi.test.equal]]);
      }],
      ['Delete project', function (next) {
         var orig = window.confirm;
         window.confirm = function () { return true };
         c ('[title="Delete"]') [0].click ();
         window.confirm = orig;
         next (1000, 1);
      }, function () {
         return assert ([
            ['snackbar', (B.get ('snackbar') || {}).message, 'Project deleted', teishi.test.equal],
            ['count', B.get ('projects').length, 0, teishi.test.equal],
         ]);
      }],
   ];

   c.test (Object.values (suites).flat (), async function (error, time) {
      if (error) {
         error.validationError = validationError;
         console.log ('Test error', error);
         return B.call ('snackbar', 'error', JSON.stringify (error));
      }
      else {
         // On successful test, log back in as admin and clean up all data from the tests
         var wait = (ms) => new Promise ((resolve) => setTimeout (resolve, ms));

         B.call ('logout', []);
         await wait (20);
         B.call ('login', adminEmail);
         await wait (20);
         B.call ('verify', B.get ('test', 'loginLink'));
         await wait (20);

         B.call ('post', '/test/cleanup');
         B.call ('rem', [], 'test');

         console.log ('All tests OK');
         B.call ('snackbar', 'ok', 'All tests passed in ' + time + 'ms');
      }
   });
}
