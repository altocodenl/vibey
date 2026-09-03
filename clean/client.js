// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

var type = teishi.type, inc = teishi.inc, style = lith.css.style, clog = console.log;

// *** TIME ***

var ago = function (date) {
   ms = teishi.time () - new Date (date).getTime ();
   if (ms < 0) return '';
   if (ms < 1000) return 'now';
   if (ms < 60 * 1000) return Math.floor (ms / 1000) + 's ago';
   if (ms < 60 * 60 * 1000) return Math.floor (ms / (60 * 1000)) + 'm ago';
   if (ms < 24 * 60 * 60 * 1000) return Math.floor (ms / (60 * 60 * 1000)) + 'h ago';
   if (ms < 30 * 24 * 60 * 60 * 1000) return Math.floor (ms / (24 * 60 * 60 * 1000)) + 'd ago';
   if (ms < 12 * 30 * 24 * 60 * 60 * 1000) return Math.floor (ms / (30 * 24 * 60 * 60 * 1000)) + 'mo ago';
   return Math.floor (ms / (365 * 24 * 60 * 60 * 1000)) + 'y ago';
}

// *** NATIVE RESPONDERS ***

window.addEventListener ('hashchange', function () {
   B.call ('read', 'hash');
});

dale.go (['keydown', 'keyup', 'blur'], function (type) {
   window.addEventListener (type, function (ev) {
      B.call (type, '', ev);
   });
});

document.addEventListener ('visibilitychange', function () {
   if (document.hidden || ! B.get ('user', 'loginLinkRequested')) return;
   B.call ('get', '/auth/user', function (x, error, rs) {
      if (error || ! rs.body.csrf) return;
      B.call (x, 'set', 'user', rs.body);
      B.call (x, 'load', 'projects');
      B.call (x, 'navigate', 'projects');
      B.call (x, 'snackbar', 'ok', 'Welcome back to vibey!');
   });
});

window.onerror = async function (message, source, lineno, colno, error) {
   if (type (message) === 'string' && message.indexOf ('ResizeObserver') !== -1) return;

   B.call ('report', 'error', {message, source, lineno, colno, error: (function () {
      if (! (error instanceof Error)) return error;
      return {error: error.name, message: error.message, stack: error.stack.split ('\n')};
   }) ()});
}

// *** RESPONDERS ***

