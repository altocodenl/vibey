var mode = typeof window === 'undefined' ? 'server' : 'client';

var clog = console.log;

if (mode === 'server') {

   // *** SETUP ***

   var dale   = require ('dale');
   var teishi = require ('teishi');
   var hitit  = require ('hitit');
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
   module.exports.cleanup = async function (docker, redis) {
      var keys = await redis ('keys', '*');
      var emails = dale.fil (keys, undefined, function (key) {
         // Cleanup is contingent on all test users using `example.com` as their email's domain, and on no real users using this domain.
         // Tests are not designed to run on prod environments.
         if (! key.match (/example\.com$/)) return;
         if (key.match (/^email:/)) return key;
      });

      if (emails.length === 0) return;

      var userIds = await redis ('mget', ... emails);

      var resources = await redis ('sinter', ... dale.go (userIds, function (userId) {
         return 'owner:' + userId;
      }));

      await redis ('del', ... [
         ... dale.go (emails, (email) => [email, 'rateLimit:login:' + email.replace ('email:', '')]).flat (),
         ... dale.go (userIds, (userId) => ['user:' + userId]).flat (),
         ... resources,
      ]);

      var projectIds = dale.fil (resources, undefined, function (resource) {
         if (resource.match (/^project:/)) return resource.replace ('project:', '');
      });

      if (projectIds.length === 0) return;

      await run ('docker', 'stop',         ... projectIds, {catch: true});
      await run ('docker', 'rm',           ... projectIds, {catch: true});
      await run ('docker', 'volume', 'rm', ... projectIds, {catch: true});
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

         // *** PUBLIC ***

         suites.public = dale.go ([
            ['get', '/'],
            ['get', '/favicon.ico'],
            ... dale.go (['normalize', 'tachyons', 'bootstrap-icons', 'fonts/bootstrap-icons.woff2', 'fonts/bootstrap-icons.woff'], function (v) {
               return ['get', '/' + v + (v.match (/\.woff\d?$/) ? '' : '.css')];
            }),
            ... dale.go (['client', 'gotoB', 'marked'], function (v) {
               return ['get', '/' + v + '.js'];
            }),
            ['post', '/error'],
         ], function (route) {
            if (route [0] === 'get') return ['Get public route: ' + route [1], 'get', route [1], 200];
            return ['Post public route: ' + route [1], 'post', route [1], {test: 'hello'}, 200];
         });

         // *** TEST ***

         suites.test = CONFIG.cloud ? ['Trigger tests without session', 'get', '/test', 403, assertBody ({error: 'No session'})] : [];

         // *** ERROR REPORTING ***

         suites.error = [
            ['Submit error: object', 'post', '/error', {error: 'Opa'}, 200],
            ['Submit error: array', 'post', '/error', ['error', 'Opa'], 200],
            ['Submit error: string', 'post', '/error', 'There was a problem...', 200],
         ];

         // *** AUTH ***

         suites.auth = [
            ['Get /auth/user without session', 'get', '/auth/user', '*', function (s, rq, rs) {
               return assert ([
                  ['code', rs.code, CONFIG.cloud ? 403 : 200, teishi.test.equal],
                  ['body', rs.body, CONFIG.cloud ? {error: 'No session'} : {mode: 'local'}, teishi.test.equal],
               ]);
            }],
            dale.go (['/creator/grant', '/auth/login'], function (path, k) {
               if (CONFIG.cloud) return [
                  ['Call auth path without email', 'post', path, {user: 'whatever'}, 400, assertBody ({error: 'email should have as type string but instead is undefined with type undefined'}), path === '/creator/grant' ? adminHeaders : {}],
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

               if (! CONFIG.cloud) return ['Call auth path in local mode', 'post', path, 404, assertBody ({error: 'Not in cloud mode'})];
            }),
            CONFIG.cloud ? [
               ['Login', 'post', '/auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.loginLink = rs.body.loginLink;
                  return true;
               }],
               ['Verify login (invalid link)', 'get', '/auth/verify/bogus', 403, assertBody ({error: 'Invalid login link', loginLink: 'bogus'})],
               ['Verify login again', 'get', function (s) {return '/auth/verify/' + s.loginLink}, 200, function (s, rq, rs) {
                  if (! assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="[a-f0-9]{64}"; Expires=.+ ' + (parseInt (new Date ().toISOString ().slice (0, 4)) + 10) + ' .+ HttpOnly; Path=\\/; SameSite=Lax;'), teishi.test.match],
                     ['csrf token', rs.body.csrf, 'string']
                  ])) return false;
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Request creator access', 'post', '/creator/request', {}, 200],
               ['Request creator access again', 'post', '/creator/request', {}, 200],
               ['Grant creator access', 'post', '/creator/grant', {email: 'hello@example.com', grant: true}, 200, adminHeaders],
               ['Grant creator access for nonexisting account', 'post', '/creator/grant', {email: 'foo@example.com', grant: true}, 200, adminHeaders],
               ['Get user', 'get', '/auth/user', 200, function (s, rq, rs) {
                  return assert ([
                     ['body', rs.body, 'object'],
                     ['body.count', rs.body.count, 'integer'],
                     ['body.creator', rs.body.creator, true, teishi.test.equal],
                     ['body.csrf', rs.body.csrf, s.headers ['x-csrf'], teishi.test.equal],
                     ['body.email', rs.body.email, 'hello@example.com', teishi.test.equal],
                  ]);
               }],
               ['Logout', 'post', '/auth/logout', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; Path=\\/; SameSite=Lax'), teishi.test.match],
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
                     next ();
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
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; Path=\\/; SameSite=Lax'), teishi.test.match],
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                  ]);
               }, {cookie: CONFIG.cookie.name + '="foo"'}],
               ['Private route with no session', 'get', '/auth/user', 403, assertBody ({error: 'No session'}), {cookie: ''}],
               ['Public route with invalid session', 'get', '/', 200, {cookie: CONFIG.cookie.name + '="foo"'}],
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
                     await redis ('hset', 'session:' + s.sessions [1].cookie.match (/"[0-9a-f]+"/) [0].replace (/"/g, ''), 'expires', new Date ().toISOString ());
                     next ();
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
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; Path=\\/; SameSite=Lax'), teishi.test.match],
                  ]);
               }],
               ['Delete account', 'post', '/auth/delete', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; Path=\\/; SameSite=Lax'), teishi.test.match],
                  ]);
               }],
               ['List sessions after delete', 'get', '/auth/list', 403, assertBody ({error: 'Invalid session'})],
               ['Get user after delete', 'get', '/auth/user', 403, assertBody ({error: 'Invalid session'})],
            ] : [],
            ! CONFIG.cloud ? [
               ['Logout', 'post', '/auth/logout', {}, 404, assertBody ({error: 'Not in cloud mode'})],
               ['List sessions', 'get', '/auth/user', 404, assertBody ({error: 'Not in cloud mode'})],
               ['List sessions', 'get', '/auth/list', 404, assertBody ({error: 'Not in cloud mode'})],
            ] : [],
         ];

         suites.project = [
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
            ['Create project', 'post', '/project', {name: 'el norte'}, 200],
            ['List projects after creation', 'get', '/projects', 200, function (s, rq, rs) {
               if (! assert (['length', rs.body.length, 1, teishi.test.equal])) return false;
               s.projectId = rs.body [0].id;
               return true;
            }],
            ['Create a second project with the same name', 'post', '/project', {name: 'el norte'}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Create a second project with another name', 'post', '/project', {name: 'second'}, 200],
            ['List projects after second project creation', 'get', '/projects', 200, function (s, rq, rs) {
               if (! assert (['length', rs.body.length, 2, teishi.test.equal])) return false;
               if (new Date (rs.body [0].last) < new Date (rs.body [1].last)) {
                  validationError = 'Last project should come first';
                  return false;
               }
               s.secondProjectId = rs.body [0].id;
               return true;
            }],
            ['Delete project', 'delete', function (s) {return '/project/' + s.secondProjectId}, 200],
            ['List projects after second project deletion', 'get', '/projects', 200, function (s, rq, rs) {
               return assert (['length', rs.body.length, 1, teishi.test.equal]);
            }],
            ['Rename project', 'put', '/project', {name: 'el norte'}, 400, assertBody ({error: 'id should have as type string but instead is undefined with type undefined'})],
            ['Rename project (noop)', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte'}}, 200],
            ['Rename project', 'put', '/project', function (s) {return {id: s.projectId, name: 'el norte!'}}, 200],
            ['List projects after rename', 'get', '/projects', 200, function (s, rq, rs) {
               return assert ([
                  ['length', rs.body.length, 1, teishi.test.equal],
                  function () {return [
                     ['project id', rs.body [0].id, s.projectId, teishi.test.equal],
                     ['project name', rs.body [0].name, 'el norte!', teishi.test.equal],
                  ]}
               ]);
            }],
            ['List files', 'post', 'project/run', function (s) {return {id: s.projectId, command: 'find . -type f -not -path \'./.git/*\''}}, 200, assertBody ({stdout: './doc/main.md\n'})],
            ['List commits when there is only the initial commit', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               s.assertCommit = function (stdout, length, name) {
                  return assert ([
                     ['commit length', stdout.split ('commit').length, length + 1, teishi.test.equal],
                     ['last commit name', stdout.split ('\n').slice (0, 5).join ('\n'), new RegExp (name), teishi.test.match]
                  ]);
               }
               return s.assertCommit (rs.body.stdout, 1, "Write 'doc/main.md'");
            }],
            ['Get file that is not there', 'post', '/project/read', function (s) {return {id: s.projectId, path: 'doc/whatevs.md'}}, 404],
            ['Get main file', 'post', '/project/read', function (s) {return {id: s.projectId, path: 'doc/main.md'}}, 200, assertBody ('# el norte')],
            ['Edit main file', 'post', '/project/edit', function (s) {return {id: s.projectId, path: 'doc/main.md', oldText: 'el norte', newText: 'El Norte!'}}, 200, function (s, rq, rs) {
               return assert ([
                  ['keys', dale.keys (rs.body), ['sha'], 'eachOf', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ]);
            }],
            ['List commits after edit', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               return s.assertCommit (rs.body.stdout, 2, "Edit 'doc/main.md'");
            }],
            ['Get main file after edit', 'post', '/project/read', function (s) {return {id: s.projectId, path: 'doc/main.md'}}, 200, assertBody ('# El Norte!')],
            ['Edit main file (noop)', 'post', '/project/edit', function (s) {return {id: s.projectId, path: 'doc/main.md', oldText: 'Norte!', newText: 'Norte!'}}, 200, assertBody ({})],
            ['List commits after noop edit', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               return s.assertCommit (rs.body.stdout, 2, "Edit 'doc/main.md'");
            }],
            ['Overwrite file', 'post', '/project/write', function (s) {return {id: s.projectId, path: 'doc/main.md', content: '# el norte'}}, 200, function (s, rq, rs) {
               return assert ([
                  ['keys', dale.keys (rs.body), ['sha'], 'eachOf', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ]);
            }],
            ['List commits after write', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               return s.assertCommit (rs.body.stdout, 3, "Write 'doc/main.md'");
            }],
            ['Overwrite file (noop)', 'post', '/project/write', function (s) {return {id: s.projectId, path: 'doc/main.md', content: '# el norte'}}, 200, assertBody ({})],
            ['List commits after noop write', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               return s.assertCommit (rs.body.stdout, 3, "Write 'doc/main.md'");
            }],
            ['Run a command with pipe', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'cat doc/main.md | grep norte'}}, 200, assertBody ({stdout: '# el norte\n'})],
            ['Run a command with change and output', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'echo foo > doc/another.md && cat doc/another.md'}}, 200, function (s, rq, rs, next) {
               if (! assert ([
                  ['keys', dale.keys (rs.body), ['stdout', 'sha'], 'eachOf', teishi.test.equal],
                  ['stdout', rs.body.stdout, 'foo\n', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ])) return false;

               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.projectId);
                  next ();
               }) ();
            }],
            ['List commits after command with change and output', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'git log'}}, 200, function (s, rq, rs) {
               return s.assertCommit (rs.body.stdout, 4, "Run 'echo foo > doc/another.md && cat doc/another.md'");
            }],
            ['Run a command after container has been turned off', 'post', '/project/run', function (s) {return {id: s.projectId, command: 'ls doc'}}, 200, assertBody ({stdout: 'another.md\nmain.md\n'})],
            ['Create a third project', 'post', '/project', {name: 'third'}, 200, function (s, rq, rs, next) {
               s.thirdProjectId = rs.body.id;
               (async function () {
                  await run ('docker', 'stop', 'vibey-project-' + s.thirdProjectId);
                  next ();
               }) ();
            }],
            ['Delete project with a stopped container', 'delete', function (s) {return '/project/' + s.thirdProjectId}, 200],
            CONFIG.cloud ? ['Delete account', 'post', '/auth/delete', {}, 200] : [],
         ];

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
            return {
               tag:    test [0],
               method: test [1],
               path:   test [2],
               headers,
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
            ['button text', button.innerHTML, 'Send me a link to get in', teishi.test.equal],
         ]);
      }],
      ['Send login link', function (next) {
         find ('button', 'Send me a link to get in').click ();
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
         B.call ('login', [], adminEmail);
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
