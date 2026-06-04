var CONFIG = {
   cookie: {
      name: 'vibey',
      expires: 7 * 24 * 60 * 60
   },
   redis: {
      db: 0
   }
}

var Redis = require ('redis').createClient ({db: CONFIG.redis.db});

var redis = function (command) {
   // Multi
   if (type (command) === 'array') {
      var m = Redis.multi ();
      dale.go (function (c) {
         m [c [0]].apply (m, c.slice (1));
      });
      return new Promise (function (resolve, reject) {
         m.exec (function (error, results) {
            if (error) reject (error);
            else       resolve (results);
         });
      });
   }
   // Simple
   var args = [].slice.call (arguments, 1);
   return new Promise (function (resolve, reject) {
      Redis [command].apply (Redis, args.concat (function (error, data) {
         if (error) reject (error);
         else       resolve (data);
      }));
   });
}

var routes = [

   ['get', 'auth/csrf', async function (rq, rs) {
      if (! CLOUD) return reply (rs, 200, {mode: 'LOCAL'});

      var sessionId = rq.data.cookie && rq.data.cookie [CONFIG.cookie.name] ? rq.data.cookie [CONFIG.cookiename] : undefined;

      if (! sessionId) return reply (rs, 403, {error: 'session'});

      var userId = await redis ('get', 'session:' + sessionId);
      if (! userId) return reply (rs, 403, {error: 'session'});

      var [user, csrf] = await redis ([
         ['hgetall', 'user:'    + userId],
         ['get',     'csrf:'    + sessionId],
         ['expire',  'session:' + sessionId, CONFIG.cookie.expires],
         ['expire',  'csrf:'    + sessionId, CONFIG.cookie.expires],
      ]);

      if (! user || ! auth) return reply (rs, 500);

      reply (rs, 200, {csrf: csrf});
   }],

];
