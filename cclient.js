// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

var type = teishi.type, inc = teishi.inc, style = lith.css.style, clog = console.log;

// *** HELPERS ***

// TODO: remove after the server stops requiring slug names for projects
var slugify = function (name) {
   // Split into runs of pass-through chars [a-zA-Z0-9_-] and runs of everything else
   var parts = name.match (/[a-zA-Z0-9_\-]+|[^a-zA-Z0-9_\-]+/g) || [];
   return dale.go (parts, function (part) {
      if (/^[a-zA-Z0-9_\-]+$/.test (part)) return part;
      return '.' + btoa(String.fromCharCode(...new TextEncoder().encode(part)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') + '.';
   }).join ('');
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

// *** RESPONDERS ***

B.mrespond ([

   // *** NAVIGATION ***

   ['navigate', '*', function (x) {
      var hash = '#/' + x.path;
      if (window.location.hash === hash) return B.call (x, 'read', 'hash');
      else                               window.location.hash = '#/' + x.path;
   }],

   ['read', 'hash', function (x) {
      var hash = window.location.hash.slice (2).split ('/');

      var authViews   = ['signup', 'login'];
      var loggedViews = ['projects', 'project'];

      if (! inc (authViews.concat (loggedViews), hash [0])) return B.call (x, 'navigate', 'projects');

      if (inc (loggedViews, hash [0]) && ! B.get ('auth', 'csrf')) return B.call (x, 'navigate', 'login');
      if (inc (authViews,   hash [0]) &&   B.get ('auth', 'csrf')) return B.call (x, 'navigate', 'projects');

      if (hash.length > 1 && hash [0] !== 'project') return B.call (x, 'navigate', 'projects');

      if (hash [0] === 'project') {

         if (hash.length === 1) return B.call (x, 'navigate', 'projects');

         var projects = B.get ('projects');
         if (projects && ! dale.stop (projects, true, function (Project) {
            return Project.name === decodeURIComponent (hash [1]);
         })) return B.call (x, 'navigate', 'projects');

         B.call (x, 'set', 'project', decodeURIComponent (hash [1]));

         if (! hash [2]) return B.call (x, 'navigate', 'project/' + hash [1] + '/doc/main.md');

         var file = decodeURIComponent (hash.slice (2).join ('/'));

         var files = B.get ('files');
         if (files && ! inc (files, file)) return B.call (x, 'navigate', 'project/' + hash [1] + '/doc/main.md');

         B.call (x, 'set', ['file', 'name'], file);

         B.call (x, 'load', 'files');
      }
      if (hash [0] !== 'project') B.call (x, 'rem', [], 'file');

      B.call (x, 'set', 'view', hash [0]);

      if (inc (loggedViews, hash [0])) {
         B.call (x, 'load', 'models');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');
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
         if (snackbar.timeout) clearTimeout (snackbar.timeout);
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

      if (B.get ('auth', 'csrf')) {
         if (x.verb === 'delete') headers ['X-CSRF-Token'] = B.get ('auth', 'csrf');
         else body.csrf = B.get ('auth', 'csrf');
      }

      c.ajax (x.verb, x.path [0], headers, body, function (error, rs) {
         if (error) clog (error.responseText);
         if (error && error.status === 403 && x.path [0].indexOf ('auth/') !== 0) {
            B.call (x, 'set', [], {auth: {mode: 'cloud'}});
            B.call (x, 'navigate', 'login');
            return;
         }

         if (cb) cb (x, error, rs);
      });
   }],

   // *** AUTH ***

   ['load', 'csrf', function (x) {

      B.call (x, 'get', 'auth/csrf', function (x, error, rs) {

         if (error && error.status !== 403) return B.call (x, 'snackbar', 'error', 'Error when reaching the server');

         B.call (x, 'set', ['auth', 'mode'], rs && rs.body.mode === 'LOCAL' ? 'local' : 'cloud');

         if (error && error.status === 403) return B.call (x, 'navigate', 'login');

         if (rs.body.mode !== 'LOCAL') B.call (x, 'set', ['auth', 'csrf'], rs.body.csrf);

         B.call (x, 'read', 'hash');
      });
   }],

   ['login', [], function (x, email) {
      if (! email) return B.call (x, 'snackbar', 'error', 'Please enter your email');
      B.call (x, 'post', 'auth/login', {email: email.trim ().toLowerCase ()}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to send login code');
         B.call (x, 'set', ['auth', 'otpRequested'], true);
      });
   }],

   ['verify', [], function (x, email, otp) {
      if (! email || ! otp) return B.call (x, 'snackbar', 'error', 'Please enter your email and code');
      B.call (x, 'post', 'auth/verify', {email: email.trim ().toLowerCase (), otp: otp}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'Invalid code');

         B.call (x, 'set', ['auth', 'csrf'], rs.body.csrf);

         B.call (x, 'load', 'models');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');
         B.call (x, 'navigate', 'projects');
      });
   }],

   ['signup', [], function (x, email) {
      if (! email) return B.call (x, 'snackbar', 'error', 'Please enter your email');
      B.call (x, 'post', 'auth/signup', {email: email.trim ().toLowerCase ()}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to request invite');
         B.call (x, 'set', ['auth', 'signupRequested'], true);
      });
   }],

   ['logout', [], function (x) {
      B.call (x, 'post', 'auth/logout', {}, function (x, error) {
         B.call (x, 'set', [], {auth: {mode: 'cloud'}});
         B.call (x, 'navigate', 'login');
      });
   }],

   // *** LOAD DATA ***

   ...dale.go (['models', 'projects', 'settings'], function (entity) {
      return ['load', entity, function (x) {
         B.call (x, 'get', entity, function (x, error, rs) {
            if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading ' + entity);

            B.call (x, 'set', entity, rs.body);
         });
      }];
   }),

   // *** PROJECTS ***

   ['create', 'project', function (x) {
      var name = B.get ('new', 'project').trim ();
      if (name.length === 0) return B.call (x, 'snackbar', 'error', 'Please enter a project name');

      B.call (x, 'snackbar', 'ok', 'Creating new project...');
      B.call (x, 'post', 'projects', {name: name}, function (x, error) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to create project');

         B.call (x, 'snackbar', 'clear');

         B.call (x, 'rem', 'new', 'project');
         B.call (x, 'add', 'projects', {name: name});
         B.call (x, 'navigate', 'project/' + name + '/doc/main.md');
         B.call (x, 'load', 'projects');
      });
   }],

   ['remove', 'project', function (x, project) {
      if (! confirm ('Delete project "' + project.name + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'projects/' + project.slug, function (x, error) {
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

      var where = x.path [0];

      // Create new project / new file
      if (inc (['project', 'file'], where)) {
         if (ev.key !== 'Enter') return;
         B.call (x, 'create', where);
      }

      // Shortcut keys in inner view
      if (where === '') {
         if (ev.key === 'Meta') B.call ('set', ['key', 'command'], true);
         // Shortcuts for inner view
         if (ev.metaKey && B.get ('view') === 'project' && B.get ('new', 'file') === undefined) {
            if (ev.key === 'e') {
               ev.preventDefault ();
               B.call ('set', ['file', 'mode'], 'edit');
            }
            if (ev.key === 'i') {
               ev.preventDefault ();
               B.call ('set', ['file', 'mode'], 'view');
            }
            if (ev.key === 'd') {
               ev.preventDefault ();
               B.call ('set', ['new', 'file'], '');
            }
         }
         // Shortcuts for new file/dialog modal
         if (ev.metaKey && B.get ('view') === 'project' && B.get ('new', 'file') !== undefined) {
            if (ev.key === 'o') {
               ev.preventDefault ();
               B.call ('set', ['new', 'type'], 'doc');
            }
            if (ev.key === 'i') {
               ev.preventDefault ();
               B.call ('set', ['new', 'type'], 'dialog');
            }
            if (ev.key === 'x') {
               ev.preventDefault ();
               B.call ('rem', 'new', 'file');
            }
            if (ev.key === 'd') {
               ev.preventDefault ();
               B.call ('create', 'file');
            }
         }
      }
   }],

   [/^(keyup|blur)$/, '*', function (x, ev) {
      if (x.verb === 'keyup' && ev.key === 'Meta') B.call (x, 'rem', 'key', 'command');
      if (x.verb === 'blur') B.call (x, 'rem', 'key', 'command');
   }],

   ['change', ['new', 'project'], {priority: -1000}, function (x) {
      if (B.get ('new', 'project') !== undefined) c ('.new-project-input') [0].focus ();
   }],

   ['change', ['new', 'file'], {priority: -1000}, function (x) {
      if (B.get ('new', 'file') !== undefined) c ('.new-file-input') [0].focus ();
   }],

   // *** FILES ***

   ['load', 'files', function (x) {
      B.call (x, 'get', 'project/' + encodeURIComponent (slugify (B.get ('project'))) + '/files', function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading files');
         B.call (x, 'set', 'files', rs.body);
      });
   }],

   ['change', ['file', 'name'], function (x) {
      B.call (x, 'get', 'project/' + encodeURIComponent (slugify (B.get ('project'))) + '/file/' + B.get ('file', 'name'), function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem loading the file');
         B.call (x, 'set', ['file', 'content'], rs.body.content);
      });
   }],

   ['save', 'file', function (x, name, value, New) {
      B.call (x, 'post', 'project/' + encodeURIComponent (slugify (B.get ('project'))) + '/file/' + name, {content: value}, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'There was a problem ' + (New ? 'creating' : 'saving') + ' the file');

         if (! New) B.call (x, 'mset', ['file', 'content'], value);
         else       B.call (x, 'navigate', 'project/' + B.get ('project') + '/' + name);
      });
   }],

   ['create', 'file', function (x) {
      var name = B.get ('new', 'file').trim ();
      if (name.length === 0) return B.call (x, 'snackbar', 'error', 'Please enter a file name');
      name = 'doc/' + name + '.md';

      B.call (x, 'madd', 'files', name);
      B.call (x, 'save', 'file', name, '', 'new');
      B.call (x, 'rem', 'new', 'file');
      B.call (x, 'load', 'files');
   }],

   ['remove', 'file', function (x, name) {
      if (! confirm ('Delete file"' + name + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'project/' + encodeURIComponent (slugify (B.get ('project'))) + '/file/' + name, function (x, error, rs) {
         if (error) return B.call (x, 'snackbar', 'error', 'Failed to delete file');
         B.call (x, 'load', 'files');
         if (B.get ('file', 'name') === name) B.call (x, 'navigate', 'project/' + B.get ('project') + '/doc/main.md');
      });
   }],

]);

