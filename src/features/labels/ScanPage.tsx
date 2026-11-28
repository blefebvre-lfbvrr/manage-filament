import { Camera, CameraOff, Droplets, ExternalLink, ImageUp, Scale, Search, SquareStack } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useSettings, useSpools } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { markDried, placeSpool, type Placement } from '@/db/repo';
import { formatGrams } from '@/lib/format';
import { findScannedSpool } from '@/lib/labels';
import type { Spool } from '@/lib/schemas';
import { isHygroscopic } from '@/lib/spool';
import { ColorSwatch, StockBar } from '../inventory/SpoolBits';
import { WeighDialog } from '../weighing/WeighDialog';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Décode un QR code dans une image : BarcodeDetector natif si disponible, sinon jsQR. */
async function decode(
  src: HTMLVideoElement | HTMLImageElement,
  canvas: HTMLCanvasElement,
  native: Detector | null,
) {
  if (native) {
    try {
      const r = await native.detect(src);
      if (r[0]?.rawValue) return r[0].rawValue;
      return null;
    } catch {
      /* on retombe sur jsQR */
    }
  }
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 800 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import('jsqr');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height)?.data ?? null;
}

function nativeDetector(): Detector | null {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
    .BarcodeDetector;
  try {
    return BD ? new BD({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

export function ScanPage() {
  const spools = useSpools() ?? [];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spoolsRef = useRef<Spool[]>([]);
  const [running, setRunning] = useState(false);
  const [foundId, setFoundId] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const found = spools.find((s) => s.id === foundId) ?? null;
  useEffect(() => {
    spoolsRef.current = spools;
  });

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  };
  useEffect(() => stop, []);

  const handle = (text: string | null): boolean => {
    if (!text) return false;
    const s = findScannedSpool(text, spoolsRef.current);
    if (!s) {
      toast.error('Code non reconnu : ce n’est pas une étiquette FilaTrack de cet appareil.');
      return false;
    }
    setFoundId(s.id);
    navigator.vibrate?.(80);
    return true;
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Caméra indisponible ici : utilise « Photo » ou saisis le code.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setRunning(true);
      setFoundId(null);
      const native = nativeDetector();
      const loop = async () => {
        if (!streamRef.current) return;
        const text = await decode(video, canvasRef.current!, native).catch(() => null);
        if (text && findScannedSpool(text, spoolsRef.current)) {
          handle(text);
          stop();
          return;
        }
        setTimeout(() => void loop(), 250);
      };
      void loop();
    } catch (e) {
      toast.error(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Accès à la caméra refusé. Autorise-le dans le navigateur, ou utilise « Photo ».'
          : 'Impossible d’ouvrir la caméra.',
      );
      stop();
    }
  };

  const fromPhoto = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const text = await decode(img, canvasRef.current!, nativeDetector());
      if (!text) toast.error('Aucun QR code lisible sur cette photo.');
      else handle(text);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      <PageHeader
        title="Scanner une bobine"
        description="Vise l’étiquette QR d’une bobine pour l’ouvrir avec ses actions rapides. Rien n’est envoyé : l’image est analysée sur l’appareil."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black sm:aspect-video">
              <video
                ref={videoRef}
                className="size-full object-cover"
                playsInline
                muted
                aria-label="Image de la caméra"
              />
              {running && (
                <div
                  className="pointer-events-none absolute inset-[18%] rounded-xl border-4 border-white/80"
                  aria-hidden
                />
              )}
              {!running && (
                <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/80">
                  Caméra arrêtée
                </p>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex flex-wrap gap-2">
              {running ? (
                <Button variant="outline" onClick={stop}>
                  <CameraOff aria-hidden /> Arrêter
                </Button>
              ) : (
                <Button onClick={() => void start()}>
                  <Camera aria-hidden /> Démarrer la caméra
                </Button>
              )}
              <Button variant="outline" asChild>
                <label>
                  <ImageUp aria-hidden /> Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label="Photo d’une étiquette"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void fromPhoto(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </Button>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (handle(manual)) setManual('');
              }}
            >
              <Input
                aria-label="Code de la bobine"
                placeholder="ou saisis le code (ex. PLA-004)"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button type="submit" variant="outline">
                <Search aria-hidden /> Ouvrir
              </Button>
            </form>
          </CardContent>
        </Card>
        {found ? (
          <QuickActions spool={found} />
        ) : (
          <Card className="text-muted-foreground flex items-center justify-center p-6 text-center text-sm">
            Pas encore d’étiquettes ? Imprime-les depuis la page{' '}
            <Link to="/labels" className="ml-1 underline">
              Étiquettes
            </Link>
            .
          </Card>
        )}
      </div>
    </>
  );
}

function QuickActions({ spool }: { spool: Spool }) {
  const settings = useSettings();
  const [weigh, setWeigh] = useState(false);
  const place = async (p: Placement) => {
    await placeSpool(spool.id, p);
    toast.success(
      p === null
        ? 'Bobine retirée.'
        : p === 'external'
          ? 'Sur le support externe.'
          : `Placée dans le slot ${p}.`,
    );
  };
  return (
    <Card role="region" aria-label={`Bobine ${spool.code}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ColorSwatch hex={spool.colorHex} name={spool.colorName} finish={spool.finish} />
          {spool.code}
        </CardTitle>
        <p className="text-sm">
          {spool.brand} {spool.productLine} · {spool.colorName} · reste{' '}
          <strong>{formatGrams(spool.remainingG)}</strong>
          {spool.amsSlot && spool.status === 'ams' && ` · slot ${spool.amsSlot}`}
        </p>
        <StockBar spool={spool} settings={settings} className="w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setWeigh(true)}>
            <Scale aria-hidden /> Peser
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/spools/${spool.id}`}>
              <ExternalLink aria-hidden /> Ouvrir la fiche
            </Link>
          </Button>
          {isHygroscopic(spool.material) && spool.status !== 'sealed' && (
            <Button
              variant="outline"
              onClick={async () => {
                await markDried(spool.id);
                toast.success('Séchage enregistré.');
              }}
            >
              <Droplets aria-hidden /> Séchée aujourd’hui
            </Button>
          )}
        </div>
        <div>
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-sm">
            <SquareStack className="size-4" aria-hidden /> Placer dans l’AMS
          </p>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <Button
                key={n}
                size="sm"
                variant={spool.status === 'ams' && spool.amsSlot === n ? 'secondary' : 'outline'}
                onClick={() => void place(n)}
              >
                Slot {n}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => void place('external')}>
              Externe
            </Button>
            {(spool.status === 'ams' || spool.status === 'external') && (
              <Button size="sm" variant="ghost" onClick={() => void place(null)}>
                Retirer
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <WeighDialog spool={spool} open={weigh} onOpenChange={setWeigh} />
    </Card>
  );
}
