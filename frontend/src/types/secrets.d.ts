declare module 'secrets.js-grempe' {
  export function share(secret: string, numShares: number, threshold: number, padLength?: number): string[];
  export function combine(shares: string[]): string;
  export function str2hex(str: string, bytesPerChar?: number): string;
  export function hex2str(str: string, bytesPerChar?: number): string;
  export function random(bits: number): string;
}
