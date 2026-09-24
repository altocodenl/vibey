// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

B.r.addLog = function (log) {
   var stripContent = function (v) {
      var t = type (v);
      if (t === 'function') return '[FUNCTION] ' + v.toString ().slice (0, 50);
      if (t === 'string') return v.length <= 100 ? v : (v.slice (0, 100) + ' [OMITTED ' + (v.length - 100) + ' CHARACTERS]');
      if (t === 'array') return dale.go (v.length <= 99 ? v : (v.slice (0, 99).concat (' [OMITTED ' + (v.length - 99) + ' ITEMS]')), function (v2) {
         return stripContent (v2);
      });
      if (t === 'object') {
         var keys = dale.keys (v);
         if (keys.length > 99) {
            var n = keys.length - 99;
            keys = keys.slice (0, 99).concat ('OMITTED KEYS');
            v ['OMITTED KEYS'] = n;
         }
         return dale.obj (keys, function (k2) {
            return [k2, stripContent (v [k2])];
         });
      }
      return v;
   }
   log.args = stripContent (log.args);
   while (B.log.length >= 1000) B.log.shift ();
   B.log.push (log);
}

B.debug = function () {
   c ('body').innerHTML = '<pre>' + lith.entityify (cell.JSToText (B.r.log)) + '</pre>';
}


var type = teishi.type, inc = teishi.inc, eq = teishi.eq, style = lith.css.style, clog = console.log, s = B.store;

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

var size = function (bytes) {
   if (bytes < 1000) return bytes + 'B';
   if (bytes < 1000 * 1000) return Math.floor (bytes / 1000) + 'K';
   if (bytes < 10 * 1000 * 1000) return (bytes / (1000 * 1000)).toFixed (1) + 'M';
   if (bytes < 1000 * 1000 * 1000) return Math.floor (bytes / (1000 * 1000)) + 'M';
   if (bytes < 10 * 1000 * 1000 * 1000) return (bytes / (1000 * 1000 * 1000)).toFixed (1) + 'G';
   return Math.floor (bytes / (1000 * 1000 * 1000)) + 'G';
}