// *** VIEWS ***

var css = {
   colors: {
      appBg:        '#1a1a2e',
      surface:      '#16213e',
      inputBg:      '#0f1530',
      primary:      '#4a69bd',
      primaryHover: '#1e3799',
      text:         '#eee',
      textBright:   '#f5f7ff',
      textMuted:    '#9aa4bf',
      textSoft:     '#bac4e2',
      link:         '#94b8ff',
      white:        '#fff',
      border:       'rgba(148, 184, 255, 0.22)',
      success:      '#04E762',
      error:        '#D33E43',
      warning:      '#ffff00',
      dark:         '#333',
      purple:       '#5a189a'
   },
   input:      'db w-100 pa3 mb3 br2 ba b-border bg-input text-bright outline-0 placeholder-text-muted',
   button:     'pa3 br2 bn bg-primary hover-bg-primary-hover white fw6 pointer',
   buttonWide: 'db w-100 pa3 br2 bn bg-primary hover-bg-primary-hover white fw6 pointer',
}

css.style = [
   ['body', {
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      margin: 0,
      padding: 0,
      'background-color': css.colors.appBg,
      color: css.colors.text,
      height: '100vh'
   }],
   ['.bg-app-bg', {'background-color': css.colors.appBg}],
   ['.bg-surface', {'background-color': css.colors.surface}],
   ['.bg-input', {'background-color': css.colors.inputBg}],
   ['.bg-primary', {'background-color': css.colors.primary}],
   ['.hover-bg-primary-hover:hover', {'background-color': css.colors.primaryHover}],
   ['.near-text', {color: css.colors.text}],
   ['.text-bright', {color: css.colors.textBright}],
   ['.text-muted', {color: css.colors.textMuted}],
   ['.text-soft', {color: css.colors.textSoft}],
   ['.light-blue', {color: css.colors.link}],
   ['.hover-white:hover', {color: css.colors.white}],
   ['.b-border', {'border-color': css.colors.border}],
   ['.text-success', {color: css.colors.success}],
   ['.bg-success', {'background-color': css.colors.success}],
   ['.bg-error', {'background-color': css.colors.error}],
   ['.bg-warning', {'background-color': css.colors.warning}],
   ['.bg-dark', {'background-color': css.colors.dark}],
   ['.shadow-primary', {'box-shadow': '0 12px 30px rgba(30, 55, 153, 0.35)'}],
   ['.outline-0:focus', {outline: 'none'}],
   ['.placeholder-text-muted::placeholder', {color: css.colors.textMuted, opacity: '1'}],

   ['LITERAL', '@keyframes spinny {0%, 24.99% { content: "|"; } 25%, 49.99% { content: "/"; } 50%, 74.99% { content: "-"; } 75%, 100% { content: "\\\\"; }}'],

   ['.spinny', {
      display: 'inline-block',
      width: '2ch',
      'text-align': 'center',
      color: css.colors.primary,
      'font-family': 'monospace',
      'font-size': '2.5rem',
      'font-weight': '700',
      'line-height': 1
   }],

   ['.spinny:before', {
      content: '"|"',
      animation: 'spinny 0.8s steps(1) infinite'
   }],

   ['.modal-backdrop', {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: 24,
      'background-color': 'rgba(8, 12, 28, 0.74)',
      'z-index': 3000
   }],
   ['.modal-card', {
      width: 1,
      'max-width': 560,
      padding: 28,
      'border-radius': 18,
      border: '1px solid ' + css.colors.border,
      'background-color': css.colors.surface,
      'box-shadow': '0 28px 80px rgba(0, 0, 0, 0.38)'
   }],
   ['.project-modal-kicker', {
      'font-size': '0.78rem',
      'font-weight': '700',
      'letter-spacing': '0.12em',
      'text-transform': 'uppercase',
      color: css.colors.link,
      'margin-bottom': 10
   }],
   ['.project-modal-title', {
      'font-size': '1.9rem',
      'font-weight': '700',
      color: css.colors.textBright,
      'margin-bottom': 8
   }],
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
      border: '1px solid ' + css.colors.border,
      'background-color': css.colors.surface,
      'box-shadow': '0 20px 60px rgba(0, 0, 0, 0.22)',
      'box-sizing': 'border-box',
      'min-height': 0
   }],
   ['.project-pane-left', {
      'min-width': 0
   }],
   ['.project-pane-right', {
      'min-width': 0,
      display: 'flex',
      'flex-direction': 'column'
   }],
   ['.cmd-tooltip', {
      position: 'absolute',
      top: -28,
      left: '50%',
      transform: 'translateX(-50%)',
      'background-color': css.colors.primary,
      color: '#fff',
      'font-size': '0.72rem',
      'font-weight': '700',
      padding: '2px 8px',
      'border-radius': 5,
      'white-space': 'nowrap',
      'pointer-events': 'none',
      'z-index': 10
   }],
]

