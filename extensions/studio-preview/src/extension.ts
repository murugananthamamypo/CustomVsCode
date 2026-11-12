/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { PreviewManager } from './webview/PreviewManager';
import { SidebarProvider } from './providers/SidebarProvider';
import { ProjectDetector } from './core/ProjectDetector';

let isProcessing = false;
let globalPreviewManager: PreviewManager | undefined;
let globalSidebarProvider: SidebarProvider | undefined;

// ── Auto-Update Helpers ──

function httpsGetJson(url: string): Promise<any> {
	const https = require('https');
	return new Promise((resolve, reject) => {
		https.get(url, { timeout: 5000 }, (res: any) => {
			if (res.statusCode !== 200) {
				res.resume();
				return reject(new Error(`HTTP ${res.statusCode}`));
			}
			let data = '';
			res.on('data', (chunk: string) => data += chunk);
			res.on('end', () => {
				try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
			});
		}).on('error', reject);
	});
}

function httpsDownload(url: string): Promise<Buffer> {
	const https = require('https');
	return new Promise((resolve, reject) => {
		https.get(url, { timeout: 60000 }, (res: any) => {
			if (res.statusCode !== 200) {
				res.resume();
				return reject(new Error(`HTTP ${res.statusCode}`));
			}
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks)));
		}).on('error', reject);
	});
}

