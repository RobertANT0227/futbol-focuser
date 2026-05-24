// CENTO-V2
import { useEffect, useState } from 'react';

const LS_KEY = 'cento.selectedDate';

export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function read(): string | null {
  try { return sessionStorage.getItem(LS_KEY); } catch { return null; }
}
function write(v: string | null) {
  try { if (v) sessionStorage.setItem(LS_KEY, v); else sessionStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

/**
 * Sincronizează data selectată între paginile Cento prin sessionStorage.
 * Dacă valoarea stocată nu există în availableDates, sare la prima zi disponibilă.
 */
export function useSelectedDate(availableDates: string[]): [string | null, (d: string | null) => void] {
  const [date, setDateState] = useState<string | null>(read);

  useEffect(() => {
    if (availableDates.length === 0) {
      if (date !== null) { setDateState(null); write(null); }
      return;
    }
    if (!date || !availableDates.includes(date)) {
      const today = toLocalISO(new Date());
      const next = availableDates.includes(today) ? today : availableDates[0];
      setDateState(next);
      write(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDates.join('|')]);

  const setDate = (d: string | null) => { setDateState(d); write(d); };
  return [date, setDate];
}