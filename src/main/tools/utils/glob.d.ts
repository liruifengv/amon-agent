declare module 'glob' {
  interface GlobOptions {
    cwd?: string;
    dot?: boolean;
    nodir?: boolean;
    absolute?: boolean;
    ignore?: string | string[];
  }

  export function globSync(pattern: string, options?: GlobOptions): string[];
}