var shortcut = function (key, ev, x, verb, path, arg) {
   if (! ev.metaKey || ev.key !== key) return;
   ev.preventDefault ();
   return B.call (x, verb, path, arg);
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

// *** GLOBALS (we need these to be outside the store for performance reasons) ***

var content, editor;

// *** RESPONDERS ***

B.mrespond ([

   // *** TEST ***

   ['test', '*', function (x) {
      B.call (x, 'set', 'test', {enabled: true});
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

      var extensionProject = B.get ('extendClient');
      if (extensionProject && (hash [0] !== 'files' || hash [1] !== extensionProject)) {
         return window.location.reload ();
      }

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

      if (hash [0] !== 'files') B.call (x, 'rem', [], ['file', 'files']);

      if (hash [0] === 'files') {

         if (hash.length === 1) return B.call (x, 'navigate', 'projects');

         var projects = B.get ('projects');
         if (projects && ! dale.stop (projects, true, function (project) {
            return project.id === hash [1];
         })) return B.call (x, 'navigate', 'projects');

         B.call (x, 'set', 'project', hash [1]);

         var files = B.get ('files');

         var defaultFile = '';
         if (files) dale.stop (files, true, function (f) {
            if (f.name === 'main.md') {
               defaultFile = 'main.md';
               return true;
            }
         });
         if (! defaultFile && files && files.length) defaultFile = files [0].name;

         if (! hash [2] && defaultFile !== '') return B.call (x, 'navigate', 'files/' + hash [1] + '/' + encodeURIComponent (defaultFile));

         var file = decodeURIComponent (hash.slice (2).join ('/'));

         if (files && ! dale.stop (files, true, function (f) {
            if (f.name === file) return fileExists = true;
         })) return B.call (x, 'navigate', 'files/' + hash [1] + '/' + encodeURIComponent (defaultFile));

         B.call (x, 'set', ['file', 'name'], file);

         if (! B.get ('files')) B.call (x, 'list', 'files');
      }

      B.call (x, 'set', 'view', hash [0]);

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
               if (teishi.parse (error.body)) error.body = teishi.parse (error.body);
            }
            cb (x, error, rs);
         }
      });
   }],

   // *** ERROR ***

   ['report', 'error', function (x, error) {
      B.call (x, 'post', '/error', {priority: 'important', ...error});
   }],

   // *** KEYBOARD SHORTCUTS ***

   ['keydown', '*', function (x, ev) {
      if (ev.key === 'Meta') return B.call ('set', ['key', 'command'], true);

      if (B.get ('user', 'admin')) shortcut ('L', ev, x, 'test', 'all');
   }],

   [/^(keyup|blur)$/, '*', function (x, ev) {
      if (x.verb === 'keyup' && ev.key === 'Meta') B.call (x, 'rem', 'key', 'command');
      if (x.verb === 'blur') B.call (x, 'rem', 'key', 'command');
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
         B.call (x, 'load', 'projects');
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

   ['request', 'creator', function (x) {
      if (B.get ('user', 'creator') || B.get ('user', 'creatorRequest') || B.get ('user', 'mode') !== 'cloud') return;

      B.call (x, 'set', ['user', 'creatorRequest'], 'pending');
      B.call (x, 'post', '/creator/request', {}, function (x, error) {
         if (error) {
            B.call (x, 'rem', 'user', 'creatorRequest');
            return B.call (x, 'snackbar', 'error', (error.body || {}).error || 'Failed to request creator access');
         }
         B.call (x, 'set', ['user', 'creatorRequest'], 'sent');
         B.call (x, 'snackbar', 'ok', 'Creator access requested. An admin will review your request.');
      });
   }],

   ['change', 'projects', function (x) {
      B.call (x, 'read', 'hash');
   }],

   ['change', 'project', function (x) {
      B.call (x, 'rem', [], 'files');
   }],

   ['load', 'clientExtension', function (x) {
      var project = B.get ('project');
      var hash = window.location.hash.slice (2).split ('/');
      if (B.get ('extendClient') || hash [0] !== 'files' || hash [1] !== project) return;

      if (! dale.stop (B.get ('files') || [], true, function (file) {
         return file.name === 'extend-client.js';
      })) return;

      B.call (x, 'set', 'extendClient', project);
      B.call (x, 'post', '/project/read', {id: project, path: 'extend-client.js'}, function (x, error, rs) {
         var hash = window.location.hash.slice (2).split ('/');
         if (B.get ('extendClient') !== project || hash [0] !== 'files' || hash [1] !== project) return;
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading extend-client.js');

         try {
            // Run in global scope, with access to B, views, etc.
            window.eval (rs.body + '\n//# sourceURL=extend-client.js');
         }
         catch (error) {
            B.call (x, 'snackbar', 'error', 'There was a problem running extend-client.js');
         }
      });
   }],

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

      B.call (x, 'post', '/project', {name: name, slot: B.get ('new', 'project', 'slot')}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to create project');

         B.call (x, 'snackbar', 'clear');

         B.call (x, 'rem', 'new', 'project');
         B.call (x, 'rem', 'search', 'project');

         B.call (x, 'add', 'projects', {id: rs.body.id, name: name}); // Put the project in projects temporarily until the list of projects is refreshed, so we can navigate to it.
         B.call (x, 'navigate', 'files/' + rs.body.id + '/main.md');
         B.call (x, 'load', 'projects');
      });
   }],

   ['change', ['new', 'project'], {priority: -1000}, function (x) {
      if (B.get ('new', 'project') !== undefined) c ('#new-project-input').focus ();
   }],

   ['edit', 'project', function (x) {
      var edit = B.get ('edit', 'project');
      var name = edit.name.trim ();
      if (! name) return;

      B.call (x, 'put', '/project', {id: edit.id, name: name, slot: (edit.slot && edit.slot !== 'null') ? parseInt (edit.slot) : undefined}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to rename project');
         B.call (x, 'rem', 'edit', 'project');
         B.call (x, 'load', 'projects');
         B.call (x, 'snackbar', 'ok', 'Project renamed');
      });
   }],

   ['remove', 'project', function (x, project) {
      if (! confirm ('Delete project "' + project.name + '"? This cannot be undone.')) return;

      B.call (x, 'snackbar', 'yellow', 'Deleting project...');
      B.call (x, 'delete', 'project/' + project.id, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to delete project');
         B.call (x, 'load', 'projects');
         B.call (x, 'snackbar', 'ok', 'Project deleted');
      });
   }],

   ['keydown', '*', function (x, ev) {

      if (B.get ('view') !== 'projects') return;

      if (inc (['1', '2', '3', '4', '5'], ev.key)) {
         var projects = B.get ('projects');
         var project;
         if (B.get ('search', 'project') === undefined) {
            project = dale.stopNot (projects, undefined, function (project) {
               if (project.slot === parseInt (ev.key)) return project;
            });
         }
         if (B.get ('search', 'project') !== undefined && projects) {
            var filteredProjects = dale.fil (projects, undefined, function (project) {
               if (project.name.match (B.get ('search', 'project'))) return project;
            });
            project = filteredProjects [parseInt (ev.key) - 1];
         }
         if (project) shortcut (ev.key, ev, x, 'navigate', 'files/' + project.id);
      }

      if (ev.metaKey && ev.key === 's') {
         shortcut ('s', ev, x, 'set', ['search', 'project'], '');
         c ('#search-project').focus ();
      }

      if (ev.key === 'Enter' && c ('#create-project') && ! c ('#create-project').disabled) return B.call (x, 'create', 'project');

      if (B.get ('search', 'project') !== undefined && B.get ('new', 'project') === undefined) {
         if (ev.metaKey && ev.key === 'b') {
            c ('#search-project').blur ();
            shortcut ('b', ev, x, 'rem', 'search', 'project');
         }
         shortcut ('e', ev, x, 'set', ['new', 'project'], {slot: undefined});
      }

      if (B.get ('new', 'project') !== undefined) {
         if (ev.key === 'Escape') return B.call (x, 'rem', 'new', 'project');
         if (! c ('#create-project').disabled) shortcut ('e', ev, x, 'create', 'project');
         if (ev.metaKey && ev.key === 'd') {
            ev.preventDefault ();
            c ('#dice-project').click ();
         }
      }

   }],

   // *** FILES ***

   ['change', 'files', {priority: -1000}, function (x) {
      B.call (x, 'read', 'hash');
      var selected = c ('#selected-file');
      if (selected) selected.scrollIntoView ({block: 'center'});
   }],

   ['change', ['file', 'name'], {priority: -1000}, function (x) {
      B.call (x, 'read', 'file');
      var selected = c ('#selected-file');
      if (selected) selected.scrollIntoView ({block: 'center'});
   }],

   ['keydown', '*', function (x, ev) {

      if (B.get ('view') !== 'files') return;
      if (B.get ('upload')) return;

      var recipient = ev.target && ev.target.closest && ev.target.closest ('.chat-recipient');
      if (recipient && ! ev.isComposing && ! ev.altKey && ! ev.ctrlKey && ! ev.metaKey) {
         if (ev.key === 'Escape') {
            ev.preventDefault ();
            ev.target.blur ();
            return;
         }
         var options = Array.from (recipient.querySelectorAll ('.chat-recipient-options button'));
         if (ev.key === 'Enter' && ev.target.id === 'chat-to' && options.length === 1) {
            ev.preventDefault ();
            options [0].click ();
            return;
         }
         if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            if (! options.length) return;

            ev.preventDefault ();
            var index = options.indexOf (document.activeElement);
            if (index === -1) index = ev.key === 'ArrowDown' ? 0 : options.length - 1;
            else index = (index + (ev.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options [index].focus ();
            return;
         }
      }

      if (ev.metaKey && ev.key === '/') {
         var contentSearch = c ('#search-text') || c ('#search-messages');
         if (contentSearch) {
            ev.preventDefault ();
            contentSearch.focus ();
            return;
         }
      }

      if (ev.target && ev.target.id === 'search-text' && ! ev.isComposing) {
         if (ev.key === 'Escape') {
            ev.preventDefault ();
            ev.target.value = '';
            return B.call (x, 'set', ['search', 'content', 'query'], '');
         }
         if (ev.key === 'Enter') {
            ev.preventDefault ();
            return B.call (x, 'find', 'content', ev.shiftKey);
         }
      }

      if (ev.metaKey && ev.key === 'd' && c ('#chat-to')) {
         ev.preventDefault ();
         c ('#chat-to').focus ();
         c ('#chat-to').select ();
         return;
      }

      if (ev.metaKey && ev.key === 'Enter' && c ('#chat-editor')) {
         ev.preventDefault ();
         return B.call (x, 'create', 'message', B.get ('message', 'to'), B.get ('file', 'name'), B.get ('message', 'body'));
      }

      if (ev.key === 'Enter' && c ('#create-file') && ! c ('#create-file').disabled) return B.call (x, 'create', 'file');
      if (ev.key === 'Enter' && c ('#rename-file') && ! c ('#rename-file').disabled) return B.call (x, 'rename', 'file');

      shortcut ('b', ev, x, 'navigate', 'projects');
      shortcut ('9', ev, x, 'set', ['settings', 'show'], ! B.get ('settings', 'show'));

      if (B.get ('new', 'file') === undefined) {
         if (ev.metaKey && ev.key === 's') {
            ev.preventDefault ();
            c ('#search-file').focus ();
         }
         if (c ('.messages') [0]) {
            shortcut ('o', ev, x, 'scroll', 'chat', -1);
            shortcut ('i', ev, x, 'scroll', 'chat', 1);
         }
         else shortcut ('i', ev, x, 'set', ['file', 'mode'], B.get ('file', 'mode') === 'edit' ? 'view' : 'edit');
         if (ev.metaKey && ev.key === 'e') {
            ev.preventDefault ();
            B.call (x, 'set', ['new', 'file'], '');
            B.call (x, 'set', ['new', 'type'], 'file');
         }
         if (ev.metaKey && ev.key === 'm' && editor) {
            ev.preventDefault ();
            editor.focus ();
         }
         shortcut ('u', ev, x, 'remove', 'file', B.get ('file', 'name'));
         if (B.get ('file', 'name') && ! B.get ('edit', 'file')) shortcut ('y', ev, x, 'set', ['edit', 'file'], {
            newName: B.get ('file', 'name'),
            oldName: B.get ('file', 'name'),
         });

         if (ev.metaKey && (ev.key === 'j' || ev.key === 'k')) {
            var files = B.get ('files'), current = B.get ('file', 'name');
            if (! files || ! files.length) return;
            ev.preventDefault ();

            var search = B.get ('search', 'file');
            files = dale.fil (files, undefined, function (file) {
               if (search && ! file.name.match (search)) return;
               return file;
            });

            var index = dale.stopNot (files, undefined, function (f, k) {
               if (f.name === current) return k;
            });
            if (index === undefined) index = 0;
            var next = ev.key === 'j' ? index + 1 : index - 1;
            if (next < 0) next = files.length - 1;
            if (next >= files.length) next = 0;
            return B.call (x, 'navigate', 'files/' + B.get ('project') + '/' + files [next].name);
         }
      }

      if (B.get ('new', 'file') !== undefined) {
         if (ev.key === 'Escape') return B.call (x, 'rem', 'new', 'file');
         if (c ('#create-file') && ! c ('#create-file').disabled) shortcut ('e', ev, x, 'create', 'file');
         shortcut ('f', ev, x, 'set', ['new', 'type'], 'file');
         shortcut ('i', ev, x, 'set', ['new', 'type'], 'chat');
         shortcut ('x', ev, x, 'rem', 'new', 'file');
         if (ev.metaKey && (ev.key === 'u' || ev.key === 'r')) {
            var input = c (ev.key === 'u' ? '#upload-file' : '#upload-folder');
            if (input) {
               ev.preventDefault ();
               input.click ();
            }
         }
      }

      if (B.get ('edit', 'file') !== undefined) {
         if (ev.key === 'Escape') return B.call (x, 'rem', 'edit', 'file');
         if (c ('#rename-file') && ! c ('#rename-file').disabled) shortcut ('e', ev, x, 'rename', 'file');
      }
   }],

   ['change', ['new', 'file'], {priority: -1000}, function (x) {
      if (B.get ('new', 'file') !== undefined) c ('#new-file-input').focus ();
   }],

   ['change', ['edit', 'file'], {priority: -1000}, function (x) {
      if (B.get ('edit', 'file') !== undefined) c ('#edit-file-input').focus ();
   }],

   ['list', 'files', function (x) {
      // If no projects loaded yet, retry in 10ms.
      if (! B.get ('projects')) return setTimeout (function () {
         if (! B.get ('files')) B.call (x, 'list', 'files');
      }, 10);

      var project = dale.stopNot (B.get ('projects'), undefined, function (project) {
         if (project.id === B.get ('project')) return project;
      });
      if (! project) return B.call (x, 'navigate', 'projects');

      if (! B.get ('files')) B.call (x, 'mset', 'files', []); // Set it to an empty array to prevent multiple in-flight calls.
      B.call (x, 'post', '/project/run', {id: project.id, read: true, command: "find /project -type f -not -path '/project/.git/*' -printf '%s %T@ %p\\n' | sort -t/ -k3"}, function (x, error, rs) {
         if (B.get ('project') !== project.id) return;
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading files');
         var files = dale.fil ((rs.body.stdout || '').split ('\n'), undefined, function (line) {
            if (! line) return;
            var first = line.indexOf (' ');
            var second = line.indexOf (' ', first + 1);
            return {
               mtime: Math.round (parseFloat (line.slice (first + 1, second)) * 1000),
               name: line.slice (second + 1).replace ('/project/', ''),
               size: parseInt (line.slice (0, first)),
            };
         });
         B.call (x, 'set', 'files', files);

         B.call (x, 'load', 'clientExtension');
         B.call (x, 'read', 'file');
      });
   }],

   ['read', 'file', async function (x) {
      var project = dale.stopNot (B.get ('projects'), undefined, function (project) {
         if (project.id === B.get ('project')) return project;
      });
      var name = B.get ('file', 'name');
      if (! project || name === undefined || name === '') return;

      content = undefined;
      B.call (x, 'change', 'file');

      if (/\.(avif|bmp|gif|jpe?g|png|webp)$/i.test (name)) return;

      try {
         // TODO: replace with c.ajax when cocholate supports responseType
         var headers = {'content-type': 'application/json'};
         if (B.get ('user', 'csrf')) headers ['x-csrf'] = B.get ('user', 'csrf');
         var rs = await fetch ('/project/read', {
            body: JSON.stringify ({id: project.id, path: name}),
            headers: headers,
            method: 'POST',
         });
         if (! rs.ok) throw rs;
         var binary = rs.headers.get ('x-binary');
         var newContent = binary ? new Uint8Array (await rs.arrayBuffer ()) : await rs.text ();
         if (B.get ('project') !== project.id || B.get ('file', 'name') !== name) return;
         content = newContent;
         if (/^chat\/.+\.md$/.test (name) && ! (B.get ('message', 'to') || '').trim ()) {
            var entries = content.split (/^əəə head [0-9a-f-]{36}\n/im).slice (1).reverse ();
            var recipient = dale.stopNot (entries, undefined, function (entry) {
               var body = entry.match (/^əəə body [0-9a-f-]{36}\n/im);
               if (! body) return;
               var head = entry.slice (0, body.index);
               var from = head.match (/^from (.+)$/m);
               if (! from || /^(ai-|shell$|systemPrompt$|main\.md$)/.test (from [1])) return;
               var to = head.match (/^to (.+)$/m);
               to = to ? to [1].trim () : '';
               return /^(ai-|shell$)/.test (to) ? to : 'all';
            }) || 'all';
            B.call (x, 'set', ['message', 'to'], recipient);
         }
         B.call (x, 'change', 'file');
         if (/^chat\/.+\.md$/.test (name)) requestAnimationFrame (function () {
            if (B.get ('view') !== 'files' || B.get ('project') !== project.id || B.get ('file', 'name') !== name) return;
            var messages = c ('.messages') [0];
            if (messages) messages.scrollTop = messages.scrollHeight;
         });
      }
      catch (error) {
         if (B.get ('project') !== project.id || B.get ('file', 'name') !== name) return;
         B.call (x, 'snackbar', 'error', 'There was a problem loading the file');
      }
   }],

   ['download', 'file', function (x) {
      var file = B.get ('file');
      if (! file || ! file.name) return;

      var link = document.createElement ('a');
      link.download = file.name.split ('/').pop ();
      link.href = '/project/' + encodeURIComponent (B.get ('project')) + '/file/' + file.name.split ('/').map (encodeURIComponent).join ('/');
      document.body.appendChild (link);
      link.click ();
      link.remove ();
   }],

   ['write', 'file', function (x, name, newContent, New) {
      var project = B.get ('project');
      B.call (x, 'post', '/project/write', {id: project, path: name, content: newContent}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem ' + (New ? 'creating' : 'saving') + ' the file');
         if (B.get ('project') !== project) return;

         if (New) B.call (x, 'navigate', 'files/' + project + '/' + name);
         if (! New && B.get ('file', 'name') === name) content = newContent;

         dale.go (B.get ('files') || [], function (file, index) {
            if (file.name === name) {
               B.call (x, 'set', ['files', index, 'mtime'], Date.now ());
               B.call (x, 'set', ['files', index, 'size'], newContent.length);
            }
         });
      });
   }],

   ['create', 'file', function (x) {
      var name = B.get ('new', 'file').trim ();

      if (name.length === 0) return B.call (x, 'snackbar', 'error', 'Please enter a name');

      if (! name.match (/\.[a-z]{2,3}$/i)) name += '.md';
      if (B.get ('new', 'type') === 'chat') name = 'chat/' + name;

      B.call (x, 'write', 'file', name, '', 'new');

      B.call (x, 'add', 'files', {name}); // Put the file in files temporarily until the list of projects is refreshed, so we can navigate to it.
      if (B.get ('file', 'name') === name) B.call (x, 'navigate', 'files/' + B.get ('project'), + '/' + encodeURIComponent (name));

      B.call (x, 'rem', 'new', 'file');
      B.call (x, 'list', 'files');
   }],

   ['remove', 'file', function (x, name) {
      if (! confirm ('Delete file "' + name + '"? This cannot be undone.')) return;

      var project = dale.stopNot (B.get ('projects'), undefined, function (project) {
         if (project.id === B.get ('project')) return project;
      });
      if (! project) return;

      var path = "'" + ('/project/' + name).replace (/'/g, "'\\''") + "'";
      B.call (x, 'post', '/project/run', {id: project.id, command: 'rm -- ' + path}, function (x, error, rs) {
         if (error || rs.body.code) return B.call (x, 'snackbar', 'error', 'Failed to delete file');
         B.call (x, 'list', 'files');
         if (B.get ('file', 'name') === name) B.call (x, 'navigate', 'files/' + B.get ('project'));
      });
   }],

   ['rename', 'file', function (x, oldName, newName) {

      if (dale.stop (newName.split ('/'), true, function (part) {
         return part === '..' || part === '.' || part === '.git' || part === '';
      })) return B.call (x, 'snackbar', 'error', 'Please enter a valid relative file path');

      var projectId = B.get ('project');
      var quote = function (value) {
         return "'" + value.replace (/'/g, "'\\''") + "'";
      }
      var source = quote ('/project/' + oldName);
      var target = quote ('/project/' + newName);
      var oldFolder = oldName.split ('/').slice (0, -1).join ('/');
      var newFolder = quote ('/project/' + newName.split ('/').slice (0, -1).join ('/'));

      var command = '{ mkdir -p -- ' + newFolder + ' && mv -nT -- ' + source + ' ' + target + ' && test ! -e ' + source + ' && test ! -L ' + source + '; } || exit 1';
      if (oldFolder) command += '; rmdir -- ' + quote ('/project/' + oldFolder) + ' 2>/dev/null || true';

      B.call (x, 'post', '/project/run', {
         command: command,
         id: projectId,
      }, function (x, error, rs) {
         if (error || rs.body.code) return B.call (x, 'snackbar', 'error', 'Failed to rename file: check if there is a file in the way of the path you are setting');
         if (B.get ('project') !== projectId) return;
         B.call (x, 'rem', 'edit', 'file');
         B.call (x, 'add', 'files', {name: newName}); // Put the file in files temporarily until the list of projects is refreshed, so we can navigate to it.
         B.call (x, 'list', 'files');
         if (B.get ('file', 'name') === oldName) B.call (x, 'navigate', 'files/' + projectId + '/' + encodeURIComponent (newName));
      });
   }],

   ['upload', '*', function (x, files) {
      if (! files || ! files.length || B.get ('upload')) return;
      var projectId = B.get ('project');
      var done = 0, finished = 0, total = files.length;
      B.call (x, 'set', 'upload', {done: done, total: total});

      var complete = function (error, name) {
         finished++;
         if (! error) B.call (x, 'set', ['upload', 'done'], ++done);
         if (finished !== total) return;

         B.call (x, 'rem', [], 'upload');
         if (done !== total) {
            B.call (x, 'snackbar', 'error', 'Uploaded ' + done + ' of ' + total + ' files; ' + (total - done) + ' failed');
         }
         else {
            B.call (x, 'rem', 'new', ['file', 'type']);
            B.call (x, 'snackbar', 'ok', 'Uploaded ' + total + ' file' + (total > 1 ? 's' : ''));
         }
         if (B.get ('project') !== projectId) return;
         B.call (x, 'list', 'files');
         B.call (x, 'add', 'files', {name}); // Put the file in files temporarily until the list of projects is refreshed, so we can navigate to it.
         if (total === 1 && done === total) B.call (x, 'navigate', 'files/' + projectId + '/' + encodeURIComponent (name));
      }

      dale.go (files, function (file) {
         var reader = new FileReader ();
         reader.onload = function () {
            var binary = new Uint8Array (reader.result).slice (0, 512).indexOf (0) !== -1;
            var name = file.webkitRelativePath || file.name;
            var body = {
               id: projectId,
               path: name,
            };
            if (binary) {
               body.base64 = true;
               var bytes = new Uint8Array (reader.result);
               body.content = '';
               dale.go (bytes, function (b) {
                  body.content += String.fromCharCode (b);
               });
               body.content = btoa (body.content);
            }
            else {
               body.content = new TextDecoder ().decode (reader.result);
            }
            B.call (x, 'post', '/project/write', body, function (x, error) {
               complete (error, name);
            });
         }
         reader.onerror = reader.onabort = function () {
            complete (true, file.webkitRelativePath || file.name);
         }
         reader.readAsArrayBuffer (file);
      });
   }],

   ['change', [/^(projects|project|file|settings)$/], {match: B.changeResponder, priority: -1000}, function (x) {
      if (B.get ('view') !== 'files') return;

      var name = B.get ('file', 'name') || '';

      // *** EDITOR ***

      if (editor) editor.getWrapperElement ().remove ();

      if (c ('#file-editor')) {
         editor = CodeMirror (c ('#file-editor'), {
            keyMap: B.get ('user', 'admin') ? 'vim' : undefined,
            lineWrapping: true,
            mode: name.match (/\.js$/) ? 'javascript' : name.match (/\.py$/) ? 'python' : name.match (/\.md$/) ? 'markdown' : null,
            value: content || '',
         });

         editor.setCursor (editor.lineCount () - 1, Infinity);
         editor.focus ();
         editor.on ('change', function (cm) {
            var newContent = cm.getValue ();
            if (content !== newContent) B.call (x, 'write', 'file', B.get ('file', 'name'), newContent);
            B.call (x, 'highlight', 'content');
         });
      }

      if (c ('#chat-editor')) {
         editor = CodeMirror (c ('#chat-editor'), {
            keyMap: B.get ('user', 'admin') ? 'vim' : undefined,
            lineWrapping: true,
            mode: 'markdown',
            value: B.get ('message', 'body') || '',
         });

         editor.setCursor (editor.lineCount () - 1, Infinity);
         editor.focus ();
         editor.on ('change', function (cm) {
            B.call (x, 'set', ['message', 'body'], cm.getValue ());
         });
      }
      B.call (x, 'highlight', 'content');
   }],

   ['change', ['search', 'content', 'query'], function (x) {
      B.call (x, 'highlight', 'content');
   }],

   ['change', 'view', {priority: -1001}, function (x) {
      B.call (x, 'highlight', 'content');
   }],

   ['highlight', 'content', function (x) {
      B.call (x, 'set', ['search', 'content', 'current'], 0);
      if (B.get ('view') !== 'files' || ! editor || ! c ('#file-editor')) {
         return B.call (x, 'set', ['search', 'content', 'count'], 0);
      }

      var query = B.get ('search', 'content', 'query') || '';
      editor.operation (function () {
         if (editor.state.contentSearchCurrent) editor.state.contentSearchCurrent.clear ();
         editor.state.contentSearchCurrent = undefined;
         dale.go (editor.state.contentSearchMarks || [], function (mark) {
            mark.clear ();
         });
         editor.state.contentSearchMarks = [];
         if (! query) return;

         var cursor = editor.getSearchCursor (query, {
            ch: 0,
            line: 0,
         }, true);
         while (cursor.findNext ()) {
            editor.state.contentSearchMarks.push (editor.markText (cursor.from (), cursor.to (), {
               className: 'content-search-match',
            }));
         }
      });
      B.call (x, 'set', ['search', 'content', 'count'], editor.state.contentSearchMarks.length);
   }],

   ['find', 'content', function (x, backwards) {
      var query = B.get ('search', 'content', 'query') || '';
      if (! query || ! editor || ! c ('#file-editor')) return;

      var cursor = editor.getSearchCursor (
         query,
         editor.getCursor (backwards ? 'from' : 'to'),
         true
      );
      if (! cursor.find (backwards)) {
         cursor = editor.getSearchCursor (query, backwards ? {
            ch: editor.getLine (editor.lastLine ()).length,
            line: editor.lastLine (),
         } : {
            ch: 0,
            line: 0,
         }, true);
         if (! cursor.find (backwards)) return;
      }

      if (editor.state.contentSearchCurrent) editor.state.contentSearchCurrent.clear ();
      editor.state.contentSearchCurrent = editor.markText (cursor.from (), cursor.to (), {
         className: 'content-search-current',
      });
      var current = dale.stopNot (editor.state.contentSearchMarks || [], undefined, function (mark, index) {
         var range = mark.find ();
         if (range && range.from.line === cursor.from ().line && range.from.ch === cursor.from ().ch) return index + 1;
      });
      B.call (x, 'set', ['search', 'content', 'current'], current || 0);
      editor.setSelection (cursor.from (), cursor.to ());
      editor.scrollIntoView ({
         from: cursor.from (),
         to: cursor.to (),
      });
   }],

   // *** CHATS ***

   ['cancel', 'message', function (x, id) {
      var project = B.get ('project');
      var name = B.get ('file', 'name');
      if (! project || ! name || typeof content !== 'string') return;
      if (B.get ('cancelling', id)) return;

      var head = content.match (new RegExp (
         '^əəə head ' + id + '\\n[\\s\\S]*?^əəə body ' + id + '\\n', 'im'
      ));
      if (! head || ! /^pending 1$/m.test (head [0])) return;

      B.call (x, 'set', ['cancelling', id], true);
      B.call (x, 'post', '/project/edit', {
         id: project,
         newText: head [0].replace (/^pending 1$/m, 'cancelled ' + new Date ().toISOString () + '\npending 0'),
         oldText: head [0],
         path: name,
      }, function (x, error) {
         B.call (x, 'rem', 'cancelling', id);
         if (error) return B.call (x, 'snackbar', 'error', 'Could not stop the message; it may have already finished');
         if (B.get ('project') !== project || B.get ('file', 'name') !== name) return;
         B.call (x, 'read', 'file');
      });
   }],

   ['scroll', 'chat', function (x, direction) {
      var viewport = c ('.messages') [0];
      if (! viewport) return;

      var rows = Array.from (viewport.children);
      var up = direction < 0;
      if (! up) rows.reverse ();

      var top = viewport.getBoundingClientRect ().top + viewport.clientTop;
      var bottom = top + viewport.clientHeight;
      var tolerance = parseFloat (getComputedStyle (document.documentElement).fontSize) / 16;

      var target = dale.stopNot (rows, undefined, function (row, index) {
         var rect = row.getBoundingClientRect ();
         if (rect.bottom <= top + tolerance || rect.top >= bottom - tolerance) return;

         var fullyVisible = rect.top >= top - tolerance && rect.bottom <= bottom + tolerance;
         var oversized = rect.height > viewport.clientHeight;
         var aligned = Math.abs (up ? rect.top - top : rect.bottom - bottom) <= tolerance;

         if (fullyVisible || (oversized && aligned)) {
            return index === 0 ? false : rows [index - 1].getBoundingClientRect ();
         }
         return rect;
      });

      if (target) viewport.scrollTop += up ? target.top - top : target.bottom - bottom;
   }],

   ['change', [/^(content|file|project|view)$/], {match: B.changeResponder}, function (x) {
      var name = B.get ('file', 'name') || '';
      var project = B.get ('project');
      var pending = [];
      if (B.get ('view') === 'files' && project && /^chat\/.+\.md$/.test (name) && type (content) === 'string') {
         var heads = /^əəə head ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n([\s\S]*?)^əəə body \1\n/gim;
         var match;
         while ((match = heads.exec (content))) {
            if (/^pending 1$/m.test (match [2])) pending.push (project + '/' + name + '/' + match [1]);
         }
      }
      B.call (x, 'set', ['pending', 'messages'], pending);
   }],

   ['change', ['pending', 'messages'], function (x) {
      var pending = B.get ('pending', 'messages') || [];
      dale.go (pending, function (key) {
         if (B.get ('pending', 'requests', key) !== undefined) return;
         var parts = key.split ('/');
         var project = parts.shift ();
         var id = parts.pop ();
         var name = parts.join ('/');
         var inFlight = false;

         // TODO: remove
         //return;

         var interval = setInterval (function () {
            if (B.get ('pending', 'requests', key) !== interval) return clearInterval (interval);
            if (inFlight) return;
            inFlight = true;
            B.call (x, 'put', '/project/message', {
               file: name,
               messageId: id,
               projectId: project,
            }, function (x, error, rs) {
               inFlight = false;
               if (error || B.get ('pending', 'requests', key) !== interval) return;
               if (B.get ('project') !== project || B.get ('file', 'name') !== name || typeof content !== 'string') return;

               var head = content.match (new RegExp ('^əəə head ' + id + '\\n', 'im'));
               if (! head) return;
               var rest = content.slice (head.index + head [0].length);
               var nextHead = rest.match (/^əəə head [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n/im);
               var end = nextHead ? head.index + head [0].length + nextHead.index - 1 : content.length;
               var updated = content.slice (0, head.index) + rs.body + content.slice (end);
               if (updated === content) return;
               var body = rs.body.match (/^əəə body [0-9a-f-]{36}\n/im);
               var finished = body && ! /^pending 1$/m.test (rs.body.slice (0, body.index));
               content = updated;
               B.call (x, 'change', 'content');
               if (finished) B.call (x, 'list', 'files');
            });
         }, 100);
         B.call (x, 'set', ['pending', 'requests', key], interval);
      });
      dale.go (B.get ('pending', 'requests') || {}, function (interval, key) {
         if (inc (pending, key)) return;
         clearInterval (interval);
         B.call (x, 'rem', ['pending', 'requests'], key);
      });
   }],

   ['change', [/^(content|file)$/], {match: B.changeResponder, priority: -1001}, function (x) {
      var messages = c ('.messages') [0];
      if (messages && messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100) messages.scrollTop = messages.scrollHeight;
   }],

   ['create', 'message', function (x, to, name, body) {
      var project = B.get ('project');
      if (! project || B.get ('file', 'name') !== name) return;
      if (! body.trim ()) return;

      to = (to || '').trim () || 'all';

      B.call (x, 'post', '/project/message', {
         body: body,
         file: name,
         id: project,
         to: to,
      }, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem sending the message');
         if (B.get ('project') !== project || B.get ('file', 'name') !== name) return;
         if (B.get ('message', 'body') === body) B.call (x, 'set', ['message', 'body'], '');
         B.call (x, 'read', 'file');
      });
   }],

   // *** CREDENTIALS ***

   ['start', 'pkce', function (x, provider) {
      B.call (x, 'set', ['pkce', 'loading'], provider);
      B.call (x, 'post', '/credentials/' + provider + '/start', {}, function (x, error, rs) {
         if (error) {
            B.call (x, 'rem', 'pkce', 'loading');
            return B.call (x, 'snackbar', 'error', 'Failed to start login');
         }
         window.open (rs.body.url, '_blank');
         B.call (x, 'set', ['pkce', 'step'], {provider: provider, flow: 'paste_code'});
         B.call (x, 'rem', 'pkce', 'loading');
      });
   }],

   ['complete', 'pkce', function (x, provider, code) {
      B.call (x, 'set', ['pkce', 'loading'], provider);
      B.call (x, 'post', '/credentials/' + provider + '/complete', {code: code}, function (x, error, rs) {
         B.call (x, 'rem', [], 'pkce');
         if (error) return B.call (x, 'snackbar', 'error', 'Login failed');
         B.call (x, 'load', 'user');
      });
   }],

   ['save', 'apiKey', function (x, provider, key) {
      B.call (x, 'post', '/credentials/' + provider + '/apiKey', {key: key}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to save API key');
         B.call (x, 'rem', [], 'pkce');
         B.call (x, 'load', 'user');
      });
   }],

   ['remove', 'credential', function (x, provider, name) {
      if (! confirm ('Remove ' + (provider === 'anthropic' ? 'Anthropic' : 'OpenAI') + ' ' + (name === 'account' ? 'account' : 'API key') + '?')) return;
      B.call (x, 'delete', '/credentials/' + provider + '/' + name, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to remove credential');
         B.call (x, 'load', 'user');
      });
   }],


]);

