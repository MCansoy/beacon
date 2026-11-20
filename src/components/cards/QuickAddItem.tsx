import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export function QuickAddItem({ onAdd, label, hint }: {
  onAdd: (name: string) => void | Promise<void>;
  label: string;
  hint: string;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  return <>
    <form className="dash-quick-add" onSubmit={async e => {
      e.preventDefault();
      const name = value.trim();
      if (!name || pending.current) return;
      pending.current = true; setBusy(true); setError(false);
      try { await onAdd(name); setValue(''); }
      catch { setError(true); }
      finally { pending.current = false; setBusy(false); }
    }}>
      <input ref={input} aria-label={label} placeholder="Add item?" title={hint}
        value={value} onChange={e => setValue(e.target.value)} readOnly={busy} />
      <button type="submit" aria-label={label} title={hint} disabled={busy || !value.trim()}>
        <Plus size={16} />
      </button>
    </form>
    {error && <div role="alert">Could not add item. Please try again.</div>}
  </>;
}
