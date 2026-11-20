/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import axios from "axios";
import * as https from "https";

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
	public static readonly viewType = "amypoEduView";
	private _view?: vscode.WebviewView;
	private _courseInfo?: ICourseInfo;
	private _lastMessage?: any;
	private _webviewReady = false;
	private _onConfirm?: () => void;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};
		webviewView.description = "Amypo Question Panel";
		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "ready":
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
				case "reload":
					if (this._onReload) {
						this._onReload();
					}
					break;
				case "save":
					if (this._onSave) {
						this._onSave();
					}
					break;
				case "verify":
					if (this._onVerify) {
						this._onVerify();
					}
					break;
				case "pull":
					if (this._onPull) {
						this._onPull();
					}
					break;
				case "submit":
					if (this._onSubmit) {
						this._onSubmit();
					}
					break;
				case "startTest":
					if (this._onConfirm) {
						this._onConfirm();
					}
					break;
				case "fetchPdf":
					try {
						const pdfUrl = message.url;
						if (pdfUrl) {
							const agent = new https.Agent({ rejectUnauthorized: false });
							const response = await axios.get(encodeURI(pdfUrl), {
								responseType: "arraybuffer",
								httpsAgent: agent,
								headers: {
									"x-client-key":
										"9f3a7c1d5e8b2a6f4c0d7e1b9a3f6c8d2e5a7b1c4d9f0e6a3b8c2d5f7a1e9c0",
								},
							});
							const base64 = Buffer.from(response.data).toString("base64");
							webviewView.webview.postMessage({
								command: "pdfData",
								data: base64,
							});
						}
					} catch (err: any) {
						console.error("[Amypo] Error downloading PDF:", err);
						webviewView.webview.postMessage({
							command: "pdfDataError",
							error: err?.message || "Failed to download PDF",
						});
					}
					break;
			}
		});

		// ✅ Always set HTML immediately
		if (this._courseInfo) {
			this._view.webview.html = this._getHtml(
				this._view.webview,
				this._extensionUri,
				this._courseInfo,
			);
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

	public setOnReload(callback: () => void) {
		this._onReload = callback;
	}
	public setOnSave(callback: () => void) {
		this._onSave = callback;
	}
	public setOnVerify(callback: () => void) {
		this._onVerify = callback;
	}
	public setOnPull(callback: () => void) {
		this._onPull = callback;
	}
	public setOnSubmit(callback: () => void) {
		this._onSubmit = callback;
	}
	public setOnReady(callback: () => void) {
		if (this._webviewReady) {
			// Webview already fired ready — call immediately
			console.log(
				"[Amypo] Webview already ready — firing callback immediately",
			);
			setTimeout(callback, 100);
		} else {
			this._onReady = callback;
		}
	}

	public updateView(courseInfo: ICourseInfo, onConfirm: () => void) {
		this._courseInfo = courseInfo;
		this._onConfirm = onConfirm;
		this._webviewReady = false; // Reset — new HTML will fire 'ready' again

		if (this._view) {
			this._view.webview.html = this._getHtml(
				this._view.webview,
				this._extensionUri,
				courseInfo,
			);
			this._view.show?.(true);
		}
	}

	public postMessage(message: any) {
		if (message?.state !== "status") {
			this._lastMessage = message;
		}
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

	private _getHtml(
		webview: vscode.Webview,
		extensionUri: vscode.Uri,
		courseInfo: ICourseInfo,
	) {
		const nonce = getNonce();
		const logoUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "logo.png"),
		);

		const languagesHtml =
			courseInfo.languages && courseInfo.languages.length > 0
				? `<div class="languages">
				${courseInfo.languages.map((l: any) => `<span class="lang-tag">${l}</span>`).join("")}
			   </div>`
				: "";

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

                /* UI Icon Helper */
                .ui-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    vertical-align: middle;
                    flex-shrink: 0;
                    line-height: 1;
                }
                .ui-icon svg {
                    display: block;
                    stroke: currentColor;
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
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    margin: 10px 12px 78px 12px;
                    z-index: 1;
                }
                .content-area {
                    flex: 1;
                    min-height: 0;
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
                    height: 70px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 9px 14px;
                    background: var(--amy-bg-card);
                    border-top: 1px solid var(--amy-border);
                    box-shadow: 0 -2px 12px rgba(0,0,0,0.07);
                    z-index: 50;
                }
                .action-bar-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                }
                .action-bar-right {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                    justify-content: flex-end;
                }

                .btn-action {
                    flex: 1;
                    height: 52px;
                    padding: 0 14px;
                    border-radius: 9px;
                    border: 1px solid var(--amy-border);
                    background: var(--vscode-editor-background, rgba(128, 128, 128, 0.08));
                    color: var(--vscode-foreground);
                    font-size: 13.5px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 3px;
                    user-select: none;
                    text-decoration: none;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
                    letter-spacing: 0.15px;
                }
                body.vscode-dark .btn-action,
                body.vscode-high-contrast .btn-action {
                    background: rgba(255, 255, 255, 0.04);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                .btn-action:hover:not(:disabled) {
                    background: var(--amy-card-hover, rgba(128, 128, 128, 0.14));
                    border-color: var(--vscode-focusBorder, var(--amy-primary));
                    transform: translateY(-1.5px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
                }
                .btn-action:active:not(:disabled) {
                    transform: translateY(0);
                }
                .btn-action:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                    box-shadow: none !important;
                }

                .btn-action .btn-inner-row {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    font-size: 13.5px;
                    font-weight: 700;
                }
                .btn-action .ui-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-action .ui-icon svg {
                    width: 15px;
                    height: 15px;
                }
                .btn-verify .ui-icon svg {
                    width: 14px;
                    height: 14px;
                }

                /* Save Button (Warm Amber) */
                .btn-save {
                    background: #d97706 !important;
                    color: #ffffff !important;
                    border: 1px solid #b45309 !important;
                    box-shadow: 0 2px 6px rgba(217, 119, 6, 0.28) !important;
                }
                .btn-save:hover:not(:disabled) {
                    background: #b45309 !important;
                    border-color: #92400e !important;
                    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.38) !important;
                }
                .btn-save .save-time {
                    color: rgba(255, 255, 255, 0.85);
                }

                /* Pull Button (Royal Indigo) */
                .btn-pull {
                    background: #4f46e5 !important;
                    color: #ffffff !important;
                    border: 1px solid #4338ca !important;
                    box-shadow: 0 2px 6px rgba(79, 70, 229, 0.28) !important;
                }
                .btn-pull:hover:not(:disabled) {
                    background: #4338ca !important;
                    border-color: #3730a3 !important;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.38) !important;
                }
                .btn-pull .save-time {
                    color: rgba(255, 255, 255, 0.85);
                }

                /* Primary Verification Button (IDE Blue) */
                .btn-verify {
                    background: #0284c7 !important;
                    color: #ffffff !important;
                    border: 1px solid #0369a1 !important;
                    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.28) !important;
                }
                .btn-verify:hover:not(:disabled) {
                    background: #0369a1 !important;
                    border-color: #075985 !important;
                    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.38) !important;
                }
                .btn-verify .save-time {
                    color: rgba(255, 255, 255, 0.85);
                }

                /* Final Submit Button (Emerald Green) */
                .btn-submit {
                    background: #059669 !important;
                    color: #ffffff !important;
                    border: 1px solid #047857 !important;
                    box-shadow: 0 2px 6px rgba(5, 150, 105, 0.28) !important;
                }
                .btn-submit:hover:not(:disabled) {
                    background: #047857 !important;
                    border-color: #065f46 !important;
                    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.38) !important;
                }
                .btn-submit .save-time {
                    color: rgba(255, 255, 255, 0.85);
                }

                .save-time {
                    font-size: 11px;
                    opacity: 0.88;
                    font-weight: 500;
                    margin-top: 0px;
                    letter-spacing: 0.1px;
                }

                /* STATUS NOTIFICATIONS (Floating Toast - Top Right corner) */
                #status-bar,
                .status-msg {
                    position: fixed !important;
                    top: 54px !important;
                    right: 18px !important;
                    left: auto !important;
                    bottom: auto !important;
                    transform: none !important;
                    z-index: 999999 !important;
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    letter-spacing: 0.2px !important;
                    padding: 8px 16px !important;
                    border-radius: 9999px !important;
                    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2) !important;
                    max-width: 320px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                    line-height: 1.4 !important;
                    display: none;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
                #status-bar.show {
                    display: inline-flex !important;
                    animation: toastSlideRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                @keyframes toastSlideRight {
                    from {
                        transform: translateX(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                #status-bar.status-msg.success,
                .status-msg.success {
                    background: #059669 !important;
                    color: #ffffff !important;
                    border: 1px solid #10b981 !important;
                }
                #status-bar.status-msg.error,
                .status-msg.error {
                    background: #dc2626 !important;
                    color: #ffffff !important;
                    border: 1px solid #ef4444 !important;
                }
                #status-bar.status-msg.info,
                .status-msg.info {
                    background: #0284c7 !important;
                    color: #ffffff !important;
                    border: 1px solid #38bdf8 !important;
                }
                .status-close-btn {
                    font-size: 14px;
                    font-weight: 700;
                    opacity: 0.8;
                    margin-left: 6px;
                    line-height: 1;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                }
                .status-close-btn:hover {
                    opacity: 1;
                }

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
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.35);
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
                    background: var(--vscode-editorWidget-background, #ffffff);
                    color: var(--vscode-foreground, #0f172a);
                    padding: 36px 32px 30px 32px;
                    border-radius: 16px;
                    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
                    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    max-width: 560px;
                    min-height: 350px;
                    animation: modalFadeIn 0.3s ease-out;
                }
                body.vscode-dark .verify-modal,
                body.vscode-high-contrast .verify-modal {
                    background: #111827;
                    border-color: rgba(255, 255, 255, 0.15);
                }
                .verify-terminal {
                    background: #090d16;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    padding: 24px;
                    width: 100%;
                    height: 230px;
                    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.6);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    font-family: var(--vscode-editor-font-family, Consolas, monospace);
                    font-size: 13px;
                    line-height: 1.6;
                    color: #60a5fa;
                    margin-bottom: 22px;
                    position: relative;
                    overflow: hidden;
                }
                .verify-term-line { display: none; }
                .verify-term-line.active { display: block; animation: modalFadeIn 0.25s ease-out forwards; }
                .verify-term-line.current { color: #93c5fd; text-shadow: 0 0 8px rgba(147, 197, 253, 0.6); font-weight: 600; position: relative; }
                .verify-spinner {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border: 2px solid rgba(147, 197, 253, 0.3);
                    border-radius: 50%;
                    border-top-color: #93c5fd;
                    animation: amySpin 0.8s linear infinite;
                    margin-left: 8px;
                    vertical-align: middle;
                }
                .verify-text {
                    font-size: 15px;
                    color: var(--vscode-foreground, #0f172a);
                    font-weight: 700;
                    text-align: center;
                }

                /* ── RESULTS MODAL (HIGH VISIBILITY & USER-CRAFTED DESIGN) ── */
                .result-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    z-index: 10000;
                    display: none;
                    align-items: flex-start;
                    justify-content: center;
                    overflow-y: auto;
                    padding: 30px 16px;
                }
                .result-modal {
                    margin: auto;
                    background: #ffffff;
                    color: #0f172a;
                    border: 1px solid #cbd5e1;
                    width: 100%;
                    max-width: 880px;
                    border-radius: 16px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    padding: 24px 28px;
                    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
                }
                body.vscode-dark .result-modal,
                body.vscode-high-contrast .result-modal {
                    background: #0f172a;
                    color: #f8fafc;
                    border-color: rgba(255, 255, 255, 0.14);
                    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.75);
                }
                .result-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding-bottom: 16px;
                    margin-bottom: 16px;
                    border-bottom: 1px solid #e2e8f0;
                    width: 100%;
                    box-sizing: border-box;
                }
                body.vscode-dark .result-modal-header,
                body.vscode-high-contrast .result-modal-header {
                    border-bottom-color: rgba(255, 255, 255, 0.1);
                }
                .result-modal-title-group {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 0;
                }
                .result-modal-icon-badge {
                    width: 38px;
                    height: 38px;
                    border-radius: 10px;
                    background: rgba(37, 99, 235, 0.1);
                    color: #2563eb;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                body.vscode-dark .result-modal-icon-badge,
                body.vscode-high-contrast .result-modal-icon-badge {
                    background: rgba(56, 189, 248, 0.15);
                    color: #38bdf8;
                }
                .result-modal-title-text {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .result-modal-title {
                    font-size: 16.5px;
                    font-weight: 700;
                    color: #0f172a;
                    line-height: 1.25;
                    letter-spacing: -0.01em;
                }
                body.vscode-dark .result-modal-title,
                body.vscode-high-contrast .result-modal-title {
                    color: #f8fafc;
                }
                .result-modal-subtitle {
                    font-size: 11.5px;
                    font-weight: 500;
                    color: #64748b;
                    margin-top: 2px;
                }
                body.vscode-dark .result-modal-subtitle,
                body.vscode-high-contrast .result-modal-subtitle {
                    color: #94a3b8;
                }
                .result-modal-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-shrink: 0;
                }
                .result-close {
                    position: static !important;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: #f1f5f9;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                    padding: 0;
                    outline: none;
                }
                .result-close:hover {
                    background: #fee2e2;
                    color: #dc2626;
                    border-color: #fca5a5;
                    transform: scale(1.05);
                }
                body.vscode-dark .result-close,
                body.vscode-high-contrast .result-close {
                    background: rgba(255, 255, 255, 0.08);
                    color: #94a3b8;
                    border-color: rgba(255, 255, 255, 0.1);
                }
                body.vscode-dark .result-close:hover,
                body.vscode-high-contrast .result-close:hover {
                    background: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                    border-color: rgba(239, 68, 68, 0.4);
                }
                .result-header {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 10px 16px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: #0f172a;
                    font-weight: 700;
                    margin-bottom: 12px;
                    font-size: 13.5px;
                }
                body.vscode-dark .result-header,
                body.vscode-high-contrast .result-header {
                    background: #1e293b;
                    border-color: rgba(255, 255, 255, 0.1);
                    color: #f8fafc;
                }
                .result-section-label {
                    font-size: 14.5px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 14px;
                    text-align: left;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                body.vscode-dark .result-section-label,
                body.vscode-high-contrast .result-section-label {
                    color: #cbd5e1;
                }
                .result-cards {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 14px;
                    margin-bottom: 22px;
                    width: 100%;
                    box-sizing: border-box;
                }
                .result-card {
                    border-radius: 12px;
                    padding: 14px 16px;
                    text-align: left;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                    position: relative;
                    overflow: hidden;
                    transition: border-color 0.15s ease, transform 0.15s ease;
                }
                .result-card::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3.5px;
                }
                .result-card.total::before { background: #64748b; }
                .result-card.passed::before { background: #16a34a; }
                .result-card.failed::before { background: #dc2626; }
                .result-card.score::before { background: #0284c7; }

                .result-card.total { background: #f8fafc; border-color: #e2e8f0; }
                .result-card.passed { background: #f0fdf4; border-color: #bbf7d0; }
                .result-card.failed { background: #fef2f2; border-color: #fecdd3; }
                .result-card.score { background: #f0f9ff; border-color: #bae6fd; }

                body.vscode-dark .result-card,
                body.vscode-high-contrast .result-card {
                    box-shadow: none;
                }
                body.vscode-dark .result-card.total,
                body.vscode-high-contrast .result-card.total {
                    background: rgba(100, 116, 139, 0.1);
                    border-color: rgba(100, 116, 139, 0.25);
                }
                body.vscode-dark .result-card.passed,
                body.vscode-high-contrast .result-card.passed {
                    background: rgba(22, 163, 74, 0.1);
                    border-color: rgba(74, 222, 128, 0.25);
                }
                body.vscode-dark .result-card.failed,
                body.vscode-high-contrast .result-card.failed {
                    background: rgba(220, 38, 38, 0.1);
                    border-color: rgba(248, 113, 113, 0.25);
                }
                body.vscode-dark .result-card.score,
                body.vscode-high-contrast .result-card.score {
                    background: rgba(2, 132, 199, 0.1);
                    border-color: rgba(56, 189, 248, 0.25);
                }
                .result-card:hover {
                    transform: translateY(-1px);
                }
                .result-card-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }
                .result-card.total .result-card-label { color: #475569; }
                .result-card.passed .result-card-label { color: #15803d; }
                .result-card.failed .result-card-label { color: #b91c1c; }
                .result-card.score .result-card-label { color: #0369a1; }

                body.vscode-dark .result-card.total .result-card-label { color: #94a3b8; }
                body.vscode-dark .result-card.passed .result-card-label { color: #86efac; }
                body.vscode-dark .result-card.failed .result-card-label { color: #fca5a5; }
                body.vscode-dark .result-card.score .result-card-label { color: #7dd3fc; }

                .result-card-val {
                    font-size: 26px;
                    font-weight: 800;
                    font-family: var(--vscode-editor-font-family, Consolas, monospace);
                    line-height: 1.1;
                    font-variant-numeric: tabular-nums;
                }
                .result-card.total .result-card-val {
                    color: #0f172a;
                }
                body.vscode-dark .result-card.total .result-card-val,
                body.vscode-high-contrast .result-card.total .result-card-val {
                    color: #f8fafc;
                }

                .result-card.passed .result-card-val {
                    color: #16a34a;
                }
                body.vscode-dark .result-card.passed .result-card-val,
                body.vscode-high-contrast .result-card.passed .result-card-val {
                    color: #4ade80;
                }

                .result-card.failed .result-card-val {
                    color: #dc2626;
                }
                body.vscode-dark .result-card.failed .result-card-val,
                body.vscode-high-contrast .result-card.failed .result-card-val {
                    color: #f87171;
                }

                .result-card.score .result-card-val {
                    color: #0284c7;
                }
                body.vscode-dark .result-card.score .result-card-val,
                body.vscode-high-contrast .result-card.score .result-card-val {
                    color: #38bdf8;
                }

                /* Test Progress Bar */
                .res-progress-wrap {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    width: 100%;
                }
                .res-progress-tag {
                    font-size: 12px;
                    font-weight: 700;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    background: rgba(16, 185, 129, 0.1);
                    color: #15803d;
                    border: 1px solid rgba(16, 185, 129, 0.25);
                    font-family: var(--vscode-editor-font-family, Consolas, monospace);
                    letter-spacing: 0.02em;
                    white-space: nowrap;
                    display: inline-flex;
                    align-items: center;
                    line-height: 1.3;
                }
                body.vscode-dark .res-progress-tag,
                body.vscode-high-contrast .res-progress-tag {
                    background: rgba(16, 185, 129, 0.15);
                    color: #4ade80;
                    border-color: rgba(16, 185, 129, 0.35);
                }
                .res-progress-track {
                    width: 100%;
                    height: 6px;
                    border-radius: 9999px;
                    background: #e2e8f0;
                    overflow: hidden;
                    margin-bottom: 18px;
                    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
                }
                body.vscode-dark .res-progress-track,
                body.vscode-high-contrast .res-progress-track {
                    background: rgba(255, 255, 255, 0.1);
                }
                .res-progress-fill {
                    height: 100%;
                    background: #16a34a;
                    border-radius: 9999px;
                    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }

                /* SUB-TITLES & TECH BADGES */
                .sub-result-title {
                    margin: 18px 0 10px 0;
                    font-size: 13.5px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #0f172a;
                }
                body.vscode-dark .sub-result-title,
                body.vscode-high-contrast .sub-result-title {
                    color: #f1f5f9;
                }
                .tech-badge {
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11.5px;
                    font-weight: 700;
                }
                .tech-badge.spring {
                    background: #ffedd5;
                    color: #9a3412;
                    border: 1px solid #fed7aa;
                }
                .tech-badge.react {
                    background: #e0f2fe;
                    color: #0369a1;
                    border: 1px solid #bae6fd;
                }
                body.vscode-dark .tech-badge.spring {
                    background: rgba(249, 115, 22, 0.2);
                    color: #fdba74;
                    border-color: rgba(249, 115, 22, 0.35);
                }
                body.vscode-dark .tech-badge.react {
                    background: rgba(14, 165, 233, 0.2);
                    color: #7dd3fc;
                    border-color: rgba(14, 165, 233, 0.35);
                }
                .test-column-header {
                    font-size: 12.5px;
                    font-weight: 700;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .test-column-header.passed { color: #15803d; }
                .test-column-header.failed { color: #b91c1c; }
                body.vscode-dark .test-column-header.passed { color: #4ade80; }
                body.vscode-dark .test-column-header.failed { color: #f87171; }

                /* TEST LIST BOXES & ROWS */
                .terminal-box {
                    border: 1px solid #cbd5e1;
                    border-radius: 10px;
                    padding: 12px 14px;
                    background: #0f172a;
                    color: #f8fafc;
                    font-family: var(--vscode-editor-font-family, Consolas, monospace);
                    font-size: 12px;
                    line-height: 1.6;
                    min-height: 70px;
                    max-height: 220px;
                    overflow-y: auto;
                    text-align: left;
                    width: 100%;
                    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.3);
                }
                body.vscode-dark .terminal-box,
                body.vscode-high-contrast .terminal-box {
                    border-color: rgba(255, 255, 255, 0.12);
                    background: #060913;
                }
                .terminal-box.passed-box {
                    background: #f8fafc;
                    border: 1.5px solid #86efac;
                    color: #15803d;
                    box-shadow: none;
                }
                .terminal-box.failed-box {
                    background: #f8fafc;
                    border: 1.5px solid #fca5a5;
                    color: #b91c1c;
                    box-shadow: none;
                }
                body.vscode-dark .terminal-box.passed-box,
                body.vscode-high-contrast .terminal-box.passed-box {
                    background: rgba(15, 23, 42, 0.7);
                    border-color: rgba(74, 222, 128, 0.4);
                    color: #86efac;
                }
                body.vscode-dark .terminal-box.failed-box,
                body.vscode-high-contrast .terminal-box.failed-box {
                    background: rgba(15, 23, 42, 0.7);
                    border-color: rgba(248, 113, 113, 0.4);
                    color: #fca5a5;
                }

                .test-item-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 7px 10px;
                    margin-bottom: 5px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    font-family: var(--vscode-editor-font-family, Consolas, monospace);
                    word-break: break-all;
                }
                .test-item-row:last-child {
                    margin-bottom: 0;
                }
                .test-item-row.passed {
                    background: #ffffff;
                    border: 1px solid #bbf7d0;
                    color: #15803d;
                }
                .test-item-row.failed {
                    background: #ffffff;
                    border: 1px solid #fecdd3;
                    color: #b91c1c;
                }
                body.vscode-dark .test-item-row.passed,
                body.vscode-high-contrast .test-item-row.passed {
                    background: rgba(0, 0, 0, 0.35);
                    border-color: rgba(74, 222, 128, 0.25);
                    color: #86efac;
                }
                body.vscode-dark .test-item-row.failed,
                body.vscode-high-contrast .test-item-row.failed {
                    background: rgba(0, 0, 0, 0.35);
                    border-color: rgba(248, 113, 113, 0.25);
                    color: #fca5a5;
                }
                .test-item-badge {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    font-weight: 800;
                    font-size: 11px;
                    flex-shrink: 0;
                }
                .test-item-badge.passed {
                    background: #16a34a;
                    color: #ffffff;
                }
                .test-item-badge.failed {
                    background: #dc2626;
                    color: #ffffff;
                }
                .result-footer {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 22px;
                    padding-top: 16px;
                    border-top: 1px solid #e2e8f0;
                }
                body.vscode-dark .result-footer,
                body.vscode-high-contrast .result-footer {
                    border-top-color: rgba(255, 255, 255, 0.1);
                }
                .result-done-btn {
                    padding: 9px 26px;
                    font-size: 13px;
                    font-weight: 700;
                    border-radius: 8px;
                    background: var(--amy-primary, #2563eb);
                    color: #ffffff;
                    border: none;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: background 0.15s ease, transform 0.1s ease;
                }
                .result-done-btn:hover {
                    background: var(--amy-primary-hover, #1d4ed8);
                    transform: translateY(-1px);
                }

                @media (max-width: 640px) {
                    .result-cards {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                    .result-modal {
                        padding: 18px 16px !important;
                    }
                }

                /* RESPONSIVE QUERIES (Auto-adjust when sidebar is reduced/narrow) */
                @media (max-width: 520px) {
                    .topbar {
                        padding: 6px 10px;
                        gap: 6px;
                    }
                    .breadcrumb-wrapper {
                        display: none;
                    }
                    .result-cards {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .content-header {
                        padding: 6px 8px;
                        gap: 4px;
                        flex-wrap: wrap;
                    }
                    .tab-segment-group {
                        width: 100%;
                        display: flex;
                    }
                    .tab-btn {
                        padding: 5px 8px;
                        font-size: 11.5px;
                        white-space: nowrap;
                        flex: 1;
                        justify-content: center;
                    }
                    /* Convert 4 squished buttons into a clean 2x2 grid */
                    .main-layout {
                        margin-bottom: 124px;
                    }
                    .action-bar {
                        height: auto;
                        min-height: 114px;
                        flex-direction: column;
                        padding: 10px 12px;
                        gap: 8px;
                    }
                    .action-bar-left,
                    .action-bar-right {
                        width: 100%;
                        display: flex;
                        gap: 8px;
                    }
                    .btn-action {
                        height: 48px;
                        min-height: 48px;
                        font-size: 13px;
                        padding: 0 10px;
                        border-radius: 8px;
                    }
                    .btn-action .btn-inner-row {
                        gap: 6px;
                        font-size: 13px;
                        font-weight: 700;
                        white-space: nowrap;
                    }
                    .btn-action .save-time {
                        font-size: 10.5px;
                        white-space: nowrap;
                    }
                }
            </style>
        </head>
        <body>
            <!-- MODAL VIEWS -->
            <div id="modal-wrapper" style="${courseInfo.shouldRestore ? "display: none;" : ""}">
                <div id="modal-content">
                    <div id="step1">
                        <img src="${logoUri}" alt="Amypo" class="illustration">
                        <div class="title">${courseInfo.module_name}</div>
                        <div class="subtext">${courseInfo.course_name}</div>
                        ${languagesHtml}
                        ${
													courseInfo.errorMessage
														? `<div style="color: #ef4444; margin-top: 16px; font-weight: 600; text-align: center; border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.08);">${courseInfo.errorMessage}</div>`
														: `<div class="buttons">
                            <button class="btn-start" id="start">Start Assessment</button>
                        </div>`
												}
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
            <div id="question-ui" style="${courseInfo.shouldRestore ? "display: flex;" : ""}">
                <div id="status-bar" class="status-msg" style="display: none;"></div>
                <div class="topbar">
                    <div class="topbar-left">
                        <div class="logo-container">
                            <img src="${logoUri}" alt="Amypo" class="logo">
                        </div>
                        <div class="breadcrumb-wrapper" title="${courseInfo.course_name} / ${courseInfo.module_name}">
                            <span class="breadcrumb-course">${courseInfo.course_name || "Course"}</span>
                            <span class="breadcrumb-divider">/</span>
                            <span class="breadcrumb-module">${courseInfo.module_name || "Module"}</span>
                        </div>
                    </div>

                    <div class="topbar-right">
                        <!-- Live Assessment Timer -->
                        <div class="timer-pill" id="test-timer-badge" title="Assessment Duration">
                            <span class="timer-pulse"></span>
                            <span class="ui-icon" style="margin-right: 2px;">
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="8" cy="8.5" r="6"/>
                                    <polyline points="8 5.5 8 8.5 10.5 10"/>
                                    <path d="M6 1.5h4"/>
                                </svg>
                            </span>
                            <span id="test-timer-display">00:00:00</span>
                        </div>

                        <!-- User Profile Popover -->
                        <div class="tooltip-container">
                            <div class="meta-chip" tabindex="0">
                                <span class="ui-icon">
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="8" cy="5" r="3.2"/>
                                        <path d="M2.5 14.5c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/>
                                    </svg>
                                </span>
                                <span>${courseInfo.user_name ? courseInfo.user_name.split(" ")[0] : "Candidate"}</span>
                                <span class="chip-caret">▾</span>
                            </div>
                            <div class="tooltip-content">
                                <div class="tooltip-title">
                                    <span class="ui-icon" style="margin-right: 4px;">
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="8" cy="5" r="3.2"/>
                                            <path d="M2.5 14.5c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/>
                                        </svg>
                                    </span> Candidate Profile
                                </div>
                                <div class="tooltip-grid">
                                    <div class="tooltip-row"><span class="k">Name</span><span class="v">${courseInfo.user_name || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Email</span><span class="v">${courseInfo.user_email || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Roll No</span><span class="v">${courseInfo.user_roll_no || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">College</span><span class="v">${courseInfo.user_college || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Department</span><span class="v">${courseInfo.user_department || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Batch / Sec</span><span class="v">${(courseInfo.user_batch || "-") + " / " + (courseInfo.user_section || "-")}</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Course Meta Popover -->
                        <div class="tooltip-container">
                            <div class="meta-chip" tabindex="0">
                                <span class="ui-icon">
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="8" cy="8" r="6.5"/>
                                        <line x1="8" y1="7" x2="8" y2="11.5"/>
                                        <circle cx="8" cy="4.5" r="0.8" fill="currentColor"/>
                                    </svg>
                                </span>
                                <span>Details</span>
                                <span class="chip-caret">▾</span>
                            </div>
                            <div class="tooltip-content">
                                <div class="tooltip-title">
                                    <span class="ui-icon" style="margin-right: 4px;">
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="8" cy="8" r="6.5"/>
                                            <line x1="8" y1="7" x2="8" y2="11.5"/>
                                            <circle cx="8" cy="4.5" r="0.8" fill="currentColor"/>
                                        </svg>
                                    </span> Assessment Overview
                                </div>
                                <div class="tooltip-grid">
                                    <div class="tooltip-row"><span class="k">Course</span><span class="v">${courseInfo.course_name || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Topic</span><span class="v">${courseInfo.topic_name || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Module</span><span class="v">${courseInfo.module_name || "N/A"}</span></div>
                                    <div class="tooltip-row"><span class="k">Test Type</span><span class="v">${courseInfo.test_type || "Assessment"}</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Version Tag -->
                        <span class="version-tag">
                            v${courseInfo.version ?? "1.5.9"}
                        </span>
                    </div>
                </div>

                <div class="main-layout">
                    <div class="content-area">
                        <div class="content-header">
                            <div class="tab-segment-group">
                                <button class="tab-btn active" id="tab-q">
                                    <span class="ui-icon" style="margin-right: 5px;">
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M4 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13V4A1.5 1.5 0 0 1 4 2.5z"/>
                                            <line x1="5.5" y1="6" x2="10.5" y2="6"/>
                                            <line x1="5.5" y1="9" x2="10.5" y2="9"/>
                                            <line x1="5.5" y1="12" x2="8.5" y2="12"/>
                                        </svg>
                                    </span> Question
                                </button>
                                <button class="tab-btn" id="tab-src" style="display: none;">
                                    <span class="ui-icon" style="margin-right: 5px;">
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h5l4 4v8.5A1.5 1.5 0 0 1 12 15H4.5A1.5 1.5 0 0 1 3 13.5v-11z"/>
                                            <polyline points="9.5 1 9.5 5 13.5 5"/>
                                        </svg>
                                    </span> SRS Document
                                    <span class="tab-badge">PDF</span>
                                </button>
                            </div>

                            <div class="header-actions">
                                <button class="icon-action-btn" id="view-res-btn" style="display: none;" title="Open Test Results">
                                    <span class="ui-icon" style="margin-right: 5px;">
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                            <rect x="2" y="9" width="3" height="5" rx="0.8"/>
                                            <rect x="6.5" y="5" width="3" height="9" rx="0.8"/>
                                            <rect x="11" y="2" width="3" height="12" rx="0.8"/>
                                        </svg>
                                    </span> Results
                                </button>
                            </div>
                        </div>

                        <div id="content-container" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative;">
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
                            <div id="data-view" style="display: none; flex: 1; min-height: 0; flex-direction: column; overflow: hidden;">
                                <div id="q-content" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 20px; user-select: text; -webkit-user-select: text;">
                                    <div class="q-header-row">
                                        <div class="q-title" id="q-title">Loading Question...</div>
                                        <div class="marks-badge" id="q-marks-badge" style="display: none;">
                                            <span>✨</span> <span id="q-marks-val">0</span> Marks
                                        </div>
                                    </div>
                                    <div class="q-description" id="q-desc"></div>
                                </div>
                            </div>

                            <!-- SRC View -->
                            <div id="src-view" style="flex: 1; min-height: 0; display: none; flex-direction: column; position: relative; overflow: hidden;" oncontextmenu="return false;">
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
                                <div id="pdf-container" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 16px; background: var(--vscode-editor-background); display: none; flex-direction: column;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modern Action Bar -->
                <div class="action-bar">
                    <div class="action-bar-left">
                        <button class="btn-action btn-save" id="save-btn" title="Save workspace state to cloud">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="save-spinner"></div>
                                <span class="ui-icon">
                                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12.5 14H3.5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3.5 2H10l3.5 3.5v7a1.5 1.5 0 0 1-1.5 1.5z"/>
                                        <polyline points="9.5 2 9.5 5.5 4.5 5.5"/>
                                        <polyline points="4.5 14 4.5 9.5 11.5 9.5 11.5 14"/>
                                    </svg>
                                </span>
                                <span>Save</span>
                            </div>
                            <div class="save-time">
                                <span>Saved: </span><span id="last-saved-time">ready</span>
                            </div>
                        </button>
                        <button class="btn-action btn-pull" id="pull-btn" title="Pull latest changes from remote repository">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="pull-spinner"></div>
                                <span class="ui-icon">
                                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M8 2v9"/>
                                        <polyline points="4.5 7.5 8 11 11.5 7.5"/>
                                        <path d="M2.5 13.5h11"/>
                                    </svg>
                                </span>
                                <span>Pull</span>
                            </div>
                            <span class="save-time" id="pull-status-label">Sync code</span>
                        </button>
                    </div>

                    <div class="action-bar-right">
                        <button class="btn-action btn-verify" id="verify-btn" title="Run tests and verify implementation">
                            <div class="btn-inner-row">
                                <span class="ui-icon">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <polygon points="4 2.5 13 8 4 13.5 4 2.5"/>
                                    </svg>
                                </span>
                                <span>Check Verify</span>
                            </div>
                            <span class="save-time">Run testcases</span>
                        </button>
                        <button class="btn-action btn-submit" id="submit-btn" title="Final submission of your assessment">
                            <div class="btn-inner-row">
                                <div class="btn-spinner" id="submit-spinner"></div>
                                <span class="ui-icon">
                                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14.5 1.5l-6 13-2.5-5.5L.5 6.5l14-5z"/>
                                        <line x1="6" y1="9" x2="14.5" y2="1.5"/>
                                    </svg>
                                </span>
                                <span>Final Submit</span>
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
                        <!-- Modern Non-Colliding Modal Header -->
                        <div class="result-modal-header">
                            <div class="result-modal-title-group">
                                <div class="result-modal-icon-badge">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="3" y="12" width="4" height="9" rx="1"/>
                                        <rect x="10" y="6" width="4" height="15" rx="1"/>
                                        <rect x="17" y="2" width="4" height="19" rx="1"/>
                                    </svg>
                                </div>
                                <div class="result-modal-title-text">
                                    <div class="result-modal-title">Test Results Summary</div>
                                    <div class="result-modal-subtitle">Evaluation and automated test execution report</div>
                                </div>
                            </div>
                            <div class="result-modal-header-actions">
                                <span class="res-progress-tag" id="res-progress-pct">0% Passed</span>
                                <div class="result-close" id="result-close" title="Close dialog" aria-label="Close">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="3" y1="3" x2="13" y2="13"/>
                                        <line x1="13" y1="3" x2="3" y2="13"/>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div class="res-progress-track">
                            <div class="res-progress-fill" id="res-progress-fill" style="width: 0%;"></div>
                        </div>
                        <div class="result-cards">
                            <div class="result-card total">
                                <span class="result-card-label">Total</span>
                                <span class="result-card-val" id="res-total">0</span>
                            </div>
                            <div class="result-card passed">
                                <span class="result-card-label">Passed</span>
                                <span class="result-card-val" id="res-passed">0</span>
                            </div>
                            <div class="result-card failed">
                                <span class="result-card-label">Failed</span>
                                <span class="result-card-val" id="res-failed">0</span>
                            </div>
                            <div class="result-card score">
                                <span class="result-card-label">Score</span>
                                <span class="result-card-val" id="res-score">0.00</span>
                            </div>
                        </div>

                        <div id="res-test-cases-section" style="display: none; margin-bottom: 25px; width: 100%;">
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header passed">✓ Passed Tests</div>
                                    <div class="terminal-box passed-box" id="res-passed-tests" style="min-height: 60px; max-height: 160px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header failed">✕ Failed Tests</div>
                                    <div class="terminal-box failed-box" id="res-failed-tests" style="min-height: 60px; max-height: 160px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                            </div>
                        </div>

                        <!-- FULLSTACK BREAKDOWN -->
                        <div id="res-fs-cases-section" style="display: none; margin-bottom: 25px; width: 100%;">
                            <h4 class="sub-result-title"><span class="tech-badge spring">Spring Boot</span> Test Results</h4>
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header passed">✓ Passed Tests</div>
                                    <div class="terminal-box passed-box" id="res-fs-spring-passed" style="min-height: 50px; max-height: 120px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header failed">✕ Failed Tests</div>
                                    <div class="terminal-box failed-box" id="res-fs-spring-failed" style="min-height: 50px; max-height: 120px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                            </div>

                            <h4 class="sub-result-title"><span class="tech-badge react">React</span> Test Results</h4>
                            <div style="display: flex; gap: 16px; width: 100%; box-sizing: border-box; margin-bottom: 15px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header passed">✓ Passed Tests</div>
                                    <div class="terminal-box passed-box" id="res-fs-react-passed" style="min-height: 50px; max-height: 120px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="test-column-header failed">✕ Failed Tests</div>
                                    <div class="terminal-box failed-box" id="res-fs-react-failed" style="min-height: 50px; max-height: 120px; overflow-y: auto; overflow-wrap: break-word;">None</div>
                                </div>
                            </div>

                            <div class="result-header">
                                <span class="ui-icon" style="margin-right: 6px; display: inline-flex;">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                                        <polyline points="4.5 6 7 8 4.5 10"/>
                                        <line x1="8.5" y1="10" x2="11.5" y2="10"/>
                                    </svg>
                                </span>
                                <span>Spring Boot Terminal Output</span>
                            </div>
                            <div class="terminal-box" id="res-fs-spring-terminal" style="max-height: 180px; overflow-y: auto;"></div>

                            <div class="result-header" style="margin-top: 14px;">
                                <span class="ui-icon" style="margin-right: 6px; display: inline-flex;">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                                        <polyline points="4.5 6 7 8 4.5 10"/>
                                        <line x1="8.5" y1="10" x2="11.5" y2="10"/>
                                    </svg>
                                </span>
                                <span>React Terminal Output</span>
                            </div>
                            <div class="terminal-box" id="res-fs-react-terminal" style="max-height: 180px; overflow-y: auto;"></div>
                        </div>

                        <!-- STANDARD FALLBACK -->
                        <div id="standard-terminal-section" style="display: block;">
                            <div class="result-header">
                                <span class="ui-icon" style="margin-right: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                                        <polyline points="4.5 6 7 8 4.5 10"/>
                                        <line x1="8.5" y1="10" x2="11.5" y2="10"/>
                                    </svg>
                                </span>
                                <span>Terminal Output</span>
                            </div>
                            <div class="terminal-box" id="res-terminal">No output from Terminal</div>
                        </div>

                        <!-- FOOTER ACTION -->
                        <div class="result-footer">
                            <button class="result-done-btn" id="result-footer-close">
                                <span>Done</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
            <script nonce="${nonce}">
                let vInterval = null;
                let expectedTestCount = 0;
                let totalQuestionMark = 0;
                let currentQData = null;
                const storageUrl = "${courseInfo.storageUrl || ""}";
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

                // Toast Notification Controller (Top-Right Floating Notification)
                let statusNotificationTimeout = null;
                function showNotification(text, type, duration) {
                    const status = document.getElementById('status-bar');
                    if (!status) return;
                    if (statusNotificationTimeout) {
                        clearTimeout(statusNotificationTimeout);
                        statusNotificationTimeout = null;
                    }
                    const notifyType = type || 'info';
                    status.className = 'status-msg ' + notifyType + ' show';
                    status.innerHTML = '<span>' + text + '</span><span class="status-close-btn" title="Dismiss">&times;</span>';
                    status.style.setProperty('display', 'inline-flex', 'important');

                    status.onclick = () => {
                        hideNotification();
                    };

                    const autoCloseMs = duration || (notifyType === 'error' ? 5000 : 3500);
                    statusNotificationTimeout = setTimeout(() => {
                        hideNotification();
                    }, autoCloseMs);
                }

                function hideNotification() {
                    const status = document.getElementById('status-bar');
                    if (!status) return;
                    if (statusNotificationTimeout) {
                        clearTimeout(statusNotificationTimeout);
                        statusNotificationTimeout = null;
                    }
                    status.classList.remove('show');
                    status.classList.remove('success');
                    status.classList.remove('error');
                    status.classList.remove('info');
                    status.style.setProperty('display', 'none', 'important');
                    status.innerHTML = '';
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
                const resFooterClose = document.getElementById('result-footer-close');
                if (resFooterClose) {
                    resFooterClose.onclick = () => { if(resOverlay) resOverlay.style.display = 'none'; };
                }
                if (resOverlay) {
                    resOverlay.onclick = (e) => {
                        if (e.target === resOverlay) resOverlay.style.display = 'none';
                    };
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
                        console.log('[Amypo] Clicked Save');
                        showNotification('Saving changes to cloud...', 'info', 4000);
                        setSyncStatus('syncing', 'Syncing...');
                        saveBtn.disabled = true;
                        document.getElementById('save-spinner').style.display = 'block';

                        vscode.postMessage({ command: 'save' });
                    };
                }

                const verifyBtn = document.getElementById('verify-btn');
                if (verifyBtn) {
                    verifyBtn.onclick = () => {
                        console.log('[Amypo] Clicked Check Verify');
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
                        console.log('[Amypo] Clicked Final Submit');
                        showNotification('Submitting final assessment...', 'info', 5000);
                        submitBtn.disabled = true;
                        document.getElementById('submit-spinner').style.display = 'block';

                        vscode.postMessage({ command: 'submit' });
                    };
                }

                const pullBtn = document.getElementById('pull-btn');
                if (pullBtn) {
                    pullBtn.onclick = () => {
                        console.log('[Amypo] Clicked Pull');
                        showNotification('Pulling latest code from cloud...', 'info', 4000);
                        setSyncStatus('syncing', 'Pulling...');
                        const pullLbl = document.getElementById('pull-status-label');
                        if (pullLbl) pullLbl.innerText = 'Pulling...';
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
                if (${courseInfo.shouldRestore ? "true" : "false"}) {
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
                            showNotification(message.text, message.type, message.type === 'error' ? 5000 : 3500);

                            // Update cloud sync badge
                            if (message.type === 'success') {
                                setSyncStatus('synced', 'Synced');
                                if (message.text && (message.text.includes('Saved') || message.text.includes('cloud'))) {
                                    console.log('[Amypo] Save Successful');
                                } else if (message.text && (message.text.includes('Pulled') || message.text.includes('pull') || message.text.includes('Pull'))) {
                                    console.log('[Amypo] Pull Successfully');
                                    const pullLbl = document.getElementById('pull-status-label');
                                    if (pullLbl) pullLbl.innerText = 'Up to date';
                                } else if (message.text && (message.text.includes('submitted') || message.text.includes('Final'))) {
                                    console.log('[Amypo] Final Submit Successful');
                                }
                            } else if (message.type === 'error') {
                                setSyncStatus('error', 'Sync error');
                                const pullLbl = document.getElementById('pull-status-label');
                                if (pullLbl && pullLbl.innerText === 'Pulling...') pullLbl.innerText = 'Sync code';
                            }

                            // Re-enable save button on success or error
                            if (message.type === 'success' || message.type === 'error') {
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

                                    const pct = totalDisplay > 0 ? Math.round((passed / totalDisplay) * 100) : 0;
                                    const pBar = document.getElementById('res-progress-fill');
                                    if (pBar) {
                                        pBar.style.width = pct + '%';
                                        pBar.style.background = pct === 100 ? '#16a34a' : (pct > 0 ? '#0284c7' : '#dc2626');
                                    }
                                    const pTag = document.getElementById('res-progress-pct');
                                    if (pTag) {
                                        pTag.innerText = pct + '% Passed';
                                        if (pct === 0) {
                                            pTag.style.background = 'rgba(239, 68, 68, 0.1)';
                                            pTag.style.color = '#dc2626';
                                            pTag.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                                        } else if (pct === 100) {
                                            pTag.style.background = 'rgba(16, 185, 129, 0.15)';
                                            pTag.style.color = '#15803d';
                                            pTag.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                                        } else {
                                            pTag.style.background = 'rgba(2, 132, 199, 0.12)';
                                            pTag.style.color = '#0284c7';
                                            pTag.style.borderColor = 'rgba(2, 132, 199, 0.25)';
                                        }
                                    }

                                    const passedList = results.passedTests || [];
                                    const failedList = results.failedTests || [];

                                    // Surface the Results button in the content header
                                    const vrBtn = document.getElementById('view-res-btn');
                                    if (vrBtn) vrBtn.style.display = 'inline-flex';

                                    function renderTestList(el, list, isPassed) {
                                        if (!el) return;
                                        if (list && list.length > 0) {
                                            var rowClass = isPassed ? 'test-item-row passed' : 'test-item-row failed';
                                            var badgeClass = isPassed ? 'test-item-badge passed' : 'test-item-badge failed';
                                            var badgeIcon = isPassed ? '✓' : '✕';
                                            el.innerHTML = list.map(function(item) {
                                                return '<div class="' + rowClass + '">' +
                                                    '<span class="' + badgeClass + '">' + badgeIcon + '</span>' +
                                                    '<span>' + item + '</span>' +
                                                '</div>';
                                            }).join('');
                                        } else {
                                            el.innerHTML = '<div style="color: var(--vscode-descriptionForeground, #64748b); font-style: normal; font-weight: 500; padding: 12px 10px; text-align: center;">No ' + (isPassed ? 'passed' : 'failed') + ' test cases</div>';
                                        }
                                    }

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
                                        renderTestList(pBoxSpring, payload.spring_results.passedTests || [], true);

                                        const fBoxSpring = document.getElementById('res-fs-spring-failed');
                                        renderTestList(fBoxSpring, payload.spring_results.failedTests || [], false);

                                        // React Data
                                        const pBoxReact = document.getElementById('res-fs-react-passed');
                                        renderTestList(pBoxReact, payload.react_results.passedTests || [], true);

                                        const fBoxReact = document.getElementById('res-fs-react-failed');
                                        renderTestList(fBoxReact, payload.react_results.failedTests || [], false);

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
                                            renderTestList(pBox, passedList, true);

                                            const fBox = document.getElementById('res-failed-tests');
                                            renderTestList(fBox, failedList, false);
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
	let text = "";
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
