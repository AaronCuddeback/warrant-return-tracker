import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { API_METHODS } from '../shared/apiNames';

const api: Record<string, unknown> = {};
for (const name of API_METHODS) {
  api[name] = (...args: unknown[]) => ipcRenderer.invoke('api', name, ...args);
}

function on(channel: string) {
  return (cb: (...a: unknown[]) => void) => {
    const fn = (_e: unknown, ...a: unknown[]) => cb(...a);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

api.onNavigate = on('navigate');
api.onDataChanged = on('data-changed');
api.onLock = on('lock');
api.getPathForFile = (file: File) => webUtils.getPathForFile(file);

contextBridge.exposeInMainWorld('wrt', api);
