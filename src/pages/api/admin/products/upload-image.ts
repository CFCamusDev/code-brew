import type { APIRoute } from 'astro';
import { cloudinaryEnabled, CloudinaryUploadError, uploadProductImage } from '../../../../lib/server/cloudinary';

export const prerender = false;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede subir imágenes.' }, { status: 403 });
  if (!cloudinaryEnabled()) return Response.json({ error: 'La subida de imágenes no está configurada todavía.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Adjunta una imagen.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: 'Solo se aceptan imágenes JPG, PNG o WebP.' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'La imagen no puede pesar más de 5 MB.' }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadProductImage(buffer);
    return Response.json({ url });
  } catch (error) {
    if (error instanceof CloudinaryUploadError) return Response.json({ error: error.message }, { status: 502 });
    throw error;
  }
};
