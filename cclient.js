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

   // *** SETUP ***

   ['navigate', '*', function (x) {
      window.location.hash = x.path;
   }],

   ['read', 'hash', function (x) {
      var hash = window.location.hash.slice (2).split ('/');

      var authViews   = ['signup', 'login'];
      var loggedViews = ['projects', 'project'];

      if (! inc (authViews.concat (loggedViews), hash [0])) return B.call (x, 'navigate', 'projects');

      if (inc (loggedViews, hash [0]) && ! B.get ('csrf')) return B.call (x, 'navigate', 'login');
      if (inc (authViews,   hash [0]) &&   B.get ('csrf')) return B.call (x, 'navigate', 'projects');

      if (hash [0] !== 'projects' && hash [1] !== undefined) return B.call (x, 'navigate', 'projects');

      var projectViews = ['doc', 'dialog', 'file'];

      if (! inc (projectViews, hash [2])) return B.call (x, 'navigate', 'projects');

      B.call (x, 'set', 'view', hash [2]);
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

         if (error && error.status !== 403) return B.call (x, 'error', 'Error when calling the server', error);

         B.call (x, 'set', 'mode', rs.body && rs.body.mode === 'LOCAL' ? 'local' : 'cloud');

         if (error && error.status === 403) return B.call (x, 'navigate', 'auth/login');

         if (rs.body.mode !== 'LOCAL') B.call (x, 'set', 'csrf', rs.body.csrf);
         clog ('foo');

         B.call (x, 'load', 'models');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');

         B.call (x, 'navigate', 'projects');
      });
   }],

   // *** LOAD DATA ***

   ...dale.go (['models', 'projects', 'settings'], function (entity) {
      return ['load', entity, function (x) {
         B.call (x, 'get', entity, function (x, error, rs) {
            B.call (x, 'set', entity, rs.body);
         });
      }];
   }),
]);

// *** VIEWS ***

var views = {};

views.main = function () {
   return ['h1', 'Hullo'];
}

// *** AUTH ***

dale.go (['login', 'signup'], function (v) {views [v] = views.auth (v)});

views.auth = function (page) {
   return B.view ('auth', function (email, otp, otpSent, signupRequested) {

      var card = function (title, subtitle, body, footer) {
         return ['div', {style: style ({display: 'flex', 'justify-content': 'center', 'align-items': 'center', 'min-height': '100vh', padding: '2rem'})}, [
            ['div', {style: style ({width: '100%', 'max-width': '460px', 'background-color': '#16213e', color: '#f5f7ff', padding: '1.5rem', 'border-radius': '12px', border: '1px solid #2b3558'})}, [
               ['h1', {style: style ({margin: '0 0 0.5rem 0', 'font-size': '1.6rem'})}, 'vibey'],
               ['div', {style: style ({color: '#94b8ff', 'font-size': '1.2rem', 'margin-bottom': '0.5rem'})}, title],
               ['div', {style: style ({color: '#9aa4bf', 'margin-bottom': '1rem', 'line-height': '1.5'})}, subtitle],
               body,
               footer || ''
            ]]
         ]];
      };

      if (page === 'signup') return card ('Request invite', 'Cloud mode uses invite-only signup. Enter your email and request access.', ['div', [
         ['input', {
            type: 'email',
            value: email || '',
            placeholder: 'you@example.com',
            oninput: B.ev ('set', ['auth', 'email']),
            style: style ({width: '100%', padding: '0.75rem', 'border-radius': '8px', border: '1px solid #2b3558', 'background-color': '#1a1a2e', color: '#f5f7ff', 'margin-bottom': '0.75rem'})
         }],
         signupRequested ? ['div', {style: style ({color: '#6ad48a', 'margin-bottom': '0.75rem'})}, 'Invite requested. Thank you for your interest!'] : '',
         ['button', {class: 'primary', style: style ({width: '100%'}), onclick: B.ev ('signup', [])}, 'Request invite']
      ]], ['div', {style: style ({'margin-top': '1rem', 'text-align': 'center'})}, [
         ['a', {href: '#/login', style: style ({color: '#94b8ff'})}, 'Already have access? Log in']
      ]]);

      return card ('Log in', 'Enter your email to receive a one-time code. Then verify it to enter vibey cloud.', ['div', [
         ['input', {
            type: 'email',
            value: email || '',
            placeholder: 'you@example.com',
            oninput: B.ev ('set', ['auth', 'email']),
            style: style ({width: '100%', padding: '0.75rem', 'border-radius': '8px', border: '1px solid #2b3558', 'background-color': '#1a1a2e', color: '#f5f7ff', 'margin-bottom': '0.75rem'})
         }],
         ['button', {class: 'primary', style: style ({width: '100%', 'margin-bottom': '0.75rem'}), onclick: B.ev ('login', [])}, otpSent ? 'Send another code' : 'Send code'],
         otpSent ? ['div', [
            ['input', {
               type: 'text',
               value: otp || '',
               placeholder: '6-digit code',
               oninput: B.ev ('set', ['auth', 'otp']),
               style: style ({width: '100%', padding: '0.75rem', 'border-radius': '8px', border: '1px solid #2b3558', 'background-color': '#1a1a2e', color: '#f5f7ff', 'margin-bottom': '0.75rem'})
            }],
            ['button', {class: 'primary', style: style ({width: '100%'}), onclick: B.ev ('verify', [])}, 'Verify']
         ]] : ''
      ]], ['div', {style: style ({'margin-top': '1rem', 'text-align': 'center'})}, [
         ['a', {href: '#/signup', style: style ({color: '#94b8ff'})}, 'Need an invite? Request access']
      ]]);
   });
}

// *** PROJECTS ***

views.projects = function () {
   return B.view ('projects', functino (projects) {
      return ['div', {class: 'projects-view'}, [
         ['div', {class: 'projects-shell'}, [
            ['div', {class: 'projects-header'}, [
               ['div', {class: 'projects-title'}, 'Projects']
            ]],
            ['div', {class: 'projects-new-wrap'}, [
               ['button', {class: 'primary projects-new-button', onclick: B.ev ('create', 'project')}, '+ New project']
            ]],
            projects && projects.length ? ['div', {class: 'projects-list'}, dale.go (projects, function (project) {
               var slug = type (project) === 'object' ? project.slug : project;
               var displayName = type (project) === 'object' ? project.name : project;
               var pcolor = h.projectColor (displayName);
               return ['div', {
                  class: 'project-card',
                  style: style ({'background-color': pcolor.bg, color: pcolor.fg, border: 'none'}),
                  onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs')
               }, [
                  ['span', {class: 'project-card-name'}, displayName],
                  ['span', {
                     class: 'project-card-delete',
                     onclick: B.ev ('delete', 'project', slug, {raw: 'event'})
                  }, '×']
               ]];
            })] : ['div', {class: 'projects-empty'}, 'No projects yet']
         ]]
      ]];
   });
};

// *** ENTRYPOINT ***

B.call ('load', 'csrf');
B.mount ('body', views.main);
