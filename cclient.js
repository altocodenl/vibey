// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

var type = teishi.type, inc = teishi.inc, style = lith.css.style, clog = console.log;

// *** NATIVE RESPONDERS ***

window.addEventListener ('hashchange', function () {
   B.call ('read', 'hash');
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

      if (inc (loggedViews, hash [0]) && ! B.get ('csrf')) return B.call (x, 'navigate', 'login');
      if (inc (authViews,   hash [0]) &&   B.get ('csrf')) return B.call (x, 'navigate', 'projects');

      if (hash.length > 1) {
         if (hash [0] !== 'projects') return B.call (x, 'navigate', 'projects');
         var projectViews = ['doc', 'dialog', 'file'];
         if (! inc (projectViews, hash [2])) return B.call (x, 'navigate', 'projects');
      }

      B.call (x, 'set', 'view', hash [0]);
   }],

   // *** REPORT ***

   ['report', '*', function (x, message) {
      var type = x.path [0];

      var snackbar = B.get ('snackbar');
      if (snackbar) {
         if (snackbar.timeout) clearTimeout (snackbar.timeout);
         B.call (x, 'rem', 'snackbar');
      }

      var timeout = setTimeout (function () {
         B.call (x, 'rem', 'snackbar');
      }, 4000);

      B.call (x, 'set', 'snackbar', {type: type, message: message, timeout: timeout});
   }],

   // *** AJAX ***

   [/^(get|post|put|delete)$/, '*', function (x, arg1, arg2) {
      var headers = {};
      var body = x.verb === 'get' ? ''   : arg1;
      var cb   = x.verb === 'get' ? arg1 : arg2;

      if (B.get ('csrf')) {
         if (x.path === 'delete') headers ['X-CSRF-Token'] = B.get ('csrf');
         else body.csrf = B.get ('csrf');
      }

      c.ajax (x.verb, x.path [0], headers, body, function (error, rs) {
         if (error && error.status === 403 && x.path [0].indexOf ('auth/') !== 0) {
            B.call (x, 'rem', [], dale.keys (B.get ()));
            B.call (x, 'get', 'csrf');
            B.call (x, 'navigate', 'login');
         }

         if (cb) cb (x, error, rs);
      });
   }],

   // *** AUTH ***

   ['load', 'csrf', function (x) {

      B.call (x, 'get', 'auth/csrf', function (x, error, rs) {

         if (error && error.status !== 403) return B.call (x, 'report', 'error', 'Error when reaching the server');

         B.call (x, 'set', 'mode', rs && rs.body.mode === 'LOCAL' ? 'local' : 'cloud');

         if (error && error.status === 403) return B.call (x, 'navigate', 'login');

         if (rs.body.mode !== 'LOCAL') B.call (x, 'set', 'csrf', rs.body.csrf);

         B.call (x, 'load', 'models');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');
         B.call (x, 'navigate', 'projects');
      });
   }],

   ['login', [], function (x, email) {
      if (! email) return B.call (x, 'report', 'error', 'Please enter your email');
      B.call (x, 'post', 'login', {email: email.trim ().toLowerCase ()}, function (x, error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to send login code');
         B.call (x, 'set', ['auth', 'otpRequested'], true);
      });
   }],

   ['verify', [], function (x, email, otp) {
      if (! email || ! otp) return B.call (x, 'report', 'error', 'Please enter your email and code');
      B.call (x, 'post', 'auth/verify', {email: email.trim ().toLowerCase (), otp: otp}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Invalid code');

         B.call (x, 'load', 'models');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');
         B.call (x, 'navigate', 'projects');
      });
   }],

   ['signup', [], function (x, email) {
      if (! email) return B.call (x, 'report', 'error', 'Please enter your email');
      B.call (x, 'post', 'auth/signup', {email: email.trim ().toLowerCase ()}, function (x, error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to request invite');
         B.call (x, 'set', ['auth', 'signupRequested'], true);
      });
   }],

   // *** LOAD DATA ***

   ...dale.go (['models', 'projects', 'settings'], function (entity) {
      return ['load', entity, function (x) {
         B.call (x, 'get', entity, function (x, error, rs) {
            if (error) return B.call (x, 'report', 'error', 'There was a problem loading ' + entity);
            B.call (x, 'set', entity, rs.body);
         });
      }];
   }),
]);

// *** VIEWS ***

var CSS = {
   vars: {
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
      dark:         '#333'
   },
   style: [
      ['body', {
         'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
         margin: 0,
         padding: 0,
         'background-color': '#1a1a2e',
         color: '#eee',
         height: '100vh'
      }],
      ['.bg-app-bg', {'background-color': '#1a1a2e'}],
      ['.bg-surface', {'background-color': '#16213e'}],
      ['.bg-input', {'background-color': '#0f1530'}],
      ['.bg-primary', {'background-color': '#4a69bd'}],
      ['.hover-bg-primary-hover:hover', {'background-color': '#1e3799'}],
      ['.near-text', {color: '#eee'}],
      ['.text-bright', {color: '#f5f7ff'}],
      ['.text-muted', {color: '#9aa4bf'}],
      ['.text-soft', {color: '#bac4e2'}],
      ['.light-blue', {color: '#94b8ff'}],
      ['.hover-white:hover', {color: '#fff'}],
      ['.b-border', {'border-color': 'rgba(148, 184, 255, 0.22)'}],
      ['.text-success', {color: '#04E762'}],
      ['.bg-success', {'background-color': '#04E762'}],
      ['.bg-error', {'background-color': '#D33E43'}],
      ['.bg-warning', {'background-color': '#ffff00'}],
      ['.bg-dark', {'background-color': '#333'}],
      ['.shadow-primary', {'box-shadow': '0 12px 30px rgba(30, 55, 153, 0.35)'}],
      ['.outline-0:focus', {outline: 'none'}],
      ['.placeholder-text-muted::placeholder', {color: '#9aa4bf', opacity: 1}]
   ]
};

