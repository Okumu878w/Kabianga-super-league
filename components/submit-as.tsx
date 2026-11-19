'use client';
import { useRef } from 'react';
/** Several submit buttons that each send a different value for ONE field. The value is written into a hidden input and the form is submitted
 *  programmatically, which works reliably with Next.js server actions (button name/value pairs were not always delivered). */
export function SubmitAs({ name, options }: { name: string; options: { value: string; label: string; className?: string }[] }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input type="hidden" name={name} ref={ref} defaultValue="" />
      {options.map((o) => (
        <button key={o.value} type="button" className={`btn sm ${o.className ?? ''}`} onClick={(e) => { if (ref.current) ref.current.value = o.value; e.currentTarget.form?.requestSubmit(); }}>{o.label}</button>
      ))}
    </>
  );
}
