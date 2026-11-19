'use client';
import { useEffect } from 'react';
/** Adds an accessible confirmation step to any form carrying data-confirm (destructive actions). Mounted once in the root layout. */
export function ConfirmForms() {
  useEffect(() => {
    const h = (e: Event) => { const f = (e.target as HTMLElement).closest('form[data-confirm]') as HTMLFormElement | null; if (f && !window.confirm(f.dataset.confirm)) { e.preventDefault(); e.stopPropagation(); } };
    document.addEventListener('submit', h, true); return () => document.removeEventListener('submit', h, true);
  }, []);
  return null;
}