// *** VIEWS ***

var css = {
   button: 'bg-vblue bn br2 fw6 pa3 pointer white',
   colors: {
      vblack:          '#000000',
      vblue:           '#4a69bd',
      vbrick:          '#bd5654',
      vdeepnavy:       '#0f1530',
      vgray:           '#9aa4bf',
      vgreen:          '#27ae60',
      vlightblue:      '#94b8ff',
      vlightgray:      '#eeeeee',
      vmidnight:       '#1a1a2e',
      vnavy:           '#16213e',
      vnearwhite:      '#f5f7ff',
      vorange:         '#c87533',
      vpurple:         '#c084fc',
      vred:            '#d33e43',
      vturquoise:      '#1abc9c',
      vwhite:          '#ffffff',
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

   // *** CHAT ***

   ['.chat-recipient-options', {display: 'none'}],
   ['.chat-recipient:focus-within .chat-recipient-options', {display: 'block'}],
   ['.chat-recipient-options button:focus, .chat-recipient-options button:only-child', {
      'background-color': css.colors.vhighlightblue,
   }],
   ['.chat-message a', {
      color: 'inherit',
      'text-decoration': 'underline',
   }],
   ['.chat-message a:hover', {
      color: css.colors.vlightblue,
   }],

   // *** SPINNY ***

   ['LITERAL', '@keyframes spinny {0%, 24.99% { content: "|"; } 25%, 49.99% { content: "/"; } 50%, 74.99% { content: "-"; } 75%, 100% { content: "\\\\"; }}'],
   ['.spinny:before', {
      content: '"|"',
      animation: 'spinny 0.8s steps(1) infinite'
   }],
]

// *** UTILITY VIEWS ***

var views = {};

views.tooltip = function (tooltip, placement) {
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
            top: placement === 'below' ? '100%' : '-1.75rem',
            transform: 'translateX(-50%)',
            'z-index': 10
         }),
      }, tooltip];
   });
}

