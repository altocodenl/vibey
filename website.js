var fs   = require ('fs');
var dale = require ('dale');
var lith = require ('lith');

var css = lith.css.g;
var style = lith.css.style;

// *** COLORS & TOKENS ***

var C = {
   bg:        '#0a0a0a',
   surface:   '#141414',
   surface2:  '#1e1e1e',
   border:    '#2a2a2a',
   text:      '#e8e8e8',
   textDim:   '#999',
   accent:    '#b07aff',
   accentDim: '#8a5cd6',
   green:     '#4ec970',
   code:      '#1a1a2e',
   codeBorder:'#2a2a4e',
   white:     '#fff'
};

var font     = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
var fontMono = "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace";

// *** STYLES ***

var styles = css ([
   ['*', {'box-sizing': 'border-box', margin: 0, padding: 0}],
   ['html', {'font-size': '17px', 'scroll-behavior': 'smooth'}],
   ['body', {
      'font-family': font,
      'background-color': C.bg,
      color: C.text,
      'line-height': '1.7',
      '-webkit-font-smoothing': 'antialiased'
   }],

   // *** LAYOUT ***
   ['.wrap', {
      'max-width': '740px',
      margin: '0 auto',
      padding: '0 24px'
   }],

   // *** HERO ***
   ['.hero', {
      'padding-top': '100px',
      'padding-bottom': '80px',
      'text-align': 'center'
   }],
   ['.hero h1', {
      'font-size': '3.2rem',
      'font-weight': '700',
      'letter-spacing': '-0.03em',
      'line-height': '1.15',
      'margin-bottom': '20px'
   }],
   ['.hero h1 em', {
      'font-style': 'normal',
      color: C.accent
   }],
   ['.hero .tagline', {
      'font-size': '1.25rem',
      color: C.textDim,
      'max-width': '520px',
      margin: '0 auto',
      'line-height': '1.6'
   }],

   // *** PILLARS ***
   ['.pillars', {
      'padding-bottom': '60px'
   }],
   ['.pillar', {
      background: C.surface,
      border: '1px solid ' + C.border,
      'border-radius': '12px',
      padding: '32px',
      'margin-bottom': '20px'
   }],
   ['.pillar h3', {
      'font-size': '1.15rem',
      'font-weight': '600',
      'margin-bottom': '10px',
      display: 'flex',
      'align-items': 'center',
      gap: '10px'
   }],
   ['.pillar h3 .num', {
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      width: '28px',
      height: '28px',
      'border-radius': '50%',
      background: C.accent,
      color: C.bg,
      'font-size': '0.8rem',
      'font-weight': '700',
      'flex-shrink': '0'
   }],
   ['.pillar p', {
      color: C.textDim,
      'line-height': '1.7'
   }],
   ['.pillar strong', {
      color: C.text,
      'font-weight': '600'
   }],

   // *** INSTALL ***
   ['.install', {
      'padding-bottom': '80px'
   }],
   ['.install h2', {
      'font-size': '1.8rem',
      'font-weight': '700',
      'letter-spacing': '-0.02em',
      'margin-bottom': '12px'
   }],
   ['.install .prereq', {
      color: C.textDim,
      'margin-bottom': '28px',
      'font-size': '0.95rem'
   }],
   ['.step', {
      'margin-bottom': '24px'
   }],
   ['.step-label', {
      'font-size': '0.85rem',
      color: C.textDim,
      'margin-bottom': '8px',
      'text-transform': 'uppercase',
      'letter-spacing': '0.06em',
      'font-weight': '600'
   }],
   ['.step-link', {
      display: 'inline-flex',
      'align-items': 'center',
      gap: '8px',
      color: C.accent,
      'text-decoration': 'none',
      'font-weight': '600',
      background: C.surface2,
      border: '1px solid ' + C.border,
      'border-radius': '999px',
      padding: '8px 14px'
   }],
   ['.step-link:hover', {
      color: C.white,
      'border-color': C.accent
   }],
   ['.code-row', {
      display: 'flex',
      'align-items': 'flex-start',
      gap: '12px'
   }],
   ['.code-block', {
      background: C.code,
      border: '1px solid ' + C.codeBorder,
      'border-radius': '8px',
      padding: '16px 20px 16px 20px',
      'font-family': fontMono,
      'font-size': '0.9rem',
      'line-height': '1.6',
      'overflow-x': 'auto',
      color: C.green,
      'white-space': 'pre',
      flex: '1',
      'min-width': '0'
   }],
   ['.code-text', {
      display: 'block',
      '-webkit-user-select': 'all',
      'user-select': 'all'
   }],
   ['.copy-btn', {
      position: 'static',
      background: C.code,
      border: '1px solid ' + C.codeBorder,
      'border-radius': '8px',
      color: C.textDim,
      cursor: 'pointer',
      padding: '10px 14px',
      'font-size': '0.75rem',
      'font-family': font,
      transition: 'color 0.15s, border-color 0.15s',
      '-webkit-user-select': 'none',
      'user-select': 'none',
      'white-space': 'nowrap',
      'align-self': 'flex-start'
   }],
   ['.copy-btn:hover', {
      color: C.accent,
      'border-color': C.accent
   }],

   // *** FOOTER ***
   ['.foot', {
      'border-top': '1px solid ' + C.border,
      'padding-top': '40px',
      'padding-bottom': '60px',
      'text-align': 'center',
      color: C.textDim,
      'font-size': '0.9rem'
   }],
   ['.foot a', {
      color: C.accent,
      'text-decoration': 'none'
   }],
   ['.foot a:hover', {
      'text-decoration': 'underline'
   }],

   // *** USAGE ***
   ['.usage', {
      'padding-bottom': '60px'
   }],
   ['.usage h2', {
      'font-size': '1.8rem',
      'font-weight': '700',
      'letter-spacing': '-0.02em',
      'margin-bottom': '24px'
   }],

   // *** HUMANITY ***
   ['.humanity', {
      'padding-bottom': '60px',
      'text-align': 'center'
   }],
   ['.humanity p', {
      color: C.textDim,
      'font-size': '1.05rem',
      'max-width': '580px',
      margin: '0 auto',
      'line-height': '1.8',
      'font-style': 'italic'
   }],

]);

