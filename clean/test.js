var mode = typeof window === 'undefined' ? 'server' : 'client';

if (mode === 'server') {

   var dale   = require ('dale');
   var teishi = require ('teishi');
   var hitit  = require ('hitit');
   var {inc, last, type} = teishi;

   module.exports = function (CONFIG) {

      var suites = {};

      var validationError;

      var assert = function (assertion) {
         var result = teishi.v (assertion, true);
         if (result === true) return true;
         validationError = result;
         return false;
      }

      suites.public = dale.go ([
         ['get', '/'],
         ...dale.go (['client', 'gotoB', 'marked'], function (v) {
            return ['get', '/' + v + '.js'];
         }),
         ['post', '/error'],
      ], function (route) {
         if (route [0] === 'get') return ['Get public route: ' + route [1], 'get', route [1], 200];
         return ['Post public route: ' + route [1], 'post', route [1], {test: 'hello'}, 200];
      });

      suites.auth = [
         ['Get auth/csrf without session', 'get', 'auth/csrf', '*', function (s, rq, rs) {
            return assert ([
               ['body', rs.body, 'object'],
               ['code', rs.code, CONFIG.cloud ? 403 : 200, teishi.test.equal]
            ]);
         }]
      ];

      return function (suite, cb) {
         hitit.seq ({port: CONFIG.port}, suites [suite], function (error, rdata) {
            cb (error ? {...error, validationError} : undefined, dale.go (rdata, function (v) {
               return 'OK  ' + v.request.tag;
            }));
         }, function (test) {
            if (type (test) === 'object') return test; // Allow verbose object format
            var noBody = inc (['get', 'delete'], test [1]);
            return {
               tag:    test [0],
               method: test [1],
               path:   test [2],
               body:   noBody ? '' : test [3],
               code:   test [noBody ? 3 : 4],
               apres:  test [noBody ? 4 : 5]
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