var views = {};

views.main = function () {
   return B.view ([['view'], ['snackbar']], function (view, snackbar) {
      return ['div', {class: 'relative min-vh-100'}, [
         ['style', css.style],

         (function () {
            var current = views [view];
            return current ? ['div', {class: 'min-vh-100'}, [current ()]] : ['div'];
         }) (),

         (function () {
            var snackbarClass = snackbar && snackbar.type === 'ok' ? 'bg-success black' : snackbar && snackbar.type === 'warning' ? 'bg-warning black' : snackbar && snackbar.type === 'error' ? 'bg-error white' : 'bg-dark white';

            if (snackbar) return ['div', {class: 'fixed left-0 right-0 bottom-0 pa3 pa4-ns', style: style ({'z-index': 2000})}, [
               ['div', {
                  class: 'center mw7 br3 shadow-4 pa3 ph4-ns fw5 lh-copy tc ' + snackbarClass
               }, snackbar.message || '']
            ]];
         }) (),

         ! inc (['login', 'signup'], view) ? ['button', {
            class: css.button + ' absolute top-0 right-0 pa2 ph3 f5',
            style: style ({'z-index': 1000, 'background-color': css.colors.purple, margin: '24px 24px 0 0'}),
            onclick: B.ev ('logout', [])
         }, [['i', {class: 'bi bi-person-walking mr1'}], 'Logout']] : ''
      ]];
   });
}

