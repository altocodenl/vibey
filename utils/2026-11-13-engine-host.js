// Sets the `engine` field to `host` on every project hash that has no engine. Run it from the directory that holds config.4tx, as server.js does:
//    docker exec -i vibey-host node - < utils/2026-11-13-engine-host.js

var fs = require ('fs');
var util = require ('util');
var cell = require (process.cwd () + '/cell.js');

var CONFIG = cell.textToJS (fs.readFileSync ('config.4tx', 'utf8'));
var Redis = require (process.cwd () + '/node_modules/redis').createClient ({db: CONFIG.redis?.db});

var redis = function (command, ... args) {
   return util.promisify (Redis [command].bind (Redis)).apply (null, args);
}

(async function () {
   var keys = await redis ('keys', 'project:*');
   var set = 0;
   for (var key of keys) {
      set += await redis ('hsetnx', key, 'engine', 'host');
   }
   console.log ('Set engine to host on ' + set + ' of ' + keys.length + ' projects in redis db ' + (CONFIG.redis?.db || 0));
   Redis.quit ();
}) ().catch (function (error) {
   console.error (error);
   process.exit (1);
});
