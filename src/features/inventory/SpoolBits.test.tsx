import { render, screen } from '@testing-library/react';
import { buildDemoData } from '@/lib/demo';
import { DEFAULT_SETTINGS } from '@/lib/schemas';
import { ColorSwatch, LevelBadge, StatusBadge, StockBar } from './SpoolBits';

const spool = buildDemoData().spools[0]!;

describe('composants bobine', () => {
  it('pastille couleur accessible', () => {
    render(<ColorSwatch hex="#3f8e43" name="Vert gui" />);
    expect(screen.getByRole('img', { name: 'Couleur Vert gui (#3F8E43)' })).toBeInTheDocument();
  });
  it('jauge de restant avec texte alternatif', () => {
    render(<StockBar spool={{ ...spool, remainingG: 120, initialNetG: 1000 }} settings={DEFAULT_SETTINGS} />);
    const meter = screen.getByRole('meter', { name: 'Restant' });
    expect(meter).toHaveAttribute('aria-valuenow', '12');
    expect(meter.getAttribute('aria-valuetext')).toContain('Bientôt vide');
  });
  it('badges de statut et niveau', () => {
    render(
      <>
        <StatusBadge spool={{ status: 'ams', amsSlot: 3 }} />
        <LevelBadge level="critical" />
      </>,
    );
    expect(screen.getByText('AMS 3')).toBeInTheDocument();
    expect(screen.getByText('À changer')).toBeInTheDocument();
  });
});
