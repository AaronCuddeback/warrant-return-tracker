import type { Api } from '../../shared/types';

declare global {
  interface Window {
    wrt: Api;
  }
}

export const api: Api = window.wrt;
