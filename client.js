// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

var type = teishi.type;
var inc = teishi.inc;
var style = lith.css.style;

var h = {};

h.projectColor = function (name) {
   var hash = 0;
   var n = name.length;
   dale.go (dale.times (n, 0), function (i) {
      hash = ((hash << 5) - hash + name.charCodeAt (i)) | 0;
   });
   var hue = ((hash % 360) + 360) % 360;
   var sat = 55, lit = 45;
   var bg = 'hsl(' + hue + ', ' + sat + '%, ' + lit + '%)';
   var s = sat / 100, l = lit / 100;
   var c = (1 - Math.abs (2 * l - 1)) * s;
   var x = c * (1 - Math.abs ((hue / 60) % 2 - 1));
   var m = l - c / 2;
   var r1, g1, b1;
   if      (hue < 60)  { r1 = c; g1 = x; b1 = 0; }
   else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
   else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
   else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
   else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
   else                { r1 = c; g1 = 0; b1 = x; }
   var toLinear = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow ((v + 0.055) / 1.055, 2.4); };
   var luminance = 0.2126 * toLinear (r1 + m) + 0.7152 * toLinear (g1 + m) + 0.0722 * toLinear (b1 + m);
   var fg = luminance > 0.35 ? '#1a1a2e' : '#f5f7ff';
   return {fg: fg, bg: bg};
};

h.isDialog = function (name) {
   return name.indexOf ('dialog/') === 0;
};

h.isDoc = function (name) {
   return name.indexOf ('doc/') === 0;
};

h.isDirtyDoc = function (file) {
   return file && ! h.isDialog (file.name) && file.content !== file.original;
};

h.isSameDocTarget = function (parsed, file, currentProject) {
   return parsed && parsed.tab === 'docs' && parsed.target && file && parsed.project === currentProject && normalizeDocFilename (parsed.target) === file.name;
};

h.parseDialogFilename = function (filename) {
   filename = filename || '';
   if (filename.indexOf ('dialog/') !== 0) return null;

   var short = filename.slice ('dialog/'.length);
   var match = short.match (/^(.+)\-(active|done)\.md$/);
   if (! match) return null;
   return {dialogId: match [1], status: match [2]};
};

h.statusIcon = function (status) {
   if (status === 'active')  return '🟣';
   if (status === 'done')    return '🟢';
   return '•';
};

h.dialogDisplayLabel = function (filename) {
   var parsed = h.parseDialogFilename (filename);
   if (! parsed) return filename;

   var match = parsed.dialogId.match (/^\d{8}\-\d{6}\-(.+)$/);
   return match ? match [1] : parsed.dialogId;
};

h.freshDialogSlug = function (filename) {
   var base = h.dialogDisplayLabel (filename || '') || 'dialog';
   return base + '-fresh';
};

// Fallback models — overwritten by GET /models on startup
var MODELS = {
   openai: {
      'gpt-5.4':           {context: 1000000},
      'gpt-5.2':           {context: 272000},
      'gpt-4.1':           {context: 1000000, apiKeyOnly: true}
   },
   anthropic: {
      'claude-opus-4-6':   {context: 1000000},
      'claude-sonnet-4-6': {context: 200000},
      'claude-haiku-4-5':  {context: 200000}
   }
};

var buildModelOptions = function () {
   var options = [];
   dale.go (MODELS.openai, function (info, model) {
      options.push ({provider: 'openai', model: model, label: 'OpenAI · ' + model});
   });
   dale.go (MODELS.anthropic, function (info, model) {
      options.push ({provider: 'claude', model: model, label: 'Claude · ' + model.replace (/^claude-/, '')});
   });
   return options;
};

var MODEL_OPTIONS = buildModelOptions ();

var getContextWindowSize = function (model) {
   if (MODELS.openai [model]) return MODELS.openai [model].context;
   if (MODELS.anthropic [model]) return MODELS.anthropic [model].context;
   return 200000;
};

var modelOptionKey = function (opt) {
   return opt.provider + ':' + opt.model;
};

var parseModelOptionKey = function (key) {
   var i = key.indexOf (':');
   if (i === -1) return {provider: 'openai', model: key};
   return {provider: key.slice (0, i), model: key.slice (i + 1)};
};

var defaultModelForProvider = function (provider) {
   provider = provider || 'openai';
   var found = dale.stopNot (MODEL_OPTIONS, undefined, function (opt) {
      if (opt.provider === provider) return opt.model;
   });
   return found || MODEL_OPTIONS [0].model;
};

var COMPACTION_REQUEST_PROMPT = [
   'Please compact this dialog for handoff into a fresh dialog.',
   'Do not use any tools.',
   'Write a concise handoff for another agent continuing the same work.',
   'Include these sections:',
   '- Current goal',
   '- Work completed',
   '- Important files, docs, commands, URLs, ports, tests, or errors to keep in mind',
   '- Constraints, preferences, or decisions to preserve',
   '- Open issues or risks',
   '- Exact next steps',
   'Output only the handoff, with short section headings.'
].join ('\n');

var buildFreshDialogPrompt = function (summary, sourceDialogId) {
   summary = type (summary) === 'string' ? summary.trim () : '';
   return [
      'This is a manual compaction handoff from dialog ' + sourceDialogId + '.',
      'Continue the work from the handoff below.',
      'If you need more detail, you may read previous dialog files.',
      '',
      summary
   ].join ('\n');
};

var hasAnyProvider = function (settings) {
   if (! settings) return false;
   var openai = settings.openai || {};
   var claude = settings.claude || {};
   var openaiOAuth = settings.openaiOAuth || {};
   var claudeOAuth = settings.claudeOAuth || {};
   return openai.hasKey || claude.hasKey || (openaiOAuth.loggedIn && ! openaiOAuth.expired) || (claudeOAuth.loggedIn && ! claudeOAuth.expired);
};

var normalizeDocFilename = function (name) {
   name = (name || '').trim ();
   if (! name) return '';
   if (name.indexOf ('doc/') === 0) return name;
   if (name.slice (-3) !== '.md') name = name + '.md';
   return 'doc/' + name;
};

var docDisplayName = function (name) {
   if (type (name) !== 'string') return name;
   if (name.indexOf ('doc/') === 0) name = name.slice ('doc/'.length);
   if (name.slice (-3) === '.md') name = name.slice (0, -3);
   return name;
};

// *** EMBED HELPERS ***

var parseEmbedBlock = function (body) {
   var result = {port: null, path: '/', height: 400, title: 'App'};
   var lines = (body || '').split ('\n');
   dale.go (lines, function (line) {
      line = line.trim ();
      if (! line || line [0] === '#') return;
      var idx = line.indexOf (' ');
      if (idx === -1) return;
      var key = line.slice (0, idx).toLowerCase ();
      var val = line.slice (idx + 1).trim ();
      if (key === 'port') {
         if (val.toLowerCase () === 'static') result.port = 'static';
         else result.port = Number (val);
      }
      if (key === 'path')   result.path = val;
      if (key === 'height') result.height = Number (val) || 400;
      if (key === 'title')  result.title = val;
   });
   if (result.port === null) result.port = 'static';
   if (result.port !== 'static' && (! result.port || result.port < 1 || result.port > 65535)) return null;
   return result;
};

var EMBED_RE = /əəə?embed\n([\s\S]*?)əəə?/g;

var renderMarkdownWithEmbeds = function (markdown, project) {
   if (type (markdown) !== 'string') return '';

   // Extract embed blocks, replace with placeholders, render markdown, then reinsert iframes
   var embeds = [];
   var placeholder = function () {return '<!--VIBEY_EMBED_' + embeds.length + '-->';};

   var withPlaceholders = markdown.replace (EMBED_RE, function (match, body) {
      var parsed = parseEmbedBlock (body);
      var idx = embeds.length;
      embeds.push (parsed);
      return '<!--VIBEY_EMBED_' + idx + '-->';
   });

   var html = '';
   try {
      html = marked.parse (withPlaceholders);
   }
   catch (e) {
      html = lith.g (['pre', withPlaceholders]);
   }

   // Replace placeholders with lith-generated HTML
   dale.go (embeds, function (embed, idx) {
      var tag = '<!--VIBEY_EMBED_' + idx + '-->';
      if (! embed) {
         html = html.replace (tag, lith.g (['div', {class: 'embed-error'}, 'Invalid embed block (missing or invalid port)']));
         return;
      }
      var embedPath = embed.path || '/';
      if (embedPath [0] !== '/') embedPath = '/' + embedPath;
      var src = embed.port === 'static'
         ? 'project/' + encodeURIComponent (project) + '/static' + embedPath
         : 'project/' + encodeURIComponent (project) + '/proxy/' + embed.port + embedPath;
      var portLabel = embed.port === 'static' ? ('static' + embedPath) : (':' + embed.port + embedPath);
      html = html.replace (tag, lith.g (['div', {class: 'embed-container'}, [
         ['div', {class: 'embed-header'}, [
            ['span', {class: 'embed-title'}, embed.title],
            ['span', {class: 'embed-port'}, portLabel],
            ['a', {class: 'embed-open', href: src, target: '_blank', title: 'Open in new tab'}, '↗']
         ]],
         ['iframe', {src: src, style: style ({width: '100%', height: embed.height + 'px'}), title: embed.title, sandbox: 'allow-scripts allow-forms allow-same-origin'}]
      ]]));
   });

   return html;
};

var buildHash = function (project, tab, currentFile) {
   if (! project) return tab === 'settings' ? '#/settings' : (tab === 'snapshots' ? '#/snapshots' : '#/projects');
   tab = tab === 'dialogs' ? 'dialogs' : 'docs';
   if (! currentFile || ! currentFile.name) return '#/project/' + encodeURIComponent (project) + '/' + tab;

   var parsed = h.parseDialogFilename (currentFile.name);

   if (tab === 'dialogs') {
      if (! parsed) return '#/project/' + encodeURIComponent (project) + '/dialogs';
      return '#/project/' + encodeURIComponent (project) + '/dialogs/' + encodeURIComponent (parsed.dialogId);
   }

   if (parsed) return '#/project/' + encodeURIComponent (project) + '/docs';
   return '#/project/' + encodeURIComponent (project) + '/docs/' + encodeURIComponent (docDisplayName (currentFile.name));
};