// *** AUTH ***

views.auth = function (page) {
   return B.view ('auth', function (auth) {
      auth = auth || {};

      var linkWrap  = 'mt4 tc';
      var linkClass = 'link light-blue hover-white';

      var card = function (title, subtitle, body, footer) {
         return ['div', {class: 'min-vh-100 flex items-center justify-center pa4 bg-app-bg'}, [
            ['div', {class: 'w-100 mw6 bg-surface text-bright pa4 pa5-ns br3 ba b-border shadow-3'}, [
               ['h1', {class: 'ma0 mb2 f3 fw6 text-bright'}, 'vibey'],
               ['div', {class: 'light-blue f4 fw5 mb2'}, title],
               ['div', {class: 'text-muted lh-copy mb4'}, subtitle],
               body,
               footer || ''
            ]]
         ]];
      };

      if (page === 'signup') return card ('Request invite', 'Cloud mode uses invite-only signup. Enter your email and request access.', ['div', [
         ['input', {
            type: 'email',
            value: auth.email,
            placeholder: 'you@example.com',
            oninput: B.ev ('set', ['auth', 'email']),
            class: css.input
         }],
         auth.signupRequested ? ['div', {class: 'mb3 text-success'}, 'Invite requested. Thank you for your interest!'] : '',
         ['button', {class: css.buttonWide, onclick: B.ev ('signup', [], auth.email)}, 'Request invite']
      ]], ['div', {class: linkWrap}, [
         ['a', {href: '#/login', class: linkClass}, 'Already have access? Log in']
      ]]);

      return card ('Log in', 'Enter your email to receive a one-time code. Then verify it to enter vibey cloud.', ['div', [
         ['input', {
            type: 'email',
            value: auth.email,
            placeholder: 'you@example.com',
            oninput: B.ev ('set', ['auth', 'email']),
            class: css.input
         }],
         ['button', {class: css.buttonWide + ' mb3', onclick: B.ev ('login', [], auth.email)}, auth.otpRequested ? 'Send another code' : 'Send code'],
         auth.otpRequested ? ['div', [
            ['input', {
               type: 'text',
               value: auth.otp,
               placeholder: '6-digit code',
               oninput: B.ev ('set', ['auth', 'otp']),
               class: css.input
            }],
            ['button', {class: css.buttonWide, onclick: B.ev ('verify', [], auth.email, auth.otp)}, 'Verify']
         ]] : ''
      ]], ['div', {class: linkWrap}, [
         ['a', {href: '#/signup', class: linkClass}, 'Need an invite? Request access']
      ]]);
   });
}

