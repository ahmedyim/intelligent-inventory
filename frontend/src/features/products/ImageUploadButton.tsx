import { useRef } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/errors';
import { prepareImage } from '@/lib/image';
import { useUploadProductImageMutation } from './imageApi';

interface Props {
    onUploaded: (url: string) => void;
    disabled?: boolean;
}

export default function ImageUploadButton({ onUploaded, disabled }: Props) {
    const input = useRef<HTMLInputElement>(null);
    const [upload, { isLoading }] = useUploadProductImageMutation();

    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // so choosing the same file twice still works
        if (!file) return;

        try {
            const ready = await prepareImage(file);
            const res = await upload(ready).unwrap();
            onUploaded(res.url);
            toast.success('Image uploaded');
        } catch (err) {
            if (err instanceof Error) toast.error(err.message); // from prepareImage
            else if ((err as { status?: number })?.status === 413) toast.error('The image is too large.');
            else toast.error(getErrorMessage(err, 'Could not upload the image'));
        }
    };

    return (
        <>
            <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={pick}
                aria-label="Choose an image to upload"
            />
            <Button type="button" variant="outline" size="sm" disabled={disabled || isLoading} onClick={() => input.current?.click()}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                {isLoading ? 'Uploading...' : 'Upload image'}
            </Button>
        </>
    );
}