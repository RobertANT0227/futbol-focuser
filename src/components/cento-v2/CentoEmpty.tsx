// CENTO-V2
import { Card } from '@/components/ui/card';
import { Database } from 'lucide-react';

export function CentoEmpty({ message }: { message: string }) {
  return (
    <Card className="p-10 text-center bg-card/40 border-dashed">
      <Database className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </Card>
  );
}