dale.go (['login', 'signup'], (v) => views [v] = () => views.auth (v));

// *** PROJECTS ***

views.projects = function () {

   var projectColors = [
      {bg: '#264653', fg: '#f1faee'},
      {bg: '#2a9d8f', fg: '#f1faee'},
      {bg: '#3d5a80', fg: '#f1faee'},
      {bg: '#4a4e69', fg: '#f1faee'},
      {bg: '#5a189a', fg: '#f1faee'},
      {bg: '#6d597a', fg: '#f1faee'},
      {bg: '#7f5539', fg: '#fff8e7'},
      {bg: '#8d99ae', fg: '#0b132b'},
      {bg: '#a44a3f', fg: '#fff8e7'},
      {bg: '#b56576', fg: '#fff8e7'},
      {bg: '#bc6c25', fg: '#fff8e7'},
      {bg: '#457b9d', fg: '#f1faee'}
   ];

   var projectColor = function (text) {
      var sum = dale.acc (((text || '') + '').split (''), 0, function (a, b) {
         return a + b.charCodeAt (0);
      });
      return projectColors [sum % projectColors.length];
   }

   return B.view ([['projects'], ['new', 'project']], function (projects, newProject) {
      return ['div', {class: 'min-vh-100 flex justify-center pa3 pa4-ns bg-app-bg'}, [
         ['div', {class: 'w-100', style: style ({'max-width': 880})}, [
            ['div', {class: 'tc mb4'}, [
               ['div', {class: 'f2 fw7 text-bright'}, 'Projects']
            ]],
            ['div', {class: 'flex justify-center mb4'}, [
               ['button', {
                  class: css.buttonWide + ' mw6 ph4 f4 shadow-primary',
                  onclick: B.ev ('set', ['new', 'project'], '')
               }, '+ New']
            ]],
            (function () {
               if (! projects) return ['div', {class: 'tc pv5'}, dale.go (dale.times (8), () => ['span', {class: 'spinny'}])];

               if (projects.length) return ['div', dale.go (projects || [], function (project) {
                  var pcolor = projectColor (project.name);
                  return ['div', {
                     class: 'flex justify-between items-center pa3 br3 mb3 pointer',
                     style: style ({'background-color': pcolor.bg, color: pcolor.fg, border: 'none'}) ,
                     onclick: B.ev ('navigate', 'project/' + encodeURIComponent (project.name))
                  }, [
                     ['span', {class: 'f4 fw6 lh-copy'}, project.name],
                     ['span', {
                        class: 'f2 lh-solid o-70 pointer',
                        onclick: B.ev (['stop', 'propagation', {raw: 'event'}], ['remove', 'project', project])
                     }, '×']
                  ]];
               })];

               return ['div', {class: 'tc f4 text-muted pv3'}, 'No projects yet'];
            }) (),
         ]],
         newProject !== undefined ? ['div', {class: 'modal-backdrop', onclick: B.ev ('rem', 'new', 'project')}, [
            ['div', {class: 'modal-card', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'project-modal-kicker'}, 'New project'],
               ['div', {class: 'project-modal-title'}, 'Name your next world...'],
               ['input', {
                  class: css.input + ' mb0 new-project-input',
                  type: 'text',
                  placeholder: 'I have this idea',
                  value: newProject,
                  oninput: B.ev ('set', ['new', 'project']),
                  onkeydown: B.ev ('keydown', 'project', {raw: 'event'})
               }],
               ['div', {class: 'modal-actions'}, [
                  ['button', {class: css.button, onclick: B.ev ('rem', 'new', 'project')}, 'Cancel'],
                  ['button', {class: css.button, onclick: B.ev ('create', 'project'), disabled: ! ((newProject || '').trim ())}, 'Create project']
               ]]
            ]]
         ]] : ''
      ]];
   });
}

