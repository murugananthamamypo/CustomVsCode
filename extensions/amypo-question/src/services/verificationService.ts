/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as vscode from 'vscode';
import extract = require('extract-zip');

const execAsync = promisify(exec);

async function hideTestFolder(projectPath: string, folderPattern: string, gitPattern: string) {
	try {
		const config = vscode.workspace.getConfiguration('files');
		const excludes: any = { ...(config.get('exclude') || {}) };
		if (!excludes[folderPattern]) {
			excludes[folderPattern] = true;
			await config.update('exclude', excludes, vscode.ConfigurationTarget.Workspace);
		}

		// Also add to .git/info/exclude to hide from Git
		const gitExcludePath = path.join(projectPath, '.git', 'info', 'exclude');
		if (fs.existsSync(path.dirname(gitExcludePath))) {
			let content = '';
			if (fs.existsSync(gitExcludePath)) {
				content = fs.readFileSync(gitExcludePath, 'utf8');
			}
			const gitPatternFormatted = gitPattern.replace(/\\/g, '/');
			if (!content.includes(gitPatternFormatted)) {
				fs.appendFileSync(gitExcludePath, `\n${gitPatternFormatted}\n`);
			}
		}
	} catch (e) {
		console.warn('Could not hide test folder', e);
	}
}

async function unhideTestFolder(projectPath: string, folderPattern: string, gitPattern: string) {
	try {
		const config = vscode.workspace.getConfiguration('files');
		const excludes: any = { ...(config.get('exclude') || {}) };
		if (excludes[folderPattern]) {
			delete excludes[folderPattern];
			await config.update('exclude', excludes, vscode.ConfigurationTarget.Workspace);
		}

		// Remove from .git/info/exclude
		const gitExcludePath = path.join(projectPath, '.git', 'info', 'exclude');
		if (fs.existsSync(gitExcludePath)) {
			let content = fs.readFileSync(gitExcludePath, 'utf8');
			const gitPatternFormatted = gitPattern.replace(/\\/g, '/');
			if (content.includes(gitPatternFormatted)) {
				const lines = content.split('\n').filter(line => line.trim() !== gitPatternFormatted);
				fs.writeFileSync(gitExcludePath, lines.join('\n'));
			}
		}
	} catch (e) {
		console.warn('Could not unhide test folder', e);
	}
}

export interface VerificationRequest {
	project_path: string;
	question_id: number;
	qb_name: string;
	token: string;
	backend_url: string;
	testcase_count?: number;
}

/**
 * Executes a command and captures output even if it fails
 */
export function execAllowFail(command: string, options: any = {}): Promise<{ stdout: string, stderr: string, exitCode: number }> {
	return new Promise(resolve => {
		exec(command, options, (error, stdout, stderr) => {
			resolve({
				stdout: stdout ? stdout.toString() : '',
				stderr: stderr ? stderr.toString() : '',
				exitCode: error ? (error as any).code || 1 : 0,
			});
		});
	});
}

export function parseTestResults(output: string) {
	const results: any = {
		total: 0,
		passed: 0,
		failed: 0,
		skipped: 0,
		errors: 0,
		passedTests: [] as string[],
		failedTests: [] as string[],
		skippedTests: [] as string[],
		errorTests: [] as string[]
	};

	// Parse Maven Surefire summary
	const testRegex = /Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/;
	const match = output.match(testRegex);

	if (match) {
		results.total = parseInt(match[1]);
		results.failed = parseInt(match[2]);
		results.errors = parseInt(match[3]);
		results.skipped = parseInt(match[4]);
		results.passed = results.total - results.failed - results.errors - results.skipped;
	}

	// Extract individual test cases with PASS status
	const passRegex = /(\S+)\s+-\s+PASS/g;
	let passMatch;
	while ((passMatch = passRegex.exec(output)) !== null) {
		results.passedTests.push(passMatch[1]);
	}

	// Extract failed test cases (FAIL status)
	const failRegex = /(\S+)\s+-\s+FAIL/g;
	let failMatch;
	while ((failMatch = failRegex.exec(output)) !== null) {
		results.failedTests.push(failMatch[1]);
	}

	// Extract skipped test cases (SKIP status)
	const skipRegex = /(\S+)\s+-\s+SKIP/g;
	let skipMatch;
	while ((skipMatch = skipRegex.exec(output)) !== null) {
		results.skippedTests.push(skipMatch[1]);
	}

	// Extract error test cases (ERROR status)
	const errorRegex = /^(\w+):\s*ERROR$/gm;
	let errorMatch;
	while ((errorMatch = errorRegex.exec(output)) !== null) {
		results.errorTests.push(errorMatch[1]);
	}

	return results;
}

