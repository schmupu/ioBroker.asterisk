// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            port: number;
            ip: string;
            user: string;
            password: string;
            siphost: string;
            sipuser: string;
            sippassword: string;
            path: string;
            language: string;
            transcoder: string;
            service: string;
            ssh: boolean;
            sshport: number;
            sshuser: string;
            sshpassword: string;
            forceReInit: boolean;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