var readHashTarget = function (hashValue) {
   var rawHash = hashValue !== undefined ? hashValue : (window.location.hash || '');
   var raw = rawHash.replace (/^#\/?/, '');
   if (! raw) return {project: null, tab: 'projects', target: null};

   if (raw === 'settings') return {project: null, tab: 'settings', target: null};
   if (raw === 'snapshots') return {project: null, tab: 'snapshots', target: null};

   var parts = raw.split ('/');
   if (parts [0] === 'project' && parts [1]) {
      var project = decodeURIComponent (parts [1]);
      var tab = parts [2] === 'dialogs' ? 'dialogs' : (parts [2] === 'docs' ? 'docs' : 'docs');
      var target = parts [3] ? decodeURIComponent (parts [3]) : null;
      if (tab === 'docs' && target) target = normalizeDocFilename (target);
      return {project: project, tab: tab, target: target};
   }

   return {project: null, tab: 'projects', target: null};
};

var readAuthPageFromHash = function (hashValue) {
   var rawHash = hashValue !== undefined ? hashValue : (window.location.hash || '');
   var raw = rawHash.replace (/^#\/?/, '');
   if (raw === 'signup') return 'signup';
   return 'login';
};

var projectPath = function (project, tail) {
   return 'project/' + encodeURIComponent (project) + '/' + tail;
};

var isPhoneViewport = function () {
   return window.innerWidth < 768;
};

var keepMobileInputVisible = function (target) {
   if (! isPhoneViewport () || ! target || ! target.scrollIntoView) return;
   setTimeout (function () {
      try {
         target.scrollIntoView ({block: 'nearest', inline: 'nearest'});
      }
      catch (error) {
         try {target.scrollIntoView (false);} catch (e) {}
      }
   }, 120);
};

var projectDisplayName = function (slug) {
   if (! slug) return '';
   return slug.replace (/\.([A-Za-z0-9_\-]+)\./g, function (match, encoded) {
      try {
         var base64 = encoded.replace (/-/g, '+').replace (/_/g, '/');
         while (base64.length % 4) base64 += '=';
         return decodeURIComponent (escape (atob (base64)));
      }
      catch (e) {
         return match;
      }
   });
};

var getChatMessagesNode = function () {
   return document.querySelector ('.chat-messages');
};

var isChatNearBottom = function (node) {
   if (! node) return true;
   return (node.scrollHeight - (node.scrollTop + node.clientHeight)) <= 24;
};

var activeDialogStream = null;

var scrollChatToMessage = function (direction) {
   var node = getChatMessagesNode ();
   if (! node) return;

   var messages = node.querySelectorAll ('.chat-message');
   if (! messages.length) return;

   var firstVisible = 0;
   var scrollTop = node.scrollTop || 0;

   for (var i = 0; i < messages.length; i++) {
      var top = messages [i].offsetTop || 0;
      var height = messages [i].offsetHeight || 0;
      if ((top + height) > (scrollTop + 8)) {
         firstVisible = i;
         break;
      }
   }

   var targetIndex = firstVisible + (direction > 0 ? 1 : -1);
   if (targetIndex < 0) targetIndex = 0;
   if (targetIndex >= messages.length) targetIndex = messages.length - 1;

   var target = messages [targetIndex];
   if (! target) return;
   node.scrollTop = Math.max (0, (target.offsetTop || 0) - 8);
};

var applyStreamingMarkdownEvent = function (markdown, event) {
   markdown = type (markdown) === 'string' ? markdown : '';
   event = event || {};

   if (event.type === 'snapshot') return type (event.markdown) === 'string' ? event.markdown : '';
   if (event.type === 'markdown_append') return markdown + (event.content || '');
   if (event.type === 'markdown_replace') {
      var oldText = type (event.oldText) === 'string' ? event.oldText : '';
      var newText = type (event.newText) === 'string' ? event.newText : '';
      if (! oldText) return markdown;
      var index = markdown.lastIndexOf (oldText);
      if (index === -1) return markdown;
      return markdown.slice (0, index) + newText + markdown.slice (index + oldText.length);
   }

   return markdown;
};

var appendStreamingStatusLine = function (current, line) {
   current = type (current) === 'string' ? current.replace (/\s+$/, '') : '';
   line = type (line) === 'string' ? line.trim () : '';
   if (! line) return current;
   if (! current) return line;
   return current + '\n\n' + line;
};

var replaceLastStreamingStatusLine = function (current, oldLine, newLine) {
   current = type (current) === 'string' ? current : '';
   oldLine = type (oldLine) === 'string' ? oldLine.trim () : '';
   newLine = type (newLine) === 'string' ? newLine.trim () : '';
   if (! oldLine) return appendStreamingStatusLine (current, newLine);
   var index = current.lastIndexOf (oldLine);
   if (index === -1) return appendStreamingStatusLine (current, newLine);
   return current.slice (0, index) + newLine + current.slice (index + oldLine.length);
};

var parseStreamingToolHeader = function (text) {
   text = type (text) === 'string' ? text : '';
   var match = text.match (/---\nTool request:\s+([^\n\[]+?)(?:\s+\[([^\]]+)\])?\n/);
   if (! match) return null;
   return {
      name: (match [1] || '').trim (),
      id: match [2] || null
   };
};

var stripStreamingMetadataLines = function (text) {
   text = type (text) === 'string' ? text : '';
   if (! text) return '';

   return text.replace (/^>\s*(Id|Parent|Started|Provider|Model|Time|Usage(?: cumulative)?|Context|Resources)\s*:.*(?:\n|$)/gim, '');
};

var consumeStreamingChunk = function (piece, state) {
   piece = type (piece) === 'string' ? piece : '';
   state = state || {};

   var visibleText = '';
   var toolStarts = [];
   var remaining = piece;

   while (remaining) {
      if (state.inToolChunk) {
         var closeIndex = remaining.indexOf ('\n\n---');
         if (closeIndex === -1) return {text: visibleText, toolStarts: toolStarts};
         state.inToolChunk = false;
         remaining = remaining.slice (closeIndex + 5);
         continue;
      }

      var toolIndex = remaining.indexOf ('---\nTool request:');
      if (toolIndex === -1) {
         visibleText += remaining;
         break;
      }

      visibleText += remaining.slice (0, toolIndex);
      var toolChunk = remaining.slice (toolIndex);
      var header = parseStreamingToolHeader (toolChunk);
      if (header) toolStarts.push (header);

      var toolCloseIndex = toolChunk.indexOf ('\n\n---');
      if (toolCloseIndex === -1) {
         state.inToolChunk = true;
         break;
      }

      remaining = toolChunk.slice (toolCloseIndex + 5);
   }

   return {text: stripStreamingMetadataLines (visibleText), toolStarts: toolStarts};
};

var getStreamingResumeContent = function (markdown) {
   if (type (markdown) !== 'string' || ! markdown.trim ()) return '';

   var messages = parseDialogContent (markdown);
   if (! messages.length) return '';

   var lastAssistant = dale.stopNot (messages.slice ().reverse (), undefined, function (msg) {
      if (msg && msg.role === 'assistant') return msg;
   });
   if (! lastAssistant || type (lastAssistant.content) !== 'string') return '';

   var compact = getMessageToolContentView (lastAssistant.content, false).compactText || '';
   return compact.trim ();
};

var splitAssistantContentBlocks = function (content) {
   content = type (content) === 'string' ? content : '';
   if (! content || content.indexOf ('Tool request:') === -1) return [{role: 'assistant', content: content}];

   var parts = [];
   var re = /---\nTool request:[\s\S]*?(?:\n---(?=\n|$)|$)/g;
   var lastIndex = 0;
   var match;

   while ((match = re.exec (content))) {
      if (match.index > lastIndex) {
         var textPart = content.slice (lastIndex, match.index);
         if (textPart.replace (/\s+/g, '')) parts.push ({role: 'assistant', content: textPart.replace (/^\n+|\n+$/g, '')});
      }
      parts.push ({role: 'tool', content: match [0]});
      lastIndex = match.index + match [0].length;
   }

   if (lastIndex < content.length) {
      var tail = content.slice (lastIndex);
      if (tail.replace (/\s+/g, '')) parts.push ({role: 'assistant', content: tail.replace (/^\n+|\n+$/g, '')});
   }

   return parts.length ? parts : [{role: 'assistant', content: content}];
};

var toolNameFromBlock = function (content) {
   content = type (content) === 'string' ? content : '';
   var match = content.match (/^---\nTool request:\s+(\S+)/m);
   return match ? match [1] : null;
};

var hasOpenToolBlock = function (content) {
   content = type (content) === 'string' ? content : '';
   if (content.indexOf ('Tool request:') === -1) return false;
   var delimiters = content.match (/^---$/gm) || [];
   return delimiters.length % 2 === 1;
};

var expandDisplayMessages = function (messages) {
   messages = type (messages) === 'array' ? messages : [];
   var expanded = [];

   dale.go (messages, function (msg, msgIndex) {
      if (! msg || msg.role !== 'assistant' || type (msg.content) !== 'string' || msg.content.indexOf ('Tool request:') === -1) {
         if (msg) {
            var plain = teishi.copy (msg);
            plain.turnIndex = msgIndex;
            plain.segmentIndex = 0;
            expanded.push (plain);
         }
         return;
      }

      var parts = splitAssistantContentBlocks (msg.content);
      if (! parts.length) {
         var fallback = teishi.copy (msg);
         fallback.turnIndex = msgIndex;
         fallback.segmentIndex = 0;
         expanded.push (fallback);
         return;
      }

      dale.go (parts, function (part, partIndex) {
         var piece = {
            role: part.role,
            content: part.content,
            time: msg.time,
            usage: partIndex === parts.length - 1 ? msg.usage : null,
            usageCumulative: partIndex === parts.length - 1 ? msg.usageCumulative : null,
            resourcesMs: partIndex === parts.length - 1 ? msg.resourcesMs : null,
            context: partIndex === parts.length - 1 ? msg.context : null,
            toolName: part.role === 'tool' ? toolNameFromBlock (part.content) : null,
            model: msg.model || null,
            turnIndex: msgIndex,
            segmentIndex: partIndex
         };
         expanded.push (piece);
      });
   });

   return expanded;
};

// *** VI CONTROLLER ***

var viController = {};

var viWordChar = function (ch) {
   return !! ch && /[A-Za-z0-9_]/.test (ch);
};

var viClamp = function (value, min, max) {
   return Math.max (min, Math.min (max, value));
};

var viLineStarts = function (lines) {
   var starts = [0];
   for (var i = 0; i < lines.length; i++) {
      if (i + 1 < lines.length) starts.push (starts [i] + lines [i].length + 1);
   }
   return starts;
};

var viPositionFromLineCol = function (lines, line, col) {
   var starts = viLineStarts (lines);
   line = viClamp (line, 0, lines.length - 1);
   col = viClamp (col, 0, lines [line].length);
   return starts [line] + col;
};

var viFindNext = function (text, term, from, backward) {
   if (! term) return null;
   if (! backward) {
      var idx = text.indexOf (term, from);
      if (idx === -1 && from > 0) idx = text.indexOf (term, 0);
      return idx;
   }
   var before = text.lastIndexOf (term, from);
   if (before === -1 && from < text.length - 1) before = text.lastIndexOf (term, text.length - 1);
   return before;
};

viController.moveCursor = function (textarea, pos) {
   textarea.selectionStart = textarea.selectionEnd = viClamp (pos, 0, textarea.value.length);
};

viController.cursorInfo = function (textarea) {
   var val = textarea.value || '';
   var pos = textarea.selectionStart || 0;
   var before = val.slice (0, pos);
   var lineNum = before.split ('\n').length - 1;
   var lines = val.split ('\n');
   var lastNl = before.lastIndexOf ('\n');
   var colNum = lastNl === -1 ? pos : (pos - lastNl - 1);
   return {pos: pos, line: lineNum, col: colNum, lines: lines, text: val};
};

viController.motion = function (key, info, textarea) {
   var pos = info.pos;
   var lines = info.lines;
   var line = info.line;
   var col = info.col;
   var text = info.text;

   if (key === 'h') return viClamp (pos - 1, 0, text.length);
   if (key === 'l') return viClamp (pos + 1, 0, text.length);
   if (key === 'j' || key === 'k') {
      var delta = key === 'j' ? 1 : -1;
      var nextLine = viClamp (line + delta, 0, lines.length - 1);
      return viPositionFromLineCol (lines, nextLine, col);
   }
   if (key === '0') return viPositionFromLineCol (lines, line, 0);
   if (key === '$') return viPositionFromLineCol (lines, line, lines [line].length);
   if (key === 'gg') return 0;
   if (key === 'G') return text.length;

   if (key === 'w') {
      var i = pos;
      while (i < text.length && viWordChar (text [i])) i++;
      while (i < text.length && ! viWordChar (text [i])) i++;
      return viClamp (i, 0, text.length);
   }

   if (key === 'b') {
      var j = viClamp (pos - 1, 0, text.length);
      while (j > 0 && ! viWordChar (text [j])) j--;
      while (j > 0 && viWordChar (text [j - 1])) j--;
      return viClamp (j, 0, text.length);
   }

   if (key === 'ctrl-d' || key === 'ctrl-u') {
      var rows = textarea && textarea.rows ? textarea.rows : 12;
      var jump = Math.max (1, Math.floor (rows / 2));
      var next = key === 'ctrl-d' ? line + jump : line - jump;
      return viPositionFromLineCol (lines, next, col);
   }

   return pos;
};

viController.operator = function (key, textarea, info, register) {
   var text = info.text;
   var line = info.line;
   var lines = info.lines;
   var starts = viLineStarts (lines);
   var lineStart = starts [line] || 0;
   var lineEnd = lineStart + lines [line].length;
   var afterLine = line < lines.length - 1 ? lineEnd + 1 : lineEnd;
   var result = {value: text, cursor: info.pos, register: register};

   if (key === 'x') {
      if (info.pos >= text.length) return result;
      result.value = text.slice (0, info.pos) + text.slice (info.pos + 1);
      result.cursor = viClamp (info.pos, 0, result.value.length);
      result.register = text.slice (info.pos, info.pos + 1);
      return result;
   }

   if (key === 'dd') {
      result.register = text.slice (lineStart, afterLine);
      result.value = text.slice (0, lineStart) + text.slice (afterLine);
      result.cursor = viClamp (lineStart, 0, result.value.length);
      return result;
   }

   if (key === 'yy') {
      result.register = text.slice (lineStart, afterLine);
      return result;
   }

   if (key === 'p') {
      if (! register) return result;
      if (register.indexOf ('\n') !== -1) {
         result.value = text.slice (0, afterLine) + register + text.slice (afterLine);
         result.cursor = viClamp (afterLine, 0, result.value.length);
         return result;
      }
      result.value = text.slice (0, info.pos + 1) + register + text.slice (info.pos + 1);
      result.cursor = viClamp (info.pos + register.length + 1, 0, result.value.length);
      return result;
   }

   if (key === 'o' || key === 'O') {
      if (key === 'o') {
         result.value = text.slice (0, afterLine) + '\n' + text.slice (afterLine);
         // On non-last lines afterLine already points past the \n, so the
         // new empty line starts at afterLine in the new text.  On the last
         // line there is no trailing \n so afterLine === lineEnd and the new
         // empty line starts one position later.
         var oTarget = (line < lines.length - 1) ? afterLine : afterLine + 1;
         result.cursor = viClamp (oTarget, 0, result.value.length);
         return result;
      }
      result.value = text.slice (0, lineStart) + '\n' + text.slice (lineStart);
      result.cursor = viClamp (lineStart, 0, result.value.length);
      return result;
   }

   return result;
};

viController.handleKey = function (ev, textarea, store, options) {
   options = options || {};
   var mode = store.mode || 'normal';
   var key = ev.key;
   var pending = store.pending || '';
   var register = store.register || '';
   var lastSearch = store.lastSearch || '';
   var commandPrefix = store.commandPrefix || '';
   var undoStack = store.undoStack || [];
   var redoStack = store.redoStack || [];
   var result = {preventDefault: false};

   if ((ev.ctrlKey || ev.metaKey) && key === 'Enter' && options.allowSend) {
      result.send = true;
      result.preventDefault = true;
      return result;
   }

   if ((ev.ctrlKey || ev.metaKey) && key === 's' && ! options.light) {
      result.save = true;
      result.preventDefault = true;
      return result;
   }

   var info = viController.cursorInfo (textarea);

   var pushUndo = function () {
      undoStack = undoStack.concat ([{value: textarea.value, cursor: info.pos}]);
      redoStack = [];
   };

   var applyChange = function (nextValue, nextCursor) {
      pushUndo ();
      textarea.value = nextValue;
      viController.moveCursor (textarea, nextCursor);
      result.value = nextValue;
      result.cursor = nextCursor;
      result.undoStack = undoStack;
      result.redoStack = redoStack;
   };

   var applySearch = function (forward) {
      if (! lastSearch) return result;
      var from = forward ? info.pos + 1 : info.pos - 1;
      var idx = viFindNext (info.text, lastSearch, from, ! forward);
      if (idx === null || idx === -1) {
         result.message = 'Pattern not found';
         return result;
      }
      viController.moveCursor (textarea, idx);
      result.cursor = idx;
      return result;
   };

   if (mode === 'insert') {
      if (key === 'Escape') {
         result.mode = 'normal';
         result.pending = '';
         result.commandPrefix = '';
         result.message = '';
         result.preventDefault = true;
      }
      return result;
   }

   if (mode === 'command') {
      result.preventDefault = true;
      if (key === 'Escape') {
         result.mode = 'normal';
         result.pending = '';
         result.commandPrefix = '';
         result.message = '';
         return result;
      }

      if (key === 'Enter') {
         var command = (pending || '').trim ();
         if (commandPrefix === '/') {
            if (command) {
               lastSearch = command;
               var found = viFindNext (info.text, command, info.pos + 1, false);
               if (found !== null && found !== -1) {
                  viController.moveCursor (textarea, found);
                  result.cursor = found;
               }
               else result.message = 'Pattern not found';
            }
         }
         else {
            if (command === 'w') result.save = true;
            else if (command === 'q') result.close = true;
            else if (command === 'wq') {result.save = true; result.close = true;}
            else if (command === 'q!') {result.close = true; result.forceClose = true;}
            else if (command) result.message = 'Unknown command: ' + command;
         }
         result.mode = 'normal';
         result.pending = '';
         result.commandPrefix = '';
         result.lastSearch = lastSearch;
         return result;
      }

      if (key === 'Backspace') {
         result.pending = pending.slice (0, -1);
         return result;
      }

      if (key && key.length === 1 && ! ev.ctrlKey && ! ev.metaKey && ! ev.altKey) {
         result.pending = pending + key;
         return result;
      }

      return result;
   }

   // NORMAL MODE
   result.message = '';

   if (options.light) {
      if (key === 'i' || key === 'a') {
         var nextLight = info.pos;
         if (key === 'a') {
            nextLight = viClamp (info.pos + 1, 0, info.text.length);
            viController.moveCursor (textarea, nextLight);
         }
         result.cursor = nextLight;
         result.mode = 'insert';
         result.pending = '';
         result.preventDefault = true;
         return result;
      }
   }

   if (key === ':' && options.allowCommand) {
      result.mode = 'command';
      result.pending = '';
      result.commandPrefix = ':';
      result.preventDefault = true;
      return result;
   }

   if (key === '/' && options.allowSearch) {
      result.mode = 'command';
      result.pending = '';
      result.commandPrefix = '/';
      result.preventDefault = true;
      return result;
   }

   if ((key === 'n' || key === 'N') && options.allowSearch) {
      result.preventDefault = true;
      result.message = '';
      applySearch (key === 'n');
      return result;
   }

   if (key === 'g') {
      if (pending === 'g') {
         var ggPos = viController.motion ('gg', info, textarea);
         viController.moveCursor (textarea, ggPos);
         result.cursor = ggPos;
         result.pending = '';
         result.preventDefault = true;
         return result;
      }
      result.pending = 'g';
      result.preventDefault = true;
      return result;
   }

   if (pending === 'g' && key !== 'g') {
      pending = '';
      result.pending = '';
   }

   if (/^[0-9]$/.test (key)) {
      if (key === '0' && ! pending) {
         var zeroPos = viController.motion ('0', info, textarea);
         viController.moveCursor (textarea, zeroPos);
         result.cursor = zeroPos;
         result.preventDefault = true;
         result.pending = '';
         return result;
      }
      if (/^\d+$/.test (pending) || pending === '') {
         result.pending = pending + key;
         result.preventDefault = true;
         return result;
      }
   }

   var count = 1;
   if (/^\d+$/.test (pending)) {
      count = parseInt (pending, 10) || 1;
      pending = '';
   }

   var motions = {'h': 'h', 'j': 'j', 'k': 'k', 'l': 'l', 'w': 'w', 'b': 'b', '$': '$', '0': '0', 'G': 'G'};
   if (key === 'h' || key === 'j' || key === 'k' || key === 'l' || key === 'w' || key === 'b' || key === '0' || key === '$' || key === 'G') {
      var nextPos = info.pos;
      for (var step = 0; step < count; step++) {
         nextPos = viController.motion (motions [key], viController.cursorInfo (textarea), textarea);
         viController.moveCursor (textarea, nextPos);
      }
      result.cursor = nextPos;
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   if (ev.ctrlKey && (key === 'd' || key === 'u')) {
      var ctrlKey = key === 'd' ? 'ctrl-d' : 'ctrl-u';
      var ctrlPos = viController.motion (ctrlKey, info, textarea);
      viController.moveCursor (textarea, ctrlPos);
      result.cursor = ctrlPos;
      result.preventDefault = true;
      return result;
   }

   if (pending === 'd' && key === 'd' && ! options.light) {
      var dd = viController.operator ('dd', textarea, info, register);
      applyChange (dd.value, dd.cursor);
      result.register = dd.register;
      result.message = '1 line deleted';
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   if (pending === 'y' && key === 'y' && ! options.light) {
      var yy = viController.operator ('yy', textarea, info, register);
      result.register = yy.register;
      result.message = '1 line yanked';
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   if ((pending === 'd' || pending === 'y') && key !== pending) {
      pending = '';
      result.pending = '';
   }

   if (! options.light && (key === 'd' || key === 'y')) {
      result.pending = key;
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'x') {
      var xop = viController.operator ('x', textarea, info, register);
      if (xop.value !== info.text) {
         applyChange (xop.value, xop.cursor);
         result.register = xop.register;
      }
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'p') {
      var pop = viController.operator ('p', textarea, info, register);
      if (pop.value !== info.text) applyChange (pop.value, pop.cursor);
      result.preventDefault = true;
      return result;
   }

   if (! options.light && (key === 'o' || key === 'O')) {
      var oop = viController.operator (key, textarea, info, register);
      applyChange (oop.value, oop.cursor);
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'A') {
      var apos = viController.motion ('$', info, textarea);
      viController.moveCursor (textarea, apos);
      result.cursor = apos;
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'I') {
      var ipos = viController.motion ('0', info, textarea);
      viController.moveCursor (textarea, ipos);
      result.cursor = ipos;
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'a') {
      var nextA = viClamp (info.pos + 1, 0, info.text.length);
      viController.moveCursor (textarea, nextA);
      result.cursor = nextA;
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'i') {
      result.cursor = info.pos;
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'u') {
      if (undoStack.length) {
         var last = undoStack [undoStack.length - 1];
         undoStack = undoStack.slice (0, -1);
         redoStack = redoStack.concat ([{value: info.text, cursor: info.pos}]);
         textarea.value = last.value;
         viController.moveCursor (textarea, last.cursor);
         result.value = last.value;
         result.cursor = last.cursor;
         result.undoStack = undoStack;
         result.redoStack = redoStack;
      }
      result.preventDefault = true;
      return result;
   }

   if (! options.light && ev.ctrlKey && key === 'r') {
      if (redoStack.length) {
         var redo = redoStack [redoStack.length - 1];
         redoStack = redoStack.slice (0, -1);
         undoStack = undoStack.concat ([{value: info.text, cursor: info.pos}]);
         textarea.value = redo.value;
         viController.moveCursor (textarea, redo.cursor);
         result.value = redo.value;
         result.cursor = redo.cursor;
         result.undoStack = undoStack;
         result.redoStack = redoStack;
      }
      result.preventDefault = true;
      return result;
   }

   if (options.light && (key === 'h' || key === 'j' || key === 'k' || key === 'l' || key === 'w' || key === 'b' || key === '0' || key === '$' || key === 'G')) {
      var lpos = info.pos;
      for (var step2 = 0; step2 < count; step2++) {
         lpos = viController.motion (motions [key] || key, viController.cursorInfo (textarea), textarea);
         viController.moveCursor (textarea, lpos);
      }
      result.cursor = lpos;
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   return result;
};

// --- vi cursor overlay helpers ---

var viMeasureSpan = null;

var getViMeasureSpan = function () {
   if (viMeasureSpan) return viMeasureSpan;
   viMeasureSpan = document.createElement ('span');
   viMeasureSpan.style.position = 'absolute';
   viMeasureSpan.style.top = '-9999px';
   viMeasureSpan.style.left = '-9999px';
   viMeasureSpan.style.visibility = 'hidden';
   viMeasureSpan.style.whiteSpace = 'pre';
   document.body.appendChild (viMeasureSpan);
   return viMeasureSpan;
};

var viMeasureCharWidth = function (textarea, computed) {
   if (! textarea || ! document.body) return 8;
   var span = getViMeasureSpan ();
   var style = computed || window.getComputedStyle (textarea);
   if (style.font && style.font !== 'normal') span.style.font = style.font;
   else {
      span.style.fontFamily = style.fontFamily;
      span.style.fontSize = style.fontSize;
      span.style.fontWeight = style.fontWeight;
   }
   span.textContent = 'M';
   var rect = span.getBoundingClientRect ();
   return rect.width || 8;
};

var computeViOverlay = function (textarea, line, col) {
   if (! textarea || ! window.getComputedStyle) return null;
   var style = window.getComputedStyle (textarea);
   var lineHeight = parseFloat (style.lineHeight);
   if (! lineHeight || isNaN (lineHeight)) {
      var fontSize = parseFloat (style.fontSize) || 14;
      lineHeight = fontSize * 1.4;
   }
   var paddingTop = parseFloat (style.paddingTop) || 0;
   var paddingLeft = parseFloat (style.paddingLeft) || 0;
   var borderTop = parseFloat (style.borderTopWidth) || 0;
   var borderLeft = parseFloat (style.borderLeftWidth) || 0;
   var charWidth = viMeasureCharWidth (textarea, style);

   return {
      top: paddingTop + borderTop + (line * lineHeight) - (textarea.scrollTop || 0),
      left: paddingLeft + borderLeft + (col * charWidth) - (textarea.scrollLeft || 0),
      height: lineHeight,
      width: charWidth,
      visible: true
   };
};

var updateViCursorState = function (x, textarea) {
   if (! textarea) return;
   var info = viController.cursorInfo (textarea);
   B.call (x, 'set', 'viCursor', {line: info.line + 1, col: info.col + 1});
   var overlay = computeViOverlay (textarea, info.line, info.col);
   if (overlay) {
      var isChat = textarea.classList && textarea.classList.contains ('chat-input');
      B.call (x, 'set', isChat ? 'viOverlayChat' : 'viOverlayEditor', overlay);
   }
};

// *** RESPONDERS ***

B.mrespond ([

   // *** SETUP ***

   ['initialize', [], function (x) {
      B.call (x, 'set', [], {
         dialog: {
            autoStick: true,
            compaction: null,
            input: '',
            model: 'gpt-5.4',
            provider: 'openai',
            voiceSupported: !! (window.SpeechRecognition || window.webkitSpeechRecognition)
         },
         auth: {
            email: '',
            otp: '',
            page: 'login',
            sent: false,
            signupRequested: false
         },
         editorPreview: true,
         mobileDialogsPanel: null,
         mobileDocsPanel: null,
         mobileMoreMenu: false,
         projectModal: {
            open: false,
            name: ''
         },
         triggerApiModal: {
            open: false,
            endpoint: '',
            authorization: '',
            curl: ''
         },
         viewportPhone: isPhoneViewport (),
         tab: 'projects',
         uploads: [],
         viCursor: {line: 1, col: 1},
         viState: {
            commandPrefix: '',
            lastSearch: '',
            message: '',
            mode: 'insert',
            pending: '',
            redoStack: [],
            register: '',
            undoStack: []
         }
      });
      // Detect mode and fetch CSRF token before loading data
      c.ajax ('get', 'auth/csrf', {}, '', function (error, rs) {
         var body = rs && rs.body;
         if (body && body.mode === 'LOCAL') {
            B.call (x, 'set', 'cloudMode', false);
            B.call (x, 'set', 'cloudAuth', 'local');
            B.call (x, 'load', 'models');
            B.call (x, 'load', 'projects');
            B.call (x, 'load', 'settings');
            return B.call (x, 'read', 'hash');
         }
         if (body && body.csrf) {
            B.call (x, 'set', 'cloudMode', true);
            B.call (x, 'set', 'cloudAuth', 'authenticated');
            B.call (x, 'set', 'cloudCsrf', body.csrf);
            B.call (x, 'load', 'models');
            B.call (x, 'load', 'projects');
            B.call (x, 'load', 'settings');
            return B.call (x, 'read', 'hash');
         }
         if (error && error.status === 403) {
            B.call (x, 'set', 'cloudMode', true);
            B.call (x, 'set', 'cloudAuth', 'guest');
            B.call (x, 'set', ['auth', 'page'], readAuthPageFromHash ());
            return;
         }
         B.call (x, 'report', 'error', 'Failed to determine auth mode');
      });

   }],

   ['read', 'hash', function (x) {
      if (B.get ('cloudMode') && B.get ('cloudAuth') === 'guest') {
         return B.call (x, 'set', ['auth', 'page'], readAuthPageFromHash ());
      }

      var parsed = readHashTarget ();
      var currentFile = B.get ('currentFile');
      var leavingDirtyDoc = h.isDirtyDoc (currentFile) && ! h.isSameDocTarget (parsed, currentFile, B.get ('currentProject'));

      var applyParsed = function () {
         B.call (x, 'set', 'tab', parsed.tab);
         if (parsed.tab === 'dialogs') B.call (x, 'reset', 'chatInput');
         if (parsed.tab === 'settings') B.call (x, 'load', 'settings');
         if (parsed.tab === 'snapshots') B.call (x, 'load', 'snapshots');
         B.call (x, 'set', 'currentProject', parsed.project);
         B.call (x, 'set', 'hashTarget', parsed);
         // Clear currentFile if no target, or if switching tabs within same project
         // and the current file doesn't belong to the new tab
         var existingFile = B.get ('currentFile');
         if (! parsed.project || ! parsed.target) {
            // Also clear if the file doesn't match the tab we're switching to
            if (existingFile && parsed.project) {
               var fileIsDialog = h.isDialog (existingFile.name);
               if ((parsed.tab === 'docs' && fileIsDialog) || (parsed.tab === 'dialogs' && ! fileIsDialog)) {
                  B.call (x, 'set', 'currentFile', null);
               }
            }
            else {
               B.call (x, 'set', 'currentFile', null);
            }
         }
         if (parsed.project) B.call (x, 'load', 'files', parsed.project);
         if (parsed.project) B.call (x, 'load', 'triggerId');
         B.call (x, 'apply', 'hashTarget');
      };

      if (! leavingDirtyDoc) return applyParsed ();

      B.call (x, 'confirm', 'leaveCurrentDoc', applyParsed, function () {
         var backHash = buildHash (B.get ('currentProject'), B.get ('tab') || 'docs', B.get ('currentFile'));
         if (window.location.hash !== backHash) window.location.hash = backHash;
      });
   }],

   ['write', 'hash', function (x) {
      var tab = B.get ('tab') || 'projects';
      var currentFile = B.get ('currentFile');
      var next = buildHash (B.get ('currentProject'), tab, currentFile);
      if (window.location.hash !== next) window.location.hash = next;
   }],

   ['navigate', 'hash', function (x, hash) {
      var parsed = readHashTarget (hash);
      var currentFile = B.get ('currentFile');
      var leavingDirtyDoc = h.isDirtyDoc (currentFile) && ! h.isSameDocTarget (parsed, currentFile, B.get ('currentProject'));

      var go = function () {
         if (window.location.hash !== hash) window.location.hash = hash;
         else B.call (x, 'read', 'hash');
      };

      if (! leavingDirtyDoc) return go ();
      B.call (x, 'confirm', 'leaveCurrentDoc', go);
   }],

   ['apply', 'hashTarget', function (x) {
      var parsed = B.get ('hashTarget');
      var files = B.get ('files') || [];
      if (! parsed || ! parsed.target || ! files.length) return;

      if (parsed.tab === 'dialogs') {
         var wanted = dale.stopNot (files, undefined, function (file) {
            var p = h.parseDialogFilename (file);
            if (p && p.dialogId === parsed.target) return file;
         });
         if (wanted) {
            B.call (x, 'set', 'hashTarget', null);
            return B.call (x, 'load', 'file', wanted);
         }
         return;
      }

      if (inc (files, parsed.target)) {
         B.call (x, 'set', 'hashTarget', null);
         return B.call (x, 'load', 'file', parsed.target);
      }
   }],


   ['report', 'error', function (x, error) {
      alert (type (error) === 'string' ? error : JSON.stringify (error));
   }],

   ['report', 'success', function (x, message) {
      alert (type (message) === 'string' ? message : JSON.stringify (message));
   }],

   ['reset', 'chatInput', function (x) {
      B.call (x, 'set', ['dialog', 'input'], ' ');
      B.call (x, 'set', ['dialog', 'input'], '');
   }],

   ['track', 'chatScroll', function (x, ev) {
      var node = ev && ev.target ? ev.target : getChatMessagesNode ();
      B.call (x, 'set', ['dialog', 'autoStick'], isChatNearBottom (node));
   }],

   ['jump', 'chatMessage', function (x, direction, ev) {
      if (ev && ev.preventDefault) ev.preventDefault ();
      scrollChatToMessage (direction === 'prev' ? -1 : 1);
      B.call (x, 'track', 'chatScroll');
   }],

   ['maybe', 'autoscrollChat', function (x) {
      if (B.get ('dialog', 'autoStick') === false) return;
      setTimeout (function () {
         var node = getChatMessagesNode ();
         if (! node) return;
         node.scrollTop = node.scrollHeight;
      }, 0);
   }],

   ['change', 'streamingContent', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
   }],

   ['change', 'streaming', {match: B.changeResponder}, function (x) {
      B.call (x, 'sync', 'vibeyingSpinner');
   }],

   ['sync', 'vibeyingSpinner', function (x) {
      var streaming = B.get ('streaming');
      var currentFile = B.get ('currentFile');
      var parsed = currentFile && currentFile.name ? h.parseDialogFilename (currentFile.name) : null;
      var dialogIsActive = parsed && parsed.status === 'active';
      var shouldSpin = streaming || dialogIsActive;

      if (shouldSpin) {
         if (window.vibeyingInterval) return;
         B.call (x, 'set', 'vibeyingSpin', 0);
         window.vibeyingInterval = setInterval (function () {
            B.call ('set', 'vibeyingSpin', ((B.get ('vibeyingSpin') || 0) + 1) % 4);
         }, 150);
      } else {
         if (window.vibeyingInterval) {
            clearInterval (window.vibeyingInterval);
            window.vibeyingInterval = null;
         }
         B.call (x, 'set', 'vibeyingSpin', 0);
      }
   }],

   ['change', 'currentFile', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
      B.call (x, 'sync', 'vibeyingSpinner');
   }],




   ['change', 'optimisticUserMessage', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
   }],

   ['confirm', 'leaveCurrentDoc', function (x, onContinue, onCancel) {
      var currentFile = B.get ('currentFile');
      if (! h.isDirtyDoc (currentFile)) return onContinue && onContinue ();

      var name = docDisplayName (currentFile.name);
      var save = confirm ('You have unsaved changes in ' + name + '. Save before leaving?');

      if (save) {
         return B.call (x, 'save', 'file', function (x, ok) {
            if (ok) onContinue && onContinue ();
            else onCancel && onCancel ();
         });
      }

      var discard = confirm ('Discard unsaved changes in ' + name + '?');
      if (discard) return onContinue && onContinue ();
      if (onCancel) onCancel ();
   }],

   [/^(get|post|delete)$/, [], {match: function (ev, responder) {
      if (! B.r.compare (ev.verb, responder.verb)) return false;
      var first = ev.path && ev.path [0];
      // Avoid hijacking semantic events like "delete project" / "delete file" / "delete snapshot".
      if (inc (['project', 'file', 'snapshot'], first)) return false;
      return true;
   }}, function (x, headers, body, cb) {
      // Inject CSRF token for mutating requests in cloud mode
      var csrf = B.get ('cloudCsrf');
      if (csrf && (x.verb === 'post' || x.verb === 'delete')) {
         if (type (body) === 'object' && body) body.csrf = csrf;
         else if (x.verb === 'delete') headers ['X-CSRF-Token'] = csrf;
      }
      c.ajax (x.verb, x.path [0], headers, body, function (error, rs) {
         if (error && error.status === 403 && B.get ('cloudMode') && x.path [0].indexOf ('auth/') !== 0) {
            B.call (x, 'set', 'cloudAuth', 'guest');
            B.call (x, 'set', 'cloudCsrf', null);
            B.call (x, 'set', 'currentProject', null);
            B.call (x, 'set', 'currentFile', null);
            B.call (x, 'set', 'files', []);
            B.call (x, 'set', 'projects', []);
            B.call (x, 'set', 'uploads', []);
            B.call (x, 'set', 'snapshots', []);
            B.call (x, 'set', ['auth', 'page'], 'login');
            if (window.location.hash !== '#/login') window.location.hash = '#/login';
            return;
         }
         if (cb) cb (x, error, rs);
      });
   }],

   // *** AUTH ***

   ['login', [], function (x) {
      var email = ((B.get ('auth', 'email') || '') + '').trim ().toLowerCase ();
      if (! email) return B.call (x, 'report', 'error', 'Please enter your email');
      B.call (x, 'post', 'auth/login', {}, {email: email}, function (x, error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to send login code');
         B.call (x, 'set', 'auth', {email: email, otp: '', page: 'login', sent: true, signupRequested: false});
      });
   }],

   ['signup', [], function (x) {
      var email = ((B.get ('auth', 'email') || '') + '').trim ().toLowerCase ();
      if (! email) return B.call (x, 'report', 'error', 'Please enter your email');
      B.call (x, 'post', 'auth/signup', {}, {email: email}, function (x, error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to request invite');
         B.call (x, 'set', 'auth', {email: email, otp: '', page: 'signup', sent: false, signupRequested: true});
      });
   }],

   ['verify', [], function (x) {
      var email = ((B.get ('auth', 'email') || '') + '').trim ().toLowerCase ();
      var otp = ((B.get ('auth', 'otp') || '') + '').trim ();
      if (! email || ! otp) return B.call (x, 'report', 'error', 'Please enter your email and code');
      B.call (x, 'post', 'auth/verify', {}, {email: email, otp: otp}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Invalid code');
         B.call (x, 'set', 'cloudAuth', 'authenticated');
         B.call (x, 'set', 'cloudCsrf', rs.body && rs.body.csrf);
         B.call (x, 'set', 'auth', {email: '', otp: '', page: 'login', sent: false, signupRequested: false});
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'settings');
         B.call (x, 'navigate', 'hash', '#/projects');
      });
   }],

   ['logout', [], function (x) {
      B.call (x, 'post', 'auth/logout', {}, {}, function (x, error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to logout');
         B.call (x, 'set', 'cloudAuth', 'guest');
         B.call (x, 'set', 'cloudCsrf', null);
         B.call (x, 'set', 'currentProject', null);
         B.call (x, 'set', 'currentFile', null);
         B.call (x, 'set', 'files', []);
         B.call (x, 'set', 'projects', []);
         B.call (x, 'set', 'uploads', []);
         B.call (x, 'set', 'snapshots', []);
         B.call (x, 'set', 'auth', {email: '', otp: '', page: 'login', sent: false, signupRequested: false});
         B.call (x, 'navigate', 'hash', '#/login');
      });
   }],

   // *** PROJECTS ***

   ['load', 'projects', function (x) {
      B.call (x, 'get', 'projects', {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to load projects');
         B.call (x, 'set', 'projects', rs.body || []);
      });
   }],

   ['create', 'project', function (x) {
      B.call (x, 'set', 'projectModal', {open: true, name: ''});
      setTimeout (function () {
         var input = document.querySelector ('.project-modal-input');
         if (input) input.focus ();
      }, 0);
   }],

   ['close', 'projectModal', function (x) {
      B.call (x, 'set', 'projectModal', {open: false, name: ''});
   }],

   ['maybe', 'submitProjectModalOnEnter', function (x, ev) {
      if (! ev || ev.key !== 'Enter') return;
      if (ev.preventDefault) ev.preventDefault ();
      B.call (x, 'submit', 'projectModal');
   }],

   ['submit', 'projectModal', function (x) {
      var name = ((B.get ('projectModal', 'name') || '') + '').trim ();
      if (! name) return;
      B.call (x, 'post', 'projects', {}, {name: name}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create project');
         var slug = rs.body && rs.body.slug ? rs.body.slug : name;
         B.call (x, 'load', 'projects');
         B.call (x, 'close', 'projectModal');
         B.call (x, 'navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/dialogs');
      });
   }],

   ['delete', 'project', function (x, name, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation ();
      if (ev && ev.preventDefault) ev.preventDefault ();
      if (! name) return;
      if (! confirm ('Delete project "' + projectDisplayName (name) + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'projects/' + encodeURIComponent (name), {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to delete project');

         var parsedHash = readHashTarget ();
         var deletingCurrent = B.get ('currentProject') === name;
         var deletingFromHash = parsedHash && parsedHash.project === name;

         if (deletingCurrent || deletingFromHash) {
            B.call (x, 'set', 'currentProject', null);
            B.call (x, 'set', 'files', []);
            B.call (x, 'set', 'currentFile', null);
            B.call (x, 'set', 'uploads', []);
            B.call (x, 'set', 'currentUpload', null);
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'streamingContent', '');
            B.call (x, 'set', 'streamingMarkdown', null);
            B.call (x, 'set', 'optimisticUserMessage', null);
            B.call (x, 'reset', 'chatInput');
            B.call (x, 'navigate', 'hash', '#/projects');
         }

         B.call (x, 'load', 'projects');
      });
   }],

   ['create', 'snapshot', function (x) {
      var project = B.get ('currentProject');
      if (! project) return;
      var label = prompt ('Snapshot label (optional):') || '';
      B.call (x, 'post', projectPath (project, 'snapshot'), {}, {label: label}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create snapshot');
         B.call (x, 'load', 'snapshots');
         alert ('Snapshot created: ' + (rs.body.label || rs.body.id));
      });
   }],

   ['load', 'snapshots', function (x) {
      B.call (x, 'get', 'snapshots', {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to load snapshots');
         B.call (x, 'set', 'snapshots', rs.body || []);
      });
   }],

   ['restore', 'snapshot', function (x, id, projectName) {
      var name = prompt ('New project name:', projectName + ' (restored)');
      if (! name || ! name.trim ()) return;
      B.call (x, 'post', 'snapshots/' + encodeURIComponent (id) + '/restore', {}, {name: name.trim ()}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to restore snapshot');
         B.call (x, 'load', 'projects');
         B.call (x, 'load', 'snapshots');
         B.call (x, 'navigate', 'hash', '#/project/' + encodeURIComponent (rs.body.slug) + '/docs');
      });
   }],

   ['delete', 'snapshot', function (x, id) {
      if (! confirm ('Delete this snapshot? This cannot be undone.')) return;
      B.call (x, 'delete', 'snapshots/' + encodeURIComponent (id), {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to delete snapshot');
         B.call (x, 'load', 'snapshots');
      });
   }],

   ['download', 'snapshot', function (x, id) {
      window.open ('snapshots/' + encodeURIComponent (id) + '/download', '_blank');
   }],

   // *** SETTINGS ***

   ['load', 'models', function (x) {
      c.ajax ('get', 'models', {}, '', function (error, rs) {
         if (error || ! rs.body || type (rs.body) !== 'object') return;
         if (rs.body.openai) MODELS.openai = rs.body.openai;
         if (rs.body.anthropic) MODELS.anthropic = rs.body.anthropic;
         MODEL_OPTIONS = buildModelOptions ();
      });
   }],

   ['copy', 'trigger', function (x, mode) {
      var trigger = B.get ('triggerId');
      if (! trigger || ! trigger.id) return;
      var text = mode === 'email'
         ? 'trigger+' + trigger.id + '@' + trigger.domain
         : 'Bearer ' + trigger.id;
      var label = mode === 'email' ? 'Email copied to clipboard' : 'API token copied to clipboard';
      var path = (window.location.pathname || '/').replace (/[^/]*$/, '');
      var endpoint = window.location.origin + path + 'trigger';

      if (! navigator.clipboard || ! navigator.clipboard.writeText) {
         return B.call (x, 'report', 'error', 'Clipboard copy is not supported in this browser');
      }

      navigator.clipboard.writeText (text).then (function () {
         if (mode === 'api') {
            return B.call (x, 'set', 'triggerApiModal', {
               open: true,
               endpoint: endpoint,
               authorization: 'Authorization: Bearer ' + trigger.id,
               curl: "curl -X POST " + JSON.stringify (endpoint) + " -H " + JSON.stringify ('Authorization: Bearer ' + trigger.id) + " -H " + JSON.stringify ('Content-Type: application/json') + " -d " + JSON.stringify ('{"prompt":"Hello from a trigger","model":"gpt-5.4"}')
            });
         }
         B.call (x, 'report', 'success', label);
      }).catch (function () {
         B.call (x, 'report', 'error', 'Failed to copy to clipboard');
      });
   }],

   ['close', 'triggerApiModal', function (x) {
      B.call (x, 'set', 'triggerApiModal', {open: false, endpoint: '', authorization: '', curl: ''});
   }],

   ['copy', 'text', function (x, text, label) {
      if (! navigator.clipboard || ! navigator.clipboard.writeText) {
         return B.call (x, 'report', 'error', 'Clipboard copy is not supported in this browser');
      }
      navigator.clipboard.writeText (text || '').then (function () {
         B.call (x, 'report', 'success', (label || 'Text') + ' copied to clipboard');
      }).catch (function () {
         B.call (x, 'report', 'error', 'Failed to copy to clipboard');
      });
   }],

   ['load', 'triggerId', function (x) {
      var project = B.get ('currentProject');
      if (! project) return B.call (x, 'set', 'triggerId', null);
      B.call (x, 'get', 'project/' + encodeURIComponent (project) + '/trigger-id', {}, '', function (x, error, rs) {
         if (error || ! rs.body || ! rs.body.triggerId) return B.call (x, 'set', 'triggerId', null);
         B.call (x, 'set', 'triggerId', {id: rs.body.triggerId, domain: rs.body.domain || ''});
      });
   }],

   ['load', 'settings', function (x) {
      B.call (x, 'get', 'settings', {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to load settings');
         var settings = rs.body || {};
         B.call (x, 'set', 'settings', settings);
         if (settings.editor && type (settings.editor.viMode) === 'boolean') {
            B.call (x, 'set', 'viMode', settings.editor.viMode);
            B.call (x, 'set', ['viState', 'mode'], settings.editor.viMode ? 'normal' : 'insert');
         }
      });
   }],

   ['save', 'settings', function (x) {
      var edits = B.get ('settingsEdits') || {};
      var body = {};
      if (edits.openaiKey !== undefined) body.openaiKey = edits.openaiKey;
      if (edits.claudeKey !== undefined) body.claudeKey = edits.claudeKey;

      B.call (x, 'set', 'savingSettings', true);
      B.call (x, 'post', 'settings', {}, body, function (x, error, rs) {
         B.call (x, 'set', 'savingSettings', false);
         if (error) return B.call (x, 'report', 'error', 'Failed to save settings');
         B.call (x, 'set', 'settingsEdits', {});
         B.call (x, 'load', 'settings');
      });
   }],

   ['toggle', 'viMode', function (x) {
      var next = ! B.get ('viMode');
      var previous = B.get ('viMode');
      B.call (x, 'set', 'viMode', next);
      B.call (x, 'set', ['settings', 'editor', 'viMode'], next);
      B.call (x, 'set', ['viState', 'mode'], next ? 'normal' : 'insert');
      // Initialize the cursor overlay after the DOM redraws
      if (next) setTimeout (function () {
         var textarea = document.querySelector ('.editor-textarea');
         if (textarea) {
            textarea.focus ();
            updateViCursorState (x, textarea);
         }
      }, 50);
      B.call (x, 'post', 'settings', {}, {editor: {viMode: next}}, function (x, error, rs) {
         if (error) {
            B.call (x, 'set', 'viMode', previous);
            B.call (x, 'set', ['settings', 'editor', 'viMode'], previous);
            B.call (x, 'set', ['viState', 'mode'], previous ? 'normal' : 'insert');
            return B.call (x, 'report', 'error', 'Failed to save vi mode setting');
         }
      });
   }],

   ['login', 'oauth', function (x, provider) {
      B.call (x, 'set', ['oauth', 'loading'], provider);
      B.call (x, 'set', ['oauth', 'step'], null);
      B.call (x, 'post', 'settings/login/' + provider, {}, {}, function (x, error, rs) {
         if (error) {
            B.call (x, 'set', ['oauth', 'loading'], null);
            return B.call (x, 'report', 'error', 'Failed to start login');
         }
         var body = rs.body;
         // Open the auth URL in a new tab
         window.open (body.url, '_blank');

         if (body.flow === 'paste_code') {
            B.call (x, 'set', ['oauth', 'step'], {provider: provider, flow: 'paste_code', url: body.url});
            B.call (x, 'set', ['oauth', 'loading'], null);
         }
         else {
            B.call (x, 'set', ['oauth', 'step'], {provider: provider, flow: 'waiting', url: body.url});
            B.call (x, 'complete', 'oauthCallback', provider, null);
         }
      });
   }],

   ['complete', 'oauthCallback', function (x, provider, manualCode) {
      B.call (x, 'set', ['oauth', 'loading'], provider);
      var body = manualCode ? {code: manualCode} : {};
      B.call (x, 'post', 'settings/login/' + provider + '/callback', {}, body, function (x, error, rs) {
         B.call (x, 'set', ['oauth', 'loading'], null);
         B.call (x, 'set', ['oauth', 'step'], null);
         B.call (x, 'set', ['oauth', 'code'], '');
         if (error) return B.call (x, 'report', 'error', 'Login failed: ' + (rs && rs.body && rs.body.error ? rs.body.error : 'unknown error'));
         B.call (x, 'load', 'settings');
      });
   }],

   ['logout', 'oauth', function (x, provider) {
      if (! confirm ('Log out from ' + (provider === 'claude' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)') + ' subscription?')) return;
      B.call (x, 'post', 'settings/logout/' + provider, {}, {}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to logout');
         B.call (x, 'load', 'settings');
      });
   }],

   // *** FILES ***

   ['load', 'files', function (x, project) {
      project = project || B.get ('currentProject');
      if (! project) return B.call (x, 'set', 'files', []);

      B.call (x, 'get', projectPath (project, 'files'), {}, '', function (x, error, rs) {
         if (error) {
            if (error.status === 404) {
               B.call (x, 'set', 'currentProject', null);
               B.call (x, 'set', 'files', []);
               B.call (x, 'set', 'currentFile', null);
               B.call (x, 'set', 'streaming', false);
               B.call (x, 'set', 'streamingContent', '');
               B.call (x, 'set', 'streamingMarkdown', null);
               B.call (x, 'set', 'optimisticUserMessage', null);
               B.call (x, 'reset', 'chatInput');
               return B.call (x, 'navigate', 'hash', '#/projects');
            }
            return B.call (x, 'report', 'error', 'Failed to load files');
         }
         B.call (x, 'set', 'files', rs.body);

         // Sync currentFile.name with the authoritative filename from the server
         // (dialog files get renamed when status changes, e.g. done→active)
         var cf = B.get ('currentFile');
         if (cf && h.isDialog (cf.name)) {
            var cfParsed = h.parseDialogFilename (cf.name);
            if (cfParsed) {
               var match = dale.stopNot (rs.body || [], undefined, function (f) {
                  var fp = h.parseDialogFilename (f);
                  if (fp && fp.dialogId === cfParsed.dialogId) return f;
               });
               if (match && match !== cf.name) {
                  B.call (x, 'set', ['currentFile', 'name'], match);
               }
            }
         }

         B.call (x, 'apply', 'hashTarget');
         B.call (x, 'load', 'uploads', project);

         setTimeout (function () {
            if (B.get ('currentFile')) return;
            if (B.get ('loadingFile')) return;
            var tab = B.get ('tab');
            if (tab !== 'docs' && tab !== 'dialogs') return;
            var hashTarget = B.get ('hashTarget');
            if (hashTarget && hashTarget.target) return;

            var files = rs.body || [];
            var next = null;
            if (tab === 'docs') {
               // Prefer doc/main.md, fall back to first doc file
               if (files.indexOf ('doc/main.md') !== -1) next = 'doc/main.md';
               else next = dale.stopNot (files, undefined, function (name) {
                  if (h.isDoc (name)) return name;
               });
            }
            else {
               next = dale.stopNot (files, undefined, function (name) {
                  if (h.isDialog (name)) return name;
               });
            }
            if (next) B.call (x, 'load', 'file', next);
         }, 0);
      });
   }],

   ['load', 'file', function (x, name) {
      var currentFile = B.get ('currentFile');
      var project = B.get ('currentProject');
      if (! project) return;

      // Clear stale streaming context when switching files
      B.call (x, 'set', 'contextWindow', null);
      B.call (x, 'set', 'streamingMarkdown', null);
      B.call (x, 'set', 'streaming', false);
      B.call (x, 'set', 'streamingContent', '');
      if (activeDialogStream && activeDialogStream.abort) {
         try {activeDialogStream.abort ();} catch (e) {}
         activeDialogStream = null;
      }

      // This is now an explicit file-load intent; clear any stale hash target
      // so delayed file-list refreshes don't bounce back to an older target.
      B.call (x, 'set', 'hashTarget', null);

      // Protect unsaved local edits from late/background reloads of the same file.
      if (h.isDirtyDoc (currentFile) && currentFile.name === name) return;

      var proceed = function () {
         var tabAtRequest = B.get ('tab');
         B.call (x, 'set', 'loadingFile', true);
         B.call (x, 'get', projectPath (project, 'file/' + encodeURIComponent (name)), {}, '', function (x, error, rs) {
            B.call (x, 'set', 'loadingFile', false);
            if (error) {
               B.call (x, 'set', 'currentFile', null);
               return B.call (x, 'write', 'hash');
            }

            // Prevent late in-flight responses from clobbering unsaved edits.
            var latest = B.get ('currentFile');
            if (h.isDirtyDoc (latest) && latest.name === rs.body.name) return;

            var dialogFile = h.isDialog (rs.body.name);
            var currentTab = B.get ('tab');
            // Only switch tabs if the user hasn't navigated away since the request
            if (currentTab === tabAtRequest) {
               var nextTab = dialogFile ? 'dialogs' : 'docs';
               if (currentTab !== nextTab) B.call (x, 'set', 'tab', nextTab);
            }
            B.call (x, 'set', 'currentFile', {
               name: rs.body.name,
               content: rs.body.content,
               original: rs.body.content
            });
            B.call (x, 'set', 'currentUpload', null);
            B.call (x, 'set', 'viCursor', {line: 1, col: 1});
            if (dialogFile) {
               B.call (x, 'reset', 'chatInput');
               // Restore provider/model dropdown from dialog header or last assistant turn
               var dialogContent = rs.body.content || '';
               var headerModelMatch = dialogContent.match (/^>\s*Provider:\s*(\S+)\s*\|\s*Model:\s*(.+)$/m);
               var lastModel = null;
               // Walk assistant sections backward to find the most recent model
               var assistantModelRe = /## Assistant\n>\s*Model:\s*(.+)/g;
               var amMatch;
               while ((amMatch = assistantModelRe.exec (dialogContent)) !== null) lastModel = amMatch [1].trim ();
               if (lastModel) {
                  // Find matching MODEL_OPTIONS entry
                  var found = dale.stopNot (MODEL_OPTIONS, undefined, function (opt) {
                     if (opt.model === lastModel) return opt;
                  });
                  if (found) {
                     B.call (x, 'set', ['dialog', 'provider'], found.provider);
                     B.call (x, 'set', ['dialog', 'model'], found.model);
                  }
               }
               else if (headerModelMatch) {
                  var hProvider = headerModelMatch [1].trim ();
                  var hModel = headerModelMatch [2].trim ();
                  var hFound = dale.stopNot (MODEL_OPTIONS, undefined, function (opt) {
                     if (opt.model === hModel) return opt;
                  });
                  if (hFound) {
                     B.call (x, 'set', ['dialog', 'provider'], hFound.provider);
                     B.call (x, 'set', ['dialog', 'model'], hFound.model);
                  }
               }

               // If dialog is active, attach to the SSE stream — but only if this
               // dialog is still the one currently selected when the status check returns.
               var parsedDialog = h.parseDialogFilename (rs.body.name) || {};
               if (parsedDialog.dialogId) {
                  fetch (projectPath (project, 'dialog/' + encodeURIComponent (parsedDialog.dialogId))).then (function (resp) {
                     if (! resp.ok) return null;
                     return resp.json ();
                  }).then (function (data) {
                     if (! data) return;

                     var latestFile = B.get ('currentFile');
                     var latestParsed = latestFile && latestFile.name ? h.parseDialogFilename (latestFile.name) : null;
                     if (! latestParsed || latestParsed.dialogId !== parsedDialog.dialogId) return;

                     if (data.filename && data.filename !== rs.body.name) {
                        B.call (x, 'set', ['currentFile', 'name'], data.filename);
                     }
                     if (data.status === 'active') {
                        // Seed the live bubble from the on-disk markdown so refresh/reopen
                        // matches the compact SSE view instead of exposing raw tool payloads.
                        var resumeContent = getStreamingResumeContent (rs.body.content);
                        B.call (x, 'start', 'dialogStream', parsedDialog.dialogId, data.filename || rs.body.name, undefined, resumeContent || undefined);
                     }
                  }).catch (function () {});
               }
            }
            B.call (x, 'write', 'hash');
            // Initialize vi cursor overlay after DOM redraws with the new file
            if (B.get ('viMode') && ! dialogFile) setTimeout (function () {
               var textarea = document.querySelector ('.editor-textarea');
               if (textarea) {
                  textarea.focus ();
                  updateViCursorState (x, textarea);
               }
            }, 50);
         });
      };

      if (h.isDirtyDoc (currentFile) && currentFile.name !== name) {
         return B.call (x, 'confirm', 'leaveCurrentDoc', proceed);
      }

      proceed ();
   }],

   ['save', 'file', function (x, cb) {
      var file = B.get ('currentFile');
      if (! file) {
         if (cb) cb (x, false);
         return;
      }

      var project = B.get ('currentProject');
      if (! project) return;

      B.call (x, 'set', 'savingFile', true);
      B.call (x, 'post', projectPath (project, 'file/' + encodeURIComponent (file.name)), {}, {content: file.content}, function (x, error, rs) {
         B.call (x, 'set', 'savingFile', false);
         if (error) {
            B.call (x, 'report', 'error', 'Failed to save file');
            if (cb) cb (x, false);
            return;
         }
         B.call (x, 'set', ['currentFile', 'original'], file.content);
         B.call (x, 'load', 'files');
         if (cb) cb (x, true);
      });
   }],

   ['create', 'file', function (x) {
      var name = prompt ('File name:');
      if (! name || ! name.trim ()) return;
      name = normalizeDocFilename (name);

      var project = B.get ('currentProject');
      if (! project) return;

      var title = docDisplayName (name).split ('/').pop ().replace (/\.[^.]+$/, '');
      B.call (x, 'post', projectPath (project, 'file/' + encodeURIComponent (name)), {}, {content: '# ' + title + '\n\n'}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create file');
         B.call (x, 'load', 'files');
         B.call (x, 'load', 'file', name);
      });
   }],

   ['delete', 'file', function (x, name) {
      if (! confirm ('Delete ' + name + '?')) return;

      var currentFile = B.get ('currentFile');
      if (currentFile && currentFile.name === name) {
         B.call (x, 'set', 'currentFile', null);
         B.call (x, 'write', 'hash');
      }

      var project = B.get ('currentProject');
      if (! project) return;

      B.call (x, 'delete', projectPath (project, 'file/' + encodeURIComponent (name)), {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to delete file');
         B.call (x, 'load', 'files');
      });
   }],

   ['close', 'file', function (x, force) {
      var proceed = function () {
         B.call (x, 'set', 'currentFile', null);
         B.call (x, 'write', 'hash');
      };

      if (! force && h.isDirtyDoc (B.get ('currentFile'))) return B.call (x, 'confirm', 'leaveCurrentDoc', proceed);
      proceed ();
   }],

   ['keydown', 'editor', function (x, ev) {
      // Cmd/Ctrl+S to save
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') {
         ev.preventDefault ();
         B.call (x, 'save', 'file');
      }
   }],

   ['vi', 'key', function (x, ev) {
      var textarea = ev.target;
      if (! textarea) return;

      var viState = B.get ('viState') || {};
      var isChat = (textarea.classList || {}).contains && textarea.classList.contains ('chat-input');
      var options = {
         allowCommand: ! isChat,
         allowSearch: ! isChat,
         allowSend: isChat,
         light: isChat
      };

      var result = viController.handleKey (ev, textarea, viState, options) || {};

      // Capture desired cursor + scroll before store updates trigger a re-render.
      var desiredCursor = textarea.selectionStart;
      var desiredScrollTop = textarea.scrollTop || 0;
      var desiredScrollLeft = textarea.scrollLeft || 0;
      if (result.cursor !== undefined) desiredCursor = result.cursor;

      if (result.mode) B.call (x, 'set', ['viState', 'mode'], result.mode);
      if (result.pending !== undefined) B.call (x, 'set', ['viState', 'pending'], result.pending);
      if (result.register !== undefined) B.call (x, 'set', ['viState', 'register'], result.register);
      if (result.message !== undefined) B.call (x, 'set', ['viState', 'message'], result.message);
      if (result.lastSearch !== undefined) B.call (x, 'set', ['viState', 'lastSearch'], result.lastSearch);
      if (result.commandPrefix !== undefined) B.call (x, 'set', ['viState', 'commandPrefix'], result.commandPrefix);
      if (result.undoStack !== undefined) B.call (x, 'set', ['viState', 'undoStack'], result.undoStack);
      if (result.redoStack !== undefined) B.call (x, 'set', ['viState', 'redoStack'], result.redoStack);

      if (result.value !== undefined) {
         if (isChat) B.call (x, 'set', ['dialog', 'input'], result.value);
         else B.call (x, 'set', ['currentFile', 'content'], result.value);
      }

      // After store changes, gotoB re-renders the textarea which can
      // reset selectionStart/selectionEnd.  Restore it after the DOM settles.

      // Always update the cursor overlay after any vi key press.
      // Motions (h/j/k/l/w/b etc.) move the textarea cursor directly
      // via viController.moveCursor but don't set result.cursor,
      // so we must unconditionally sync the overlay position.
      updateViCursorState (x, textarea);

      // Restore cursor + scroll position after gotoB's synchronous re-render
      // may have reset it (e.g. entering insert mode via o/O/i).
      if (result.value !== undefined || result.mode || result.cursor !== undefined) {
         var restoreCursor = function () {
            var sel = isChat ? '.chat-input' : '.editor-textarea';
            var ta = document.querySelector (sel);
            if (ta) {
               viController.moveCursor (ta, desiredCursor);
               ta.scrollTop = desiredScrollTop;
               ta.scrollLeft = desiredScrollLeft;
               ta.focus ();
               updateViCursorState (x, ta);
            }
         };
         if (window.requestAnimationFrame) {
            window.requestAnimationFrame (function () {
               window.requestAnimationFrame (restoreCursor);
            });
         }
         else setTimeout (restoreCursor, 0);
      }

      if (result.save) B.call (x, 'save', 'file');
      if (result.close) B.call (x, 'close', 'file', !! result.forceClose);
      if (result.send) B.call (x, 'send', 'message');

      if (result.preventDefault) ev.preventDefault ();
   }],

   ['vi', 'cursor', function (x, ev) {
      var textarea = ev.target;
      if (! textarea) return;
      updateViCursorState (x, textarea);
   }],

   ['toggle', 'editorPreview', function (x) {
      B.call (x, 'set', 'editorPreview', ! B.get ('editorPreview'));
   }],

   // *** UPLOADS ***

   ['load', 'uploads', function (x, project) {
      project = project || B.get ('currentProject');
      if (! project) {
         B.call (x, 'set', 'uploads', []);
         return B.call (x, 'set', 'currentUpload', null);
      }

      B.call (x, 'get', projectPath (project, 'uploads'), {}, '', function (x, error, rs) {
         // Ignore stale responses after project navigation/deletion.
         if (project !== B.get ('currentProject')) return;

         if (error) {
            if (error.status === 404) {
               B.call (x, 'set', 'uploads', []);
               return B.call (x, 'set', 'currentUpload', null);
            }
            return B.call (x, 'report', 'error', 'Failed to load uploads');
         }
         var uploads = rs.body || [];
         B.call (x, 'set', 'uploads', uploads);

         var current = B.get ('currentUpload');
         if (current) {
            var stillThere = dale.stopNot (uploads, undefined, function (item) {
               if (item.name === current.name) return item;
            });
            if (! stillThere) B.call (x, 'set', 'currentUpload', null);
         }
      });
   }],

   ['open', 'uploadPicker', function (x) {
      var input = document.getElementById ('upload-input') || document.getElementById ('upload-input-phone');
      if (input) input.click ();
   }],

   ['upload', 'file', function (x, ev) {
      var project = B.get ('currentProject');
      if (! project) return;
      var input = ev && ev.target;
      var files = input && input.files ? Array.prototype.slice.call (input.files) : [];
      if (! files.length) return;

      B.call (x, 'set', 'uploading', true);
      var lastUploaded = null;

      var uploadNext = function (idx) {
         if (idx >= files.length) {
            B.call (x, 'set', 'uploading', false);
            B.call (x, 'load', 'uploads', project);
            if (lastUploaded) B.call (x, 'set', 'currentUpload', lastUploaded);
            return;
         }

         var file = files [idx];
         var reader = new FileReader ();
         reader.onload = function () {
            B.call (x, 'post', projectPath (project, 'upload'), {}, {
               name: file.name,
               content: reader.result,
               contentType: file.type || ''
            }, function (x, error, rs) {
               if (error) {
                  B.call (x, 'set', 'uploading', false);
                  return B.call (x, 'report', 'error', 'Failed to upload ' + file.name);
               }
               if (rs && rs.body) lastUploaded = rs.body;
               uploadNext (idx + 1);
            });
         };
         reader.onerror = function () {
            B.call (x, 'set', 'uploading', false);
            B.call (x, 'report', 'error', 'Failed to read ' + file.name);
         };
         reader.readAsDataURL (file);
      };

      uploadNext (0);
      if (input) input.value = '';
   }],

   ['select', 'upload', function (x, upload) {
      B.call (x, 'set', 'currentUpload', upload || null);
   }],


   // *** DIALOGS ***

   ['create', 'dialog', function (x) {
      var name = prompt ('Dialog name:');
      if (! name || ! name.trim ()) return;

      var project = B.get ('currentProject');
      if (! project) return;

      var provider = B.get ('dialog', 'provider') || 'openai';
      var model = B.get ('dialog', 'model') || defaultModelForProvider (provider);

      B.call (x, 'post', projectPath (project, 'dialog/new'), {}, {
         provider: provider,
         model: model,
         slug: name.trim ()
      }, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create dialog');

         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'streamingContent', '');
         B.call (x, 'set', 'streamingMarkdown', null);
         B.call (x, 'set', 'optimisticUserMessage', null);
         B.call (x, 'set', ['dialog', 'input'], '');

         B.call (x, 'load', 'files');
         if (rs && rs.body && rs.body.filename) B.call (x, 'load', 'file', rs.body.filename);
      });
   }],

   ['change', 'chatProviderModel', function (x, key) {
      var parsed = parseModelOptionKey (key);
      B.call (x, 'set', ['dialog', 'provider'], parsed.provider);
      B.call (x, 'set', ['dialog', 'model'], parsed.model);
   }],

   ['continue', 'freshDialog', function (x) {
      var file = B.get ('currentFile');
      var parsed = file && h.parseDialogFilename (file.name);
      if (! parsed) return B.call (x, 'report', 'error', 'Open a dialog first.');
      if (B.get ('streaming') || parsed.status === 'active') return B.call (x, 'report', 'error', 'Stop the current dialog before continuing in a fresh one.');
      if (B.get ('dialog', 'compaction')) return B.call (x, 'report', 'error', 'Compaction is already in progress.');
      if ((B.get ('dialog', 'input') || '').trim ()) return B.call (x, 'report', 'error', 'Clear the draft message before continuing in a fresh dialog.');

      B.call (x, 'set', ['dialog', 'compaction'], {
         sourceDialogId: parsed.dialogId,
         sourceFilename: file.name,
         provider: B.get ('dialog', 'provider') || 'openai',
         model: B.get ('dialog', 'model') || defaultModelForProvider (B.get ('dialog', 'provider') || 'openai')
      });
      B.call (x, 'set', ['dialog', 'input'], COMPACTION_REQUEST_PROMPT);
      B.call (x, 'send', 'message');
   }],

   ['finish', 'freshCompaction', function (x, sourceDialogId, sourceFilename) {
      var project = B.get ('currentProject');
      var compaction = B.get ('dialog', 'compaction') || {};
      if (! project || ! sourceDialogId || compaction.sourceDialogId !== sourceDialogId) {
         return B.call (x, 'set', ['dialog', 'compaction'], null);
      }

      fetch (projectPath (project, 'dialog/' + encodeURIComponent (sourceDialogId))).then (function (response) {
         if (! response.ok) throw new Error ('Failed to load compacted dialog');
         return response.json ();
      }).then (function (data) {
         var messages = (data && data.messages) || parseDialogContent ((data && data.markdown) || '');
         var lastAssistant = dale.stopNot ((messages || []).slice ().reverse (), undefined, function (msg) {
            if (msg && msg.role === 'assistant' && type (msg.content) === 'string' && msg.content.trim ()) return msg;
         });

         if (! lastAssistant || ! lastAssistant.content || ! lastAssistant.content.trim ()) throw new Error ('Compaction produced no handoff');

         var payload = {
            provider: compaction.provider || 'openai',
            model: compaction.model || defaultModelForProvider (compaction.provider || 'openai'),
            slug: h.freshDialogSlug (sourceFilename),
            prompt: buildFreshDialogPrompt (lastAssistant.content, sourceDialogId)
         };
         var csrf = B.get ('cloudCsrf');
         if (csrf) payload.csrf = csrf;

         return fetch (projectPath (project, 'dialog'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify (payload)
         });
      }).then (function (response) {
         if (! response.ok) return response.text ().then (function (text) {throw new Error (text || ('HTTP ' + response.status));});
         return response.json ();
      }).then (function (data) {
         B.call (x, 'set', ['dialog', 'compaction'], null);
         B.call (x, 'set', ['dialog', 'input'], '');
         B.call (x, 'set', 'streaming', true);
         B.call (x, 'set', 'streamingContent', '');
         B.call (x, 'set', 'optimisticUserMessage', null);
         B.call (x, 'set', 'contextWindow', null);
         if (data && data.filename) {
            B.call (x, 'set', ['currentFile', 'name'], data.filename);
            B.call (x, 'load', 'files');
            B.call (x, 'load', 'file', data.filename);
         }
         if (data && data.dialogId) B.call (x, 'start', 'dialogStream', data.dialogId, data.filename || null, null);
      }).catch (function (error) {
         B.call (x, 'set', ['dialog', 'compaction'], null);
         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'streamingContent', '');
         B.call (x, 'set', 'streamingMarkdown', null);
         B.call (x, 'report', 'error', 'Failed to continue in a fresh dialog: ' + error.message);
      });
   }],

   ['send', 'message', function (x) {
      var file = B.get ('currentFile');
      var input = B.get ('dialog', 'input');
      var project = B.get ('currentProject');
      if (! project) return;
      if (B.get ('streaming')) return;

      var provider = B.get ('dialog', 'provider') || 'openai';
      var model = B.get ('dialog', 'model') || defaultModelForProvider (provider);
      if (! input || ! input.trim ()) return;

      var parsed = file && h.parseDialogFilename (file.name);
      var originalInput = input.trim ();

      var runSend = function () {
         B.call (x, 'set', 'streaming', true);
         B.call (x, 'set', 'streamingContent', '');
         B.call (x, 'set', 'optimisticUserMessage', originalInput);
         B.call (x, 'set', 'contextWindow', null);
         B.call (x, 'set', ['dialog', 'input'], '');
         var inputNode = document.querySelector ('.chat-input');
         if (inputNode) inputNode.value = '';

         // Optimistically update filename to active status so the UI shows 🟣 immediately
         if (parsed && parsed.status === 'done') {
            var activeFilename = 'dialog/' + parsed.dialogId + '-active.md';
            B.call (x, 'set', ['currentFile', 'name'], activeFilename);
            // Update file in the sidebar list too
            var files = B.get ('files') || [];
            var updatedFiles = dale.go (files, function (f) {
               return f === file.name ? activeFilename : f;
            });
            B.call (x, 'set', 'files', updatedFiles);
         }

         var method = parsed ? 'PUT' : 'POST';
         var payload = parsed
            ? {
               dialogId: parsed.dialogId,
               provider: provider,
               prompt: originalInput,
               model: model || undefined
            }
            : {
               provider: provider,
               prompt: originalInput,
               model: model || undefined
            };

         // Use the (possibly updated) filename for stream processing
         var streamFilename = B.get ('currentFile') ? B.get ('currentFile').name : null;

         var fetchPayload = payload;
         var fetchCsrf = B.get ('cloudCsrf');
         if (fetchCsrf && type (fetchPayload) === 'object') fetchPayload = teishi.copy (fetchPayload), fetchPayload.csrf = fetchCsrf;
         fetch (projectPath (project, 'dialog'), {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify (fetchPayload)
         }).then (function (response) {
            if (! response.ok) {
               return response.text ().then (function (text) {
                  throw new Error (text || ('HTTP ' + response.status));
               });
            }
            return response.json ();
         }).then (function (data) {
            var dialogId = parsed ? parsed.dialogId : (data && data.dialogId);
            var filename = (data && data.filename) ? data.filename : streamFilename;

            if (filename) {
               B.call (x, 'set', ['currentFile', 'name'], filename);
               // Ensure file exists in sidebar and load it if needed
               B.call (x, 'load', 'files');
               if (! parsed) B.call (x, 'load', 'file', filename);
            }

            if (dialogId) {
               B.call (x, 'start', 'dialogStream', dialogId, filename || streamFilename, originalInput);
            }
         }).catch (function (err) {
            B.call (x, 'set', ['dialog', 'compaction'], null);
            B.call (x, 'report', 'error', 'Failed to send: ' + err.message);
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'optimisticUserMessage', null);
            B.call (x, 'set', ['dialog', 'input'], originalInput);
         });
      };

      // Stateless safety check: before continuing an existing dialog, read server status.
      if (parsed) {
         return fetch (projectPath (project, 'dialogs')).then (function (rs) {
            if (! rs.ok) throw new Error ('Failed to check dialog status');
            return rs.json ();
         }).then (function (dialogs) {
            var found = dale.stopNot (dialogs || [], undefined, function (item) {
               if (item.dialogId === parsed.dialogId) return item;
            });

            if (found && found.status === 'active') {
               if (found.filename) {
                  B.call (x, 'set', ['currentFile', 'name'], found.filename);
                  B.call (x, 'load', 'file', found.filename);
               }
               B.call (x, 'load', 'files');
               B.call (x, 'set', ['dialog', 'compaction'], null);
               return B.call (x, 'report', 'error', 'This dialog is currently active. Stop it before sending a new message.');
            }

            runSend ();
         }).catch (function (err) {
            B.call (x, 'set', ['dialog', 'compaction'], null);
            B.call (x, 'report', 'error', 'Failed to check dialog status: ' + err.message);
         });
      }

      runSend ();
   }],

   // Start dialog stream (GET /dialog/:id/stream)
   ['start', 'dialogStream', function (x, dialogId, filename, originalInput, resumeContent) {
      var project = B.get ('currentProject');
      if (! project || ! dialogId) return;

      // Avoid duplicate streams
      if (activeDialogStream && activeDialogStream.dialogId === dialogId) return;

      // Abort any existing stream
      if (activeDialogStream && activeDialogStream.abort) {
         try {activeDialogStream.abort ();} catch (e) {}
      }

      var controller = new AbortController ();
      activeDialogStream = {dialogId: dialogId, abort: function () {controller.abort ();}};
      var previousDialogId = B.get ('streamingDialogId');
      B.call (x, 'set', 'streamingDialogId', dialogId);
      B.call (x, 'set', 'streaming', true);
      if (resumeContent) B.call (x, 'set', 'streamingContent', resumeContent);
      else if (previousDialogId !== dialogId) B.call (x, 'set', 'streamingContent', '');
      else B.call (x, 'set', 'streamingContent', B.get ('streamingContent') || '');
      var baseMarkdown = '';
      var currentFile = B.get ('currentFile');
      if (currentFile && currentFile.name) {
         var parsedCurrent = h.parseDialogFilename (currentFile.name);
         if (parsedCurrent && parsedCurrent.dialogId === dialogId) baseMarkdown = currentFile.content || '';
      }
      B.call (x, 'set', 'streamingMarkdown', baseMarkdown);

      var targetFilename = filename;
      var receivedContent = false;
      var streamingChunkState = {inToolChunk: false};
      var streamingToolDescriptions = {};
      var streamingToolStatusLines = {};
      var compactionFollowUp = false;

      var finalize = function () {
         if (activeDialogStream && activeDialogStream.dialogId === dialogId) activeDialogStream = null;
         B.call (x, 'set', 'streamingDialogId', null);
         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'optimisticUserMessage', null);
         B.call (x, 'set', 'streamingMarkdown', null);
         // Only reload if the stream actually produced content; otherwise we'd
         // loop endlessly on dialogs stuck with -active.md status but no
         // generation running on the server.
         if (receivedContent) {
            var latestFile = B.get ('currentFile');
            var latestParsed = latestFile && latestFile.name ? h.parseDialogFilename (latestFile.name) : null;
            if (targetFilename && latestParsed && latestParsed.dialogId === dialogId) B.call (x, 'load', 'file', targetFilename);
            B.call (x, 'load', 'files');
         }
         if (compactionFollowUp) B.call (x, 'finish', 'freshCompaction', dialogId, targetFilename || filename);
      };

      fetch (projectPath (project, 'dialog/' + encodeURIComponent (dialogId) + '/stream'), {
         method: 'GET',
         headers: {Accept: 'text/event-stream'},
         signal: controller.signal
      }).then (function (response) {
         if (! response.ok) {
            return response.text ().then (function (text) {
               B.call (x, 'report', 'error', 'Stream request failed: ' + response.status + ' ' + text);
               finalize ();
            });
         }

         if (! response.body) return finalize ();

         var reader = response.body.getReader ();
         var decoder = new TextDecoder ();
         var buffer = '';

         function read () {
            reader.read ().then (function (result) {
               if (result.done) return finalize ();

               buffer += decoder.decode (result.value, {stream: true});
               var lines = buffer.split ('\n');
               buffer = lines.pop ();

               dale.go (lines, function (line) {
                  if (! line.startsWith ('data: ')) return;

                  try {
                     var data = JSON.parse (line.slice (6));
                     if (data.type === 'snapshot' || data.type === 'markdown_append' || data.type === 'markdown_replace') {
                        receivedContent = true;
                        var currentMarkdown = B.get ('streamingMarkdown') || '';
                        var nextMarkdown = applyStreamingMarkdownEvent (currentMarkdown, data);
                        B.call (x, 'set', 'streamingMarkdown', nextMarkdown);
                        if (! originalInput || nextMarkdown.indexOf (originalInput) !== -1) B.call (x, 'set', 'optimisticUserMessage', null);
                        if (data.result && data.result.filename) targetFilename = data.result.filename;
                     }
                     else if (data.type === 'chunk') {
                        receivedContent = true;
                        var piece = data.content || '';
                        var current = B.get ('streamingContent') || '';
                        var consumed = consumeStreamingChunk (piece, streamingChunkState);

                        if (consumed.text) current += consumed.text;

                        dale.go (consumed.toolStarts, function (toolStart) {
                           var friendly = toolFriendlyName (toolStart.name || 'tool');
                           var line = '⏳ ' + friendly;
                           current = appendStreamingStatusLine (current, line);
                           if (toolStart.id) streamingToolStatusLines [toolStart.id] = line;
                        });

                        B.call (x, 'set', 'streamingContent', current);
                     }
                     else if (data.type === 'context') {
                        receivedContent = true;
                        B.call (x, 'set', 'contextWindow', data.context);
                     }
                     else if (data.type === 'tool_request') {
                        receivedContent = true;
                        var tool = data.tool || {};
                        var friendly = toolFriendlyName (tool.name || 'tool');
                        var description = ((tool.input || {}).description || '').trim ();
                        var requestLine = '⏳ ' + friendly + (description ? (' — ' + description) : '');
                        if (tool.id) streamingToolDescriptions [tool.id] = description;
                        var currentReq = B.get ('streamingContent') || '';
                        var previousLine = tool.id ? streamingToolStatusLines [tool.id] : null;
                        currentReq = replaceLastStreamingStatusLine (currentReq, previousLine, requestLine);
                        if (tool.id) streamingToolStatusLines [tool.id] = requestLine;
                        B.call (x, 'set', 'streamingContent', currentReq);
                     }
                     else if (data.type === 'tool_result') {
                        receivedContent = true;
                        var tool = data.tool || {};
                        var friendly = toolFriendlyName (tool.name || 'tool');
                        var description = ((streamingToolDescriptions [tool.id] || '') + '').trim ();
                        var resultObj = tool.result || {};
                        var icon = (resultObj.success === false || resultObj.error) ? '✗' : '✓';
                        var resultLine = icon + ' ' + friendly + (description ? (' — ' + description) : '');
                        var currentRes = B.get ('streamingContent') || '';
                        var previousResultLine = tool.id ? streamingToolStatusLines [tool.id] : null;
                        currentRes = replaceLastStreamingStatusLine (currentRes, previousResultLine, resultLine);
                        if (tool.id) streamingToolStatusLines [tool.id] = resultLine;
                        B.call (x, 'set', 'streamingContent', currentRes);
                     }
                     else if (data.type === 'done') {
                        if (data.result && data.result.filename) targetFilename = data.result.filename;
                        if (data.result && data.result.status === 'done') receivedContent = true;
                        var compaction = B.get ('dialog', 'compaction') || {};
                        if (compaction.sourceDialogId === dialogId && data.result && data.result.status === 'done' && ! data.result.interrupted) compactionFollowUp = true;
                     }
                     else if (data.type === 'error') {
                        B.call (x, 'set', ['dialog', 'compaction'], null);
                        B.call (x, 'report', 'error', data.error);
                        if (originalInput) B.call (x, 'set', ['dialog', 'input'], originalInput);
                     }
                  }
                  catch (e) {}
               });

               read ();
            }).catch (function (error) {
               if (error && error.name === 'AbortError') return finalize ();
               B.call (x, 'set', ['dialog', 'compaction'], null);
               B.call (x, 'report', 'error', 'Stream error: ' + error.message);
               if (originalInput) B.call (x, 'set', ['dialog', 'input'], originalInput);
               finalize ();
            });
         }

         read ();
      }).catch (function (error) {
         if (error && error.name === 'AbortError') return finalize ();
         B.call (x, 'set', ['dialog', 'compaction'], null);
         B.call (x, 'report', 'error', 'Stream error: ' + error.message);
         if (originalInput) B.call (x, 'set', ['dialog', 'input'], originalInput);
         finalize ();
      });
   }],


   ['toggle', 'messageToolContent', function (x, key) {
      var current = B.get (['toolMessageExpanded', key]);
      B.call (x, 'set', ['toolMessageExpanded', key], ! current);
   }],

   // Submit tool decisions to PUT /dialog
   ['stop', 'dialog', function (x) {
      var file = B.get ('currentFile');
      var parsed = file && h.parseDialogFilename (file.name);
      if (! parsed) return;

      if (activeDialogStream && activeDialogStream.dialogId === parsed.dialogId) {
         try {activeDialogStream.abort ();} catch (e) {}
         activeDialogStream = null;
      }

      var stopPayload = {dialogId: parsed.dialogId, status: 'done'};
      var stopCsrf = B.get ('cloudCsrf');
      if (stopCsrf) stopPayload.csrf = stopCsrf;
      fetch (projectPath (B.get ('currentProject'), 'dialog'), {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify (stopPayload)
      }).then (function (response) {
         if (! response.ok) return response.text ().then (function (text) {throw new Error (text || ('HTTP ' + response.status));});
         return response.json ().then (function () {
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'streamingContent', '');
            B.call (x, 'set', 'streamingMarkdown', null);
            B.call (x, 'set', 'optimisticUserMessage', null);
            B.call (x, 'set', ['dialog', 'compaction'], null);

            fetch (projectPath (B.get ('currentProject'), 'dialogs')).then (function (rs) {
               if (! rs.ok) return null;
               return rs.json ();
            }).then (function (dialogs) {
               B.call (x, 'load', 'files');
               var found = dale.stopNot (dialogs || [], undefined, function (item) {
                  if (item.dialogId === parsed.dialogId) return item.filename;
               });
               if (found) B.call (x, 'load', 'file', found);
            }).catch (function () {
               B.call (x, 'load', 'files');
            });
         });
      }).catch (function (error) {
         B.call (x, 'report', 'error', 'Failed to stop dialog: ' + error.message);
      });
   }],

   ['keydown', 'chatInput', function (x, ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
         ev.preventDefault ();
         B.call (x, 'send', 'message');
      }
   }],

   ['toggle', 'voice', function (x) {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (! SpeechRecognition) return B.call (x, 'report', 'error', 'Speech recognition is not supported in this browser');

      if (B.get ('dialog', 'voiceActive')) {
         var rec = B.get ('dialog', 'voiceRecognition');
         if (rec) {
            rec.vibeyIntentionalStop = true;
            rec.stop ();
         }
         B.call (x, 'set', ['dialog', 'voiceActive'], false);
         B.call (x, 'set', ['dialog', 'voiceRecognition'], null);
         return;
      }

      var recognition = new SpeechRecognition ();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.vibeyIntentionalStop = false;

      var finalTranscript = '';
      var baseInput = B.get ('dialog', 'input') || '';
      var commandTimer = null;
      var pendingCommand = null; // 'send' or 'stop'

      var VOICE_COMMANDS = [
         {re: /\bsend$/i, action: 'send'},
         {re: /\bstop recording$/i, action: 'stop'}
      ];

      var buildChatInput = function (final, interim) {
         var text = final + interim;
         var separator = baseInput && text ? ' ' : '';
         return baseInput + separator + text;
      };

      var stripCommand = function (text, re) {
         return text.replace (re, '').replace (/\s+$/, '');
      };

      var cancelCommand = function () {
         if (commandTimer) clearTimeout (commandTimer);
         commandTimer = null;
         pendingCommand = null;
      };

      var executeCommand = function (action) {
         cancelCommand ();
         recognition.vibeyIntentionalStop = true;
         // Strip the command phrase from final transcript
         dale.go (VOICE_COMMANDS, function (cmd) {
            if (cmd.action === action) finalTranscript = stripCommand (finalTranscript, cmd.re);
         });
         B.call ('set', ['dialog', 'input'], buildChatInput (finalTranscript, ''));
         recognition.stop ();
         if (action === 'send') {
            setTimeout (function () {
               B.call ('send', 'message');
            }, 50);
         }
      };

      recognition.onresult = function (event) {
         var interim = '';
         for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results [i].isFinal) finalTranscript += event.results [i] [0].transcript;
            else                           interim += event.results [i] [0].transcript;
         }

         // If we had a pending command but new speech arrived, cancel it — the phrase was part of normal speech
         if (pendingCommand) {
            cancelCommand ();
            B.call ('set', ['dialog', 'input'], buildChatInput (finalTranscript, interim));
            return;
         }

         // Check if final transcript ends with a voice command
         var matched = dale.stopNot (VOICE_COMMANDS, undefined, function (cmd) {
            if (cmd.re.test (finalTranscript)) return cmd.action;
         });

         if (matched) {
            pendingCommand = matched;
            commandTimer = setTimeout (function () {
               executeCommand (matched);
            }, 1500);
         }

         B.call ('set', ['dialog', 'input'], buildChatInput (finalTranscript, interim));
      };

      recognition.onend = function () {
         // If a command was pending when recognition ended (e.g. silence triggered onend), execute it
         if (pendingCommand) {
            executeCommand (pendingCommand);
            return;
         }
         // Auto-restart if not intentionally stopped (browser kills recognition on silence)
         if (! recognition.vibeyIntentionalStop) {
            try {
               recognition.start ();
               return;
            }
            catch (e) {}
         }
         B.call ('set', ['dialog', 'voiceActive'], false);
         B.call ('set', ['dialog', 'voiceRecognition'], null);
      };

      recognition.onerror = function (event) {
         cancelCommand ();
         if (event.error !== 'aborted' && event.error !== 'no-speech') B.call ('report', 'error', 'Voice error: ' + event.error);
         B.call ('set', ['dialog', 'voiceActive'], false);
         B.call ('set', ['dialog', 'voiceRecognition'], null);
      };

      recognition.start ();
      B.call (x, 'set', ['dialog', 'voiceRecognition'], recognition);
      B.call (x, 'set', ['dialog', 'voiceActive'], true);
   }],

   ['run', 'tests', function (x) {
      var choice = prompt ('Which suite to run?\nproject\ndialog\ndocs\nuploads\ndialog (safety)\nstatic\nbackend\nvi\nsnapshots\nALL = run everything', 'ALL');
      if (choice === null) return;
      window._vibeyTestFlow = (choice || 'ALL').trim ().toUpperCase ();
      c.loadScript ('test-client.js', function (error) {
         if (error) return B.call (x, 'report', 'error', 'Failed to load test-client.js');
      });
   }],
]);

