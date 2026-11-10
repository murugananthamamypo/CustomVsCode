/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import axios from 'axios';
import * as https from 'https';
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
                        axios.get(pdfUrl, {
                            responseType: 'arraybuffer',
                            httpsAgent: agent
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
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                }
                #modal-wrapper {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    overflow-y: auto;
                    padding: 24px;
                    box-sizing: border-box;
                }
                #modal-content {
                    background: var(--vscode-editorWidget-background, white);
                    color: var(--vscode-editorWidget-foreground, #2d3436);
                    border-radius: 16px;
                    width: 100%;
                    max-width: 400px;
                    padding: 40px 24px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    animation: fadeIn 0.3s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .illustration {
                    width: 100%;
                    max-width: 160px;
                    height: auto;
                    margin: 0 auto 24px;
                    display: block;
                }
                .title {
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--vscode-editorWidget-foreground, #2d3436);
                    margin-bottom: 4px;
                    text-transform: capitalize;
                }
                .subtext {
                    font-size: 15px;
                    color: var(--vscode-descriptionForeground, #636e72);
                    margin-bottom: 20px;
                }
                .languages {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 6px;
                    margin-bottom: 30px;
                }
                .lang-tag {
                    background: var(--vscode-badge-background, #f1f2f6);
                    color: var(--vscode-badge-foreground, #2f3542);
                    padding: 4px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    justify-content: center;
                }
                button {
                    padding: 12px 24px;
                    border-radius: 10px;
                    border: none;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    width: 100%;
                }
                .btn-start {
                    background: #00ce7a;
                    color: white;
                }
                .btn-start:hover { background: #00b36a; }

                /* Guidelines Styles */
                .guidelines-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--vscode-editorWidget-foreground, #2d3436);
                    margin-bottom: 24px;
                    text-align: center;
                }
                .guidelines-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground, #636e72);
                    text-align: left;
                    max-height: 350px;
                    overflow-y: auto;
                    margin-bottom: 24px;
                }
                .guidelines-list li {
                    margin-bottom: 16px;
                    display: flex;
                    align-items: flex-start;
                    line-height: 1.5;
                }
                .bullet-icon {
                    min-width: 8px;
                    height: 8px;
                    background-color: #00ce7a;
                    border-radius: 50%;
                    margin-right: 12px;
                    margin-top: 6px;
                }

                /* Question UI Styles */
                #question-ui {
                    display: none;
                    position: absolute;
                    inset: 0;
                    flex-direction: column;
                    overflow: hidden;
                    background-color: var(--vscode-editor-background, #f1f2f6);
                }
                /* Inherit general background */
                .topbar { background-color: var(--vscode-editor-background, white); padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border, #dfe4ea); }
                .topbar-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
                .logo { height: 24px; }
                .info-pill { font-size: 13px; color: var(--vscode-foreground, #636e72); display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--vscode-widget-border, #dfe4ea); padding-left: 16px; font-weight: 500; }
                .icon-btn { border: 1px solid var(--vscode-widget-border, #dfe4ea); border-radius: 50%; padding: 4px; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; }
                .icon-btn.yellow { border-color: #ffd32a; color: #ffa801; }
                .main-layout {
                    position: absolute;
                    top: 53px;
                    bottom: 60px;
                    left: 0;
                    right: 0;
                    overflow: hidden;
                    display: flex;
                }
                .content-area { flex: 1; background: var(--vscode-editor-background); margin: 12px; border-radius: 8px; border: 1px solid var(--vscode-widget-border, #dfe4ea); display: flex; flex-direction: column; overflow: hidden; }
                .content-header { padding: 0 12px; border-bottom: 1px solid var(--vscode-widget-border, #f1f2f6); display: flex; justify-content: space-between; align-items: center; background: var(--vscode-editorWidget-background, #fbfbfb); border-radius: 8px 8px 0 0; }
                .tab-container { display: flex; gap: 4px; height: 100%; align-items: stretch; }
                .tab-btn {
                    padding: 12px 16px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--vscode-foreground, #636e72);
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .tab-btn:hover { color: #00b894; background: rgba(0, 184, 148, 0.05); }
                .tab-btn.active { color: #00b894; border-bottom-color: #00b894; background: rgba(0, 184, 148, 0.1); }
                .report-btn { color: #ff7675; border: 1px solid #fab1a0; border-radius: 6px; padding: 6px 16px; background: transparent; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
                .report-btn:hover { background-color: var(--vscode-list-hoverBackground, #ffeaa7); }

                .question-body { padding: 24px; flex: 1; overflow-y: auto; color: var(--vscode-editor-foreground); user-select: none; -webkit-user-select: none; }
                #src-view { flex: 1; display: none; overflow: hidden; background: var(--vscode-editor-background); position: relative; user-select: none; -webkit-user-select: none; }
                .srs-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    background: var(--vscode-editorWidget-background, #2d2d2d);
                    border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c);
                    position: relative;
                    z-index: 70;
                    gap: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                }
                .srs-toolbar-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .srs-btn {
                    background: var(--vscode-button-secondaryBackground, #3a3a3a);
                    color: var(--vscode-button-secondaryForeground, #ffffff);
                    border: 1px solid var(--vscode-widget-border, #555555);
                    border-radius: 4px;
                    padding: 2px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                    height: 28px;
                    box-sizing: border-box;
                    transition: background 0.2s;
                }
                .srs-btn:hover {
                    background: var(--vscode-button-secondaryHoverBackground, #4a4a4a);
                }
                .srs-zoom-val {
                    font-size: 12px;
                    font-weight: 700;
                    min-width: 48px;
                    text-align: center;
                    color: var(--vscode-foreground, #cccccc);
                }
                .srs-search-input {
                    background: var(--vscode-input-background, #1e1e1e);
                    color: var(--vscode-input-foreground, #cccccc);
                    border: 1px solid var(--vscode-input-border, #3c3c3c);
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 12px;
                    height: 28px;
                    width: 140px;
                    box-sizing: border-box;
                    outline: none;
                }
                .srs-search-input:focus {
                    border-color: var(--vscode-focusBorder, #00b894);
                }
                .srs-search-results {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground, #888888);
                    min-width: 70px;
                    text-align: center;
                }
                .q-title { font-size: 24px; font-weight: bold; margin-bottom: 24px; }
                .q-description { font-size: 15px; line-height: 1.6; margin-bottom: 32px; overflow-wrap: break-word; }
                .q-description *, .q-title * { color: var(--vscode-editor-foreground) !important; }
                .q-description img { max-width: 100%; height: auto; margin: 20px 0 32px 0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: block !important; float: none !important; }
                .q-description ul, .q-description ol { padding-left: 24px; margin-bottom: 16px; overflow: hidden; }
                .q-description li { margin-bottom: 8px; }
                .q-description table { width: 100%; border-collapse: collapse; margin: 16px 0; }
                .q-description th, .q-description td { border: 1px solid var(--vscode-widget-border, #dfe4ea); padding: 8px 12px; text-align: left; }
                .q-description pre { background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 16px 0; font-family: var(--vscode-editor-font-family, monospace); }
                .q-description code { font-family: var(--vscode-editor-font-family, monospace); background: rgba(0,0,0,0.1); padding: 2px 4px; border-radius: 4px; }

                .action-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    display: flex;
                    gap: 12px;
                    padding: 12px;
                    background: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-widget-border);
                    box-sizing: border-box;
                }
                .btn-action {
                    flex: 1;
                    padding: 10px;
                    border-radius: 6px;
                    border: 1px solid var(--vscode-widget-border, #dfe4ea);
                    background: var(--vscode-button-secondaryBackground, #f1f2f6);
                    color: var(--vscode-button-secondaryForeground, #2d3436);
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 2px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .btn-action:hover {
                    background: var(--vscode-button-secondaryHoverBackground, #dfe4ea);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 5px rgba(0,0,0,0.15);
                }
                .btn-action:active { transform: translateY(0); }
                .btn-primary { background: #3867d6; color: white; border: none; }
                .btn-primary:hover { background: #2b52ad; }
                .btn-success { background: #00ce7a; color: white; border: none; }
                .btn-success:hover { background: #00b36a; }
                .btn-action:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none !important;
                    box-shadow: none !important;
                }
                .save-time {
                    font-size: 12px;
                    opacity: 0.9;
                    font-weight: 400;
                    margin-top: -2px;
                }

                .status-msg {
                    position: fixed;
                    top: 60px;
                    right: 24px;
                    z-index: 9999;
                    font-size: 13px;
                    font-weight: 600;
                    display: none;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                    animation: slideIn 0.3s ease-out;
                    max-width: 300px;
                }
                @keyframes slideIn {
                    from { transform: translateX(50px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .status-msg.success { display: block; background: #00ce7a; color: white; border: none; }
                .status-msg.error { display: block; background: #ff5e5e; color: white; border: none; }
                .status-msg.info { display: block; background: #3867d6; color: white; border: none; }

                .loader-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground, #636e72); }
                .spinner { border: 4px solid var(--vscode-widget-border, rgba(0,0,0,0.1)); width: 36px; height: 36px; border-radius: 50%; border-left-color: #0984e3; animation: spin 1s linear infinite; margin-bottom: 16px; }
                .btn-spinner {
                    width: 12px;
                    height: 12px;
                    border: 2px solid rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    border-top-color: currentColor;
                    animation: spin 0.8s linear infinite;
                    display: none;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

                .tooltip-container { position: relative; display: inline-block; cursor: pointer; }
                .tooltip-content {
                    display: none; position: absolute; top: 100%; left: 0; margin-top: 8px;
                    background: var(--vscode-editorWidget-background, white);
                    color: var(--vscode-editor-foreground, black); border: 1px solid var(--vscode-widget-border, #ccc);
                    padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 100; font-size: 13px; font-weight: normal; white-space: normal; line-height: 1.6; width: 250px;
                }
                .tooltip-content p { margin: 4px 0; }
                .tooltip-container:hover .tooltip-content,
                .tooltip-container:focus-within .tooltip-content { display: block; }

                .verify-text { font-size: 15px; color: var(--vscode-descriptionForeground, #636e72); font-weight: 500; text-align: center; }

                /* Verification Loader Overlay */
                .verify-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); z-index: 9999; display: none; flex-direction: column; align-items: center; justify-content: center; }
                .verify-modal { background: var(--vscode-editorWidget-background, white); padding: 40px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; width: 90%; max-width: 600px; animation: fadeIn 0.3s ease-out; }
                .verify-terminal { background: #0b0c16; border-radius: 8px; padding: 24px; width: 100%; max-width: 400px; height: 160px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; gap: 8px; font-family: monospace; font-size: 13px; color: #4a6fe3; margin-bottom: 24px; position: relative; overflow: hidden; }
                .verify-term-line { display: none; }
                .verify-term-line.active { display: block; animation: fadeIn 0.3s ease-out forwards; }
                .verify-term-line.current { color: #8bb2ff; text-shadow: 0 0 8px #8bb2ff; position: relative; }
                .verify-term-line.current::after { content: ''; position: absolute; top: 50%; left: -10px; right: -10px; height: 140%; transform: translateY(-50%); background: linear-gradient(90deg, transparent, rgba(74, 111, 227, 0.4), transparent); z-index: 0; animation: scan 2s infinite linear; }
                .verify-term-line span { position: relative; z-index: 1; }
                @keyframes scan { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
                .verify-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(139, 178, 255, 0.3); border-radius: 50%; border-top-color: #8bb2ff; animation: spin 0.8s linear infinite; margin-left: 8px; vertical-align: middle; }

                /* Results Modal */
                .result-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: none; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 40px 20px; }
                .result-modal { margin: auto; background: #fff; width: 100%; max-width: 900px; border-radius: 8px; position: relative; display: flex; flex-direction: column; animation: fadeIn 0.3s ease-out; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                .result-close { position: absolute; right: 20px; top: 15px; cursor: pointer; font-size: 24px; color: #666; font-weight: 300; line-height: 1; }
                .result-close:hover { color: #333; }
                .result-header { background: #eef2f7; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #2d3436; font-weight: 600; margin-bottom: 25px; font-size: 14px; }
                .result-header i { font-style: normal; display: flex; align-items: center; justify-content: center; background: #00d2be; color: white; width: 22px; height: 22px; border-radius: 4px; font-size: 12px; }

                .result-section-label { font-size: 16px; font-weight: 700; color: #212529; margin-bottom: 20px; text-align: left; width: 100%; }
                .result-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; width: 100%; }
                .result-card { border: 1px solid #e9ecef; border-radius: 12px; padding: 20px 10px; text-align: center; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .result-card-val { font-size: 28px; font-weight: 800; color: #2d3436; }
                .result-card-label { font-size: 13px; color: #868e96; font-weight: 600; }

                .result-card.passed { border-color: #d3f9d8; background: #f4fff7; }
                .result-card.passed .result-card-val { color: #00ce7a; }
                .result-card.passed .result-card-label { color: #00ce7a; }

                .result-card.failed { border-color: #ffe3e3; background: #fff5f5; }
                .result-card.failed .result-card-val { color: #ff5e5e; }
                .result-card.failed .result-card-label { color: #ff5e5e; }

                .result-card.score { border-color: #fff9db; background: #fffdf2; }
                .result-card.score .result-card-val { color: #fab005; }
                .result-card.score .result-card-label { color: #fab005; }

                .terminal-box { border: 1px solid #eee; border-radius: 8px; padding: 20px; background: #fff; color: #636e72; font-family: 'Courier New', monospace; font-size: 13px; min-height: 100px; max-height: 300px; overflow-y: auto; text-align: left; width: 100%; box-sizing: border-box; }
                .terminal-empty { color: #adb5bd; text-align: center; margin-top: 10px; }

                @media (max-width: 600px) {
                    .topbar { flex-direction: column; gap: 8px; }
                    .content-header { flex-direction: column; gap: 8px; align-items: flex-start; }
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
                        ${courseInfo.errorMessage ? `<div style="color: #e17055; margin-top: 16px; font-weight: 600; text-align: center; border: 1px solid #fab1a0; padding: 12px; border-radius: 8px; background: #fff5f5;">${courseInfo.errorMessage}</div>` :
                `<div class="buttons">
                            <button class="btn-start" id="start">Start Test</button>
                        </div>`}
                    </div>

                    <div id="step2" style="display: none;">
                        <div class="guidelines-title">Test Guidelines</div>
                        <ul class="guidelines-list">
                            <li><div class="bullet-icon"></div><div>To ensure optimal performance during the test, we recommend using the latest version of Google Chrome (version 60 or above).</div></li>
                            <li><div class="bullet-icon"></div><div>Your computer system must maintain steady and uninterrupted internet connectivity. For a smooth testing experience, both your download and upload speeds should be at least 2 Mbps.</div></li>
                            <li><div class="bullet-icon"></div><div>Confirm that your computer's system clock is accurately set to the (GMT +5:30) Mumbai, Kolkata, Chennai, New Delhi timezone. A mismatch in time can result in test discrepancies.</div></li>
                            <li><div class="bullet-icon"></div><div>Avoid switching tabs during the test. Any such activity can lead to an automatic and premature submission of your test.</div></li>
                            <li><div class="bullet-icon"></div><div>Notifications or pop-ups appearing during the test will be interpreted as tab switches, which may cause your test to close prematurely. It is strongly advised to turn off these distractions before starting.</div></li>
                        </ul>
                        <div class="buttons">
                            <button class="btn-start" id="continue">Continue</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- QUESTION FULL UI -->
            <div id="question-ui" style="${courseInfo.shouldRestore ? 'display: flex;' : ''}">
                <div class="topbar">
                    <div class="topbar-left">
                        <img src="${logoUri}" alt="Amypo" class="logo">
                        <div class="info-pill">User Details :
                            <div class="tooltip-container">
                                <div class="icon-btn" tabindex="0">👁</div>
                                <div class="tooltip-content">
                                    <p><b>Name :</b> ${courseInfo.user_name}</p>
                                    <p><b>Email :</b> ${courseInfo.user_email}</p>
                                    <p><b>Roll No :</b> ${courseInfo.user_roll_no}</p>
                                    <p><b>College :</b> ${courseInfo.user_college}</p>
                                    <p><b>Department :</b> ${courseInfo.user_department}</p>
                                    <p><b>Batch :</b> ${courseInfo.user_batch}</p>
                                    <p><b>Section :</b> ${courseInfo.user_section}</p>
                                </div>
                            </div>
                        </div>
                        <div class="info-pill">Course Details :
                            <div class="tooltip-container">
                                <div class="icon-btn" tabindex="0">👁</div>
                                <div class="tooltip-content">
                                    <p><b>Course Name :</b> ${courseInfo.course_name}</p>
                                    <p><b>Test Type :</b> ${courseInfo.test_type}</p>
                                    <p><b>Topic Name :</b> ${courseInfo.topic_name}</p>
                                    <p><b>Module Name :</b> ${courseInfo.module_name}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                <div class="topbar-right" style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:10px;
                            background:#1e40af;
                            color: #cbd5e1;
                            padding:3px 12px;
                            border-radius:20px;
                            font-weight:700;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                            letter-spacing: 0.5px;">
                            v${courseInfo.version ?? '1.0.6'}
                        </span>
                </div>

                <div class="main-layout">
                    <div class="content-area">
                        <div class="content-header">
                            <div class="tab-container">
                                <div class="tab-btn active" id="tab-q">
                                    <span>📋</span> Question
                                </div>
                                <div class="tab-btn" id="tab-src" style="display: none;">
                                    <span>📄</span> SRS
                                </div>
                            </div>
                        </div>

                        <div id="content-container" class="question-body" style="display: flex; flex-direction: column; padding: 0;">
                            <!-- Loader -->
                            <div class="loader-container" id="loader" style="padding: 24px;">
                                <div class="spinner"></div>
                                <div style="font-weight: 500;">Loading test environment...</div>
                            </div>

                            <!-- Error -->
                            <div id="error-view" style="display: none; color: #e17055; text-align: center; margin-top: 40px; padding: 24px;">
                                <h2 id="error-msg">Failed to load test.</h2>
                            </div>

                            <!-- Content -->
                            <div id="data-view" style="display: none; height: 100%; flex-direction: column;">
                                <div id="q-content" style="flex: 1; overflow-y: auto; padding: 24px;">
                                    <div class="q-title" id="q-title"></div>
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
                                <div id="src-loader" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground, #636e72); position: absolute; inset: 0; background: var(--vscode-editor-background); z-index: 10;">
                                    <div class="spinner"></div>
                                    <div style="font-weight: 500;">Loading SRS document...</div>
                                </div>
                                <div id="pdf-container" style="flex: 1; overflow: auto; padding: 20px; background: var(--vscode-editor-background); display: none; flex-direction: column;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ✅ action-bar inside question-ui -->
                <div class="action-bar">
                    <button class="btn-action" id="save-btn">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="btn-spinner" id="save-spinner"></div>
                            <span>💾 Save</span>
                        </div>
                        <div>
                            <span>Last Saved : </span>
                            <span class="save-time" id="last-saved-time"></span>
                        </div>
                    </button>
                    <button class="btn-action btn-success" id="pull-btn">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="btn-spinner" id="pull-spinner"></div>
                            <span>Pull</span>
                        </div>
                    </button>
                    <button class="btn-action btn-primary" id="verify-btn"><span>Check Verify</span></button>
                    <button class="btn-action btn-success" id="submit-btn" style="background: #e67e22; border-color: #d35400;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="btn-spinner" id="submit-spinner"></div>
                            <span>Final Submit</span>
                        </div>
                    </button>
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
                            <i>[]</i> Test result
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
                            <div style="display: flex; gap: 20px; width: 100%; box-sizing: border-box;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 14px; margin-bottom: 10px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-passed-tests" style="min-height: 50px; max-height: 150px; overflow-y: auto; overflow-wrap: break-word; background: #f8f9fa;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 14px; margin-bottom: 10px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-failed-tests" style="min-height: 50px; max-height: 150px; overflow-y: auto; overflow-wrap: break-word; background: #fff5f5;">None</div>
                                </div>
                            </div>
                        </div>

                        <!-- FULLSTACK BREAKDOWN -->
                        <div id="res-fs-cases-section" style="display: none; margin-bottom: 25px; width: 100%;">
                            <h4 style="margin-top: 10px; color: #333; font-size: 14px; font-weight: 600;">Spring Boot Test Results</h4>
                            <div style="display: flex; gap: 20px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 12px; margin-bottom: 5px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-fs-spring-passed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; background: #f8f9fa;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 12px; margin-bottom: 5px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-fs-spring-failed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; background: #fff5f5;">None</div>
                                </div>
                            </div>

                            <h4 style="margin-top: 10px; color: #333; font-size: 14px; font-weight: 600;">React Test Results</h4>
                            <div style="display: flex; gap: 20px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 12px; margin-bottom: 5px;">Passed Tests</div>
                                    <div class="terminal-box" id="res-fs-react-passed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; background: #f8f9fa;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="result-section-label" style="font-size: 12px; margin-bottom: 5px;">Failed Tests</div>
                                    <div class="terminal-box" id="res-fs-react-failed" style="min-height: 40px; max-height: 100px; overflow-y: auto; overflow-wrap: break-word; background: #fff5f5;">None</div>
                                </div>
                            </div>

                            <div class="result-header"><i>[]</i> Spring Boot Terminal Output</div>
                            <div class="terminal-box" id="res-fs-spring-terminal" style="max-height: 200px; overflow-y: auto;"></div>

                            <div class="result-header" style="margin-top: 15px;"><i>[]</i> React Terminal Output</div>
                            <div class="terminal-box" id="res-fs-react-terminal" style="max-height: 200px; overflow-y: auto;"></div>
                        </div>

                        <!-- STANDARD FALLBACK -->
                        <div id="standard-terminal-section" style="display: block;">
                            <div class="result-header">
                                <i>[]</i> Terminal Output
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

                                    const baseUrl = storageUrl.endsWith('/') ? storageUrl.slice(0, -1) : storageUrl;
                                    const cleanPath = pdfPath.startsWith('/') ? pdfPath : '/' + pdfPath;
                                    const fullUrl = baseUrl + cleanPath + pdfFile;

                                    console.log('[Amypo] Requesting PDF from extension host:', fullUrl);

                                    // Show the loader and hide the iframe initially
                                    const srcLoader = document.getElementById('src-loader');
                                    if (srcLoader) {
                                        srcLoader.style.display = 'flex';
                                        const loaderText = srcLoader.querySelector('div:nth-child(2)');
                                        if (loaderText) {
                                            loaderText.innerText = 'Loading SRS document...';
                                            loaderText.style.color = 'var(--vscode-descriptionForeground, #636e72)';
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
                                    loaderText.style.color = 'var(--vscode-descriptionForeground, #636e72)';
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

                const reloadBtn = document.getElementById('reload');
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
                    else if (diff < 60) el.innerText = diff + ' secs ago';
                    else if (diff < 3600) el.innerText = Math.floor(diff / 60) + ' mins ago';
                    else el.innerText = Math.floor(diff / 3600) + ' hrs ago';
                }
                setInterval(updateRelativeTime, 10000);

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
                                    targetWrapper.style.outline = '4px solid var(--vscode-focusBorder, #00b894)';
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
                                    loaderText.style.color = '#ff5e5e';
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
                                loaderText.style.color = '#ff5e5e';
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
                            dataView.style.display = 'block';


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

                                if (qdata.mark) {
                                    totalQuestionMark = parseInt(qdata.mark);
                                    console.log('[Amypo] Total question mark:', totalQuestionMark);
                                }
                            }
                        } else if (message.state === 'status') {
                            const status = document.getElementById('status-bar');
                            status.className = 'status-msg ' + (message.type || 'info');
                            status.style.display = 'block';
                            status.innerText = message.text;

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
                                                pBoxSpring.style.color = '#00ce7a';
                                            } else {
                                                pBoxSpring.innerText = 'None';
                                                pBoxSpring.style.color = '#adb5bd';
                                            }
                                        }

                                        const fBoxSpring = document.getElementById('res-fs-spring-failed');
                                        if (fBoxSpring) {
                                            const spFailed = payload.spring_results.failedTests || [];
                                            if(spFailed.length > 0) {
                                                fBoxSpring.innerText = spFailed.join('\\n');
                                                fBoxSpring.style.color = '#ff5e5e';
                                            } else {
                                                fBoxSpring.innerText = 'None';
                                                fBoxSpring.style.color = '#adb5bd';
                                            }
                                        }

                                        // React Data
                                        const pBoxReact = document.getElementById('res-fs-react-passed');
                                        if (pBoxReact) {
                                            const rePassed = payload.react_results.passedTests || [];
                                            if(rePassed.length > 0) {
                                                pBoxReact.innerText = rePassed.join('\\n');
                                                pBoxReact.style.color = '#00ce7a';
                                            } else {
                                                pBoxReact.innerText = 'None';
                                                pBoxReact.style.color = '#adb5bd';
                                            }
                                        }

                                        const fBoxReact = document.getElementById('res-fs-react-failed');
                                        if (fBoxReact) {
                                            const reFailed = payload.react_results.failedTests || [];
                                            if(reFailed.length > 0) {
                                                fBoxReact.innerText = reFailed.join('\\n');
                                                fBoxReact.style.color = '#ff5e5e';
                                            } else {
                                                fBoxReact.innerText = 'None';
                                                fBoxReact.style.color = '#adb5bd';
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
                                                    pBox.style.color = '#00ce7a';
                                                } else {
                                                    pBox.innerText = 'None';
                                                    pBox.style.color = '#adb5bd';
                                                }
                                            }

                                            const fBox = document.getElementById('res-failed-tests');
                                            if (fBox) {
                                                if(failedList.length > 0) {
                                                    fBox.innerText = failedList.join('\\n');
                                                    fBox.style.color = '#ff5e5e';
                                                } else {
                                                    fBox.innerText = 'None';
                                                    fBox.style.color = '#adb5bd';
                                                }
                                            }
                                        } else {
                                            const tSec = document.getElementById('res-test-cases-section');
                                            if(tSec) tSec.style.display = 'none';
                                        }

                                        const terminalBox = document.getElementById('res-terminal');
                                        if (payload.full_terminal_output) {
                                            terminalBox.innerText = payload.full_terminal_output;
                                            terminalBox.style.color = '#636e72';
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