export function parseReactTestResults(output: string) {
	const results: any = {
		total: 0,
		passed: 0,
		failed: 0,
		skipped: 0,
		errors: 0,
		passedTests: [] as string[],
		failedTests: [] as string[],
		skippedTests: [] as string[],
		errorTests: [] as string[]
	};

	if (!output) return results;

	// Strip ANSI codes to simplify parsing
	const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

	// Parse summary counts
	const testsLineMatch = cleanOutput.match(/Tests:\s+(.+)/);
	if (testsLineMatch) {
		const statsStr = testsLineMatch[1];
		const totalMatch = statsStr.match(/(\d+)\s+total/);
		const passedMatch = statsStr.match(/(\d+)\s+passed/);
		const failedMatch = statsStr.match(/(\d+)\s+failed/);
		const skippedMatch = statsStr.match(/(\d+)\s+skipped/);

		if (totalMatch) results.total = parseInt(totalMatch[1], 10);
		if (passedMatch) results.passed = parseInt(passedMatch[1], 10);
		if (failedMatch) results.failed = parseInt(failedMatch[1], 10);
		if (skippedMatch) results.skipped = parseInt(skippedMatch[1], 10);
	}

	// Extract individual test cases
	const passRegex = /^\s*(?:✓|√)\s+(.+?)(?:\s+\(\d+\s*s?ms\))?$/gm;
	let passMatch;
	while ((passMatch = passRegex.exec(cleanOutput)) !== null) {
		results.passedTests.push(passMatch[1].trim());
	}

	const failRegex = /^\s*(?:✕|x|×)\s+(.+?)(?:\s+\(\d+\s*s?ms\))?$/gm;
	let failMatch;
	while ((failMatch = failRegex.exec(cleanOutput)) !== null) {
		results.failedTests.push(failMatch[1].trim());
	}

	const skipRegex = /^\s*(?:○|-)\s+(.+?)(?:\s+\(\d+\s*s?ms\))?$/gm;
	let skipMatch;
	while ((skipMatch = skipRegex.exec(cleanOutput)) !== null) {
		results.skippedTests.push(skipMatch[1].trim());
	}

	// Fallback if summary was not found but we parsed valid items
	if (results.total === 0 && (results.passedTests.length > 0 || results.failedTests.length > 0 || results.skippedTests.length > 0)) {
		results.passed = results.passedTests.length;
		results.failed = results.failedTests.length;
		results.skipped = results.skippedTests.length;
		results.total = results.passed + results.failed + results.skipped;
	}

	return results;
}

