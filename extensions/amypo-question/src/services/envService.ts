/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

function parse(out: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const line of out.split(/\r?\n/)) {
		const m = line.match(/^\s+(.+?)\s+REG_(?:EXPAND_)?SZ\s*(.*)$/i);
		if (m) {
			vars[m[1]] = m[2].trim();
		}
	}
	return vars;
}

export function getFreshWindowsEnv(): NodeJS.ProcessEnv {
	if (process.platform !== 'win32') {
		return process.env;
	}
	try {
		const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
		const reg = path.join(sysRoot, 'System32', 'reg.exe');
		const opts = { encoding: 'utf8' as const, timeout: 5000 };
		const sys = parse(cp.execFileSync(reg, ['query', 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment'], opts));
		const usr = parse(cp.execFileSync(reg, ['query', 'HKCU\\Environment'], opts));

		const env: NodeJS.ProcessEnv = { ...process.env };

		const expand = (s: string) => s.replace(/%([^%]+)%/g, (_, n) => {
			const key = Object.keys(env).find(x => x.toLowerCase() === n.toLowerCase());
			return key ? env[key] || '' : `%${n}%`;
		});

		// system first, then user, so user values win (standard Windows behavior)
		for (const [k, v] of Object.entries({ ...sys, ...usr })) {
			if (k.toLowerCase() !== 'path') {
				env[k] = expand(v);
			}
		}

		const regDirs = (expand(sys['Path'] || '') + ';' + expand(usr['Path'] || '')).split(';').filter(Boolean);
		const curDirs = (process.env.Path || process.env.PATH || '').split(';').filter(Boolean);
		const mergedPath = Array.from(new Set([...regDirs, ...curDirs])).join(';');
		env.Path = mergedPath;
		env.PATH = mergedPath;

		// Also update running extension process.env so subsequent Node commands in this process see it
		process.env.Path = mergedPath;
		process.env.PATH = mergedPath;
		for (const [k, v] of Object.entries(env)) {
			if (v !== undefined) {
				process.env[k] = v;
			}
		}

		return env;
	} catch {
		return process.env;
	}
}

export function refreshTerminalEnv(context: vscode.ExtensionContext): void {
	if (process.platform !== 'win32') {
		return;
	}

	const fresh = getFreshWindowsEnv(); // registry + current env, already expanded
	const stale = new Map(
		Object.entries(process.env).map(([k, v]) => [k.toLowerCase(), v])
	);

	context.environmentVariableCollection.clear();

	for (const [key, value] of Object.entries(fresh)) {
		if (value === undefined) {
			continue;
		}
		// Push variables that are new or changed since the app started into terminal collection
		if (key.toLowerCase() === 'path') {
			context.environmentVariableCollection.replace('Path', value);
			context.environmentVariableCollection.replace('PATH', value);
		} else if (stale.get(key.toLowerCase()) !== value) {
			context.environmentVariableCollection.replace(key, value);
		}
	}
}