// *** VIEWS ***

var views = {};

views.files = function () {
   return B.view ([['files'], ['currentFile'], ['loadingFile'], ['savingFile'], ['editorPreview'], ['currentProject'], ['viMode'], ['viState'], ['viCursor'], ['viOverlayEditor'], ['uploads'], ['currentUpload'], ['uploading'], ['viewportPhone'], ['mobileDocsPanel']], function (files, currentFile, loadingFile, savingFile, editorPreview, currentProject, viMode, viState, viCursor, viOverlayEditor, uploads, currentUpload, uploading, viewportPhone, mobileDocsPanel) {
      var docFiles = dale.fil (files || [], undefined, function (name) {
         if (h.isDoc (name)) return name;
      });
      var isDirty = currentFile && currentFile.content !== currentFile.original;
      var hasEmbeds = currentFile && type (currentFile.content) === 'string' && currentFile.content.indexOf ('əəembed') !== -1;
      viMode = !! viMode;
      viState = viState || {};
      viCursor = viCursor || {line: 1, col: 1};
      uploads = uploads || [];
      var selectedUpload = currentUpload;
      if (selectedUpload && ! selectedUpload.url) {
         selectedUpload = dale.stopNot (uploads, undefined, function (item) {
            if (item.name === selectedUpload.name) return item;
         }) || selectedUpload;
      }

      var renderUploadPreview = function (upload) {
         if (! upload) return '';
         var contentType = upload.contentType || '';
         var url = upload.url || '';
         if (url [0] === '/') url = url.slice (1);
         var meta = [
            ['div', {class: 'upload-meta-line'}, ['Name: ', upload.name || '']],
            ['div', {class: 'upload-meta-line'}, ['Type: ', contentType || 'unknown']],
            ['div', {class: 'upload-meta-line'}, ['Size: ', formatBytes (upload.size)]],
            ['div', {class: 'upload-meta-line'}, ['Modified: ', upload.mtime ? new Date (upload.mtime).toLocaleString () : 'unknown']],
            url ? ['div', {class: 'upload-meta-line'}, ['Open: ', ['a', {href: url, target: '_blank'}, url]]] : ''
         ];

         if (contentType.indexOf ('image/') === 0) return ['img', {class: 'upload-media', src: url}];
         if (contentType.indexOf ('audio/') === 0) return ['audio', {class: 'upload-media', src: url, controls: true}];
         if (contentType.indexOf ('video/') === 0) return ['video', {class: 'upload-media', src: url, controls: true}];
         return ['div', {class: 'upload-meta'}, meta];
      };

      var docsList = ['div', {class: 'file-list'}, [
         ['div', {class: 'file-list-header'}, [
            ['span', {class: 'file-list-title'}, 'Docs'],
            ['button', {class: 'primary btn-small', onclick: B.ev ('create', 'file')}, '+ New']
         ]],
         ['div', {class: 'file-list-scroll'}, [
            docFiles && docFiles.length > 0
               ? dale.go (docFiles, function (name) {
                  var isActive = currentFile && currentFile.name === name;
                  return ['div', {
                     class: 'file-item' + (isActive ? ' file-item-active' : ''),
                     onclick: viewportPhone ? B.ev (['load', 'file', name], ['set', 'mobileDocsPanel', null]) : B.ev ('load', 'file', name)
                  }, [
                     ['span', {class: 'file-name'}, docDisplayName (name)],
                     ['span', {
                        class: 'file-delete',
                        onclick: B.ev ('delete', 'file', name, {stopPropagation: true})
                     }, '×']
                  ]];
               })
               : ['div', {style: style ({color: '#666', 'font-size': '13px'})}, 'No docs yet']
         ]],
         ['div', {class: 'upload-section'}, [
            ['div', {class: 'upload-header'}, [
               ['span', {class: 'file-list-title'}, 'Uploads'],
               ['button', {
                  class: 'btn-small' + (uploading ? ' primary' : ''),
                  style: style ({'background-color': uploading ? '#4a69bd' : '#3a3a5f', color: uploading ? 'white' : '#c9d4ff'}),
                  onclick: B.ev ('open', 'uploadPicker'),
                  disabled: uploading
               }, uploading ? 'Uploading...' : 'Upload']
            ]],
            ['input', {id: 'upload-input', type: 'file', multiple: true, style: style ({display: 'none'}), onchange: B.ev ('upload', 'file', {raw: 'event'})}],
            uploads.length
               ? ['div', {class: 'upload-list'}, dale.go (uploads, function (upload) {
                  var isSelected = selectedUpload && selectedUpload.name === upload.name;
                  return ['div', {
                     class: 'upload-item' + (isSelected ? ' upload-item-active' : ''),
                     onclick: viewportPhone ? B.ev (['select', 'upload', upload], ['set', 'mobileDocsPanel', null]) : B.ev ('select', 'upload', upload)
                  }, [
                     ['span', {class: 'upload-name'}, upload.name],
                     ['span', {class: 'upload-size'}, formatBytes (upload.size)]
                  ]];
               })]
               : ['div', {class: 'upload-empty'}, 'No uploads yet']
         ]]
      ]];

      return ['div', {class: 'files-container' + (viewportPhone ? ' files-container-phone' : '')}, [
         viewportPhone ? '' : docsList,
         // Editor
         ['div', {class: 'editor-container'}, currentFile ? [
            ['div', {class: 'editor-header' + (viewportPhone ? ' editor-header-phone' : '')}, [
               ['div', [
                  ['span', {class: 'editor-filename'}, docDisplayName (currentFile.name)],
                  isDirty ? ['span', {class: 'editor-dirty'}, '(unsaved)'] : ''
               ]],
               ['div', {class: 'editor-actions' + (viewportPhone ? ' editor-actions-phone' : '')}, [
                  viewportPhone ? ['button', {
                     class: 'btn-small',
                     onclick: B.ev ('set', 'mobileDocsPanel', 'docs')
                  }, 'Docs'] : '',
                  viewportPhone ? ['button', {
                     class: 'btn-small',
                     onclick: B.ev ('set', 'mobileDocsPanel', 'uploads')
                  }, 'Uploads'] : '',
                  ['label', {class: 'view-edit-switch'}, [
                     ['span', {class: 'switch-mode-label' + (editorPreview ? '' : ' active')}, 'Edit'],
                     ['span', {class: 'switch-control'}, [
                        ['input', {
                           type: 'checkbox',
                           class: 'switch-input',
                           checked: editorPreview,
                           onchange: B.ev ('toggle', 'editorPreview')
                        }],
                        ['span', {class: 'switch-slider'}]
                     ]],
                     ['span', {class: 'switch-mode-label' + (editorPreview ? ' active' : '')}, 'View']
                  ]],
                  ['button', {
                     class: 'primary btn-small',
                     onclick: B.ev ('save', 'file'),
                     disabled: savingFile || ! isDirty
                  }, savingFile ? 'Saving...' : 'Save']
               ]]
            ]],
            editorPreview
               ? ['div', {class: 'editor-preview', opaque: true}, ['LITERAL', renderMarkdownWithEmbeds (currentFile.content, currentProject)]]
               : ['div', {style: style ({display: 'flex', 'flex-direction': 'column', flex: 1, 'min-height': 0})}, [
                  ['div', {class: 'vi-textarea-wrap'}, [
                     ['textarea', {
                        class: 'editor-textarea' + (viMode ? (' vi-active' + (viState.mode === 'insert' ? ' vi-insert' : '')) : ''),
                        readonly: viMode && viState.mode !== 'insert',
                        oninput: viMode
                           ? B.ev (['set', ['currentFile', 'content']], ['vi', 'cursor', {raw: 'event'}])
                           : B.ev ('set', ['currentFile', 'content']),
                        onkeydown: viMode
                           ? B.ev ('vi', 'key', {raw: 'event'})
                           : B.ev ('keydown', 'editor', {raw: 'event'}),
                        onkeyup: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                        onclick: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                        onscroll: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                        onfocus: 'window.keepMobileInputVisible && window.keepMobileInputVisible (this)',
                        value: currentFile.content
                     }, currentFile.content],
                     (viMode && viState.mode !== 'insert' && viOverlayEditor && viOverlayEditor.visible) ? ['div', {
                        class: 'vi-cursor-overlay',
                        style: style ({
                           top: (viOverlayEditor.top || 0) + 'px',
                           left: (viOverlayEditor.left || 0) + 'px',
                           width: (viOverlayEditor.width || 8) + 'px',
                           height: (viOverlayEditor.height || 18) + 'px'
                        })
                     }] : ''
                  ]],
                  viMode ? ['div', {class: 'vi-status'}, [
                     ['span', viState.mode === 'insert'
                        ? '-- INSERT --'
                        : (viState.mode === 'command'
                           ? (viState.commandPrefix || ':') + (viState.pending || '')
                           : (viState.message || ''))],
                     ['span', 'Ln ' + (viCursor.line || 1) + ', Col ' + (viCursor.col || 1)]
                  ]] : ''
               ]]
            , selectedUpload ? ['div', {class: 'upload-preview'}, [
               ['div', {class: 'upload-preview-header'}, selectedUpload.name || 'Upload'],
               renderUploadPreview (selectedUpload)
            ]] : ''
         ] : [
            ['div', {class: 'editor-empty'}, loadingFile ? 'Loading...' : 'Select a doc to edit'],
            viewportPhone ? ['div', {class: 'editor-empty-actions'}, [
               ['button', {class: 'btn-small', onclick: B.ev ('set', 'mobileDocsPanel', 'docs')}, 'Browse docs'],
               ['button', {class: 'btn-small', onclick: B.ev ('set', 'mobileDocsPanel', 'uploads')}, 'Browse uploads']
            ]] : '',
            selectedUpload ? ['div', {class: 'upload-preview'}, [
               ['div', {class: 'upload-preview-header'}, selectedUpload.name || 'Upload'],
               renderUploadPreview (selectedUpload)
            ]] : ''
         ]],
         viewportPhone && mobileDocsPanel ? ['div', {class: 'modal-backdrop docs-sheet-backdrop', onclick: B.ev ('set', 'mobileDocsPanel', null)}, [
            ['div', {class: 'modal-card docs-sheet', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'docs-sheet-header'}, [
                  ['div', {class: 'project-modal-kicker'}, mobileDocsPanel === 'docs' ? 'Docs' : 'Uploads'],
                  ['button', {class: 'btn-small', onclick: B.ev ('set', 'mobileDocsPanel', null)}, 'Close']
               ]],
               mobileDocsPanel === 'docs'
                  ? ['div', {class: 'docs-sheet-body'}, [docsList]]
                  : ['div', {class: 'docs-sheet-body'}, [
                     ['div', {class: 'upload-section upload-section-phone'}, [
                        ['div', {class: 'upload-header'}, [
                           ['span', {class: 'file-list-title'}, 'Uploads'],
                           ['button', {
                              class: 'btn-small' + (uploading ? ' primary' : ''),
                              style: style ({'background-color': uploading ? '#4a69bd' : '#3a3a5f', color: uploading ? 'white' : '#c9d4ff'}),
                              onclick: B.ev ('open', 'uploadPicker'),
                              disabled: uploading
                           }, uploading ? 'Uploading...' : 'Upload']
                        ]],
                        ['input', {id: 'upload-input-phone', type: 'file', multiple: true, style: style ({display: 'none'}), onchange: B.ev ('upload', 'file', {raw: 'event'})}],
                        uploads.length
                           ? ['div', {class: 'upload-list'}, dale.go (uploads, function (upload) {
                              var isSelected = selectedUpload && selectedUpload.name === upload.name;
                              return ['div', {
                                 class: 'upload-item' + (isSelected ? ' upload-item-active' : ''),
                                 onclick: B.ev (['select', 'upload', upload], ['set', 'mobileDocsPanel', null])
                              }, [
                                 ['span', {class: 'upload-name'}, upload.name],
                                 ['span', {class: 'upload-size'}, formatBytes (upload.size)]
                              ]];
                           })]
                           : ['div', {class: 'upload-empty'}, 'No uploads yet']
                     ]]
                  ]]
            ]]
         ]] : ''
      ]];
   });
};