export async function verifySpringBoot(request: VerificationRequest) {
	let token = 'AmypoToken'

	const { project_path, question_id, qb_name, backend_url } = request;
	const localDestPath = path.join(project_path, 'src', 'test', 'java', 'com', 'example', 'demo');
	const localDeletePath = path.join(project_path, 'src', 'test');

	try {
		await hideTestFolder(project_path, '**/src/test', 'src/test');
		console.log('Fetching testcases from:', backend_url);

		const payload = {
			question_id: question_id,
			qb_name: qb_name,
		};

		console.log("payload", payload);


		// Step 1: Fetch test cases from API
		const response = await axios.post(
			`${backend_url}/project-testcase`,
			payload,
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				responseType: 'arraybuffer'
			}
		);

		if (response.status !== 200) {
			throw new Error(`Failed to fetch testcase from backend. Status: ${response.status}`);
		}

		console.log('✓ Testcase fetched successfully', response);

		// Step 2: Extract directly to application test directory
		if (!fs.existsSync(localDestPath)) {
			fs.mkdirSync(localDestPath, { recursive: true });
		}

		const zipFilePath = path.join(project_path, 'testcases.zip');
		fs.writeFileSync(zipFilePath, Buffer.from(response.data));

		try {
			await extract(zipFilePath, { dir: path.resolve(localDestPath) });
			console.log('✓ Files extracted to project test directory');
		} catch (extractErr) {
			console.error('Failed to extract zip:', extractErr);
			throw new Error('Testcase extraction failed. Please ensure you have sufficient permissions.');
		} finally {
			if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
		}

		// Step 3: Run Maven tests locally
		const projectRoot = project_path;
		console.log('🧪 Running Maven tests in:', projectRoot);

		const testStartTime = Date.now();
		// Maven clean test command - may take time
		const { stdout, stderr, exitCode } = await execAllowFail(`mvn clean test`, {
			cwd: projectRoot,
			maxBuffer: 50 * 1024 * 1024,
			timeout: 480000 // 8 minutes
		});

		const testDuration = ((Date.now() - testStartTime) / 1000).toFixed(2);
		const fullOutput = `${stdout}${stderr ? '\n' + stderr : ''}`;
		const testResults = parseTestResults(stdout);

		console.log(`✓ Tests completed in ${testDuration} seconds`);

		// Step 4: Cleanup test files
		if (fs.existsSync(localDeletePath)) {
			fs.rmSync(localDeletePath, { recursive: true, force: true });
			console.log('✓ Local test files cleaned up');
		}

		if (request.testcase_count && request.testcase_count > 0) {
			testResults.total = request.testcase_count;
			if (testResults.passed > 0) {
				testResults.passed = Math.max(0, testResults.total - testResults.failed - testResults.skipped - testResults.errors);
			} else {
				testResults.passed = 0;
				testResults.failed = testResults.total;
			}
		}

		return {
			success: exitCode === 0 && testResults.total > 0,
			message: exitCode === 0 ? 'Test cases executed successfully' : 'Tests execution failed',
			test_results: testResults,
			full_terminal_output: fullOutput
		};

	} catch (error: any) {
		console.error('Error in verifySpringBoot:', error);
		if (fs.existsSync(localDeletePath)) {
			fs.rmSync(localDeletePath, { recursive: true, force: true });
		}
		throw error;
	} finally {
		await unhideTestFolder(project_path, '**/src/test', 'src/test');
	}
}

export async function verifyReact(request: VerificationRequest) {
	let token = 'AmypoToken'
	const { project_path, question_id, qb_name, backend_url } = request;
	const localDestPath = path.join(project_path, 'src', 'testcase');
	const localDeletePath = localDestPath;

	try {
		await hideTestFolder(project_path, '**/src/testcase', 'src/testcase');
		console.log('Fetching testcases from:', backend_url);
		const payload = {
			question_id: question_id,
			qb_name: qb_name,
		};

		// Step 1: Fetch test cases from API
		const response = await axios.post(
			`${backend_url}/project-testcase`,
			payload,
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				responseType: 'arraybuffer'
			}
		);

		if (response.status !== 200) {
			throw new Error(`Failed to fetch testcase from backend. Status: ${response.status}`);
		}

		console.log('✓ Testcase fetched successfully');

		// Step 2: Extract directly to application test directory
		if (!fs.existsSync(localDestPath)) {
			fs.mkdirSync(localDestPath, { recursive: true });
		}

		const zipFilePath = path.join(project_path, 'testcases_react.zip');
		fs.writeFileSync(zipFilePath, Buffer.from(response.data));

		try {
			await extract(zipFilePath, { dir: path.resolve(localDestPath) });
			console.log('✓ Files extracted to project test directory');
		} catch (extractErr) {
			console.error('Failed to extract zip:', extractErr);
			throw new Error('Testcase extraction failed. Please ensure you have sufficient permissions.');
		} finally {
			if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
		}

		// Step 3: Run React tests locally
		const projectRoot = project_path;
		console.log('🧪 Running React tests in:', projectRoot);

		const testStartTime = Date.now();
		const testCmd = `npm test -- src/testcase --watchAll=false`;

		const { stdout, stderr, exitCode } = await execAllowFail(testCmd, { cwd: projectRoot });
		const fullOutput = `${stdout || ''}${stderr ? '\n' + stderr : ''}`;
		const testDuration = ((Date.now() - testStartTime) / 1000).toFixed(2);
		const testSuccess = exitCode === 0;

		const parsedResults = parseReactTestResults(fullOutput);

		console.log(`✓ Tests completed in ${testDuration} seconds`);

		// Step 4: Cleanup test files
		if (fs.existsSync(localDeletePath)) {
			fs.rmSync(localDeletePath, { recursive: true, force: true });
			console.log('✓ Local test files cleaned up');
		}

		if (request.testcase_count && request.testcase_count > 0) {
			parsedResults.total = request.testcase_count;
			if (parsedResults.passed > 0) {
				parsedResults.passed = Math.max(0, parsedResults.total - parsedResults.failed);
			} else {
				parsedResults.passed = 0;
				parsedResults.failed = parsedResults.total;
			}
		}

		return {
			success: testSuccess,
			message: testSuccess ? 'Test cases executed successfully' : 'Tests execution failed',
			test_results: parsedResults,
			full_terminal_output: fullOutput
		};

	} catch (error: any) {
		console.error('Error in verifyReact:', error);
		if (fs.existsSync(localDeletePath)) {
			fs.rmSync(localDeletePath, { recursive: true, force: true });
		}
		throw error;
	} finally {
		await unhideTestFolder(project_path, '**/src/testcase', 'src/testcase');
	}
}