B.mrespond ([

   // *** TEST ***

   ['test', '*', function (x) {
      B.call (x, 'set', 'test', true);
      if (B.get ('user', 'admin')) c.loadScript ('test.js');
   }],

   // *** NAVIGATION ***

   ['navigate', '*', function (x) {
      var hash = '#/' + x.path;
      if (window.location.hash === hash) return B.call (x, 'read', 'hash');
      else                               window.location.hash = '#/' + x.path;
   }],

   ['read', 'hash', function (x) {
      var hash = window.location.hash.slice (2).split ('/');

      var authViews   = ['login', 'verify'];
      var loggedViews = ['projects', 'files'];

      if (! inc (authViews.concat (loggedViews), hash [0])) return B.call (x, 'navigate', 'projects');

      if (hash [0] === 'verify' && hash [1]) return B.call (x, 'verify', hash [1]);

      if (B.get ('user', 'mode') === 'cloud') {
         if (inc (loggedViews, hash [0]) && ! B.get ('user', 'csrf')) return B.call (x, 'navigate', 'login');
         if (inc (authViews,   hash [0]) &&   B.get ('user', 'csrf')) return B.call (x, 'navigate', 'projects');
      }
      else {
         if (inc (authViews, hash [0])) return B.call (x, 'navigate', 'projects');
      }

      if (hash.length > 1 && hash [0] !== 'files') return B.call (x, 'navigate', 'projects');

      if (hash [0] === 'files') {

         if (hash.length === 1) return B.call (x, 'navigate', 'projects');

         var projects = B.get ('projects');
         if (projects && ! dale.stop (projects, true, function (Project) {
            return Project.name === decodeURIComponent (hash [1]);
         })) return B.call (x, 'navigate', 'projects');

         B.call (x, 'set', 'project', decodeURIComponent (hash [1]));

         if (! hash [2]) return B.call (x, 'navigate', 'files/' + hash [1] + '/doc/main.md');

         var file = decodeURIComponent (hash.slice (2).join ('/'));

         var files = B.get ('files');
         if (files && ! dale.stop (files, true, function (f) {
            return f.name === file;
         })) return B.call (x, 'navigate', 'files/' + hash [1] + '/doc/main.md');

         B.call (x, 'set', ['file', 'name'], file);

         B.call (x, 'list', 'files');
      }
      if (hash [0] !== 'files') B.call (x, 'rem', [], 'file');

      B.call (x, 'set', 'view', hash [0]);

      if (inc (loggedViews, hash [0])) {
         B.call (x, 'load', 'projects');
      }
   }],

   ['stop', 'propagation', function (x, ev) {
      ev.stopPropagation ();
   }],

   // *** SNACKBAR ***

   ['snackbar', '*', function (x, message) {
      var type = x.path [0];

      var snackbar = B.get ('snackbar');
      if (snackbar) {
         clearTimeout (snackbar.timeout);
         B.call (x, 'rem', [], 'snackbar');
      }
      if (type === 'clear') return;

      var timeout = setTimeout (function () {
         B.call (x, 'rem', [], 'snackbar');
      }, 4000);

      B.call (x, 'set', 'snackbar', {type: type, message: message, timeout: timeout});
   }],

   // *** AJAX ***

   [/^(get|post|put|delete)$/, '*', function (x, arg1, arg2) {
      var headers = {};
      var body = teishi.inc (['get', 'delete'], x.verb) ? ''   : arg1;
      var cb   = teishi.inc (['get', 'delete'], x.verb) ? arg1 : arg2;

      if (B.get ('user', 'csrf')) headers ['x-csrf'] = B.get ('user', 'csrf');

      if (B.get ('test')) headers ['x-test'] = 1;

      c.ajax (x.verb, x.path [0], headers, body, function (error, rs) {
         if (error) clog (error.responseText);
         if (error && error.status === 403 && x.path [0].indexOf ('/auth/') !== 0) {
            B.call (x, 'set', [], {user: {mode: 'cloud'}, snackbar: B.get ('snackbar'), test: B.get ('test')});
            B.call (x, 'navigate', 'login');
            return;
         }

         if (error && x.path [0] !== '/auth/user') B.call (x, 'report', 'error', {type: 'ajax', method: x.verb, path: x.path [0], status: error.status, response: error.responseText});

         if (cb) {
            if (error) {
               error.body = error.responseText;
               if (teishi.parse (error.body)) error.body = teishi.parse (body);
            }
            cb (x, error, rs);
         }
      });
   }],

   // *** ERROR ***

   ['report', 'error', function (x, error) {
      c.ajax ('post', '/error', {}, {priority: 'important', ...error});
   }],

   // *** AUTH ***

   ['load', 'user', function (x) {

      if (window.location.hash.match (/^#\/verify\/[^\\]+/)) return B.call (x, 'read', 'hash');

      B.call (x, 'get', '/auth/user', function (x, error, rs) {

         if (error && error.status !== 403) return B.call (x, 'snackbar', 'error', 'Error when reaching the server');

         if (error && error.status === 403) {
            B.call (x, 'set', ['user', 'mode'], 'cloud');
            return B.call (x, 'navigate', 'login');
         }

         B.call (x, 'set', 'user', rs.body);
         B.call (x, 'read', 'hash');
      });
   }],

   ['login', '*', function (x) {
      var email = x.path [0];
      if (! email) return B.call (x, 'snackbar', 'error', 'Please enter your email');
      B.call (x, 'post', '/auth/login', {email: email.trim ().toLowerCase ()}, function (x, error, rs) {
         if (error) {
            if (error.responseText) error = (teishi.parse (error.responseText) || {}).error;
            return B.call (x, 'snackbar', 'error', error || 'Failed to send login link');
         }
         B.call (x, 'snackbar', 'ok', 'Login link sent, please check your inbox');
         B.call (x, 'set', ['user', 'loginLinkRequested'], true);

         if (B.get ('test')) B.call (x, 'set', ['test', 'loginLink'], rs.body.loginLink);
      });
   }],

   ['verify', '*', function (x) {
      B.call (x, 'get', '/auth/verify/' + x.path [0], function (x, error, rs) {
         if (error) {
            B.call (x, 'snackbar', 'error', 'Invalid or expired login link');
            return B.call (x, 'navigate', 'login');
         }
         B.call (x, 'set', 'user', rs.body);
         B.call (x, 'load', 'projects');
         B.call (x, 'navigate', 'projects');
         B.call (x, 'snackbar', 'ok', 'Welcome back to vibey!');
      });
   }],

   ['logout', [], function (x) {
      B.call (x, 'post', '/auth/logout', {}, function (x, error) {
         B.call (x, 'set', [], {user: {mode: 'cloud'}, snackbar: B.get ('snackbar'), test: B.get ('test')});
         B.call (x, 'navigate', 'login');
      });
   }],

   // *** PROJECTS ***

   ['load', 'projects', function (x) {
      B.call (x, 'get', '/projects', function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading projects');
         B.call (x, 'set', 'projects', rs.body);
      });
   }],

   ['create', 'project', function (x) {
      var name = B.get ('new', 'project', 'name').trim ();
      if (name.length === 0) return B.call (x, 'snackbar', 'error', 'Please enter a project name');

      B.call (x, 'snackbar', 'ok', 'Creating new project...');
      B.call (x, 'post', '/project', {name: name, slot: B.get ('new', 'project', 'slot')}, function (x, error) {
         if (error) clog (error.body);
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to create project');

         B.call (x, 'snackbar', 'clear');

         B.call (x, 'rem', 'new', 'project');
         B.call (x, 'add', 'projects', {name: name});
         B.call (x, 'navigate', 'files/' + name + '/doc/main.md');
         B.call (x, 'load', 'projects');
      });
   }],

   ['change', ['new', 'project'], {priority: -1000}, function (x) {
      if (B.get ('new', 'project') !== undefined) c ('.new-project-input') [0].focus ();
   }],

   ['edit', 'project', function (x) {
      var edit = B.get ('edit', 'project');
      var name = edit.name.trim ();
      if (! name) return;

      B.call (x, 'put', '/project', {id: edit.id, name: name, slot: edit.slot ? parseInt (edit.slot) : undefined}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to rename project');
         B.call (x, 'rem', 'edit', 'project');
         B.call (x, 'load', 'projects');
         B.call (x, 'snackbar', 'ok', 'Project renamed');
      });
   }],

   ['delete', 'project', function (x, project) {
      if (! confirm ('Delete project "' + project.name + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'project/' + project.id, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to delete project');
         B.call (x, 'load', 'projects');
         B.call (x, 'snackbar', 'ok', 'Project deleted');
      });
   }],

   // *** PROJECTS & FILES ***

   ['change', /^(projects|files)$/, function (x) {
      // To validate if the project or file exists after we load the list of projects or the list of files
      B.call (x, 'read', 'hash');
   }],

   ['keydown', '*', function (x, ev) {

      // Create new project or new file
      if (ev.key === 'Enter') {
         if (B.get ('new', 'project') !== undefined) return B.call (x, 'create', 'project');
         if (B.get ('new', 'file') !== undefined)    return B.call (x, 'create', 'file');
      }

      if (ev.key === 'Meta') return B.call ('set', ['key', 'command'], true);

      var call = function (verb, path, arg) {
         ev.preventDefault ();
         return B.call (x, verb, path, arg);
      }

      if (ev.metaKey && B.get ('user', 'admin')) {
         if (ev.key === 'l') return call ('test', 'all');
      }

      // Shortcuts for inner view
      if (ev.metaKey && B.get ('view') === 'files') {
         if (ev.key === 'b') return call ('navigate', 'projects');
         if (ev.key === 'o') return call ('set', ['settings', 'show'], ! B.get ('settings', 'show'));
         if (B.get ('new', 'file') === undefined) {
            if (ev.key === 'e') return call ('set', ['file', 'mode'], 'edit');
            if (ev.key === 'i') return call ('set', ['file', 'mode'], 'view');
            if (ev.key === 'd') return call ('set', ['new', 'file'], '');
            if (ev.key === 'x') return call ('set', ['file', 'delete'], ! B.get ('file', 'delete'));
            if (ev.key === 'v' && B.get ('file', 'delete')) return call ('delete', 'file', B.get ('file', 'name'));
            if (ev.key === 'j' || ev.key === 'k') {
               var files = B.get ('files'), current = B.get ('file', 'name');
               if (! files || ! files.length) return;
               var index = files.indexOf (current);
               var next = ev.key === 'j' ? index + 1 : index - 1;
               if (next < 0) next = files.length - 1;
               if (next === files.length) next = 0;
               return call ('navigate', 'files/' + B.get ('project') + '/' + files [next]);
            }
         }
         if (B.get ('new', 'file') !== undefined) {
            if (ev.key === 'e') return call ('set', ['new', 'type'], 'doc');
            if (ev.key === 'i') return call ('set', ['new', 'type'], 'dialog');
            if (ev.key === 'x') return call ('rem', 'new', 'file');
            if (ev.key === 'd') return call ('create', 'file');
         }
      }
   }],

   [/^(keyup|blur)$/, '*', function (x, ev) {
      if (x.verb === 'keyup' && ev.key === 'Meta') B.call (x, 'rem', 'key', 'command');
      if (x.verb === 'blur') B.call (x, 'rem', 'key', 'command');
   }],

   ['change', ['new', 'file'], {priority: -1000}, function (x) {
      if (B.get ('new', 'file') !== undefined) c ('.new-file-input') [0].focus ();
   }],

   // *** FILES ***

   ['list', 'files', function (x) {
      // If no projects loaded yet, retry in 10ms.
      if (! B.get ('projects')) return setTimeout (function () {
         B.call (x, 'list', 'files');
      }, 10);

      var project = dale.stopNot (B.get ('projects'), undefined, function (p) {
         if (p.name === B.get ('project')) return p;
      });
      if (! project) return B.call (x, 'navigate', 'projects');

      B.call (x, 'post', '/project/run', {id: project.id, command: "find /project -type f -not -path '/project/.git/*' -printf '%s %p\\n' | sort -t/ -k3"}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading files');
         var files = dale.fil ((rs.body.stdout || '').split ('\n'), undefined, function (line) {
            if (! line) return;
            var space = line.indexOf (' ');
            return {
               name: line.slice (space + 1).replace ('/project/', ''),
               size: parseInt (line.slice (0, space)),
            };
         });
         B.call (x, 'set', 'files', files);
      });
   }],

   ['change', ['file', 'name'], function (x) {
      var project = dale.stopNot (B.get ('projects'), undefined, function (p) {
         if (p.name === B.get ('project')) return p;
      });
      if (! project) return;

      B.call (x, 'post', '/project/read', {id: project.id, path: B.get ('file', 'name')}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading the file');
         B.call (x, 'set', ['file', 'content'], rs.body);
      });
   }],

   ['save', 'file', function (x, name, value, New) {
      B.call (x, 'post', '/project/' + encodeURIComponent (B.get ('project')) + '/file/' + name, {content: value}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem ' + (New ? 'creating' : 'saving') + ' the file');

         if (! New) B.call (x, 'mset', ['file', 'content'], value);
         else       B.call (x, 'navigate', 'files/' + B.get ('project') + '/' + name);
      });
   }],

   ['create', 'file', function (x) {
      var name = B.get ('new', 'file').trim ();
      if (B.get ('new', 'type') === 'dialog') return B.call (x, 'create', 'dialog', name);

      if (name.length === 0) return B.call (x, 'snackbar', 'error', 'Please enter a name');

      name = 'doc/' + name + '.md';

      B.call (x, 'madd', 'files', name);
      B.call (x, 'save', 'file', name, '', 'new');
      B.call (x, 'rem', 'new', 'file');
      B.call (x, 'list', 'files');
   }],

   ['delete', 'file', function (x, name) {
      if (! confirm ('Delete file "' + name + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'project/' + encodeURIComponent (B.get ('project')) + '/file/' + name, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to delete file');
         B.call (x, 'list', 'files');
         if (B.get ('file', 'name') === name) B.call (x, 'navigate', 'files/' + B.get ('project') + '/doc/main.md');
      });
   }],

   ['create', 'dialog', function (x, name) {

      B.call (x, 'post', '/project/' + encodeURIComponent (B.get ('project')) + '/dialog/new', {slug: name.length ? name : undefined, provider: 'openai'}, function (x, error, rs) {

         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem creating the dialog');

         B.call (x, 'madd', 'files', rs.body.filename);
         B.call (x, 'rem', 'new', 'file');
         B.call (x, 'navigate', 'files/' + B.get ('project') + '/' + rs.body.filename);
         B.call (x, 'list', 'files');
      });

   }],
]);

// *** VIEWS ***

