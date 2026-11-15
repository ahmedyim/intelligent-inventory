import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
}

export default function ProductImage({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-400', className)}>
        <ImageOff className="h-1/2 w-1/2" aria-hidden />
        <span className="sr-only">{alt}: no image</span>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-lg bg-zinc-100 object-cover', className)}
    />
  );
}