// Parse markdown dialog into messages
var compactLines = function (text, maxLines) {
   text = type (text) === 'string' ? text : '';
   var lines = text.split ('\n');
   if (lines.length <= maxLines) return {text: text, compacted: false};
   return {
      text: lines.slice (0, maxLines).join ('\n') + '\n... [hidden ' + (lines.length - maxLines) + ' lines]',
      compacted: true
   };
};

var wrapLongLines = function (text, maxCol) {
   maxCol = maxCol || 90;
   if (type (text) !== 'string') return text;
   return dale.go (text.split ('\n'), function (line) {
      if (line.length <= maxCol) return line;
      return dale.go (dale.times (Math.ceil (line.length / maxCol), 0), function (k) {
         return line.slice (k * maxCol, (k + 1) * maxCol);
      }).join ('\n');
   }).join ('\n');
};

var formatBytes = function (bytes) {
   bytes = Number (bytes) || 0;
   if (bytes < 1024) return bytes + ' B';
   var units = ['KB', 'MB', 'GB', 'TB'];
   var size = bytes / 1024;
   var idx = 0;
   while (size >= 1024 && idx < units.length - 1) {
      size = size / 1024;
      idx++;
   }
   return (Math.round (size * 10) / 10) + ' ' + units [idx];
};

var normalizeToolPreviewValue = function (value) {
   if (type (value) === 'string') {
      var escaped = value.replace (/\r/g, '').replace (/\n/g, '\\n');
      if (escaped.length > 1200) escaped = escaped.slice (0, 1200) + '... [truncated]';
      return escaped;
   }

   if (type (value) === 'array') {
      return dale.go (value, function (item) {
         return normalizeToolPreviewValue (item);
      });
   }

   if (type (value) === 'object') {
      var out = {};
      dale.go (dale.keys (value), function (key) {
         out [key] = normalizeToolPreviewValue (value [key]);
      });
      return out;
   }

   return value;
};

