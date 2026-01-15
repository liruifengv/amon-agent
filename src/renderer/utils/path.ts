/**
 * Path utility functions for renderer process
 */

/**
 * Format path for display by replacing home directory with ~
 * @example formatPathWithTilde('/Users/john/projects') => '~/projects'
 */
export function formatPathWithTilde(path: string): string {
  const home = '/Users/';
  if (path.startsWith(home)) {
    const afterHome = path.slice(home.length);
    const username = afterHome.split('/')[0];
    return path.replace(`${home}${username}`, '~');
  }
  return path;
}

/**
 * Shorten a path for display by showing only the last N segments
 * @example shortenPath('/Users/john/projects/myapp', 2) => '.../projects/myapp'
 */
export function shortenPath(path: string, segments = 2): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length > segments) {
    return `.../${parts.slice(-segments).join('/')}`;
  }
  return path;
}

/**
 * Extract the last segment (directory/file name) from a path
 * @example getPathName('/Users/john/projects') => 'projects'
 */
export function getPathName(path: string): string {
  return path.split('/').filter(Boolean).pop() || '';
}
