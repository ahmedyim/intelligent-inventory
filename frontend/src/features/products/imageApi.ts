import { baseApi } from '@/app/baseApi';

export interface UploadedImage {
    url: string;
    width?: number | null;
    height?: number | null;
}

export const imageApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        uploadProductImage: build.mutation<UploadedImage, File>({
            query: (file) => {
                const body = new FormData();
                body.append('file', file);
                return { url: '/products/image', method: 'POST', body }; // the browser sets the multipart header itself
            },
        }),
    }),
});

export const { useUploadProductImageMutation } = imageApi;