views.project = function () {
   return B.view ([['projects'], ['project']], function (projects, project) {
      if (! projects) return ['div', {class: 'tc pv5'}, dale.go (dale.times (8), () => ['span', {class: 'spinny'}])];

      return ['div', {class: 'project-shell bg-app-bg'}, [
         ['div', {class: 'flex items-center'}, [
            ['span', {
               class: 'f1 fw7 light-blue pointer mr3',
               style: style ({'line-height': 1}),
               onclick: B.ev ('navigate', 'projects')
            }, '‹'],
            ['span', {class: 'f2 fw7 text-bright'}, project]
         ]],
         ['div', {class: 'project-main'}, [
            B.view ([['files'], ['file', 'name'], ['new', 'file'], ['file', 'remove'], ['key', 'command'], ['new', 'type']], function (files, name, newFileName, remove, command, newType) {
               files = (teishi.copy (files) || []).sort ();
               return ['div', {class: 'project-pane project-pane-left', style: style ({display: 'flex', 'flex-direction': 'column'})}, [
                  ['div', {style: style ({flex: 1, overflow: 'auto'})}, [
                     ['br'], ['br'],
                     ! files ? ['div', {class: 'text-muted lh-copy'}, 'Loading files...'] : ! files.length ? ['div', {class: 'text-muted lh-copy'}, 'No files yet.'] : ['div', dale.go (files, function (file) {
                        var active = file === name;
                        return ['div', {
                           class: 'mb2 pb2',
                           style: style ({
                              'border-bottom': '1px solid ' + css.colors.border,
                              'background-color': active ? 'rgba(74, 105, 189, 0.25)' : undefined,
                              'border-left': active ? '3px solid ' + css.colors.link : '3px solid transparent',
                              padding: '8px 10px',
                              'border-radius': 4,
                           })
                        }, [
                           ['div', {
                              class: 'flex justify-between items-center'
                           }, [
                              ['div', {
                                 class: (active ? 'text-bright fw6' : file.indexOf ('doc/') === 0 ? 'light-blue' : 'text-bright') + ' fw5 lh-copy pointer',
                                 onclick: B.ev ('navigate', 'project/' + B.get ('project') + '/' + file)
                              }, (function () {
                                 if (file.match ('^doc/')) return [['i', {class: 'bi bi-file-text mr1'}], file];
                                 return file;
                              }) ()],
                              remove && file !== 'doc/main.md' ? ['span', {
                                 class: 'f4 lh-solid pointer',
                                 style: style ({color: css.colors.purple}),
                                 onclick: B.ev (['stop', 'propagation', {raw: 'event'}], ['remove', 'file', file])
                              }, '×'] : []
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
                        class: css.button + ' f6 ph3 pv2',
                        style: style ({'background-color': css.colors.purple}),
                        onclick: B.ev ('set', ['file', 'remove'], ! remove)
                     }, [['i', {class: 'bi ' + (remove ? 'bi-check-lg' : 'bi-eraser-fill') + ' mr1'}], remove ? 'Done removing' : 'Remove']],
                  ]],

                  newFileName !== undefined ? (function () {
                     var isDialog = newType === 'dialog';
                     return ['div', {class: 'modal-backdrop', onclick: B.ev (['rem', 'new', 'file'], ['rem', 'new', 'type'])}, [
                        ['div', {class: 'modal-card', onclick: 'event.stopPropagation()'}, [
                           ['div', {class: 'flex mb3', style: style ({gap: '0.5rem'})}, [
                              ['button', {
                                 class: css.button + ' f6 ph3 pv2 relative' + (! isDialog ? ' shadow-primary' : ''),
                                 style: ! isDialog ? '' : style ({'background-color': 'transparent', border: '1px solid ' + css.colors.border, color: css.colors.textMuted}),
                                 onclick: B.ev ('set', ['new', 'type'], 'doc')
                              }, [
                                 command ? ['span', {class: 'cmd-tooltip'}, 'O'] : '',
                                 ['i', {class: 'bi bi-file-text mr1'}], 'Doc'
                              ]],
                              ['button', {
                                 class: css.button + ' f6 ph3 pv2 relative' + (isDialog ? ' shadow-primary' : ''),
                                 style: isDialog ? '' : style ({'background-color': 'transparent', border: '1px solid ' + css.colors.border, color: css.colors.textMuted}),
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
                              onkeydown: B.ev ('keydown', 'file', {raw: 'event'})
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
               ]];
            }),
            B.view ([['file', 'content'], ['file', 'mode'], ['file', 'name']], function (content, mode, fileName) {
               return ['div', {class: 'project-pane project-pane-right'}, [
                  B.view ([['new', 'file'], ['key', 'command']], function (newFile, command) {
                     var showTooltip = command && newFile === undefined;
                     return ['div', {class: 'flex items-center mb3'}, [
                        ['span', {class: 'fw6 text-bright mr3'}, (fileName || '').replace (/^doc\//, '').replace (/\.md$/, '')],
                        ['span', {
                           class: 'pointer fw6 mr3 relative ' + (mode !== 'edit' ? 'text-bright' : 'text-muted'),
                           onclick: B.ev ('set', ['file', 'mode'], 'view')
                        }, [
                           showTooltip && mode && mode !== 'view' ? ['span', {class: 'cmd-tooltip'}, 'I'] : '',
                           ['i', {class: 'bi bi-eye mr1'}], 'View'
                        ]],
                        ['span', {
                           class: 'pointer fw6 relative ' + (mode === 'edit' ? 'text-bright' : 'text-muted'),
                           onclick: B.ev ('set', ['file', 'mode'], 'edit')
                        }, [
                           showTooltip && mode !== 'edit' ? ['span', {class: 'cmd-tooltip'}, 'E'] : '',
                           ['i', {class: 'bi bi-hand-index mr1'}], 'Edit'
                        ]],
                     ]];
                  }),
                  (function () {
                     if (mode === 'edit') return ['textarea', {
                        class: 'db w-100 bn outline-0 text-bright lh-copy f5',
                        style: style ({'background-color': css.colors.surface, color: css.colors.textBright, flex: 1, resize: 'none', 'font-family': 'monospace'}),
                        oninput:  B.ev ('save', 'file', B.get ('file', 'name'), {raw: 'this.value'}),
                        onchange: B.ev ('save', 'file', B.get ('file', 'name'), {raw: 'this.value'}),
                        value: content
                     }, content || ''];
                     return ['div', {class: 'text-muted lh-copy', style: style ({flex: 1, overflow: 'auto'}), opaque: true}, ['LITERAL', marked.parse (content || '')]];
                  }) (),
               ]];
            }),
         ]]
      ]];
   });
}

// *** ENTRYPOINT ***

B.call ('load', 'csrf');
B.mount ('body', views.main);
