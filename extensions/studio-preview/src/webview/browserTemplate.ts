/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ProjectInfo } from '../core/ProjectDetector';

export function getBrowserTemplate(
	webview: vscode.Webview,
	_extensionUri: vscode.Uri,
	initialUrl: string,
	projects: ProjectInfo[] = []
): string {
	const nonce = getNonce();
	const projectsJson = JSON.stringify(projects);

	// ✅ Detect what's available at template generation time
	const hasFrontend = projects.some(p => p.category === 'frontend');
	const hasBackend = projects.some(p => p.category === 'backend');

	// ✅ Decide initial mode
	const initialMode = hasFrontend ? 'frontend' : hasBackend ? 'backend' : 'frontend';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; frame-src *; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'unsafe-inline'; img-src ${webview.cspSource} https: data:; connect-src *;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Amypo Browser</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      display: flex; flex-direction: column; height: 100vh;
      background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family); font-size: 11px; overflow: hidden;
    }

    #toolbar {
      display: flex; align-items: center; gap: 4px; padding: 4px 8px;
      background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border, #333); flex-shrink: 0;
      height: 38px;
    }

    .nav-btn {
      display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
      border: none; border-radius: 4px; background: transparent; color: var(--vscode-icon-foreground);
      cursor: pointer; flex-shrink: 0; transition: all 0.1s;
    }
    .nav-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .nav-btn svg { pointer-events: none; }

    #url-bar-container { flex: 1; display: flex; align-items: center; gap: 4px; position: relative; }
    #url-bar {
      width: 100%; height: 26px; padding: 0 10px; border-radius: 6px;
      border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); font-size: 11px; outline: none; transition: border-color 0.1s;
    }
    #url-bar:focus { border-color: var(--vscode-focusBorder); }

    #mode-tabs {
      display: flex; gap: 2px; align-items: center; flex-shrink: 0;
      padding-left: 6px; border-left: 1px solid var(--vscode-panel-border);
    }
    .mode-tab {
      padding: 4px 8px; border-radius: 4px; cursor: pointer;
      color: var(--vscode-descriptionForeground);
      background: transparent; border: none; font-size: 10px; font-weight: 500;
      display: flex; align-items: center; gap: 4px; transition: all 0.2s;
    }
    .mode-tab:hover { color: var(--vscode-foreground); }
    .mode-tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }

    /* ✅ Hidden tabs take no space */
    .mode-tab.hidden { display: none; }

    #status-indicator {
      display: flex; align-items: center; justify-content: center;
      padding: 0 8px; height: 26px; border-radius: 13px; font-size: 9px; font-weight: bold;
      background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border);
      color: var(--vscode-descriptionForeground); margin-left: auto;
    }
    #status-indicator.running { color: #89D185; border-color: #89D185; }
    #status-indicator.stopped { color: #F14C4C; border-color: #F14C4C; }

    #port-chips { display: flex; gap: 4px; align-items: center; margin-right: 4px; }
    .port-chip {
      padding: 0 6px; height: 18px; border-radius: 4px; line-height: 18px;
      background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border);
      color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 9px; font-weight: bold;
      transition: all 0.1s; white-space: nowrap;
    }
    .port-chip:hover { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }
    .port-chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }

    #progress-bar { position: absolute; top: 38px; left: 0; height: 1.5px; width: 0%; background: var(--vscode-button-activeBackground); z-index: 100; transition: width 0.3s ease; }
    #progress-bar.loading { width: 90%; }
    #progress-bar.complete { width: 100%; opacity: 0; }

    #browser-wrapper { position: relative; flex: 1; background: #fff; display: flex; flex-direction: column; }
    #browser-frame { flex: 1; border: none; width: 100%; display: block; }
    #devtools-frame { flex: 1; border: none; width: 100%; display: none; border-top: 1px solid var(--vscode-panel-border, #333); }
    #loading-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); opacity: 1; transition: opacity 0.3s; pointer-events: none; }
    #loading-overlay.hidden { opacity: 0; }

    /* ✅ Dev Tools Toggle Button */
    #btn-devtools {
      display: flex; align-items: center; gap: 6px;
      margin-left: 8px; padding: 2px 8px;
      height: 24px; border-radius: 4px;
      border: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-editor-background);
      color: var(--vscode-descriptionForeground);
      font-size: 10px; font-weight: 500; cursor: pointer;
      transition: all 0.2s;
    }
    #btn-devtools:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
      border-color: var(--vscode-focusBorder);
    }
    #btn-devtools.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    #btn-devtools.active:hover {
      background: var(--vscode-button-hoverBackground);
      border-color: var(--vscode-button-hoverBackground);
    }
    #btn-devtools svg { color: inherit; }
  </style>
