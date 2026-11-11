# Client annotated source

The complete source code is contained in `client.js`.

## Setup

The file starts by taking the global gotoB object from `window` and storing it in a short local variable, `B`.

This matches the style used across the ustack: globals exist, but the file quickly creates compact aliases. Right after that, the client enables gotoB production mode and shortens its internal timeout.

- `B.prod = true` disables gotoB's extra validation and safety checks, which keeps the UI faster and quieter
- `B.internal.timeout = 500` allows redraws to take up to 500ms.

```javascript
var B = window.B;
B.prod = true;
B.internal.timeout = 500;
```

We create three short aliases:

- `type`, from `teishi.type`, used throughout the client for type checks.
- `inc`, from `teishi.inc`, used for containment checks.
- `style`, from `lith.css.style`, used to generate inline CSS strings.

Again, the purpose is compression: these helpers appear often enough that repeating their full paths would make the rest of the file heavier.

```javascript
var type = teishi.type;
var inc = teishi.inc;
var style = lith.css.style;
```

## Helpers

The first substantial helper now lives under a small helpers object, `h`.

At the top, the code makes the contract explicit in a very compact way:

- input: a project name, `name`, which is a string.
- output: a color pair object, `{fg, bg}`.

So `h.projectColor(name)` takes a project name and produces a foreground/background pair that the UI can apply directly.

```javascript
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
```

The first half of the function turns the project name into a numeric hash and then maps that hash into an HSL hue.

A few details matter here:

- We iterate each of the characters in `name`.
- `dale.go (dale.times (n, 0), ...)` walks the character positions in data-first style instead of using a `for` loop;
- each step accumulates a small integer hash from one character code;
- `| 0` forces the value back into a 32-bit signed integer;
- the modulo expression normalizes the hue into the `0..359` range, even when the hash is negative.

Saturation and lightness are fixed. Only hue varies. This keeps all project chips in the same visual family while still making them distinct.

The second half of the function computes whether dark text or light text will contrast better with that background.

```javascript
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
   var textColor = luminance > 0.35 ? '#1a1a2e' : '#f5f7ff';
   return {bg: bg, text: textColor};
};
```

The comment explains the intent well: this is an HSL-to-RGB conversion done only so the client can estimate WCAG-style relative luminance.

In other words, the function is not trying to expose color theory as a reusable abstraction. It is doing a concrete job for one UI need: pick a project badge color and make sure the text stays legible.

Right after the color helper, the file defines a short run of helpers for path checks and dialog names.

The first helper answers whether a path belongs to the dialog folder.

```javascript
h.isDialog = function (name) {
   return name.indexOf ('dialog/') === 0;
};
```

The helper is just a prefix check. It does not parse the rest of the filename.

The second helper does the same for docs.

```javascript
h.isDoc = function (name) {
   return name.indexOf ('doc/') === 0;
};
```

Again, this is only a folder check.

The next helper answers whether the current file is a dirty doc.

```javascript
h.isDirtyDoc = function (file) {
   return file && ! h.isDialog (file.name) && file.content !== file.original;
};
```

This expression packs three checks together:

- there is an open file;
- it is not a dialog;
- its current content differs from the original loaded content.

The next helper compares a parsed hash target against the open file.

```javascript
h.isSameDocTarget = function (parsed, file, currentProject) {
   return parsed && parsed.tab === 'docs' && parsed.target && file && parsed.project === currentProject && normalizeDocFilename (parsed.target) === file.name;
};
```

This is used to decide whether navigating to a hash target would actually leave the current doc.

We now get the first denser helper in the block: dialog filename parsing.

```javascript
h.parseDialogFilename = function (filename) {
   filename = filename || '';
   if (filename.indexOf ('dialog/') !== 0) return null;
```

The first line normalizes falsy input into the empty string.

The second line enforces the folder layout. If the path does not begin with `dialog/`, the helper stops immediately.

```javascript
   var short = filename.slice ('dialog/'.length);
   var match = short.match (/^(.+)\-(active|done)\.md$/);
   if (! match) return null;
   return {dialogId: match [1], status: match [2]};
};
```

If the prefix is correct, the helper removes it and parses the rest of the filename.

The regex says that a dialog filename is:

- some dialog id;
- a dash;
- either `active` or `done`;
- the `.md` suffix.

If the regex matches, the helper returns an object with `dialogId` and `status`. Otherwise it returns `null`.

Once status is available, the next helper maps it to a marker.

```javascript
h.statusIcon = function (status) {
   if (status === 'active')  return '🟣';
   if (status === 'done')    return '🟢';
   return '•';
};
```

This keeps display logic simple: active dialogs get a purple dot, finished dialogs a green dot, and everything else a neutral bullet.

The next helper turns a full filename into a shorter label.

```javascript
h.dialogDisplayLabel = function (filename) {
   var parsed = h.parseDialogFilename (filename);
   if (! parsed) return filename;
```

It starts by parsing the filename. If parsing fails, it gives up and returns the original filename unchanged.

```javascript
   var match = parsed.dialogId.match (/^\d{8}\-\d{6}\-(.+)$/);
   return match ? match [1] : parsed.dialogId;
};
```

If parsing succeeds, the helper tries to strip a timestamp prefix from `dialogId`.

The regex expects:

- eight digits;
- a dash;
- six digits;
- another dash;
- then the human slug.

If that pattern matches, only the slug is returned. Otherwise, the full `dialogId` is returned.

The last helper builds a default slug for a fresh continuation dialog.

```javascript
h.freshDialogSlug = function (filename) {
   var base = h.dialogDisplayLabel (filename || '') || 'dialog';
   return base + '-fresh';
};
```

It first derives a display label. If that yields an empty value, it falls back to `dialog`. Then it appends `-fresh`.
