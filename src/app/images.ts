/** Réduit une photo (max 1600 px, JPEG) avant de la stocker localement. */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.');
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Conversion impossible.'))),
        'image/jpeg',
        quality,
      ),
    );
  } catch {
    return file; // navigateur sans createImageBitmap : on garde l'original
  }
}

/** URL affichable d'une pièce jointe (Blob en base, data URL après restauration). */
export function attachmentUrl(data: unknown): string | null {
  if (data instanceof Blob) return URL.createObjectURL(data);
  if (typeof data === 'string' && data.startsWith('data:')) return data;
  return null;
}
