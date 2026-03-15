import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PASS = 'muiesuperbet';

export const PasswordGate = ({ onUnlock }: { onUnlock: () => void }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === PASS) {
      sessionStorage.setItem('unlocked', '1');
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-xs text-center">
        <span className="text-4xl">🔒</span>
        <h1 className="text-lg font-bold text-foreground">Introdu parola</h1>
        <Input
          type="password"
          placeholder="Parola..."
          value={value}
          onChange={e => { setValue(e.target.value); setError(false); }}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-xs text-destructive">Parolă greșită</p>}
        <Button type="submit" className="w-full">Intră</Button>
      </form>
    </div>
  );
};
