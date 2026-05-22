/// <reference types="vite/client" />

import type { MoArchiveApi } from '../shared/mo-archive-api';

declare global {
  interface Window {
    moArchive: MoArchiveApi;
  }
}

export {};
