import type { ProxyOptions } from "vite";

export declare const DEFAULT_GATEWAY: string;
export declare function portlessProxy(env?: Record<string, string | undefined>): Record<string, ProxyOptions>;
