const MAX_SIDE = 1200;
const MAX_INPUT_MB = 15;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Shrinks a photo before it is uploaded: a 6 MB phone photo becomes about 150 KB.
// Throws an Error with a message that can be shown to the user.
export async function prepareImage(file: File): Promise<File> {
  if (!ALLOWED.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new Error(`Choose an image smaller than ${MAX_INPUT_MB} MB.`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // keeps phone photos upright
  } catch {
    throw new Error('This image could not be read. Try another one.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.fillStyle = '#ffffff'; // a white background, so transparent PNGs do not turn black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = (await toBlob(canvas, 'image/webp', 0.85)) ?? (await toBlob(canvas, 'image/jpeg', 0.85));
  if (!blob) throw new Error('The image could not be prepared.');
  return new File([blob], blob.type === 'image/webp' ? 'product.webp' : 'product.jpg', { type: blob.type });
}

// Asks Cloudinary for a smaller, compressed copy for lists and cards. Other links are left alone.
export function optimizedImage(url: string | null | undefined, width = 480): string | undefined {
  if (!url) return undefined;
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  return m ? `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}` : url;
}