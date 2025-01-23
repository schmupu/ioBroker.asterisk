/* eslint-disable jsdoc/require-jsdoc */
/**
 * https://gist.github.com/xorus/32d816d3fad433e6d4e6d18a9b489a01
 *
 */
declare module 'asterisk-manager' {
    export type Response = Record<string, string>;
    export type Event = { event: string } & Response;
    export type Callback = (err: Response, response: Response) => void;

    /**
     * Interface
     */
    export default class Asterisk extends import('events').EventEmitter {
        constructor(port: string, host: string, username: string, password: string, events: boolean);

        public on(event: string, callback: (event: Response) => void): void;
        public on(event: 'managerevent', callback: (event: Event) => void): void;

        public connect(port: string, host: string, callback: () => void): void;

        public keepConnected(): void;

        public login(callback: Callback): void;

        public action(action: Record<string, string> & { action: string }, callback?: Callback): string;

        public disconnect(callback: () => void): void;

        public isConnected(): boolean;
    }
}