async function checkForExtensionUpdate(context: vscode.ExtensionContext): Promise<boolean> {
	// Skip auto-update if running in development mode
	if (vscode.env.appRoot.toLowerCase().includes('customvscode')) {
		console.log('[Amypo Browser Update] Development mode detected: Skipping auto-update.');
		return false;
	}

	const statusBarItem = vscode.window.setStatusBarMessage('$(sync~spin) Amypo Browser: Checking for updates...');
	try {
		const currentVersion = context.extension.packageJSON?.version ?? '0.0.0';
		console.log(`[Amypo Browser Update] Current version: ${currentVersion}`);

		const serverType = context.globalState.get<string>('server_type') ?? 'production';
		const isDev = serverType.toLowerCase().startsWith('dev');
		const versionUrl = isDev
			? 'https://1102amy21.amypo.ai/storage/products/version.json'
			: 'https://endpoint.amypo.ai/storage/products/version.json';
		const versionData = await httpsGetJson(versionUrl);
		statusBarItem.dispose();

		const extensionData = versionData.extensions
			?.find((e: any) => e.id === 'AMYPO.amypo-browser');
		const latestVersion = extensionData?.version;
		const downloadUrl = extensionData?.downloadUrl;

		if (!latestVersion || !downloadUrl) {
			console.log('[Amypo Browser Update] Extension "AMYPO.amypo-browser" not found in version.json — skipping.');
			return false;
		}

		console.log(`[Amypo Browser Update] Server: ${latestVersion} | Current: ${currentVersion}`);

		if (currentVersion === latestVersion) {
			console.log('[Amypo Browser Update] Already up to date.');
			return false;
		}

		if (!compareVersions(latestVersion, currentVersion)) {
			console.log('[Amypo Browser Update] No newer version.');
			return false;
		}

		console.log(`[Amypo Browser Update] New version found: ${latestVersion}`);

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Amypo Browser: Updating to v${latestVersion}...`,
			cancellable: false
		}, async (progress) => {

			progress.report({ message: 'Downloading...' });
			const vsixBuffer = await httpsDownload(downloadUrl);

			progress.report({ message: 'Saving...' });
			const tempDir = path.join(os.tmpdir(), 'amypo-updates');
			await fs.promises.mkdir(tempDir, { recursive: true });
			const vsixPath = path.join(tempDir, `amypo-browser-${latestVersion}.vsix`);
			await fs.promises.writeFile(vsixPath, vsixBuffer);
			console.log(`[Amypo Browser Update] VSIX saved: ${vsixPath}`);

			progress.report({ message: 'Installing...' });
			await vscode.commands.executeCommand(
				'workbench.extensions.installExtension',
				vscode.Uri.file(vsixPath)
			);

			try { await fs.promises.unlink(vsixPath); } catch { }
			progress.report({ message: 'Done!' });
		});

		vscode.window.showInformationMessage(`✅ Amypo Browser updated to v${latestVersion}. Reloading...`);
		vscode.commands.executeCommand('workbench.action.reloadWindow');
		return true;

	} catch (error: any) {
		console.warn('[Amypo Browser Update] Update check failed:', error.message);
		console.warn('[Amypo Browser Update] Stack:', error.stack);
		return false;
	}
}

function compareVersions(versionA: string, versionB: string): boolean {
	const a = versionA.split('.').map(Number);
	const b = versionB.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] || 0) > (b[i] || 0)) { return true; }
		if ((a[i] || 0) < (b[i] || 0)) { return false; }
	}
	return false;
}

export function activate(context: vscode.ExtensionContext) {
	console.log('[Amypo Browser] Activating…');

	// ── Auto-update check (non-blocking)
	checkForExtensionUpdate(context).catch((err) => {
		console.error('[Amypo Browser Update] Unhandled:', err);
	});

	const projectDetector = new ProjectDetector();
	const previewManager = PreviewManager.getInstance(context.extensionUri);
	globalPreviewManager = previewManager;

	const version = context.extension.packageJSON?.version ?? '0.0.0';

	const sidebarProvider = new SidebarProvider(
		context.extensionUri,
		projectDetector,
		previewManager,
		version
	);
	globalSidebarProvider = sidebarProvider;

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SidebarProvider.viewType,
			sidebarProvider
		)
	);

	//   amypo.toggleBrowser
	//   Multi-Server Responsive Toggle

	const toggleCmd = vscode.commands.registerCommand('amypo.toggleBrowser', async () => {
		if (isProcessing) return;

		// 1. If already open -> Close Browser
		if (previewManager.isOpen) {
			previewManager.toggle();
			return;
		}

		// const workspaceFolders = vscode.workspace.workspaceFolders;
		// if (!workspaceFolders || workspaceFolders.length === 0) {
		//     vscode.window.showWarningMessage('Amypo Browser: Please open a folder.');
		//     return;
		// }

		// ✅ Always use actual workspace
		const workspaceFolders = vscode.workspace.workspaceFolders;
		let activeRoot = workspaceFolders?.[0]?.uri.fsPath ?? '';

		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
			if (folder) activeRoot = folder.uri.fsPath;
		}

		// ✅ If no workspace open — show blank
		if (!activeRoot) {
			previewManager.open([]);
			return;
		}

		isProcessing = true;
		try {
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'Amypo Browser', cancellable: false },
				async (progress) => {
					progress.report({ message: 'Detecting services…' });

					const projects = await projectDetector.detect(activeRoot);

					progress.report({ message: 'Launching Dashboard…' });
					// ✅ Always use open() — it sets projects first then opens
					previewManager.open(
						projects.length > 0
							? projects
							: [{ type: 'static', category: 'static', rootPath: activeRoot, port: 5500, startCommand: '', label: 'Local Dev' }]
					);
				}
			);
		} finally {
			isProcessing = false;
		}
	});


	// Detects changes in the workspace and automatically refreshes the browser.
	const autoReloadListener = vscode.workspace.onDidSaveTextDocument((doc) => {
		// Only reload if it's a static HTML/CSS file to prevent breaking Hot Module Replacement
		const ext = doc.fileName.split('.').pop()?.toLowerCase();
		const validExts = ['html', 'css'];

		if (previewManager.isOpen && validExts.includes(ext || '')) {
			console.log('[Amypo Browser] Auto-Reload triggered by static file save:', doc.fileName);
			previewManager.navigate('refresh');
		}
	});

	const openCmd = vscode.commands.registerCommand('amypo.openSimpleBrowser',
		() => vscode.commands.executeCommand('amypo.toggleBrowser'));

	const refreshCmd = vscode.commands.registerCommand('amypo.refreshBrowser', () => {
		previewManager.navigate('refresh');
	});

	const stopCmd = vscode.commands.registerCommand('amypo.stopServer', () => {
		previewManager.toggle(); // Closes the browser
	});

	context.subscriptions.push(toggleCmd, openCmd, refreshCmd, stopCmd, autoReloadListener,
		{
			dispose: () => {
				previewManager.dispose();
			}
		});


	/*
	// ✅ Amypo EduTech - Handle URL Protocol
	// amypo://starttest?repo=...&question=...
	context.subscriptions.push(
		vscode.window.registerUriHandler({
			handleUri: async (uri: vscode.Uri) => {
				vscode.window.setStatusBarMessage(`$(sync~spin) Amypo EduTech: URI Received...`, 5000);
				console.log('[Amypo EduTech] URI received:', uri.toString());

				const params = new URLSearchParams(uri.query);
				const isStartTest = uri.path.includes('starttest') || uri.authority === 'starttest';
				const isSubmitTest = uri.path.includes('submittest') || uri.authority === 'submittest';

				if (isStartTest) {
					const allocationId = params.get('allocation_id');
					const testType = params.get('test_type');
					const token = params.get('testId');
					const moduleId = params.get('module_id');

					if (allocationId && testType && token) {
						await getTestDetails(Number(allocationId), Number(testType), token, moduleId ? Number(moduleId) : undefined);
					} else {
						vscode.window.showErrorMessage('Amypo: Invalid Test URI parameters.');
					}
				}
			}
		})
	);
	*/

	vscode.commands.executeCommand('setContext', 'amypo.browserOpen', false);


}


export function deactivate() {
	if (globalPreviewManager) globalPreviewManager.dispose();
}