</head>
<body>

  <div id="toolbar">
    <button class="nav-btn" id="btn-back" title="Back">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3L5 8l5 5"/>
      </svg>
    </button>
    <button class="nav-btn" id="btn-refresh" title="Refresh">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13.5 2.5v3.5h-3.5"/>
        <path d="M13.1 8a5.5 5.5 0 1 1-1.6-3.9l2 1.9"/>
      </svg>
    </button>

    <div id="url-bar-container">
      <div id="port-chips"></div>
      <input id="url-bar" type="text" value="${initialUrl}" spellcheck="false" placeholder="localhost:3000..." />
    </div>

    <div id="mode-tabs">
      <button class="mode-tab ${initialMode === 'frontend' ? 'active' : ''} ${!hasFrontend ? 'hidden' : ''}"
        data-mode="frontend">⚡ Frontend</button>
      <button class="mode-tab ${initialMode === 'backend' ? 'active' : ''} ${!hasBackend ? 'hidden' : ''}"
        data-mode="backend">🔧 Backend</button>
    </div>

    <!-- <div id="status-indicator">⚪ Initializing</div> -->

    <button id="btn-devtools" title="Toggle Student DevTools">
      Dev Tools
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M10.707 11.293l3.293-3.293-3.293-3.293-.707.707 2.586 2.586-2.586 2.586.707.707zM5.293 4.707L2 8l3.293 3.293.707-.707L3.414 8l2.586-2.586-.707-.707z"/>
      </svg>
    </button>

    <button class="nav-btn" id="btn-pin" style="margin-left: 8px;" title="Pin Tab">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.5 1h-7l1 5-2 2v2h3v5l1 1 1-1v-5h3V8l-2-2 1-5z"/>
      </svg>
    </button>
  </div>

  <div id="progress-bar"></div>

  <div id="browser-wrapper">
    <div id="empty-state" style="display: ${initialUrl === 'about:blank' ? 'flex' : 'none'}; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); font-size: 14px; text-align: center; background: var(--vscode-editor-background);">
      <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" style="margin-bottom: 16px; opacity: 0.5;">
        <path d="M14.5 2h-13c-.8 0-1.5.7-1.5 1.5v9c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5v-9c0-.8-.7-1.5-1.5-1.5zm0 10.5h-13v-9h13v9z"/>
        <path d="M4.5 6l2.5 2.5-2.5 2.5.7.7 3.2-3.2-3.2-3.2z"/>
      </svg>
      <h2>Waiting for Dev Server...</h2>
      <p style="margin-top: 8px; opacity: 0.8;">Run your frontend or backend server to preview it here.</p>
      <button id="btn-open-folder" style="margin-top: 24px; padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Open Folder</button>
    </div>
    <iframe id="browser-frame" src="${initialUrl}" style="display: ${initialUrl === 'about:blank' ? 'none' : 'block'};"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
      allow="clipboard-read; clipboard-write; autoplay;"
    ></iframe>
    <iframe id="devtools-frame" src="about:blank"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    ></iframe>
    <div id="loading-overlay"></div>
  </div>

  <script nonce="${nonce}">
    const vscode    = acquireVsCodeApi();
    const frame     = document.getElementById('browser-frame');
    const devtoolsFrame = document.getElementById('devtools-frame');
    const urlBar    = document.getElementById('url-bar');
    const progress  = document.getElementById('progress-bar');
    const chipBox   = document.getElementById('port-chips');
    const overlay   = document.getElementById('loading-overlay');
    // const statusInd = document.getElementById('status-indicator');

    let localProjects = ${projectsJson};
    let currentMode   = '${initialMode}';

    function navigateTo(url) {
      if (!url.startsWith('http') && url !== 'about:blank') { url = 'http://' + url; }

      const emptyState = document.getElementById('empty-state');
      if (url === 'about:blank' || !url) {
        emptyState.style.display = 'flex';
        frame.style.display = 'none';
      } else {
        emptyState.style.display = 'none';
        frame.style.display = 'block';
        progress.className = 'loading';
        overlay.classList.remove('hidden');
      }

      frame.src = url;
      urlBar.value = url === 'about:blank' ? '' : url;
      updateChips(url);
    }

    function updateChips(url = '') {
      chipBox.innerHTML = '';
      const filtered = localProjects.filter(p => p.category === currentMode);
      filtered.forEach(p => {
        const chip = document.createElement('div');
        const isActive = url.includes(':' + p.port);
        chip.className = 'port-chip' + (isActive ? ' active' : '');
        chip.textContent = ':' + p.port;
        chip.title = p.label;
        chip.addEventListener('click', () => {
          if (devToolsActive) {
            devToolsActive = false;
            devToolsBtn.classList.remove('active');
            vscode.postMessage({ type: 'toggleDevTools', currentUrl: frame.src });
          }
          navigateTo('http://localhost:' + p.port);
        });
        chipBox.appendChild(chip);
      });
    }

    // ── DevTools toggle state ──
    let devToolsActive = false;
    let originalUrl    = '';   // URL before proxy was enabled
    const devToolsBtn  = document.getElementById('btn-devtools');

    // ✅ Show/hide tabs dynamically when projects update
    function updateTabVisibility() {
      const hasFrontend = localProjects.some(p => p.category === 'frontend');
      const hasBackend  = localProjects.some(p => p.category === 'backend');

      document.querySelector('[data-mode="frontend"]')
        .classList.toggle('hidden', !hasFrontend);
      document.querySelector('[data-mode="backend"]')
        .classList.toggle('hidden', !hasBackend);
    }

    frame.addEventListener('load', () => {
      progress.className = 'complete';
      setTimeout(() => progress.className = '', 300);
      overlay.classList.add('hidden');
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => { navigateTo(frame.src); });
    document.getElementById('btn-external')?.addEventListener('click', () => { vscode.postMessage({ type: 'openExternal', url: frame.src }); });
    document.getElementById('btn-pin')?.addEventListener('click', () => { vscode.postMessage({ type: 'pin' }); });
    devToolsBtn?.addEventListener('click', () => {
      const currentUrl = frame.src || '';
      vscode.postMessage({ type: 'toggleDevTools', currentUrl });
    });
    document.getElementById('btn-back')?.addEventListener('click', () => { try { frame.contentWindow.history.back(); } catch {} });
    document.getElementById('btn-open-folder')?.addEventListener('click', () => { vscode.postMessage({ type: 'openFolder' }); });
    urlBar?.addEventListener('keydown', (e) => { 
      if (e.key === 'Enter') { 
        if (devToolsActive) {
          devToolsActive = false;
          devToolsBtn.classList.remove('active');
          devToolsBtn.title = 'Toggle Student DevTools';
          vscode.postMessage({ type: 'toggleDevTools', currentUrl: frame.src }); // Tell backend to stop proxy
        }
        navigateTo(urlBar.value.trim()); 
      } 
    });

    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.classList.contains('hidden')) return;
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentMode = tab.dataset.mode;

        // ✅ Only show DevTools button for Frontend
        if (devToolsBtn) {
            devToolsBtn.style.display = (currentMode === 'frontend') ? 'flex' : 'none';
        }

        urlBar.placeholder = 'localhost:3000...';
        const relevant = localProjects.filter(p => p.category === currentMode);
        
        if (devToolsActive) {
          devToolsActive = false;
          devToolsBtn.classList.remove('active');
          vscode.postMessage({ type: 'toggleDevTools', currentUrl: frame.src });
        }

        if (relevant.length > 0) {
          navigateTo('http://localhost:' + relevant[0].port);
        } else {
          urlBar.value = '';
          chipBox.innerHTML = '';
          frame.src = 'about:blank';
        }
      });
    });

    function initStatus() {
      const relevant = localProjects.filter(p => p.category === currentMode);
      if (relevant.length > 0) {
        // statusInd.className = 'running';
        // statusInd.innerHTML = '🟢 Running';
      } else {
        // statusInd.className = 'stopped';
        // statusInd.innerHTML = '🔴 Stopped';
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'updateProjects') {
        localProjects = msg.projects;
        updateChips(urlBar.value);
        updateTabVisibility();
      }

      if (msg.type === 'navigate') {
        if (devToolsActive) {
          devToolsActive = false;
          devToolsBtn.classList.remove('active');
          vscode.postMessage({ type: 'toggleDevTools', currentUrl: frame.src });
        }
        if (msg.url === 'refresh') {
          navigateTo(urlBar.value);
        } else {
          navigateTo(msg.url || urlBar.value);
        }
      }

      // ── DevTools: proxy started — switch iframe to proxy URL ──
      if (msg.type === 'enableDevTools') {
        devToolsActive = true;
        originalUrl    = urlBar.value;   // remember what they typed
        devToolsBtn.classList.add('active');
        devToolsBtn.title = 'DevTools ON — click to turn off';
        
        // Change iframe but keep original URL in the bar!
        frame.src = msg.url;
        // Use our proxy for Chii so we can inject the window.open fix!
        const pUrl = new URL(msg.url);
        devtoolsFrame.src = pUrl.origin + '/__amypo_chii__/';
        devtoolsFrame.style.display = 'block';
        progress.className = 'loading';
        overlay.classList.remove('hidden');
      }

      // ── DevTools: proxy stopped — revert iframe to direct URL ──
      if (msg.type === 'disableDevTools') {
        devToolsActive = false;
        devToolsBtn.classList.remove('active');
        devToolsBtn.title = 'Toggle Student DevTools';
        
        const targetUrl = urlBar.value || originalUrl;
        const currentSrc = (frame.src && frame.src.endsWith('/')) ? frame.src.slice(0, -1) : (frame.src || '');
        const targetClean = (targetUrl && targetUrl.endsWith('/')) ? targetUrl.slice(0, -1) : (targetUrl || '');

        // Revert iframe only if it hasn't already been navigated
        if (currentSrc !== targetClean && currentSrc !== 'about:blank') {
          frame.src = targetUrl;
          progress.className = 'loading';
          overlay.classList.remove('hidden');
        }

        devtoolsFrame.src = 'about:blank';
        devtoolsFrame.style.display = 'none';
        originalUrl = '';
      }

      // ✅ Sync URL bar when iframe navigates internally
      if (msg.type === 'urlChanged') {
        const currentUrl = (urlBar.value || '').trim();
        // Only update if it's actually different to avoid cursor jumps
        if (currentUrl !== msg.url && currentUrl !== msg.url + '/') {
          urlBar.value = msg.url;
          updateChips(msg.url);
        }
      }
    });

    updateChips(frame.src);
    initStatus();
    updateTabVisibility(); // ✅ Apply on load
    if (devToolsBtn) {
        devToolsBtn.style.display = (currentMode === 'frontend') ? 'flex' : 'none';
    }
  </script>
</body>
</html>`;
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
