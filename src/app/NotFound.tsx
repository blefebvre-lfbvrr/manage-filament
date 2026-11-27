import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="text-muted-foreground">Ce lien ne correspond à aucune page de FilaTrack.</p>
      <Button asChild>
        <Link to="/">Retour à l’inventaire</Link>
      </Button>
    </div>
  );
}