var css = {
   button: 'bg-vblue bn br2 fw6 pa3 pointer white',
   colors: {
      vblue:           '#4a69bd',
      vdeepnavy:       '#0f1530',
      vgray:           '#9aa4bf',
      vgreen:          '#27ae60',
      vlightblue:      '#94b8ff',
      vlightgray:      '#eeeeee',
      vmidnight:       '#1a1a2e',
      vnavy:           '#16213e',
      vnearwhite:      '#f5f7ff',
      vpurple:         '#5a189a',
      vred:            '#d33e43',
      vviolet:         '#b07aff',
      vorange:         '#c87533'
   },
   input: 'ba bg-vdeepnavy br2 db mb3 outline-0 pa3 placeholder-vgray vborderblue-border vnearwhite w-100',
   join: function () {
      return dale.go (arguments, function (v) {return v}).join (' ');
   },
   rgba: function (color, transparency) {
      var r = parseInt (color.slice (1, 3), 16);
      var g = parseInt (color.slice (3, 5), 16);
      var b = parseInt (color.slice (5, 7), 16);
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + transparency + ')';
   }
}

css.colors = {
   ...css.colors,
   vborderblue:    css.rgba (css.colors.vlightblue, 0.22),
   vhighlightblue: css.rgba (css.colors.vblue, 0.25),
   vmidblue:       css.rgba (css.colors.vlightblue, 0.4),
};

css.style = [

   // *** BODY ***

   ['body', {
      'background-color': css.colors.vmidnight,
      color: css.colors.vlightgray,
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      height: '100vh',
      margin: 0,
      padding: 0,
   }],

   // *** COLORS ***

   dale.go (css.colors, function (color, name) {
      return [
         ['.bg-' + name, {'background-color': color}],
         ['.' + name, {'color': color}],
      ];
   }),

   ['.vborderblue-border', {'border-color': css.colors.vborderblue}],
   ['.outline-0:focus', {outline: 'none'}],
   ['.placeholder-vgray::placeholder', {color: css.colors.vgray, opacity: '1'}],

   // *** SPINNY ***

   ['LITERAL', '@keyframes spinny {0%, 24.99% { content: "|"; } 25%, 49.99% { content: "/"; } 50%, 74.99% { content: "-"; } 75%, 100% { content: "\\\\"; }}'],
   ['.spinny:before', {
      content: '"|"',
      animation: 'spinny 0.8s steps(1) infinite'
   }],
]

// *** UTILITY VIEWS ***

var views = {};

views.tooltip = function (tooltip) {
   return B.view (['key', 'command'], function (command) {
      if (! command) return ['span'];
      return ['span', {
         class: 'absolute bg-vblue fw7 nowrap white',
         style: style ({
            'border-radius': 5,
            'font-size': '0.72rem',
            left: '0.625rem',
            padding: '0.125rem 0.5rem',
            'pointer-events': 'none',
            top: '-1.75rem',
            transform: 'translateX(-50%)',
            'z-index': 10
         }),
      }, tooltip];
   });
}

views.spinny = function () {
   return ['span', {
      class: 'b code dib f2 lh-solid spinny tc vblue',
      style: style ({width: '2ch'}),
   }];
}

// *** MAIN ***

views.main = function () {
   return B.view ([['view'], ['snackbar']], function (view, snackbar) {
      return ['div', {class: 'min-vh-100 relative'}, [
         ['style', css.style],

         // Header
         (function () {
            if (view === 'login') return;
            return ['div', {
               class: 'absolute flex right-0 top-0',
               style: style ({
                  gap: '1.5rem',
                  margin: '1.5rem 1.5rem 0 0',
               })
            }, [

               // Settings
               B.view ([['settings', 'show'], ['view']], function (showSettings, view) {
                  if (view !== 'files') return ['span'];
                  return ['button', {
                     class: css.button + ' bg-mid-gray f5 pa2 ph3 relative',
                     onclick: B.ev ('set', ['settings', 'show'], ! B.get ('settings', 'show'))
                  }, [
                     views.tooltip ('O'),
                     ['i', {class: 'bi mr1 ' + (showSettings ? 'bi-check-lg' : 'bi-wrench-adjustable mr1')}],
                     showSettings ? 'Done with this' : 'Settings'
                  ]];
               }),

               // Logout
               ['button', {
                  class: css.button + ' bg-vpurple f5 pa2 ph3',
                  onclick: B.ev ('logout', []),
                  title: B.get ('user', 'email') || ''
               }, [
                  ['i', {class: 'bi bi-person-walking mr1'}],
                  'Logout'
               ]]
            ]];

         }) (),

         // Dynamic view
         (function () {
            if (! views [view]) return ['div'];
            return ['div', {class: 'min-vh-100'}, views [view] ()];
         }) (),

         // Snackbar
         (function () {
            if (! snackbar) return;

            var snackbarClass = {
               error: 'bg-vred white',
               ok: 'bg-vgreen black',
               warning: 'bg-yellow black',
            } [snackbar.type] || 'bg-dark-gray white';

            if (snackbar) return ['div', {
               class: 'bottom-0 fixed left-0 pa3 pa4-ns right-0 z-999',
               onclick: B.ev ('snackbar', 'clear'),
            }, ['div', {class: 'br3 center fw5 lh-copy mw7 pa3 ph4-ns shadow-4 tc ' + snackbarClass}, snackbar.message || '']];
         }) (),
      ]];
   });
}

// *** AUTH ***

views.login = function () {
   return B.view ('user', function (user) {
      user = user || {};

      var emailValid = user.email && user.email.match (/^(?=[A-Z0-9][A-Z0-9@._%+-]{5,253}$)[A-Z0-9._%+-]{1,64}@(?:(?=[A-Z0-9-]{1,63}\.)[A-Z0-9]+(?:-[A-Z0-9]+)*\.){1,8}[A-Z]{2,63}$/i);

      return ['div', {class: 'bg-vmidnight flex items-center justify-center min-vh-100 pa4'}, [
         ['div', {class: 'ba bg-vnavy br3 mw6 pa4 pa5-ns shadow-3 vborderblue-border vnearwhite w-100'}, [
            ['h1', {class: 'f3 fw6 ma0 mb2 vnearwhite'}, 'Enter vibey'],
            ['div', {class: 'f4 fw5 light-blue mb2'}],
            ['div', {class: 'lh-copy mb4 vgray'}, user.loginLinkRequested ? 'Check your inbox for a login link.' : ''],
            ['div', [
               ['input', {
                  class: css.input,
                  oninput: B.ev ('set', ['user', 'email']),
                  placeholder: 'your email',
                  type: 'email',
                  value: user.email
               }],
               ['button', {
                  class: css.join (emailValid ? 'bg-vgreen' : 'bg-mid-gray', css.button, 'db w-100').replace ('bg-vblue', ''),
                  disabled: ! emailValid,
                  onclick: B.ev ('login', user.email),
               }, emailValid ? (user.loginLinkRequested ? 'Send another link' : 'Send me a link to get in') : 'Enter your email'],
            ]]
         ]]
      ]];
   });
}

// *** PROJECTS ***

views.modal = function (attributes, contents) {
   return ['div', {
      ... (attributes || {}),
      class: 'bottom-0 fixed flex items-center justify-center left-0 right-0 top-0',
      style: style ({
         background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.3) 0rem, rgba(0,0,0,0.3) 0.125rem, transparent 0.125rem, transparent 0.375rem), repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0rem, rgba(0,0,0,0.3) 0.125rem, transparent 0.125rem, transparent 0.375rem), ' + css.rgba (css.colors.vgreen, 0.5),
      })
   }, [
      ['div', {
         class: 'bg-vnavy',
         onclick: B.ev ('stop', 'propagation', {raw: 'event'}),
         style: style ({
            border: '0.0625rem solid ' + css.colors.vborderblue,
            'border-radius': '1.125rem',
            'box-shadow': '0 1.75rem 5rem rgba(0, 0, 0, 0.38)',
            'min-height': '25vh',
            padding: '3rem 2.25rem',
            width: '50vw',
         }),
      }, contents]
   ]];
}