views.spinny = function (color) {
   return ['span', {
      class: 'b code dib f2 lh-solid spinny tc ' + (color || 'vblue'),
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
                  gap: view === 'files' ? '0.5rem' : '1.5rem',
                  margin: view === 'files' ? '0.75rem 1.5rem 0 0' : 'calc(1.5rem - 2vh) 1.5rem 0 0',
               })
            }, [

               // Settings
               B.view ([['settings', 'show'], ['view']], function (showSettings, view) {
                  if (view !== 'files') return ['span'];
                  return ['button', {
                     class: css.button + ' bg-mid-gray f6 relative',
                     style: style ({padding: '0.5rem 0.875rem'}),
                     onclick: B.ev ('set', ['settings', 'show'], ! B.get ('settings', 'show'))
                  }, [
                     views.tooltip ('9', 'below'),
                     ['i', {class: 'bi mr1 ' + (showSettings ? 'bi-check-lg' : 'bi-wrench-adjustable mr1')}],
                     showSettings ? 'Done with this' : 'Settings'
                  ]];
               }),

               // Account and logout
               B.view (['user', 'email'], function (email) {
                  var logout = ['button', {
                     class: css.button + ' bg-vpurple ' + (view === 'files' ? 'f6' : 'f5 pa2 ph3'),
                     style: view === 'files' ? style ({padding: '0.5rem 0.875rem'}) : undefined,
                     onclick: B.ev ('logout', []),
                     title: email || '',
                  }, [
                     ['i', {class: 'bi bi-person-walking mr1'}],
                     'Logout'
                  ]];
                  if (view !== 'projects') return logout;
                  return ['div', {
                     class: 'bg-vmidnight border-box flex flex-column vnearwhite',
                     style: style ({
                        'border-radius': '1.125rem',
                        gap: '1rem',
                        'max-width': '18rem',
                        padding: '1.125rem',
                        width: '18vw',
                     }),
                  }, [
                     ['div', {class: 'f6 lh-copy'}, [
                        'Logged in as ',
                        ['span', {
                           class: 'fw6',
                           style: style ({'overflow-wrap': 'anywhere'}),
                        }, email || 'local user'],
                     ]],
                     logout,
                  ]];
               })
            ]];

         }) (),

         // Dynamic view
         (function () {
            if (! views [view]) return ['div'];
            return ['div', {class: 'vh-100'}, views [view] ()];
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
         ['div', {class: 'ba bg-vdeepnavy br3 mw6 pa4 pa5-ns shadow-3 vborderblue-border vnearwhite w-100'}, [
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
               }, emailValid ? (user.loginLinkRequested ? 'Send another link' : 'Let me in') : 'Enter your email'],
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
         class: 'bg-vdeepnavy',
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

views.projectColor = function (text, textOnly) {

   var projectColors = [
      {bg: 'bg-vturquoise',   fg: 'vdeepnavy'},
      {bg: 'bg-green',        fg: 'vdeepnavy'},
      {bg: 'bg-gold',         fg: 'vdeepnavy'},
      {bg: 'bg-silver',       fg: 'vdeepnavy'},
      {bg: 'bg-vpurple',      fg: 'vdeepnavy'},
      {bg: 'bg-vorange',      fg: 'vdeepnavy'},
      {bg: 'bg-vbrick',       fg: 'vnearwhite'},
   ];

   var sum = dale.acc (((text || '') + '').split (''), 0, function (a, b) {
      return a + b.charCodeAt (0);
   });
   var colors = projectColors [sum % projectColors.length];
   return textOnly ? colors.bg.replace (/^bg-/, '') : colors.bg + ' ' + colors.fg;
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

   return B.view ([['projects'], ['user', 'email'], ['search', 'project'], ['user', 'creator']], function (projects, email, search, creator) {
      var columnWidth = search !== undefined ? '74vw' : 'calc(' + vw (containerWidth) + ' + 10vw)';
      var emailHue = dale.go ((email || '').split (''), function (c) { return c.charCodeAt (0); }).reduce (function (a, b) { return a + b; }, 0) % 360;

      if (! projects) return ['div', {
         class: 'bg-vdeepnavy flex flex-wrap items-center justify-center min-vh-100 vnearwhite',
         style: style ({gap: '2rem'}),
      }, dale.go (dale.times (80), () => views.spinny ())];


      return ['div', {
         class: 'bg-vdeepnavy flex items-center justify-center min-vh-100 vnearwhite',
      }, [
         ['div', {
            class: 'fixed',
            style: style ({
               'background-color': 'hsla(' + emailHue + ', 70%, 50%, 0.2)',
               'border-radius': '1.125rem',
               bottom: 'calc(1.5rem - 2vh)',
               left: '50%',
               'pointer-events': 'none',
               top: 'calc(1.5rem - 2vh)',
               transform: 'translateX(-50%)',
               width: columnWidth,
            }),
         }],

         // Logo
         ['div', {style: style ({
            left: '1.5rem',
            position: 'fixed',
            top: 'calc(1.5rem - 2vh)',
         })}, ['img', {
            alt: 'vibey',
            class: 'db',
            src: '/favicon.svg',
            style: style ({
               'background-color': css.colors.vmidnight,
               'border-radius': '1.125rem',
               height: '6.75rem',
               padding: '1.125rem',
               width: '7.59375rem',
            }),
         }]],

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
                           class: 'absolute flex items-center justify-center pointer' + (matchingProject ? ' ' + views.projectColor (matchingProject.name) : ''),
                           onclick: matchingProject ? B.ev ('navigate', 'files/' + matchingProject.id) : undefined,
                           onmouseenter: B.ev ('set', ['hover', 'project'], matchingProject || {name: '(slot ' + (index + 1) + ')'}),
                           onmouseleave: B.ev ('rem', [], 'hover'),
                           style: style ({
                              border: vw (1.5) + ' solid ' + css.colors.vborderblue,
                              'border-radius': vw (slotBorderRadius),
                              height: vw (slotHeight),
                              left: vw (slot.x + offsetX - slotWidth / 2),
                              top: vw (slot.y + offsetY - slotHeight / 2),
                              width: vw (slotWidth),
                           }),
                        }, (function () {
                           if (matchingProject) return [['span', {class: 'f3 fw7'}, dale.go (matchingProject.name.split (' '), function (word) {
                              return word [0];
                           }).slice (0, 3).join (' ')], views.tooltip (index + 1)];

                           if (! matchingProject) return [
                              ['div', {
                                 class: views.projectColor ('slot ' + (index + 1)) + ' absolute absolute--fill br-inherit',
                                 style: style ({
                                    opacity: 0.15,
                                    'pointer-events': 'none',
                                 }),
                              }],
                              ['span', {
                                 class: 'flex green h-100 items-center justify-center relative w-100',
                                 onclick: B.ev ('set', ['new', 'project'], {slot: index + 1}),
                                 opaque: true,
                              }, ['LITERAL', '<svg viewBox="0 0 40 40" width="36%" height="36%" xmlns="http://www.w3.org/2000/svg"><path d="M20 8 L20 32 M8 20 L32 20" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M20 8 L20 32 M8 20 L32 20" stroke="' + css.colors.vwhite + '" stroke-width="0.75" stroke-linecap="round"/></svg>']],
                           ];
                        }) ()];
                     }),

                     // Status bar
                     B.view (['hover', 'project'], function (project) {
                        if (creator && ! project) return ['div'];
                        return ['div', {
                           class: ('absolute ba border-box flex flex-column items-center justify-center vborderblue-border ' + (creator ? views.projectColor (project.name) : 'bg-vmidnight vlightblue')).split (' ').sort ().join (' '),
                           style: style ({
                              'border-width': '0.09375rem',
                              'border-radius': vw (slotBorderRadius),
                              'font-size': vw (13),
                              height: vw (barHeight),
                              left: vw (barLeft),
                              top: vw (barBottom - barHeight),
                              width: vw (barWidth),
                           }),
                        }, ! creator ? B.view ([['user', 'creatorRequest'], ['user', 'mode']], function (request, mode) {
                           return ['div', {class: 'border-box pa2 tc w-100'}, [
                              mode === 'cloud' ? ['button', {
                                 class: (css.button + ' f7' + (request ? ' o-60' : '')).split (' ').sort ().join (' '),
                                 disabled: !! request,
                                 onclick: B.ev ('request', 'creator'),
                                 type: 'button',
                              }, request === 'pending' ? 'Requesting...' : request === 'sent' ? 'Request sent' : 'Request creator access'] : '',
                              ['p', {class: 'lh-copy mb0 mt2'}, 'Or ask a creator to share a project with you.'],
                           ]];
                        }) : [
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
                        'padding-top': '16vh',
                     }),
                  }, [
                     ['div', {
                        class: 'border-box center fixed flex left-0 right-0 w-100',
                        style: style ({
                           gap: '0.75rem',
                           height: '14vh',
                           'min-height': '3rem',
                           padding: '2vh 15vw',
                           top: '2vh',
                           'z-index': 1,
                        }),
                     }, [
                        ['div', {
                           class: 'bg-vmidnight flex items-center justify-center pointer relative vlightblue',
                           onclick: B.ev ('rem', 'search', 'project'),
                           style: style ({
                              border: '0.09375rem solid ' + css.colors.vborderblue,
                              'border-radius': '0.75rem',
                              flex: 1,
                           }),
                        }, [views.tooltip ('B'), ['span', {class: 'fw6 f4'}, '‹ Back to shell']]],
                        ['div', {
                           class: 'bg-vmidnight flex items-center justify-center pointer relative vgreen',
                           onclick: B.ev ('set', ['new', 'project'], {slot: undefined}),
                           style: style ({
                              border: '0.09375rem solid ' + css.colors.vborderblue,
                              'border-radius': '0.75rem',
                              flex: 1,
                           }),
                        }, [views.tooltip ('E'), ['span', {class: 'fw6 f4'}, '+ New project']]],
                     ]],
                     (function () {
                        var cardWidth = 70 / phi;
                        var cycle = 8;
                        var filteredProjects = dale.fil (projects, undefined, function (project) {
                           if (project.name.match (search)) return project;
                        });
                        return dale.go (filteredProjects, function (project, index) {
                           var offset = 15 + (Math.sin (index * 2 * Math.PI / cycle - Math.PI / 2) + 1) / 2 * (70 - cardWidth);
                           return ['div', {
                              class: 'border-box flex items-center justify-between pointer relative ' + views.projectColor (project.name),
                              onclick: B.ev ('navigate', 'files/' + project.id),
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
                              index < 5 ? views.tooltip (index + 1) : '',
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
                                    onclick: B.ev ('remove', 'project', project),
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
                  views.tooltip ('S'),
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
                     class: 'bg-vnavy border-box outline-0 w-100',
                     id: 'search-project',
                     onfocus: B.ev ('set', ['search', 'project'], ''),
                     oninput: B.ev ('set', ['search', 'project']),
                     placeholder: 'Search projects',
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
                  ['span', {
                     class: 'absolute pointer',
                     id: 'dice-project',
                     onclick: B.ev ('set', ['new', 'project', 'name'], randomName ()),
                     style: style ({
                        right: vw (14),
                        top: '50%',
                        transform: 'translateY(-50%)',
                     })
                  }, [
                     ['i', {
                        class: 'bi bi-dice-' + Math.ceil (Math.random () * 5),
                        style: style ({
                           color: css.colors.vmidblue,
                           'font-size': vw (16),
                        })
                     }],
                     views.tooltip ('D'),
                  ]],
                  ['input', {
                     class: 'bg-vnavy border-box h-100 outline-0 w-100',
                     id: 'new-project-input',
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
                  class: 'bn fw7 pointer relative w-100',
                  disabled: allowCreation !== true,
                  id: 'create-project',
                  onclick: B.ev ('create', 'project'),
                  style: style ({
                     'background-color': allowCreation === true ? css.colors.vgreen : '#555',
                     'border-radius': slotBorderRadius,
                     color: '#000',
                     'font-size': vw (16),
                     'margin-top': '1rem',
                     padding: '1rem 0',
                  })
               }, [allowCreation === true ? views.tooltip ('E') : '', {
                  conflict: 'That name\'s taken',
                  empty: 'Enter a name',
                  true: 'Boom',
               } [allowCreation]]]
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
                        class: 'bg-vnavy border-box h-100 outline-0 w-100',
                        id: 'edit-project-input',
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
                        value: 'null',
                     }, 'None'],
                     dale.go (dale.times (5, 1), function (n) {
                        return ['option', {value: n, selected: editProject.slot === n}, 'Slot ' + n];
                     }),
                  ]],
               ]],
               ['button', {
                  class: 'bn fw7 pointer w-100',
                  disabled: allowEdit !== true,
                  id: 'rename-file',
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
      var parts = name.split ('/');
      var styled = [];
      dale.go (parts, function (part, index) {
         if (index > 0) styled.push (['span', {class: 'vgray'}, ' / ']);
         styled.push (part);
      });
      if (name.match ('^chat/')) return [['i', {class: 'bi bi-chat-left-dots mr1 vpurple'}], styled];
      if (name.match (/\.md$/)) return [['i', {class: 'bi bi-file-text mr1 vlightblue'}], styled];
      return styled;
   }

   var paneStyle = style ({
      'border-radius': '1.125rem',
      'box-shadow': [
         '0.75rem 0.75rem 2.25rem ' + css.rgba (css.colors.vblack, 0.45),
         '-0.75rem -0.75rem 2.25rem ' + css.rgba (css.colors.vwhite, 0.1),
         '0.1875rem 0.1875rem 0.5625rem ' + css.rgba (css.colors.vblack, 0.3),
         '-0.1875rem -0.1875rem 0.5625rem ' + css.rgba (css.colors.vwhite, 0.07),
      ].join (', '),
      padding: '1.5rem',
   });

   var flipCard = function (frontClass, front, back) {
      return B.view (['settings', 'show'], function (showSettings) {
         return ['div', {
            class: 'bg-vdeepnavy bn border-box flex flex-column ' + (showSettings ? 'overflow-auto' : frontClass),
            style: paneStyle,
         }, showSettings ? [
            ['div', {class: 'flex items-center justify-between mb3'}, [
               ['span', {class: 'f4 fw6 vnearwhite'}, 'Settings'],
               ['span', {
                  class: 'f3 light-blue pointer relative',
                  onclick: B.ev ('set', ['settings', 'show'], false),
               }, [views.tooltip ('9', 'below'), '×']],
            ]],
            type (back) === 'function' ? back () : back,
         ] : type (front) === 'function' ? front () : front];
      });
   }

   return B.view ([['projects'], ['project']], function (projects, projectId) {
      if (! projects) return ['div', {
         class: 'bg-vmidnight flex flex-wrap items-center justify-center overflow-hidden vh-100',
         style: style ({gap: '2rem'}),
      }, dale.go (dale.times (80), () => views.spinny ())];

      var project = dale.stopNot (projects, undefined, function (project) {
         if (project.id === projectId) return project;
      });

      return ['div', {
         class: views.projectColor (project.name) + ' border-box flex flex-column overflow-hidden vh-100',
         style: style ({
            padding: '0.75rem 1.5rem 0 1.5rem',
         }),
      }, [
         ['style', [
            ['.CodeMirror', {
               'background-color': css.colors.vnavy,
               'border-radius': '1.125rem',
               color: css.colors.vnearwhite,
               'font-family': 'Consolas, monaco, monospace',
               height: '100%',
            }],
            ['.CodeMirror-lines', {
               padding: '0.75rem 0',
            }],
            ['.CodeMirror pre.CodeMirror-line, .CodeMirror pre.CodeMirror-line-like', {
               padding: '0 0.75rem',
            }],
            ['.CodeMirror-cursor', {
               'border-left-color': css.colors.vnearwhite,
            }],
            ['.CodeMirror-gutters', {
               'background-color': css.colors.vnavy,
               'border-right': '0.0625rem solid ' + css.colors.vborderblue,
            }],
            ['.CodeMirror .CodeMirror-selected, .CodeMirror-focused .CodeMirror-selected', {
               'background-color': css.colors.vhighlightblue,
            }],
            ['.CodeMirror .content-search-current', {
               'border-radius': '0.125rem',
               outline: '0.125rem solid ' + css.colors.vnearwhite,
            }],
            ['.CodeMirror .content-search-match', {
               'background-color': css.colors.vorange,
               color: css.colors.vblack,
            }],
            ['.CodeMirror-linenumber', {
               color: css.colors.vgray,
            }],
            ['.cm-s-default .cm-comment, .cm-s-default .cm-quote', {
               color: css.colors.vgray,
            }],
            ['.cm-s-default .cm-keyword, .cm-s-default .cm-atom', {
               color: css.colors.vpurple,
            }],
            ['.cm-s-default .cm-number, .cm-s-default .cm-string-2', {
               color: css.colors.vorange,
            }],
            ['.cm-s-default .cm-string', {
               color: css.colors.vgreen,
            }],
            ['.cm-s-default .cm-def, .cm-s-default .cm-header, .cm-s-default .cm-link', {
               color: css.colors.vlightblue,
            }],
            ['.cm-s-default .cm-variable, .cm-s-default .cm-operator', {
               color: css.colors.vnearwhite,
            }],
            ['.cm-s-default .cm-variable-2, .cm-s-default .cm-property, .cm-s-default .cm-attribute', {
               color: css.colors.vlightblue,
            }],
            ['.cm-s-default .cm-variable-3, .cm-s-default .cm-type, .cm-s-default .cm-builtin', {
               color: css.colors.vpurple,
            }],
            ['.cm-s-default .cm-tag, .cm-s-default .cm-meta, .cm-s-default .cm-qualifier', {
               color: css.colors.vorange,
            }],
            ['.cm-s-default .cm-bracket', {
               color: css.colors.vnearwhite,
            }],
            ['.cm-s-default .cm-error', {
               color: css.colors.vred,
            }],
         ]],
         ['div', {class: 'flex flex-shrink-0 items-center mb2'}, [
            ['span', {
               class: 'f2 fw7 lh-solid mr3 pointer relative',
               onclick: B.ev ('navigate', 'projects'),
            }, ['‹', views.tooltip ('B', 'below')]],
            ['span', {class: 'f4 fw7'}, project.name],
         ]],
         ['div', {
            style: style ({
               display: 'grid',
               flex: 1,
               gap: '1.5rem',
               'grid-template-columns': 'minmax(0, 23.6fr) minmax(0, 76.4fr)',
               'grid-template-rows': 'minmax(0, 1fr)',
               'min-height': 0,
            }),
         }, [
            // Left pane
            flipCard ('overflow-hidden', function () {return [
               ['div', {class: 'flex flex-shrink-0 mb3'}, [
                  ['button', {
                     class: 'bg-vgreen bn br2 flex-auto fw6 mr2 pointer relative vnearwhite',
                     onclick: B.ev (['set', ['new', 'file'], ''], ['set', ['new', 'type'], 'file']),
                     style: style ({padding: '0.75rem'}),
                  }, [views.tooltip ('E'), '+ New']],
                  B.view (['file', 'name'], function (name) {
                     return ['button', {
                        'aria-label': 'Delete current file',
                        class: 'bg-vred bn br2 fw6 ' + (name ? 'ph3 pointer' : 'o-50 ph3') + ' relative vnearwhite',
                        disabled: ! name,
                        onclick: name ? B.ev ('remove', 'file', name) : undefined,
                        style: style ({
                           'padding-bottom': '0.75rem',
                           'padding-top': '0.75rem',
                        }),
                        title: 'Delete current file',
                     }, [views.tooltip ('U'), '×']];
                  }),
               ]],
               B.view ([['files'], ['file', 'name'], ['pending', 'messages'], ['search', 'file']], function (files, current, pending, search) {
                  if (! files) return ['div', {class: 'flex-auto overflow-y-auto pa3 tc vgray'}, dale.go (dale.times (50), () => views.spinny ())];
                  if (! files.length) return ['div', {class: 'flex-auto overflow-y-auto pa3 tc vgray'}, 'No files yet.'];
                  var currentIndex = dale.stopNot (files, undefined, function (f, k) {
                     if (f.name === current) return k;
                  });
                  var prevIndex = currentIndex !== undefined ? (currentIndex === 0 ? files.length - 1 : currentIndex - 1) : undefined;
                  var nextIndex = currentIndex !== undefined ? (currentIndex >= files.length - 1 ? 0 : currentIndex + 1) : undefined;
                  return ['div', {class: 'flex-auto overflow-y-auto'}, dale.fil (files, undefined, function (file, index) {
                     if (search && ! file.name.match (search)) return;
                     var active = file.name === current;
                     var tooltip = index === prevIndex ? 'K' : index === nextIndex ? 'J' : '';
                     return ['div', {
                        class: css.join ('br1 fw5 lh-copy pointer relative', active ? 'bg-vhighlightblue vnearwhite' : 'vlightblue'),
                        id: active ? 'selected-file' : undefined,
                        onclick: B.ev ('navigate', 'files/' + B.get ('project') + '/' + file.name),
                        style: style ({
                           'border-left': '0.1875rem solid ' + (active ? css.colors.vblue : 'transparent'),
                           padding: '0.5rem 0.625rem',
                        }),
                     }, [
                        tooltip ? views.tooltip (tooltip) : '',
                        ['div', {class: 'flex items-center', style: style ({gap: '0.5rem'})}, [
                           iconAndName (file.name),
                           (pending || []).some (function (k) {return k.indexOf (file.name) !== -1;}) ? ['span', {style: style ({transform: 'scale(0.75)'})}, views.spinny (active ? 'vnearwhite' : 'vlightblue')] : '',
                        ]],
                        ['div', {class: 'f7 mt1 tr vgray'}, size (file.size) + ' · ' + ago (file.mtime)],
                     ]];
                  })];
               }),
               ['div', {class: 'flex-shrink-0 mt3 relative w-100'}, [
                  views.tooltip ('S'),
                  ['i', {
                     class: 'absolute bi bi-search vmidblue',
                     style: style ({
                        left: '0.875rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     class: 'ba bg-vdeepnavy border-box bw1 f5 fw6 outline-0 pr3 vlightblue vmidblue-border w-100',
                     id: 'search-file',
                     oninput: B.ev ('set', ['search', 'file']),
                     placeholder: 'Search files',
                     style: style ({
                        'border-radius': '0.75rem',
                        height: '3rem',
                        'padding-left': '2.5rem',
                     }),
                     type: 'text',
                  }],
               ]],
            ]}, []),
            // Right pane
            flipCard ('overflow-auto', function () {return B.view ('file', function (file) {
               if (! file) return ['div'];

               var isChat = !! file.name.match (/^chat\/.+\.md$/);

               var mode = file.mode || 'edit';

               var isImage = /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test (file.name);
               var isBinary = isImage || content instanceof Uint8Array;
               var isMd = ! isBinary && file.name.match (/\.md$/);

               var fileHeader = ['div', {class: 'flex items-center justify-between mb2'}, [
                     ['div', {
                        class: 'bg-vhighlightblue br-pill flex items-center vnearwhite',
                        style: style ({
                           gap: '0.5rem',
                           padding: '0.5rem 0.5rem 0.5rem 1.25rem',
                        }),
                     }, [
                        ['span', {class: 'fw6'}, iconAndName (file.name)],
                        file.actions ? ['button', {
                           'aria-label': 'Rename file',
                           class: 'bg-vhighlightblue bn br2 f6 fw6 ml3 pointer relative vnearwhite',
                           onclick: B.ev ('set', ['edit', 'file'], {
                              newName: file.name,
                              oldName: file.name,
                           }),
                           style: style ({
                              padding: '0.25rem 0.75rem',
                           }),
                           title: 'Rename file',
                        }, [views.tooltip ('Y'), ['i', {class: 'bi bi-pencil mr1'}], 'Rename']] : '',
                        file.actions ? ['button', {
                           class: 'bg-vhighlightblue bn br2 f6 fw6 ml2 pointer vnearwhite',
                           onclick: B.ev ('download', 'file'),
                           style: style ({
                              padding: '0.25rem 0.75rem',
                           }),
                           title: 'Download file',
                        }, [['i', {class: 'bi bi-download mr1'}], 'Download']] : '',
                        ['button', {
                           'aria-expanded': file.actions ? 'true' : 'false',
                           'aria-label': file.actions ? 'Hide file actions' : 'Show file actions',
                           class: 'bg-transparent bn br-pill pointer pv1 vnearwhite',
                           onclick: B.ev ('set', ['file', 'actions'], ! file.actions),
                           title: file.actions ? 'Hide file actions' : 'Show file actions',
                           type: 'button',
                        }, ['i', {class: 'bi bi-chevron-' + (file.actions ? 'left' : 'right')}]],
                     ]],
                     ! isChat && isMd ? ['div', {class: 'flex'}, [
                        ['span', {
                           class: 'br2 f6 fw6 mr2 pointer relative ' + (mode !== 'edit' ? 'bg-vhighlightblue vnearwhite' : 'vgray'),
                           onclick: B.ev ('set', ['file', 'mode'], 'view'),
                           style: style ({
                              padding: '0.25rem 0.75rem',
                           }),
                        }, [mode === 'edit' ? views.tooltip ('I') : '', ['i', {class: 'bi bi-eye mr1'}], 'View']],
                        ['span', {
                           class: 'br2 f6 fw6 pointer relative ' + (mode === 'edit' ? 'bg-vhighlightblue vnearwhite' : 'vgray'),
                           onclick: B.ev ('set', ['file', 'mode'], 'edit'),
                           style: style ({
                              padding: '0.25rem 0.75rem',
                           }),
                        }, [mode !== 'edit' ? views.tooltip ('I') : '', ['i', {class: 'bi bi-pencil mr1'}], 'Edit']],
                     ]] : ['div'],
                  ]];

               if (isChat) return ['div', {class: 'flex flex-auto flex-column'}, [
                  fileHeader,
                  views.chat (),
               ]];

               return ['div', {class: 'flex flex-auto flex-column'}, [
                  fileHeader,
                  isImage ? ['div', {class: 'flex-auto relative'}, [
                     ['img', {
                        alt: file.name,
                        class: 'absolute h-100 left-0 top-0 w-100',
                        src: '/project/' + encodeURIComponent (B.get ('project')) + '/file/' + file.name.split ('/').map (encodeURIComponent).join ('/'),
                        onerror: B.ev ('snackbar', 'error', 'There was a problem loading the image'),
                        style: style ({'object-fit': 'contain'}),
                     }],
                  ]] :
                  content === undefined ? ['div', {class: 'flex flex-auto items-center justify-center'}, views.spinny ()] :
                  isBinary ? (function () {
                     return ['div', {class: 'flex flex-auto items-center justify-center vgray'}, [
                        ['div', {class: 'tc'}, [
                           ['i', {class: 'bi bi-file-earmark-binary db f1 mb3'}],
                           ['div', {class: 'f5'}, file.name],
                           ['div', {class: 'f6 mt2'}, Math.round (content.length / 1024) + ' KB'],
                        ]],
                     ]];
                  }) () : (isMd && mode === 'view') ?
                     ['div', {
                        class: 'flex-auto lh-copy overflow-auto vgray',
                        opaque: true,
                     }, ['LITERAL', marked.parse (content || '')]]
                     : ['div', {
                        class: 'flex-auto mt2 overflow-hidden',
                        id: 'file-editor',
                        opaque: true,
                     }],
                  ! isBinary && (! isMd || mode === 'edit') ? ['div', {class: 'flex-shrink-0 mt3 relative w-100'}, [
                     views.tooltip ('/'),
                     ['i', {
                        class: 'absolute bi bi-search vmidblue',
                        style: style ({
                           left: '0.875rem',
                           'pointer-events': 'none',
                           top: '50%',
                           transform: 'translateY(-50%)',
                        }),
                     }],
                     ['input', {
                        'aria-label': 'Search text',
                        class: 'ba bg-vdeepnavy border-box bw1 f5 fw6 outline-0 pr3 vlightblue vmidblue-border w-100',
                        id: 'search-text',
                        oninput: B.ev ('set', ['search', 'content', 'query']),
                        placeholder: 'Search text',
                        style: style ({
                           'border-radius': '0.75rem',
                           height: '3rem',
                           'padding-left': '2.5rem',
                           'padding-right': '8rem',
                        }),
                        type: 'text',
                        value: B.get ('search', 'content', 'query') || '',
                     }],
                     B.view (['search', 'content'], function (search) {
                        return ['span', {
                           'aria-live': 'polite',
                           class: 'absolute f6 nowrap right-1 vgray',
                           style: style ({
                              'pointer-events': 'none',
                              top: '50%',
                              transform: 'translateY(-50%)',
                           }),
                        }, ! search.query ? '' : search.current ? search.current + ' of ' + search.count : search.count + (search.count === 1 ? ' match' : ' matches')];
                     }),
                  ]] : '',
               ]];
            })}, function () {return B.view ([['pkce'], ['user', 'credentials']], function (pkce, credentials) {
               pkce = pkce || {};
               var step = pkce.step;
               if (pkce.apiKey) return views.modal ({
                  'aria-label': 'Add API key',
                  'aria-modal': 'true',
                  role: 'dialog',
               }, [
                  ['h3', {class: 'f4 fw6 mb3 mt0 vlightblue'}, (pkce.apiKey === 'anthropic' ? 'Anthropic' : 'OpenAI') + ' API key'],
                  ['input', {
                     class: css.input + ' f6 mb3 w-100',
                     oninput: B.ev ('set', ['pkce', 'code']),
                     placeholder: pkce.apiKey === 'anthropic' ? 'sk-ant-...' : 'sk-...',
                     type: 'password',
                     value: pkce.code || '',
                  }],
                  ['div', {class: 'flex', style: style ({gap: '0.75rem'})}, [
                     ['button', {
                        class: css.button + ' f6 flex-auto',
                        disabled: ! (pkce.code || '').trim (),
                        onclick: B.ev ('save', 'apiKey', pkce.apiKey, pkce.code || ''),
                     }, 'Save'],
                     ['button', {
                        class: 'bg-vhighlightblue bn br2 f6 fw6 pa3 pointer vlightblue',
                        onclick: B.ev ('rem', [], 'pkce'),
                        type: 'button',
                     }, 'Cancel'],
                  ]],
               ]);
               if (pkce.confirm && ! step) return views.modal ({
                  'aria-label': 'Connect account',
                  'aria-modal': 'true',
                  role: 'dialog',
               }, [
                  ['h3', {class: 'f4 fw6 mb3 mt0 vlightblue'}, 'Connect ' + (pkce.confirm === 'anthropic' ? 'Anthropic' : 'OpenAI')],
                  ['p', {class: 'lh-copy mb3 mt0 vnearwhite'}, 'Here’s what will happen:'],
                  ['ol', {class: 'lh-copy mb4 mt0 pl3 vlightblue'}, pkce.confirm === 'anthropic' ? [
                     ['li', 'Click the button below to be taken to Claude\'s login page.'],
                     ['li', 'Come back and paste the code you got.'],
                  ] : [
                     ['li', 'Click the button below to be taken to OpenAI\'s login page.'],
                     ['li', 'You’ll be taken to a broken page with a URL that starts with "localhost:1455...". This is expected.'],
                     ['li', 'Copy that entire URL, come back and paste it here.'],
                  ]],
                  ((credentials || {}) [pkce.confirm] || {}).account
                     ? ['p', {class: 'lh-copy mb4 mt0 vpurple'}, 'Completing this login will replace your currently connected account for this provider.']
                     : '',
                  ['div', {
                     class: 'flex flex-wrap',
                     style: style ({gap: '0.75rem'}),
                  }, [
                     ['button', {
                        class: (css.button.replace ('bg-vblue', pkce.confirm === 'anthropic' ? 'bg-vpurple' : 'bg-vgreen').replace ('white', 'vdeepnavy') + ' f6 flex-auto').split (' ').sort ().join (' '),
                        disabled: !! pkce.loading,
                        onclick: B.ev ('start', 'pkce', pkce.confirm),
                        type: 'button',
                     }, pkce.loading ? 'Opening browser...' : 'Start login'],
                     ['button', {
                        class: 'bg-vhighlightblue bn br2 f6 fw6 pa3 pointer vlightblue',
                        disabled: !! pkce.loading,
                        onclick: B.ev ('rem', [], 'pkce'),
                        type: 'button',
                     }, 'Cancel'],
                  ]],
               ]);
               if (step) return ['div', [
                  ['div', {class: 'f6 lh-copy mb2 gold'}, 'A browser tab opened for ' + (step.provider === 'anthropic' ? 'Anthropic' : 'OpenAI') + '. Paste the code or URL you received below.'],
                  ['input', {
                     class: css.input + ' f6 mb2 w-100',
                     oninput: B.ev ('set', ['pkce', 'code']),
                     placeholder: 'Paste code here...',
                     type: 'text',
                     value: pkce.code || '',
                  }],
                  ['div', {class: 'flex', style: style ({gap: '0.5rem'})}, [
                     ['button', {
                        class: css.button + ' f6 flex-auto',
                        disabled: ! (pkce.code || '').trim (),
                        onclick: B.ev ('complete', 'pkce', step.provider, pkce.code || ''),
                     }, 'Submit'],
                     ['button', {
                        class: css.button + ' f6',
                        style: style ({'background-color': css.colors.vborderblue}),
                        onclick: B.ev ('rem', [], 'pkce'),
                     }, 'Cancel'],
                  ]],
               ]];
               return ['div', dale.go (['anthropic', 'openai'], function (provider) {
                  var configured = dale.fil ((credentials || {}) [provider] || {}, undefined, function (present, name) {
                     if (present) return name;
                  }).sort ();
                  return ['section', {class: 'mb4'}, [
                     ['h3', {class: 'f5 fw6 mb3 mt0 vlightblue'}, provider === 'anthropic' ? 'Anthropic' : 'OpenAI'],
                     configured.length ? ['div', {class: 'mb3'}, dale.go (configured, function (name) {
                        return ['div', {class: 'flex items-center mb2', style: style ({gap: '0.75rem'})}, [
                           ['span', {class: 'f6 vlightblue'}, [
                              ['i', {class: 'bi bi-check-circle mr2 vgreen'}],
                              (name === 'account' ? 'Account' : name === 'apiKey' ? 'API key' : name) + ' added',
                           ]],
                           ['button', {
                              class: 'bg-vred bn br2 f6 fw6 ml3 pointer vnearwhite',
                              onclick: B.ev ('remove', 'credential', provider, name),
                              style: style ({padding: '0.5rem 0.75rem'}),
                              type: 'button',
                           }, 'Remove'],
                        ]];
                     })] : ['p', {class: 'f6 mb3 mt0 vgray'}, 'No credentials added'],
                     ['div', {
                        class: 'flex flex-wrap',
                        style: style ({gap: '0.75rem'}),
                     }, [
                        ['button', {
                           class: (css.button.replace ('bg-vblue', provider === 'anthropic' ? 'bg-vpurple' : 'bg-vgreen').replace ('white', 'vdeepnavy') + ' f6 flex-auto').split (' ').sort ().join (' '),
                           disabled: !! pkce.loading,
                           onclick: B.ev ('set', 'pkce', {confirm: provider}),
                           type: 'button',
                        }, pkce.loading === provider ? 'Opening browser...' : inc (configured, 'account') ? 'Add new account' : 'Add account'],
                        ['button', {
                           class: 'bg-transparent br2 f6 flex-auto fw6 pa3 pointer',
                           onclick: B.ev ('set', 'pkce', {apiKey: provider}),
                           style: style ({
                              border: '0.125rem solid ' + (provider === 'anthropic' ? css.colors.vpurple : css.colors.vgreen),
                              color: provider === 'anthropic' ? css.colors.vpurple : css.colors.vgreen,
                           }),
                           type: 'button',
                        }, inc (configured, 'apiKey') ? 'Add new API key' : 'Add API key'],
                     ]],
                  ]];
               })];
            })}),
         ]],

         // File creation modal
         B.view ([['new', 'file'], ['new', 'type'], ['files'], ['upload']], function (newFile, newType, files, upload) {
            if (upload) return views.modal ({}, [
               ['div', {
                  'aria-live': 'polite',
                  class: 'flex items-center justify-center',
                  role: 'status',
                  style: style ({gap: '1rem'}),
               }, [
                  views.spinny (),
                  ['span', {class: 'fw6 vnearwhite'}, 'Uploaded ' + upload.done + ' of ' + upload.total],
               ]],
            ]);
            if (newFile === undefined) return ['div'];

            var allowCreation = (function () {
               var name = (newFile || '').trim ();
               if (name.length === 0) return 'empty';
               var conflict = dale.stop (files || [], true, function (file) {
                  return file.name === name;
               });
               return conflict ? 'conflict' : true;
            }) ();

            return views.modal ({onclick: B.ev (['rem', 'new', 'file'], ['rem', 'new', 'type'])}, [
               ['div', {
                  class: 'flex items-center justify-between mb3',
               }, [
                  ['div', {
                     class: 'flex',
                     style: style ({gap: '0.5rem'}),
                  }, [
                     ['button', {
                        class: 'bn br2 f6 fw6 ph3 pointer pv2 relative ' + (newType === 'file' ? 'bg-vgreen' : 'bg-transparent vgray'),
                        onclick: B.ev ('set', ['new', 'type'], 'file'),
                        style: newType === 'file' ? undefined : style ({
                           border: '0.0625rem solid ' + css.colors.vborderblue,
                        }),
                     }, [
                        newType === 'file' ? '' : views.tooltip ('F'),
                        ['i', {class: 'bi bi-file-text mr1'}],
                        'File',
                     ]],
                     ['button', {
                        class: 'bn br2 f6 fw6 ph3 pointer pv2 relative ' + (newType === 'chat' ? 'bg-vgreen' : 'bg-transparent vgray'),
                        onclick: B.ev ('set', ['new', 'type'], 'chat'),
                        style: newType === 'chat' ? undefined : style ({
                           border: '0.0625rem solid ' + css.colors.vborderblue,
                        }),
                     }, [
                        newType === 'chat' ? '' : views.tooltip ('I'),
                        ['i', {class: 'bi bi-chat-dots mr1'}],
                        'Chat',
                     ]],
                     ['button', {
                        class: 'bg-transparent bn br2 f6 fw6 o-40 ph3 pv2 vgray',
                        disabled: true,
                        style: style ({
                           border: '0.0625rem solid ' + css.colors.vborderblue,
                           cursor: 'not-allowed',
                        }),
                     }, [
                        ['i', {class: 'bi bi-code-square mr1'}],
                        'App',
                     ]],
                  ]],
                  ['div', {
                     class: 'flex items-center',
                     style: style ({gap: '0.5rem'}),
                  }, [
                     ['span', {class: 'f6 fw6 vmidblue'}, 'Upload'],
                     ['input', {
                        hidden: true,
                        id: 'upload-file',
                        onchange: B.ev ('upload', 'file', {raw: 'this.files'}),
                        type: 'file',
                     }],
                     ['input', {
                        hidden: true,
                        id: 'upload-folder',
                        multiple: true,
                        onchange: B.ev ('upload', 'folder', {raw: 'this.files'}),
                        type: 'file',
                        webkitdirectory: true,
                     }],
                     ['button', {
                        class: 'bg-transparent bn br2 f6 fw6 ph3 pointer pv2 relative vgray',
                        onclick: "c ('#upload-file').click ()",
                        style: style ({
                           border: '0.0625rem solid ' + css.colors.vborderblue,
                        }),
                     }, [
                        views.tooltip ('U'),
                        ['i', {class: 'bi bi-file-text mr1'}],
                        'File',
                     ]],
                     ['button', {
                        class: 'bg-transparent bn br2 f6 fw6 ph3 pointer pv2 relative vgray',
                        onclick: "c ('#upload-folder').click ()",
                        style: style ({
                           border: '0.0625rem solid ' + css.colors.vborderblue,
                        }),
                     }, [
                        views.tooltip ('R'),
                        ['i', {class: 'bi bi-folder mr1'}],
                        'Folder',
                     ]],
                  ]],
               ]],
               ['div', {class: 'relative w-100'}, [
                  newType === 'chat' ? ['span', {
                     class: 'absolute f5 fw6 vmidblue',
                     style: style ({
                        left: '2.5rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }, 'chat/'] : '',
                  ['i', {
                     class: 'absolute bi bi-pencil vmidblue',
                     style: style ({
                        left: '0.875rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     class: 'bg-vdeepnavy border-box f5 outline-0 pr3 w-100',
                     id: 'new-file-input',
                     oninput: B.ev ('set', ['new', 'file']),
                     placeholder: newType === 'chat' ? 'Name your chat' : 'Name your file',
                     style: style ({
                        border: '0.09375rem solid ' + css.rgba (css.colors.vlightblue, 0.15),
                        'border-radius': '0.75rem',
                        color: css.rgba (css.colors.vlightblue, 0.8),
                        height: '3rem',
                        'padding-left': newType === 'chat' ? '5.25rem' : '2.5rem',
                     }),
                     type: 'text',
                     value: newFile,
                  }],
               ]],
               ['button', {
                  class: (allowCreation === true ? 'bg-vgreen' : 'bg-vgray') + ' black bn br2 f5 fw7 mt3 pointer pv3 relative w-100',
                  disabled: allowCreation !== true,
                  id: 'create-file',
                  onclick: B.ev ('create', newType),
               }, [
                  allowCreation === true ? views.tooltip ('E') : '',
                  {
                     conflict: 'That name\'s taken',
                     empty: 'Enter a name',
                     true: 'Boom',
                  } [allowCreation],
               ]],
            ]);
         }),

         // File rename modal
         B.view ([['edit', 'file'], ['files']], function (editFile, files) {
            if (! editFile) return ['div'];
            var name = (editFile.newName || '').trim ();
            var allowEdit = (function () {
               if (! name) return 'empty';
               if (name === editFile.oldName) return 'unchanged';
               if (dale.stop (files || [], true, function (file) {
                  return file.name === name;
               })) return 'conflict';
               return true;
            }) ();

            return views.modal ({onclick: B.ev ('rem', 'edit', 'file')}, [
               ['div', {class: 'relative w-100'}, [
                  ['i', {
                     class: 'absolute bi bi-pencil vmidblue',
                     style: style ({
                        left: '0.875rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     class: 'bg-vdeepnavy border-box f5 outline-0 pr3 w-100',
                     id: 'edit-file-input',
                     oninput: B.ev ('set', ['edit', 'file', 'newName']),
                     placeholder: 'Rename your file',
                     style: style ({
                        border: '0.09375rem solid ' + css.rgba (css.colors.vlightblue, 0.15),
                        'border-radius': '0.75rem',
                        color: css.rgba (css.colors.vlightblue, 0.8),
                        height: '3rem',
                        'padding-left': '2.5rem',
                     }),
                     type: 'text',
                     value: editFile.newName,
                  }],
               ]],
               ['button', {
                  class: (allowEdit === true ? 'bg-vgreen' : 'bg-vgray') + ' black bn br2 f5 fw7 mt3 pointer pv3 w-100',
                  disabled: allowEdit !== true,
                  onclick: B.ev ('rename', 'file', editFile.oldName, name),
               }, {
                  conflict: 'That name\'s taken',
                  empty: 'Enter a name',
                  true: 'Rename',
                  unchanged: 'Enter a new name',
               } [allowEdit]],
            ]);
         }),

      ]];
   });
}

// *** CHAT ***

views.chat = function () {
   var matchesQuery = function (message, query, userId) {
      var body = message.match (/^əəə body ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n/im);
      if (! body) return false;
      var head = message.slice (0, body.index);
      var from = head.match (/^from (.+)$/m);
      var to = head.match (/^to (.+)$/m);
      from = from ? from [1] : '';
      body = message.slice (body.index + body [0].length).replace (/\n$/, '');
      var text = [body, from === userId ? 'you' : from, to ? to [1] : ''].join ('\n');
      return ! query || (query !== query.toLowerCase () ? text : text.toLowerCase ()).indexOf (query) !== -1;
   };

   var parseToolResult = function (b) {
      var match = b.match (/^tool-call: (edit|read|run|write)\n/);
      if (! match) return;
      var op = match [1];
      var rest = b.slice (match [0].length);
      var resultSplit = rest.indexOf ('\n\nResult:\n');
      if (resultSplit === -1) return;
      var header = rest.slice (0, resultSplit);
      var result = rest.slice (resultSplit + '\n\nResult:\n'.length);
      var exitMatch = result.match (/\nExit code: (-?\d+)$/);
      var exitCode = exitMatch ? parseInt (exitMatch [1]) : undefined;
      if (exitMatch) result = result.slice (0, exitMatch.index);
      var tool = {
         exitCode: exitCode,
         op: op,
         result: result.replace (/\n+$/, ''),
      };
      if (op === 'run') {
         var cmdMatch = header.match (/^command: (.+)/);
         tool.command = cmdMatch ? cmdMatch [1] : '';
      }
      else {
         var pathMatch = header.match (/^path: (.+)/);
         tool.path = pathMatch ? pathMatch [1] : '';
         if (op === 'edit') {
            var oldStart = header.indexOf ('\nold text:\n');
            if (oldStart !== -1) {
               var afterOld = header.slice (oldStart + '\nold text:\n'.length);
               var newStart = afterOld.indexOf ('\nnew line:\n');
               if (newStart !== -1) {
                  tool.newText = afterOld.slice (newStart + '\nnew line:\n'.length);
                  tool.oldText = afterOld.slice (0, newStart);
               }
            }
         }
         if (op === 'write') {
            var pathEnd = header.indexOf ('\n');
            tool.content = pathEnd !== -1 ? header.slice (pathEnd + 1) : '';
         }
      }
      return tool;
   };

   var renderToolResult = function (tool) {
      var icons = {
         edit: 'bi-pencil',
         read: 'bi-eye',
         run: 'bi-terminal',
         write: 'bi-file-earmark-plus',
      };
      var opColors = {
         edit: css.colors.vorange,
         read: css.colors.vlightblue,
         run: css.colors.vpurple,
         write: css.colors.vgreen,
      };
      var color = opColors [tool.op];
      var border = css.rgba (color, 0.2);
      var ok = tool.exitCode === 0;

      return ['div', {
         class: 'code overflow-hidden',
      }, [
         ['div', {
            class: 'f7 flex fw7 items-center',
            style: style ({
               'background-color': css.rgba (color, 0.15),
               color: color,
               gap: '0.375rem',
               padding: '0.375rem 0.625rem',
            }),
         }, [
            ['i', {class: 'bi ' + icons [tool.op]}],
            tool.op,
            ['span', {
               class: 'f7 fw5 truncate',
               style: style ({
                  color: css.colors.vgray,
                  'min-width': 0,
               }),
            }, tool.op === 'run' ? tool.command : (tool.path || '').replace (/^\/project\//, '')],
         ]],
         tool.op === 'edit' && tool.oldText !== undefined ? ['div', [
            ['div', {
               class: 'f7',
               style: style ({
                  'background-color': css.rgba (css.colors.vred, 0.08),
                  'border-top': '0.0625rem solid ' + css.rgba (css.colors.vred, 0.15),
                  padding: '0.375rem 0.625rem',
               }),
            }, [
               ['div', {
                  class: 'fw7 mb1',
                  style: style ({
                     color: css.colors.vred,
                     'font-size': '0.5625rem',
                  }),
               }, '− old'],
               ['pre', {
                  class: 'ma0 overflow-x-auto',
                  style: style ({opacity: '0.7'}),
               }, tool.oldText || '(empty)'],
            ]],
            ['div', {
               class: 'f7',
               style: style ({
                  'background-color': css.rgba (css.colors.vgreen, 0.08),
                  'border-top': '0.0625rem solid ' + css.rgba (css.colors.vgreen, 0.15),
                  padding: '0.375rem 0.625rem',
               }),
            }, [
               ['div', {
                  class: 'fw7 mb1',
                  style: style ({
                     color: css.colors.vgreen,
                     'font-size': '0.5625rem',
                  }),
               }, '+ new'],
               ['pre', {class: 'ma0 overflow-x-auto vgreen'}, tool.newText || '(empty)'],
            ]],
         ]] : '',
         tool.op === 'write' && tool.content ? ['div', {
            class: 'f7',
            style: style ({
               'border-top': '0.0625rem solid ' + border,
               'max-height': '12rem',
               'overflow-y': 'auto',
               padding: '0.375rem 0.625rem',
            }),
         }, ['pre', {class: 'ma0 overflow-x-auto vgray'}, tool.content]] : '',
         tool.result ? ['div', {
            class: 'f7',
            style: style ({
               'border-top': '0.0625rem solid ' + border,
               'max-height': '20rem',
               'overflow-y': 'auto',
               padding: '0.375rem 0.625rem',
            }),
         }, ['pre', {class: 'ma0 overflow-x-auto vnearwhite'}, tool.result]] : '',
         tool.exitCode !== undefined ? ['div', {
            class: 'f7 fw7 tr',
            style: style ({
               'border-top': '0.0625rem solid ' + border,
               color: ok ? css.colors.vgreen : css.colors.vred,
               padding: '0.25rem 0.625rem',
            }),
         }, [
            ['i', {class: 'bi mr1 ' + (ok ? 'bi-check-circle' : 'bi-x-circle')}],
            ok ? 'ok' : 'exit ' + tool.exitCode,
         ]] : '',
      ]];
   };

   return B.view ('file', function (file) {
      return ['div', {
         class: 'flex flex-auto flex-column',
         style: style ({'min-height': 0}),
      }, [
         ['style', [
            ['.chat-message pre', {
               'max-width': '100%',
               'overflow-x': 'auto',
               'white-space': 'pre-wrap',
            }],
         ]],
         // Messages
         B.view ([['search', 'content', 'query'], ['user', 'id'], ['content']], function (query, userId) {
            query = query || '';
            var messages = (type (content) === 'string' ? content : '').split (/^əəə head [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n/im).slice (1);
            messages = dale.fil (messages, undefined, function (message) {
               var body = message.match (/^əəə body [0-9a-f-]{36}\n/im);
               if (body && /^from systemPrompt$/m.test (message.slice (0, body.index))) return;
               return message;
            });
            var maxIndent = 4;
            var messageIndexes = {};
            var messageLevels = {};
            var messageCount = 0;
            dale.go (messages, function (message) {
               var id = message.match (/^əəə body ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n/im);
               if (! id) return;
               var key = id [1].toLowerCase ();
               messageIndexes [key] = String (++messageCount).padStart (4, '0');
               var head = message.slice (0, id.index);
               var replyTo = head.match (/^to ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/im);
               messageLevels [key] = replyTo ? Math.min ((messageLevels [replyTo [1].toLowerCase ()] || 0) + 1, maxIndent - 1) : 0;
            });

            var rendered = dale.fil (messages, undefined, function (message) {
               if (! matchesQuery (message, query, userId)) return;
               var body = message.match (/^əəə body ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n/im);
               if (! body) return;
               var messageId = body [1];
               var head = message.slice (0, body.index);
               var replyTo = head.match (/^to ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/im);
               var from = head.match (/^from (.+)$/m) [1];
               var to = head.match (/^to (.+)$/m);
               to = to ? to [1] : '';
               var fromLabel = from === userId ? 'you' : from;
               if (to && to !== 'all' && ! replyTo) fromLabel += ' -> ' + to;
               var shell = from === 'shell' || to === 'shell';
               var start = head.match (/^t-start (.+)$/m);
               var end = head.match (/^t-end (.+)$/m);
               var cancelled = head.match (/^cancelled (.+)$/m);
               var time = head.match (/^t (.+)$/m) || start;
               var timeLabel = time ? ago (time [1]) : '';
               var tokenLabel = end ? dale.fil (['cache', 'in', 'out'], undefined, function (name) {
                  var tokens = head.match (new RegExp ('^tokens-' + name + ' (\\d+)$', 'm'));
                  if (tokens) return size (Number (tokens [1])).replace (/B$/, '') + 't' + {cache: 'c', in: 'i', out: 'o'} [name];
               }).join (' + ') : '';
               var model = dale.stopNot (models, undefined, function (m) {
                  if (from === 'ai-' + m.model) return m;
               });
               var usageLabel = '';
               if (end && model && model.window && ! /^pending 1$/m.test (head)) {
                  var tokensIn = head.match (/^tokens-in (\d+)$/m);
                  var tokensCache = head.match (/^tokens-cache (\d+)$/m);
                  var tokensOut = head.match (/^tokens-out (\d+)$/m);
                  if (tokensIn && tokensCache && tokensOut) {
                     var total = Number (tokensIn [1]) + Number (tokensCache [1]) + Number (tokensOut [1]);
                     usageLabel = (total / model.window * 100).toFixed (1) + '% context';
                  }
               }
               if (start && end) {
                  var duration = new Date (end [1]).getTime () - new Date (start [1]).getTime ();
                  if (isFinite (duration) && duration >= 0) timeLabel = (duration < 1000 ? Math.ceil (duration) + 'ms' : Math.ceil (duration / 1000) + 's') + ' · ' + timeLabel;
               }
               body = message.slice (body.index + body [0].length).replace (/\n$/, '');
               var originalLength = body.length;
               var expandKey = ['expand', B.get ('project'), file.name, messageIndexes [messageId.toLowerCase ()]];
               var truncatedBody;
               if (originalLength > 10000) {
                  var firstEnd = body.lastIndexOf ('\n', 5000);
                  var lastStart = body.indexOf ('\n', body.length - 5000);
                  if (firstEnd === -1) firstEnd = 5000;
                  if (lastStart === -1) lastStart = body.length - 5000;
                  var omitted = body.slice (firstEnd, lastStart).split ('\n').length - 1;
                  truncatedBody = body.slice (0, firstEnd) + '\n\n(omitting ' + omitted + ' lines)\n\n' + body.slice (lastStart + 1);
               }
               var renderBody = function (b) {
                  if (shell) {
                     var tool = parseToolResult (b);
                     if (tool) return renderToolResult (tool);
                     return ['pre', {class: 'code f7 ma0 mw-100 overflow-x-auto pa2'}, b];
                  }
                  return ['LITERAL', marked.parse (b).replace (/<a href="(?!https?:\/\/)([^"]*)">/g, '<a href="#/files/' + B.get ('project') + '/$1">')];
               };
               var isToolResult = shell && parseToolResult (truncatedBody || body);
               var pane = ['div', {
                  class: views.projectColor (messageIndexes [messageId.toLowerCase ()], true) + ' bl border-box br3 bt chat-message lh-copy mw-100' + (isToolResult ? '' : ' ph3 pv1') + (shell || /^ai-/.test (from) ? ' code' : ''),
                  opaque: true,
                  style: style ({
                     'border-width': '0.25rem',
                     'font-size': from === userId ? '1.125rem' : undefined,
                     'min-width': 0,
                     'overflow-wrap': 'anywhere',
                     width: 'fit-content',
                  }),
               }, [
                  originalLength > 10000 ? B.view (expandKey, function (expanded) {
                     return ['div', [
                        renderBody (expanded ? body : truncatedBody),
                        ['div', {
                           class: 'f6 pointer pv2 underline vgray',
                           onclick: B.ev ('set', expandKey, expanded ? undefined : true),
                        }, expanded ? 'Collapse' : 'Expand (' + Math.ceil (originalLength / 1000) + 'k)'],
                     ]];
                  }) : renderBody (body),
                  /^pending 1$/m.test (head) ? ['div', {
                     'aria-label': 'Response in progress',
                     class: 'pv2',
                     role: 'status',
                  }, dale.go (dale.times (3), function () {
                     return views.spinny (views.projectColor (messageIndexes [messageId.toLowerCase ()], true));
                  })] : '',
                  cancelled ? ['div', {
                     class: 'f7' + (isToolResult ? ' ph3' : '') + ' pv2',
                  }, '(cancelled ' + ago (cancelled [1]) + ')'] : ['span'],
               ]];
               return ['div', {
                  class: 'border-box items-start mb4 mw-100 pv3 relative w-100',
                  style: style ({
                     display: 'grid',
                     gap: '0.75rem',
                     'grid-template-columns': 'max-content minmax(0, max-content) minmax(min(8rem, 25%), 1fr)',
                     'margin-left': messageLevels [messageId.toLowerCase ()] ? (messageLevels [messageId.toLowerCase ()] * 2) + 'rem' : undefined,
                     width: messageLevels [messageId.toLowerCase ()] ? 'calc(100% - ' + (messageLevels [messageId.toLowerCase ()] * 2) + 'rem)' : undefined,
                  }),
               }, [
                  ['div', {
                     class: views.projectColor (messageIndexes [messageId.toLowerCase ()]) + ' absolute absolute--fill',
                     style: style ({
                        'border-radius': '0.75rem',
                        opacity: 0.2,
                        'pointer-events': 'none',
                     }),
                  }],
                  ['pre', {class: 'code f6 fw7 lh-solid ma0 pl3'}, [
                     replyTo ? ['span', {class: views.projectColor (messageIndexes [replyTo [1].toLowerCase ()], true)}, (messageIndexes [replyTo [1].toLowerCase ()] || '????') + '\n |- '] : '',
                     ['span', {class: 'br2 dib ph2 pv1 ' + views.projectColor (messageIndexes [messageId.toLowerCase ()], true)}, messageIndexes [messageId.toLowerCase ()]],
                     /^pending 1$/m.test (head) ? B.view (['cancelling', messageId], function (cancelling) {
                        return ['button', {
                           'aria-label': 'Stop message ' + messageIndexes [messageId.toLowerCase ()],
                           class: 'bn br2 db f7 fw7 mt2 ph2 pointer pv1 relative ' + views.projectColor (messageIndexes [messageId.toLowerCase ()], true),
                           disabled: !! cancelling,
                           onclick: B.ev ('cancel', 'message', messageId),
                           type: 'button',
                        }, cancelling ? 'Stopping...' : '■ Stop'];
                     }) : ['span'],
                  ]],
                  pane,
                  ['div', {
                     class: 'code f6 flex flex-column fw7 justify-between lh-solid self-stretch',
                     style: style ({
                        gap: '0.5rem',
                        'min-width': 0,
                        'overflow-wrap': 'anywhere',
                     }),
                  }, [
                     ['div', {class: 'flex flex-column'}, [
                        ['div', {class: 'br2 dib ph2 pv1 ' + views.projectColor (fromLabel, true)}, fromLabel],
                        tokenLabel ? ['div', {class: 'br2 dib lh-copy mt2 ph2 pv1 vlightblue'}, tokenLabel] : '',
                        usageLabel ? ['div', {class: 'br2 dib lh-copy mt2 ph2 pv1 vlightblue'}, usageLabel] : '',
                     ]],
                     ['div', {class: 'br2 dib ph2 pv1 ' + views.projectColor (timeLabel, true)}, timeLabel],
                  ]],
               ]];
            });
            return ['div', {
               class: 'flex flex-auto flex-column',
               style: style ({'min-height': 0}),
            }, [
               ['div', {
                  class: 'flex flex-auto relative',
                  style: style ({'min-height': 0}),
               }, [
                  ['div', {
                     class: 'flex-auto messages overflow-y-auto pa3',
                     style: style ({
                        'min-height': 0,
                        'min-width': 0,
                     }),
                  }, rendered],
                  ['div', {
                     class: 'absolute left-0 ma1 top-0 z-1',
                     style: style ({'pointer-events': 'none'}),
                  }, views.tooltip ('O', 'below')],
                  ['div', {
                     class: 'absolute bottom-0 left-0 ma1 z-1',
                     style: style ({'pointer-events': 'none'}),
                  }, views.tooltip ('I')],
               ]],
               ['div', {class: 'flex-shrink-0 mv3 relative w-100'}, [
                  views.tooltip ('/'),
                  ['i', {
                     class: 'absolute bi bi-search vmidblue',
                     style: style ({
                        left: '0.875rem',
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }],
                  ['input', {
                     'aria-label': 'Search messages',
                     class: 'ba bg-vdeepnavy border-box bw1 f5 fw6 outline-0 pr3 vlightblue vmidblue-border w-100',
                     id: 'search-messages',
                     oninput: B.ev ('set', ['search', 'content', 'query']),
                     placeholder: 'Search messages',
                     style: style ({
                        'border-radius': '0.75rem',
                        height: '3rem',
                        'padding-left': '2.5rem',
                        'padding-right': '12rem',
                     }),
                     type: 'text',
                     value: query,
                  }],
                  ['span', {
                     'aria-live': 'polite',
                     class: 'absolute f6 nowrap right-1 vgray',
                     style: style ({
                        'pointer-events': 'none',
                        top: '50%',
                        transform: 'translateY(-50%)',
                     }),
                  }, rendered.length + ' of ' + messages.length + (messages.length === 1 ? ' message' : ' messages')],
               ]],
            ]];
         }),
         // Draft
         ['div', {
            class: 'flex flex-column flex-shrink-0',
            style: style ({
               'border-top': '0.1875rem solid ' + css.colors.vborderblue,
               height: '20%',
            }),
         }, [
            B.view ('message', function (message) {
               message = message || {};
               var recipient = message.to || '';
               return ['div', {
                  class: 'flex items-center pv3',
                  style: style ({gap: '0.75rem'}),
               }, [
                  ['label', {
                     class: 'fw6 relative vlightblue',
                     for: 'chat-to',
                  }, [views.tooltip ('D'), 'To:']],
                  ['div', {
                     class: 'chat-recipient flex-auto relative',
                     style: style ({'min-width': 0}),
                  }, [
                     ['input', {
                        autocomplete: 'off',
                        class: 'ba bg-vdeepnavy border-box br2 f5 outline-0 pa2 vborderblue-border vlightblue w-100',
                        id: 'chat-to',
                        oninput: B.ev ('set', ['message', 'to']),
                        placeholder: 'all',
                        type: 'text',
                        value: recipient,
                     }],
                     ['div', {
                        class: 'absolute ba bg-vdeepnavy border-box br2 chat-recipient-options w-100',
                        style: style ({bottom: '100%', 'z-index': 10}),
                     }, dale.fil (['all', 'shell'].concat (function () {
                        var aiOptions = dale.fil (models, undefined, function (m) {
                           var creds = (B.get ('user', 'credentials') || {}) [m.provider] || {};
                           if (creds.account || creds.apiKey) return 'ai-' + m.model;
                        });
                        return aiOptions.length ? aiOptions : ['ai'];
                     } ()), undefined, function (to) {
                        if (to.indexOf (recipient.trim ().toLowerCase ()) === -1) return;
                        return ['button', {
                           class: 'bg-vdeepnavy bn db f5 pa2 pointer tl vlightblue w-100',
                           type: 'button',
                           onclick: B.ev ('set', ['message', 'to'], to) + ' if (editor) editor.focus ();',
                        }, to];
                     })],
                     ! dale.fil (models, undefined, function (m) {
                        var creds = (B.get ('user', 'credentials') || {}) [m.provider] || {};
                        if (creds.account || creds.apiKey) return true;
                     }).length && /^ai/i.test (recipient) ? ['div', {
                        class: 'absolute f7 fw6 gold',
                        style: style ({bottom: '100%', 'margin-bottom': '0.25rem'}),
                     }, 'Open settings to add an AI provider'] : '',
                  ]],
                  ['button', {
                     class: 'bg-vgreen black bn br2 f5 flex-shrink-0 fw7 ph3 pv2 pointer relative',
                     onclick: B.ev ('create', 'message', message.to, file.name, message.body),
                     type: 'button',
                  }, [views.tooltip ('↵'), 'Boom']],
               ]];
            }),
            ['div', {
               class: 'flex-auto relative',
               style: style ({'min-height': 0}),
            }, [
               views.tooltip ('M'),
               ['div', {
                  class: 'absolute absolute--fill overflow-hidden',
                  id: 'chat-editor',
                  opaque: true,
               }],
            ]],
         ]],
      ]];
   });
}

// *** ENTRYPOINT ***

CodeMirror.Vim.unmap ('/');

B.call ('load', 'user');
B.mount ('body', views.main);