var previewValueText = function (value) {
   if (type (value) === 'string') return value;
   try {return JSON.stringify (normalizeToolPreviewValue (value));}
   catch (error) {return '' + value;}
};

var toolFriendlyName = function (name) {
   var map = {
      'run_command': 'Run command',
      'write_file': 'Write file',
      'edit_file': 'Edit file',
      'launch_agent': 'Launch agent'
   };
   return map [name] || name;
};

var roleDisplayName = function (role) {
   if (role === 'user') return 'You';
   if (role === 'assistant') return 'Agent';
   if (role === 'tool') return 'Tool';
   return role;
};

var formatToolResultPreview = function (obj, maxStreamLines) {
   if (type (obj) !== 'object' || ! obj) return null;
   if (obj.stdout === undefined && obj.stderr === undefined && obj.success === undefined && obj.message === undefined && obj.error === undefined && obj.launched === undefined) return null;

   var parts = [];

   // Error or message (these are the main feedback lines)
   if (obj.error !== undefined) parts.push ('error: ' + previewValueText (obj.error));
   if (obj.message !== undefined) parts.push (previewValueText (obj.message));

   if (type (obj.launched) === 'object' && obj.launched) {
      var launched = obj.launched;
      var launchSummary = 'launched: ' + (launched.dialogId || '[unknown dialog]');
      var launchDetails = [];
      if (launched.status) launchDetails.push ('status=' + launched.status);
      if (launched.provider) launchDetails.push ('provider=' + launched.provider);
      if (launched.model) launchDetails.push ('model=' + launched.model);
      if (launched.filename) launchDetails.push ('file=' + launched.filename);
      parts.push (launchSummary + (launchDetails.length ? '\n' + launchDetails.join ('\n') : ''));
   }

   // stdout — show content directly, skip if empty
   var stdout = type (obj.stdout) === 'string' ? obj.stdout.replace (/\r/g, '') : '';
   if (stdout) {
      var shown = (maxStreamLines !== null && maxStreamLines !== undefined) ? compactLines (stdout, maxStreamLines).text : stdout;
      parts.push (shown);
   }

   // stderr — only show if non-empty
   var stderr = type (obj.stderr) === 'string' ? obj.stderr.replace (/\r/g, '') : '';
   if (stderr) {
      var stderrShown = (maxStreamLines !== null && maxStreamLines !== undefined) ? compactLines (stderr, maxStreamLines).text : stderr;
      parts.push ('stderr:\n' + stderrShown);
   }

   return parts.join ('\n') || (obj.success ? '(ok)' : '(empty)');
};

// Simple LCS line diff: returns array of '- ...', '+ ...', '  ...' strings
var lineDiff = function (oldLines, newLines) {
   var m = oldLines.length, n = newLines.length;
   // Build LCS table
   var dp = [];
   var i, j;
   for (i = 0; i <= m; i++) {
      dp [i] = [];
      for (j = 0; j <= n; j++) {
         if (i === 0 || j === 0) dp [i] [j] = 0;
         else if (oldLines [i - 1] === newLines [j - 1]) dp [i] [j] = dp [i - 1] [j - 1] + 1;
         else dp [i] [j] = dp [i - 1] [j] > dp [i] [j - 1] ? dp [i - 1] [j] : dp [i] [j - 1];
      }
   }
   // Walk back to produce diff
   var result = [];
   i = m; j = n;
   while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines [i - 1] === newLines [j - 1]) {
         result.push ('  ' + oldLines [i - 1]);
         i--; j--;
      }
      else if (j > 0 && (i === 0 || dp [i] [j - 1] >= dp [i - 1] [j])) {
         result.push ('+ ' + newLines [j - 1]);
         j--;
      }
      else {
         result.push ('- ' + oldLines [i - 1]);
         i--;
      }
   }
   result.reverse ();
   return result;
};

var formatToolInputPreview = function (obj) {
   if (type (obj) !== 'object' || ! obj) return null;
   var keys = dale.keys (obj);
   if (keys.length === 0) return null;

   // run_command: just show the command
   if (obj.command !== undefined && keys.length === 1) return '$ ' + obj.command;

   // write_file: show path + content as green diff lines
   if (obj.path !== undefined && obj.content !== undefined) {
      var content = type (obj.content) === 'string' ? obj.content : '';
      var header = '→ ' + obj.path + ' (' + content.length + ' chars)';
      if (! content) return header;
      var addLines = dale.go (content.split ('\n'), function (l) { return '+ ' + l; });
      return header + '\n' + addLines.join ('\n');
   }

   // edit_file: show path + unified diff via simple LCS
   if (obj.path !== undefined && obj.old_string !== undefined) {
      var oldStr = type (obj.old_string) === 'string' ? obj.old_string : '';
      var newStr = type (obj.new_string) === 'string' ? obj.new_string : '';
      var editHeader = '✎ ' + obj.path;
      var unified = lineDiff (oldStr ? oldStr.split ('\n') : [], newStr ? newStr.split ('\n') : []);
      return editHeader + '\n' + unified.join ('\n');
   }

   // launch_agent: show provider/model and prompt summary
   if (obj.provider !== undefined && obj.prompt !== undefined) {
      var promptPreview = obj.prompt.length > 120 ? obj.prompt.slice (0, 120) + '…' : obj.prompt;
      return '⚡ ' + obj.provider + (obj.model ? '/' + obj.model : '') + (obj.slug ? ' [' + obj.slug + ']' : '') + '\n' + promptPreview;
   }

   return dale.go (keys, function (key) {
      var val = obj [key];
      if (type (val) === 'string') return key + ': ' + (val.length > 200 ? '[' + val.length + ' chars]' : val);
      return key + ': ' + JSON.stringify (val);
   }).join ('\n');
};

