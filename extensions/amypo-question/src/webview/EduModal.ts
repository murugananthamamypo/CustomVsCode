/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import axios from 'axios';
import * as https from 'https';

function getUserAgent(): string {
    const platform = process.platform;
    if (platform === 'darwin') {
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AmypoCoder';
    } else if (platform === 'linux') {
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AmypoCoder';
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AmypoCoder';
}

export interface ICourseInfo {
    course_name: string;
    topic_name?: string;
    module_name: string;
    course_type?: number;
    test_type?: string;
    languages?: string[];
    errorMessage?: string | null;
    version?: string;
    shouldRestore?: boolean;
    user_name?: string;
    user_email?: string;
    user_roll_no?: string;
    user_college?: string;
    user_department?: string;
    user_batch?: string;
    user_section?: string;
    storageUrl?: string;
    timer?: number;
}

export class EduViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'amypoEduView';
    private _view?: vscode.WebviewView;
    private _courseInfo?: ICourseInfo;
    private _lastMessage?: any;
    private _webviewReady = false;
    private _onConfirm?: () => void;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.description = 'Amypo Question Panel';
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'ready':
                    this._webviewReady = true;
                    // Re-send last state if we have it
                    if (this._lastMessage) {
                        setTimeout(() => {
                            this.postMessage(this._lastMessage);
                        }, 100);
                    }
                    // Notify extension that webview is ready (for session restore)
                    if (this._onReady) {
                        this._onReady();
                        this._onReady = undefined;
                    }
                    break;
                case 'reload':
                    if (this._onReload) {
                        this._onReload();
                    }
                    break;
                case 'save':
                    if (this._onSave) {
                        this._onSave();
                    }
                    break;
                case 'verify':
                    if (this._onVerify) {
                        this._onVerify();
                    }
                    break;
                case 'pull':
                    if (this._onPull) {
                        this._onPull();
                    }
                    break;
                case 'submit':
                    if (this._onSubmit) {
                        this._onSubmit();
                    }
                    break;
                case 'startTest':
                    if (this._onConfirm) {
                        this._onConfirm();
                    }
                    break;
                case 'fetchPdf':
                    const pdfUrl = message.url;
                    if (pdfUrl) {
                        const agent = new https.Agent({ rejectUnauthorized: false });
                        axios.get(encodeURI(pdfUrl), {
                            responseType: 'arraybuffer',
                            httpsAgent: agent,
                            headers: {
                                'x-client-key': '9f3a7c1d5e8b2a6f4c0d7e1b9a3f6c8d2e5a7b1c4d9f0e6a3b8c2d5f7a1e9c0',
                                'User-Agent': getUserAgent()
                            }
                        })
                            .then(response => {
                                const base64 = Buffer.from(response.data).toString('base64');
                                webviewView.webview.postMessage({
                                    command: 'pdfData',
                                    data: base64
                                });
                            })
                            .catch(err => {
                                console.error('[Amypo] Error downloading PDF:', err);
                                webviewView.webview.postMessage({
                                    command: 'pdfDataError',
                                    error: err.message || 'Failed to download PDF'
                                });
                            });
                    }
                    break;
            }
        });

        // ✅ Always set HTML immediately
        if (this._courseInfo) {
            this._view.webview.html = this._getHtml(this._view.webview, this._extensionUri, this._courseInfo);
        } else if (!this._view.webview.html) {
            // Show loading state until courseInfo arrives
            this._view.webview.html = this._getLoadingHtml();
        }
    }

    private _onReload?: () => void;
    private _onSave?: () => void;
    private _onVerify?: () => void;
    private _onPull?: () => void;
    private _onSubmit?: () => void;
    private _onReady?: () => void;

    public setOnReload(callback: () => void) { this._onReload = callback; }
    public setOnSave(callback: () => void) { this._onSave = callback; }
    public setOnVerify(callback: () => void) { this._onVerify = callback; }
    public setOnPull(callback: () => void) { this._onPull = callback; }
    public setOnSubmit(callback: () => void) { this._onSubmit = callback; }
    public setOnReady(callback: () => void) {
        if (this._webviewReady) {
            // Webview already fired ready — call immediately
            console.log('[Amypo] Webview already ready — firing callback immediately');
            setTimeout(callback, 100);
        } else {
            this._onReady = callback;
        }
    }

    // public updateView(courseInfo: { course_name: string; module_name: string; languages?: string[]; errorMessage?: string }, onConfirm: () => void) {
    public updateView(courseInfo: ICourseInfo, onConfirm: () => void) {
        this._courseInfo = courseInfo;
        this._onConfirm = onConfirm;
        this._webviewReady = false; // Reset — new HTML will fire 'ready' again

        if (this._view) {
            this._view.webview.html = this._getHtml(this._view.webview, this._extensionUri, courseInfo);
            this._view.show?.(true);
        }
    }

    public postMessage(message: any) {
        this._lastMessage = message;
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
        <html><body style="display:flex;align-items:center;justify-content:center;height:100%;
        background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);">
            <div style="text-align:center;">
                <div style="border:4px solid rgba(0,0,0,0.1);width:36px;height:36px;border-radius:50%;border-left-color:#0984e3;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
                <div>Loading Amypo...</div>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            <script>
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ command: 'ready' });
            </script>
        </body></html>`;
    }

    private _getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, courseInfo: ICourseInfo) {
        const nonce = getNonce();
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'logo.png'));

        const languagesHtml = courseInfo.languages && courseInfo.languages.length > 0
            ? `<div class="languages">
				${courseInfo.languages.map((l: any) => `<span class="lang-tag">${l}</span>`).join('')}
			   </div>`
            : '';

        return `<!DOCTYPE html>
        <html lang="en" style="height: 100%; margin: 0; padding: 0; overflow: hidden;">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com; worker-src https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; frame-src https://1102amy21.amypo.ai https://endpoint.amypo.ai https://docs.google.com https://drive.google.com https://mozilla.github.io blob: data:; object-src 'none';">
            <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
            <style>
                :root {
                    --amy-primary: #3b82f6;
                    --amy-primary-hover: #2563eb;
                    --amy-success: #10b981;
                    --amy-success-hover: #059669;
                    --amy-warning: #f59e0b;
                    --amy-danger: #ef4444;
                    --amy-border: var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
                    --amy-bg-card: var(--vscode-editorWidget-background, var(--vscode-sideBar-background, #1e1e1e));
                    --amy-card-hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
                }

                * {
                    box-sizing: border-box;
                }

                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
                    font-size: 13px;
                    line-height: 1.5;
                }

                /* Scrollbar styling */
                ::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: var(--vscode-scrollbarSlider-background, rgba(128, 128, 128, 0.25));
                    border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--vscode-scrollbarSlider-hoverBackground, rgba(128, 128, 128, 0.4));
                }

                /* MODAL / WELCOME SCREEN */
                #modal-wrapper {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    overflow-y: auto;
                    padding: 24px;
                    background: var(--vscode-editor-background);
                    z-index: 100;
                }
                #modal-content {
                    background: var(--amy-bg-card);
                    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
                    border: 1px solid var(--amy-border);
                    border-radius: 16px;
                    width: 100%;
                    max-width: 480px;
                    padding: 36px 32px;
                    text-align: center;
                    box-shadow: 0 20px 48px rgba(0,0,0,0.25);
                    animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: translateY(8px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .illustration {
                    max-width: 150px;
                    height: auto;
                    margin: 0 auto 20px;
                    display: block;
                    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
                }
                .title {
                    font-size: 22px;
                    font-weight: 700;
                    letter-spacing: -0.3px;
                    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
                    margin-bottom: 6px;
                    text-transform: capitalize;
                }
                .subtext {
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 20px;
                    font-weight: 500;
                }
                .languages {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 6px;
                    margin-bottom: 26px;
                }
                .lang-tag {
                    background: var(--vscode-badge-background, rgba(59, 130, 246, 0.15));
                    color: var(--vscode-badge-foreground, var(--vscode-foreground));
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid var(--amy-border);
                    letter-spacing: 0.3px;
                }
                .buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    justify-content: center;
                }
                .btn-start {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: #ffffff;
                    padding: 12px 24px;
                    border-radius: 10px;
                    border: none;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
                    letter-spacing: 0.3px;
                }
                .btn-start:hover {
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
                    transform: translateY(-1px);
                }
                .btn-start:active {
                    transform: translateY(0);
                }

                /* Guidelines */
                .guidelines-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
                    margin-bottom: 20px;
                    text-align: center;
                    letter-spacing: -0.2px;
                }
                .guidelines-list {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 24px 0;
                    font-size: 13px;
                    color: var(--vscode-descriptionForeground);
                    text-align: left;
                    max-height: 320px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .guidelines-list li {
                    display: flex;
                    align-items: flex-start;
                    line-height: 1.5;
                    background: rgba(128, 128, 128, 0.05);
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid var(--amy-border);
                }
                .bullet-icon {
                    min-width: 8px;
                    height: 8px;
                    background-color: var(--amy-success);
                    border-radius: 50%;
                    margin-right: 12px;
                    margin-top: 6px;
                    box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
                }

                /* QUESTION UI SHELL */
                #question-ui {
                    display: none;
                    position: absolute;
                    inset: 0;
                    flex-direction: column;
                    overflow: hidden;
                    background-color: var(--vscode-editor-background);
                }

                /* MODERN HEADER & TOPBAR */
                .topbar {
                    background: var(--vscode-editorWidget-background, var(--amy-bg-card));
                    padding: 8px 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--amy-border);
                    gap: 10px;
                    flex-shrink: 0;
                    position: relative;
                    z-index: 50;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .topbar-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                    flex-wrap: wrap;
                }
                .logo-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    text-decoration: none;
                }
                .logo {
                    height: 22px;
                    width: auto;
                    display: block;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
                }
                .breadcrumb-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    border-left: 1px solid var(--amy-border);
                    padding-left: 10px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .breadcrumb-course {
                    font-weight: 600;
                    color: var(--vscode-foreground);
                    max-width: 140px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .breadcrumb-divider {
                    opacity: 0.5;
                }
                .breadcrumb-module {
                    color: var(--vscode-descriptionForeground);
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .topbar-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }

                /* Modern Chips / Meta pills in Header */
                .meta-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 9px;
                    background: rgba(128, 128, 128, 0.08);
                    border: 1px solid var(--amy-border);
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 500;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.15s ease;
                }
                .meta-chip:hover {
                    background: var(--amy-card-hover);
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                }
                .meta-chip .chip-caret {
                    font-size: 8px;
                    opacity: 0.6;
                    margin-left: 2px;
                }

                /* Assessment Timer Pill */
                .timer-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    color: var(--vscode-foreground);
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    font-family: var(--vscode-editor-font-family, monospace);
                }
                .timer-pulse {
                    width: 7px;
                    height: 7px;
                    background-color: var(--amy-success);
                    border-radius: 50%;
                    box-shadow: 0 0 8px var(--amy-success);
                    animation: pulseDot 2s infinite ease-in-out;
                }
                @keyframes pulseDot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(0.85); }
                }

                /* Version Tag */
                .version-tag {
                    font-size: 10px;
                    background: rgba(59, 130, 246, 0.12);
                    color: #60a5fa;
                    border: 1px solid rgba(59, 130, 246, 0.25);
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                }

                /* Tooltip Card Popovers (Anchored to right, high z-index, solid background) */
                .tooltip-container {
                    position: relative;
                }
                .tooltip-content {
                    display: none;
                    position: absolute;
                    top: calc(100% + 6px);
                    right: 0;
                    left: auto;
                    background: var(--vscode-editorWidget-background, #ffffff);
                    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
                    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
                    border-radius: 8px;
                    box-shadow: 0 12px 32px rgba(0,0,0,0.25);
                    padding: 14px 16px;
                    z-index: 1000;
                    font-size: 12px;
                    min-width: 250px;
                    max-width: 320px;
                    animation: tooltipFadeIn 0.15s ease-out;
                }
                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .tooltip-container:hover .tooltip-content,
                .tooltip-container:focus-within .tooltip-content {
                    display: block;
                }
                .tooltip-title {
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--vscode-foreground);
                    margin-bottom: 10px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid var(--amy-border);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .tooltip-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .tooltip-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 8px;
                    line-height: 1.4;
                }
                .tooltip-row .k {
                    color: var(--vscode-descriptionForeground);
                    font-weight: 500;
                    white-space: nowrap;
                }
                .tooltip-row .v {
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    text-align: right;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                /* MAIN LAYOUT */
                .main-layout {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    margin: 10px 12px 68px 12px;
                    z-index: 1;
                }
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    margin: 10px 12px 68px 12px;
                }
                .content-area {
                    flex: 1;
                    background: var(--vscode-editor-background);
                    border-radius: 10px;
                    border: 1px solid var(--amy-border);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                }

                /* MODERN NAVIGATION & SEGMENTED TABS */
                .content-header {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--amy-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--amy-bg-card);
                    border-radius: 10px 10px 0 0;
                    gap: 8px;
                }
                .tab-segment-group {
                    display: flex;
                    align-items: center;
                    background: rgba(128, 128, 128, 0.1);
                    padding: 3px;
                    border-radius: 8px;
                    gap: 2px;
                }
                .tab-btn {
                    padding: 6px 14px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--vscode-descriptionForeground);
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    user-select: none;
                }
                .tab-btn:hover {
                    color: var(--vscode-foreground);
                    background: rgba(128, 128, 128, 0.08);
                }
                .tab-btn.active {
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
                }
                .tab-badge {
                    font-size: 9px;
                    padding: 1px 6px;
                    border-radius: 10px;
                    background: rgba(59, 130, 246, 0.18);
                    color: #60a5fa;
                    font-weight: 700;
                }

                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .icon-action-btn {
                    padding: 5px 9px;
                    border-radius: 6px;
                    border: 1px solid var(--amy-border);
                    background: transparent;
                    color: var(--vscode-foreground);
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    transition: all 0.15s ease;
                }
                .icon-action-btn:hover {
                    background: var(--amy-card-hover);
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                }

                /* QUESTION BODY */
                .question-body {
                    padding: 20px;
                    flex: 1;
                    overflow-y: auto;
                    color: var(--vscode-editor-foreground);
                    user-select: none;
                    -webkit-user-select: none;
                }
                .q-header-row {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 18px;
                    padding-bottom: 14px;
                    border-bottom: 1px solid var(--amy-border);
                }
                .q-title {
                    font-size: 20px;
                    font-weight: 700;
                    letter-spacing: -0.3px;
                    line-height: 1.3;
                    margin: 0;
                    color: var(--vscode-foreground);
                }
                .marks-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: rgba(245, 158, 11, 0.12);
                    color: #fbbf24;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    border-radius: 6px;
                    padding: 4px 10px;
                    font-size: 11px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .q-description {
                    font-size: 13.5px;
                    line-height: 1.7;
                    margin-bottom: 24px;
                    overflow-wrap: break-word;
                    color: var(--vscode-editor-foreground);
                }
                .q-description *, .q-title * {
                    color: var(--vscode-editor-foreground) !important;
                }
                .q-description img {
                    max-width: 100%;
                    height: auto;
                    margin: 16px 0 24px 0;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                    display: block !important;
                    float: none !important;
                    border: 1px solid var(--amy-border);
                }
                .q-description ul, .q-description ol {
                    padding-left: 22px;
                    margin-bottom: 16px;
                }
                .q-description li {
                    margin-bottom: 6px;
                    line-height: 1.6;
                }
                .q-description table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 18px 0;
                    border-radius: 6px;
                    overflow: hidden;
                    border: 1px solid var(--amy-border);
                }
                .q-description th {
                    background: rgba(128, 128, 128, 0.1);
                    font-weight: 600;
                    border: 1px solid var(--amy-border);
                    padding: 8px 12px;
                    text-align: left;
                }
                .q-description td {
                    border: 1px solid var(--amy-border);
                    padding: 8px 12px;
                    text-align: left;
                }
                .q-description pre {
                    background: rgba(0, 0, 0, 0.25);
                    border: 1px solid var(--amy-border);
                    padding: 14px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 16px 0;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 12.5px;
                    line-height: 1.5;
                }
                .q-description code {
                    font-family: var(--vscode-editor-font-family, monospace);
                    background: rgba(128, 128, 128, 0.15);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                }

                /* SRS VIEW */
                #src-view {
                    flex: 1;
                    display: none;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    position: relative;
                    user-select: none;
                    -webkit-user-select: none;
                }
                .srs-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 14px;
                    background: var(--amy-bg-card);
                    border-bottom: 1px solid var(--amy-border);
                    position: relative;
                    z-index: 70;
                    gap: 12px;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
                }
                .srs-toolbar-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .srs-btn {
                    background: rgba(128, 128, 128, 0.1);
                    color: var(--vscode-foreground);
                    border: 1px solid var(--amy-border);
                    border-radius: 6px;
                    padding: 2px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                    height: 28px;
                    transition: all 0.15s ease;
                }
                .srs-btn:hover {
                    background: var(--amy-card-hover);
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                }
                .srs-zoom-val {
                    font-size: 11.5px;
                    font-weight: 700;
                    min-width: 44px;
                    text-align: center;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-editor-font-family, monospace);
                }
                .srs-search-input {
                    background: var(--vscode-input-background, rgba(0,0,0,0.1));
                    color: var(--vscode-input-foreground, var(--vscode-foreground));
                    border: 1px solid var(--vscode-input-border, var(--amy-border));
                    border-radius: 6px;
                    padding: 4px 10px;
                    font-size: 12px;
                    height: 28px;
                    width: 140px;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .srs-search-input:focus {
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                }
                .srs-search-results {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    min-width: 60px;
                    text-align: center;
                }

                /* MODERN ACTION BAR */
                .action-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 60px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    padding: 8px 12px;
                    background: var(--amy-bg-card);
                    border-top: 1px solid var(--amy-border);
                    box-shadow: 0 -2px 10px rgba(0,0,0,0.06);
                    z-index: 50;
                }
                .action-bar-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                }
                .action-bar-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                    justify-content: flex-end;
                }

                .btn-action {
                    flex: 1;
                    height: 42px;
                    padding: 0 12px;
                    border-radius: 8px;
                    border: 1px solid var(--amy-border);
                    background: rgba(128, 128, 128, 0.08);
                    color: var(--vscode-foreground);
                    font-size: 12.5px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 2px;
                    user-select: none;
                    text-decoration: none;
                }
                .btn-action:hover:not(:disabled) {
                    background: var(--amy-card-hover);
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                    transform: translateY(-1px);
                    box-shadow: 0 3px 8px rgba(0,0,0,0.12);
                }
                .btn-action:active:not(:disabled) {
                    transform: translateY(0);
                }
                .btn-action:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                    transform: none !important;
                    box-shadow: none !important;
                }

                .btn-action .btn-inner-row {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                /* Primary Verification Button */
                .btn-verify {
                    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                    color: #ffffff !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
                }
                .btn-verify:hover:not(:disabled) {
                    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
                    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);
                }

                /* Final Submit Button */
                .btn-submit {
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                    color: #ffffff !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.3);
                }
                .btn-submit:hover:not(:disabled) {
                    background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
                    box-shadow: 0 4px 14px rgba(234, 88, 12, 0.45);
                }

                .save-time {
                    font-size: 10px;
                    opacity: 0.8;
                    font-weight: 400;
                    margin-top: -1px;
                }

                /* STATUS NOTIFICATIONS */
                .status-msg {
                    position: fixed;
                    top: 56px;
                    right: 20px;
                    z-index: 9999;
                    font-size: 12.5px;
                    font-weight: 600;
                    display: none;
                    padding: 10px 16px;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                    animation: slideInNotification 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    max-width: 320px;
                }
                @keyframes slideInNotification {
                    from { transform: translateX(40px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .status-msg.success { display: block; background: #059669; color: white; border: none; }
                .status-msg.error { display: block; background: #dc2626; color: white; border: none; }
                .status-msg.info { display: block; background: #2563eb; color: white; border: none; }

                /* SPINNERS & LOADERS */
                .loader-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--vscode-descriptionForeground);
                }
                .spinner {
                    border: 3px solid var(--amy-border);
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border-left-color: var(--amy-primary);
                    animation: amySpin 0.9s linear infinite;
                    margin-bottom: 14px;
                }
                .btn-spinner {
                    width: 12px;
                    height: 12px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top-color: #ffffff;
                    animation: amySpin 0.8s linear infinite;
                    display: none;
                }
                @keyframes amySpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

                /* VERIFICATION TERMINAL OVERLAY */
                .verify-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    z-index: 9999;
                    display: none;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .verify-modal {
                    background: var(--amy-bg-card);
                    padding: 32px;
                    border-radius: 14px;
                    border: 1px solid var(--amy-border);
                    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    max-width: 520px;
                    animation: modalFadeIn 0.3s ease-out;
                }
                .verify-terminal {
                    background: #090d16;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 20px;
                    width: 100%;
                    height: 170px;
                    box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 12.5px;
                    color: #60a5fa;
                    margin-bottom: 20px;
                    position: relative;
                    overflow: hidden;
                }
                .verify-term-line { display: none; }
                .verify-term-line.active { display: block; animation: modalFadeIn 0.25s ease-out forwards; }
                .verify-term-line.current { color: #93c5fd; text-shadow: 0 0 8px rgba(147, 197, 253, 0.6); position: relative; }
                .verify-spinner {
                    display: inline-block;
                    width: 11px;
                    height: 11px;
                    border: 2px solid rgba(147, 197, 253, 0.3);
                    border-radius: 50%;
                    border-top-color: #93c5fd;
                    animation: amySpin 0.8s linear infinite;
                    margin-left: 8px;
                    vertical-align: middle;
                }
                .verify-text {
                    font-size: 14px;
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    text-align: center;
                }

                /* RESULTS MODAL (THEME-AWARE) */
                .result-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(3px);
                    z-index: 10000;
                    display: none;
                    align-items: flex-start;
                    justify-content: center;
                    overflow-y: auto;
                    padding: 30px 16px;
                }
                .result-modal {
                    margin: auto;
                    background: var(--amy-bg-card);
                    color: var(--vscode-foreground);
                    border: 1px solid var(--amy-border);
                    width: 100%;
                    max-width: 840px;
                    border-radius: 14px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    padding: 28px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                }
                .result-close {
                    position: absolute;
                    right: 18px;
                    top: 16px;
                    cursor: pointer;
                    font-size: 20px;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--vscode-descriptionForeground);
                    transition: all 0.15s ease;
                }
                .result-close:hover {
                    background: rgba(128, 128, 128, 0.15);
                    color: var(--vscode-foreground);
                }
                .result-header {
                    background: rgba(128, 128, 128, 0.08);
                    border: 1px solid var(--amy-border);
                    border-radius: 8px;
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    margin-bottom: 20px;
                    font-size: 13px;
                }
                .result-section-label {
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--vscode-foreground);
                    margin-bottom: 14px;
                    text-align: left;
                    width: 100%;
                }
                .result-cards {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 12px;
                    margin-bottom: 24px;
                    width: 100%;
                }
                .result-card {
                    border: 1px solid var(--amy-border);
                    border-radius: 10px;
                    padding: 16px 10px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    background: rgba(128, 128, 128, 0.05);
                }
                .result-card-val {
                    font-size: 26px;
                    font-weight: 800;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-editor-font-family, monospace);
                }
                .result-card-label {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .result-card.passed {
                    border-color: rgba(16, 185, 129, 0.3);
                    background: rgba(16, 185, 129, 0.08);
                }
                .result-card.passed .result-card-val,
                .result-card.passed .result-card-label {
                    color: #10b981;
                }
                .result-card.failed {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: rgba(239, 68, 68, 0.08);
                }
                .result-card.failed .result-card-val,
                .result-card.failed .result-card-label {
                    color: #ef4444;
                }
                .result-card.score {
                    border-color: rgba(245, 158, 11, 0.3);
                    background: rgba(245, 158, 11, 0.08);
                }
                .result-card.score .result-card-val,
                .result-card.score .result-card-label {
                    color: #f59e0b;
                }

                .terminal-box {
                    border: 1px solid var(--amy-border);
                    border-radius: 8px;
                    padding: 14px;
                    background: rgba(0, 0, 0, 0.25);
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 12px;
                    min-height: 80px;
                    max-height: 260px;
                    overflow-y: auto;
                    text-align: left;
                    width: 100%;
                }
                .terminal-empty {
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    padding: 20px;
                }

                /* RESPONSIVE QUERIES */
                @media (max-width: 600px) {
                    .topbar {
                        padding: 8px 12px;
                        gap: 8px;
                    }
                    .breadcrumb-wrapper {
                        display: none;
                    }
                    .result-cards {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .action-bar {
                        padding: 6px 8px;
                        gap: 6px;
                    }
                    .btn-action {
                        font-size: 11.5px;
                        padding: 0 6px;
                    }
                }
            </style>
        </head>
        <body>
            <!-- MODAL VIEWS -->
            <div id="modal-wrapper" style="${courseInfo.shouldRestore ? 'display: none;' : ''}">
                <div id="modal-content">
                    <div id="step1">
                        <img src="${logoUri}" alt="Amypo" class="illustration">
                        <div class="title">${courseInfo.module_name}</div>
                        <div class="subtext">${courseInfo.course_name}</div>
                        ${languagesHtml}
                        ${courseInfo.errorMessage ? `<div style="color: #ef4444; margin-top: 16px; font-weight: 600; text-align: center; border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.08);">${courseInfo.errorMessage}</div>` :
                `<div class="buttons">
                            <button class="btn-start" id="start">Start Assessment</button>
                        </div>`}
                    </div>

                    <div id="step2" style="display: none;">
                        <div class="guidelines-title">Assessment Guidelines</div>
                        <ul class="guidelines-list">
                            <li><div class="bullet-icon"></div><div>To ensure optimal performance during the test, we recommend using the latest version of Google Chrome (version 60 or above).</div></li>
                            <li><div class="bullet-icon"></div><div>Your computer system must maintain steady and uninterrupted internet connectivity. For a smooth testing experience, both your download and upload speeds should be at least 2 Mbps.</div></li>
                            <li><div class="bullet-icon"></div><div>Confirm that your computer's system clock is accurately set to the (GMT +5:30) Mumbai, Kolkata, Chennai, New Delhi timezone. A mismatch in time can result in test discrepancies.</div></li>
                            <li><div class="bullet-icon"></div><div>Avoid switching tabs during the test. Any such activity can lead to an automatic and premature submission of your test.</div></li>
                            <li><div class="bullet-icon"></div><div>Notifications or pop-ups appearing during the test will be interpreted as tab switches, which may cause your test to close prematurely. It is strongly advised to turn off these distractions before starting.</div></li>
                        </ul>
                        <div class="buttons">
                            <button class="btn-start" id="continue">I Agree & Continue</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- QUESTION FULL UI -->
            <div id="question-ui" style="${courseInfo.shouldRestore ? 'display: flex;' : ''}">
                <div class="topbar">
                    <div class="topbar-left">
                        <div class="logo-container">
                            <img src="${logoUri}" alt="Amypo" class="logo">
                        </div>
                        <div class="breadcrumb-wrapper" title="${courseInfo.course_name} / ${courseInfo.module_name}">
                            <span class="breadcrumb-course">${courseInfo.course_name || 'Course'}</span>
                            <span class="breadcrumb-divider">/</span>
                            <span class="breadcrumb-module">${courseInfo.module_name || 'Module'}</span>
                        </div>
                    </div>

                    <div class="topbar-right">
                        <!-- Live Assessment Timer -->
                        <div class="timer-pill" id="test-timer-badge" title="Assessment Duration">
                            <span class="timer-pulse"></span>
                            <span style="font-size: 11px;">⏱️</span>
                            <span id="test-timer-display">00:00:00</span>
                        </div>

                        <!-- User Profile Popover -->
                        <div class="tooltip-container">
                            <div class="meta-chip" tabindex="0">
                                <span>👤</span>
                                <span>${courseInfo.user_name ? courseInfo.user_name.split(' ')[0] : 'Candidate'}</span>
                                <span class="chip-caret">▾</span>
                            </div>
                            <div class="tooltip-content">
                                <div class="tooltip-title"><span>👤</span> Candidate Profile</div>
                                <div class="tooltip-grid">
                                    <div class="tooltip-row"><span class="k">Name</span><span class="v">${courseInfo.user_name || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Email</span><span class="v">${courseInfo.user_email || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Roll No</span><span class="v">${courseInfo.user_roll_no || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">College</span><span class="v">${courseInfo.user_college || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Department</span><span class="v">${courseInfo.user_department || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Batch / Sec</span><span class="v">${(courseInfo.user_batch || '-') + ' / ' + (courseInfo.user_section || '-')}</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Course Meta Popover -->
                        <div class="tooltip-container">
                            <div class="meta-chip" tabindex="0">
                                <span>📚</span>
                                <span>Details</span>
                                <span class="chip-caret">▾</span>
                            </div>
                            <div class="tooltip-content">
                                <div class="tooltip-title"><span>📚</span> Assessment Overview</div>
                                <div class="tooltip-grid">
                                    <div class="tooltip-row"><span class="k">Course</span><span class="v">${courseInfo.course_name || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Topic</span><span class="v">${courseInfo.topic_name || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Module</span><span class="v">${courseInfo.module_name || 'N/A'}</span></div>
                                    <div class="tooltip-row"><span class="k">Test Type</span><span class="v">${courseInfo.test_type || 'Assessment'}</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Version Tag -->
                        <span class="version-tag">
                            v${courseInfo.version ?? '1.0.6'}
                        </span>
                    </div>
                </div>

                <div class="main-layout">
                    <div class="content-area">
                        <div class="content-header">
                            <div class="tab-segment-group">
                                <button class="tab-btn active" id="tab-q">
                                    <span>📋</span> Question
                                </button>
                                <button class="tab-btn" id="tab-src" style="display: none;">
                                    <span>📄</span> SRS Spec
                                    <span class="tab-badge">PDF</span>
                                </button>
                            </div>

                            <div class="header-actions">
                                <button class="icon-action-btn" id="view-res-btn" style="display: none;" title="Open Test Results">
                                    <span>📊</span> Results
                                </button>
                            </div>
                        </div>

                        <div id="content-container" class="question-body" style="display: flex; flex-direction: column; padding: 0;">
                            <!-- Loader -->
                            <div class="loader-container" id="loader" style="padding: 24px;">
                                <div class="spinner"></div>
                                <div style="font-weight: 500;">Loading test environment...</div>
                            </div>

                            <!-- Error -->
                            <div id="error-view" style="display: none; color: #ef4444; text-align: center; margin-top: 40px; padding: 24px;">
                                <h2 id="error-msg">Failed to load test.</h2>
                            </div>

                            <!-- Content -->
                            <div id="data-view" style="display: none; height: 100%; flex-direction: column;">
                                <div id="q-content" style="flex: 1; overflow-y: auto; padding: 20px;">
                                    <div class="q-header-row">
                                        <div class="q-title" id="q-title">Loading Question...</div>
                                        <div class="marks-badge" id="q-marks-badge" style="display: none;">
                                            <span>✨</span> <span id="q-marks-val">0</span> Marks
                                        </div>
                                    </div>
                                    <div class="q-description" id="q-desc"></div>
                                </div>

                                <div id="status-bar" class="status-msg"></div>
                            </div>

                            <!-- SRC View -->
                            <div id="src-view" style="height: 100%; display: none; flex-direction: column; position: relative;" oncontextmenu="return false;">
                                <div class="srs-toolbar" id="srs-toolbar-bar" style="display: none;">
                                    <div class="srs-toolbar-group">
                                        <button class="srs-btn" id="srs-zoom-out" title="Zoom Out">➖</button>
                                        <span class="srs-zoom-val" id="srs-zoom-val">100%</span>
                                        <button class="srs-btn" id="srs-zoom-in" title="Zoom In">➕</button>
                                    </div>
                                    <div class="srs-toolbar-group">
                                        <input type="text" class="srs-search-input" id="srs-search-input" placeholder="Find in SRS..." />
                                        <span class="srs-search-results" id="srs-search-results">0 matches</span>
                                        <button class="srs-btn" id="srs-search-prev" title="Previous match">▲</button>
                                        <button class="srs-btn" id="srs-search-next" title="Next match">▼</button>
                                    </div>
                                </div>
                                <div id="src-loader" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); position: absolute; inset: 0; background: var(--vscode-editor-background); z-index: 10;">
                                    <div class="spinner"></div>
                                    <div style="font-weight: 500;">Loading SRS document...</div>
                                </div>
                                <div id="pdf-container" style="flex: 1; overflow: auto; padding: 16px; background: var(--vscode-editor-background); display: none; flex-direction: column;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modern Action Bar -->
                <div class="action-bar">
                    <div class="action-bar-left">
                        <button class="btn-action" id="save-btn" title="Save workspace state to cloud">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="save-spinner"></div>
                                <span>💾 Save</span>
                            </div>
                            <div class="save-time">
                                <span>Saved: </span><span id="last-saved-time">ready</span>
                            </div>
                        </button>
                        <button class="btn-action" id="pull-btn" title="Pull latest changes from remote repository">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="pull-spinner"></div>
                                <span>⬇️ Pull</span>
                            </div>
                            <span class="save-time">Sync code</span>
                        </button>
                    </div>

                    <div class="action-bar-right">
                        <button class="btn-action btn-verify" id="verify-btn" title="Run tests and verify implementation">
                            <div class="btn-inner-row">
                                <span>⚡ Check Verify</span>
                            </div>
                            <span class="save-time">Run testcases</span>
                        </button>
                        <button class="btn-action btn-submit" id="submit-btn" title="Final submission of your assessment">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="submit-spinner"></div>
                                <span>🚀 Final Submit</span>
                            </div>
                            <span class="save-time">Grade assessment</span>
                        </button>
                    </div>
                </div>

                <!-- Verification Loader UI -->
                <div id="verify-overlay" class="verify-overlay">
                    <div class="verify-modal">
                        <div class="verify-terminal" id="verify-terminal">
                            <div class="verify-term-line" id="vline-1"><span>> Checking modules...</span></div>
                            <div class="verify-term-line" id="vline-2"><span>> Loading assets...</span></div>
                            <div class="verify-term-line" id="vline-3"><span>> Validating signature...</span></div>
                            <div class="verify-term-line" id="vline-4"><span>> Running scan...</span></div>
                            <div class="verify-term-line" id="vline-5"><span>> Checking dependencies...</span></div>
                            <div class="verify-term-line" id="vline-6"><span>> Verification in progress...<div class="verify-spinner"></div></span></div>
                        </div>
                        <div class="verify-text">Verification is in Progress...</div>
                    </div>
                </div>

                <!-- Test Result Modal -->
                <div id="result-overlay" class="result-overlay">
                    <div class="result-modal">
                        <div class="result-close" id="result-close">&times;</div>
                        <div class="result-header">
                            <span>📊</span> Test Results Overview
                        </div>

                        <div class="result-section-label">Test Results Summary</div>
                        <div class="result-cards">
                            <div class="result-card">
                                <span class="result-card-val" id="res-total">0</span>
                                <span class="result-card-label">Total</span>
                            </div>
                            <div class="result-card passed">
                                <span class="result-card-val" id="res-passed">0</span>
                                <span class="result-card-label">Passed</span>
                            </div>
                            <div class="result-card failed">
                                <span class="result-card-val" id="res-failed">0</span>
                                <span class="result-card-label">Failed</span>
                            </div>
                            <div class="result-card score">
                                <span class="result-card-val" id="res-score">0.00</span>
                                <span class="result-card-label">Score</span>
                            </div>
                        </div>

                        <div id="res-test-cases-section" style="display: none; margin-bottom: 25px; width: 100%;">
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 13px; margin-bottom: 8px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-passed-tests" style="min-height: 50px; max-height: 150px; overflow-y: auto; overflow-wrap: break-word; color: #10b981;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 13px; margin-bottom: 8px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-failed-tests" style="min-height: 50px; max-height: 150px; overflow-y: auto; overflow-wrap: break-word; color: #ef4444;">None</div>
                                </div>
                            </div>
                        </div>

                        <!-- FULLSTACK BREAKDOWN -->
                        <div id="res-fs-cases-section" style="display: none; margin-bottom: 25px; width: 100%;">
                            <h4 style="margin: 10px 0 6px 0; font-size: 13px; font-weight: 600;">Spring Boot Test Results</h4>
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 11px; margin-bottom: 5px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-fs-spring-passed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; color: #10b981;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 11px; margin-bottom: 5px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-fs-spring-failed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; color: #ef4444;">None</div>
                                </div>
                            </div>

                            <h4 style="margin: 10px 0 6px 0; font-size: 13px; font-weight: 600;">React Test Results</h4>
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 11px; margin-bottom: 5px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-fs-react-passed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; color: #10b981;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 11px; margin-bottom: 5px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-fs-react-failed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; color: #ef4444;">None</div>
                                </div>
                            </div>

                            <div class="result-header"><span>☕</span> Spring Boot Terminal Output</div>
                            <div class="terminal-box" id="res-fs-spring-terminal" style="max-height: 180px; overflow-y: auto;"></div>

                            <div class="result-header" style="margin-top: 14px;"><span>⚛️</span> React Terminal Output</div>
                            <div class="terminal-box" id="res-fs-react-terminal" style="max-height: 180px; overflow-y: auto;"></div>
                        </div>

                        <!-- STANDARD FALLBACK -->
                        <div id="standard-terminal-section" style="display: block;">
                            <div class="result-header">
                                <span>💻</span> Terminal Output
                            </div>
                            <div class="terminal-box" id="res-terminal">No output from Terminal</div>
                        </div>
                    </div>
                </div>

            </div>
            <script nonce="${nonce}">
                let vInterval = null;
                let expectedTestCount = 0;
                let totalQuestionMark = 0;
                let currentQData = null;
                const storageUrl = "${courseInfo.storageUrl || ''}";
                const vscode = acquireVsCodeApi();

                // Live Timer Logic
                let timerElapsedSeconds = 0;
                let timerIntervalId = null;

                function initAssessmentTimer(startSec = 0) {
                    timerElapsedSeconds = startSec;
                    if (timerIntervalId) clearInterval(timerIntervalId);
                    updateTimerUI();
                    timerIntervalId = setInterval(() => {
                        timerElapsedSeconds++;
                        updateTimerUI();
                    }, 1000);
                }

                function updateTimerUI() {
                    const el = document.getElementById('test-timer-display');
                    if (!el) return;
                    const h = String(Math.floor(timerElapsedSeconds / 3600)).padStart(2, '0');
                    const m = String(Math.floor((timerElapsedSeconds % 3600) / 60)).padStart(2, '0');
                    const s = String(timerElapsedSeconds % 60).padStart(2, '0');
                    el.innerText = h + ':' + m + ':' + s;
                }

                // Cloud Sync Indicator
                function setSyncStatus(state, label) {
                    const dot = document.getElementById('sync-dot');
                    const lbl = document.getElementById('sync-label');
                    if (dot) dot.className = 'sync-indicator ' + state;
                    if (lbl && label) lbl.innerText = label;
                }

                function switchTab(tab) {
                    const tabQ = document.getElementById('tab-q');
                    const tabSrc = document.getElementById('tab-src');
                    const viewQ = document.getElementById('data-view');
                    const viewSrc = document.getElementById('src-view');
                    const pdfContainer = document.getElementById('pdf-container');

                    if (tab === 'Q') {
                        tabQ.classList.add('active');
                        tabSrc.classList.remove('active');
                        viewQ.style.display = 'flex';
                        viewSrc.style.display = 'none';
                    } else if (tab === 'SRC') {
                        tabQ.classList.remove('active');
                        tabSrc.classList.add('active');
                        viewQ.style.display = 'none';
                        viewSrc.style.display = 'flex';

                        // CACHE CHECK: If PDF is already rendered in DOM, show instantly and return
                        if (pdfContainer && pdfContainer.children.length > 0) {
                            const srcLoader = document.getElementById('src-loader');
                            if (srcLoader) srcLoader.style.display = 'none';
                            pdfContainer.style.display = 'flex';
                            const srsBar = document.getElementById('srs-toolbar-bar');
                            if (srsBar) srsBar.style.display = 'flex';
                            return;
                        }

                        let hasSrs = false;
                        if (currentQData && currentQData.testcases) {
                            try {
                                const tc = typeof currentQData.testcases === 'string'
                                    ? JSON.parse(currentQData.testcases)
                                    : currentQData.testcases;

                                if (tc.src && tc.src.length > 0 && tc.path) {
                                    hasSrs = true;
                                    const pdfFile = tc.src[0];
                                    let pdfPath = tc.path;

                                    const origin = storageUrl.split('/').slice(0, 3).join('/');
                                    const pathSegments = pdfPath.split('/').filter(Boolean);
                                    if (pathSegments.length > 0 && pathSegments[0] === 'storage') {
                                        pathSegments.shift();
                                    }
                                    const fullUrl = origin + '/storage/' + pathSegments.join('/') + '/' + pdfFile;

                                    console.log('[Amypo] Requesting PDF from extension host:', fullUrl);

                                    // Show the loader and hide the iframe initially
                                    const srcLoader = document.getElementById('src-loader');
                                    if (srcLoader) {
                                        srcLoader.style.display = 'flex';
                                        const loaderText = srcLoader.querySelector('div:nth-child(2)');
                                        if (loaderText) {
                                            loaderText.innerText = 'Loading SRS document...';
                                            loaderText.style.color = 'var(--vscode-descriptionForeground)';
                                        }
                                        const spinner = srcLoader.querySelector('.spinner');
                                        if (spinner) {
                                            spinner.style.display = 'block';
                                        }
                                    }
                                    if (pdfContainer) {
                                        pdfContainer.style.display = 'none';
                                        pdfContainer.innerHTML = '';
                                    }
                                    const srsBar = document.getElementById('srs-toolbar-bar');
                                    if (srsBar) srsBar.style.display = 'none';
                                    const sSearch = document.getElementById('srs-search-input');
                                    if (sSearch) sSearch.value = '';
                                    const sResults = document.getElementById('srs-search-results');
                                    if (sResults) sResults.innerText = '0 matches';

                                    // Send message to extension host to download PDF and convert to base64
                                    vscode.postMessage({ command: 'fetchPdf', url: fullUrl });
                                }
                            } catch (e) {
                                console.error('[Amypo] Error parsing testcases for PDF:', e);
                            }
                        }

                        if (!hasSrs) {
                            const srcLoader = document.getElementById('src-loader');
                            if (srcLoader) {
                                srcLoader.style.display = 'flex';
                                const loaderText = srcLoader.querySelector('div:nth-child(2)');
                                if (loaderText) {
                                    loaderText.innerText = 'SRS document is not available for this project.';
                                    loaderText.style.color = 'var(--vscode-descriptionForeground)';
                                }
                                const spinner = srcLoader.querySelector('.spinner');
                                if (spinner) {
                                    spinner.style.display = 'none';
                                }
                            }
                            const srsBar = document.getElementById('srs-toolbar-bar');
                            if (srsBar) srsBar.style.display = 'none';
                            if (pdfContainer) {
                                pdfContainer.style.display = 'none';
                                pdfContainer.innerHTML = '';
                            }
                        }
                    }
                }

                const tqBtn = document.getElementById('tab-q');
                if (tqBtn) tqBtn.onclick = () => switchTab('Q');
                const tsBtn = document.getElementById('tab-src');
                if (tsBtn) tsBtn.onclick = () => switchTab('SRC');

                const resOverlay = document.getElementById('result-overlay');
                const resClose = document.getElementById('result-close');
                if (resClose) {
                    resClose.onclick = () => { if(resOverlay) resOverlay.style.display = 'none'; };
                }

                const viewResBtn = document.getElementById('view-res-btn');
                if (viewResBtn) {
                    viewResBtn.onclick = () => {
                        if (resOverlay) resOverlay.style.display = 'flex';
                    };
                }

                const startBtn = document.getElementById('start');
                if (startBtn) {
                    startBtn.onclick = () => {
                        document.getElementById('step1').style.display = 'none';
                        document.getElementById('step2').style.display = 'block';
                    };
                }

                const continueBtn = document.getElementById('continue');
                if (continueBtn) {
                    continueBtn.onclick = () => {
                        vscode.postMessage({ command: 'startTest' });
                    };
                }

                const reloadBtn = document.getElementById('reload-btn');
                if (reloadBtn) {
                    reloadBtn.onclick = () => {
                        vscode.postMessage({ command: 'reload' });
                    };
                }

                const saveBtn = document.getElementById('save-btn');
                if (saveBtn) {
                    saveBtn.onclick = () => {
                        const status = document.getElementById('status-bar');
                        if (status) {
                            status.className = 'status-msg info';
                            status.style.display = 'block';
                            status.innerText = 'Saving...';
                        }

                        setSyncStatus('syncing', 'Syncing...');
                        saveBtn.disabled = true;
                        document.getElementById('save-spinner').style.display = 'block';

                        vscode.postMessage({ command: 'save' });
                    };
                }

                const verifyBtn = document.getElementById('verify-btn');
                if (verifyBtn) {
                    verifyBtn.onclick = () => {
                        verifyBtn.disabled = true;

                        const vOverlay = document.getElementById('verify-overlay');
                        if(vOverlay) vOverlay.style.display = 'flex';

                        // Reset all lines
                        for (let i = 1; i <= 6; i++) {
                            const line = document.getElementById('vline-' + i);
                            if(line) line.className = 'verify-term-line';
                        }

                        let currentLine = 1;
                        if (vInterval) clearInterval(vInterval);

                        vInterval = setInterval(() => {
                            if (currentLine <= 6) {
                                if (currentLine > 1) {
                                    const prev = document.getElementById('vline-' + (currentLine - 1));
                                    if(prev) prev.className = 'verify-term-line active';
                                }
                                const curr = document.getElementById('vline-' + currentLine);
                                if(curr) curr.className = 'verify-term-line active current';
                                currentLine++;
                            } else {
                                clearInterval(vInterval);
                            }
                        }, 800);

                        vscode.postMessage({ command: 'verify' });
                    };
                }

                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn) {
                    submitBtn.onclick = () => {
                        const confirmSubmit = confirm('Are you sure you want to finalize and submit your assessment? This will record your final score.');
                        if (!confirmSubmit) return;

                        const status = document.getElementById('status-bar');
                        if (status) {
                            status.className = 'status-msg info';
                            status.style.display = 'block';
                            status.innerText = 'Submitting Final Results...';
                        }

                        submitBtn.disabled = true;
                        document.getElementById('submit-spinner').style.display = 'block';

                        vscode.postMessage({ command: 'submit' });
                    };
                }

                const pullBtn = document.getElementById('pull-btn');
                if (pullBtn) {
                    pullBtn.onclick = () => {
                        const status = document.getElementById('status-bar');
                        if (status) {
                            status.className = 'status-msg info';
                            status.style.display = 'block';
                            status.innerText = 'Pulling...';
                        }
                        pullBtn.disabled = true;
                        const spinner = document.getElementById('pull-spinner');
                        if (spinner) spinner.style.display = 'block';

                        vscode.postMessage({ command: 'pull' });
                    };
                }

                let lastSavedTimestamp = null;
                function updateRelativeTime() {
                    if (!lastSavedTimestamp) return;
                    const el = document.getElementById('last-saved-time');
                    if (!el) return;

                    const diff = Math.floor((Date.now() - lastSavedTimestamp) / 1000);
                    if (diff < 5) el.innerText = 'just now';
                    else if (diff < 60) el.innerText = diff + 's ago';
                    else if (diff < 3600) el.innerText = Math.floor(diff / 60) + 'm ago';
                    else el.innerText = Math.floor(diff / 3600) + 'h ago';
                }
                setInterval(updateRelativeTime, 10000);

                // Start live timer if already restoring
                if (${courseInfo.shouldRestore ? 'true' : 'false'}) {
                    initAssessmentTimer(0);
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    const wrapper = document.getElementById('modal-wrapper');
                    const qUi = document.getElementById('question-ui');

                    if (message.command === 'pdfData') {
                        const base64 = message.data;
                        const bin = atob(base64);
                        const len = bin.length;
                        const arr = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            arr[i] = bin.charCodeAt(i);
                        }

                        const container = document.getElementById('pdf-container');
                        if (container) {
                            container.innerHTML = '';
                        }

                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

                        const loadingTask = pdfjsLib.getDocument({ data: arr });
                        loadingTask.promise.then(function(pdf) {
                            console.log('[Amypo] PDF loaded, pages:', pdf.numPages);

                            let renderedCount = 0;
                            const totalPages = pdf.numPages;

                            // Text Indexing and Context mapping
                            const pdfTextContent = [];
                            for (let i = 0; i < totalPages; i++) {
                                pdfTextContent.push(null);
                            }

                            // Initialize canvases
                            const canvases = [];
                            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                                // Create page wrapper
                                const wrapper = document.createElement('div');
                                wrapper.className = 'pdf-page-wrapper';
                                wrapper.style.position = 'relative';
                                wrapper.style.margin = '0 auto 20px auto';
                                wrapper.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
                                wrapper.style.borderRadius = '4px';
                                wrapper.style.width = '100%';
                                wrapper.style.maxWidth = 'none'; // Essential: remove maxWidth to allow zoom past 100%
                                wrapper.style.background = '#ffffff';
                                wrapper.style.transition = 'outline 0.3s ease';

                                // Create page render canvas
                                const canvas = document.createElement('canvas');
                                canvas.style.display = 'block';
                                canvas.style.width = '100%';
                                canvas.style.height = 'auto';
                                wrapper.appendChild(canvas);

                                // Create highlight overlay canvas
                                const hlCanvas = document.createElement('canvas');
                                hlCanvas.style.position = 'absolute';
                                hlCanvas.style.top = '0';
                                hlCanvas.style.left = '0';
                                hlCanvas.style.width = '100%';
                                hlCanvas.style.height = '100%';
                                hlCanvas.style.pointerEvents = 'none';
                                wrapper.appendChild(hlCanvas);

                                if (container) container.appendChild(wrapper);
                                canvases.push({ pageNum, wrapper, canvas, hlCanvas, viewport: null });

                                // Fetch text context asynchronously for indexing
                                pdf.getPage(pageNum).then(function(page) {
                                    page.getTextContent().then(function(textContent) {
                                        pdfTextContent[pageNum - 1] = textContent;
                                    });
                                });
                            }

                            // Zoom Controls Logic
                            let currentZoom = 1.0;
                            const zoomValEl = document.getElementById('srs-zoom-val');
                            if (zoomValEl) zoomValEl.innerText = '100%';

                            function updateZoom(delta) {
                                currentZoom = Math.min(Math.max(currentZoom + delta, 0.5), 2.5);
                                if (zoomValEl) {
                                    zoomValEl.innerText = Math.round(currentZoom * 100) + '%';
                                }
                                canvases.forEach(item => {
                                    item.wrapper.style.width = (currentZoom * 100) + '%';
                                });
                            }

                            document.getElementById('srs-zoom-out').onclick = () => updateZoom(-0.1);
                            document.getElementById('srs-zoom-in').onclick = () => updateZoom(0.1);

                            // Find / Search Logic
                            let searchMatches = [];
                            let currentMatchIndex = -1;

                            const searchInput = document.getElementById('srs-search-input');
                            const searchResults = document.getElementById('srs-search-results');
                            const searchPrev = document.getElementById('srs-search-prev');
                            const searchNext = document.getElementById('srs-search-next');

                            function runSearch() {
                                const query = searchInput.value.trim().toLowerCase();
                                searchMatches = [];
                                currentMatchIndex = -1;

                                if (!query) {
                                    searchResults.innerText = '0 matches';
                                    drawHighlights();
                                    return;
                                }

                                pdfTextContent.forEach((textContent, pageIdx) => {
                                    if (!textContent) return;
                                    textContent.items.forEach(textItem => {
                                        const str = textItem.str.toLowerCase();
                                        let pos = str.indexOf(query);
                                        while (pos !== -1) {
                                            searchMatches.push({
                                                pageNum: pageIdx + 1,
                                                pageIdx: pageIdx,
                                                textItem: textItem,
                                                charPos: pos
                                            });
                                            pos = str.indexOf(query, pos + 1);
                                        }
                                    });
                                });

                                if (searchMatches.length > 0) {
                                    currentMatchIndex = 0;
                                    updateSearchDisplay();
                                    drawHighlights();
                                    navigateToMatch();
                                } else {
                                    searchResults.innerText = '0 matches';
                                    drawHighlights();
                                }
                            }

                            function drawHighlights() {
                                const query = searchInput.value.trim().toLowerCase();
                                canvases.forEach(item => {
                                    const ctx = item.hlCanvas.getContext('2d');
                                    ctx.clearRect(0, 0, item.hlCanvas.width, item.hlCanvas.height);
                                });

                                if (searchMatches.length === 0 || !query) return;

                                searchMatches.forEach((match, idx) => {
                                    const canvasItem = canvases[match.pageIdx];
                                    const ctx = canvasItem.hlCanvas.getContext('2d');
                                    const viewport = canvasItem.viewport;
                                    if (!viewport) return;

                                    const tx = match.textItem.transform;
                                    const x = tx[4];
                                    const y = tx[5];
                                    const totalWidth = match.textItem.width;
                                    const totalLen = match.textItem.str.length || 1;

                                    // Linear interpolation of the substring position within the textItem
                                    const charWidth = totalWidth / totalLen;
                                    const subX = x + (match.charPos * charWidth);
                                    const subWidth = query.length * charWidth;

                                    const itemHeight = match.textItem.height || Math.abs(tx[3] || 12);

                                    const [vx, vy] = viewport.convertToViewportPoint(subX, y);
                                    const [vxEnd, vyEnd] = viewport.convertToViewportPoint(subX + subWidth, y + itemHeight);

                                    const rectX = vx;
                                    const rectY = vyEnd;
                                    const rectW = Math.abs(vxEnd - vx);
                                    const rectH = Math.abs(vy - vyEnd);

                                    if (idx === currentMatchIndex) {
                                        ctx.fillStyle = 'rgba(255, 87, 34, 0.55)'; // Focused: Orange
                                        ctx.fillRect(rectX, rectY, rectW, rectH);
                                        ctx.strokeStyle = 'rgba(230, 74, 25, 0.9)';
                                        ctx.lineWidth = 1.5;
                                        ctx.strokeRect(rectX, rectY, rectW, rectH);
                                    } else {
                                        ctx.fillStyle = 'rgba(255, 235, 59, 0.45)'; // Standard: Yellow
                                        ctx.fillRect(rectX, rectY, rectW, rectH);
                                        ctx.strokeStyle = 'rgba(255, 152, 0, 0.7)';
                                        ctx.lineWidth = 1;
                                        ctx.strokeRect(rectX, rectY, rectW, rectH);
                                    }
                                });
                            }

                            function updateSearchDisplay() {
                                searchResults.innerText = (currentMatchIndex + 1) + ' of ' + searchMatches.length;
                            }

                            function navigateToMatch() {
                                if (currentMatchIndex < 0 || currentMatchIndex >= searchMatches.length) return;
                                const match = searchMatches[currentMatchIndex];
                                const targetWrapper = canvases[match.pageIdx]?.wrapper;
                                if (targetWrapper) {
                                    targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    targetWrapper.style.outline = '4px solid var(--vscode-focusBorder, #3b82f6)';
                                    setTimeout(() => {
                                        targetWrapper.style.outline = 'none';
                                    }, 1500);
                                }
                            }

                            searchInput.oninput = () => runSearch();
                            searchInput.onkeydown = (e) => {
                                if (e.key === 'Enter') {
                                    if (searchMatches.length > 0) {
                                        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
                                        updateSearchDisplay();
                                        drawHighlights();
                                        navigateToMatch();
                                    }
                                }
                            };

                            searchNext.onclick = () => {
                                if (searchMatches.length > 0) {
                                    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
                                    updateSearchDisplay();
                                    drawHighlights();
                                    navigateToMatch();
                                }
                            };

                            searchPrev.onclick = () => {
                                if (searchMatches.length > 0) {
                                    currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
                                    updateSearchDisplay();
                                    drawHighlights();
                                    navigateToMatch();
                                }
                            };

                            // Render page by page
                            canvases.forEach(item => {
                                pdf.getPage(item.pageNum).then(function(page) {
                                    const viewport = page.getViewport({ scale: 1.5 });
                                    item.viewport = viewport;

                                    const context = item.canvas.getContext('2d');
                                    item.canvas.height = viewport.height;
                                    item.canvas.width = viewport.width;

                                    item.hlCanvas.height = viewport.height;
                                    item.hlCanvas.width = viewport.width;

                                    const renderContext = {
                                        canvasContext: context,
                                        viewport: viewport
                                    };
                                    page.render(renderContext).promise.then(function() {
                                        renderedCount++;
                                        if (renderedCount === totalPages) {
                                            const srcLoader = document.getElementById('src-loader');
                                            if (srcLoader) srcLoader.style.display = 'none';
                                            if (container) container.style.display = 'flex';
                                            const srsBar = document.getElementById('srs-toolbar-bar');
                                            if (srsBar) srsBar.style.display = 'flex';
                                        }
                                    });
                                });
                            });
                        }).catch(function(err) {
                            console.error('[Amypo] PDFJS loading error:', err);
                            const srcLoader = document.getElementById('src-loader');
                            if (srcLoader) {
                                const loaderText = srcLoader.querySelector('div:nth-child(2)');
                                if (loaderText) {
                                    loaderText.innerText = 'Failed to load PDF pages: ' + err.message;
                                    loaderText.style.color = '#ef4444';
                                }
                                const spinner = srcLoader.querySelector('.spinner');
                                if (spinner) {
                                    spinner.style.display = 'none';
                                }
                            }
                        });
                        return;
                    }

                    if (message.command === 'pdfDataError') {
                        const srcLoader = document.getElementById('src-loader');
                        if (srcLoader) {
                            const loaderText = srcLoader.querySelector('div:nth-child(2)');
                            if (loaderText) {
                                loaderText.innerText = 'Failed to load SRS document: ' + message.error;
                                loaderText.style.color = '#ef4444';
                            }
                            const spinner = srcLoader.querySelector('.spinner');
                            if (spinner) {
                                spinner.style.display = 'none';
                            }
                        }
                        return;
                    }

                    if (message.state) {
                        wrapper.style.display = 'none';
                        qUi.style.display = 'flex';

                        const loader = document.getElementById('loader');
                        const dataView = document.getElementById('data-view');
                        const errorView = document.getElementById('error-view');

                        if (message.state === 'loading') {
                            loader.style.display = 'flex';
                            dataView.style.display = 'none';
                            errorView.style.display = 'none';
                        } else if (message.state === 'error') {
                            loader.style.display = 'none';
                            dataView.style.display = 'none';
                            errorView.style.display = 'block';
                            document.getElementById('error-msg').innerText = message.message || 'An error occurred';
                        } else if (message.state === 'loaded') {
                            loader.style.display = 'none';
                            errorView.style.display = 'none';
                            dataView.style.display = 'flex';

                            // Start assessment timer with server-synchronized elapsed seconds
                            const serverElapsedSec = typeof message.timer === 'number' ? message.timer : (timerElapsedSeconds || 0);
                            initAssessmentTimer(serverElapsedSec);

                            const payload = message.payload;
                            const qdata = Array.isArray(payload) ? payload[0] : payload;
                            currentQData = qdata;

                            if (qdata) {
                                // Show/Hide SRC tab based on testcases availability
                                const tabSrc = document.getElementById('tab-src');
                                if (tabSrc) {
                                    tabSrc.style.display = 'flex';
                                }

                                // Always reset to Question tab on load
                                switchTab('Q');
                                const pContainer = document.getElementById('pdf-container');
                                if (pContainer) {
                                    pContainer.innerHTML = '';
                                    pContainer.style.display = 'none';
                                }

                                document.getElementById('q-title').innerText = qdata?.question_name || qdata?.title || 'Question 1';
                                document.getElementById('q-desc').innerHTML = qdata?.description || qdata?.question || 'Empty Question Description';

                                // Display points/marks badge if available
                                if (qdata.mark) {
                                    totalQuestionMark = parseInt(qdata.mark);
                                    const marksBadge = document.getElementById('q-marks-badge');
                                    const marksVal = document.getElementById('q-marks-val');
                                    if (marksBadge && marksVal) {
                                        marksVal.innerText = String(totalQuestionMark);
                                        marksBadge.style.display = 'inline-flex';
                                    }
                                }

                                // Parse expected test case count from metadata
                                if (qdata.testcaseCount) {
                                    try {
                                        const counts = JSON.parse(qdata.testcaseCount);
                                        // Take spring count as priority, fallback to react
                                        expectedTestCount = parseInt(counts.spring || counts.react || 0);
                                        console.log('[Amypo] Expected test case count:', expectedTestCount);
                                    } catch(e) {
                                        console.warn('[Amypo] Failed to parse testcaseCount:', qdata.testcaseCount);
                                    }
                                }
                            }
                        } else if (message.state === 'status') {
                            const status = document.getElementById('status-bar');
                            status.className = 'status-msg ' + (message.type || 'info');
                            status.style.display = 'block';
                            status.innerText = message.text;

                            // Update cloud sync badge
                            if (message.type === 'success') {
                                setSyncStatus('synced', 'Synced');
                            } else if (message.type === 'error') {
                                setSyncStatus('error', 'Sync error');
                            }

                            // Re-enable save button on success or error
                            if (message.type === 'success' || message.type === 'error') {
                                setTimeout(() => { if (status.innerText === message.text) status.style.display = 'none'; }, 5000);
                                const sBtn = document.getElementById('save-btn');
                                if (sBtn) {
                                    sBtn.disabled = false;
                                    document.getElementById('save-spinner').style.display = 'none';
                                }
                                const pBtn = document.getElementById('pull-btn');
                                if (pBtn) {
                                    pBtn.disabled = false;
                                    const ps = document.getElementById('pull-spinner');
                                    if (ps) ps.style.display = 'none';
                                }

                                // Clean up verify overlay and logic only for verification messages
                                if (message.payload || (message.text && (message.text.includes('test') || message.text.includes('Verification')))) {
                                    const vBtn = document.getElementById('verify-btn');
                                    if (vBtn) {
                                        vBtn.disabled = false;
                                    }
                                    const vOverlay = document.getElementById('verify-overlay');
                                    if (vOverlay) {
                                        vOverlay.style.display = 'none';
                                    }
                                    if (vInterval) clearInterval(vInterval);
                                }

                                // Re-enable submit button on results
                                const subBtn = document.getElementById('submit-btn');
                                if (subBtn) {
                                    subBtn.disabled = false;
                                    const subSpinner = document.getElementById('submit-spinner');
                                    if (subSpinner) subSpinner.style.display = 'none';
                                }

                                // Show results modal if payload exists
                                if (message.payload) {
                                    const payload = message.payload;
                                    const results = payload.test_results || {};

                                    const totalDisplay = expectedTestCount > 0 ? expectedTestCount : (results.total || 0);
                                    const passed = results.passed || 0;
                                    const failed = Math.max(0, totalDisplay - passed);

                                    document.getElementById('res-total').innerText = totalDisplay;
                                    document.getElementById('res-passed').innerText = passed;
                                    document.getElementById('res-failed').innerText = failed;

                                    const multiplier = totalQuestionMark > 0 ? totalQuestionMark : 10;
                                    const score = totalDisplay > 0 ? ((passed / totalDisplay) * multiplier).toFixed(2) : "0.00";
                                    document.getElementById('res-score').innerText = score;

                                    const passedList = results.passedTests || [];
                                    const failedList = results.failedTests || [];

                                    // Surface the Results button in the content header
                                    const vrBtn = document.getElementById('view-res-btn');
                                    if (vrBtn) vrBtn.style.display = 'inline-flex';

                                    if (payload.spring_results && payload.react_results) {
                                        // Fullstack View
                                        const tSec = document.getElementById('res-test-cases-section');
                                        if(tSec) tSec.style.display = 'none';

                                        const stdTerm = document.getElementById('standard-terminal-section');
                                        if(stdTerm) stdTerm.style.display = 'none';

                                        const fsSec = document.getElementById('res-fs-cases-section');
                                        if(fsSec) fsSec.style.display = 'block';

                                        // Spring Data
                                        const pBoxSpring = document.getElementById('res-fs-spring-passed');
                                        if (pBoxSpring) {
                                            const spPassed = payload.spring_results.passedTests || [];
                                            if(spPassed.length > 0) {
                                                pBoxSpring.innerText = spPassed.join('\\n');
                                                pBoxSpring.style.color = '#10b981';
                                            } else {
                                                pBoxSpring.innerText = 'None';
                                                pBoxSpring.style.color = 'var(--vscode-descriptionForeground)';
                                            }
                                        }

                                        const fBoxSpring = document.getElementById('res-fs-spring-failed');
                                        if (fBoxSpring) {
                                            const spFailed = payload.spring_results.failedTests || [];
                                            if(spFailed.length > 0) {
                                                fBoxSpring.innerText = spFailed.join('\\n');
                                                fBoxSpring.style.color = '#ef4444';
                                            } else {
                                                fBoxSpring.innerText = 'None';
                                                fBoxSpring.style.color = 'var(--vscode-descriptionForeground)';
                                            }
                                        }

                                        // React Data
                                        const pBoxReact = document.getElementById('res-fs-react-passed');
                                        if (pBoxReact) {
                                            const rePassed = payload.react_results.passedTests || [];
                                            if(rePassed.length > 0) {
                                                pBoxReact.innerText = rePassed.join('\\n');
                                                pBoxReact.style.color = '#10b981';
                                            } else {
                                                pBoxReact.innerText = 'None';
                                                pBoxReact.style.color = 'var(--vscode-descriptionForeground)';
                                            }
                                        }

                                        const fBoxReact = document.getElementById('res-fs-react-failed');
                                        if (fBoxReact) {
                                            const reFailed = payload.react_results.failedTests || [];
                                            if(reFailed.length > 0) {
                                                fBoxReact.innerText = reFailed.join('\\n');
                                                fBoxReact.style.color = '#ef4444';
                                            } else {
                                                fBoxReact.innerText = 'None';
                                                fBoxReact.style.color = 'var(--vscode-descriptionForeground)';
                                            }
                                        }

                                        const tBoxSpring = document.getElementById('res-fs-spring-terminal');
                                        if (tBoxSpring) tBoxSpring.innerText = payload.spring_terminal_output || 'No output.';

                                        const tBoxReact = document.getElementById('res-fs-react-terminal');
                                        if (tBoxReact) tBoxReact.innerText = payload.react_terminal_output || 'No output.';

                                    } else {
                                        // Standard View
                                        const fsSec = document.getElementById('res-fs-cases-section');
                                        if(fsSec) fsSec.style.display = 'none';

                                        const stdTerm = document.getElementById('standard-terminal-section');
                                        if(stdTerm) stdTerm.style.display = 'block';

                                        if (passedList.length > 0 || failedList.length > 0) {
                                            const tSec = document.getElementById('res-test-cases-section');
                                            if(tSec) tSec.style.display = 'block';

                                            const pBox = document.getElementById('res-passed-tests');
                                            if (pBox) {
                                                if(passedList.length > 0) {
                                                    pBox.innerText = passedList.join('\\n');
                                                    pBox.style.color = '#10b981';
                                                } else {
                                                    pBox.innerText = 'None';
                                                    pBox.style.color = 'var(--vscode-descriptionForeground)';
                                                }
                                            }

                                            const fBox = document.getElementById('res-failed-tests');
                                            if (fBox) {
                                                if(failedList.length > 0) {
                                                    fBox.innerText = failedList.join('\\n');
                                                    fBox.style.color = '#ef4444';
                                                } else {
                                                    fBox.innerText = 'None';
                                                    fBox.style.color = 'var(--vscode-descriptionForeground)';
                                                }
                                            }
                                        } else {
                                            const tSec = document.getElementById('res-test-cases-section');
                                            if(tSec) tSec.style.display = 'none';
                                        }

                                        const terminalBox = document.getElementById('res-terminal');
                                        if (payload.full_terminal_output) {
                                            terminalBox.innerText = payload.full_terminal_output;
                                            terminalBox.className = 'terminal-box';
                                        } else {
                                            terminalBox.innerText = 'No output from Terminal';
                                            terminalBox.className = 'terminal-box terminal-empty';
                                        }
                                    }

                                    if (resOverlay) resOverlay.style.display = 'flex';
                                }
                            }
                        } else if (message.state === 'saved') {
                             lastSavedTimestamp = message.timestamp;
                             updateRelativeTime();
                             setSyncStatus('synced', 'Synced');

                             // Also re-enable here just in case
                             const sBtn = document.getElementById('save-btn');
                             if (sBtn) {
                                 sBtn.disabled = false;
                                 document.getElementById('save-spinner').style.display = 'none';
                             }
                        }
                    }
                });

                vscode.postMessage({ command: 'ready' });
            </script>
        </body>
        </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
