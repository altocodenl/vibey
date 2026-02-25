// *** SETUP ***

var B = window.B;

B.prod = true;
B.internal.timeout = 500;

var type = teishi.type;
var inc = teishi.inc;
var style = lith.css.style;

var DOC_DIR = 'doc/';
var DIALOG_DIR = 'dialog/';

var isDialogFile = function (name) {
   return type (name) === 'string' && name.indexOf (DIALOG_DIR) === 0;
};

var isDocFile = function (name) {
   return type (name) === 'string' && name.indexOf (DOC_DIR) === 0;
};

var parseDialogFilename = function (filename) {
   filename = filename || '';

   // New format: dialog/<dialogId>-<status>.md
   if (filename.indexOf (DIALOG_DIR) === 0) {
      var short = filename.slice (DIALOG_DIR.length);
      var match = short.match (/^(.+)\-(active|waiting|done)\.md$/);
      if (! match) return null;
      return {dialogId: match [1], status: match [2]};
   }

   // Legacy format (backward compatibility): dialog-<dialogId>-<status>.md
   var legacy = filename.match (/^dialog\-(.+)\-(active|waiting|done)\.md$/);
   if (! legacy) return null;
   return {dialogId: legacy [1], status: legacy [2]};
};

var statusIcon = function (status) {
   if (status === 'active')  return '🟢';
   if (status === 'waiting') return '🟡';
   if (status === 'done')    return '⚪';
   return '•';
};

var dialogDisplayLabel = function (filename) {
   var parsed = parseDialogFilename (filename);
   if (! parsed) return filename;

   var match = parsed.dialogId.match (/^\d{8}\-\d{6}\-(.+)$/);
   return match ? match [1] : parsed.dialogId;
};

