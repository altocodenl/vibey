var mode = typeof window === 'undefined' ? 'server' : 'client';

var h = require ('hitit');

var suites = {};

h.one ({port: 5353}, {path: 'auth/csrf', code: '*', apres: function (s, rq, rs) {
   console.log (rs.body);
}});;


/*
- public routes
*/

/*
 auth: signup, login, verify, logout
 access: public routes, private routes
 invalid csrf
*/
//suite.auth =
