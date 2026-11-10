import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AppInfo, Settings } from '../../shared/types';

type ToastKind = 'ok' | 'err' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

interface Store {
  settings: Settings | null;
  info: AppInfo | null;
  logo: string | null;
  version: number; // bumps whenever data changes
  refresh: () => void;
  reloadSettings: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<boolean>;
  toast: (kind: ToastKind, text: string, action?: Toast['action']) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  reloadLogo: () => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);

  const reloadSettings = useCallback(async () => setSettings(await api.getSettings()), []);
  const reloadLogo = useCallback(() => void api.getAgencyLogo().then(setLogo), []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind: ToastKind, text: string, action?: Toast['action']) => {
    const id = seq.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 9000 : 5000);
  }, []);
  const saveSettings = useCallback(
    async (s: Settings) => {
      const r = await api.saveSettings(s);
      if (!r.ok) {
        toast('err', r.error || 'Could not save settings');
        return false;
      }
      await reloadSettings();
      return true;
    },
    [reloadSettings, toast],
  );

  useEffect(() => {
    void reloadSettings();
    void api.appInfo().then(setInfo);
    reloadLogo();
    const offData = api.onDataChanged(() => setVersion((v) => v + 1));
    const offSettings = api.onSettingsChanged(() => void reloadSettings());
    return () => {
      offData();
      offSettings();
    };
  }, [reloadSettings, reloadLogo]);

  const value = useMemo(
    () => ({ settings, info, logo, version, refresh, reloadSettings, saveSettings, toast, toasts, dismiss, reloadLogo }),
    [settings, info, logo, version, refresh, reloadSettings, saveSettings, toast, toasts, dismiss, reloadLogo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Load data and re-load whenever app data changes. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; loading: boolean; reload: () => void } {
  const { version } = useStore();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then(
      (d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      },
      () => alive && setLoading(false),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, n, ...deps]);
  return { data, loading, reload: () => setN((x) => x + 1) };
}
