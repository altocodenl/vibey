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

cell.toNumberIfNumber = function (text) {
   if (text.match (/^-?(\d+\.)?\d+$/) !== null) return parseFloat (text);
   return text;
}

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

cell.textToPaths = function (message) {

   var paths = [];
   var insideMultilineText = false;

   if (message === '') return paths;

   var error = dale.stopNot (message.split ('\n'), undefined, function (line) {

      var path = [], originalLine = line, lastPath = teishi.last (paths);

      if ((line.length === 0 || line.match (/^\s+$/)) && ! insideMultilineText) return;

      if (line [0] === ' ' && ! insideMultilineText) {
         if (! lastPath) return 'The first line of the message cannot be indented: `' + line + '`.';
         var indentSize = line.match (/^ +/g) [0].length;
         var matchedSpaces = 0;

         var matchUpTo = dale.stopNot (lastPath, undefined, function (v, k) {
            matchedSpaces += cell.unparseElement (v).length + 1;
            if (matchedSpaces === indentSize) return k;
            if (matchedSpaces > indentSize) return {error: 'The indent of the line `' + line + '` does not match that of the previous line.'};
         });
         if (matchUpTo === undefined) return 'The indent of the line `' + line + '` does not match that of the previous line.';
         if (matchUpTo.error) return matchUpTo.error;

         path = dale.go (lastPath.slice (0, matchUpTo + 1), function (v) {
            return v === '-' ? null : v;
         });
         line = line.slice (matchedSpaces);

         if (line.length === 0) return 'The line `' + originalLine + '` has no data besides whitespace.';
      }

      var dequoter = function (text) {

         var output = {start: -1, end: -1};

         var findNonLiteralQuote = function (text) {
            var index = dale.stopNot (text.split (''), undefined, function (c, k) {
               if (c !== '"') return;
               var slashes = text.slice (0, k + 1).match (/\/{0,}"$/g);
               if ((slashes [0].length - 1) % 2 === 0) return k;
            });
            return index !== undefined ? index : -1;
         }

         var unescaper = function (text) {
            if (! (text.match (/\s/) || text.match (/"/) || insideMultilineText)) return text;

            text = text.replace (/\/"/g, '"');
            var unmatchedSlash;
            dale.go (text.split (''), function (c, k) {
               if (c !== '/') return;
               unmatchedSlash = unmatchedSlash === k - 1 ? undefined : k;
            });
            if (unmatchedSlash !== undefined) return ['error', 'Unmatched slash in text with spaces or double quotes: `' + text + '`'];

            return text.replace (/\/\//g, '/');
         }

         output.start = findNonLiteralQuote (text);

         if (insideMultilineText) {
            if (output.start === -1) output.text = unescaper (text);
            else                     output.text = unescaper (text.slice (0, output.start));
         }
         else {
            if (output.start === -1) output.text = text;
            else {
               var match = findNonLiteralQuote (text.slice (output.start + 1));
               if (match !== -1) output.end = output.start + 1 + match;

               output.text = unescaper (text.slice (output.start + 1, output.end === -1 ? text.length : output.end))
            }
         }

         if (type (output.text) === 'array') return output.text [1];
         return output;
      }

      if (insideMultilineText) {

         if ((line.length > 0 && line.match (/[^\s]/)) && ! line.match (new RegExp ('^ {' + insideMultilineText + '}'))) return 'Missing indentation in multiline text `' + originalLine + '`';
         line = line.slice (insideMultilineText);

         var dequoted = dequoter (line);
         if (type (dequoted) === 'string') return dequoted;
         if (dequoted.start === -1) {
            lastPath [lastPath.length - 1] += dequoted.text + '\n';
            return;
         }
         else {
            lastPath [lastPath.length - 1] += dequoted.text;
            path = lastPath;

            line = line.slice (dequoted.start + 1);
            if (line.length && line [0] !== ' ') return 'No space after a quote in line `' + originalLine + '`';
            line = line.slice (1);
            insideMultilineText = false;
         }
      }

      while (line.length) {
         if (line [0] === ' ') return 'The line `' + originalLine + '` has at least two spaces separating two elements.';

         if (line [0] === '"') {
            var dequoted = dequoter (line);
            if (type (dequoted) === 'string') return dequoted;
            if (dequoted.end === -1) {
               insideMultilineText = dale.acc (path, 0, function (a, v) {
                  v = cell.unparseElement (v);
                  if (! v.match ('\n')) return a + v.length + 1;
                  return a + teishi.last (v.split ('\n')).length + 1 + 1;
               }) + 1;

               path.push (dequoted.text + '\n');
               line = '';
            }
            else {
               path.push (dequoted.text);

               line = line.slice (dequoted.end + 1);
               if (line.length && line [0] !== ' ') return 'No space after a quote in line `' + originalLine + '`';
               line = line.slice (1);
            }
            continue;
         }

         var element = line.split (' ') [0];
         if (element.match (/\s/)) return 'The line `' + line + '` contains a space that should be contained within quotes.';
         if (element.match (/"/)) return 'The line `' + line + '` has an unescaped quote.';

         path.push (cell.toNumberIfNumber (element));
         line = line.slice (element.length + 1);
      }

      if (! paths.includes (path)) paths.push (path);
   });

   if (error) return [['error', error]];
   if (insideMultilineText) return [['error', 'Multiline text not closed: `' + teishi.last (teishi.last (paths)).replace (/\n$/, '') + '`']];

   paths = cell.sorter (cell.dedasher (paths));
   var error = cell.validator (paths);
   return error.length ? error : paths;
}

cell.dedasher = function (paths) {
   dale.go (paths, function (path, pathIndex) {
      dale.go (path, function (step, stepIndex) {
         if (step === null) return paths [pathIndex] [stepIndex] = paths [pathIndex - 1] [stepIndex];
         if (step !== '-') return;
         var lastPath = paths [pathIndex - 1];

         var continuing = lastPath !== undefined && teishi.eq (lastPath.slice (0, stepIndex), path.slice (0, stepIndex)) && type (lastPath [stepIndex]) !== 'string';
         paths [pathIndex] [stepIndex] = continuing ? lastPath [stepIndex] + 1 : 1;
      });
   });
   return paths;
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

cell.validator = function (paths) {

   var seen = {};

   var error = dale.stopNot (paths, undefined, function (path) {

      return dale.stopNot (path, undefined, function (v, k) {
         if (type (v) === 'float' && k + 1 < path.length) return 'A float can only be a final value, but path `' + cell.pathsToText ([path]) + '` uses it as a key.';

         var Type = type (v) === 'string' ? (k + 1 < path.length ? 'hash' : 'text') : (k + 1 < path.length ? 'list' : 'number');

         var seenKey = JSON.stringify (path.slice (0, k));
         if (! seen [seenKey]) seen [seenKey] = Type;
         else {
            if (seen [seenKey] !== Type) return 'The path `' + cell.pathsToText ([path]) + '` is setting a ' + Type + ' but there is already a ' + seen [seenKey] + ' at path `' + cell.pathsToText ([path.slice (0, k)]) + '`';
            if (Type === 'number' || Type === 'text') return 'The path `' + cell.pathsToText ([path]) + '` is repeated.';
         }
      });
   });

   return error ? [['error', error]] : [];
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

// *** JS HELPERS ***

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
      if (teishi.simple (v)) paths.push ([...path, singleToFourdata (v)]);
      else                   dale.go (v, function (v2, k2) {
         recurse (v2, [...path, type (k2) === 'integer' ? k2 + 1 : k2]);
      });
   }

   recurse (v, [])

   return cell.sorter (paths);
}

cell.pathsToJS = function (paths) {

   if (paths.length === 0) return '';

   if (paths.length === 1 && paths [0].length === 1) return paths [0] [0];

   var output = type (paths [0] [0]) === 'string' ? {} : [];

   dale.go (paths, function (path) {
      var target = output;
      dale.go (path, function (step, depth) {
         if (depth + 1 === path.length) return;
         if (type (step) === 'integer') step = step - 1;
         if (depth + 2 < path.length) {
            if (target [step] === undefined) target [step] = type (path [depth + 1]) === 'string' ? {} : [];
            target = target [step];
         }
         else target [step] = path [depth + 1];
      });
   });

   return output;
}

cell.JSToText = function (text) {
   return cell.pathsToText (cell.JSToPaths (text));
}

cell.textToJS = function (text) {
   return cell.pathsToJS (cell.textToPaths (text));
}