export async function verifyReactSpring(request: VerificationRequest) {
	let token = 'AmypoToken'
	const { project_path, question_id, qb_name, backend_url } = request;
	const springDeletePath = path.join(project_path, 'backend', 'src', 'test');
	const reactDeletePath = path.join(project_path, 'frontend', 'src', 'testcase');

	try {
		await hideTestFolder(project_path, '**/src/test', 'backend/src/test');
		await hideTestFolder(project_path, '**/src/testcase', 'frontend/src/testcase');

		console.log('Fetching fullstack testcases from:', backend_url);
		const payload = {
			question_id: question_id,
			qb_name: qb_name,
		};

		// Step 1: Fetch test cases from API
		const response = await axios.post(
			`${backend_url}/project-testcase`,
			payload,
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				responseType: 'arraybuffer'
			}
		);

		console.log('response', response);


		if (response.status !== 200) {
			throw new Error(`Failed to fetch testcase from backend. Status: ${response.status}`);
		}

		console.log('✓ Fullstack Testcase fetched successfully');

		const zipFilePath = path.join(project_path, 'testcases_fullstack.zip');
		fs.writeFileSync(zipFilePath, Buffer.from(response.data));

		const tempExtractPath = path.join(project_path, 'temp_testcases');
		if (!fs.existsSync(tempExtractPath)) fs.mkdirSync(tempExtractPath, { recursive: true });

		try {
			await extract(zipFilePath, { dir: path.resolve(tempExtractPath) });
			console.log('✓ Files extracted to temporary directory');

			// Move Backend tests to demo/src/test
			let springSrc = path.join(tempExtractPath, 'src', 'test');
			if (!fs.existsSync(springSrc)) springSrc = path.join(tempExtractPath, 'backend', 'src', 'test');
			if (!fs.existsSync(springSrc)) springSrc = path.join(tempExtractPath, 'demo', 'src', 'test');
			console.log(`Checking springSrc: ${springSrc} - Exists: ${fs.existsSync(springSrc)}`);

			if (fs.existsSync(springSrc)) {
				if (fs.existsSync(springDeletePath)) fs.rmSync(springDeletePath, { recursive: true, force: true });
				fs.mkdirSync(path.dirname(springDeletePath), { recursive: true });
				fs.renameSync(springSrc, springDeletePath);
				console.log('✓ Backend tests moved to demo directory');
			} else {
				console.warn('⚠️ No backend tests found in any of the expected paths.');
			}

			// Move Frontend tests to reactapp/src/testcase
			let reactSrc = path.join(tempExtractPath, 'src', 'testcase');
			if (!fs.existsSync(reactSrc)) reactSrc = path.join(tempExtractPath, 'frontend', 'src', 'testcase');
			if (!fs.existsSync(reactSrc)) reactSrc = path.join(tempExtractPath, 'reactapp', 'src', 'testcase');
			console.log(`Checking reactSrc: ${reactSrc} - Exists: ${fs.existsSync(reactSrc)}`);

			if (fs.existsSync(reactSrc)) {
				if (fs.existsSync(reactDeletePath)) fs.rmSync(reactDeletePath, { recursive: true, force: true });
				fs.mkdirSync(path.dirname(reactDeletePath), { recursive: true });
				fs.renameSync(reactSrc, reactDeletePath);
				console.log('✓ Frontend tests moved to reactapp directory');
			} else {
				console.warn('⚠️ No frontend tests found in any of the expected paths. Listing files in tempExtractPath:');
				try {
					// Recursively list all files to see the structure
					const listFiles = (dir: string, base = ''): string[] => {
						const entries = fs.readdirSync(dir, { withFileTypes: true });
						return entries.flatMap(entry => {
							const relPath = path.join(base, entry.name);
							if (entry.isDirectory()) {
								return [relPath + '/', ...listFiles(path.join(dir, entry.name), relPath)];
							}
							return [relPath];
						});
					};
					const allFiles = listFiles(tempExtractPath);
					console.log('Extracted structure:\n' + allFiles.join('\n'));
				} catch (e) {
					console.error('Failed to list files:', e);
				}
			}
		} catch (extractErr) {
			console.error('Failed to extract fullstack zip:', extractErr);
			throw new Error('Testcase extraction failed. Please ensure you have sufficient permissions.');
		} finally {
			if (fs.existsSync(tempExtractPath)) fs.rmSync(tempExtractPath, { recursive: true, force: true });
			if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
		}

		console.log('🧪 Running Fullstack tests');
		const testStartTime = Date.now();

		// 1. SPRING BOOT
		const springRoot = path.join(project_path, 'backend');
		const springExec = await execAllowFail(`mvn clean test`, { cwd: springRoot, maxBuffer: 50 * 1024 * 1024, timeout: 480000 });
		const springResults = parseTestResults(springExec.stdout);

		// 2. REACT
		const reactRoot = path.join(project_path, 'frontend');
		let reactExec = { stdout: '', stderr: '', exitCode: 0 };
		let reactResults = parseReactTestResults('');

		if (fs.existsSync(reactRoot)) {
			const reactTestCmd = `npm test -- src/testcase --watchAll=false`;
			reactExec = await execAllowFail(reactTestCmd, { cwd: reactRoot, maxBuffer: 50 * 1024 * 1024, timeout: 300000 });
			reactResults = parseReactTestResults(`${reactExec.stdout || ''}${reactExec.stderr ? '\n' + reactExec.stderr : ''}`);
		} else {
			reactExec.stdout = "No 'reactapp' directory found to run React tests.\n";
		}

		const testDuration = ((Date.now() - testStartTime) / 1000).toFixed(2);
		console.log(`✓ Fullstack Tests completed in ${testDuration} seconds`);

		let total = springResults.total + reactResults.total;
		if (request.testcase_count && request.testcase_count > 0) {
			total = request.testcase_count;
		}
		let passed = springResults.passed + reactResults.passed;
		let failed = (springResults.passed > 0 ? springResults.failed + springResults.skipped + springResults.errors : springResults.total > 0 ? springResults.total : total - reactResults.total) + (reactResults.passed > 0 ? reactResults.failed : reactResults.total > 0 ? reactResults.total : total - springResults.total);
		const skipped = springResults.skipped + reactResults.skipped;
		const errors = springResults.errors + reactResults.errors;

		console.log('failed', failed, 'reactResults', reactResults);
		console.log('failed', failed, 'springResults', springResults);
		console.log('request', request);



		const passedTests = [...springResults.passedTests, ...reactResults.passedTests];
		const failedTests = [...springResults.failedTests, ...reactResults.failedTests];
		const skippedTests = [...springResults.skippedTests, ...reactResults.skippedTests];
		const errorTests = [...springResults.errorTests, ...reactResults.errorTests];

		const aggregatedResults = {
			total, passed, failed, skipped, errors, passedTests, failedTests, skippedTests, errorTests
		};

		const success = springExec.exitCode === 0 && reactExec.exitCode === 0 && (springResults.total > 0 || reactResults.total > 0);

		if (request.testcase_count && request.testcase_count > 0) {
			aggregatedResults.total = request.testcase_count;
			if (aggregatedResults.passed > 0) {
				aggregatedResults.passed = Math.max(0, aggregatedResults.total - aggregatedResults.failed);
			} else {
				aggregatedResults.passed = 0;
				aggregatedResults.failed = aggregatedResults.total;
			}
		}

		const fullOutput = `======= SPRING BOOT =======\n${springExec.stdout}\n${springExec.stderr}\n\n======= REACT =======\n${reactExec.stdout}\n${reactExec.stderr}`;

		if (fs.existsSync(springDeletePath)) fs.rmSync(springDeletePath, { recursive: true, force: true });
		if (fs.existsSync(reactDeletePath)) fs.rmSync(reactDeletePath, { recursive: true, force: true });

		return {
			success: success,
			message: success ? 'Test cases executed successfully' : 'Tests execution failed',
			test_results: aggregatedResults,
			spring_results: springResults,
			react_results: reactResults,
			spring_terminal_output: springExec.stdout + '\\n' + springExec.stderr,
			react_terminal_output: reactExec.stdout + '\\n' + reactExec.stderr,
			full_terminal_output: fullOutput
		};

	} catch (error: any) {
		console.error('Error in verifyFullStack:', error);
		let details = '';
		if (error.response && error.response.data) {
			details = Buffer.isBuffer(error.response.data) ? error.response.data.toString() : error.response.data;
			console.error('Backend 422 details:', details);
		}

		throw new Error(details ? `${error.message}: ${details} ` : error.message);
	} finally {
		await unhideTestFolder(project_path, '**/src/test', 'backend/src/test');
		await unhideTestFolder(project_path, '**/src/testcase', 'frontend/src/testcase');
		const zipFilePath = path.join(project_path, 'testcases_fullstack.zip');
		const tempExtractPath = path.join(project_path, 'temp_testcases');

		try {
			if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
			if (fs.existsSync(tempExtractPath)) fs.rmSync(tempExtractPath, { recursive: true, force: true });
			if (fs.existsSync(springDeletePath)) fs.rmSync(springDeletePath, { recursive: true, force: true });
			if (fs.existsSync(reactDeletePath)) fs.rmSync(reactDeletePath, { recursive: true, force: true });
		} catch (cleanupErr) {
			console.warn('Failed to cleanup temporary test files:', cleanupErr);
		}
	}
}