var formatIndentedToolPayload = function (payload, compact) {
   var deindented = payload.replace (/^    /gm, '').replace (/\s+$/, '');
   if (! deindented) return payload;

   var preview = deindented;
   try {
      var parsed = JSON.parse (deindented);
      preview = formatToolResultPreview (parsed, compact ? 8 : null) || formatToolInputPreview (parsed) || JSON.stringify (normalizeToolPreviewValue (parsed), null, 2);
   }
   catch (error) {}

   var shown = wrapLongLines (preview, 90);
   shown = compact ? compactLines (shown, 14).text : shown;
   return '    ' + shown.split ('\n').join ('\n    ') + '\n';
};

var decodePartialJsonString = function (text) {
   text = type (text) === 'string' ? text : '';
   return text
      .replace (/\\n/g, '\n')
      .replace (/\\r/g, '\r')
      .replace (/\\t/g, '\t')
      .replace (/\\"/g, '"')
      .replace (/\\\\/g, '\\');
};

var formatPartialToolInputPreview = function (rawName, inputText) {
   rawName = rawName || 'tool';
   inputText = type (inputText) === 'string' ? inputText.trim () : '';
   if (! inputText) return '';

   if (rawName === 'write_file') {
      var pathMatch = inputText.match (/"path"\s*:\s*"((?:\\.|[^"])*)"/);
      var contentMatch = inputText.match (/"content"\s*:\s*"([\s\S]*)$/);
      var path = pathMatch ? decodePartialJsonString (pathMatch [1]) : '';
      var content = contentMatch ? contentMatch [1] : '';
      content = content.replace (/"\s*}?\s*$/, '');
      content = decodePartialJsonString (content);
      if (path || content) {
         var header = '→ ' + (path || '[pending path]') + (content ? ' (' + content.length + ' chars so far)' : '');
         if (! content) return header;
         return header + '\n' + dale.go (content.split ('\n'), function (line) {
            return '+ ' + line;
         }).join ('\n');
      }
   }

   return wrapLongLines (inputText, 90);
};

var formatToolBlocksForMessage = function (text, compact, meta) {
   if (type (text) !== 'string' || text.indexOf ('Tool request:') === -1) return text;

   return text.replace (/---\nTool request:[\s\S]*?(?:\n---(?=\n|$)|$)/g, function (block) {
      var nameMatch = block.match (/^---\nTool request:\s+(\S+)/m);
      var rawName = nameMatch ? nameMatch [1] : 'tool';
      var friendly = toolFriendlyName (rawName);
      if (meta && (rawName === 'edit_file' || rawName === 'write_file')) meta.hasEditFile = true;

      var descMatch = block.match (/^> Description:\s*(.+)$/m);
      var description = descMatch ? descMatch [1].trim () : '';
      var isClosed = /\n---$/.test (block);

      var sections = block.replace (/^---\n/, '');
      if (isClosed) sections = sections.replace (/\n---$/, '');
      var resultSplit = sections.split (/\nResult:\n/);
      var inputSection = resultSplit [0] || '';
      var resultSection = resultSplit [1] || '';

      var inputText = inputSection.replace (/^Tool request:.*\n/, '').replace (/^> Description:.*\n/, '').replace (/^\n/, '').replace (/^ {4}/gm, '').trim ();
      var inputParsed = null;
      try {inputParsed = JSON.parse (inputText);} catch (e) {}

      var resultText = (resultSection || '').replace (/^ {4}/gm, '').trim ();
      var resultParsed = null;
      try {resultParsed = JSON.parse (resultText);} catch (e) {}

      var inputSummary = inputParsed ? (formatToolInputPreview (inputParsed) || JSON.stringify (normalizeToolPreviewValue (inputParsed), null, 2)) : (compact ? '' : formatPartialToolInputPreview (rawName, inputText));
      var resultOutput = '';
      if (resultParsed) resultOutput = formatToolResultPreview (resultParsed) || JSON.stringify (normalizeToolPreviewValue (resultParsed), null, 2);
      else if (resultText) resultOutput = resultText;

      var icon = '⚙';
      if (resultParsed) {
         if (resultParsed.success === false || resultParsed.error) icon = '✗';
         else if (resultParsed.success === true || resultParsed.message || resultParsed.launched) icon = '✓';
      }
      else if (! resultSection) icon = '⏳';

      var header = icon + ' ' + friendly;
      if (description) header += ' — ' + description;
      if (compact) return header;

      var parts = [header];
      if (inputSummary) {
         parts.push ('───input───');
         parts.push (inputSummary);
      }
      if (resultOutput) {
         parts.push ('───output───');
         parts.push (resultOutput);
      }

      return parts.join ('\n');
   });
};

var formatCanonicalToolSection = function (text, compact) {
   if (type (text) !== 'string') return text;

   var toolMatch = text.match (/^>\s*Tool:\s*(.+)$/m);
   var statusMatch = text.match (/^>\s*Status:\s*(.+)$/m);
   var rawName = toolMatch ? toolMatch [1].trim () : 'tool';
   var friendly = toolFriendlyName (rawName);
   var status = statusMatch ? statusMatch [1].trim () : '';

   var blockMatch = text.match (/əəə?([^\n]+)\n([\s\S]*?)\nəəə?/);
   if (! blockMatch) return text;

   var payloadType = (blockMatch [1] || '').trim ();
   var payloadText = (blockMatch [2] || '').trim ();

   var isResult = payloadType.indexOf ('tool/result/') === 0;

   var parsed = null;
   try {parsed = JSON.parse (payloadText);} catch (error) {}

   var icon = '⚙';
   if (isResult) {
      if (status === 'error' || (parsed && parsed.error)) icon = '✗';
      else if (parsed && parsed.success === true) icon = '✓';
      else icon = '↩';
   }

   var header = icon + ' ' + friendly;
   var summary = '';
   if (parsed !== null) {
      if (isResult) summary = formatToolResultPreview (parsed) || JSON.stringify (normalizeToolPreviewValue (parsed), null, 2);
      else summary = formatToolInputPreview (parsed) || JSON.stringify (normalizeToolPreviewValue (parsed), null, 2);
   }
   else {
      summary = payloadText;
   }

   var parts = [header];
   if (summary) {
      if (isResult && compact) {
         var lines = summary.split ('\n');
         if (lines.length > 3) {
            parts.push (lines.slice (0, 3).join ('\n'));
            parts.push ('... [' + (lines.length - 3) + ' more lines]');
         }
         else parts.push (summary);
      }
      else {
         if (isResult) parts.push ('───output───');
         parts.push (summary);
      }
   }

   return parts.join ('\n');
};

var messageToolExpansionKey = function (dialogId, index, content) {
   content = type (content) === 'string' ? content : '';
   var hash = dale.acc (content.split (''), 0, function (h, ch) {
      return ((h * 31) + ch.charCodeAt (0)) >>> 0;
   });
   return 'vibey_toolmsg_v1_' + (dialogId || 'new') + '_' + index + '_' + hash;
};

var getMessageToolContentView = function (content, expanded) {
   var meta = {hasEditFile: false};
   var compact = formatToolBlocksForMessage (content, true, meta);
   var full = formatToolBlocksForMessage (content, false, meta);

   // Canonical tool sections (## Tool Request / ## Tool Result with schwa payloads)
   if (compact === content && full === content && type (content) === 'string' && content.indexOf ('əətool/') !== -1) {
      compact = formatCanonicalToolSection (content, true);
      full = formatCanonicalToolSection (content, false);
   }

   var compactable = compact !== full;
   return {
      text: expanded ? full : compact,
      compactText: compact,
      fullText: full,
      compactable: compactable,
      hasEditFile: meta.hasEditFile
   };
};

var toolContentUsesDiff = function (toolName, content, hasEditFile) {
   if (toolName === 'edit_file' || toolName === 'write_file' || hasEditFile) return true;
   var inferred = toolName || toolNameFromBlock (content || '');
   return inferred === 'edit_file' || inferred === 'write_file';
};

var getStreamingMessageView = function (streamingMarkdown, streamingContent, expanded) {
   var compactText = (stripStreamingMetadataLines (streamingContent || '').trim ()) || 'Thinking…';
   var fullText = compactText;
   var usesDiff = false;

   if (type (streamingMarkdown) === 'string' && streamingMarkdown.trim ()) {
      var messages = parseDialogContent (streamingMarkdown);
      var lastAssistant = dale.stopNot ((messages || []).slice ().reverse (), undefined, function (msg) {
         if (msg && msg.role === 'assistant') return msg;
      });
      if (lastAssistant && type (lastAssistant.content) === 'string' && lastAssistant.content.trim ()) {
         var toolView = getMessageToolContentView (lastAssistant.content, true);
         fullText = toolView.fullText || lastAssistant.content;
         usesDiff = toolContentUsesDiff (lastAssistant.toolName, lastAssistant.content, toolView.hasEditFile);
      }
   }

   return {
      text: expanded ? fullText : compactText,
      compactText: compactText,
      fullText: fullText,
      compactable: compactText !== fullText,
      usesDiff: usesDiff
   };
};

var linkifyTextNodes = function (text) {
   text = type (text) === 'string' ? text : '';
   if (! text) return [];

   var result = [];
   var re = /(\[[^\]]+\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\))|(https?:\/\/[^\s<]+|\/project\/[^\s<]+)/g;
   var lastIndex = 0;
   var match;

   while ((match = re.exec (text))) {
      if (match.index > lastIndex) result.push (['span', text.slice (lastIndex, match.index)]);

      if (match [1]) {
         var md = match [1].match(/^\[([^\]]+)\]\((.+)\)$/);
         var label = md ? md [1] : match [1];
         var href = md ? md [2] : '';
         result.push (['a', {href: href, target: '_blank', rel: 'noopener noreferrer', class: 'chat-link'}, label]);
      }
      else {
         var url = match [3] || match [0];
         result.push (['a', {href: url, target: '_blank', rel: 'noopener noreferrer', class: 'chat-link'}, url]);
      }

      lastIndex = re.lastIndex;
   }

   if (lastIndex < text.length) result.push (['span', text.slice (lastIndex)]);
   return result;
};

var renderChatContent = function (text, project, isDiff) {
   if (type (text) !== 'string' || ! text) return '';

   var labelRe = /^(\s*)(Tool request:|Decision:|Result:|Status:|success:|error:|message:|stderr:)(.*)/;
   // Match tool header lines: ⚙/✓/✗/⏳/↩ followed by tool friendly name
   var toolHeaderRe = /^([⚙✓✗⏳↩]) (.+)$/;
   var toolOutputSepRe = /^───output───$/;
   var result = [];
   var buffer = '';

   var flushBuffer = function () {
      if (buffer) {
         dale.go (linkifyTextNodes (buffer), function (node) { result.push (node); });
         buffer = '';
      }
   };

   var lines = text.split ('\n');
   var inEmbed = false;
   var embedBody = '';

   dale.go (lines, function (line, i) {
      var prefix = i > 0 ? '\n' : '';
      var trimmed = line.trim ();

      // Detect embed block start
      if (! inEmbed && (trimmed === 'əəembed' || trimmed === 'əəəembed')) {
         flushBuffer ();
         inEmbed = true;
         embedBody = '';
         return;
      }

      // Detect embed block end
      if (inEmbed && (trimmed === 'əə' || trimmed === 'əəə')) {
         inEmbed = false;
         var embed = parseEmbedBlock (embedBody);
         if (embed && project) {
            var embedPath = embed.path || '/';
            if (embedPath [0] !== '/') embedPath = '/' + embedPath;
            var src = embed.port === 'static'
               ? 'project/' + encodeURIComponent (project) + '/static' + embedPath
               : 'project/' + encodeURIComponent (project) + '/proxy/' + embed.port + embedPath;
            var portLabel = embed.port === 'static' ? ('static' + embedPath) : (':' + embed.port + embedPath);
            result.push (['div', {class: 'embed-container', opaque: true}, [
               ['div', {class: 'embed-header'}, [
                  ['span', {class: 'embed-title'}, embed.title],
                  ['span', {class: 'embed-port'}, portLabel],
                  ['a', {class: 'embed-open', href: src, target: '_blank', title: 'Open in new tab'}, '↗']
               ]],
               ['iframe', {src: src, style: style ({width: '100%', height: embed.height + 'px', border: 'none', display: 'block', 'background-color': 'white'}), title: embed.title, sandbox: 'allow-scripts allow-forms allow-same-origin'}]
            ]]);
         }
         else {
            result.push (['div', {class: 'embed-error'}, 'Invalid embed block (missing or invalid port)']);
         }
         return;
      }

      // Accumulate embed body
      if (inEmbed) {
         embedBody += (embedBody ? '\n' : '') + line;
         return;
      }

      if (trimmed === '---') {
         flushBuffer ();
         result.push (['hr', {class: 'chat-separator'}]);
         return;
      }

      // Tool header: ⚙ Run command, ✓ Write file, etc.
      var th = trimmed.match (toolHeaderRe);
      if (th) {
         flushBuffer ();
         if (prefix) result.push (['span', prefix]);
         var iconColor = th [1] === '✓' ? '#6ad48a' : (th [1] === '✗' ? '#ff8b94' : (th [1] === '⏳' ? '#e6a817' : '#b07aff'));
         result.push (['span', {class: 'tool-header'}, [
            ['span', {style: style ({color: iconColor, 'margin-right': '0.35em'})}, th [1]],
            ['span', {style: style ({color: '#c9d4ff', 'font-weight': '600'})}, th [2]]
         ]]);
         return;
      }

      // Tool output separator
      if (toolOutputSepRe.test (trimmed)) {
         flushBuffer ();
         if (prefix) result.push (['span', prefix]);
         result.push (['span', {style: style ({color: '#555', 'font-size': '11px'})}, '───']);
         return;
      }

      // "... [N more lines]" hidden-lines hint
      if (/^\.\.\. \[\d+ more lines?\]$/.test (trimmed)) {
         flushBuffer ();
         if (prefix) result.push (['span', prefix]);
         result.push (['span', {style: style ({color: '#666', 'font-style': 'italic', 'font-size': '11px'})}, trimmed]);
         return;
      }

      var m = line.match (labelRe);
      if (m) {
         flushBuffer ();
         if (prefix) result.push (['span', prefix]);
         if (m [1]) result.push (['span', m [1]]);
         result.push (['span', {class: 'chat-label'}, m [2]]);
         if (m [3]) result.push (['span', m [3]]);
         return;
      }

      // Diff lines: - removed (red), + added (green) — only in tool/diff context
      if (isDiff) {
         if (line.length >= 2 && line [0] === '-' && line [1] === ' ') {
            flushBuffer ();
            result.push (['div', {style: style ({color: '#ff8b94', 'background-color': 'rgba(255,70,70,0.12)', 'border-radius': '2px', padding: '0 4px', 'margin-left': '-4px'})}, line]);
            return;
         }
         if (line.length >= 2 && line [0] === '+' && line [1] === ' ') {
            flushBuffer ();
            result.push (['div', {style: style ({color: '#6ad48a', 'background-color': 'rgba(70,255,70,0.12)', 'border-radius': '2px', padding: '0 4px', 'margin-left': '-4px'})}, line]);
            return;
         }
      }

      buffer += prefix + line;
   });

   flushBuffer ();
   return result;
};

var parseDialogContent = function (content) {
   if (! content) return [];

   var parseSection = function (role, lines) {
      var time = null, usage = null, usageCumulative = null, resourcesMs = null, context = null;
      var toolName = null, toolStatus = null, model = null;

      var body = dale.fil (lines, undefined, function (line) {
         var mTime = line.match (/^>\s*Time:\s*(.+)$/);
         if (mTime) {
            time = mTime [1].trim ();
            return;
         }

         var mUsage = line.match (/^>\s*Usage:\s*(\d+)%\s*$/);
         if (mUsage) {
            usage = {percent: Number (mUsage [1])};
            return;
         }

         var mUsageLegacy = line.match (/^>\s*Usage:\s*input=(\d+)\s+output=(\d+)\s+total=(\d+)\s*$/);
         if (mUsageLegacy) {
            usage = {input: Number (mUsageLegacy [1]), output: Number (mUsageLegacy [2]), total: Number (mUsageLegacy [3])};
            return;
         }

         var mUsageCum = line.match (/^>\s*Usage cumulative:\s*input=(\d+)\s+output=(\d+)\s+total=(\d+)\s*$/);
         if (mUsageCum) {
            usageCumulative = {input: Number (mUsageCum [1]), output: Number (mUsageCum [2]), total: Number (mUsageCum [3])};
            return;
         }

         var mContext = line.match (/^>\s*Context:\s*used=(\d+)\s+limit=(\d+)\s+percent=(\d+)%\s*$/);
         if (mContext) {
            context = {used: Number (mContext [1]), limit: Number (mContext [2]), percent: Number (mContext [3])};
            return;
         }

         var mResources = line.match (/^>\s*Resources:\s*.*\bms=(\d+)\b/i);
         if (mResources) {
            resourcesMs = Number (mResources [1]);
            return;
         }

         var mTool = line.match (/^>\s*Tool:\s*(.+)$/);
         if (mTool) {
            toolName = mTool [1].trim ();
            return;
         }

         var mStatus = line.match (/^>\s*Status:\s*(.+)$/);
         if (mStatus) {
            toolStatus = mStatus [1].trim ();
            return;
         }

         var mModel = line.match (/^>\s*Model:\s*(.+)$/);
         if (mModel) {
            model = mModel [1].trim ();
            return;
         }

         // Fallback: never leak raw metadata-looking lines into visible message text,
         // even if spacing/casing drifts and a more specific parser above misses them.
         if (/^>\s*(Id|Parent|Started|Provider|Model|Time|Usage(?: cumulative)?|Context|Resources)\s*:/i.test (line)) return;

         return line;
      });

      var cleaned = body.join ('\n').replace (/^\n+/, '').replace (/\s+$/, '');
      var hasMetadata = !! (time || usage || usageCumulative || context || model || resourcesMs !== null);
      if (! cleaned) {
         // Keep metadata-only assistant sections (common when the assistant only emits
         // tool calls) so time/token/context gauges still render in the dialog UI.
         if (role === 'assistant' && hasMetadata) cleaned = ' ';
         else return null;
      }

      if (role === 'tool') {
         if (toolName) cleaned = '> Tool: ' + toolName + '\n' + cleaned;
         if (toolStatus) cleaned = '> Status: ' + toolStatus + '\n' + cleaned;
      }

      return {
         role: role,
         content: cleaned,
         time: time,
         usage: usage,
         usageCumulative: usageCumulative,
         resourcesMs: resourcesMs,
         context: context,
         toolName: toolName || null,
         model: model || null
      };
   };

   var messages = [];
   var lines = content.split ('\n');
   var currentRole = null;
   var currentLines = [];

   var flush = function () {
      if (! currentRole) return;
      var parsed = parseSection (currentRole, currentLines);
      if (parsed) messages.push (parsed);
   };

   dale.go (lines, function (line) {
      if (line.startsWith ('## User')) {
         flush ();
         currentRole = 'user';
         currentLines = [];
      }
      else if (line.startsWith ('## Assistant')) {
         flush ();
         currentRole = 'assistant';
         currentLines = [];
      }
      else if (line.startsWith ('## Tool Request') || line.startsWith ('## Tool Result')) {
         flush ();
         currentRole = 'tool';
         currentLines = [];
      }
      else if (line.startsWith ('## ')) {
         flush ();
         currentRole = null;
         currentLines = [];
      }
      else if (currentRole) currentLines.push (line);
   });

   flush ();
   return messages;
};

var pad2 = function (n) {return n < 10 ? '0' + n : '' + n;};

var formatLocalDateTimeNoMs = function (iso) {
   if (type (iso) !== 'string') return '';
   var d = new Date (iso.trim ());
   if (isNaN (d.getTime ())) return iso;

   var yyyy = d.getFullYear ();
   var mm = pad2 (d.getMonth () + 1);
   var dd = pad2 (d.getDate ());
   var hh = pad2 (d.getHours ());
   var mi = pad2 (d.getMinutes ());
   var ss = pad2 (d.getSeconds ());

   var now = new Date ();
   var isToday = yyyy === now.getFullYear () && (d.getMonth () === now.getMonth ()) && (d.getDate () === now.getDate ());
   if (isToday) return hh + ':' + mi + ':' + ss;
   return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + mi + ':' + ss;
};

var parseInstantMs = function (value) {
   value = type (value) === 'string' ? value.trim () : '';
   if (! value || value === '...') return null;

   var ms = Date.parse (value);
   if (! isNaN (ms)) return ms;

   if (/^\d{4}\-\d{2}\-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test (value)) {
      ms = Date.parse (value + 'Z');
      if (! isNaN (ms)) return ms;
   }

   return null;
};

