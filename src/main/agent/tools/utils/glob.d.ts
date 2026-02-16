declare module 'glob' {
  export function globSync(
    pattern: string,
    options?: {
      cwd?: string;
      dot?: boolean;
      absolute?: boolean;
      ignore?: string[];
      nodir?: boolean;
    }
  ): string[];
}
