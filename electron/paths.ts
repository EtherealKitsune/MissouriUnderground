import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Configure writable cache locations before app.ready to avoid permission errors
 * (e.g. when the default cache dir is not writable on Windows).
 */
export function configureElectronPaths(): void {
  const userData = app.getPath('userData');
  const cacheRoot = path.join(userData, 'Cache');

  for (const dir of [cacheRoot, path.join(cacheRoot, 'disk'), path.join(cacheRoot, 'gpu')]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  app.setPath('cache', cacheRoot);
  app.setPath('sessionData', path.join(userData, 'Session'));

  app.commandLine.appendSwitch('disk-cache-dir', path.join(cacheRoot, 'disk'));
  app.commandLine.appendSwitch('gpu-shader-disk-cache-dir', path.join(cacheRoot, 'gpu'));
}