var parseTimeOfDayMs = function (value) {
   value = type (value) === 'string' ? value.trim () : '';
   var m = value.match (/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
   if (! m) return null;

   var h = Number (m [1]), mi = Number (m [2]), s = Number (m [3]);
   var frac = m [4] || '0';
   while (frac.length < 3) frac += '0';
   var ms = Number (frac.slice (0, 3));

   if (h > 23 || mi > 59 || s > 59) return null;
   return (((h * 60) + mi) * 60 + s) * 1000 + ms;
};

var parseTimeRange = function (time) {
   if (type (time) !== 'string') return null;

   var normalized = time.trim ().replace (/[–—]/g, '-');
   // Match the last occurrence of " - " to avoid splitting on dashes inside ISO dates
   var idx = normalized.lastIndexOf (' - ');
   if (idx < 1) return null;

   var start = normalized.slice (0, idx).trim ();
   var end = normalized.slice (idx + 3).trim ();

   if (! start || ! end) return null;

   return {
      start: start,
      end: end,
      startMs: parseInstantMs (start),
      endMs: parseInstantMs (end),
      startTodMs: parseTimeOfDayMs (start),
      endTodMs: parseTimeOfDayMs (end)
   };
};

var formatSecondsRounded = function (ms) {
   if (! inc (['integer', 'float'], type (ms)) || ! isFinite (ms) || ms < 0) return null;
   return (Math.round ((ms / 1000) * 10) / 10).toFixed (1) + 's';
};

var formatKTokens = function (tokens) {
   tokens = Number (tokens || 0);
   return (Math.round ((tokens / 1000) * 10) / 10).toFixed (1) + 'k';
};

var formatMessageGauges = function (msg) {
   var timeRange = parseTimeRange (msg.time);
   var hasEnd = timeRange && timeRange.end && timeRange.end !== '...';
   var elapsedMs = null;

   if (hasEnd) {
      if (timeRange.startMs !== null && timeRange.endMs !== null) elapsedMs = timeRange.endMs - timeRange.startMs;
      else if (timeRange.startTodMs !== null && timeRange.endTodMs !== null) {
         elapsedMs = timeRange.endTodMs - timeRange.startTodMs;
         if (elapsedMs < 0) elapsedMs += 24 * 60 * 60 * 1000;
      }
      if ((elapsedMs === null || elapsedMs < 0) && inc (['integer', 'float'], type (msg.resourcesMs)) && isFinite (msg.resourcesMs)) elapsedMs = msg.resourcesMs;
   }

   // Find short model label
   var modelLabel = undefined;
   if (msg.model) {
      var modelOpt = dale.stopNot (MODEL_OPTIONS, undefined, function (opt) {
         if (opt.model === msg.model) return opt;
      });
      modelLabel = modelOpt ? modelOpt.label : msg.model;
   }

   var parts = dale.fil ([
      modelLabel,
      hasEnd ? formatLocalDateTimeNoMs (timeRange.end) : undefined,
      elapsedMs !== null ? formatSecondsRounded (elapsedMs) : undefined,
      msg.usage && msg.usage.percent !== undefined && ! msg.context ? msg.usage.percent + '% used' : undefined
   ], undefined, function (v) { return v; });

   if (msg.context) {
      var pct = msg.context.percent;
      var contextColor = pct >= 80 ? '#e74c3c' : (pct >= 50 ? '#e6a817' : '#999');
      parts.push (['span', {style: style ({color: contextColor, 'font-weight': pct >= 50 ? '600' : 'normal'})}, pct + '% context']);
   }

   if (! parts.length) return '';

   var result = [];
   dale.go (parts, function (part, k) {
      if (k > 0) result.push (' · ');
      result.push (part);
   });
   return result;
};

// Tool requests run automatically (no client-side gating)
views.dialogs = function () {
   return B.view ([['files'], ['currentFile'], ['loadingFile'], ['dialog'], ['streaming'], ['streamingContent'], ['streamingMarkdown'], ['optimisticUserMessage'], ['toolMessageExpanded'], ['currentProject'], ['viMode'], ['viState'], ['viOverlayChat'], ['settings'], ['contextWindow'], ['vibeyingSpin'], ['viewportPhone'], ['mobileDialogsPanel'], ['triggerId']], function (files, currentFile, loadingFile, dialog, streaming, streamingContent, streamingMarkdown, optimisticUserMessage, toolMessageExpanded, currentProject, viMode, viState, viOverlayChat, settings, contextWindow, vibeyingSpin, viewportPhone, mobileDialogsPanel, triggerId) {

      dialog = dialog || {};
      var compaction = dialog.compaction || null;
      var input = dialog.input;
      var model = dialog.model;
      var provider = dialog.provider;
      var voiceActive = dialog.voiceActive;
      var voiceSupported = dialog.voiceSupported;

      var dialogFiles = dale.fil (files, undefined, function (f) {
         if (h.isDialog (f)) return f;
      });

      var currentIsDialog = currentFile && h.isDialog (currentFile.name);
      var currentDialogParsed = currentIsDialog ? (h.parseDialogFilename (currentFile.name) || {}) : {};
      var dialogIsActive = currentIsDialog && currentDialogParsed.status === 'active';
      var effectiveDialogContent = currentIsDialog ? ((streaming && streamingMarkdown) ? streamingMarkdown : currentFile.content) : '';
      var parsedMessages = currentIsDialog ? parseDialogContent (effectiveDialogContent) : [];
      var messages = expandDisplayMessages (parsedMessages);
      var liveStreamingMessage = streaming ? (((streamingContent || '').trim ()) || 'Thinking…') : '';
      var liveRawMessage = null;
      var liveTurnIndex = null;
      if (streaming && parsedMessages.length) {
         for (var lmi = parsedMessages.length - 1; lmi >= 0; lmi--) {
            var candidate = parsedMessages [lmi];
            var candidateRange = candidate && parseTimeRange (candidate.time);
            if (candidate && candidate.role === 'assistant' && candidateRange && candidateRange.end === '...') {
               liveRawMessage = candidate;
               liveTurnIndex = lmi;
               break;
            }
         }
      }
      var visibleMessages = streaming && liveTurnIndex !== null ? dale.fil (messages, undefined, function (msg) {
         if (msg.turnIndex !== liveTurnIndex) return msg;
         if (msg.role === 'tool') return msg;
         var text = type (msg.content) === 'string' ? msg.content.trim () : '';
         if (! text) return;
         if (msg.role === 'assistant' && msg.content.indexOf ('Tool request:') !== -1) return;
         return msg;
      }) : messages;
      var hasVisibleLiveTurnMessages = streaming && liveTurnIndex !== null && dale.stopNot (visibleMessages, undefined, function (msg) {
         if (msg.turnIndex === liveTurnIndex) return true;
      }) === true;
      var showStreamingBubble = !! (streaming && (! hasVisibleLiveTurnMessages || (liveRawMessage && hasOpenToolBlock (liveRawMessage.content || ''))));
      var streamingExpandKey = 'streaming_' + (B.get ('streamingDialogId') || 'current');
      var streamingExpanded = !! ((toolMessageExpanded || {}) [streamingExpandKey]);
      var streamingView = getStreamingMessageView (streamingMarkdown, liveStreamingMessage, streamingExpanded);

      viMode = !! viMode;
      viState = viState || {};
      var noProvider = ! hasAnyProvider (settings);

      var dialogList = ['div', {class: 'file-list'}, [
         ['div', {class: 'file-list-header'}, [
            ['span', {class: 'file-list-title'}, 'Dialogs'],
            ['button', {class: 'primary btn-small', onclick: B.ev ('create', 'dialog'), disabled: noProvider}, '+ New']
         ]],
         dialogFiles && dialogFiles.length > 0
            ? dale.go (dialogFiles, function (name) {
               var isActive = currentFile && currentFile.name === name;
               var parsedDialog = h.parseDialogFilename (name) || {status: null};
               var displayName = h.dialogDisplayLabel (name);
               return ['div', {
                  class: 'file-item' + (isActive ? ' file-item-active' : ''),
                  onclick: viewportPhone ? B.ev (['load', 'file', name], ['set', 'mobileDialogsPanel', null]) : B.ev ('load', 'file', name)
               }, [
                  ['span', {class: 'dialog-name'}, h.statusIcon (parsedDialog.status) + ' ' + displayName],
                  ['span', {
                     class: 'file-delete',
                     onclick: B.ev ('delete', 'file', name, {stopPropagation: true})
                  }, '×']
               ]];
            })
            : ['div', {style: style ({color: '#666', 'font-size': '13px'})}, 'No dialogs yet']
      ]];

      return ['div', {class: 'files-container' + (viewportPhone ? ' files-container-phone' : '')}, [
         viewportPhone ? '' : dialogList,
         // Chat area
         ['div', {class: 'chat-container' + (viewportPhone ? ' chat-container-phone' : '')}, [
            ['div', {class: 'editor-header' + (viewportPhone ? ' editor-header-phone' : '')}, [
               ['span', {class: 'editor-filename'}, currentIsDialog ? (h.statusIcon ((h.parseDialogFilename (currentFile.name) || {}).status) + ' ' + h.dialogDisplayLabel (currentFile.name)) : 'New dialog'],
               ['div', {style: style ({display: 'flex', gap: '0.45rem', 'margin-left': 'auto', 'flex-wrap': 'wrap'})}, [
                  viewportPhone ? ['button', {
                     class: 'btn-small',
                     onclick: B.ev ('set', 'mobileDialogsPanel', 'dialogs')
                  }, 'Dialogs'] : '',
                  currentIsDialog ? ['button', {
                     class: 'btn-small',
                     title: 'Continue in a fresh dialog',
                     onclick: B.ev ('continue', 'freshDialog'),
                     disabled: noProvider || streaming || dialogIsActive || compaction || (input && input.trim ())
                  }, compaction ? 'Compacting...' : 'Fresh'] : '',
                  ['button', {
                     class: 'btn-small',
                     title: 'Previous message',
                     onclick: B.ev ('jump', 'chatMessage', 'prev', {raw: 'event'})
                  }, '↑'],
                  ['button', {
                     class: 'btn-small',
                     title: 'Next message',
                     onclick: B.ev ('jump', 'chatMessage', 'next', {raw: 'event'})
                  }, '↓'],
                  triggerId && triggerId.id ? ['button', {
                     class: 'btn-small',
                     'data-testid': 'trigger-copy-api',
                     title: 'Copy trigger Bearer token for API use',
                     onclick: B.ev ('copy', 'trigger', 'api')
                  }, '⚡ API'] : '',
                  triggerId && triggerId.id && triggerId.domain ? ['button', {
                     class: 'btn-small',
                     'data-testid': 'trigger-copy-email',
                     title: 'Copy trigger email address',
                     onclick: B.ev ('copy', 'trigger', 'email')
                  }, '⚡ Email'] : ''
               ]]
            ]],
            ['div', {class: 'chat-messages', onscroll: B.ev ('track', 'chatScroll', {raw: 'event'})}, [
               visibleMessages.length ? dale.go (visibleMessages, function (msg, msgIndex) {
                  var gauges = formatMessageGauges (msg);
                  var parsed = h.parseDialogFilename ((currentFile || {}).name || '') || {};
                  var expandKey = messageToolExpansionKey (parsed.dialogId, msgIndex, msg.content);
                  var expanded = !! ((toolMessageExpanded || {}) [expandKey]);
                  var toolContentView = getMessageToolContentView (msg.content, expanded);

                  var isTool = msg.role === 'tool';

                  // Format timestamp for role header (user and tool messages)
                  var roleTimestamp = '';
                  if (msg.time) {
                     var tr = parseTimeRange (msg.time);
                     if (tr && tr.end && tr.end !== '...') roleTimestamp = formatLocalDateTimeNoMs (tr.end);
                     else if (tr && tr.start) roleTimestamp = formatLocalDateTimeNoMs (tr.start);
                     else roleTimestamp = formatLocalDateTimeNoMs (msg.time.replace (/ - .*$/, '').trim ());
                  }

                  var roleHeader = ['div', {class: 'chat-role'}, [
                     ['span', roleDisplayName (isTool ? 'assistant' : msg.role)]
                  ]];

                  var isUser = msg.role === 'user';

                  return ['div', {class: 'chat-message chat-' + msg.role}, [
                     roleHeader,
                     ['div', {class: 'chat-content'}, renderChatContent (toolContentView.text, currentProject, msg.toolName === 'edit_file' || msg.toolName === 'write_file' || toolContentView.hasEditFile)],
                     toolContentView.compactable ? ['div', {style: style ({display: 'flex', 'justify-content': 'flex-end', 'margin-top': '0.35rem'})}, [
                        ['button', {
                           class: 'btn-small',
                           style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
                           onclick: B.ev ('toggle', 'messageToolContent', expandKey)
                        }, expanded ? 'Less' : 'More']
                     ]] : '',
                     isUser && roleTimestamp ? ['div', {class: 'chat-meta'}, roleTimestamp] : '',
                     ! isUser && gauges ? ['div', {class: 'chat-meta'}, gauges] : ''
                  ]];
               }) : noProvider
                  ? ['div', {style: style ({color: '#e67e22', 'font-size': '13px', padding: '1rem'})}, [
                     ['span', '⚠ No LLM provider configured. '],
                     ['a', {href: '#/settings', style: style ({color: '#b07aff', 'text-decoration': 'underline', cursor: 'pointer'})}, 'Go to Settings'],
                     ['span', ' to add an API key or log in with OAuth.']
                  ]]
                  : streaming
                     ? ''
                     : ['div', {style: style ({color: '#666', 'font-size': '13px'})}, loadingFile ? 'Loading...' : 'Start typing below to begin a new dialog'],
               optimisticUserMessage ? ['div', {class: 'chat-message chat-user'}, [
                  ['div', {class: 'chat-role'}, ['span', roleDisplayName ('user')]],
                  ['div', {class: 'chat-content'}, optimisticUserMessage],
                  ['div', {class: 'chat-meta'}, formatLocalDateTimeNoMs (new Date ().toISOString ())]
               ]] : '',
               showStreamingBubble ? ['div', {class: 'chat-message chat-assistant'}, [
                  ['div', {class: 'chat-role'}, roleDisplayName ('assistant')],
                  ['div', {class: 'chat-content'}, renderChatContent (streamingView.text + '▊', currentProject, streamingView.usesDiff)],
                  streamingView.compactable ? ['div', {style: style ({display: 'flex', 'justify-content': 'flex-end', 'margin-top': '0.35rem'})}, [
                     ['button', {
                        class: 'btn-small',
                        style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
                        onclick: B.ev ('toggle', 'messageToolContent', streamingExpandKey)
                     }, streamingExpanded ? 'Less' : 'More']
                  ]] : ''
               ]] : ''
            ]],
            // Context window indicator
            (function () {
               // Use live streaming context or last assistant message's context from loaded dialog
               var ctx = contextWindow;
               if (! ctx && messages.length) {
                  for (var ci = messages.length - 1; ci >= 0; ci--) {
                     if (messages [ci].context) {ctx = messages [ci].context; break;}
                  }
               }
               if (! ctx) return '';
               // Recalculate % against the currently selected model
               var selectedModel = model || defaultModelForProvider (provider || 'openai');
               var currentLimit = getContextWindowSize (selectedModel);
               var pct = Math.round (ctx.used / currentLimit * 100);
               var barColor = pct >= 80 ? '#e74c3c' : (pct >= 50 ? '#e6a817' : '#4ec970');
               var textColor = pct >= 80 ? '#e74c3c' : (pct >= 50 ? '#e6a817' : '#999');
               return ['div', {style: style ({padding: '4px 12px', display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', color: textColor})}, [
                  ['div', {style: style ({flex: 1, height: '4px', 'background-color': '#2a2a2a', 'border-radius': '2px', overflow: 'hidden'})}, [
                     ['div', {style: style ({width: Math.min (pct, 100) + '%', height: '100%', 'background-color': barColor, 'border-radius': '2px', transition: 'width 0.3s'})}]
                  ]],
                  ['span', {style: style ({'font-weight': pct >= 50 ? '600' : 'normal', 'white-space': 'nowrap'})}, pct + '% context']
               ]];
            }) (),
            // Vibeying gauge / ready placeholder (keeps input area from jumping)
            ['div', {class: 'vibeying-gauge' + ((streaming || dialogIsActive) ? '' : ' vibeying-gauge-ready')}, [
               ['span', {class: 'vibeying-spinner'}, (streaming || dialogIsActive) ? ['|', '/', '-', '\\'] [vibeyingSpin || 0] : ' '],
               ['span', {class: 'vibeying-label'}, (streaming || dialogIsActive) ? 'Vibeying' : 'Ready'],
               (streaming || dialogIsActive) ? '' : ['span', {class: 'vibeying-cursor'}, '_']
            ]],
            // Input area
            ['div', {class: 'chat-input-area' + (viewportPhone ? ' chat-input-area-phone' : '')}, [
               ['select', {
                  class: 'provider-select',
                  onchange: B.ev ('change', 'chatProviderModel'),
                  disabled: noProvider || streaming || dialogIsActive
               }, (function () {
                  var s = settings || {};
                  var openaiOk  = (s.openai || {}).hasKey || ((s.openaiOAuth || {}).loggedIn && ! (s.openaiOAuth || {}).expired);
                  var claudeOk  = (s.claude || {}).hasKey || ((s.claudeOAuth || {}).loggedIn && ! (s.claudeOAuth || {}).expired);
                  var available = dale.fil (MODEL_OPTIONS, undefined, function (opt) {
                     if (opt.provider === 'openai' && openaiOk) return opt;
                     if (opt.provider === 'claude' && claudeOk) return opt;
                  });
                  if (! available.length) available = MODEL_OPTIONS;
                  var currentKey = (provider || 'openai') + ':' + (model || defaultModelForProvider (provider || 'openai'));
                  return dale.go (available, function (opt) {
                     var key = modelOptionKey (opt);
                     return ['option', {value: key, selected: key === currentKey}, opt.label];
                  });
               }) ()],
               ['div', {class: 'vi-textarea-wrap', style: style ({flex: 1})}, [
                  ['textarea', {
                     class: 'chat-input' + (viMode ? (' vi-active' + (viState.mode === 'insert' ? ' vi-insert' : '')) : ''),
                     rows: 2,
                     value: input || '',
                     placeholder: noProvider ? 'Configure an LLM provider in Settings to start' : 'Type a message... (Cmd+Enter to send)',
                     readonly: viMode && viState.mode !== 'insert',
                     oninput: B.ev ('set', ['dialog', 'input'], {raw: 'this.value'}),
                     onkeydown: viMode
                        ? B.ev ('vi', 'key', {raw: 'event'})
                        : B.ev ('keydown', 'chatInput', {raw: 'event'}),
                     onkeyup: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                     onclick: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                     onscroll: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                     onfocus: 'window.keepMobileInputVisible && window.keepMobileInputVisible (this)',
                     disabled: noProvider || streaming || dialogIsActive
                  }],
                  (viMode && viState.mode !== 'insert' && viOverlayChat && viOverlayChat.visible) ? ['div', {
                     class: 'vi-cursor-overlay',
                     style: style ({
                        top: (viOverlayChat.top || 0) + 'px',
                        left: (viOverlayChat.left || 0) + 'px',
                        width: (viOverlayChat.width || 8) + 'px',
                        height: (viOverlayChat.height || 18) + 'px'
                     })
                  }] : ''
               ]],
               voiceSupported ? ['button', {
                  class: 'btn-small',
                  style: style ({
                     'background-color': voiceActive ? '#e74c3c' : '#3a3a5f',
                     color: 'white',
                     'font-size': '18px',
                     padding: '0.5rem 0.65rem',
                     'border-radius': '8px',
                     transition: 'background-color 0.2s'
                  }),
                  onclick: B.ev ('toggle', 'voice'),
                  disabled: noProvider || streaming || dialogIsActive
               }, voiceActive ? '⏹' : '🎤'] : '',
               ['button', {
                  class: 'primary',
                  onclick: B.ev ('send', 'message'),
                  disabled: noProvider || streaming || dialogIsActive || ! (input && input.trim ())
               }, streaming ? 'Sending...' : 'Send'],
               ((streaming || dialogIsActive) && currentIsDialog) ? ['button', {
                  style: style ({'background-color': '#e67e22', color: 'white'}),
                  onclick: B.ev ('stop', 'dialog')
               }, 'Stop'] : ''
            ]]
         ]],
         viewportPhone && mobileDialogsPanel ? ['div', {class: 'modal-backdrop docs-sheet-backdrop', onclick: B.ev ('set', 'mobileDialogsPanel', null)}, [
            ['div', {class: 'modal-card docs-sheet', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'docs-sheet-header'}, [
                  ['div', {class: 'project-modal-kicker'}, 'Dialogs'],
                  ['button', {class: 'btn-small', onclick: B.ev ('set', 'mobileDialogsPanel', null)}, 'Close']
               ]],
               ['div', {class: 'docs-sheet-body'}, [dialogList]]
            ]]
         ]] : ''
      ]];
   });
};

views.projects = function () {
   return B.view ([['projects'], ['viewportPhone']], function (projects, viewportPhone) {
      return ['div', {class: 'projects-view' + (viewportPhone ? ' projects-view-phone' : '')}, [
         ['div', {class: 'projects-shell'}, [
            ['div', {class: 'projects-header'}, [
               ['div', {class: 'projects-title'}, 'Projects']
            ]],
            ['div', {class: 'projects-new-wrap' + (viewportPhone ? ' projects-new-wrap-phone' : '')}, [
               ['button', {class: 'primary projects-new-button' + (viewportPhone ? ' projects-new-button-phone' : ''), onclick: B.ev ('create', 'project')}, '+ New project']
            ]],
            (projects && projects.length)
               ? ['div', {class: 'projects-list'}, dale.go (projects, function (project) {
                  var slug = type (project) === 'object' ? project.slug : project;
                  var displayName = type (project) === 'object' ? project.name : project;
                  var pcolor = h.projectColor (displayName);
                  return ['div', {
                     class: 'project-card' + (viewportPhone ? ' project-card-phone' : ''),
                     style: style ({'background-color': pcolor.bg, color: pcolor.fg, border: 'none'}),
                     onclick: viewportPhone ? undefined : B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs')
                  }, viewportPhone ? [
                     ['div', {
                        class: 'project-card-main-phone',
                        onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs')
                     }, [
                        ['span', {class: 'project-card-name'}, displayName]
                     ]],
                     ['div', {class: 'project-card-actions-phone'}, [
                        ['button', {
                           class: 'btn-small project-card-open-phone',
                           onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs')
                        }, 'Open'],
                        ['button', {
                           class: 'btn-small project-card-delete-phone',
                           onclick: B.ev ('delete', 'project', slug, {raw: 'event'})
                        }, 'Delete']
                     ]]
                  ] : [
                     ['span', {class: 'project-card-name'}, displayName],
                     ['span', {
                        class: 'project-card-delete',
                        onclick: B.ev ('delete', 'project', slug, {raw: 'event'})
                     }, '×']
                  ]];
               })]
               : ['div', {class: 'projects-empty'}, 'No projects yet']
         ]]
      ]];
   });
};

views.settings = function () {
   return B.view ([['settings'], ['settingsEdits'], ['savingSettings'], ['showApiKeys'], ['oauth'], ['viMode'], ['settingsShowMore'], ['viewportPhone']], function (settingsData, edits, saving, showKeys, oauth, viMode, _showMore, viewportPhone) {
      settingsData = settingsData || {};
      edits = edits || {};
      var openai = settingsData.openai || {};
      var claude = settingsData.claude || {};
      var openaiOAuth = settingsData.openaiOAuth || {};
      var claudeOAuth = settingsData.claudeOAuth || {};
      var settings = settingsData.editor || {};
      oauth = oauth || {};
      var oauthLoading = oauth.loading;
      var oauthStep = oauth.step;
      var oauthCode = oauth.code;
      viMode = !! viMode;

      var sectionTitle = function (title) {
         return ['h3', {style: style ({color: '#94b8ff', 'font-size': '14px', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.75rem', 'margin-top': '1.5rem', 'border-bottom': '1px solid #333', 'padding-bottom': '0.5rem'})}, title];
      };

      var renderApiKeyProvider = function (provider, label, info, editKey) {
         var editing = edits [editKey] !== undefined;
         var currentDisplay = editing ? edits [editKey] : (showKeys ? (info.apiKey || '') : (info.hasKey ? info.apiKey : ''));

         return ['div', {class: 'settings-card' + (viewportPhone ? ' settings-card-phone' : ''), style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1.25rem', 'margin-bottom': '1rem'})}, [
            ['div', {class: viewportPhone ? 'settings-card-header-phone' : '', style: style ({display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '0.75rem'})}, [
               ['span', {style: style ({'font-weight': 'bold', 'font-size': '16px', color: '#94b8ff'})}, label],
               info.hasKey
                  ? ['span', {style: style ({color: '#6ad48a', 'font-size': '12px'})}, '✓ Configured']
                  : ['span', {style: style ({color: '#ff8b94', 'font-size': '12px'})}, '✗ Not set']
            ]],
            ['div', {class: viewportPhone ? 'settings-row-phone' : '', style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center'})}, [
               ['input', {
                  type: showKeys ? 'text' : 'password',
                  value: currentDisplay,
                  placeholder: 'Paste API key here...',
                  oninput: B.ev ('set', ['settingsEdits', editKey], {raw: 'this.value'}),
                  style: style ({
                     flex: 1, padding: '0.6rem', 'border-radius': '6px', border: 'none',
                     'background-color': '#1a1a2e', color: '#eee', 'font-family': 'Monaco, Consolas, monospace', 'font-size': '13px'
                  })
               }]
            ]]
         ]];
      };

      var renderOAuthProvider = function (providerId, label, description, oauthInfo) {
         var isLoading = oauthLoading === providerId;
         var isPasteStep = oauthStep && oauthStep.provider === providerId && oauthStep.flow === 'paste_code';
         var isWaiting = oauthStep && oauthStep.provider === providerId && oauthStep.flow === 'waiting';

         return ['div', {class: 'settings-card' + (viewportPhone ? ' settings-card-phone' : ''), style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1.25rem', 'margin-bottom': '1rem'})}, [
            ['div', {class: viewportPhone ? 'settings-card-header-phone' : '', style: style ({display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '0.5rem'})}, [
               ['div', [
                  ['span', {style: style ({'font-weight': 'bold', 'font-size': '16px', color: '#94b8ff'})}, label],
                  ['div', {style: style ({color: '#9aa4bf', 'font-size': '12px', 'margin-top': '0.25rem'})}, description]
               ]],
               oauthInfo.loggedIn
                  ? ['div', {style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center'})}, [
                     ['span', {style: style ({color: oauthInfo.expired ? '#f0ad4e' : '#6ad48a', 'font-size': '12px'})}, oauthInfo.expired ? '⚠ Token expired' : '✓ Logged in'],
                     ['button', {
                        class: 'btn-small',
                        style: style ({'background-color': '#e74c3c', color: 'white'}),
                        onclick: B.ev ('logout', 'oauth', providerId),
                        disabled: isLoading
                     }, 'Logout']
                  ]]
                  : ['span', {style: style ({color: '#ff8b94', 'font-size': '12px'})}, '✗ Not connected']
            ]],

            // Login button (when not logged in and no step in progress)
            ! oauthInfo.loggedIn && ! isPasteStep && ! isWaiting ? ['div', {style: style ({'margin-top': '0.75rem'})}, [
               ['button', {
                  class: 'primary btn-small',
                  onclick: B.ev ('login', 'oauth', providerId),
                  disabled: isLoading
               }, isLoading ? 'Opening browser...' : 'Login with ' + label]
            ]] : '',

            isPasteStep ? ['div', {style: style ({'margin-top': '0.75rem', 'background-color': '#1a1a2e', padding: '1rem', 'border-radius': '6px'})}, [
               ['div', {style: style ({color: '#f0ad4e', 'font-size': '13px', 'margin-bottom': '0.5rem'})}, providerId === 'openai' ? 'A browser tab opened. After OpenAI redirects to localhost:1455, copy the full URL from the address bar and paste it below.' : 'A browser tab opened. Log in and paste the authorization code below:'],
               ['div', {class: viewportPhone ? 'settings-row-phone' : '', style: style ({display: 'flex', gap: '0.5rem'})}, [
                  ['input', {
                     type: 'text',
                     value: oauthCode || '',
                     placeholder: providerId === 'openai' ? 'Paste the full localhost:1455 callback URL here...' : 'Paste code#state here...',
                     oninput: B.ev ('set', ['oauth', 'code'], {raw: 'this.value'}),
                     style: style ({
                        flex: 1, padding: '0.6rem', 'border-radius': '6px', border: 'none',
                        'background-color': '#2a2a4e', color: '#eee', 'font-family': 'Monaco, Consolas, monospace', 'font-size': '13px'
                     })
                  }],
                  ['button', {
                     class: 'primary btn-small',
                     onclick: B.ev ('complete', 'oauthCallback', providerId, oauthCode || ''),
                     disabled: ! oauthCode || ! oauthCode.trim ()
                  }, 'Submit'],
                  ['button', {
                     class: 'btn-small',
                     style: style ({'background-color': '#444'}),
                     onclick: B.ev (['set', ['oauth', 'step'], null], ['set', ['oauth', 'loading'], null])
                  }, 'Cancel']
               ]]
            ]] : '',

            // OpenAI: waiting for browser callback
            isWaiting ? ['div', {style: style ({'margin-top': '0.75rem', 'background-color': '#1a1a2e', padding: '1rem', 'border-radius': '6px'})}, [
               ['div', {style: style ({color: '#f0ad4e', 'font-size': '13px', 'margin-bottom': '0.5rem'})}, isLoading ? '⏳ Waiting for browser authentication...' : '✓ Authentication complete!'],
               ['div', {style: style ({color: '#9aa4bf', 'font-size': '12px', 'margin-bottom': '0.5rem'})}, 'Complete the login in the browser tab that opened. This page will update automatically.'],
               ['div', {style: style ({display: 'flex', gap: '0.5rem', 'margin-top': '0.5rem'})}, [
                  ['button', {
                     class: 'btn-small',
                     style: style ({'background-color': '#444'}),
                     onclick: B.ev (['set', ['oauth', 'step'], null], ['set', ['oauth', 'loading'], null])
                  }, 'Cancel']
               ]]
            ]] : '',

            // Re-login when expired
            oauthInfo.loggedIn && oauthInfo.expired ? ['div', {style: style ({'margin-top': '0.5rem'})}, [
               ['button', {
                  class: 'primary btn-small',
                  onclick: B.ev ('login', 'oauth', providerId),
                  disabled: isLoading
               }, 'Re-authenticate']
            ]] : ''
         ]];
      };

      var hasEdits = edits.openaiKey !== undefined || edits.claudeKey !== undefined;
      var showMore = B.get ('settingsShowMore');

      return ['div', {class: 'editor-empty'}, [
         ['div', {class: viewportPhone ? 'settings-shell-phone' : '', style: style ({width: '100%', 'max-width': '640px', 'overflow-y': 'auto', 'max-height': 'calc(100vh - 120px)'})}, [
            ['div', {class: 'editor-header' + (viewportPhone ? ' editor-header-phone' : '')}, [
               ['span', {class: 'editor-filename'}, 'Settings']
            ]],

            // *** SUBSCRIPTIONS SECTION (main) ***
            sectionTitle ('Subscriptions'),
            ['p', {style: style ({color: '#9aa4bf', 'font-size': '13px', 'margin-bottom': '1rem'})}, 'Use your existing ChatGPT or Claude subscription. Logs in via OAuth — no API key needed.'],
            renderOAuthProvider ('openai', 'ChatGPT Plus/Pro', 'Use your ChatGPT subscription (Plus, Pro, Team)', openaiOAuth),
            renderOAuthProvider ('claude', 'Claude Pro/Max', 'Use your Anthropic Claude subscription (Pro, Max)', claudeOAuth),

            // *** MORE BUTTON ***
            ['div', {style: style ({'margin-top': '1.5rem', 'text-align': 'center'})}, [
               ['button', {
                  class: 'btn-small',
                  style: style ({'background-color': '#3a3a5f', color: '#c9d4ff', padding: '0.5rem 1.5rem'}),
                  onclick: B.ev ('set', 'settingsShowMore', ! showMore)
               }, showMore ? '▲ Less' : '▼ More']
            ]],

            // *** MORE SECTION (API keys + Editor) ***
            showMore ? ['div', [

               // *** API KEYS ***
               sectionTitle ('API Keys'),
               ['p', {style: style ({color: '#9aa4bf', 'font-size': '13px', 'margin-bottom': '1rem'})}, 'Pay-per-use API access. Keys are stored in secret.json.'],
               ['div', {class: viewportPhone ? 'settings-row-phone settings-actions-phone' : '', style: style ({display: 'flex', gap: '0.5rem', 'margin-bottom': '1rem'})}, [
                  ['button', {
                     class: 'btn-small',
                     style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
                     onclick: B.ev ('set', 'showApiKeys', ! showKeys)
                  }, showKeys ? 'Hide keys' : 'Show keys'],
                  ['button', {
                     class: 'primary btn-small',
                     onclick: B.ev ('save', 'settings'),
                     disabled: saving || ! hasEdits
                  }, saving ? 'Saving...' : 'Save']
               ]],
               renderApiKeyProvider ('openai', 'OpenAI', openai, 'openaiKey'),
               renderApiKeyProvider ('claude', 'Anthropic (Claude)', claude, 'claudeKey'),

               // *** EDITOR ***
               sectionTitle ('Editor'),
               ['div', {class: 'settings-card' + (viewportPhone ? ' settings-card-phone' : ''), style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1rem'})}, [
                  ['label', {class: viewportPhone ? 'settings-row-phone' : '', style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center', color: '#c9d4ff', 'font-size': '13px'})}, [
                     ['input', {
                        type: 'checkbox',
                        checked: viMode,
                        onclick: B.ev ('toggle', 'viMode')
                     }],
                     'Vi mode'
                  ]]
               ]]
            ]] : ''
         ]]
      ]];
   });
};

views.snapshots = function () {
   return B.view ([['snapshots'], ['viewportPhone']], function (snapshots, viewportPhone) {
      snapshots = snapshots || [];

      var formatDate = function (iso) {
         if (type (iso) !== 'string') return '';
         var d = new Date (iso);
         if (isNaN (d.getTime ())) return iso;
         var now = new Date ();
         var isToday = d.getFullYear () === now.getFullYear () && d.getMonth () === now.getMonth () && d.getDate () === now.getDate ();
         var hh = pad2 (d.getHours ()), mi = pad2 (d.getMinutes ()), ss = pad2 (d.getSeconds ());
         if (isToday) return hh + ':' + mi + ':' + ss;
         return d.getFullYear () + '-' + pad2 (d.getMonth () + 1) + '-' + pad2 (d.getDate ()) + ' ' + hh + ':' + mi;
      };

      return ['div', {class: 'editor-empty'}, [
         ['div', {class: viewportPhone ? 'snapshots-shell-phone' : '', style: style ({width: '100%', 'max-width': '800px'})}, [
            ['div', {class: 'editor-header' + (viewportPhone ? ' editor-header-phone' : '')}, [
               ['span', {class: 'editor-filename'}, 'Snapshots'],
            ]],
            snapshots.length > 0
               ? ['div', {class: 'file-list' + (viewportPhone ? ' snapshots-list-phone' : ''), style: style ({width: '100%'})},
                  dale.go (snapshots, function (snap) {
                     var labelText = snap.label ? snap.label : snap.projectName;
                     var meta = formatDate (snap.created) + ' · ' + snap.fileCount + ' files · from ' + snap.projectName;
                     return ['div', {
                        class: 'file-item' + (viewportPhone ? ' snapshot-item-phone' : ''),
                        style: style ({display: 'flex', 'align-items': viewportPhone ? 'stretch' : 'center', gap: '0.75rem', padding: '0.6rem 0.75rem'})
                     }, [
                        ['div', {style: style ({flex: 1, 'min-width': 0})}, [
                           ['div', {style: style ({'font-weight': 'bold', color: '#eee', 'margin-bottom': '0.2rem'})}, labelText],
                           ['div', {style: style ({color: '#9aa4bf', 'font-size': '12px'})}, meta]
                        ]],
                        ['div', {class: viewportPhone ? 'snapshot-actions-phone' : '', style: style ({display: 'flex', gap: '0.35rem', 'flex-shrink': 0, 'flex-wrap': viewportPhone ? 'wrap' : 'nowrap'})}, [
                           ['button', {
                              class: 'primary btn-small',
                              onclick: B.ev ('restore', 'snapshot', snap.id, snap.projectName),
                              title: 'Restore as new project'
                           }, '↻ Restore'],
                           ['button', {
                              class: 'btn-small',
                              style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
                              onclick: B.ev ('download', 'snapshot', snap.id),
                              title: 'Download .tar.gz'
                           }, '⬇ Download'],
                           ['button', {
                              class: 'btn-small',
                              style: style ({'background-color': '#5a2a2a', color: '#ff8b94'}),
                              onclick: B.ev ('delete', 'snapshot', snap.id),
                              title: 'Delete snapshot'
                           }, viewportPhone ? 'Delete' : '×']
                        ]]
                     ]];
                  })
               ]
               : ['div', {style: style ({color: '#888', padding: '2rem', 'text-align': 'center'})}, [
                  ['div', {style: style ({'font-size': '1.5rem', 'margin-bottom': '0.5rem'})}, '📸'],
                  'No snapshots yet. Open a project and click Snapshot to create one.'
               ]]
         ]]
      ]];
   });
};

views.auth = function () {
   return B.view ([['auth', 'page'], ['auth', 'email'], ['auth', 'otp'], ['auth', 'sent'], ['auth', 'signupRequested']], function (page, email, otp, sent, signupRequested) {
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
         signupRequested ? ['div', {style: style ({color: '#6ad48a', 'margin-bottom': '0.75rem'})}, 'Invite requested. If approved, come back here and log in with a code sent to your email.'] : '',
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
         ['button', {class: 'primary', style: style ({width: '100%', 'margin-bottom': '0.75rem'}), onclick: B.ev ('login', [])}, sent ? 'Send another code' : 'Send code'],
         sent ? ['div', [
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
};

views.main = function () {
   return B.view ([['tab'], ['currentProject'], ['settings', 'testButton'], ['projectModal'], ['triggerApiModal'], ['cloudMode'], ['cloudAuth'], ['viewportPhone'], ['mobileMoreMenu']], function (tab, currentProject, testButton, projectModal, triggerApiModal, cloudMode, cloudAuth, viewportPhone, mobileMoreMenu) {
      projectModal = projectModal || {open: false, name: ''};
      triggerApiModal = triggerApiModal || {open: false, endpoint: '', authorization: '', curl: ''};
      var snippetLabelStyle = style ({'font-size': '12px', color: '#9aa4bf', 'margin-bottom': '0.35rem'});
      var snippetBoxStyle = style ({margin: '0 0 0.9rem 0', padding: '0.8rem', 'border-radius': '10px', background: '#0f1720', color: '#d7e3ff', overflow: 'auto', 'white-space': 'pre-wrap', 'word-break': 'break-all'});
      var snippetCurlStyle = style ({margin: 0, padding: '0.8rem', 'border-radius': '10px', background: '#0f1720', color: '#d7e3ff', overflow: 'auto', 'white-space': 'pre-wrap', 'word-break': 'break-word'});
      var renderSnippet = function (title, value, copyLabel, isLast) {
         return ['div', {style: style ({'margin-bottom': isLast ? 0 : '0.9rem'})}, [
            ['div', {style: style ({display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.35rem'})}, [
               ['div', {style: snippetLabelStyle}, title],
               ['button', {class: 'btn-small', onclick: B.ev ('copy', 'text', value, copyLabel)}, 'Copy']
            ]],
            ['pre', {style: isLast ? snippetCurlStyle : snippetBoxStyle}, value]
         ]];
      };
      if (cloudMode && cloudAuth === 'guest') return ['div', {class: 'container'}, [
         ['style', window.vibeyCSS],
         views.auth ()
      ]];

      var content = tab === 'settings' ? views.settings () : (tab === 'snapshots' ? views.snapshots () : (! currentProject || tab === 'projects' ? views.projects () : (tab === 'docs' ? views.files () : views.dialogs ())));
      var title = 'vibey';
      if (tab === 'projects') title = 'Projects';
      if (tab === 'snapshots') title = 'Snapshots';
      if (tab === 'settings') title = 'Settings';
      if (currentProject && tab === 'docs') title = projectDisplayName (currentProject);
      if (currentProject && tab === 'dialogs') title = projectDisplayName (currentProject);

      if (viewportPhone) return ['div', {class: 'container mobile-shell'}, [
         ['style', window.vibeyCSS],
         ['div', {class: 'mobile-topbar'}, [
            ['div', {class: 'mobile-topbar-main'}, [
               ['h1', {class: 'mobile-title', onclick: B.ev ('navigate', 'hash', '#/projects')}, title],
               currentProject && (tab === 'docs' || tab === 'dialogs') ? ['div', {class: 'mobile-subtitle'}, tab === 'docs' ? 'Docs' : 'Dialogs'] : ''
            ]],
            ['div', {class: 'mobile-top-actions'}, [
               currentProject ? ['button', {class: 'btn-small', onclick: B.ev ('create', 'snapshot')}, '📸'] : '',
               ['button', {
                  class: 'btn-small' + (mobileMoreMenu ? ' primary' : ''),
                  onclick: B.ev ('set', 'mobileMoreMenu', ! mobileMoreMenu)
               }, 'More']
            ]]
         ]],
         ['div', {class: 'mobile-content'}, [content]],
         ['div', {class: 'mobile-bottom-nav'}, [
            ['button', {
               class: 'mobile-nav-button' + (tab === 'projects' ? ' mobile-nav-active' : ''),
               onclick: B.ev ('navigate', 'hash', '#/projects')
            }, 'Projects'],
            ['button', {
               class: 'mobile-nav-button' + (tab === 'docs' ? ' mobile-nav-active' : ''),
               onclick: currentProject ? B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/docs') : [],
               disabled: ! currentProject
            }, 'Docs'],
            ['button', {
               class: 'mobile-nav-button' + (tab === 'dialogs' ? ' mobile-nav-active' : ''),
               onclick: currentProject ? B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/dialogs') : [],
               disabled: ! currentProject
            }, 'Dialogs'],
            ['button', {
               class: 'mobile-nav-button' + ((tab === 'settings' || tab === 'snapshots' || mobileMoreMenu) ? ' mobile-nav-active' : ''),
               onclick: B.ev ('set', 'mobileMoreMenu', ! mobileMoreMenu)
            }, 'More']
         ]],
         mobileMoreMenu ? ['div', {class: 'modal-backdrop docs-sheet-backdrop', onclick: B.ev ('set', 'mobileMoreMenu', false)}, [
            ['div', {class: 'modal-card docs-sheet mobile-more-sheet', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'docs-sheet-header'}, [
                  ['div', {class: 'project-modal-kicker'}, 'More'],
                  ['button', {class: 'btn-small', onclick: B.ev ('set', 'mobileMoreMenu', false)}, 'Close']
               ]],
               ['div', {class: 'docs-sheet-body mobile-more-body'}, [
                  ['button', {
                     class: 'btn-small mobile-more-action' + (tab === 'settings' ? ' primary' : ''),
                     onclick: B.ev (['navigate', 'hash', '#/settings'], ['set', 'mobileMoreMenu', false])
                  }, 'Settings'],
                  ['button', {
                     class: 'btn-small mobile-more-action' + (tab === 'snapshots' ? ' primary' : ''),
                     onclick: B.ev (['navigate', 'hash', '#/snapshots'], ['set', 'mobileMoreMenu', false])
                  }, 'Snapshots'],
                  testButton ? ['button', {
                     class: 'btn-small mobile-more-action',
                     style: style ({'background-color': '#2d6a4f', color: '#b7e4c7'}),
                     onclick: B.ev (['run', 'tests'], ['set', 'mobileMoreMenu', false])
                  }, 'Run tests'] : '',
                  cloudMode ? ['button', {
                     class: 'btn-small mobile-more-action',
                     style: style ({'background-color': '#5a2a2a', color: '#ffb3ba'}),
                     onclick: B.ev (['logout', []], ['set', 'mobileMoreMenu', false])
                  }, 'Logout'] : ''
               ]]
            ]]
         ]] : '',
         projectModal.open ? ['div', {class: 'modal-backdrop', onclick: B.ev ('close', 'projectModal')}, [
            ['div', {class: 'modal-card project-modal-card', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'project-modal-kicker'}, 'New project'],
               ['div', {class: 'project-modal-title'}, 'Name your next world'],
               ['div', {class: 'project-modal-subtitle'}, 'Create a project and jump straight into a dialog.'],
               ['input', {
                  class: 'project-modal-input',
                  type: 'text',
                  placeholder: 'I have this idea',
                  value: projectModal.name || '',
                  oninput: B.ev ('set', ['projectModal', 'name']),
                  onkeydown: B.ev ('maybe', 'submitProjectModalOnEnter', {raw: 'event'})
               }],
               ['div', {class: 'modal-actions'}, [
                  ['button', {class: 'btn-small', onclick: B.ev ('close', 'projectModal')}, 'Cancel'],
                  ['button', {class: 'primary', onclick: B.ev ('submit', 'projectModal'), disabled: ! ((projectModal.name || '').trim ())}, 'Create project']
               ]]
            ]]
         ]] : '',
         triggerApiModal.open ? ['div', {class: 'modal-backdrop', onclick: B.ev ('close', 'triggerApiModal')}, [
            ['div', {class: 'modal-card project-modal-card', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'project-modal-kicker'}, 'Trigger API'],
               ['div', {class: 'project-modal-title'}, 'API token copied'],
               ['div', {class: 'project-modal-subtitle'}, 'Use these snippets to fire the project trigger.'],
               renderSnippet ('POST endpoint', triggerApiModal.endpoint, 'Endpoint'),
               renderSnippet ('Authorization header', triggerApiModal.authorization, 'Authorization header'),
               renderSnippet ('curl example', triggerApiModal.curl, 'curl example', true),
               ['div', {class: 'modal-actions'}, [
                  ['button', {class: 'primary', onclick: B.ev ('close', 'triggerApiModal')}, 'Close']
               ]]
            ]]
         ]] : ''
      ]];

      return ['div', {class: 'container'}, [
         ['style', window.vibeyCSS],


         ['div', {class: 'header'}, [
            ['h1', {style: style ({margin: 0, 'font-size': '1.5rem', cursor: 'pointer'}), onclick: B.ev ('navigate', 'hash', '#/projects')}, 'vibey'],
            ['div', {style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center'})}, [
               currentProject ? ['span', {style: style ({color: '#9aa4bf'})}, projectDisplayName (currentProject)] : '',
               currentProject ? ['button', {class: 'btn-small', onclick: B.ev ('create', 'snapshot')}, '📸 Snapshot'] : '',
               ['button', {
                  class: 'btn-small' + (tab === 'projects' ? ' primary' : ''),
                  onclick: B.ev ('navigate', 'hash', '#/projects')
               }, 'Projects'],
               ['button', {
                  class: 'btn-small' + (tab === 'snapshots' ? ' primary' : ''),
                  onclick: B.ev ('navigate', 'hash', '#/snapshots')
               }, 'Snapshots'],
               ['button', {
                  class: 'btn-small' + (tab === 'settings' ? ' primary' : ''),
                  onclick: B.ev ('navigate', 'hash', '#/settings')
               }, 'Settings'],
               cloudMode ? ['button', {
                  class: 'btn-small',
                  onclick: B.ev ('logout', [])
               }, 'Logout'] : '',
               testButton ? ['button', {
                  class: 'btn-small',
                  style: style ({'background-color': '#2d6a4f', color: '#b7e4c7'}),
                  onclick: B.ev ('run', 'tests')
               }, '🧪 Test'] : ''
            ]]
         ]],

         currentProject ? ['div', {class: 'tabs'}, [
            ['button', {
               class: 'tab' + (tab === 'docs' ? ' tab-active' : ''),
               onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/docs')
            }, 'Docs'],
            ['button', {
               class: 'tab' + (tab === 'dialogs' ? ' tab-active' : ''),
               onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/dialogs')
            }, 'Dialogs'],
         ]] : '',

         content,

         projectModal.open ? ['div', {class: 'modal-backdrop', onclick: B.ev ('close', 'projectModal')}, [
            ['div', {class: 'modal-card project-modal-card', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'project-modal-kicker'}, 'New project'],
               ['div', {class: 'project-modal-title'}, 'Name your next world'],
               ['div', {class: 'project-modal-subtitle'}, 'Create a project and jump straight into a dialog.'],
               ['input', {
                  class: 'project-modal-input',
                  type: 'text',
                  placeholder: 'I have this idea',
                  value: projectModal.name || '',
                  oninput: B.ev ('set', ['projectModal', 'name']),
                  onkeydown: B.ev ('maybe', 'submitProjectModalOnEnter', {raw: 'event'})
               }],
               ['div', {class: 'modal-actions'}, [
                  ['button', {class: 'btn-small', onclick: B.ev ('close', 'projectModal')}, 'Cancel'],
                  ['button', {class: 'primary', onclick: B.ev ('submit', 'projectModal'), disabled: ! ((projectModal.name || '').trim ())}, 'Create project']
               ]]
            ]]
         ]] : '',
         triggerApiModal.open ? ['div', {class: 'modal-backdrop', onclick: B.ev ('close', 'triggerApiModal')}, [
            ['div', {class: 'modal-card project-modal-card', onclick: 'event.stopPropagation()'}, [
               ['div', {class: 'project-modal-kicker'}, 'Trigger API'],
               ['div', {class: 'project-modal-title'}, 'API token copied'],
               ['div', {class: 'project-modal-subtitle'}, 'Use these snippets to fire the project trigger.'],
               renderSnippet ('POST endpoint', triggerApiModal.endpoint, 'Endpoint'),
               renderSnippet ('Authorization header', triggerApiModal.authorization, 'Authorization header'),
               renderSnippet ('curl example', triggerApiModal.curl, 'curl example', true),
               ['div', {class: 'modal-actions'}, [
                  ['button', {class: 'primary', onclick: B.ev ('close', 'triggerApiModal')}, 'Close']
               ]]
            ]]
         ]] : ''
      ]];
   });
};

// *** MOUNT ***

window.keepMobileInputVisible = keepMobileInputVisible;

window.addEventListener ('hashchange', function () {
   B.call ('read', 'hash');
   if (B.get ('cloudMode') && B.get ('cloudAuth') === 'guest') return;
   var parsed = readHashTarget ();
   if (parsed.tab === 'projects') B.call ('load', 'projects');
});

window.addEventListener ('resize', function () {
   var next = isPhoneViewport ();
   if (B.get ('viewportPhone') === next) return;
   B.call ('set', 'viewportPhone', next);
});

window.addEventListener ('keydown', function (ev) {
   if (ev.key !== ' ') return;
   if (B.get ('tab') !== 'dialogs') return;
   if (B.get ('dialog', 'voiceActive')) return;
   if (! B.get ('dialog', 'voiceSupported')) return;
   if (B.get ('streaming')) return;

   var tag = (document.activeElement || {}).tagName || '';
   if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

   ev.preventDefault ();
   B.call ('toggle', 'voice');
});

B.call ('initialize', []);
B.mount ('body', views.main);
