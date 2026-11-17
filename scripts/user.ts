/**
 * Manage logins in DATA_DIR/users.json.
 *
 *   npm run user:add -- <name> [--password <pw>]   (prompts without echo when --password is absent)
 *   npm run user:remove -- <name>
 *
 * Runs on Node 24 with native TypeScript type stripping; reads DATA_DIR (default ./data).
 */
import path from 'node:path';
import { addUser, MIN_PASSWORD_LENGTH, removeUser } from '../src/lib/server/auth/users.ts';

const [command, ...rest] = process.argv.slice(2);
const dataDir = path.resolve(process.env.DATA_DIR || './data');

function usage(code = 1): never {
	console.error('Usage: user add <name> [--password <pw>] | user remove <name>');
	process.exit(code);
}

function option(name: string): string | undefined {
	const i = rest.indexOf(name);
	if (i === -1) return undefined;
	const value = rest[i + 1];
	if (value === undefined) usage();
	rest.splice(i, 2);
	return value;
}

/** Read a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
	const { stdin, stderr } = process;
	if (!stdin.isTTY) {
		return new Promise((resolve) => {
			let data = '';
			stdin.setEncoding('utf8');
			stdin.on('data', (chunk) => (data += chunk));
			stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
		});
	}
	return new Promise((resolve) => {
		stderr.write(question);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		let value = '';
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n' || ch === '\u0004') {
					stdin.setRawMode(false);
					stdin.pause();
					stdin.off('data', onData);
					stderr.write('\n');
					resolve(value);
					return;
				}
				if (ch === '\u0003') {
					stdin.setRawMode(false);
					stderr.write('\n');
					process.exit(130);
				}
				if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
				else value += ch;
			}
		};
		stdin.on('data', onData);
	});
}

async function main() {
	if (command === 'add') {
		let password = option('--password');
		const [name] = rest;
		if (!name) usage();
		if (password === undefined) {
			password = await promptHidden(`Password for ${name} (min ${MIN_PASSWORD_LENGTH} characters): `);
			if (process.stdin.isTTY) {
				const again = await promptHidden('Repeat the password: ');
				if (again !== password) throw new Error('The passwords do not match.');
			}
		}
		const result = await addUser(dataDir, name, password);
		console.log(`${result === 'created' ? 'Created' : 'Updated the password of'} ${name.toLowerCase()} in ${path.join(dataDir, 'users.json')}`);
	} else if (command === 'remove') {
		const [name] = rest;
		if (!name) usage();
		if (!removeUser(dataDir, name)) throw new Error(`No user called ${name}.`);
		console.log(`Removed ${name.toLowerCase()}.`);
	} else {
		usage(command ? 1 : 0);
	}
}

main().catch((err: Error) => {
	console.error(err.message);
	process.exit(1);
});
