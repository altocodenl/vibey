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
   ['.demo-carousel', {
      'margin-top': '32px'
   }],
   ['.demo-nav', {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '16px',
      'margin-bottom': '16px'
   }],
   ['.demo-title', {
      'font-size': '1rem',
      'font-weight': '600',
      color: C.textDim,
      'min-width': '160px',
      'text-align': 'center'
   }],
   ['.demo-arrow', {
      background: 'transparent',
      border: '1px solid ' + C.border,
      'border-radius': '50%',
      width: '36px',
      height: '36px',
      color: C.text,
      'font-size': '1.4rem',
      cursor: 'pointer',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      transition: 'border-color 0.15s, color 0.15s',
      'font-family': font,
      'line-height': '1'
   }],
   ['.demo-arrow:hover', {
      'border-color': C.accent,
      color: C.accent
   }],
   ['.demo-videos', {
      position: 'relative'
   }],
   ['.demo-video', {
      display: 'none'
   }],
   ['.demo-video.active', {
      display: 'block'
   }],
   ['.hero-video', {
      width: '100%',
      'max-width': '740px',
      'border-radius': '12px',
      border: '1px solid ' + C.border,
      'box-shadow': '0 8px 32px rgba(0, 0, 0, 0.4)'
   }],

   // *** PILLARS ***
   ['.pillars', {
      'padding-bottom': '60px'
   }],
   ['.pillar', {
      background: C.surface,
      border: '1px solid ' + C.border,
      'border-radius': '12px',
      padding: '0',
      'margin-bottom': '20px',
      overflow: 'hidden'
   }],
   ['.pillar-toggle', {
      width: '100%',
      background: 'transparent',
      border: 'none',
      color: C.text,
      cursor: 'pointer',
      padding: '28px 32px',
      'text-align': 'left',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: '16px',
      'font-family': font
   }],
   ['.pillar-toggle:hover', {
      background: C.surface2
   }],
   ['.pillar h3', {
      'font-size': '1.15rem',
      'font-weight': '600',
      margin: 0,
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
   ['.pillar-body', {
      padding: '0 32px 28px 32px'
   }],
   ['.pillar-body[hidden]', {
      display: 'none'
   }],
   ['.pillar p', {
      color: C.textDim,
      'line-height': '1.7'
   }],
   ['.pillar strong', {
      color: C.text,
      'font-weight': '600'
   }],
   ['.pillar-caret', {
      color: C.accent,
      'font-size': '1.8rem',
      'line-height': '1',
      'font-weight': '700',
      'flex-shrink': '0',
      width: '28px',
      'text-align': 'center'
   }],

   // *** ADVENTURE ***
   ['.adventure', {
      'padding-bottom': '70px'
   }],
   ['.adventure h2', {
      'font-size': '1.8rem',
      'font-weight': '700',
      'letter-spacing': '-0.02em',
      'margin-bottom': '12px'
   }],
   ['.adventure .intro', {
      color: C.textDim,
      'margin-bottom': '22px'
   }],
   ['.adventure-switcher', {
      display: 'flex',
      gap: '12px',
      'margin-bottom': '20px',
      'flex-wrap': 'wrap'
   }],
   ['.adventure-btn', {
      background: C.surface2,
      color: C.text,
      border: '1px solid ' + C.border,
      'border-radius': '999px',
      padding: '10px 16px',
      cursor: 'pointer',
      'font-size': '0.95rem',
      'font-family': font,
      transition: 'border-color 0.15s, color 0.15s, background 0.15s'
   }],
   ['.adventure-btn:hover', {
      'border-color': C.accent,
      color: C.white
   }],
   ['.adventure-btn.active', {
      background: C.accent,
      color: C.bg,
      'border-color': C.accent,
      'font-weight': '600'
   }],
   ['.adventure-panel', {
      background: C.surface,
      border: '1px solid ' + C.border,
      'border-radius': '12px',
      padding: '28px 28px 6px 28px'
   }],
   ['.adventure-panel[hidden]', {
      display: 'none'
   }],
   ['.adventure-panel h3', {
      'font-size': '1.2rem',
      'margin-bottom': '10px'
   }],
   ['.adventure-panel p', {
      color: C.textDim,
      'margin-bottom': '18px'
   }],
   ['.adventure-panel ul', {
      'padding-left': '1.2rem',
      'margin-bottom': '18px'
   }],
   ['.adventure-panel li', {
      color: C.textDim,
      'margin-bottom': '10px'
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

   // *** AUDIENCE ***
   ['.audience', {
      'padding-bottom': '60px'
   }],
   ['.audience h2', {
      'font-size': '1.8rem',
      'font-weight': '700',
      'letter-spacing': '-0.02em',
      'margin-bottom': '12px'
   }],
   ['.audience .intro', {
      color: C.textDim,
      'margin-bottom': '22px',
      'max-width': '620px'
   }],
   ['.audience-grid', {
      display: 'grid',
      gap: '14px',
      'grid-template-columns': 'repeat(2, minmax(0, 1fr))'
   }],
   ['.audience-card', {
      background: C.surface,
      border: '1px solid ' + C.border,
      'border-radius': '12px',
      padding: '18px 18px 18px 48px',
      position: 'relative',
      color: C.textDim,
      'line-height': '1.6',
      'min-height': '100%'
   }],
   ['.audience-card:before', {
      content: '"→"',
      position: 'absolute',
      left: '18px',
      top: '17px',
      color: C.accent,
      'font-weight': '700'
   }],
   ['.audience-card strong', {
      color: C.text,
      'font-weight': '600'
   }],

]);

// media query handled manually
var mediaQuery = '@media (max-width: 600px){' + css ([
   ['.hero h1', {'font-size': '2.2rem'}],
   ['.wrap', {padding: '0 16px'}],
   ['.pillar', {padding: '24px'}],
   ['.audience-grid', {'grid-template-columns': '1fr'}],
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
   '});',
   'document.addEventListener("click", function(e) {',
   '  if (!e.target.classList.contains("adventure-btn")) return;',
   '  var mode = e.target.getAttribute("data-mode");',
   '  var buttons = document.querySelectorAll(".adventure-btn");',
   '  var panels = document.querySelectorAll(".adventure-panel");',
   '  buttons.forEach(function(button) {',
   '    button.classList.toggle("active", button.getAttribute("data-mode") === mode);',
   '  });',
   '  panels.forEach(function(panel) {',
   '    panel.hidden = panel.getAttribute("data-mode") !== mode;',
   '  });',
   '});',
   'document.addEventListener("click", function(e) {',
   '  var button = e.target.closest(".pillar-toggle");',
   '  if (!button) return;',
   '  var pillar = button.closest(".pillar");',
   '  var body = pillar.querySelector(".pillar-body");',
   '  var caret = pillar.querySelector(".pillar-caret");',
   '  var expanded = button.getAttribute("aria-expanded") === "true";',
   '  button.setAttribute("aria-expanded", expanded ? "false" : "true");',
   '  body.hidden = expanded;',
   '  if (caret) caret.textContent = expanded ? "▾" : "▸";',
   '});',
   '(function() {',
   '  var demos = [].slice.call(document.querySelectorAll(".demo-video"));',
   '  var title = document.querySelector(".demo-title");',
   '  var idx = 0;',
   '  function show(i) {',
   '    demos[idx].classList.remove("active");',
   '    demos[idx].pause();',
   '    idx = (i + demos.length) % demos.length;',
   '    demos[idx].classList.add("active");',
   '    if (!demos[idx].src || demos[idx].src === window.location.href) {',
   '      var sources = {1: "https://buildwithvibey.com/video/gdp.mp4"};',
   '      if (sources[idx]) demos[idx].src = sources[idx];',
   '    }',
   '    demos[idx].play();',
   '    title.textContent = demos[idx].getAttribute("data-title");',
   '  }',
   '  show(0);',
   '  document.querySelector(".demo-prev").addEventListener("click", function() { show(idx - 1); });',
   '  document.querySelector(".demo-next").addEventListener("click", function() { show(idx + 1); });',
   '})();'
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

var pillar = function (num, title, body, open) {
   return ['div', {class: 'pillar'}, [
      ['button', {class: 'pillar-toggle', 'aria-expanded': open ? 'true' : 'false', type: 'button'}, [
         ['h3', [
            ['span', {class: 'num'}, '' + num],
            ['LITERAL', title]
         ]],
         ['span', {class: 'pillar-caret'}, open ? '▸' : '▾']
      ]],
      ['div', {class: 'pillar-body', hidden: ! open}, [
         ['p', ['LITERAL', body]]
      ]]
   ]];
};

// *** PAGE ***

var page = ['html', {lang: 'en'}, [
   ['head', [
      ['meta', {charset: 'utf-8'}],
      ['meta', {name: 'viewport', content: 'width=device-width, initial-scale=1'}],
      ['title', 'Vibey — Build with words, not code.'],
      ['meta', {name: 'description', content: 'An agentic interface where everything is a document, everything runs in your browser, and agents work at full speed inside safe containers.'}],
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
            ['p', {class: 'tagline'}, 'Build with words, not code.'],
            ['div', {class: 'demo-carousel'}, [
               ['div', {class: 'demo-nav'}, [
                  ['button', {class: 'demo-arrow demo-prev', 'aria-label': 'Previous demo'}, '‹'],
                  ['span', {class: 'demo-title'}, ''],
                  ['button', {class: 'demo-arrow demo-next', 'aria-label': 'Next demo'}, '›'],
               ]],
               ['div', {class: 'demo-videos'}, [
                  ['video', {class: 'hero-video demo-video active', 'data-title': 'Tic Tac Toe', src: 'https://buildwithvibey.com/video/tictactoe.mp4', autoplay: true, muted: true, loop: true, playsinline: true}, ''],
                  ['video', {class: 'hero-video demo-video', 'data-title': 'GDP Visualization', src: '', muted: true, loop: true, playsinline: true}, ''],
               ]],
            ]],
         ]],

         // *** AUDIENCE ***
         ['div', {class: 'audience'}, [
            ['h2', 'For those who don\'t code but want to use AI to:'],
            ['div', {class: 'audience-grid'}, [
               ['div', {class: 'audience-card'}, [['strong', 'Create workflows'], ' to automate repeated tasks.']],
               ['div', {class: 'audience-card'}, [['strong', 'Perform research'], ' in the background.']],
               ['div', {class: 'audience-card'}, [['strong', 'Explore product ideas'], ' and iterate quickly.']],
               ['div', {class: 'audience-card'}, [['strong', 'Create small games'], ' from a simple prompt.']],
               ['div', {class: 'audience-card'}, [['strong', 'Create teaching materials'], ' tailored to your needs.']],
               ['div', {class: 'audience-card'}, [['strong', 'Run ad-hoc analysis'], ' and create visualizations.']]
            ]]
         ]],

         // *** PILLARS ***
         ['div', {class: 'pillars'}, [
            ['h2', 'How is vibey different?'],
            pillar (1, 'Everything is a document',
               'Your description of what you\'re building. The dialogs with AI while building it. How you orchestrate your agents. Documents are the source of truth for everything. <strong>There is no database.</strong>', true),

            pillar (2, 'Everything in your browser',
               'Your documents are not only text: use images, audio, and embed small apps in your documents. No terminal or dedicated native app required.'),

            pillar (3, 'Safe YOLO',
               'The agents don\'t ask for permission, they just run the commands that they need for the task you give them, so they work at full speed. <strong>But</strong> each project is fully isolated in its own container and volume. A rogue agent\'s blast radius is limited to its own project — it cannot touch other projects, vibey, or your computer.'),

            pillar (4, 'BYOAI',
               'Bring your own OpenAI/Anthropic credentials, whether personal or API keys.'),

            pillar (5, 'Open source',
               'Both the local and cloud versions are open source.'),

         ]],

         // *** ADVENTURE ***
         ['div', {class: 'adventure'}, [
            ['h2', 'Choose your own adventure'],
            ['p', {class: 'intro'}, 'After reading the five things above, choose how you want to run vibey.'],
            ['div', {class: 'adventure-switcher'}, [
               ['button', {class: 'adventure-btn active', 'data-mode': 'local'}, 'I want to run vibey locally'],
               ['button', {class: 'adventure-btn', 'data-mode': 'cloud'}, 'I want to use vibey on the cloud']
            ]],
            ['div', {class: 'adventure-panel', 'data-mode': 'local'}, [
               ['h3', 'Run vibey locally'],
               ['p', 'The default path: everything runs on your machine. You bring your own AI credentials, keep full control, and get started with Docker only.'],
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
               ]],
               ['div', {class: 'step'}, [
                  ['div', {class: 'step-label'}, 'Stop vibey'],
                  codeBlock ('docker compose down')
               ]],
               ['div', {class: 'step'}, [
                  ['div', {class: 'step-label'}, 'Reset all data'],
                  codeBlock ('docker compose down -v')
               ]]
            ]],
            ['div', {class: 'adventure-panel', 'data-mode': 'cloud', hidden: true}, [
               ['h3', 'Use vibey on the cloud'],
               ['p', 'Cloud mode is for when you want your agents to keep working while you are away, open your projects from any device, and share them with others.'],
               ['ul', [
                  ['li', [['strong', 'Always running'], ' — your agents can work while your computer is closed.']],
                  ['li', [['strong', 'Available from any device'], ' — all you need is a browser.']],
                  ['li', [['strong', 'Shareable'], ' — publish and share projects with others.']],
                  ['li', [['strong', 'Zero lock-in'], ' — the whole thing is open source, so you can always run it yourself.']]
               ]],
               ['a', {class: 'step-link', href: 'https://buildwithvibey.com/app', target: '_blank', rel: 'noopener'}, 'Go to Vibey Cloud']
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