var views = {};

views.main = function () {
   return B.view ([['view'], ['snackbar']], function (view, snackbar) {
      var current = views [view];
      var snackbarClass = snackbar && snackbar.type === 'ok' ? 'bg-success black' : snackbar && snackbar.type === 'warning' ? 'bg-warning black' : snackbar && snackbar.type === 'error' ? 'bg-error white' : 'bg-dark white';
      return ['div', {class: 'relative min-vh-100'}, [
         ['style', CSS.style],
         current ? ['div', {class: 'min-vh-100'}, [current ()]] : ['div'],
         snackbar ? ['div', {class: 'fixed left-0 right-0 bottom-0 pa3 pa4-ns', style: style ({'z-index': 2000})}, [
            ['div', {
               class: 'center mw7 br3 shadow-4 pa3 ph4-ns fw5 lh-copy tc ' + snackbarClass
            }, snackbar.message || '']
         ]] : ''
      ]];
   });
}

// *** AUTH ***

views.auth = function (page) {
   return B.view ('auth', function (auth) {
      auth = auth || {};

      var inputClass  = 'db w-100 pa3 mb3 br2 ba b-border bg-input text-bright outline-0 placeholder-text-muted';
      var buttonClass = 'db w-100 pa3 br2 bn bg-primary hover-bg-primary-hover white fw6 pointer';
      var linkWrap    = 'mt4 tc';
      var linkClass   = 'link light-blue hover-white';

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
            class: inputClass
         }],
         auth.signupRequested ? ['div', {class: 'mb3 text-success'}, 'Invite requested. Thank you for your interest!'] : '',
         ['button', {class: buttonClass, onclick: B.ev ('signup', [], auth.email)}, 'Request invite']
      ]], ['div', {class: linkWrap}, [
         ['a', {href: '#/login', class: linkClass}, 'Already have access? Log in']
      ]]);

      return card ('Log in', 'Enter your email to receive a one-time code. Then verify it to enter vibey cloud.', ['div', [
         ['input', {
            type: 'email',
            value: auth.email,
            placeholder: 'you@example.com',
            oninput: B.ev ('set', ['auth', 'email']),
            class: inputClass
         }],
         ['button', {class: buttonClass + ' mb3', onclick: B.ev ('login', [], auth.email)}, auth.otpRequested ? 'Send another code' : 'Send code'],
         auth.otpRequested ? ['div', [
            ['input', {
               type: 'text',
               value: auth.otp,
               placeholder: '6-digit code',
               oninput: B.ev ('set', ['auth', 'otp']),
               class: inputClass
            }],
            ['button', {class: buttonClass, onclick: B.ev ('verify', [], auth.email, auth.otp)}, 'Verify']
         ]] : ''
      ]], ['div', {class: linkWrap}, [
         ['a', {href: '#/signup', class: linkClass}, 'Need an invite? Request access']
      ]]);
   });
}

dale.go (['login', 'signup'], function (v) {views [v] = function () {return views.auth (v)}});

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

   return B.view ('projects', function (projects) {
      return ['div', {class: 'min-vh-100 flex justify-center pa3 pa4-ns bg-app-bg'}, [
         ['div', {class: 'w-100', style: style ({'max-width': '880px'})}, [
            ['div', {class: 'tc mb4'}, [
               ['div', {class: 'f2 fw7 text-bright'}, 'Projects']
            ]],
            ['div', {class: 'flex justify-center mb4'}, [
               ['button', {
                  class: 'db w-100 mw6 pa3 ph4 br3 bn bg-primary hover-bg-primary-hover white f4 fw6 pointer shadow-primary',
                  onclick: B.ev ('create', 'project')
               }, '+ New project']
            ]],
            projects && projects.length ? ['div', dale.go (projects || [], function (project) {
               var slug = type (project) === 'object' ? project.slug : project;
               var displayName = type (project) === 'object' ? project.name : project;
               var pcolor = projectColor (displayName);
               return ['div', {
                  class: 'flex justify-between items-center pa3 br3 mb3 pointer',
                  style: style ({'background-color': pcolor.bg, color: pcolor.fg, border: 'none'}) ,
                  onclick: B.ev ('navigate', 'project/' + encodeURIComponent (slug) + '/docs')
               }, [
                  ['span', {class: 'f4 fw6 lh-copy'}, displayName],
                  ['span', {
                     class: 'f2 lh-solid o-70 pointer',
                     onclick: B.ev ('delete', 'project', slug, {raw: 'event'})
                  }, '×']
               ]];
            })] : ['div', {class: 'tc f4 text-muted pv3'}, 'No projects yet']
         ]]
      ]];
   });
}

// *** ENTRYPOINT ***

B.call ('load', 'csrf');
B.mount ('body', views.main);
