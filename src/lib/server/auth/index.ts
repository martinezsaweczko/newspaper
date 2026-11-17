import { config } from '../config.ts';
import { createThrottle } from './throttle.ts';
import { createUserDirectory } from './users.ts';

/** Process-wide auth state for the server routes. */
export const users = createUserDirectory(config.dataDir);
export const loginThrottle = createThrottle({ max: 5, windowMs: 15 * 60 * 1000 });
