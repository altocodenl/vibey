var mode = typeof window === 'undefined' ? 'server' : 'client';

if (mode === 'server') {

   // *** SETUP ***

   var dale   = require ('dale');
   var teishi = require ('teishi');
   var hitit  = require ('hitit');
   var {inc, last, type} = teishi;

   var getCookie = function (headers) {
      return headers ['set-cookie'] [0];
   }

   module.exports = function (CONFIG) {
      return function (suite, cb, admin, redis) {

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
            ['get', 'favicon.ico'],
            ...dale.go (['normalize', 'tachyons', 'bootstrap-icons', 'fonts/bootstrap-icons.woff2', 'fonts/bootstrap-icons.woff'], function (v) {
               return ['get', '/' + v + (v.match (/\.woff\d?$/) ? '' : '.css')];
            }),
            ...dale.go (['client', 'gotoB', 'marked'], function (v) {
               return ['get', '/' + v + '.js'];
            }),
            ['post', '/error'],
         ], function (route) {
            if (route [0] === 'get') return ['Get public route: ' + route [1], 'get', route [1], 200];
            return ['Post public route: ' + route [1], 'post', route [1], {test: 'hello'}, 200];
         });

         // *** TEST ***

         suites.test = CONFIG.cloud ? ['Trigger tests without session', 'get', 'test', 403, assertBody ({error: 'No session'})] : [];

         // *** ERROR REPORTING ***

         suites.error = [
            ['Submit error: object', 'post', 'error', {error: 'Opa'}, 200],
            ['Submit error: array', 'post', 'error', ['error', 'Opa'], 200],
            ['Submit error: string', 'post', 'error', 'There was a problem...', 200],
         ];

         // *** AUTH ***

         suites.auth = [
            ['Cleanup', 'get', '/', 200, function (s, rq, rs, next) {
               (async function () {
                  // Cleanup before auth suite
                  var testUserId = await redis ('get', 'email:hello@example.com');
                  await redis ('del', 'invite:hello@example.com', 'email:hello@example.com', 'rateLimit:login:foo@example.com', 'rateLimit:verify:foo@example.com', 'rateLimit:login:hello@example.com', 'rateLimit:verify:hello@example.com', 'user:' + testUserId);
                  next ();
               }) ();
            }],
            ['Get auth/csrf without session', 'get', 'auth/csrf', '*', function (s, rq, rs) {
               return assert ([
                  ['code', rs.code, CONFIG.cloud ? 403 : 200, teishi.test.equal],
                  ['body', rs.body, CONFIG.cloud ? {error: 'No session'} : {mode: 'local'}, teishi.test.equal],
               ]);
            }],
            dale.go (['/auth/signup/request', 'auth/signup/accept', '/auth/login', '/auth/verify'], function (path) {
               if (CONFIG.cloud) return [
                  ['Call auth path without email', 'post', path, {user: 'whatever'}, 400, assertBody ({error: 'email should have as type string but instead is undefined with type undefined'}), path === 'auth/signup/accept' ? adminHeaders : {}],
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
                     }, path === 'auth/signup/accept' ? adminHeaders : {}];
                  }),
               ];

               if (! CONFIG.cloud) return ['Call auth path in local mode', 'post', path, 404, assertBody ({error: 'Not in cloud mode'})];
            }),
            CONFIG.cloud ? [
               ['Request invite', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Request invite again', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Accept invite', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 200, adminHeaders],
               ['Accept invite again', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 409, adminHeaders],
               ['Accept invite for nonexisting account', 'post', 'auth/signup/accept', {email: 'foo@example.com'}, 404, adminHeaders],
               ['Request invite after account is created', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 409],
               ['Login with no such email', 'post', 'auth/login', {email: 'foo@example.com'}, 403, assertBody ({error: 'No such email'})],
               ['Login', 'post', 'auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.otp = rs.body.otp;
                  return true;
               }],
               ['Verify login (no such email)', 'post', 'auth/verify', {email: 'foo@example.com', otp: '123456'}, 403, assertBody ({error: 'No such email'})],
               ['Verify login (malformed otp)', 'post', 'auth/verify', {email: 'hello@example.com', otp: 123456}, 400, assertBody ({error: 'otp should have as type string but instead is 123456 with type integer'})],
               ['Verify login (invalid otp)', 'post', 'auth/verify', {email: 'hello@example.com', otp: '123456'}, 403, assertBody ({error: 'Invalid OTP', otp: '123456'})], // This test fails about once every million times
               ['Verify login', 'post', 'auth/verify', function (s) {return {email: 'hello@example.com', otp: s.otp}}, 200, function (s, rq, rs) {
                  if (! assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="[a-f0-9]{64}"; HttpOnly; SameSite=Lax; Path=\\/; Expires=.+' + (parseInt (new Date ().toISOString ().slice (0, 4)) + 10)), teishi.test.match],
                     ['csrf token', rs.body.csrf, 'string']
                  ])) return false;
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Get csrf token', 'get', 'auth/csrf', 200, function (s, rq, rs) {
                  return assert (['body', rs.body, {csrf: s.headers ['x-csrf']}, teishi.test.equal]);
               }],
               ['Logout', 'post', 'auth/logout', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; SameSite=Lax'), teishi.test.match],
                  ]);
               }],
               ['Logout again', 'post', 'auth/logout', {}, 403, assertBody ({error: 'Invalid session'})],
               dale.go (dale.times (5), function (v) {
                  return ['Login buildup for rate limit #' + (v + 1), 'post', 'auth/login', {email: 'hello@example.com'}, 200];
               }),
               ['Login rate limited', 'post', 'auth/login', {email: 'hello@example.com'}, 403, function (s, rq, rs, next) {
                  if (! assert (['body', rs.body, {error: 'Rate limited'}, teishi.test.equal])) return false;
                  (async function () {
                     await redis ('del', 'rateLimit:login:hello@example.com');
                     next ();
                  }) ();
               }],
               dale.go (dale.times (4), function (v) {
                  return ['Login buildup for almost rate limit #' + (v + 1), 'post', 'auth/login', {email: 'hello@example.com'}, 200];
               }),
               ['Login', 'post', 'auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.otp = rs.body.otp;
                  return true;
               }],
               ['Verify login', 'post', 'auth/verify', function (s) {return {email: 'hello@example.com', otp: s.otp}}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Login again also OK (rate limit resetted by successful verify)', 'post', 'auth/login', {email: 'hello@example.com'}, 200],
               dale.go (dale.times (5), function (v) {
                  return ['Login verify buildup for rate limit #' + (v + 1), 'post', 'auth/verify', {email: 'hello@example.com', otp: 'foo'}, 403, assertBody ({error: 'Invalid OTP', otp: 'foo'})];
               }),
               ['Verify login rate limited', 'post', 'auth/verify', {email: 'hello@example.com', otp: 'foo'}, 403, function (s, rq, rs, next) {
                  if (! assert (['body', rs.body, {error: 'Rate limited'}, teishi.test.equal])) return false;
                  (async function () {
                     await redis ('del', 'rateLimit:verify:hello@example.com');
                     next ();
                  }) ();
               }],

               ['Private route with invalid session', 'post', 'auth/logout', {}, 403, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; SameSite=Lax'), teishi.test.match],
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                  ]);
               }, {cookie: CONFIG.cookie.name + '="foo"'}],
               ['Private route with no session', 'post', 'auth/logout', {}, 403, assertBody ({error: 'No session'}), {cookie: ''}],
               ['Public route with invalid session', 'get', '/', 200, {cookie: CONFIG.cookie.name + '="foo"'}],
               ['Private route with invalid csrf token', 'post', 'auth/logout', {}, 403, assertBody ({error: 'Invalid csrf token'}), {'x-csrf': 'foo'}],
               ['Public route with invalid csrf token', 'post', 'error', {hi: 'there'}, 200],
               ['Accept invite without being admin', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 403, {'x-test': 0}],
               ['Login again (second session)', 'post', 'auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.otp = rs.body.otp;
                  return true;
               }],
               ['Verify second login', 'post', 'auth/verify', function (s) {return {email: 'hello@example.com', otp: s.otp}}, 200, function (s, rq, rs) {
                  // Store old and new session
                  s.sessions = [{cookie: s.headers.cookie, csrf: s.headers ['x-csrf']}, {cookie: getCookie (rs.headers), csrf: rs.body.csrf}];
                  // Update csrf token but not cookie so there's a mismatch for the next test
                  s.headers ['x-csrf'] = s.sessions [1].csrf;
                  return true;
               }],
               ['Private route with mismatched csrf token', 'post', 'auth/logout', {}, 403, assertBody ({error: 'Invalid csrf token'})],
               ['Public route with mismatched csrf token', 'post', 'error', {hi: 'there'}, 200, function (s, rq, rs) {
                  // Restore correct csrf token
                  s.headers ['x-csrf'] = s.sessions [0].csrf;
                  return true;
               }],

               // *** SESSION LIST & DELETE ***

               ['List sessions', 'get', 'auth/list', 200, function (s, rq, rs) {
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
               ['List sessions (one expired)', 'get', 'auth/list', 200, function (s, rq, rs) {
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
               ['List sessions with expired session', 'get', 'auth/list', 403, function (s, rq, rs) {

                  // Switch to active session
                  s.headers.cookie     = s.sessions [0].cookie;
                  s.headers ['x-csrf'] = s.sessions [0].csrf;

                  return assert ([
                     ['body', rs.body, {error: 'Invalid session'}, teishi.test.equal],
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; SameSite=Lax'), teishi.test.match],
                  ]);
               }],
               ['Delete account', 'post', 'auth/delete', {}, 200, function (s, rq, rs) {
                  return assert ([
                     ['cookie', getCookie (rs.headers), 'string'],
                     ['cookie', getCookie (rs.headers), new RegExp (CONFIG.cookie.name + '="false"; HttpOnly; SameSite=Lax'), teishi.test.match],
                  ]);
               }],
               ['List sessions after delete', 'get', 'auth/list', 403, assertBody ({error: 'Invalid session'})],
               ['Login after delete', 'post', 'auth/login', {email: 'hello@example.com'}, 403, assertBody ({error: 'No such email'})],
               ['Signup request after delete', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Cleanup', 'get', '/', 200, function (s, rq, rs, next) {
                  (async function () {
                     // Cleanup before auth suite
                     var testUserId = await redis ('get', 'email:hello@example.com');
                     await redis ('del', 'invite:hello@example.com', 'email:hello@example.com', 'rateLimit:login:foo@example.com', 'rateLimit:verify:foo@example.com', 'rateLimit:login:hello@example.com', 'rateLimit:verify:hello@example.com', 'user:' + testUserId);
                     next ();
                  }) ();
               }],
            ] : [
               ['Logout', 'post', 'auth/logout', {}, 404, assertBody ({error: 'Not in cloud mode'})],
               ['List sessions', 'post', 'auth/list', {}, 404, assertBody ({error: 'Not in cloud mode'})],
            ],
         ];

         suites.project = [
            CONFIG.cloud ? [
               ['Signup request for invite', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Accept invite', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 200, adminHeaders],
               ['Login', 'post', 'auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.otp = rs.body.otp;
                  return true;
               }],
               ['Verify login', 'post', 'auth/verify', function (s) {return {email: 'hello@example.com', otp: s.otp}}, 200, function (s, rq, rs) {
                  s.headers.cookie = getCookie (rs.headers);
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
            ] : [],
            ['List projects before creation', 'get', 'projects', 200, assertBody ([])],
            ['Create project without a name', 'post', 'project', {}, 400, assertBody ({error: 'name should have as type string but instead is undefined with type undefined'})],
            ['Create project', 'post', 'project', {name: 'el norte'}, 200],
            ['List projects after creation', 'get', 'projects', 200, function (s, rq, rs) {
               if (! assert (['length', rs.body.length, 1, teishi.test.equal])) return false;
               s.projectId = rs.body [0].id;
               return true;
            }],
            ['Create a second project with the same name', 'post', 'project', {name: 'el norte'}, 409, assertBody ({error: 'There is already a project with that name'})],
            ['Create a second project with another name', 'post', 'project', {name: 'second'}, 200],
            ['List projects after second project creation', 'get', 'projects', 200, function (s, rq, rs) {
               console.log (rs.body);
               if (! assert (['length', rs.body.length, 2, teishi.test.equal])) return false;
               if (rs.body [0].last < rs.body [1].last) return validationError = 'Last project should come first' && false;
               s.secondProjectId = rs.body [0].id;
               return true;
            }],
            ['Delete project', 'delete', function (s) {return 'project/' + s.secondProjectId}, 200],
            ['List projects after second project deletion', 'get', 'projects', 200, function (s, rq, rs) {
               return assert (['length', rs.body.length, 1, teishi.test.equal]);
            }],
            ['Rename project', 'put', 'project', {name: 'el norte'}, 400, assertBody ({error: 'id should have as type string but instead is undefined with type undefined'})],
            ['Rename project (noop)', 'put', 'project', function (s) {return {id: s.projectId, name: 'el norte'}}, 200],
            ['Rename project', 'put', 'project', function (s) {return {id: s.projectId, name: 'el norte!'}}, 200],
            ['List projects after rename', 'get', 'projects', 200, function (s, rq, rs) {
               return assert ([
                  ['length', rs.body.length, 1, teishi.test.equal],
                  function () {return [
                     ['project id', rs.body [0].id, s.projectId, teishi.test.equal],
                     ['project name', rs.body [0].name, 'el norte!', teishi.test.equal],
                  ]}
               ]);
            }],
            ['List files', 'post', 'project/run', function (s) {return {id: s.projectId, command: 'find . -type f -not -path \'./.git/*\''}}, 200, assertBody ({stdout: './doc/main.md\n'})],
            ['Get file that is not there', 'post', 'project/read', function (s) {return {id: s.projectId, path: 'doc/whatevs.md'}}, 404],
            ['Get main file', 'post', 'project/read', function (s) {return {id: s.projectId, path: 'doc/main.md'}}, 200, assertBody ('# el norte')],
            ['Edit main file', 'post', 'project/edit', function (s) {return {id: s.projectId, path: 'doc/main.md', oldText: 'el norte', newText: 'El Norte!'}}, 200, function (s, rq, rs) {
               return assert ([
                  ['keys', dale.keys (rs.body), ['sha'], 'eachOf', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ]);
            }],
            ['Get main file after edit', 'post', 'project/read', function (s) {return {id: s.projectId, path: 'doc/main.md'}}, 200, assertBody ('# El Norte!')],
            ['Edit main file (noop)', 'post', 'project/edit', function (s) {return {id: s.projectId, path: 'doc/main.md', oldText: 'Norte!', newText: 'Norte!'}}, 200, assertBody ({})],
            ['Overwrite file', 'post', 'project/write', function (s) {return {id: s.projectId, path: 'doc/main.md', content: '# el norte'}}, 200, function (s, rq, rs) {
               return assert ([
                  ['keys', dale.keys (rs.body), ['sha'], 'eachOf', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ]);
            }],
            ['Overwrite file (noop)', 'post', 'project/write', function (s) {return {id: s.projectId, path: 'doc/main.md', content: '# el norte'}}, 200, assertBody ({})],
            ['Run a command with pipe', 'post', 'project/run', function (s) {return {id: s.projectId, command: 'cat doc/main.md | grep norte'}}, 200, assertBody ({stdout: '# el norte\n'})],
            ['Run a command with change and output', 'post', 'project/run', function (s) {return {id: s.projectId, command: 'echo foo > doc/another.md && cat doc/another.md'}}, 200, function (s, rq, rs) {
               return assert ([
                  ['keys', dale.keys (rs.body), ['stdout', 'sha'], 'eachOf', teishi.test.equal],
                  ['stdout', rs.body.stdout, 'foo\n', teishi.test.equal],
                  ['sha', rs.body.sha, 'string'],
                  function () {return [
                     ['sha', rs.body.sha, /[0-9a-f]{40}/, teishi.test.match]
                  ]}
               ]);
            }],

            CONFIG.cloud ? ['Delete account', 'post', 'auth/delete', {}, 200] : [],
         ];

         suites.all = Object.values (suites);

         hitit.seq ({port: CONFIG.port, headers: {'x-test': '1'}}, suites [suite], function (error, rdata) {
            if (error) {
               error = {
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
            ['auth.csrf', B.get ('auth', 'csrf'), undefined, teishi.test.equal],
            ['view', B.get ('view'), 'login', teishi.test.equal],
            ['inputs present', c ('input').length, 1, teishi.test.equal],
         ]);
      }],
      ['Login as hello@example.com', function (next) {
         var input = c ('input') [0];
         input.value = 'hello@example.com';
         c.fire (input, 'input');

         find ('button', 'Request code').click ();
         next (1000, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['snackbar type', snackbar.type, 'error', teishi.test.equal],
            ['snackbar message', snackbar.message, 'No such email', teishi.test.equal],
         ]);
      }],
      ['Go to signup page', function (next) {
         find ('a', 'Need an invite').click ();
         next (1000, 1);
      }, function () {
         return assert ([
            ['view', B.get ('view'), 'signup', teishi.test.equal],
            ['inputs present', c ('input').length, 1, teishi.test.equal],
         ]);
      }],
      ['Request invite as hello@example.com', function (next) {
         var input = c ('input') [0];
         input.value = 'hello@example.com';
         c.fire (input, 'input');

         find ('button', 'Request invite').click ();
         next (1000, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['snackbar type', snackbar.type, 'ok', teishi.test.equal],
            ['snackbar message', snackbar.message, 'Invite requested. Thank you for your interest!', teishi.test.equal],
         ]);
      }],
      ['Go to login page', function (next) {
         find ('a', 'Already have access? Log in').click ();

         B.call ('post', 'auth/signup/accept', {email: 'hello@example.com'}, function (x, error, rs) {
            if (error) return B.call (x, 'snackbar', 'error', 'Could not accept invite');
            next (1000, 1);
         });
      }, function () {
         return assert ([
            ['view', B.get ('view'), 'login', teishi.test.equal],
            ['inputs present', c ('input').length, 1, teishi.test.equal],
            ['input still retains email after switching view', (c ('input') [0] || {}).value, 'hello@example.com', teishi.test.equal],
         ]);
      }],
      ['Login after invite accepted', function (next) {
         find ('button', 'Request code').click ();
         next (1000, 1);
      }, function () {
         return assert ([
            ['otp', B.get ('test', 'otp'), 'string'],
         ]);
      }],
      ['Enter wrong OTP and see failed login', function (next) {
         var input = c ('input') [1];
         input.value = 'xxxxxx';
         c.fire (input, 'input');

         find ('button', 'Verify').click ();
         next (1000, 1);
      }, function () {
         var snackbar = B.get ('snackbar') || {};
         return assert ([
            ['snackbar type', snackbar.type, 'error', teishi.test.equal],
            ['snackbar message', snackbar.message, 'Invalid code', teishi.test.equal],
         ]);
      }],
      ['Enter OTP and verify login', function (next) {
         var input = c ('input') [1];
         input.value = B.get ('test', 'otp');
         c.fire (input, 'input');

         find ('button', 'Verify').click ();
         next (1000, 1);
      }, function () {
         return assert ([
            ['otp', B.get ('auth', 'otp'), 'undefined'],
            ['view', B.get ('view'), 'projects', teishi.test.equal],
         ]);
      }],
   ];

   suites.project = [
   ];

   c.test (Object.values (suites).flat (), function (error, time) {
      if (error) {
         error.validationError = validationError;
         console.log ('Test error', error);
         B.call ('snackbar', 'error', JSON.stringify (error));
      }
      else {
         console.log ('All tests OK');
         B.call ('snackbar', 'ok', 'All tests passed in ' + time + 'ms');
      }

      B.call ('rem', [], 'test');
   });
}
