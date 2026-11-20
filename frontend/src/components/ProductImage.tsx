import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { optimizedImage } from '@/lib/image';
import { cn } from '@/lib/utils';

interface Props {
  src?: string | null;
  alt: string;
  className?: string; // set the size here, e.g. "h-10 w-10"
  width?: number; // the widest it will be shown, in pixels (the copy is made at this size)
}

export default function ProductImage({ src, alt, className, width = 480 }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-400', className)}>
        <ImageOff className="h-1/2 w-1/2" aria-hidden />
        <span className="sr-only">{alt}: no image</span>
      </span>
    );
  }

  return (
    <img
      src={optimizedImage(src, width)}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={cn('shrink-0 rounded-lg bg-zinc-100 object-cover', className)}
    />
  );
}