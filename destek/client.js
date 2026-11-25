// *** SETUP ***

var B = window.B;

var type = teishi.type, inc = teishi.inc, style = lith.css.style, clog = console.log;

// *** HELPERS ***

var ago = function (date) {
   var ms = teishi.time () - new Date (date).getTime ();
   if (ms < 0) return '';
   if (ms < 1000) return 'now';
   if (ms < 60 * 1000) return Math.round (ms / 1000) + 's ago';
   if (ms < 60 * 60 * 1000) return Math.floor (ms / (60 * 1000)) + 'm ago';
   if (ms < 24 * 60 * 60 * 1000) return Math.floor (ms / (60 * 60 * 1000)) + 'h ago';
   if (ms < 30 * 24 * 60 * 60 * 1000) return Math.floor (ms / (24 * 60 * 60 * 1000)) + 'd ago';
   if (ms < 12 * 30 * 24 * 60 * 60 * 1000) return Math.floor (ms / (30 * 24 * 60 * 60 * 1000)) + 'mo ago';
   return Math.floor (ms / (365 * 24 * 60 * 60 * 1000)) + 'y ago';
}

var quote = function (text) {
   return "'" + text.replace (/'/g, "''") + "'";
}

var toSQL = function (query) {
   var terms = query.match (/(?:[^\s"]+|"[^"]*")+/g) || [];
   var conditions = dale.go (terms, function (term) {
      var match = term.match (/^([\w.-]+):(.+)$/);
      var field = match ? match [1] : undefined;
      var value = (match ? match [2] : term).replace (/"/g, '');
      var column = ! field ? 'raw' : (field === 'tag' ? 'value' : "json_extract (fields, '$.\"" + field + "\"')");
      var condition = 'instr (' + (value === value.toLowerCase () ? 'lower (' + column + ')' : column) + ', ' + quote (value) + ') > 0';
      return field === 'tag' ? 'EXISTS (SELECT 1 FROM json_each (tags) WHERE ' + condition + ')' : condition;
   });
   return 'SELECT * FROM logs' + (conditions.length ? ' WHERE ' + conditions.join (' AND ') : '') + ' ORDER BY t DESC';
}

// *** NATIVE RESPONDERS ***

window.addEventListener ('hashchange', function () {
   B.call ('read', 'hash');
});

// *** RESPONDERS ***

B.mrespond ([

   ['get', '*', function (x, cb) {
      c.ajax ('get', x.path [0], {}, '', function (error, rs) {
         cb (x, error, rs);
      });
   }],

   ['read', 'hash', function (x) {
      B.call (x, 'set', 'query', decodeURIComponent (window.location.hash.slice (1)));
   }],

   ['change', 'query', function (x) {
      var query = B.get ('query') || '';
      history.replaceState (null, '', query ? '#' + encodeURIComponent (query) : window.location.pathname + window.location.search);
      B.call (x, 'query', 'logs');
   }],

   ['query', 'logs', function (x) {
      var query = B.get ('query') || '';
      var sql = /^\s*(select|with)\b/i.test (query) ? query : toSQL (query);
      B.call (x, 'get', '/log?limit=100&query=' + encodeURIComponent (sql), function (x, error, rs) {
         if (query !== (B.get ('query') || '')) return;
         if (error) return B.call (x, 'set', 'error', (teishi.parse (error.responseText) || {}).error || error.responseText);
         B.call (x, 'rem', [], 'error');
         B.call (x, 'set', 'logs', rs.body.rows);
         B.call (x, 'set', 'next', rs.body.next);
      });
   }],
]);

// *** VIEWS ***

var css = {
   colors: {
      dborder:   '#2a3550',
      dfield:    '#94b8ff',
      dgray:     '#9aa4bf',
      dinput:    '#0d1424',
      dmidnight: '#141b2d',
      dred:      '#ff7a75',
      dstripe:   '#1a2338',
      dtext:     '#e6e9f2',
   },
}

css.style = [

   // *** BODY ***

   ['body', {
      'background-color': css.colors.dmidnight,
      color: css.colors.dtext,
      margin: 0,
   }],

   // *** COLORS ***

   dale.go (css.colors, function (color, name) {
      return [
         ['.bg-' + name, {'background-color': color}],
         ['.' + name, {color: color}],
         ['.b--' + name, {'border-color': color}],
      ];
   }),

   // *** QUERY ***

   ['.outline-0:focus', {outline: 'none'}],
   ['.query:focus', {'border-color': css.colors.dfield}],
   ['.query::placeholder', {color: css.colors.dgray}],

   // *** TABLE ***

   ['.logs .stripe', {'background-color': css.colors.dstripe}],
   ['.logs .row:hover', {'background-color': css.colors.dborder}],
   ['.text', {
      'max-width': '30ch',
      'overflow-wrap': 'anywhere',
      width: 'max-content',
   }],
]

var views = {};

views.value = function (value) {
   if (type (value) === 'array' && dale.stop (value, false, function (v) {return ! inc (['array', 'object'], type (v))}) !== false) return dale.go (value, function (v) {
      return ['span', {class: 'bg-dborder br-pill dfield dib mb1 mr1 ph2 pv1'}, v];
   });
   if (type (value) === 'array' && value.length && dale.stop (value, false, function (v) {return type (v) === 'object'}) !== false) {
      var keys = [];
      dale.go (value, function (v) {
         dale.go (v, function (v2, k) {
            if (! inc (keys, k)) keys.push (k);
         });
      });
      keys.sort (function (a, b) {
         return a.toLowerCase ().localeCompare (b.toLowerCase ());
      });
      return ['table', {class: 'b--dborder ba collapse'}, [
         ['tr', dale.go (keys, function (k) {
            return ['th', {class: 'b--dborder bb dgray fw4 ph2 pv1 tl'}, k];
         })],
         dale.go (value, function (v) {
            return ['tr', dale.go (keys, function (k) {
               return ['td', {class: 'b--dborder bb ph2 pv1 v-top'}, views.value (v [k])];
            })];
         }),
      ]];
   }
   if (type (value) === 'array') return dale.go (value, function (v) {
      return ['div', {class: 'mb1'}, views.value (v)];
   });
   if (type (value) === 'object') return views.value ([value]);
   return ['div', {class: 'text'}, value];
}

views.main = function () {
   return ['div', {class: 'pa4 sans-serif'}, [
      ['style', css.style],
      B.view ('query', function (query) {
         return ['input', {
            autofocus: true,
            class: 'b--dborder ba bg-dinput br2 code dtext f4 mb3 outline-0 pa3 query w-100',
            oninput: B.ev ('set', 'query'),
            placeholder: 'tag:nginx status:500 "hello there" — or SELECT ...',
            value: query,
         }];
      }),
      B.view ([['error'], ['logs'], ['show', 'raw']], function (error, logs, showRaw) {
         if (error) return ['pre', {class: 'dred f6'}, error];
         if (! logs || ! logs.length) return ['div', {class: 'dgray'}, 'No results'];
         var hasRaw = inc (dale.keys (logs [0]), 'raw');
         var columns = dale.fil (dale.keys (logs [0]), undefined, function (column) {
            if (! inc (['day', 'fields', 'id', 'raw'], column)) return column;
         });
         var fields = dale.go (logs, function (log) {
            var parsed = type (log.fields) === 'string' ? teishi.parse (log.fields) : log.fields;
            return type (parsed) === 'object' ? parsed : {};
         });
         var cell = function (column, value) {
            if (column === 't') return ['td', {class: 'nowrap pa2 v-top', title: value}, ago (value)];
            if (column === 'tags' && type (value) === 'string' && type (teishi.parse (value)) === 'array') value = teishi.parse (value);
            return ['td', {class: 'pa2 v-top'}, views.value (value)];
         }
         return ['div', [
            hasRaw ? ['label', {class: 'db dgray f6 mb2 pointer'}, [
               ['input', {
                  checked: showRaw,
                  class: 'mr2',
                  onchange: B.ev ('set', ['show', 'raw'], {raw: 'this.checked'}),
                  type: 'checkbox',
               }],
               'Show raw',
            ]] : '',
            ['div', {class: 'code f6 logs'}, dale.go (logs, function (log, k) {
               var fieldColumns = dale.keys (fields [k]).sort (function (a, b) {
                  return a.toLowerCase ().localeCompare (b.toLowerCase ());
               });
               return ['table', {class: 'collapse mb2' + (k % 2 ? ' stripe' : '')}, [
                  ['tr', dale.go (columns.concat (fieldColumns, showRaw && hasRaw ? ['raw'] : []), function (column) {
                     return ['th', {class: 'b--dborder bb bt dfield fw6 pa2 tl'}, column];
                  })],
                  ['tr', {class: 'row'}, [
                     dale.go (columns, function (column) {
                        return cell (column, log [column]);
                     }),
                     dale.go (fieldColumns, function (column) {
                        return cell (undefined, fields [k] [column]);
                     }),
                     showRaw && hasRaw ? cell ('raw', log.raw) : '',
                  ]],
               ]];
            })],
         ]];
      }),
   ]];
}

// *** ENTRYPOINT ***

B.mount ('body', views.main);
B.call ('read', 'hash');
