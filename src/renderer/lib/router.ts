import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q), raw };
}

export function navigate(to: string) {
  if (location.hash.replace(/^#/, '') === to) return;
  location.hash = to;
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