export async function verifySelenium(request: VerificationRequest) {
	let token = 'AmypoToken'
	const { project_path, question_id, backend_url, qb_name } = request;
	console.log(`[Amypo] Starting Local Selenium Verification for Question: ${question_id}`);
	console.log(`[Amypo] project path: ${project_path}`);

	const localTestcaseDir = path.join(project_path, 'amypo_selenium_testcases');

	try {
		await hideTestFolder(project_path, '**/amypo_selenium_testcases', 'amypo_selenium_testcases');

		// Step 1: Download JSON testing configuration
		const requestUrl = `${backend_url}/project-testcase`;
		const response = await axios.post(requestUrl, {
			question_id: question_id,
			qb_name: qb_name
		}, {
			headers: { 'Authorization': `Bearer ${token}` },
			responseType: 'arraybuffer',
			timeout: 30000
		});

		if (response.status !== 200) {
			throw new Error(`Failed to fetch testcase from backend.`);
		}

		if (!fs.existsSync(localTestcaseDir)) {
			fs.mkdirSync(localTestcaseDir, { recursive: true });
		}

		const zipFilePath = path.join(project_path, 'selenium_testcases.zip');
		fs.writeFileSync(zipFilePath, Buffer.from(response.data));

		try {
			await extract(zipFilePath, { dir: path.resolve(localTestcaseDir) });
			console.log('✓ Files extracted to project test directory');
		} catch (extractErr) {
			throw new Error('Testcase extraction failed.');
		} finally {
			if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
		}

		// Step 2: Ensure testcase json is found
		const files = fs.readdirSync(localTestcaseDir);
		const jsonFile = files.find(f => f.endsWith('.json'));
		if (!jsonFile) {
			throw new Error("No JSON test case file found in the zip.");
		}

		const testCaseConfigContent = fs.readFileSync(path.join(localTestcaseDir, jsonFile), 'utf8');
		const testCaseConfig = JSON.parse(testCaseConfigContent);

		// Step 3: Run Maven tests locally
		const projectRoot = project_path;
		console.log('🧪 Running Selenium tests in:', projectRoot);

		const { stdout, stderr, exitCode } = await execAllowFail(`mvn clean test`, {
			cwd: projectRoot,
			maxBuffer: 50 * 1024 * 1024,
			timeout: 480000
		});

		let fullLogData = stdout + '\n' + stderr;
		// Optionally append specific log files if available (e.g. logs/test-execution.log)
		const logFilePath = path.join(projectRoot, 'logs', 'test-execution.log');
		if (fs.existsSync(logFilePath)) {
			const extraLog = fs.readFileSync(logFilePath, 'utf8');
			fullLogData += '\n--- EXTERNAL LOG FILE ---\n' + extraLog;
		}

		// Step 4: Verification logic against JSON mapped patterns
		const results = {
			total: testCaseConfig.testcase.length,
			passed: 0,
			failed: 0,
			skipped: 0,
			errors: 0,
			passedTests: [] as string[],
			failedTests: [] as string[],
			skippedTests: [] as string[],
			errorTests: [] as string[]
		};

		for (const tc of testCaseConfig.testcase) {
			let passed = true;
			if (tc.patterns && tc.patterns.length > 0) {
				for (const pattern of tc.patterns) {
					// FIX: Use single backslash escapes so the regex receives the correct sequences.
					let cleanPattern = pattern
						.split('[').join('\\[')
						.split(']').join('\\]')
						.split('(').join('\\(')
						.split(')').join('\\)');

					cleanPattern = cleanPattern
						.split(' :').join('\\s*:\\s*')
						.split(': ').join('\\s*:\\s*');

					try {
						const regex = new RegExp(cleanPattern);
						if (!regex.test(fullLogData)) {
							passed = false;
							break;
						}
					} catch (e) {
						// Fallback to exact literal match if regex creation fails
						if (!fullLogData.includes(pattern)) {
							passed = false;
							break;
						}
					}
				}
			}

			if (passed && tc.file_check) {
				const checkPath = path.join(projectRoot, tc.file_check.path);
				if (!fs.existsSync(checkPath)) {
					passed = false;
				} else if (tc.file_check.contains) {
					try {
						const fileContent = fs.readFileSync(checkPath, 'utf8');
						if (!fileContent.includes(tc.file_check.contains)) {
							passed = false;
						}
					} catch (e) {
						passed = false;
					}
				}
			}

			if (passed) {
				results.passed++;
				results.passedTests.push(`${tc.description} - PASS`);
			} else {
				results.failed++;
				results.failedTests.push(`${tc.description} - FAIL`);
			}
		}

		// Step 5: Cleanup testcase directory
		if (fs.existsSync(localTestcaseDir)) {
			fs.rmSync(localTestcaseDir, { recursive: true, force: true });
			console.log('✓ Local testcase rules cleaned up');
		}

		if (request.testcase_count && request.testcase_count > 0) {
			results.total = request.testcase_count;
			if (results.passed > 0) {
				results.passed = Math.max(0, results.total - results.failed);
			} else {
				results.passed = 0;
				results.failed = results.total;
			}
		}

		return {
			success: results.failed === 0 && results.total > 0,
			message: results.failed === 0 ? 'Selenium Test cases executed successfully' : 'Selenium Tests execution failed',
			test_results: results,
			full_terminal_output: `- - - SELENIUM WEBDRIVER EXECUTION OUTPUT - - -\n${stdout}\n${stderr}`
		};

	} catch (error: any) {
		console.error('[Amypo] Local verification failed:', error);
		if (fs.existsSync(localTestcaseDir)) {
			fs.rmSync(localTestcaseDir, { recursive: true, force: true });
		}
		const seleniumTests = path.join(project_path, 'amypo_selenium_testcases');
		if (fs.existsSync(seleniumTests)) fs.rmSync(seleniumTests, { recursive: true, force: true });
		throw error;
	} finally {
		await unhideTestFolder(project_path, '**/amypo_selenium_testcases', 'amypo_selenium_testcases');
	}
}
