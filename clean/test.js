var mode = typeof window === 'undefined' ? 'server' : 'client';

if (mode === 'server') {

   // *** SETUP ***

   var dale   = require ('dale');
   var teishi = require ('teishi');
   var hitit  = require ('hitit');
   var {inc, last, type} = teishi;

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

         // *** PUBLIC ***

         suites.public = dale.go ([
            ['get', '/'],
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

         // *** ERROR REPORTING ***

         suites.error = [
            ['Submit error: object', 'post', 'error', {error: 'Opa'}, 200],
            ['Submit error: array', 'post', 'error', ['error', 'Opa'], 200],
            ['Submit error: string', 'post', 'error', 'There was a problem...', 200],
         ];

         // *** AUTH ***

         suites.auth = [
            ['Dummy request for doing cleanup in apres', 'get', '/', 200, function (s, rq, rs, next) {
               (async function () {
                  // Cleanup before auth suite
                  var testUserId = await redis ('get', 'email:hello@example.com');
                  await redis ('del', 'invite:hello@example.com', 'email:hello@example.com', 'user:' + testUserId);
                  next ();
               }) ();
            }],
            ['Get auth/csrf without session', 'get', 'auth/csrf', '*', function (s, rq, rs) {
               return assert ([
                  ['code', rs.code, CONFIG.cloud ? 403 : 200, teishi.test.equal],
                  ['body', rs.body, CONFIG.cloud ? {error: 'No session'} : {mode: 'local'}, teishi.test.equal],
               ]);
            }],
            dale.go (['/auth/signup/request', '/auth/login', '/auth/verify'], function (path) {
               if (CONFIG.cloud) return [
                  ['Call auth path without email', 'post', path, {user: 'whatever'}, 400, function (s, rq, rs) {
                     return assert (['body', rs.body, {error: 'email should have as type string but instead is undefined with type undefined'}, teishi.test.equal]);
                  }],
                  dale.go ([1, '1', 'a@a', 'this@is.not.really.an.emai.l'], function (email, k) {
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
                     }];
                  }),
               ];

               /*
                login
                verify
                logout
                delete
                */

               if (! CONFIG.cloud) return ['Call auth path in local mode', 'post', path, 404, function (s, rq, rs) {
                  return assert (['body', rq.body, {error: 'Not in cloud mode'}, teishi.test.equal]);
               }];
            }),
            CONFIG.cloud ? [
               ['Request invite', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Request invite again', 'post', 'auth/signup/request', {email: 'hello@example.com'}, 200],
               ['Accept invite', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 200, adminHeaders],
               ['Accept invite again', 'post', 'auth/signup/accept', {email: 'hello@example.com'}, 409, adminHeaders],
               ['Login', 'post', 'auth/login', {email: 'hello@example.com'}, 200, function (s, rq, rs) {
                  s.otp = rs.body.otp;
                  return true;
               }],
               ['Verify', 'post', 'auth/verify', function (s) {return {email: 'hello@example.com', otp: s.otp}}, 200, function (s, rq, rs) {
                  s.headers.cookie = rs.headers ['set-cookie'];
                  return true;
               }],
               ['Get csrf token', 'get', 'auth/csrf', 200, function (s, rq, rs) {
                  s.headers ['x-csrf'] = rs.body.csrf;
                  return true;
               }],
               ['Logout', 'post', 'auth/logout', 200],
               ['Logout again', 'post', 'auth/logout', {}, 403],
            ] : [],
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

/*
- public routes
*/

/*
 auth: signup, login, verify, logout
 access: public routes, private routes
 invalid csrf
*/
//suite.auth =