// media query handled manually
var mediaQuery = '@media (max-width: 600px){' + css ([
   ['.hero h1', {'font-size': '2.2rem'}],
   ['.wrap', {padding: '0 16px'}],
   ['.pillar', {padding: '24px'}],
   ['.code-row', {'flex-direction': 'column'}],
   ['.copy-btn', {width: '100%', 'text-align': 'center'}],
   ['.step-link', {width: '100%', 'justify-content': 'center'}]
]) + '}';

// *** COPY BUTTON SCRIPT ***

var copyScript = [
   'document.addEventListener("click", function(e) {',
   '  if (!e.target.classList.contains("copy-btn")) return;',
   '  var block = e.target.parentNode.querySelector(".code-text");',
   '  if (!block) return;',
   '  var text = block.textContent;',
   '  navigator.clipboard.writeText(text).then(function() {',
   '    e.target.textContent = "copied!";',
   '    setTimeout(function() { e.target.textContent = "copy"; }, 1500);',
   '  });',
   '});'
].join ('\n');

// *** HELPERS ***

var codeBlock = function (text) {
   return ['div', {class: 'code-row'}, [
      ['div', {class: 'code-block'}, [
         ['span', {class: 'code-text'}, text]
      ]],
      ['button', {class: 'copy-btn'}, 'copy']
   ]];
};

var pillar = function (num, title, body) {
   return ['div', {class: 'pillar'}, [
      ['h3', [
         ['span', {class: 'num'}, '' + num],
         ['LITERAL', title]
      ]],
      ['p', ['LITERAL', body]]
   ]];
};

// *** PAGE ***

