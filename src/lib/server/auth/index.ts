import { config } from '../config.ts';
import { createLoginThrottle } from './throttle.ts';
import { createUserDirectory } from './users.ts';

/** Process-wide auth state for the server routes. */
export const users = createUserDirectory(config.dataDir);
/** Per IP+username 5, per username 10, per IP 50 failures in 15 minutes (see throttle.ts). */
export const loginThrottle = createLoginThrottle({
	perPair: 5,
	perUser: 10,
	perIp: 50,
	windowMs: 15 * 60 * 1000
});
