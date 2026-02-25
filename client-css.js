window.vibeyCSS = [
   ['body', {
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      margin: 0,
      padding: 0,
      'background-color': '#1a1a2e',
      color: '#eee',
      height: '100vh',
   }],
   ['.container', {
      display: 'flex',
      'flex-direction': 'column',
      height: '100vh',
      'max-width': '1200px',
      margin: '0 auto',
      padding: '1rem',
   }],
   ['button', {
      padding: '0.75rem 1.5rem',
      'border-radius': '8px',
      border: 'none',
      cursor: 'pointer',
      'font-weight': 'bold',
      transition: 'background-color 0.2s',
   }],
   ['button.primary', {
      'background-color': '#4a69bd',
      color: 'white',
   }],
   ['button.primary:hover', {
      'background-color': '#1e3799',
   }],
   ['button:disabled', {
      opacity: 0.5,
      cursor: 'not-allowed',
   }],
   ['.header', {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'margin-bottom': '1rem',
   }],
   // Tabs
   ['.tabs', {
      display: 'flex',
      gap: '0.5rem',
      'margin-bottom': '1rem',
   }],
   ['.tab', {
      padding: '0.5rem 1rem',
      'border-radius': '8px 8px 0 0',
      border: 'none',
      cursor: 'pointer',
      'background-color': '#16213e',
      color: '#888',
      'font-weight': 'bold',
      transition: 'all 0.2s',
   }],
   ['.tab:hover', {
      'background-color': '#1a2a4a',
      color: '#aaa',
   }],
   ['.tab-active', {
      'background-color': '#4a69bd',
      color: 'white',
   }],
   ['.tab-active:hover', {
      'background-color': '#4a69bd',
      color: 'white',
   }],
   // Files view
   ['.files-container', {
      display: 'flex',
      flex: 1,
      gap: '1rem',
      'min-height': 0,
   }],
   ['.file-list', {
      width: '250px',
      'background-color': '#16213e',
      'border-radius': '8px',
      padding: '1rem',
      display: 'flex',
      'flex-direction': 'column',
      'min-height': 0,
      overflow: 'hidden',
   }],
   ['.file-list-scroll', {
      flex: 1,
      'min-height': 0,
      'overflow-y': 'auto',
   }],
   ['.file-list-header', {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'margin-bottom': '0.75rem',
      'padding-bottom': '0.5rem',
      'border-bottom': '1px solid #333',
   }],
   ['.file-list-title', {
      'font-weight': 'bold',
      color: '#888',
      'font-size': '12px',
      'text-transform': 'uppercase',
   }],
   ['.file-item', {
      padding: '0.5rem 0.75rem',
      'border-radius': '4px',
      cursor: 'pointer',
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'margin-bottom': '0.25rem',
      transition: 'background-color 0.2s',
   }],
   ['.file-item:hover', {
      'background-color': '#1a2a4a',
   }],
   ['.file-item-active', {
      'background-color': '#4a69bd',
   }],
   ['.file-item-active:hover', {
      'background-color': '#4a69bd',
   }],
   ['.file-name', {
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
   }],
   ['.upload-section', {
      'margin-top': '0.75rem',
      'padding-top': '0.5rem',
      'border-top': '1px solid #333',
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.5rem',
      'max-height': '40%',
   }],
   ['.upload-header', {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: '0.5rem',
   }],
   ['.upload-list', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.25rem',
      'overflow-y': 'auto',
      'max-height': '180px',
   }],
   ['.upload-item', {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      padding: '0.35rem 0.5rem',
      'border-radius': '4px',
      cursor: 'pointer',
      'background-color': '#101827',
   }],
   ['.upload-item:hover', {
      'background-color': '#1a2a4a',
   }],
   ['.upload-item-active', {
      'background-color': '#4a69bd',
   }],
   ['.upload-name', {
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'max-width': '140px',
   }],
   ['.upload-size', {
      color: '#9aa4bf',
      'font-size': '11px',
   }],
   ['.upload-empty', {
      color: '#666',
      'font-size': '12px',
   }],
   ['.dialog-name', {
      flex: 1,
      'white-space': 'normal',
      overflow: 'visible',
      'text-overflow': 'clip',
      'word-break': 'break-word',
      'line-height': 1.3,
      'padding-right': '0.5rem'
   }],
   ['.file-delete', {
      opacity: 0,
      color: '#ff8b94',
      cursor: 'pointer',
      padding: '0.25rem',
      transition: 'opacity 0.2s',
   }],
   ['.file-item:hover .file-delete', {
      opacity: 1,
   }],
   ['.btn-small', {
      padding: '0.25rem 0.5rem',
      'font-size': '12px',
   }],
   // Editor
   ['.editor-container', {
      flex: 1,
      display: 'flex',
      'flex-direction': 'column',
      'min-width': 0,
   }],
   ['.editor-header', {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'margin-bottom': '0.5rem',
   }],
   ['.editor-filename', {
      'font-weight': 'bold',
      color: '#94b8ff',
   }],
   ['.editor-dirty', {
      color: '#ffd93d',
      'margin-left': '0.5rem',
   }],
   ['.editor-actions', {
      display: 'flex',
      gap: '0.5rem',
   }],
   ['.editor-textarea', {
      flex: 1,
      width: '100%',
      padding: '1rem',
      'border-radius': '8px',
      border: 'none',
      'background-color': '#16213e',
      color: '#eee',
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '14px',
      'line-height': 1.6,
      resize: 'none',
   }],
   ['.editor-textarea:focus', {
      outline: '2px solid #4a69bd',
   }],
   // Vi mode: hide native caret in normal/command mode, show in insert
   ['.vi-active', {
      'caret-color': 'transparent',
   }],
   ['.vi-active.vi-insert', {
      'caret-color': '#eee',
   }],
   // Vi block cursor overlay
   ['.vi-cursor-overlay', {
      position: 'absolute',
      'pointer-events': 'none',
      'background-color': 'rgba(238, 238, 238, 0.7)',
      'z-index': 10,
   }],
   // Vi textarea wrapper for positioning the cursor overlay
   ['.vi-textarea-wrap', {
      position: 'relative',
      display: 'flex',
      'flex-direction': 'column',
      flex: 1,
      'min-height': 0,
   }],
   ['.vi-status', {
      display: 'flex',
      'justify-content': 'space-between',
      padding: '0.25rem 0.75rem',
      'background-color': '#0d0d1a',
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '12px',
      color: '#9aa4bf',
      'border-radius': '0 0 8px 8px',
      'border-top': '1px solid #333'
   }],
   ['.vi-status span', {
      'white-space': 'pre'
   }],
   // Vi status bar in chat input area
   ['.vi-chat-status', {
      display: 'flex',
      'justify-content': 'space-between',
      padding: '0.15rem 0.5rem',
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '11px',
      color: '#9aa4bf',
      'background-color': '#0d0d1a',
      'border-radius': '0 0 8px 8px',
      'margin-top': '-0.25rem',
      'min-width': 0,
      flex: 1,
   }],
   ['.vi-chat-status span', {
      'white-space': 'pre'
   }],
   ['.editor-empty', {
      flex: 1,
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      color: '#888',
      'background-color': '#16213e',
      'border-radius': '8px',
   }],
   ['.upload-preview', {
      'margin-top': '1rem',
      padding: '0.75rem',
      'background-color': '#16213e',
      'border-radius': '8px',
      border: '1px solid #29304d',
   }],
   ['.upload-preview-header', {
      'font-weight': 'bold',
      'margin-bottom': '0.5rem',
      color: '#c9d4ff',
      'font-size': '13px',
   }],
   ['.upload-media', {
      width: '100%',
      'max-height': '360px',
      'border-radius': '6px',
      border: '1px solid #2d3652',
   }],
   ['.upload-meta', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.35rem',
      color: '#d5d8e6',
      'font-size': '13px',
   }],
   ['.upload-meta-line a', {
      color: '#94b8ff',
      'text-decoration': 'none',
   }],
   // Dialogs
   ['.chat-container', {
      flex: 1,
      display: 'flex',
      'flex-direction': 'column',
      'min-width': 0,
   }],
   ['.chat-messages', {
      flex: 1,
      'overflow-y': 'auto',
      padding: '1rem',
      'background-color': '#16213e',
      'border-radius': '8px 8px 0 0',
   }],
   ['.chat-message', {
      'margin-bottom': '0.5rem',
      padding: '0.75rem 1rem',
      'border-radius': '6px',
      'border-left': '3px solid transparent',
   }],
   ['.chat-user', {
      'background-color': '#1a2a3e',
      'border-left-color': '#2d6a4f',
      'max-width': '90%',
      'margin-left': 'auto',
   }],
   ['.chat-assistant', {
      'background-color': '#1a1f35',
      'border-left-color': '#4a69bd',
      'max-width': '90%',
   }],
   ['.chat-role', {
      'font-size': '11px',
      'text-transform': 'uppercase',
      color: '#666',
      'margin-bottom': '0.25rem',
      display: 'flex',
      'justify-content': 'space-between',
      gap: '0.75rem'
   }],
   ['.chat-meta', {
      'text-transform': 'none',
      'font-size': '11px',
      color: '#9aa4bf',
      display: 'block',
      'margin-top': '0.5rem',
      'text-align': 'right'
   }],
   ['.chat-content', {
      'white-space': 'pre-wrap',
      'word-wrap': 'break-word',
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '13px',
      'line-height': 1.6,
   }],
   ['.chat-label', {
      color: '#94b8ff',
      'font-weight': 'bold',
   }],
   ['.chat-separator', {
      border: 'none',
      'border-top': '1px solid #333',
      margin: '0.5rem 0',
   }],
   ['.chat-input-area', {
      display: 'flex',
      gap: '0.5rem',
      padding: '0.5rem',
      'background-color': '#16213e',
      'border-radius': '0 0 8px 8px',
      'border-top': '1px solid #333',
   }],
   ['.chat-input', {
      flex: 1,
      padding: '0.75rem',
      'border-radius': '8px',
      border: 'none',
      'background-color': '#1a1a2e',
      color: '#eee',
      'font-family': 'inherit',
      'font-size': '14px',
      resize: 'none',
   }],
   ['.chat-input:focus', {
      outline: '2px solid #4a69bd',
   }],
   ['.provider-select', {
      padding: '0.5rem',
      'border-radius': '8px',
      border: 'none',
      'background-color': '#1a1a2e',
      color: '#eee',
   }],
   // Tool calls

   ['.tool-name', {
      'font-weight': 'bold',
      color: '#94b8ff',
   }],
   ['.tool-input', {
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '12px',
      'background-color': '#0d0d1a',
      padding: '0.5rem',
      'border-radius': '4px',
      'white-space': 'pre-wrap',
      'word-break': 'break-all',
      'max-height': '150px',
      'overflow-y': 'auto',
      'margin-bottom': '0.5rem',
   }],
   ['.tool-input-expanded', {
      'max-height': 'none',
   }],
   ['.tool-diff', {
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '12px',
      'background-color': '#0d0d1a',
      padding: '0.5rem',
      'border-radius': '4px',
      'white-space': 'pre-wrap',
      'word-break': 'break-word',
      'margin-bottom': '0.5rem',
      border: '1px solid #2f2f4a'
   }],
   ['.tool-diff-line', {
      color: '#a0aec0'
   }],
   ['.tool-diff-add', {
      color: '#6ad48a'
   }],
   ['.tool-diff-del', {
      color: '#ff8b94'
   }],
   ['.tool-diff-skip', {
      color: '#8d93ab',
      'font-style': 'italic'
   }],
   ['.tool-actions', {
      display: 'flex',
      gap: '0.5rem',
   }],

   ['.tool-status', {
      'font-size': '12px',
      color: '#888',
      'font-style': 'italic',
   }],
   ['.tool-result', {
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '11px',
      'background-color': '#0d0d1a',
      padding: '0.5rem',
      'border-radius': '4px',
      'white-space': 'pre-wrap',
      'word-break': 'break-all',
      'max-height': '100px',
      'overflow-y': 'auto',
      color: '#7fba00',
   }],
   ['.tool-result-error', {
      color: '#e74c3c',
   }],
   // Embed
   ['.embed-container', {
      border: '1px solid #333',
      'border-radius': '8px',
      overflow: 'hidden',
      'margin': '1rem 0',
   }],
   ['.embed-header', {
      display: 'flex',
      'align-items': 'center',
      gap: '0.5rem',
      padding: '0.4rem 0.75rem',
      'background-color': '#0d0d1a',
      'border-bottom': '1px solid #333',
      'font-size': '12px',
   }],
   ['.embed-title', {
      color: '#94b8ff',
      'font-weight': 'bold',
   }],
   ['.embed-port', {
      color: '#666',
      'font-family': 'Monaco, Consolas, monospace',
   }],
   ['.embed-open', {
      color: '#9aa4bf',
      'text-decoration': 'none',
      'margin-left': 'auto',
      'font-size': '14px',
   }],
   ['.embed-open:hover', {
      color: '#94b8ff',
   }],
   ['.embed-error', {
      color: '#ff8b94',
      'font-size': '13px',
      padding: '0.75rem',
      'background-color': '#2a1a1a',
      'border-radius': '6px',
      margin: '1rem 0',
   }],
   ['.embed-container iframe', {
      border: 'none',
      display: 'block',
      'background-color': 'white',
   }],
   // Preview pane
   ['.editor-preview', {
      flex: 1,
      padding: '1rem 1.5rem',
      'background-color': '#16213e',
      'border-radius': '8px',
      'overflow-y': 'auto',
      color: '#ddd',
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size': '15px',
      'line-height': 1.7,
   }],
   ['.editor-preview h1, .editor-preview h2, .editor-preview h3', {
      color: '#94b8ff',
      'margin-top': '1.5rem',
      'margin-bottom': '0.5rem',
   }],
   ['.editor-preview h1', {'font-size': '1.6rem', 'border-bottom': '1px solid #333', 'padding-bottom': '0.3rem'}],
   ['.editor-preview h2', {'font-size': '1.3rem'}],
   ['.editor-preview h3', {'font-size': '1.1rem'}],
   ['.editor-preview p', {'margin': '0.5rem 0'}],
   ['.editor-preview code', {
      'background-color': '#0d0d1a',
      padding: '0.15rem 0.4rem',
      'border-radius': '4px',
      'font-family': 'Monaco, Consolas, monospace',
      'font-size': '13px',
   }],
   ['.editor-preview pre', {
      'background-color': '#0d0d1a',
      padding: '0.75rem 1rem',
      'border-radius': '6px',
      'overflow-x': 'auto',
   }],
   ['.editor-preview pre code', {
      padding: 0,
      'background-color': 'transparent',
   }],
   ['.editor-preview a', {color: '#94b8ff'}],
   ['.editor-preview blockquote', {
      'border-left': '3px solid #4a69bd',
      'padding-left': '1rem',
      color: '#9aa4bf',
      margin: '0.5rem 0',
   }],
   ['.editor-preview table', {
      'border-collapse': 'collapse',
      width: '100%',
      margin: '0.75rem 0',
   }],
   ['.editor-preview th, .editor-preview td', {
      border: '1px solid #333',
      padding: '0.4rem 0.75rem',
      'text-align': 'left',
   }],
   ['.editor-preview th', {
      'background-color': '#0d0d1a',
      color: '#94b8ff',
   }],
   ['.editor-preview ul, .editor-preview ol', {
      'padding-left': '1.5rem',
      margin: '0.5rem 0',
   }],
   ['.editor-preview li', {
      margin: '0.25rem 0',
   }],
   ['.editor-preview img', {
      'max-width': '100%',
      'border-radius': '6px',
   }],
   ['.editor-preview hr', {
      border: 'none',
      'border-top': '1px solid #333',
      margin: '1rem 0',
   }],
];