var MODEL_OPTIONS = {
   openai: [
      {value: 'gpt-5', label: 'gpt5.3'},
      {value: 'gpt-4o', label: 'gpt-4o'}
   ],
   claude: [
      {value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514'}
   ]
};

var defaultModelForProvider = function (provider) {
   provider = provider || 'openai';
   var options = MODEL_OPTIONS [provider] || [];
   return options [0] ? options [0].value : '';
};

var normalizeDocFilename = function (name) {
   name = (name || '').trim ();
   if (! name) return '';
   if (name === 'main.md') return DOC_DIR + 'main.md';
   if (name.indexOf (DOC_DIR) === 0) return name;
   return DOC_DIR + name;
};

var docDisplayName = function (name) {
   if (type (name) !== 'string') return name;
   if (name.indexOf (DOC_DIR) === 0) return name.slice (DOC_DIR.length);
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

var EMBED_RE = /əəəembed\n([\s\S]*?)əəə/g;

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
         ? '/project/' + encodeURIComponent (project) + '/static' + embedPath
         : '/project/' + encodeURIComponent (project) + '/proxy/' + embed.port + embedPath;
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

   var parsed = parseDialogFilename (currentFile.name);

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

var projectPath = function (project, tail) {
   return 'project/' + encodeURIComponent (project) + '/' + tail;
};

var isDirtyDoc = function (file) {
   return file && ! isDialogFile (file.name) && file.content !== file.original;
};

var isSameDocTarget = function (parsed, file, currentProject) {
   return parsed && parsed.tab === 'docs' && parsed.target && file && parsed.project === currentProject && normalizeDocFilename (parsed.target) === file.name;
};

var getChatMessagesNode = function () {
   return document.querySelector ('.chat-messages');
};

var isChatNearBottom = function (node) {
   if (! node) return true;
   return (node.scrollHeight - (node.scrollTop + node.clientHeight)) <= 24;
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
         result.cursor = viClamp (afterLine + 1, 0, result.value.length);
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
         if (key === 'a') viController.moveCursor (textarea, viClamp (info.pos + 1, 0, info.text.length));
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
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   if (ev.ctrlKey && (key === 'd' || key === 'u')) {
      var ctrlKey = key === 'd' ? 'ctrl-d' : 'ctrl-u';
      var ctrlPos = viController.motion (ctrlKey, info, textarea);
      viController.moveCursor (textarea, ctrlPos);
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
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'I') {
      var ipos = viController.motion ('0', info, textarea);
      viController.moveCursor (textarea, ipos);
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'a') {
      viController.moveCursor (textarea, viClamp (info.pos + 1, 0, info.text.length));
      result.mode = 'insert';
      result.preventDefault = true;
      return result;
   }

   if (! options.light && key === 'i') {
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
      result.pending = '';
      result.preventDefault = true;
      return result;
   }

   return result;
};

// *** RESPONDERS ***

B.mrespond ([

   // *** SETUP ***

   ['initialize', [], function (x) {
      B.call (x, 'set', 'tab', 'projects');
      B.call (x, 'set', 'chatProvider', 'openai');
      B.call (x, 'set', 'chatModel', 'gpt-5');
      B.call (x, 'set', 'chatInput', '');
      B.call (x, 'set', 'chatAutoStick', true);
      B.call (x, 'set', 'editorPreview', true);
      B.call (x, 'set', 'voiceActive', false);
      B.call (x, 'set', 'voiceSupported', !! (window.SpeechRecognition || window.webkitSpeechRecognition));
      B.call (x, 'set', 'viMode', false);
      B.call (x, 'set', 'viState', {
         mode: 'insert',
         pending: '',
         register: '',
         lastSearch: '',
         message: '',
         commandPrefix: '',
         undoStack: [],
         redoStack: []
      });
      B.call (x, 'set', 'viCursor', {line: 1, col: 1});
      B.call (x, 'load', 'projects');
      B.call (x, 'load', 'settings');
      B.call (x, 'read', 'hash');
   }],

   ['read', 'hash', function (x) {
      var parsed = readHashTarget ();
      var currentFile = B.get ('currentFile');
      var leavingDirtyDoc = isDirtyDoc (currentFile) && ! isSameDocTarget (parsed, currentFile, B.get ('currentProject'));

      var applyParsed = function () {
         B.call (x, 'set', 'tab', parsed.tab);
         if (parsed.tab === 'dialogs') B.call (x, 'reset', 'chatInput');
         if (parsed.tab === 'settings') B.call (x, 'load', 'settings');
         if (parsed.tab === 'snapshots') B.call (x, 'load', 'snapshots');
         B.call (x, 'set', 'currentProject', parsed.project);
         B.call (x, 'set', 'hashTarget', parsed);
         if (! parsed.project || ! parsed.target) B.call (x, 'set', 'currentFile', null);
         if (parsed.project) B.call (x, 'load', 'files', parsed.project);
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
      var leavingDirtyDoc = isDirtyDoc (currentFile) && ! isSameDocTarget (parsed, currentFile, B.get ('currentProject'));

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
            var p = parseDialogFilename (file);
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

   ['reset', 'chatInput', function (x) {
      B.call (x, 'set', 'chatInput', ' ');
      B.call (x, 'set', 'chatInput', '');
   }],

   ['track', 'chatScroll', function (x, ev) {
      var node = ev && ev.target ? ev.target : getChatMessagesNode ();
      B.call (x, 'set', 'chatAutoStick', isChatNearBottom (node));
   }],

   ['maybe', 'autoscrollChat', function (x) {
      if (B.get ('chatAutoStick') === false) return;
      setTimeout (function () {
         var node = getChatMessagesNode ();
         if (! node) return;
         node.scrollTop = node.scrollHeight;
      }, 0);
   }],

   ['change', 'streamingContent', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
   }],

   ['change', 'currentFile', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
   }],




   ['change', 'optimisticUserMessage', {match: B.changeResponder}, function (x) {
      B.call (x, 'maybe', 'autoscrollChat');
   }],

   ['confirm', 'leaveCurrentDoc', function (x, onContinue, onCancel) {
      var currentFile = B.get ('currentFile');
      if (! isDirtyDoc (currentFile)) return onContinue && onContinue ();

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
      c.ajax (x.verb, x.path [0], headers, body, function (error, rs) {
         if (cb) cb (x, error, rs);
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
      var name = prompt ('Project name:');
      if (! name || ! name.trim ()) return;
      B.call (x, 'post', 'projects', {}, {name: name.trim ()}, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create project');
         var slug = rs.body && rs.body.slug ? rs.body.slug : name.trim ();
         B.call (x, 'load', 'projects');
         B.call (x, 'navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs');
      });
   }],

   ['delete', 'project', function (x, name, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation ();
      if (ev && ev.preventDefault) ev.preventDefault ();
      if (! name) return;
      if (! confirm ('Delete project "' + name + '"? This cannot be undone.')) return;

      B.call (x, 'delete', 'projects/' + encodeURIComponent (name), {}, '', function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to delete project');

         var parsedHash = readHashTarget ();
         var deletingCurrent = B.get ('currentProject') === name;
         var deletingFromHash = parsedHash && parsedHash.project === name;

         if (deletingCurrent || deletingFromHash) {
            B.call (x, 'set', 'currentProject', null);
            B.call (x, 'set', 'files', []);
            B.call (x, 'set', 'currentFile', null);
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'streamingContent', '');
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
      B.call (x, 'set', 'oauthLoading', provider);
      B.call (x, 'set', 'oauthStep', null);
      B.call (x, 'post', 'settings/login/' + provider, {}, {}, function (x, error, rs) {
         if (error) {
            B.call (x, 'set', 'oauthLoading', null);
            return B.call (x, 'report', 'error', 'Failed to start login');
         }
         var body = rs.body;
         // Open the auth URL in a new tab
         window.open (body.url, '_blank');

         if (body.flow === 'paste_code') {
            // Anthropic: user must paste code#state
            B.call (x, 'set', 'oauthStep', {provider: provider, flow: 'paste_code', url: body.url});
            B.call (x, 'set', 'oauthLoading', null);
         }
         else {
            // OpenAI: wait for browser callback, then complete
            B.call (x, 'set', 'oauthStep', {provider: provider, flow: 'waiting', url: body.url});
            B.call (x, 'complete', 'oauthCallback', provider, null);
         }
      });
   }],

   ['complete', 'oauthCallback', function (x, provider, manualCode) {
      B.call (x, 'set', 'oauthLoading', provider);
      var body = manualCode ? {code: manualCode} : {};
      B.call (x, 'post', 'settings/login/' + provider + '/callback', {}, body, function (x, error, rs) {
         B.call (x, 'set', 'oauthLoading', null);
         B.call (x, 'set', 'oauthStep', null);
         B.call (x, 'set', 'oauthCode', '');
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
         if (error) return B.call (x, 'report', 'error', 'Failed to load files');
         B.call (x, 'set', 'files', rs.body);
         B.call (x, 'apply', 'hashTarget');

         setTimeout (function () {
            if (B.get ('currentFile')) return;
            var tab = B.get ('tab');
            if (tab !== 'docs' && tab !== 'dialogs') return;
            var hashTarget = B.get ('hashTarget');
            if (hashTarget && hashTarget.target) return;

            var files = rs.body || [];
            var next = null;
            if (tab === 'docs') {
               next = dale.stopNot (files, undefined, function (name) {
                  if (isDocFile (name)) return name;
               });
            }
            else {
               next = dale.stopNot (files, undefined, function (name) {
                  if (isDialogFile (name)) return name;
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

      // This is now an explicit file-load intent; clear any stale hash target
      // so delayed file-list refreshes don't bounce back to an older target.
      B.call (x, 'set', 'hashTarget', null);

      // Protect unsaved local edits from late/background reloads of the same file.
      if (isDirtyDoc (currentFile) && currentFile.name === name) return;

      var proceed = function () {
         B.call (x, 'set', 'loadingFile', true);
         B.call (x, 'get', projectPath (project, 'file/' + encodeURIComponent (name)), {}, '', function (x, error, rs) {
            B.call (x, 'set', 'loadingFile', false);
            if (error) {
               B.call (x, 'set', 'currentFile', null);
               return B.call (x, 'write', 'hash');
            }

            // Prevent late in-flight responses from clobbering unsaved edits.
            var latest = B.get ('currentFile');
            if (isDirtyDoc (latest) && latest.name === rs.body.name) return;

            var dialogFile = isDialogFile (rs.body.name);
            var nextTab = dialogFile ? 'dialogs' : 'docs';
            if (B.get ('tab') !== nextTab) B.call (x, 'set', 'tab', nextTab);
            B.call (x, 'set', 'currentFile', {
               name: rs.body.name,
               content: rs.body.content,
               original: rs.body.content
            });
            B.call (x, 'set', 'viCursor', {line: 1, col: 1});
            if (dialogFile) B.call (x, 'reset', 'chatInput');
            B.call (x, 'write', 'hash');
         });
      };

      if (isDirtyDoc (currentFile) && currentFile.name !== name) {
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

      if (! force && isDirtyDoc (B.get ('currentFile'))) return B.call (x, 'confirm', 'leaveCurrentDoc', proceed);
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

      if (result.mode) B.call (x, 'set', ['viState', 'mode'], result.mode);
      if (result.pending !== undefined) B.call (x, 'set', ['viState', 'pending'], result.pending);
      if (result.register !== undefined) B.call (x, 'set', ['viState', 'register'], result.register);
      if (result.message !== undefined) B.call (x, 'set', ['viState', 'message'], result.message);
      if (result.lastSearch !== undefined) B.call (x, 'set', ['viState', 'lastSearch'], result.lastSearch);
      if (result.commandPrefix !== undefined) B.call (x, 'set', ['viState', 'commandPrefix'], result.commandPrefix);
      if (result.undoStack !== undefined) B.call (x, 'set', ['viState', 'undoStack'], result.undoStack);
      if (result.redoStack !== undefined) B.call (x, 'set', ['viState', 'redoStack'], result.redoStack);

      if (result.value !== undefined) {
         if (isChat) B.call (x, 'set', 'chatInput', result.value);
         else B.call (x, 'set', ['currentFile', 'content'], result.value);
      }

      if (result.cursor !== undefined) {
         var info = viController.cursorInfo (textarea);
         B.call (x, 'set', 'viCursor', {line: info.line + 1, col: info.col + 1});
      }

      if (result.save) B.call (x, 'save', 'file');
      if (result.close) B.call (x, 'close', 'file', !! result.forceClose);
      if (result.send) B.call (x, 'send', 'message');

      if (result.preventDefault) ev.preventDefault ();
   }],

   ['vi', 'cursor', function (x, ev) {
      var textarea = ev.target;
      if (! textarea) return;
      var info = viController.cursorInfo (textarea);
      B.call (x, 'set', 'viCursor', {line: info.line + 1, col: info.col + 1});
   }],

   ['toggle', 'editorPreview', function (x) {
      B.call (x, 'set', 'editorPreview', ! B.get ('editorPreview'));
   }],



   // *** DIALOGS ***

   ['create', 'dialog', function (x) {
      var name = prompt ('Dialog name:');
      if (! name || ! name.trim ()) return;

      var project = B.get ('currentProject');
      if (! project) return;

      var provider = B.get ('chatProvider') || 'openai';
      var model = B.get ('chatModel') || defaultModelForProvider (provider);

      B.call (x, 'post', projectPath (project, 'dialog/new'), {}, {
         provider: provider,
         model: model,
         slug: name.trim ()
      }, function (x, error, rs) {
         if (error) return B.call (x, 'report', 'error', 'Failed to create dialog');

         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'streamingContent', '');
         B.call (x, 'set', 'optimisticUserMessage', null);
         B.call (x, 'set', 'chatInput', '');

         B.call (x, 'load', 'files');
         if (rs && rs.body && rs.body.filename) B.call (x, 'load', 'file', rs.body.filename);
      });
   }],

   ['change', 'chatProvider', function (x, provider) {
      B.call (x, 'set', 'chatProvider', provider);
      var model = B.get ('chatModel');
      var allowed = dale.stopNot ((MODEL_OPTIONS [provider] || []), undefined, function (option) {
         if (option.value === model) return true;
      });
      if (! allowed) B.call (x, 'set', 'chatModel', defaultModelForProvider (provider));
   }],

   ['send', 'message', function (x) {
      var file = B.get ('currentFile');
      var input = B.get ('chatInput');
      var project = B.get ('currentProject');
      if (! project) return;
      var provider = B.get ('chatProvider') || 'openai';
      var model = B.get ('chatModel') || defaultModelForProvider (provider);
      if (! input || ! input.trim ()) return;

      var originalInput = input.trim ();

      B.call (x, 'set', 'streaming', true);
      B.call (x, 'set', 'streamingContent', '');
      B.call (x, 'set', 'optimisticUserMessage', originalInput);
      B.call (x, 'set', 'chatInput', '');
      var inputNode = document.querySelector ('.chat-input');
      if (inputNode) inputNode.value = '';

      var parsed = file && parseDialogFilename (file.name);
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

      fetch (projectPath (project, 'dialog'), {
         method: method,
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify (payload)
      }).then (function (response) {
         B.call (x, 'process', 'stream', response, file ? file.name : null, originalInput);
      }).catch (function (err) {
         B.call (x, 'report', 'error', 'Failed to send: ' + err.message);
         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'optimisticUserMessage', null);
         B.call (x, 'set', 'chatInput', originalInput);
      });
   }],

   // Process stream response (SSE or JSON fallback)
   ['process', 'stream', function (x, response, filename, originalInput) {
      var targetFilename = filename;
      var contentType = (response.headers && response.headers.get ('content-type')) || '';

      var finalize = function () {
         B.call (x, 'set', 'streaming', false);
         B.call (x, 'set', 'optimisticUserMessage', null);
         if (targetFilename) B.call (x, 'load', 'file', targetFilename);
         B.call (x, 'load', 'files');
      };

      if (! response.ok) {
         return response.text ().then (function (text) {
            B.call (x, 'report', 'error', 'Request failed: ' + response.status + ' ' + text);
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'optimisticUserMessage', null);
            if (originalInput) B.call (x, 'set', 'chatInput', originalInput);
         });
      }

      if (contentType.indexOf ('text/event-stream') === -1 || ! response.body) {
         return response.json ().then (function (data) {
            if (data && data.filename) targetFilename = data.filename;
            finalize ();
         }).catch (function () {
            finalize ();
         });
      }

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
                  if (data.type === 'chunk') {
                     var current = B.get ('streamingContent') || '';
                     B.call (x, 'set', 'streamingContent', current + data.content);
                  }
                  else if (data.type === 'done') {
                     if (data.result && data.result.filename) targetFilename = data.result.filename;
                  }
                  else if (data.type === 'error') {
                     B.call (x, 'report', 'error', data.error);
                     B.call (x, 'set', 'streaming', false);
                     B.call (x, 'set', 'optimisticUserMessage', null);
                     if (originalInput) B.call (x, 'set', 'chatInput', originalInput);
                  }
               }
               catch (e) {}
            });

            read ();
         }).catch (function (error) {
            B.call (x, 'report', 'error', 'Stream error: ' + error.message);
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'optimisticUserMessage', null);
            if (originalInput) B.call (x, 'set', 'chatInput', originalInput);
         });
      }

      read ();
   }],


   ['toggle', 'messageToolContent', function (x, key) {
      var current = B.get (['toolMessageExpanded', key]);
      B.call (x, 'set', ['toolMessageExpanded', key], ! current);
   }],

   // Submit tool decisions to PUT /dialog
   ['stop', 'dialog', function (x) {
      var file = B.get ('currentFile');
      var parsed = file && parseDialogFilename (file.name);
      if (! parsed) return;

      fetch (projectPath (B.get ('currentProject'), 'dialog'), {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify ({
            dialogId: parsed.dialogId,
            status: 'waiting'
         })
      }).then (function (response) {
         if (! response.ok) return response.text ().then (function (text) {throw new Error (text || ('HTTP ' + response.status));});
         return response.json ().then (function () {
            B.call (x, 'set', 'streaming', false);
            B.call (x, 'set', 'streamingContent', '');
            B.call (x, 'set', 'optimisticUserMessage', null);

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

      if (B.get ('voiceActive')) {
         var rec = B.get ('voiceRecognition');
         if (rec) {
            rec.vibeyIntentionalStop = true;
            rec.stop ();
         }
         B.call (x, 'set', 'voiceActive', false);
         B.call (x, 'set', 'voiceRecognition', null);
         return;
      }

      var recognition = new SpeechRecognition ();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.vibeyIntentionalStop = false;

      var finalTranscript = '';
      var baseInput = B.get ('chatInput') || '';
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
         B.call ('set', 'chatInput', buildChatInput (finalTranscript, ''));
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
            B.call ('set', 'chatInput', buildChatInput (finalTranscript, interim));
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

         B.call ('set', 'chatInput', buildChatInput (finalTranscript, interim));
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
         B.call ('set', 'voiceActive', false);
         B.call ('set', 'voiceRecognition', null);
      };

      recognition.onerror = function (event) {
         cancelCommand ();
         if (event.error !== 'aborted' && event.error !== 'no-speech') B.call ('report', 'error', 'Voice error: ' + event.error);
         B.call ('set', 'voiceActive', false);
         B.call ('set', 'voiceRecognition', null);
      };

      recognition.start ();
      B.call (x, 'set', 'voiceRecognition', recognition);
      B.call (x, 'set', 'voiceActive', true);
   }],

   ['run', 'tests', function (x) {
      var choice = prompt ('Which flow to run?\n1 = Dialog + tools\n2 = Docs CRUD\n3 = Delete project aborts agents\n4 = Static tictactoe\n5 = Backend tictactoe\n6 = Vi mode\n7 = Snapshots\nALL = run everything', 'ALL');
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
   return B.view ([['files'], ['currentFile'], ['loadingFile'], ['savingFile'], ['editorPreview'], ['currentProject'], ['viMode'], ['viState'], ['viCursor']], function (files, currentFile, loadingFile, savingFile, editorPreview, currentProject, viMode, viState, viCursor) {
      var docFiles = dale.fil (files || [], undefined, function (name) {
         if (isDocFile (name)) return name;
      });
      var isDirty = currentFile && currentFile.content !== currentFile.original;
      var hasEmbeds = currentFile && type (currentFile.content) === 'string' && currentFile.content.indexOf ('əəəembed') !== -1;
      viMode = !! viMode;
      viState = viState || {};
      viCursor = viCursor || {line: 1, col: 1};

      return ['div', {class: 'files-container'}, [
         // File list sidebar
         ['div', {class: 'file-list'}, [
            ['div', {class: 'file-list-header'}, [
               ['span', {class: 'file-list-title'}, 'Docs'],
               ['button', {class: 'primary btn-small', onclick: B.ev ('create', 'file')}, '+ New']
            ]],
            docFiles && docFiles.length > 0
               ? dale.go (docFiles, function (name) {
                  var isActive = currentFile && currentFile.name === name;
                  return ['div', {
                     class: 'file-item' + (isActive ? ' file-item-active' : ''),
                     onclick: B.ev ('load', 'file', name)
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
         // Editor
         ['div', {class: 'editor-container'}, currentFile ? [
            ['div', {class: 'editor-header'}, [
               ['div', [
                  ['span', {class: 'editor-filename'}, docDisplayName (currentFile.name)],
                  isDirty ? ['span', {class: 'editor-dirty'}, '(unsaved)'] : ''
               ]],
               ['div', {class: 'editor-actions'}, [
                  ['button', {
                     class: 'btn-small' + (editorPreview ? ' primary' : ''),
                     style: style ({'background-color': editorPreview ? '#4a69bd' : '#3a3a5f', color: editorPreview ? 'white' : '#c9d4ff'}),
                     onclick: B.ev ('toggle', 'editorPreview')
                  }, editorPreview ? 'Edit' : 'View'],
                  ['button', {
                     class: 'primary btn-small',
                     onclick: B.ev ('save', 'file'),
                     disabled: savingFile || ! isDirty
                  }, savingFile ? 'Saving...' : 'Save'],
                  ['button', {
                     class: 'btn-small',
                     style: style ({'background-color': '#444'}),
                     onclick: B.ev ('close', 'file')
                  }, 'Close']
               ]]
            ]],
            editorPreview
               ? ['div', {class: 'editor-preview', opaque: true}, ['LITERAL', renderMarkdownWithEmbeds (currentFile.content, currentProject)]]
               : ['div', {style: style ({display: 'flex', 'flex-direction': 'column', flex: 1, 'min-height': 0})}, [
                  ['textarea', {
                     class: 'editor-textarea' + (viMode ? ' vi-active' : ''),
                     readonly: viMode && viState.mode !== 'insert',
                     oninput: viMode
                        ? B.ev (['set', ['currentFile', 'content']], ['vi', 'cursor', {raw: 'event'}])
                        : B.ev ('set', ['currentFile', 'content']),
                     onkeydown: viMode
                        ? B.ev ('vi', 'key', {raw: 'event'})
                        : B.ev ('keydown', 'editor', {raw: 'event'}),
                     onkeyup: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                     onclick: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined
                  }, currentFile.content],
                  viMode ? ['div', {class: 'vi-status'}, [
                     ['span', viState.mode === 'insert'
                        ? '-- INSERT --'
                        : (viState.mode === 'command'
                           ? (viState.commandPrefix || ':') + (viState.pending || '')
                           : (viState.message || ''))],
                     ['span', 'Ln ' + (viCursor.line || 1) + ', Col ' + (viCursor.col || 1)]
                  ]] : ''
               ]]
         ] : ['div', {class: 'editor-empty'}, loadingFile ? 'Loading...' : 'Select a doc to edit']]
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

var compactStdStream = function (label, text, maxLines) {
   text = type (text) === 'string' ? text.replace (/\r/g, '') : '';
   var header = label + ' (' + text.length + ' chars)';
   if (! text) return header + '\n  (empty)';

   var shown = (maxLines !== null && maxLines !== undefined) ? compactLines (text, maxLines).text : text;
   return header + '\n  ' + shown.split ('\n').join ('\n  ');
};

var formatToolResultPreview = function (obj, maxStreamLines) {
   if (type (obj) !== 'object' || ! obj) return null;
   if (obj.stdout === undefined && obj.stderr === undefined) return null;

   return dale.fil ([
      obj.success !== undefined ? 'success: ' + (obj.success ? 'true' : 'false') : undefined,
      obj.error   !== undefined ? 'error: '   + previewValueText (obj.error)      : undefined,
      obj.message !== undefined ? 'message: ' + previewValueText (obj.message)    : undefined,
      compactStdStream ('stdout', type (obj.stdout) === 'string' ? obj.stdout : '', maxStreamLines),
      compactStdStream ('stderr', type (obj.stderr) === 'string' ? obj.stderr : '', maxStreamLines)
   ], undefined, function (v) { return v; }).join ('\n\n');
};

var formatToolInputPreview = function (obj) {
   if (type (obj) !== 'object' || ! obj) return null;
   var keys = dale.keys (obj);
   if (keys.length === 0) return null;

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

var formatToolBlocksForMessage = function (text, compact) {
   if (type (text) !== 'string' || text.indexOf ('Tool request:') === -1) return text;

   return text.replace (/---\nTool request:[\s\S]*?\n---/g, function (block) {
      // Strip ugly IDs like [call_zBqRl2oG7ycoRzE4jLG244Of]
      block = block.replace (/^(---\nTool request:\s+\S+)\s+\[[^\]]+\]/m, '$1');
      return block.replace (/\n\n((?: {4}.*(?:\n|$))+)/g, function (full, payload) {
         return '\n\n' + formatIndentedToolPayload (payload, compact !== false);
      });
   });
};

var compactToolBlocksForMessage = function (text) {
   return formatToolBlocksForMessage (text, true);
};

var messageToolExpansionKey = function (dialogId, index, content) {
   content = type (content) === 'string' ? content : '';
   var hash = dale.acc (content.split (''), 0, function (h, ch) {
      return ((h * 31) + ch.charCodeAt (0)) >>> 0;
   });
   return 'vibey_toolmsg_v1_' + (dialogId || 'new') + '_' + index + '_' + hash;
};

var getMessageToolContentView = function (content, expanded) {
   var compact = formatToolBlocksForMessage (content, true);
   var full = formatToolBlocksForMessage (content, false);
   var compactable = compact !== full;
   return {
      text: expanded ? full : compact,
      compactable: compactable
   };
};

var renderChatContent = function (text, project) {
   if (type (text) !== 'string' || ! text) return '';

   var labelRe = /^(\s*)(Tool request:|Decision:|Result:|success:|error:|message:|stdout|stderr)(.*)/;
   var result = [];
   var buffer = '';

   var flushBuffer = function () {
      if (buffer) {
         result.push (['span', buffer]);
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
      if (! inEmbed && trimmed === 'əəəembed') {
         flushBuffer ();
         inEmbed = true;
         embedBody = '';
         return;
      }

      // Detect embed block end
      if (inEmbed && trimmed === 'əəə') {
         inEmbed = false;
         var embed = parseEmbedBlock (embedBody);
         if (embed && project) {
            var embedPath = embed.path || '/';
            if (embedPath [0] !== '/') embedPath = '/' + embedPath;
            var src = embed.port === 'static'
               ? '/project/' + encodeURIComponent (project) + '/static' + embedPath
               : '/project/' + encodeURIComponent (project) + '/proxy/' + embed.port + embedPath;
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

      var m = line.match (labelRe);
      if (m) {
         flushBuffer ();
         if (prefix) result.push (['span', prefix]);
         if (m [1]) result.push (['span', m [1]]);
         result.push (['span', {class: 'chat-label'}, m [2]]);
         if (m [3]) result.push (['span', m [3]]);
         return;
      }

      buffer += prefix + line;
   });

   flushBuffer ();
   return result;
};

var parseDialogContent = function (content) {
   if (! content) return [];

   var parseSection = function (role, lines) {
      var time = null, usage = null, usageCumulative = null, resourcesMs = null;

      var body = dale.fil (lines, undefined, function (line) {
         var mTime = line.match (/^>\s*Time:\s*(.+)$/);
         if (mTime) {
            time = mTime [1].trim ();
            return;
         }

         var mUsage = line.match (/^>\s*Usage:\s*input=(\d+)\s+output=(\d+)\s+total=(\d+)\s*$/);
         if (mUsage) {
            usage = {input: Number (mUsage [1]), output: Number (mUsage [2]), total: Number (mUsage [3])};
            return;
         }

         var mUsageCum = line.match (/^>\s*Usage cumulative:\s*input=(\d+)\s+output=(\d+)\s+total=(\d+)\s*$/);
         if (mUsageCum) {
            usageCumulative = {input: Number (mUsageCum [1]), output: Number (mUsageCum [2]), total: Number (mUsageCum [3])};
            return;
         }

         var mResources = line.match (/^>\s*Resources:\s*.*\bms=(\d+)\b/i);
         if (mResources) {
            resourcesMs = Number (mResources [1]);
            return;
         }

         return line;
      });

      var cleaned = body.join ('\n').replace (/^\n+/, '').replace (/\s+$/, '');
      if (! cleaned) return null;

      return {
         role: role,
         content: cleaned,
         time: time,
         usage: usage,
         usageCumulative: usageCumulative,
         resourcesMs: resourcesMs
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

   return dale.fil ([
      hasEnd ? formatLocalDateTimeNoMs (timeRange.end) : undefined,
      elapsedMs !== null ? formatSecondsRounded (elapsedMs) : undefined,
      msg.usageCumulative ? formatKTokens (msg.usageCumulative.input) + 'ti + ' + formatKTokens (msg.usageCumulative.output) + 'to' : undefined
   ], undefined, function (v) { return v; }).join (' · ');
};

var summarizeToolInput = function (tool, expanded) {
   var input = teishi.copy (tool.input || {});

   if (tool.name === 'write_file' && type (input.content) === 'string') {
      input.content = '[hidden file content: ' + input.content.length + ' chars]';
   }
   if (tool.name === 'edit_file') {
      if (type (input.old_string) === 'string') input.old_string = '[hidden old_string: ' + input.old_string.length + ' chars]';
      if (type (input.new_string) === 'string') input.new_string = '[hidden new_string: ' + input.new_string.length + ' chars]';
   }

   var full = JSON.stringify (input, null, 2);

   var maxChars = 180;
   var maxLines = 6;
   var lines = full.split ('\n');
   var isLong = full.length > maxChars || lines.length > maxLines;

   if (expanded || ! isLong) return {text: full, isLong: isLong};

   var shortLines = lines.slice (0, maxLines).join ('\n');
   if (shortLines.length > maxChars) shortLines = shortLines.slice (0, maxChars);
   shortLines = shortLines.replace (/\s+$/, '') + '\n...';

   return {text: shortLines, isLong: true};
};

var buildEditDiff = function (oldText, newText) {
   oldText = type (oldText) === 'string' ? oldText : '';
   newText = type (newText) === 'string' ? newText : '';

   var a = oldText.split ('\n');
   var b = newText.split ('\n');

   var n = a.length, m = b.length;
   var dp = [];
   for (var i = 0; i <= n; i++) {
      dp [i] = [];
      for (var j = 0; j <= m; j++) dp [i][j] = 0;
   }

   for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
         if (a [i] === b [j]) dp [i][j] = dp [i + 1][j + 1] + 1;
         else dp [i][j] = Math.max (dp [i + 1][j], dp [i][j + 1]);
      }
   }

   var lines = [];
   i = 0; j = 0;
   while (i < n && j < m) {
      if (a [i] === b [j]) {
         lines.push ({type: 'context', text: '  ' + a [i]});
         i++; j++;
      }
      else if (dp [i + 1][j] >= dp [i][j + 1]) {
         lines.push ({type: 'del', text: '- ' + a [i]});
         i++;
      }
      else {
         lines.push ({type: 'add', text: '+ ' + b [j]});
         j++;
      }
   }
   while (i < n) lines.push ({type: 'del', text: '- ' + a [i++]});
   while (j < m) lines.push ({type: 'add', text: '+ ' + b [j++]});

   return lines;
};

var compactDiffLines = function (lines, full, contextLines) {
   contextLines = contextLines || 3;
   if (full) return {lines: lines, compacted: false};

   var include = [];
   for (var i = 0; i < lines.length; i++) include [i] = false;

   var changed = false;
   for (i = 0; i < lines.length; i++) {
      if (lines [i].type === 'add' || lines [i].type === 'del') {
         changed = true;
         var start = Math.max (0, i - contextLines);
         var end = Math.min (lines.length - 1, i + contextLines);
         for (var k = start; k <= end; k++) include [k] = true;
      }
   }

   if (! changed) return {lines: lines.slice (0, Math.min (lines.length, 2 * contextLines + 1)), compacted: lines.length > (2 * contextLines + 1)};

   var out = [];
   var compacted = false;
   i = 0;
   while (i < lines.length) {
      if (include [i]) {
         out.push (lines [i]);
         i++;
         continue;
      }

      var startGap = i;
      while (i < lines.length && ! include [i]) i++;
      var gap = i - startGap;
      if (gap > 0) {
         compacted = true;
         out.push ({type: 'skip', text: '… ' + gap + ' unchanged line' + (gap === 1 ? '' : 's') + ' hidden'});
      }
   }

   return {lines: out, compacted: compacted};
};

var renderEditDiff = function (tool, index) {
   var input = tool.input || {};
   var oldText = type (input.old_string) === 'string' ? input.old_string : '';
   var newText = type (input.new_string) === 'string' ? input.new_string : '';

   var rawLines = buildEditDiff (oldText, newText);
   var compactView = compactDiffLines (rawLines, false, 3);
   var display = tool.diffExpanded === true ? compactDiffLines (rawLines, true, 3) : compactView;

   return ['div', [
      ['div', {class: 'tool-input'}, JSON.stringify ({path: input.path || ''}, null, 2)],
      ['div', {class: 'tool-diff'}, dale.go (display.lines, function (line) {
         var cls = 'tool-diff-line';
         if (line.type === 'add') cls += ' tool-diff-add';
         else if (line.type === 'del') cls += ' tool-diff-del';
         else if (line.type === 'skip') cls += ' tool-diff-skip';
         return ['div', {class: cls}, line.text];
      })],
      compactView.compacted ? ['div', {style: style ({display: 'flex', 'justify-content': 'flex-end', 'margin-bottom': '0.4rem'})}, [
         ['button', {
            class: 'btn-small',
            style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
            onclick: B.ev ('toggle', 'toolDiffExpanded', index),
            disabled: false
         }, tool.diffExpanded === true ? 'Show compact diff' : 'Show full diff']
      ]] : ''
   ]];
};

// Tool requests run automatically (no client-side gating)
views.dialogs = function () {
   return B.view ([['files'], ['currentFile'], ['loadingFile'], ['chatInput'], ['chatProvider'], ['chatModel'], ['streaming'], ['streamingContent'], ['optimisticUserMessage'], ['toolMessageExpanded'], ['voiceActive'], ['voiceSupported'], ['currentProject'], ['viMode'], ['viState']], function (files, currentFile, loadingFile, chatInput, chatProvider, chatModel, streaming, streamingContent, optimisticUserMessage, toolMessageExpanded, voiceActive, voiceSupported, currentProject, viMode, viState) {

      var dialogFiles = dale.fil (files, undefined, function (f) {
         if (isDialogFile (f)) return f;
      });

      var isDialog = currentFile && isDialogFile (currentFile.name);
      var messages = isDialog ? parseDialogContent (currentFile.content) : [];
      viMode = !! viMode;
      viState = viState || {};

      return ['div', {class: 'files-container'}, [
         // Dialog list sidebar
         ['div', {class: 'file-list'}, [
            ['div', {class: 'file-list-header'}, [
               ['span', {class: 'file-list-title'}, 'Dialogs'],
               ['button', {class: 'primary btn-small', onclick: B.ev ('create', 'dialog')}, '+ New']
            ]],
            dialogFiles && dialogFiles.length > 0
               ? dale.go (dialogFiles, function (name) {
                  var isActive = currentFile && currentFile.name === name;
                  var parsedDialog = parseDialogFilename (name) || {status: null};
                  var displayName = dialogDisplayLabel (name);
                  return ['div', {
                     class: 'file-item' + (isActive ? ' file-item-active' : ''),
                     onclick: B.ev ('load', 'file', name)
                  }, [
                     ['span', {class: 'dialog-name'}, statusIcon (parsedDialog.status) + ' ' + displayName],
                     ['span', {
                        class: 'file-delete',
                        onclick: B.ev ('delete', 'file', name, {stopPropagation: true})
                     }, '×']
                  ]];
               })
               : ['div', {style: style ({color: '#666', 'font-size': '13px'})}, 'No dialogs yet']
         ]],
         // Chat area
         ['div', {class: 'chat-container'}, [
            ['div', {class: 'editor-header'}, [
               ['span', {class: 'editor-filename'}, isDialog ? (statusIcon ((parseDialogFilename (currentFile.name) || {}).status) + ' ' + dialogDisplayLabel (currentFile.name)) : 'New dialog'],
               isDialog ? ['button', {
                  class: 'btn-small',
                  style: style ({'background-color': '#444'}),
                  onclick: B.ev ('close', 'file')
               }, 'Close'] : ''
            ]],
            ['div', {class: 'chat-messages', onscroll: B.ev ('track', 'chatScroll', {raw: 'event'})}, [
               messages.length ? dale.go (messages, function (msg, msgIndex) {
                  var gauges = formatMessageGauges (msg);
                  var parsed = parseDialogFilename ((currentFile || {}).name || '') || {};
                  var expandKey = messageToolExpansionKey (parsed.dialogId, msgIndex, msg.content);
                  var expanded = !! ((toolMessageExpanded || {}) [expandKey]);
                  var toolContentView = getMessageToolContentView (msg.content, expanded);

                  return ['div', {class: 'chat-message chat-' + msg.role}, [
                     ['div', {class: 'chat-role'}, ['span', msg.role]],
                     ['div', {class: 'chat-content'}, renderChatContent (toolContentView.text, currentProject)],
                     toolContentView.compactable ? ['div', {style: style ({display: 'flex', 'justify-content': 'flex-end', 'margin-top': '0.35rem'})}, [
                        ['button', {
                           class: 'btn-small',
                           style: style ({'background-color': '#3a3a5f', color: '#c9d4ff'}),
                           onclick: B.ev ('toggle', 'messageToolContent', expandKey)
                        }, expanded ? 'Compress tool output' : 'Expand tool output']
                     ]] : '',
                     gauges ? ['div', {class: 'chat-meta'}, gauges] : ''
                  ]];
               }) : ['div', {style: style ({color: '#666', 'font-size': '13px'})}, loadingFile ? 'Loading...' : 'Start typing below to begin a new dialog'],
               optimisticUserMessage ? ['div', {class: 'chat-message chat-user'}, [
                  ['div', {class: 'chat-role'}, 'user'],
                  ['div', {class: 'chat-content'}, optimisticUserMessage]
               ]] : '',
               streaming && streamingContent ? ['div', {class: 'chat-message chat-assistant'}, [
                  ['div', {class: 'chat-role'}, 'assistant'],
                  ['div', {class: 'chat-content'}, streamingContent + '▊']
               ]] : ''
            ]],
            // Input area
            ['div', {class: 'chat-input-area'}, [
               ['select', {
                  class: 'provider-select',
                  onchange: B.ev ('change', 'chatProvider'),
                  disabled: streaming
               }, [
                  ['option', {value: 'openai', selected: (chatProvider || 'openai') === 'openai'}, 'OpenAI'],
                  ['option', {value: 'claude', selected: chatProvider === 'claude'}, 'Claude']
               ]],
               ['select', {
                  class: 'provider-select',
                  onchange: B.ev ('set', 'chatModel'),
                  disabled: streaming
               }, dale.go (MODEL_OPTIONS [chatProvider || 'openai'] || [], function (option) {
                  return ['option', {value: option.value, selected: (chatModel || defaultModelForProvider (chatProvider || 'openai')) === option.value}, option.label];
               })],
               ['textarea', {
                  class: 'chat-input' + (viMode ? ' vi-active' : ''),
                  rows: 2,
                  value: chatInput || '',
                  placeholder: 'Type a message... (Cmd+Enter to send)',
                  readonly: viMode && viState.mode !== 'insert',
                  oninput: B.ev ('set', 'chatInput'),
                  onkeydown: viMode
                     ? B.ev ('vi', 'key', {raw: 'event'})
                     : B.ev ('keydown', 'chatInput', {raw: 'event'}),
                  onkeyup: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                  onclick: viMode ? B.ev ('vi', 'cursor', {raw: 'event'}) : undefined,
                  disabled: streaming
               }],
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
                  disabled: streaming
               }, voiceActive ? '⏹' : '🎤'] : '',
               ['button', {
                  class: 'primary',
                  onclick: B.ev ('send', 'message'),
                  disabled: streaming || ! (chatInput && chatInput.trim ())
               }, streaming ? 'Sending...' : 'Send'],
               (streaming && isDialog) ? ['button', {
                  style: style ({'background-color': '#e67e22', color: 'white'}),
                  onclick: B.ev ('stop', 'dialog')
               }, 'Stop'] : ''
            ]]
         ]]
      ]];
   });
};

views.projects = function () {
   return B.view ([['projects']], function (projects) {
      return ['div', {class: 'editor-empty'}, [
         ['div', {style: style ({width: '100%', 'max-width': '640px'})}, [
            ['div', {class: 'editor-header'}, [
               ['span', {class: 'editor-filename'}, 'Projects'],
               ['button', {class: 'primary btn-small', onclick: B.ev ('create', 'project')}, '+ New project']
            ]],
            (projects && projects.length)
               ? ['div', {class: 'file-list', style: style ({width: '100%'})}, dale.go (projects, function (project) {
                  var slug = type (project) === 'object' ? project.slug : project;
                  var displayName = type (project) === 'object' ? project.name : project;
                  return ['div', {
                     class: 'file-item',
                     onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (slug) + '/docs')
                  }, [
                     ['span', {class: 'file-name'}, displayName],
                     ['span', {
                        class: 'file-delete',
                        onclick: B.ev ('delete', 'project', slug, {raw: 'event'})
                     }, '×']
                  ]];
               })]
               : ['div', {style: style ({color: '#888'})}, 'No projects yet']
         ]]
      ]];
   });
};

views.settings = function () {
   return B.view ([['settings'], ['settingsEdits'], ['savingSettings'], ['showApiKeys'], ['oauthLoading'], ['oauthStep'], ['oauthCode'], ['viMode']], function (settingsData, edits, saving, showKeys, oauthLoading, oauthStep, oauthCode, viMode) {
      settingsData = settingsData || {};
      edits = edits || {};
      var openai = settingsData.openai || {};
      var claude = settingsData.claude || {};
      var openaiOAuth = settingsData.openaiOAuth || {};
      var claudeOAuth = settingsData.claudeOAuth || {};
      var settings = settingsData.editor || {};
      viMode = !! viMode;

      var sectionTitle = function (title) {
         return ['h3', {style: style ({color: '#94b8ff', 'font-size': '14px', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.75rem', 'margin-top': '1.5rem', 'border-bottom': '1px solid #333', 'padding-bottom': '0.5rem'})}, title];
      };

      var renderApiKeyProvider = function (provider, label, info, editKey) {
         var editing = edits [editKey] !== undefined;
         var currentDisplay = editing ? edits [editKey] : (showKeys ? (info.apiKey || '') : (info.hasKey ? info.apiKey : ''));

         return ['div', {style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1.25rem', 'margin-bottom': '1rem'})}, [
            ['div', {style: style ({display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '0.75rem'})}, [
               ['span', {style: style ({'font-weight': 'bold', 'font-size': '16px', color: '#94b8ff'})}, label],
               info.hasKey
                  ? ['span', {style: style ({color: '#6ad48a', 'font-size': '12px'})}, '✓ Configured']
                  : ['span', {style: style ({color: '#ff8b94', 'font-size': '12px'})}, '✗ Not set']
            ]],
            ['div', {style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center'})}, [
               ['input', {
                  type: showKeys ? 'text' : 'password',
                  value: currentDisplay,
                  placeholder: 'Paste API key here...',
                  oninput: B.ev ('set', ['settingsEdits', editKey]),
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

         return ['div', {style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1.25rem', 'margin-bottom': '1rem'})}, [
            ['div', {style: style ({display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '0.5rem'})}, [
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

            // Anthropic: paste code step
            isPasteStep ? ['div', {style: style ({'margin-top': '0.75rem', 'background-color': '#1a1a2e', padding: '1rem', 'border-radius': '6px'})}, [
               ['div', {style: style ({color: '#f0ad4e', 'font-size': '13px', 'margin-bottom': '0.5rem'})}, 'A browser tab opened. Log in and paste the authorization code below:'],
               ['div', {style: style ({display: 'flex', gap: '0.5rem'})}, [
                  ['input', {
                     type: 'text',
                     value: oauthCode || '',
                     placeholder: 'Paste code#state here...',
                     oninput: B.ev ('set', 'oauthCode'),
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
                     onclick: B.ev (['set', 'oauthStep', null], ['set', 'oauthLoading', null])
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
                     onclick: B.ev (['set', 'oauthStep', null], ['set', 'oauthLoading', null])
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

      return ['div', {class: 'editor-empty'}, [
         ['div', {style: style ({width: '100%', 'max-width': '640px', 'overflow-y': 'auto', 'max-height': 'calc(100vh - 120px)'})}, [
            ['div', {class: 'editor-header'}, [
               ['span', {class: 'editor-filename'}, 'Settings']
            ]],

            // *** API KEYS SECTION ***
            sectionTitle ('API Keys'),
            ['p', {style: style ({color: '#9aa4bf', 'font-size': '13px', 'margin-bottom': '1rem'})}, 'Pay-per-use API access. Keys are stored in secret.json.'],
            ['div', {style: style ({display: 'flex', gap: '0.5rem', 'margin-bottom': '1rem'})}, [
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

            // *** SUBSCRIPTIONS SECTION ***
            sectionTitle ('Subscriptions'),
            ['p', {style: style ({color: '#9aa4bf', 'font-size': '13px', 'margin-bottom': '1rem'})}, 'Use your existing ChatGPT or Claude subscription. Logs in via OAuth — no API key needed.'],
            renderOAuthProvider ('openai', 'ChatGPT Plus/Pro', 'Use your ChatGPT subscription (Plus, Pro, Team)', openaiOAuth),
            renderOAuthProvider ('claude', 'Claude Pro/Max', 'Use your Anthropic Claude subscription (Pro, Max)', claudeOAuth),

            // *** EDITOR SECTION ***
            sectionTitle ('Editor'),
            ['div', {style: style ({'background-color': '#16213e', 'border-radius': '8px', padding: '1rem'})}, [
               ['label', {style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center', color: '#c9d4ff', 'font-size': '13px'})}, [
                  ['input', {
                     type: 'checkbox',
                     checked: viMode,
                     onclick: B.ev ('toggle', 'viMode')
                  }],
                  'Vi mode'
               ]]
            ]]
         ]]
      ]];
   });
};

views.snapshots = function () {
   return B.view ([['snapshots']], function (snapshots) {
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
         ['div', {style: style ({width: '100%', 'max-width': '800px'})}, [
            ['div', {class: 'editor-header'}, [
               ['span', {class: 'editor-filename'}, 'Snapshots'],
            ]],
            snapshots.length > 0
               ? ['div', {class: 'file-list', style: style ({width: '100%'})},
                  dale.go (snapshots, function (snap) {
                     var labelText = snap.label ? snap.label : snap.projectName;
                     var meta = formatDate (snap.created) + ' · ' + snap.fileCount + ' files · from ' + snap.projectName;
                     return ['div', {
                        class: 'file-item',
                        style: style ({display: 'flex', 'align-items': 'center', gap: '0.75rem', padding: '0.6rem 0.75rem'})
                     }, [
                        ['div', {style: style ({flex: 1, 'min-width': 0})}, [
                           ['div', {style: style ({'font-weight': 'bold', color: '#eee', 'margin-bottom': '0.2rem'})}, labelText],
                           ['div', {style: style ({color: '#9aa4bf', 'font-size': '12px'})}, meta]
                        ]],
                        ['div', {style: style ({display: 'flex', gap: '0.35rem', 'flex-shrink': 0})}, [
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
                           }, '×']
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

views.main = function () {
   return B.view ([['tab'], ['currentProject']], function (tab, currentProject) {
      return ['div', {class: 'container'}, [
         ['style', window.vibeyCSS],

         ['div', {class: 'header'}, [
            ['h1', {style: style ({margin: 0, 'font-size': '1.5rem', cursor: 'pointer'}), onclick: B.ev ('navigate', 'hash', '#/projects')}, 'vibey'],
            ['div', {style: style ({display: 'flex', gap: '0.5rem', 'align-items': 'center'})}, [
               currentProject ? ['span', {style: style ({color: '#9aa4bf'})}, currentProject] : '',
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
               ['button', {
                  class: 'btn-small',
                  style: style ({'background-color': '#2d6a4f', color: '#b7e4c7'}),
                  onclick: B.ev ('run', 'tests')
               }, '🧪 Test']
            ]]
         ]],

         currentProject ? ['div', {class: 'tabs'}, [
            ['button', {
               class: 'tab' + (tab === 'dialogs' ? ' tab-active' : ''),
               onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/dialogs')
            }, 'Dialogs'],
            ['button', {
               class: 'tab' + (tab === 'docs' ? ' tab-active' : ''),
               onclick: B.ev ('navigate', 'hash', '#/project/' + encodeURIComponent (currentProject) + '/docs')
            }, 'Docs'],
         ]] : '',

         tab === 'settings' ? views.settings () : (tab === 'snapshots' ? views.snapshots () : (! currentProject || tab === 'projects' ? views.projects () : (tab === 'docs' ? views.files () : views.dialogs ())))
      ]];
   });
};

// *** MOUNT ***

window.addEventListener ('hashchange', function () {
   B.call ('read', 'hash');
});

window.addEventListener ('keydown', function (ev) {
   if (ev.key !== ' ') return;
   if (B.get ('tab') !== 'dialogs') return;
   if (B.get ('voiceActive')) return;
   if (! B.get ('voiceSupported')) return;
   if (B.get ('streaming')) return;

   var tag = (document.activeElement || {}).tagName || '';
   if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

   ev.preventDefault ();
   B.call ('toggle', 'voice');
});

B.call ('initialize', []);
B.mount ('body', views.main);
