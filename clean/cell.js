// *** CELL (for logging, taken from github.com/altocodenl/cell) ***

if (typeof window !== 'undefined') {
   var dale = window.dale;
   var teishi = window.teishi;
   var cell = window.cell = {};
}
else {
   var dale = require ('dale');
   var teishi = require ('teishi');
   var cell = module.exports;
}

var {inc, last, type} = teishi;

var cell = typeof exports === 'object' ? module.exports : {};

cell.unparseElement = function (v) {
   if (v === null) return ' ';
   if (type (v) !== 'string') return v + '';
   if (v.length === 0) return '""';

   if (v.match (/^-?(\d+\.)?\d+$/) !== null) return '"' + v + '"';
   if (v.match ('"') || v.match (/\s/)) {
      return '"' + v.replace (/\//g, '//').replace (/"/g, '/"') + '"';
   }
   return v;
}

cell.sorter = function (paths) {

   var compare = function (v1, v2) {
      if (v1 === v2) return 0;
      var types = [type (v1) === 'string' ? 'text' : 'number', type (v2) === 'string' ? 'text' : 'number'];
      if (types [0] !== types [1]) return types [0] === 'number' ? -1 : 1;
      if (types [0] === 'number') return v1 - v2;

      if (v1 === '=' && v2 === ':') return -1;
      if (v1 === ':' && v2 === '=') return 1;

      return v1 < v2 ? -1 : 1;
   }

   return paths.sort (function (a, b) {
      var result = dale.stopNot (dale.times (Math.min (a.length, b.length), 0), 0, function (k) {
         return compare (a [k], b [k]);
      }) || 0;
      return result !== 0 ? result : a.length - b.length;
   });
}

cell.pathsToText = function (paths) {

   var spaces = function (n) {
      return Array (n).fill (' ').join ('');
   }

   var output = [];

   var pathToText = function (path, prefixIndent) {
      var indentCount = 0;
      return dale.go (path, function (step) {
         step = cell.unparseElement (step);
         if (! step.match (/\n/)) {
            indentCount += step.length + 1;
            return step;
         }
         return dale.go (step.split (/\n/), function (line, k) {
            if (k === 0) {
               indentCount++;
               return line;
            }
            var indent = line.length === 0 ? '' : spaces (indentCount);
            if (k === step.split (/\n/).length - 1) {
               indentCount += line.length + 1;
            }
            return (prefixIndent || '') + indent + line;
         }).join ('\n');
      }).join (' ');
   }

   dale.go (paths, function (path, k) {
      var commonPrefix = [];
      if (k > 0) dale.stop (paths [k - 1], false, function (v, k) {
         if (v === path [k]) commonPrefix.push (v);
         else return false;
      });
      if (commonPrefix.length === 0) return output.push (pathToText (path));

      var prefixIndent = spaces (pathToText (commonPrefix).length + 1);
      output.push (prefixIndent + pathToText (path.slice (commonPrefix.length), prefixIndent));
   });

   return output.join ('\n');
}

cell.JSToPaths = function (v) {

   var paths = [];

   var singleToFourdata = function (v) {
      var Type = type (v);
      if (teishi.inc (['integer', 'float', 'string'], Type)) return v;
      if (Type === 'boolean') return v ? 1 : 0;
      if (Type === 'date') return v.toISOString ();
      if (teishi.inc (['regex', 'function', 'infinity'], Type)) return v.toString ();
      return '';
   }

   var recurse = function (v, path) {
      if (v === undefined) return;
      if (teishi.simple (v)) paths.push ([... path, singleToFourdata (v)]);
      else                   dale.go (v, function (v2, k2) {
         recurse (v2, [... path, type (k2) === 'integer' ? k2 + 1 : k2]);
      });
   }

   recurse (v, [])

   return cell.sorter (paths);
}

cell.JSToText = function (text) {
   return cell.pathsToText (cell.JSToPaths (text));
}
