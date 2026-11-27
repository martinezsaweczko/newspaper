/** Chat shapes shared by the server and the browser (live events and page data). */

/** Longest message, in characters (the `messages.body` column is VARCHAR(2000)). */
export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
	id: number;
	/** The reader whose conversation this is (`users.id`). */
	readerId: number;
	/** `in`: the reader wrote it; `out`: an admin did. */
	direction: 'in' | 'out';
	body: string;
	/** Server local wall-clock time, `YYYY-MM-DDTHH:mm`. */
	sentAt: string;
	/** Who wrote it: the reader's name, or the admin's ("Administración" once that account is gone). */
	sender: string;
	/** Has the other side read it? */
	read: boolean;
}

export interface Conversation {
	readerId: number;
	name: string;
	email: string;
	last: Pick<ChatMessage, 'body' | 'sentAt' | 'direction'>;
	/** Messages from the reader no admin has read yet. */
	unread: number;
}

/** A `read` event: one side has read the other's messages in a conversation. */
export interface ChatRead {
	readerId: number;
	/** The messages that are now read: `in` when an admin read them, `out` when the reader did. */
	direction: 'in' | 'out';
}
