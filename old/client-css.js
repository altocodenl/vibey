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
   ['.modal-backdrop', {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      'background-color': 'rgba(5, 8, 18, 0.72)',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: '1.5rem',
      'z-index': 1000,
      'backdrop-filter': 'blur(10px)'
   }],
   ['.modal-card', {
      width: '100%',
      'max-width': '540px',
      'background': 'linear-gradient(180deg, #1e2748 0%, #141b31 100%)',
      border: '1px solid rgba(148, 184, 255, 0.22)',
      'border-radius': '22px',
      'box-shadow': '0 24px 80px rgba(0, 0, 0, 0.45)',
      padding: '1.5rem'
   }],
   ['.project-modal-kicker', {
      color: '#9aa4bf',
      'font-size': '0.9rem',
      'letter-spacing': '0.04em',
      'margin-bottom': '0.6rem'
   }],
   ['.project-modal-title', {
      color: '#f5f7ff',
      'font-size': '2rem',
      'font-weight': '700',
      'line-height': 1.1,
      'margin-bottom': '0.65rem'
   }],
   ['.project-modal-subtitle', {
      color: '#bac4e2',
      'font-size': '1rem',
      'line-height': 1.5,
      'margin-bottom': '1.1rem'
   }],
   ['.project-modal-input', {
      width: '100%',
      padding: '1rem 1.1rem',
      'font-size': '1.35rem',
      'font-weight': '600',
      color: '#f5f7ff',
      'background-color': '#0f1530',
      border: '1px solid rgba(148, 184, 255, 0.24)',
      'border-radius': '14px',
      outline: 'none',
      'box-sizing': 'border-box'
   }],
   ['.project-modal-input:focus', {
      border: '1px solid #7ea6ff',
      'box-shadow': '0 0 0 4px rgba(126, 166, 255, 0.16)'
   }],
   ['.projects-view', {
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'flex-start',
      width: '100%',
      padding: '2.25rem 1rem'
   }],
   ['.projects-shell', {
      width: '100%',
      'max-width': '880px'
   }],
   ['.projects-header', {
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'center',
      'margin-bottom': '1rem'
   }],
   ['.projects-title', {
      'font-size': '2rem',
      'font-weight': '700',
      color: '#f5f7ff',
      'text-align': 'center'
   }],
   ['.projects-new-wrap', {
      display: 'flex',
      'justify-content': 'center',
      'margin-bottom': '1.5rem'
   }],
   ['.projects-new-button', {
      'font-size': '1.2rem',
      padding: '1rem 2.5rem',
      'border-radius': '16px',
      'min-width': '320px',
      'box-shadow': '0 12px 30px rgba(30, 55, 153, 0.35)'
   }],
   ['.projects-list', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.85rem'
   }],
   ['.project-card', {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: '1rem',
      padding: '1.1rem 1.25rem',
      'border-radius': '16px',
      cursor: 'pointer',
      'background-color': '#16213e',
      border: '1px solid rgba(148, 184, 255, 0.12)',
      'box-shadow': '0 8px 24px rgba(0, 0, 0, 0.18)',
      transition: 'transform 0.15s, background-color 0.2s, border-color 0.2s'
   }],
   ['.project-card:hover', {
      filter: 'brightness(1.15)',
      transform: 'translateY(-1px)'
   }],
   ['.project-card-name', {
      'font-size': '1.1rem',
      'font-weight': '600',
      color: 'inherit',
      'line-height': 1.35,
      'word-break': 'break-word'
   }],
   ['.project-card-delete', {
      color: 'inherit',
      opacity: '0.7',
      cursor: 'pointer',
      'font-size': '1.5rem',
      'line-height': 1,
      padding: '0.15rem 0.35rem',
      'border-radius': '10px',
      transition: 'background-color 0.2s'
   }],
   ['.project-card-delete:hover', {
      opacity: '1',
      'background-color': 'rgba(0, 0, 0, 0.15)'
   }],
   ['.projects-view-phone', {
      padding: '1rem 0.25rem 0.5rem',
   }],
   ['.projects-new-wrap-phone', {
      'justify-content': 'stretch',
   }],
   ['.projects-new-button-phone', {
      width: '100%',
      'min-width': 0,
      padding: '1rem 1.25rem',
   }],
   ['.project-card-phone', {
      'align-items': 'stretch',
      'flex-direction': 'column',
      gap: '0.75rem',
      padding: '1rem',
   }],
   ['.project-card-main-phone', {
      width: '100%',
      cursor: 'pointer',
   }],
   ['.project-card-actions-phone', {
      display: 'flex',
      gap: '0.5rem',
      width: '100%',
   }],
   ['.project-card-open-phone, .project-card-delete-phone', {
      flex: 1,
      width: '100%',
   }],
   ['.project-card-delete-phone', {
      'background-color': 'rgba(0, 0, 0, 0.18)',
   }],
   ['.projects-empty', {
      color: '#9aa4bf',
      'font-size': '1.05rem',
      'text-align': 'center',
      padding: '1rem 0'
   }],
   ['.modal-actions', {
      display: 'flex',
      'justify-content': 'flex-end',
      gap: '0.75rem',
      'margin-top': '1.1rem'
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
      'align-items': 'center',
   }],
   ['.view-edit-switch', {
      display: 'inline-flex',
      'align-items': 'center',
      gap: '0.45rem',
      cursor: 'pointer',
      'user-select': 'none',
   }],
   ['.switch-mode-label', {
      'font-size': '12px',
      color: '#9aa4bf',
   }],
   ['.switch-mode-label.active', {
      color: '#c9d4ff',
      'font-weight': 'bold',
   }],
   ['.switch-control', {
      position: 'relative',
      width: '40px',
      height: '22px',
      display: 'inline-block',
   }],
   ['.switch-input', {
      opacity: 0,
      width: 0,
      height: 0,
      position: 'absolute',
   }],
   ['.switch-slider', {
      position: 'absolute',
      cursor: 'pointer',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      'background-color': '#3a3a5f',
      transition: '0.2s',
      'border-radius': '999px',
      border: '1px solid #4c5888',
   }],
   ['.switch-slider:before', {
      position: 'absolute',
      content: '""',
      height: '16px',
      width: '16px',
      left: '2px',
      top: '2px',
      'background-color': '#c9d4ff',
      transition: '0.2s',
      'border-radius': '50%',
   }],
   ['.switch-input:checked + .switch-slider', {
      'background-color': '#4a69bd',
      border: '1px solid #4a69bd',
   }],
   ['.switch-input:checked + .switch-slider:before', {
      transform: 'translateX(18px)',
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
      'background-color': '#16213e',
      'border-radius': '8px',
      border: '1px solid #2a3354',
   }],
   ['.chat-messages', {
      flex: 1,
      'overflow-y': 'auto',
      padding: '1.25rem 1.5rem 0.75rem',
      'background-color': 'transparent',
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
   ['.chat-tool', {
      'background-color': '#0f1520',
      'border-left-color': '#7a5cff',
      'max-width': '90%',
      padding: '0.4rem 0.75rem',
      'margin-bottom': '0.15rem',
      opacity: '0.85',
   }],
   ['.chat-tool + .chat-tool', {
      'margin-top': '0.15rem',
   }],
   ['.chat-tool .chat-content', {
      'font-size': '12px',
      'line-height': 1.5,
   }],
   ['.chat-role', {
      'font-size': '11px',
      'text-transform': 'none',
      color: '#666',
      'margin-bottom': '0.45rem',
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
   ['.chat-link', {
      color: '#8db4ff',
      'text-decoration': 'underline',
      'text-underline-offset': '2px'
   }],
   ['.chat-link:hover', {
      color: '#b8d0ff'
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
   ['.tool-header', {
      display: 'inline',
      'font-size': '12px',
      'letter-spacing': '0.02em',
   }],
   ['.chat-input-area', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.6rem',
      padding: '0.75rem 1.5rem 1rem',
      'background-color': 'transparent',
      'border-top': '1px solid #2a3354',
   }],
   ['.chat-composer-label', {
      'font-size': '11px',
      'text-transform': 'uppercase',
      color: '#94b8ff',
      'letter-spacing': '0.08em',
   }],
   ['.chat-composer-toolbar', {
      display: 'flex',
      gap: '0.5rem',
      'align-items': 'center',
      'flex-wrap': 'wrap',
      'justify-content': 'flex-end',
   }],
   ['.chat-input', {
      flex: 1,
      width: '100%',
      padding: '0.9rem',
      'border-radius': '6px',
      border: '1px solid #2a3354',
      'background-color': '#111827',
      color: '#eee',
      'font-family': 'Monaco, Consolas, monospace',
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
   // Vibeying gauge
   ['.vibeying-gauge', {
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      padding: '4px 12px',
      'font-size': '12px',
      color: '#b07aff',
   }],
   ['.vibeying-spinner', {
      'font-family': 'Monaco, Consolas, monospace',
      'font-weight': 'bold',
      'font-size': '14px',
      width: '1ch',
      'text-align': 'center',
      display: 'inline-block',
   }],
   ['.vibeying-label', {
      'font-weight': '600',
      'letter-spacing': '0.06em',
   }],
   ['.vibeying-gauge-ready', {
      color: '#4ec970',
   }],
   ['.vibeying-cursor', {
      'font-family': 'Monaco, Consolas, monospace',
      'font-weight': 'bold',
      'font-size': '14px',
      width: '1ch',
      'text-align': 'left',
      display: 'inline-block',
   }],
   ['.mobile-shell', {
      padding: '0.75rem 0.75rem 5.5rem 0.75rem',
   }],
   ['.mobile-topbar', {
      display: 'flex',
      'justify-content': 'space-between',
      gap: '0.75rem',
      'align-items': 'flex-start',
      'margin-bottom': '0.75rem',
      'flex-wrap': 'wrap',
   }],
   ['.mobile-topbar-main', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.15rem',
      'min-width': 0,
      flex: 1,
   }],
   ['.mobile-title', {
      margin: 0,
      'font-size': '1.35rem',
      color: '#f5f7ff',
      'line-height': 1.2,
      'word-break': 'break-word',
      cursor: 'pointer',
   }],
   ['.mobile-subtitle', {
      color: '#9aa4bf',
      'font-size': '0.9rem',
   }],
   ['.mobile-top-actions', {
      display: 'flex',
      gap: '0.45rem',
      'align-items': 'center',
      'flex-wrap': 'wrap',
      'justify-content': 'flex-end',
   }],
   ['.mobile-content', {
      flex: 1,
      'min-height': 0,
      overflow: 'auto',
      'scroll-padding-bottom': '8rem',
   }],
   ['.mobile-bottom-nav', {
      position: 'fixed',
      left: '0.75rem',
      right: '0.75rem',
      bottom: '0.75rem',
      display: 'flex',
      gap: '0.5rem',
      padding: '0.55rem',
      'background-color': 'rgba(15, 21, 48, 0.96)',
      border: '1px solid rgba(148, 184, 255, 0.18)',
      'border-radius': '18px',
      'box-shadow': '0 16px 40px rgba(0, 0, 0, 0.35)',
      'backdrop-filter': 'blur(12px)',
      'z-index': 30,
   }],
   ['.mobile-nav-button', {
      flex: 1,
      padding: '0.8rem 0.5rem',
      'border-radius': '12px',
      'background-color': 'transparent',
      color: '#9aa4bf',
      'font-size': '0.95rem',
      'font-weight': '600',
   }],
   ['.mobile-nav-active', {
      'background-color': '#4a69bd',
      color: '#fff',
   }],
   ['.files-container-phone', {
      gap: '0.75rem',
      'padding-bottom': '0.5rem',
   }],
   ['.editor-header-phone', {
      'align-items': 'flex-start',
      'flex-direction': 'column',
      gap: '0.65rem',
   }],
   ['.editor-actions-phone', {
      width: '100%',
      'flex-wrap': 'wrap',
      gap: '0.45rem',
   }],
   ['.editor-empty-actions', {
      display: 'flex',
      gap: '0.5rem',
      'justify-content': 'center',
      'margin-top': '0.75rem',
      'flex-wrap': 'wrap',
   }],
   ['.docs-sheet-backdrop', {
      'align-items': 'flex-end',
      padding: '0.75rem',
   }],
   ['.docs-sheet', {
      'max-width': '100%',
      'max-height': '80vh',
      padding: '1rem',
      'border-radius': '18px 18px 12px 12px',
      overflow: 'hidden',
      display: 'flex',
      'flex-direction': 'column',
   }],
   ['.docs-sheet-header', {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: '0.75rem',
      'margin-bottom': '0.5rem',
   }],
   ['.docs-sheet-body', {
      overflow: 'auto',
      'min-height': 0,
   }],
   ['.docs-sheet .file-list', {
      width: '100%',
      padding: 0,
      background: 'transparent',
      border: 'none',
      'box-shadow': 'none',
   }],
   ['.docs-sheet .file-list-scroll', {
      'max-height': '45vh',
   }],
   ['.upload-section-phone', {
      'max-height': 'none',
      'margin-top': 0,
      'padding-top': 0,
      border: 'none',
   }],
   ['.chat-container-phone', {
      'min-height': 0,
      'padding-bottom': '0.25rem',
   }],
   ['.chat-input-area-phone', {
      position: 'sticky',
      bottom: 0,
      'z-index': 5,
      'background-color': '#16213e',
      'padding-bottom': 'max(1rem, env(safe-area-inset-bottom))',
      'box-shadow': '0 -8px 20px rgba(0, 0, 0, 0.18)',
   }],
   ['.chat-input-area-phone .chat-input', {
      'min-height': '88px',
   }],
   ['.editor-textarea', {
      'scroll-margin-bottom': '8rem',
   }],
   ['.chat-input', {
      'scroll-margin-bottom': '8rem',
   }],
   ['.settings-shell-phone', {
      'max-width': '100%',
      padding: '0 0 1rem 0',
   }],
   ['.settings-card-phone', {
      padding: '1rem',
      'margin-bottom': '0.85rem',
   }],
   ['.settings-card-header-phone', {
      'flex-direction': 'column',
      'align-items': 'flex-start',
      gap: '0.45rem',
   }],
   ['.settings-row-phone', {
      'flex-direction': 'column',
      'align-items': 'stretch',
      width: '100%',
   }],
   ['.settings-actions-phone', {
      'justify-content': 'stretch',
   }],
   ['.settings-actions-phone button', {
      width: '100%',
   }],
   ['.settings-row-phone input', {
      width: '100%',
      'box-sizing': 'border-box',
   }],
   ['.snapshots-shell-phone', {
      'max-width': '100%',
   }],
   ['.snapshots-list-phone', {
      padding: '0.5rem',
   }],
   ['.snapshot-item-phone', {
      'flex-direction': 'column',
      'align-items': 'stretch',
      gap: '0.75rem',
      padding: '0.9rem 0.85rem',
   }],
   ['.snapshot-actions-phone', {
      width: '100%',
      display: 'flex',
      gap: '0.45rem',
   }],
   ['.snapshot-actions-phone button', {
      flex: 1,
      width: '100%',
   }],
   ['.mobile-more-sheet', {
      'max-width': '100%',
   }],
   ['.mobile-more-body', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '0.6rem',
   }],
   ['.mobile-more-action', {
      width: '100%',
      'text-align': 'left',
      padding: '0.95rem 1rem',
      'background-color': '#1a1a2e',
      color: '#e5ebff',
      'border-radius': '12px',
   }],
];
