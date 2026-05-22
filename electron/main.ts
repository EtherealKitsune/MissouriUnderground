import { app, BrowserWindow, Menu, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureArchiveStructure } from './archive-path';
import { configureElectronPaths } from './paths';
import { runDeferredCleanup } from './temp-cleanup';
import { startAutoBackupInterval } from './backup';
import { closeDatabase } from './database';
import { openMapsFolder, reloadBasemaps } from './basemap';
import { registerIpcHandlers } from './ipc-handlers';
import { closeMbtiles, getTile, getTileProtocol, initMbtiles } from './mbtiles';
import { isWorkstationInitialized } from './workstation-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

configureElectronPaths();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'moarchive',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function startAutoBackupIfReady(): void {
  if (isWorkstationInitialized()) {
    startAutoBackupInterval();
  }
}

const isDev = !app.isPackaged;

function registerTileProtocol(): void {
  const scheme = getTileProtocol();
  protocol.handle(scheme, async (request) => {
    const url = new URL(request.url);
    const match = url.pathname.match(/(\d+)\/(\d+)\/(\d+)/);
    const z = parseInt(match?.[1] ?? '', 10);
    const x = parseInt(match?.[2] ?? '', 10);
    const y = parseInt(match?.[3] ?? '', 10);

    if (Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
      return new Response(null, { status: 404 });
    }

    const tile = getTile(z, x, y);
    if (!tile) {
      return new Response(null, { status: 204 });
    }

    const headers: Record<string, string> = {
      'Content-Type': tile.contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': String(tile.byteLength),
    };
    if (tile.contentEncoding) {
      headers['Content-Encoding'] = tile.contentEncoding;
    }

    return new Response(new Uint8Array(tile.body), { headers });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0d1117',
    title: 'Missouri Underground',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:true + CJS preload.cjs — require() works; contextBridge remains the only bridge
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Archive Folder',
          click: () => shell.openPath(ensureArchiveStructure().root),
        },
        { type: 'separator' },
        {
          label: 'Export GPX',
          click: () => mainWindow?.webContents.send('menu:export', 'gpx'),
        },
        {
          label: 'Export KML',
          click: () => mainWindow?.webContents.send('menu:export', 'kml'),
        },
        {
          label: 'Export GeoJSON',
          click: () => mainWindow?.webContents.send('menu:export', 'geojson'),
        },
        {
          label: 'Export CSV',
          click: () => mainWindow?.webContents.send('menu:export', 'csv'),
        },
        {
          label: 'Export Curated Archive Package',
          click: () => mainWindow?.webContents.send('menu:export-package'),
        },
        {
          label: 'Import .moarch…',
          click: () => mainWindow?.webContents.send('menu:import-moarch'),
        },
        { type: 'separator' },
        {
          label: 'Create Backup',
          click: () => mainWindow?.webContents.send('menu:backup'),
        },
        { role: 'quit' },
      ],
    },
    {
      label: 'Map',
      submenu: [
        {
          label: 'Import .mbtiles…',
          click: () => mainWindow?.webContents.send('menu:import-mbtiles'),
        },
        {
          label: 'Reload Basemap',
          click: () => {
            reloadBasemaps();
            mainWindow?.webContents.send('menu:reload-map');
          },
        },
        {
          label: 'Open Maps Folder',
          click: () => openMapsFolder(),
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  void runDeferredCleanup();
  if (isWorkstationInitialized()) {
    ensureArchiveStructure();
    initMbtiles();
  }
  registerTileProtocol();
  registerIpcHandlers();
  buildMenu();
  createWindow();

  if (isWorkstationInitialized()) {
    startAutoBackupIfReady();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeMbtiles();
  closeDatabase();
});
