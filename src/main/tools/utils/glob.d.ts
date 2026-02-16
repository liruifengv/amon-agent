declare module 'glob' {
  interface GlobOptions {
    cwd?: string;
    dot?: boolean;
    nodir?: boolean;
    absolute?: boolean;
    ignore?: string | string[];
  }

  function sync(pattern: string, options?: GlobOptions): string[];

  export default { sync };
  export { sync };
}