var page = ['html', {lang: 'en'}, [
   ['head', [
      ['meta', {charset: 'utf-8'}],
      ['meta', {name: 'viewport', content: 'width=device-width, initial-scale=1'}],
      ['title', 'Vibey — Build your ideas with your words.'],
      ['meta', {name: 'description', content: 'Build your ideas with your words. An agentic interface where everything is a document, everything runs in your browser, and agents work at full speed inside safe containers.'}],
      ['link', {rel: 'preconnect', href: 'https://fonts.googleapis.com'}],
      ['link', {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''}],
      ['link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap'}],
      ['style', ['LITERAL', styles + mediaQuery]]
   ]],
   ['body', [

      // *** HERO ***
      ['div', {class: 'wrap'}, [
         ['div', {class: 'hero'}, [
            ['h1', ['LITERAL', '<em>Vibey</em>']],
            ['p', {class: 'tagline'}, 'Build your ideas with your words.'],
         ]],

         // *** PILLARS ***
         ['div', {class: 'pillars'}, [
            pillar (1, 'Everything is a document',
               'Your description of what you\'re building. The dialogs with AI while building it. How you orchestrate your agents. Documents are the source of truth for everything. <strong>There is no database.</strong>'),

            pillar (2, 'Everything in your browser',
               'Your documents are not only text: use images, audio, and embed small apps in your documents. No terminal or dedicated native app required.'),

            pillar (3, 'Safe YOLO',
               'The agents don\'t ask for permission, they just run the commands that they need for the task you give them, so they work at full speed. <strong>But</strong> each project is fully isolated in its own container and volume. A rogue agent\'s blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.'),


         ]],

         // *** HUMANITY ***
         ['div', {class: 'humanity'}, [
            ['p', 'For the students of humanities stranded in the digital age: this is your chance to build a world with your words. Not cryptic commands, without the tens of hours of practice that are required to figure out misplaced semicolons. Describe your world and see it come to life.']
         ]],

         // *** INSTALL ***
         ['div', {class: 'install'}, [
            ['h2', 'Get started'],
            ['p', {class: 'prereq'}, ['LITERAL', 'Requirements: <strong>macOS or Linux</strong> and <strong>Docker</strong> installed and running. Open a terminal and run these commands:']],

            ['div', {class: 'step'}, [
               ['div', {class: 'step-label'}, '1. Install'],
               codeBlock ('curl -fsSL https://raw.githubusercontent.com/altocodenl/vibey/main/install.sh | sh')
            ]],

            ['div', {class: 'step'}, [
               ['div', {class: 'step-label'}, '2. Start'],
               codeBlock ('cd vibey\ndocker compose up --build')
            ]],

            ['div', {class: 'step'}, [
               ['div', {class: 'step-label'}, '3. Open'],
               ['a', {class: 'step-link', href: 'http://localhost:5353', target: '_blank', rel: 'noopener'}, 'http://localhost:5353']
            ]]
         ]],

         // *** USAGE ***
         ['div', {class: 'usage'}, [
            ['h2', 'Usage'],

            ['div', {class: 'step'}, [
               ['div', {class: 'step-label'}, 'Stop vibey'],
               codeBlock ('docker compose down')
            ]],

            ['div', {class: 'step'}, [
               ['div', {class: 'step-label'}, 'Reset all data'],
               codeBlock ('docker compose down -v')
            ]]
         ]],

         // *** FOOTER ***
         ['div', {class: 'foot'}, [
            ['p', ['LITERAL', '<a href="https://github.com/altocodenl/vibey">GitHub</a> · Vibey is not experimental. It is an experiment.']]
         ]]
      ]],

      ['script', ['LITERAL', copyScript]]
   ]]
]];

// *** GENERATE ***

var html = '<!DOCTYPE html>\n' + lith.g (page);

fs.writeFileSync ('website.html', html, 'utf8');
console.log ('Written website.html (' + html.length + ' bytes)');