views.projects = function () {
   var phi = (1 + Math.sqrt (5)) / 2;
   var scale = 140 / 1400;
   var vw = function (n) {
      return n * scale + 'vw'
   };
   var baseRadius = 24, slotWidth = 80, slotHeight = 48, slotBorderRadius = 12;
   var angleToRadius = function (t) {return baseRadius * Math.pow (phi, t / (Math.PI / 2))};

   var slotAngles = [Math.PI, Math.PI * 1.6, Math.PI * 2, Math.PI * 2.25];
   var slotPositions = dale.go (slotAngles, function (t) {
      var radius = angleToRadius (t);
      return {x: radius * Math.cos (t), y: radius * Math.sin (t)};
   });

   // Slot 5: find angle past slot 4 where x matches slot 2
   var alignTargetX = slotPositions [1].x;
   for (var candidateAngle = Math.PI * 2.26; candidateAngle < Math.PI * 3; candidateAngle += 0.001) {
      var radius = angleToRadius (candidateAngle);
      if (Math.abs (radius * Math.cos (candidateAngle) - alignTargetX) < 2) {
         slotPositions.push ({x: radius * Math.cos (candidateAngle), y: radius * Math.sin (candidateAngle)});
         slotAngles.push (candidateAngle);
         break;
      }
   }

   var slotXs = dale.go (slotPositions, function (s) { return s.x });
   var slotYs = dale.go (slotPositions, function (s) { return s.y });
   var offsetX = -Math.min.apply (null, slotXs) + slotWidth / 2 + 20;
   var offsetY = -Math.min.apply (null, slotYs) + slotHeight / 2 + 20;
   var containerWidth  = Math.max.apply (null, slotXs) - Math.min.apply (null, slotXs) + slotWidth + 40;
   var containerHeight = Math.max.apply (null, slotYs) - Math.min.apply (null, slotYs) + slotHeight + 40;

   // Spiral line from slot 1 to slot 5
   var spiralStart = slotAngles [0], spiralEnd = slotAngles [slotAngles.length - 1], steps = 300, spiralPath = '';
   dale.go (dale.times (steps, 0), function (i) {
      var angle = spiralStart + (spiralEnd - spiralStart) * i / steps;
      var radius = angleToRadius (angle);
      spiralPath += (i === 0 ? 'M' : 'L') + (radius * Math.cos (angle) + offsetX).toFixed (1) + ',' + (radius * Math.sin (angle) + offsetY).toFixed (1);
   });

   // Status bar: left = left of slot 1, same aspect ratio as slots, bottom = bottom of slot 4
   var barBottom = slotPositions [3].y + offsetY + slotHeight / 2;
   var barHeight = slotHeight * 2;
   var barWidth  = barHeight * slotWidth / slotHeight;
   var barLeft   = slotPositions [0].x + offsetX - slotWidth / 2;

   var slotColors = [
      css.colors.vblue,
      css.colors.vgreen,
      css.colors.vorange,
      css.colors.vpurple,
      css.colors.vviolet,
   ];

   var projectColor = function (text) {

      var projectColors = [
         {bg: 'bg-vblue',        fg: 'vnearwhite'},
         {bg: 'bg-vpurple',      fg: 'vnearwhite'},
         {bg: 'bg-light-purple', fg: 'vnearwhite'},
         {bg: 'bg-vgray',        fg: 'vdeepnavy'},
         {bg: 'bg-dark-green',   fg: 'vnearwhite'},
         {bg: 'bg-gold',         fg: 'vdeepnavy'},
         {bg: 'bg-dark-pink',    fg: 'vnearwhite'},
         {bg: 'bg-vorange',      fg: 'vdeepnavy'},
      ];

      var sum = dale.acc (((text || '') + '').split (''), 0, function (a, b) {
         return a + b.charCodeAt (0);
      });
      var colors = projectColors [sum % projectColors.length];
      return colors.bg + ' ' + colors.fg;
   }

   return B.view ('projects', function (projects) {

      if (! projects) return ['div', {
         class: 'bg-vmidnight flex flex-wrap items-center justify-center min-vh-100',
         style: style ({gap: '2rem'}),
      }, dale.go (dale.times (80), () => views.spinny ())];


      return ['div', {class: 'bg-vmidnight flex items-center justify-center min-vh-100'}, [

         // Title
         ['div', {style: style ({
            left: '1.5rem',
            position: 'fixed',
            top: '1.5rem',
         })}, ['span', {class: 'f2 fw7 vnearwhite'}, 'Projects']],

         // Spiral slots or project list
         B.view (['search', 'project'], function (search) {
            return ['div', {class: 'relative' + (search !== undefined ? ' self-start' : ''), style: style ({
               height: search === undefined ? vw (containerHeight + 48 + 48) : 'auto',
               width: search === undefined ? vw (containerWidth) : '100vw',
            })}, [

               (function () {

                  // Spiral
                  if (search === undefined) return ['div', [

                     // Spiral drawing
                     ['div', {opaque: true}, ['LITERAL', '<svg width="' + vw (containerWidth) + '" height="' + vw (containerHeight) + '" viewBox="0 0 ' + containerWidth + ' ' + containerHeight + '" style="position:absolute;left:0;top:0" xmlns="http://www.w3.org/2000/svg"><path d="' + spiralPath + '" fill="none" stroke="' + css.rgba (css.colors.vlightblue, 0.35) + '" stroke-width="2" stroke-linecap="round"/></svg>']],

                     // Spiral slots
                     dale.go (slotPositions, function (slot, index) {

                        var matchingProject = dale.stopNot (projects, undefined, function (project) {
                           if (project.slot === index + 1) return project;
                        });

                        return ['div', {
                           class: 'absolute flex items-center justify-center pointer' + (matchingProject ? ' ' + projectColor (matchingProject.name) : ''),
                           onclick: matchingProject ? B.ev ('navigate', 'files/' + encodeURIComponent (matchingProject.name)) : undefined,
                           onmouseenter: B.ev ('set', ['hover', 'project'], matchingProject || {name: '(slot ' + (index + 1) + ')'}),
                           onmouseleave: B.ev ('rem', [], 'hover'),
                           style: style ({
                              'background-color': matchingProject ? undefined : css.rgba (slotColors [index], 0.15),
                              border: vw (1.5) + ' solid ' + css.colors.vborderblue,
                              'border-radius': vw (slotBorderRadius),
                              height: vw (slotHeight),
                              left: vw (slot.x + offsetX - slotWidth / 2),
                              top: vw (slot.y + offsetY - slotHeight / 2),
                              width: vw (slotWidth),
                           }),
                        }, (function () {
                           if (matchingProject) return ['span', {class: 'f3 fw7'}, dale.go (matchingProject.name.split (' '), function (word) {
                              return word [0];
                           }).slice (0, 3).join (' ')];

                           if (! matchingProject) return ['span', {
                              opaque: true,
                              class: 'flex items-center justify-center w-100 h-100',
                              onclick: B.ev ('set', ['new', 'project'], {slot: index + 1}),
                           }, ['LITERAL', '<svg viewBox="0 0 40 40" width="36%" height="36%" xmlns="http://www.w3.org/2000/svg"><path d="M20 8 L20 32 M8 20 L32 20" stroke="' + css.colors.vgreen + '" stroke-width="5" stroke-linecap="round"/><path d="M20 8 L20 32 M8 20 L32 20" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>']];
                        }) ()];
                     }),

                     // Status bar
                     B.view (['hover', 'project'], function (project) {
                        if (! project) return ['div'];
                        return ['div', {
                           class: 'absolute flex flex-column items-center justify-center ' + projectColor (project.name),
                           style: style ({
                              border: vw (1.5) + ' solid ' + css.colors.vborderblue,
                              'border-radius': vw (slotBorderRadius),
                              'font-size': vw (13),
                              height: vw (barHeight),
                              left: vw (barLeft),
                              top: vw (barBottom - barHeight),
                              width: vw (barWidth),
                           }),
                        }, [
                           ['span', {
                              class: 'fw6',
                              style: style ({'font-size': '120%'}),
                           }, project.name],
                           ['br'],
                           ['span', {
                              style: style ({
                                 'font-size': '70%',
                                 opacity: '0.7',
                              }),
                           }, project.last ? ago (project.last) : ''],
                        ]];
                     }),
                  ]];

                  // List of projects
                  if (search !== undefined) return ['div', {
                     class: 'flex flex-column relative w-100',
                     style: style ({
                        'padding-top': '14vh',
                     }),
                  }, [
                     ['div', {
                        class: 'bg-vmidnight border-box center fixed flex left-0 right-0 w-100',
                        style: style ({
                           gap: '0.75rem',
                           height: '14vh',
                           'min-height': '3rem',
                           padding: '2vh 15vw',
                           top: 0,
                           'z-index': 1,
                        }),
                     }, [
                        ['div', {
                           class: 'bg-transparent flex items-center justify-center pointer vlightblue',
                           onclick: B.ev ('rem', 'search', 'project'),
                           style: style ({
                              border: '0.09375rem solid ' + css.colors.vborderblue,
                              'border-radius': '0.75rem',
                              flex: 1,
                           }),
                        }, ['span', {class: 'fw6 f4'}, '‹ Back to shell']],
                        ['div', {
                           class: 'bg-transparent flex items-center justify-center pointer vgreen',
                           onclick: B.ev ('set', ['new', 'project'], {slot: undefined}),
                           style: style ({
                              border: '0.09375rem solid ' + css.colors.vborderblue,
                              'border-radius': '0.75rem',
                              flex: 1,
                           }),
                        }, ['span', {class: 'fw6 f4'}, '+ New project']],
                     ]],
                     (function () {
                        var cardWidth = 70 / phi;
                        var cycle = 8;
                        var index = 0;
                        return dale.fil (projects, undefined, function (project) {
                           if (! project.name.match (search)) return;
                           var offset = 15 + (Math.sin (index++ * 2 * Math.PI / cycle - Math.PI / 2) + 1) / 2 * (70 - cardWidth);
                           return ['div', {
                              class: 'border-box flex items-center justify-between pointer ' + projectColor (project.name),
                              onclick: B.ev ('navigate', 'files/' + encodeURIComponent (project.name)),
                              style: style ({
                                 'border-radius': '0.75rem',
                                 height: '10vh',
                                 'margin-bottom': '4vh',
                                 'margin-left': offset + 'vw',
                                 'min-height': '3rem',
                                 padding: '0 1.5rem',
                                 width: cardWidth + 'vw',
                              }),
                           }, [
                              ['span', {class: 'flex flex-column justify-center'}, [
                                 ['span', {class: 'f4 fw6'}, project.name],
                                 ['span', {
                                    style: style ({
                                       'font-size': '70%',
                                       opacity: '0.7',
                                    }),
                                 }, project.last ? ago (project.last) : ''],
                              ]],
                              ['div', {
                                 class: 'flex items-center',
                                 onclick: B.ev ('stop', 'propagation', {raw: 'event'}),
                                 style: style ({
                                    gap: '0.5rem',
                                 }),
                              }, [
                                 ['span', {
                                    class: 'flex items-center justify-center pointer',
                                    onclick: B.ev ('set', ['edit', 'project'], {
                                       id: project.id,
                                       name: project.name,
                                       slot: project.slot,
                                    }),
                                    style: style ({
                                       'border-radius': '0.5rem',
                                       'font-size': '1.25rem',
                                       height: '2.5rem',
                                       width: '2.5rem',
                                    }),
                                    title: 'Rename',
                                 }, ['i', {class: 'bi bi-pencil'}]],
                                 ['span', {
                                    class: 'flex items-center justify-center pointer',
                                    onclick: B.ev ('delete', 'project', project),
                                    style: style ({
                                       'border-radius': '0.5rem',
                                       'font-size': '1.25rem',
                                       height: '2.5rem',
                                       width: '2.5rem',
                                    }),
                                    title: 'Delete',
                                 }, ['i', {class: 'bi bi-trash'}]],
                              ]],
                           ]];
                        });
                     }) ()
                  ]];
               }) (),

               // Search bar
               ['div', {
                  class: search === undefined ? 'absolute' : 'fixed',
                  onclick: B.ev ('set', ['search', 'project'], ''),
                  style: style ({
                     bottom: search === undefined ? undefined : '2vh',
                     height: vw (48),
                     left: search === undefined ? 0 : '50%',
                     top: search === undefined ? vw (containerHeight + 32) : undefined,
                     transform: search === undefined ? undefined : 'translateX(-50%)',
                     width: vw (containerWidth),
                  }),
               }, [
                  ['i', {
                     class: 'absolute bi bi-search',
                     style: style ({
                        color: css.colors.vmidblue,
                        'font-size': vw (16),
                        left: vw (14),
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     class: 'bg-vnavy border-box outline-0 search-project w-100',
                     onchange: B.ev ('set', ['search', 'project']),
                     onfocus: B.ev ('set', ['search', 'project'], ''),
                     oninput: B.ev ('set', ['search', 'project']),
                     placeholder: 'Search',
                     style: style ({
                        border: vw (1.5) + ' solid ' + css.colors.vborderblue,
                        'border-radius': vw (slotBorderRadius),
                        color: css.colors.vlightblue,
                        'font-size': vw (16),
                        height: '100%',
                        'padding-left': vw (40),
                        'padding-right': vw (16),
                     }),
                     type: 'text',
                     value: search,
                  }],
               ]],
            ]];
         }),

         // Project creation modal
         B.view (['new', 'project'], function (newProject) {
            if (newProject === undefined) return ['div'];

            var randomName = function () {
               var verbs = ['be', 'have', 'do', 'say', 'go', 'get', 'make', 'know', 'think', 'take', 'see', 'come', 'want', 'look', 'use', 'find', 'give', 'tell', 'work', 'call', 'try', 'ask', 'need', 'feel', 'become', 'leave', 'put', 'mean', 'keep', 'let'];
               var nouns = ['time', 'year', 'people', 'way', 'day', 'man', 'woman', 'child', 'world', 'life', 'hand', 'part', 'place', 'case', 'week', 'company', 'system', 'program', 'question', 'work', 'government', 'number', 'night', 'point', 'home', 'water', 'room', 'mother', 'area', 'money'];
               var random = function (list) {
                  return list [Math.floor (Math.random () * list.length)];
               }

               return random (verbs) + ' ' + random (nouns);
            }

            var allowCreation = (function () {
               var name = (newProject.name || '').trim ();
               if (name.length === 0) return 'empty';
               var conflict = dale.stop (projects, true, function (project) {
                  return project.name === name;
               });
               return conflict ? 'conflict' : true;
            }) ();

            return views.modal ({onclick: B.ev ('rem', 'new', 'project')}, [
               ['div', {
                  class: 'relative w-100',
                  style: style ({height: vw (48)}),
               }, [
                  ['i', {
                     class: 'absolute bi bi-pencil',
                     style: style ({
                        color: css.colors.vmidblue,
                        'font-size': vw (16),
                        left: vw (14),
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     })
                  }],
                  ['i', {
                     class: 'absolute bi bi-dice-' + Math.ceil (Math.random () * 5) + ' pointer',
                     onclick: B.ev ('set', ['new', 'project', 'name'], randomName ()),
                     style: style ({
                        color: css.colors.vmidblue,
                        'font-size': vw (16),
                        right: vw (14),
                        top: '50%',
                        transform: 'translateY(-50%)',
                     })
                  }],
                  ['input', {
                     class: 'bg-vnavy border-box h-100 new-project-input outline-0 w-100',
                     onchange: B.ev ('set', ['new', 'project', 'name']),
                     oninput: B.ev ('set', ['new', 'project', 'name']),
                     placeholder: 'Name your project',
                     style: style ({
                        border: '0.09375rem solid ' + css.rgba (css.colors.vlightblue, 0.15),
                        'border-radius': slotBorderRadius,
                        color: css.rgba (css.colors.vlightblue, 0.8),
                        'font-size': vw (16),
                        'padding-left': vw (40),
                        'padding-right': vw (40),
                     }),
                     type: 'text',
                     value: newProject.name,
                  }],
               ]],
               ['button', {
                  class: 'bn fw7 pointer w-100',
                  disabled: allowCreation !== true,
                  onclick: B.ev ('create', 'project'),
                  style: style ({
                     'background-color': allowCreation === true ? css.colors.vgreen : '#555',
                     'border-radius': slotBorderRadius,
                     color: '#000',
                     'font-size': vw (16),
                     'margin-top': '1rem',
                     padding: '1rem 0',
                  })
               }, {
                  conflict: 'That name\'s taken',
                  empty: 'Enter a name',
                  true: 'Boom',
               } [allowCreation]]
            ]);
         }),

         // Edit project modal
         B.view (['edit', 'project'], function (editProject) {
            if (! editProject) return ['div'];

            var allowEdit = (function () {
               var name = (editProject.name || '').trim ();
               if (name.length === 0) return 'empty';
               var conflict = dale.stop (projects, true, function (project) {
                  return project.id !== editProject.id && project.name === name;
               });
               return conflict ? 'conflict' : true;
            }) ();

            return views.modal ({onclick: B.ev ('rem', 'edit', 'project')}, [
               ['div', {
                  class: 'flex w-100',
                  style: style ({
                     gap: '0.5rem',
                     height: vw (48),
                  }),
               }, [
                  ['div', {
                     class: 'relative',
                     style: style ({flex: '1'}),
                  }, [
                     ['i', {
                        class: 'absolute bi bi-pencil',
                        style: style ({
                           color: css.colors.vmidblue,
                           'font-size': vw (16),
                           left: vw (14),
                           'pointer-events': 'none',
                           top: '50%',
                           transform: 'translateY(-50%)',
                        })
                     }],
                     ['input', {
                        class: 'bg-vnavy border-box h-100 edit-project-input outline-0 w-100',
                        onchange: B.ev ('set', ['edit', 'project', 'name']),
                        oninput: B.ev ('set', ['edit', 'project', 'name']),
                        placeholder: 'Rename your project',
                        style: style ({
                           border: '0.09375rem solid ' + css.rgba (css.colors.vlightblue, 0.15),
                           'border-radius': slotBorderRadius,
                           color: css.rgba (css.colors.vlightblue, 0.8),
                           'font-size': vw (16),
                           'padding-left': vw (40),
                        }),
                        type: 'text',
                        value: editProject.name,
                     }],
                  ]],
                  ['select', {
                     class: 'bg-vnavy pointer',
                     onchange: B.ev ('set', ['edit', 'project', 'slot']),
                     style: style ({
                        border: '0.09375rem solid ' + css.rgba (css.colors.vlightblue, 0.15),
                        'border-radius': slotBorderRadius,
                        color: css.rgba (css.colors.vlightblue, 0.8),
                        'font-size': vw (12),
                        padding: '0 0.5rem',
                     }),
                  }, [
                     ['option', {
                        selected: ! editProject.slot,
                        value: '',
                     }, 'None'],
                     dale.go (dale.times (5, 1), function (n) {
                        return ['option', {value: n, selected: editProject.slot === n}, 'Slot ' + n];
                     }),
                  ]],
               ]],
               ['button', {
                  class: 'bn fw7 pointer w-100',
                  disabled: allowEdit !== true,
                  onclick: B.ev ('edit', 'project'),
                  style: style ({
                     'background-color': allowEdit === true ? css.colors.vgreen : '#555',
                     'border-radius': slotBorderRadius,
                     color: '#000',
                     'font-size': vw (16),
                     'margin-top': '1rem',
                     padding: '1rem 0',
                  })
               }, {
                  conflict: 'That name\'s taken',
                  empty: 'Enter a name',
                  true: 'Rename',
               } [allowEdit]]
            ]);
         }),
      ]];
   });
}

// *** FILES ***

views.files = function () {

   var iconAndName = function (name) {
      if (name.match ('^doc/')) return [['i', {class: 'bi bi-file-text mr1 vlightblue'}], name];
      if (name.match ('^dialog/')) return [['i', {class: 'bi bi-chat-left-dots mr1 vviolet'}], name];
      return name;
   }

   var paneStyle = style ({
      border: '0.0625rem solid ' + css.colors.vborderblue,
      'border-radius': '1.125rem',
      'box-shadow': '0 1.25rem 3.75rem ' + css.rgba (css.colors.vdeepnavy, 0.22),
      padding: '1.5rem',
   });

   return B.view ([['projects'], ['project']], function (projects, project) {
      if (! projects) return ['div', {
         class: 'bg-vmidnight flex flex-wrap items-center justify-center min-vh-100',
         style: style ({gap: '2rem'}),
      }, dale.go (dale.times (80), () => views.spinny ())];

      return ['div', {
         class: 'bg-vmidnight border-box flex flex-column min-vh-100',
         style: style ({
            gap: '1.5rem',
            padding: '1.5rem',
         }),
      }, [
         ['div', {class: 'flex items-center'}, [
            ['span', {
               class: 'f1 fw7 lh-solid light-blue mr3 pointer',
               onclick: B.ev ('navigate', 'projects'),
            }, '‹'],
            ['span', {class: 'f2 fw7 vnearwhite'}, project],
         ]],
         ['div', {
            style: style ({
               display: 'grid',
               flex: 1,
               gap: '1.5rem',
               'grid-template-columns': '23.6fr 76.4fr',
            }),
         }, [
            ['div', {class: 'bg-vnavy border-box flex flex-column', style: paneStyle}, [
               ['button', {
                  class: 'bg-vgreen bn br2 fw6 pointer vnearwhite w-100',
                  onclick: B.ev ('set', ['new', 'file'], ''),
                  style: style ({padding: '0.75rem'}),
               }, '+ New file'],
               B.view ([['files'], ['file', 'name'], ['search', 'file']], function (files, current, search) {
                  if (! files) return ['div', {class: 'flex-auto pa3 tc vgray'}, 'Loading...'];
                  if (! files.length) return ['div', {class: 'flex-auto pa3 tc vgray'}, 'No files yet.'];
                  return ['div', {class: 'flex-auto overflow-y-auto pt3'}, dale.fil (files, undefined, function (file) {
                     if (search && ! file.name.match (search)) return;
                     var active = file.name === current;
                     return ['div', {
                        class: css.join ('br1 fw5 lh-copy pointer', active ? 'bg-vhighlightblue vnearwhite' : 'vlightblue'),
                        onclick: B.ev ('navigate', 'files/' + B.get ('project') + '/' + file.name),
                        style: style ({
                           'border-left': '0.1875rem solid ' + (active ? css.colors.vblue : 'transparent'),
                           padding: '0.5rem 0.625rem',
                        }),
                     }, iconAndName (file.name)];
                  })];
               }),
               ['div', {class: 'relative w-100'}, [
                  ['i', {
                     class: 'absolute bi bi-search',
                     style: style ({
                        color: css.colors.vmidblue,
                        left: '0.875rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     class: 'bg-vnavy border-box fw6 outline-0 w-100',
                     oninput: B.ev ('set', ['search', 'file']),
                     placeholder: 'Search',
                     style: style ({
                        border: '0.125rem solid ' + css.colors.vmidblue,
                        'border-radius': '0.75rem',
                        color: css.colors.vlightblue,
                        'font-size': '1rem',
                        height: '3rem',
                        'padding-left': '2.5rem',
                        'padding-right': '1rem',
                     }),
                     type: 'text',
                  }],
               ]],
            ]],
            ['div', {class: 'bg-vnavy border-box flex flex-column', style: paneStyle}],
         ]],
      ]];
   });
}

views.files_old = function () {

   var iconAndName = function (name) {
      if (name.match ('^doc/')) return [['i', {class: 'bi bi-file-text mr1 vlightblue'}], name];
      if (name.match ('^dialog/')) return [['i', {class: 'bi bi-chat-left-dots mr1 vviolet'}], name];
      return name;
   }

   return B.view ([['projects'], ['project']], function (projects, project) {
      if (! projects) return ['div', {class: 'tc pv5'}, dale.go (dale.times (8), () => views.spinny ())];

      return ['div', {
         class: 'bg-vmidnight border-box flex flex-column min-vh-100',
         style: style ({
            gap: '1.5rem',
            padding: '1.5rem',
         }),
      }, [
         ['div', {class: 'flex items-center'}, [
            ['span', {
               class: 'f1 fw7 lh-solid light-blue mr3 pointer relative',
               onclick: B.ev ('navigate', 'projects'),
            }, [
               views.tooltip ('B'),
               '‹'
            ]],
            ['span', {class: 'f2 fw7 vnearwhite'}, project]
         ]],
         ['div', {
            class: 'border-box w-100',
            style: style ({
               display: 'grid',
               flex: 1,
               gap: '1.5rem',
               'grid-template-columns': '23.6fr 76.4fr',
               'min-height': 0,
            }),
         }, [
            B.view ([['files'], ['file', 'name'], ['new', 'file'], ['file', 'delete'], ['key', 'command'], ['new', 'type'], ['settings', 'show']], function (files, name, newFileName, Delete, command, newType, showSettings) {

               return ['div', {class: 'flip-card'}, ['div', {class: 'flip-card-inner' + (showSettings ? ' flipped' : '')}, [
                  ['div', {class: 'flip-card-front project-pane project-left-pane', style: style ({display: 'flex', 'flex-direction': 'column'})}, [
                  ['div', {style: style ({flex: 1, overflow: 'auto'})}, [
                     ['br'], ['br'],
                     ! files ? ['div', {class: 'vgray lh-copy'}, 'Loading files...'] : ! files.length ? ['div', {class: 'vgray lh-copy'}, 'No files yet.'] : ['div', dale.go (files, function (file, index) {
                        var active = file === name;
                        return ['div', {
                           class: 'mb2 pb2',
                           style: style ({
                              'border-bottom': '1px solid ' + css.colors.vborderblue,
                              'background-color': active ? css.colors.vhighlightblue : undefined,
                              'border-left': active ? '3px solid ' + css.colors.vblue : '3px solid transparent',
                              padding: '8px 10px',
                              'border-radius': 4,
                           })
                        }, [
                           ['div', {
                              class: 'flex justify-between items-center'
                           }, [
                              ['div', {
                                 class: (active ? 'vnearwhite fw6' : file.indexOf ('doc/') === 0 ? 'light-blue' : 'vnearwhite') + ' fw5 lh-copy pointer relative',
                                 onclick: B.ev ('navigate', 'project/' + B.get ('project') + '/' + file)
                              }, [
                                 (function () {
                                    if (active || ! command) return;
                                    var prev = files.indexOf (name) - 1, next = files.indexOf (name) + 1;
                                    if (prev < 0) prev = files.length - 1;
                                    if (next === files.length) next = 0;
                                    if (index === prev) return ['span', {class: 'cmd-tooltip'}, 'K'];
                                    if (index === next) return ['span', {class: 'cmd-tooltip'}, 'J'];
                                    return
                                 }) (),
                                 iconAndName (file)
                              ]],
                              Delete && file !== 'doc/main.md' ? ['span', {
                                 class: 'f4 lh-solid pointer relative vpurple',
                                 onclick: B.ev (['stop', 'propagation', {raw: 'event'}], ['delete', 'file', file])
                              }, [
                                 file === name ? ['span', {class: 'cmd-tooltip', style: style ({left: 'auto', right: 0, transform: 'none'})}, 'V'] : [],
                                 '×'
                              ]] : []
                           ]]

                        ]];
                     })]
                  ]],
                  ['div', {class: 'flex mt3', style: style ({gap: '0.5rem'})}, [
                     ['button', {
                        class: css.button + ' f6 ph3 pv2 shadow-primary relative',
                        onclick: B.ev ('set', ['new', 'file'], '')
                     }, [
                        command ? ['span', {class: 'cmd-tooltip'}, 'D'] : '',
                        '+ Add'
                     ]],
                     ['button', {
                        class: css.button + ' f6 ph3 pv2 relative bg-purple',
                        onclick: B.ev ('set', ['file', 'delete'], ! Delete)
                     }, [
                        command ? ['span', {class: 'cmd-tooltip'}, 'X'] : '',
                        ['i', {class: 'bi ' + (Delete ? 'bi-check-lg' : 'bi-eraser-fill') + ' mr1'}], Delete ? 'Done deleting' : 'Delete'
                     ]],
                  ]],

                  newFileName !== undefined ? (function () {
                     var isDialog = newType === 'dialog';
                     return ['div', {class: 'modal-backdrop', onclick: B.ev (['rem', 'new', 'file'], ['rem', 'new', 'type'])}, [
                        ['div', {class: 'modal-card', onclick: 'event.stopPropagation()'}, [
                           ['div', {class: 'flex mb3', style: style ({gap: '0.5rem'})}, [
                              ['button', {
                                 class: css.button + ' f6 ph3 pv2 relative vgray ' + (! isDialog ? ' shadow-primary' : ''),
                                 style: ! isDialog ? '' : style ({'background-color': 'transparent', border: '1px solid ' + css.colors.vborderblue}),
                                 onclick: B.ev ('set', ['new', 'type'], 'doc')
                              }, [
                                 command ? ['span', {class: 'cmd-tooltip'}, 'E'] : '',
                                 ['i', {class: 'bi bi-file-text mr1'}], 'Doc'
                              ]],
                              ['button', {
                                 class: css.button + ' f6 ph3 pv2 relative vgray ' + (isDialog ? ' shadow-primary' : ''),
                                 style: isDialog ? '' : style ({'background-color': 'transparent', border: '1px solid ' + css.colors.vborderblue}),
                                 onclick: B.ev ('set', ['new', 'type'], 'dialog')
                              }, [
                                 command ? ['span', {class: 'cmd-tooltip'}, 'I'] : '',
                                 ['i', {class: 'bi bi-chat-dots mr1'}], 'Dialog'
                              ]]
                           ]],
                           ['div', {class: 'project-modal-title'}, isDialog ? 'Name your new dialog...' : 'Name your new doc...'],
                           ['input', {
                              class: css.input + ' mb0 new-file-input',
                              type: 'text',
                              placeholder: isDialog ? 'my-dialog' : 'my-doc',
                              value: newFileName,
                              oninput: B.ev ('set', ['new', 'file']),
                           }],
                           ['div', {class: 'modal-actions'}, [
                              ['button', {class: css.button + ' relative', onclick: B.ev (['rem', 'new', 'file'], ['rem', 'new', 'type'])}, [
                                 command ? ['span', {class: 'cmd-tooltip'}, 'X'] : '',
                                 'Cancel'
                              ]],
                              ['button', {class: css.button + ' relative', onclick: B.ev ('create', 'file'), disabled: ! ((newFileName || '').trim ())}, [
                                 command ? ['span', {class: 'cmd-tooltip'}, 'D'] : '',
                                 isDialog ? 'Create dialog' : 'Create doc'
                              ]]
                           ]]
                        ]]
                     ]];
                  }) () : ''
               ]],
               ['div', {class: 'flip-card-back project-pane project-left-pane', style: style ({display: 'flex', 'flex-direction': 'column'})}, [
                  ['div', {class: 'flex items-center justify-between mb3'}, [
                     ['span', {class: 'f4 fw6 vnearwhite'}, 'Settings'],
                     ['span', {class: 'f3 pointer light-blue', onclick: B.ev ('set', ['settings', 'show'], false)}, '×']
                  ]],
                  ['div', {class: 'vgray lh-copy tc', style: style ({flex: 1, display: 'flex', 'align-items': 'center', 'justify-content': 'center'})}, [
                     ['div', [
                        ['i', {class: 'bi bi-gear db f1 mb3 light-blue'}],
                        'Settings will appear here'
                     ]]
                  ]]
                  ]]
               ]]];
            }),
            B.view ([['file', 'content'], ['file', 'mode'], ['file', 'name'], ['settings', 'show']], function (content, mode, fileName, showSettings) {
               if (fileName === undefined) fileName = '';
               return ['div', {class: 'flip-card'}, [['div', {class: 'flip-card-inner' + (showSettings ? ' flipped' : '')}, [
                  ['div', {class: 'flip-card-front project-pane project-right-pane'}, [
                  B.view ([['new', 'file'], ['key', 'command']], function (newFile, command) {
                     var showTooltip = command && newFile === undefined;
                     return ['div', {class: 'flex items-center mb3'}, [
                        ['span', {class: 'fw6 vnearwhite mr3'}, iconAndName (fileName)],
                        (function () {
                           if (fileName.match (/^dialog\//)) return ['div', 'hallo']; // TODO: add ai/human/terminal mode
                           return [
                              ['span', {
                                 class: 'pointer fw6 mr3 relative vnearwhite',
                                 style: style ({'background-color': mode !== 'edit' ? css.colors.vhighlightblue : undefined, 'border-radius': 6, padding: '6px 16px'}),
                                 onclick: B.ev ('set', ['file', 'mode'], 'view')
                              }, [
                                 showTooltip && mode && mode !== 'view' ? ['span', {class: 'cmd-tooltip'}, 'I'] : '',
                                 ['i', {class: 'bi bi-eye mr1'}], 'View'
                              ]],
                              ['span', {
                                 class: 'pointer fw6 relative vnearwhite',
                                 style: style ({'background-color': mode === 'edit' ? css.colors.vhighlightblue : undefined, 'border-radius': 6, padding: '6px 16px'}),
                                 onclick: B.ev ('set', ['file', 'mode'], 'edit')
                              }, [
                                 showTooltip && mode !== 'edit' ? ['span', {class: 'cmd-tooltip'}, 'E'] : '',
                                 ['i', {class: 'bi bi-hand-index mr1'}], 'Edit'
                              ]],
                           ];
                        }) ()
                     ]];
                  }),
                  (function () {
                     var isDialog = fileName.match (/^dialog\//);
                     if (mode === 'edit' && ! isDialog) return ['textarea', {
                        class: 'db w-100 bn outline-0 vnearwhite lh-copy f5 bg-vnavy',
                        style: style ({color: css.colors.nearwhite, flex: 1, resize: 'none', 'font-family': 'monospace'}),
                        oninput:  B.ev ('save', 'file', B.get ('file', 'name'), {raw: 'this.value'}),
                        onchange: B.ev ('save', 'file', B.get ('file', 'name'), {raw: 'this.value'}),
                        value: content,
                        autofocus: true
                     }, content || ''];

                     var hasActiveAIKey = dale.stop (['claude', 'openai'], true, function (k) {
                        if (B.get ('settings', k + 'OAuth', 'loggedIn') && ! B.get ('settings', k + 'OAuth', 'expired')) return true;
                        if (B.get ('settings', k, 'hasKey')) return true;
                     });

                     if (isDialog && ! hasActiveAIKey) return ['div', {class: 'flex items-center justify-center tc vgray f5 lh-copy', style: style ({flex: 1})}, ['div', {class: 'pa4'}, [['i', {class: 'bi bi-plug db f2 mb3'}], 'No active AI connection yet.', ['br'], ['button', {class: css.button + ' mt3', onclick: B.ev ('set', ['settings', 'show'], true)}, 'Add one now']]]];

                     return ['div', {class: 'vgray lh-copy', style: style ({flex: 1, overflow: 'auto'}), opaque: true}, ['LITERAL', marked.parse (content || '')]];
                  }) (),
               ]],
               ['div', {class: 'flip-card-back project-pane project-right-pane', style: style ({overflow: 'auto'})}, [
                  ['div', {class: 'flex items-center justify-between mb3'}, [
                     ['span', {class: 'f4 fw6 vnearwhite'}, 'Settings'],
                     ['span', {class: 'f3 pointer light-blue', onclick: B.ev ('set', ['settings', 'show'], false)}, '×']
                  ]],
                  B.view ([['settings'], ['oauth']], function (settingsData, oauth) {
                     settingsData = settingsData || {};
                     oauth = oauth || {};
                     var openaiOAuth = settingsData.openaiOAuth || {};
                     var oauthLoading = oauth.loading;
                     var oauthStep = oauth.step;
                     var oauthCode = oauth.code;
                     var isPaste = oauthStep && oauthStep.provider === 'openai' && oauthStep.flow === 'paste_code';
                     var isWaiting = oauthStep && oauthStep.provider === 'openai' && oauthStep.flow === 'waiting';

                     return ['div', [
                        ['div', {class: 'f6 vgray mb3 lh-copy'}, 'Use your existing ChatGPT subscription. Logs in via OAuth — no API key needed.'],

                        ['div', {class: 'bg-vnavy', style: style ({'border-radius': 8, padding: '1rem', 'margin-bottom': '1rem', border: '1px solid ' + css.colors.vborderblue})}, [
                           ['div', {class: 'flex items-center justify-between mb2'}, [
                              ['span', {class: 'fw6 light-blue'}, 'ChatGPT Plus/Pro'],
                              openaiOAuth.loggedIn
                                 ? ['span', {class: 'f6', style: style ({color: openaiOAuth.expired ? '#f0ad4e' : css.colors.vgreen})}, openaiOAuth.expired ? '⚠ Expired' : '✓ Connected']
                                 : ['span', {class: 'f6 vpurple'}, '✗ Not connected']
                           ]],

                           openaiOAuth.loggedIn && ! isPaste && ! isWaiting ? ['div', {class: 'flex', style: style ({gap: '0.5rem'})}, [
                              openaiOAuth.expired ? ['button', {class: css.button + ' f6', onclick: B.ev ('login', 'oauth', 'openai'), disabled: oauthLoading === 'openai'}, 'Re-authenticate'] : [],
                              ['button', {class: css.button + ' f6', style: style ({'background-color': '#c44'}), onclick: B.ev ('logout', 'oauth', 'openai'), disabled: oauthLoading === 'openai'}, 'Logout']
                           ]] : [],

                           ! openaiOAuth.loggedIn && ! isPaste && ! isWaiting ? ['button', {
                              class: css.button + ' f6 mt2',
                              onclick: B.ev ('login', 'oauth', 'openai'),
                              disabled: oauthLoading === 'openai'
                           }, oauthLoading === 'openai' ? 'Opening browser...' : 'Login with ChatGPT'] : [],

                           isPaste ? ['div', {class: 'mt2'}, [
                              ['div', {class: 'f6 mb2 lh-copy', style: style ({color: '#f0ad4e'})}, 'A browser tab opened. After OpenAI redirects to localhost:1455, copy the full URL and paste it below.'],
                              ['div', {class: 'flex', style: style ({gap: '0.5rem'})}, [
                                 ['input', {
                                    class: 'bg-vmidnight',
                                    type: 'text',
                                    value: oauthCode || '',
                                    placeholder: 'Paste callback URL here...',
                                    oninput: B.ev ('set', ['oauth', 'code'], {raw: 'this.value'}),
                                    style: style ({flex: 1, padding: '0.5rem', 'border-radius': 6, border: 'none', color: css.colors.nearwhite, 'font-family': 'monospace', 'font-size': '12px'})
                                 }],
                                 ['button', {class: css.button + ' f6', onclick: B.ev ('complete', 'oauth', 'openai', oauthCode || ''), disabled: ! oauthCode || ! oauthCode.trim ()}, 'Submit'],
                                 ['button', {class: css.button + ' f6', style: style ({'background-color': css.colors.vborderblue}), onclick: B.ev (['rem', 'oauth', 'step'], ['rem', 'oauth', 'loading'])}, 'Cancel']
                              ]]
                           ]] : [],

                           isWaiting ? ['div', {class: 'mt2'}, [
                              ['div', {class: 'f6 mb2 lh-copy', style: style ({color: '#f0ad4e'})}, oauthLoading === 'openai' ? '⏳ Waiting for browser authentication...' : '✓ Authentication complete!'],
                              ['div', {class: 'f6 vgray mb2 lh-copy'}, 'Complete the login in the browser tab. This page will update automatically.'],
                              ['button', {class: css.button + ' f6', style: style ({'background-color': css.colors.vborderblue}), onclick: B.ev (['rem', 'oauth', 'step'], ['rem', 'oauth', 'loading'])}, 'Cancel']
                           ]] : []
                        ]]
                     ]];
                  })
               ]]
            ]]]];
            }),
         ]]
      ]];
   });
}

// *** ENTRYPOINT ***

B.call ('load', 'user');
B.mount ('body', views.main);


/* TODO: To be recycled later, perhaps
 *
 *
 *

   // *** OAUTH ***

   ['login', 'oauth', function (x, provider) {
      B.call (x, 'set', ['oauth', 'loading'], provider);
      B.call (x, 'post', '/settings/login/' + provider, {}, function (x, error, rs) {
         if (error) {
            B.call (x, 'rem', 'oauth', 'loading');
            return B.call (x, 'snackbar', 'error', 'Failed to start login');
         }
         window.open (rs.body.url, '_blank');
         if (rs.body.flow === 'paste_code') {
            B.call (x, 'set', ['oauth', 'step'], {provider: provider, flow: 'paste_code'});
            B.call (x, 'rem', 'oauth', 'loading');
         }
         else {
            B.call (x, 'set', ['oauth', 'step'], {provider: provider, flow: 'waiting'});
            B.call (x, 'complete', 'oauth', provider);
         }
      });
   }],

   ['complete', 'oauth', function (x, provider, code) {
      B.call (x, 'set', ['oauth', 'loading'], provider);
      B.call (x, 'post', '/settings/login/' + provider + '/callback', {code: code}, function (x, error, rs) {
         B.call (x, 'rem', [], 'oauth');
         if (error) return B.call (x, 'snackbar', 'error', 'Login failed');
         B.call (x, 'load', 'settings');
      });
   }],

   ['logout', 'oauth', function (x, provider) {
      if (! confirm ('Log out from ' + (provider === 'claude' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)') + ' subscription?')) return;
      B.call (x, 'post', '/settings/logout/' + provider, {}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to logout');
         B.call (x, 'load', 'settings');
      });
   }],


   // TODO: refactor from here below
   ['.modal-actions', {
      display: 'flex',
      gap: 12,
      'justify-content': 'flex-end',
      'margin-top': 20
   }],
   ['.project-shell', {
      display: 'flex',
      'flex-direction': 'column',
      gap: 24,
      padding: 24,
      'min-height': '100vh',
      'box-sizing': 'border-box'
   }],
   ['.project-main', {
      display: 'grid',
      'grid-template-columns': '23.6fr 76.4fr',
      gap: 24,
      flex: 1,
      width: 1,
      'min-height': 0,
      'box-sizing': 'border-box'
   }],
   ['.project-pane', {
      padding: 24,
      'border-radius': 18,
      border: '1px solid ' + css.colors.vborderblue,
      'background-color': css.colors.vnavy,
      'box-shadow': '0 20px 60px rgba(0, 0, 0, 0.22)',
      'box-sizing': 'border-box',
      'min-height': 0
   }],
   ['.project-left-pane', {
      'min-width': 0
   }],
   ['.project-right-pane', {
      'min-width': 0,
      display: 'flex',
      'flex-direction': 'column'
   }],
   ['.flip-card', {
      perspective: 1200,
   }],
   ['.flip-card-inner', {
      position: 'relative',
      width: 1,
      height: 1,
      transition: 'transform 0.6s ease',
      'transform-style': 'preserve-3d',
      'transform-origin': 'center center',
   }],
   ['.flip-card-inner.flipped', {
      transform: 'rotateY(180deg)',
   }],
   ['.flip-card-front, .flip-card-back', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      'backface-visibility': 'hidden',
      '-webkit-backface-visibility': 'hidden',
   }],
   ['.flip-card-back', {
      transform: 'rotateY(180deg)',
   }],




*/
