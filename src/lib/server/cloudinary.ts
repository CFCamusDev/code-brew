import { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME } from 'astro:env/server';
import { v2 as cloudinary } from 'cloudinary';

// Firmado con el API Secret en el servidor (el navegador nunca ve las credenciales).
// Sin las tres variables configuradas, la subida de imágenes queda deshabilitada.

export function cloudinaryEnabled() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

let configured = false;
function configureOnce() {
  if (configured) return;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  configured = true;
}

export class CloudinaryUploadError extends Error {}

/** Sube una imagen de producto a la carpeta codebrew/productos y devuelve su URL https segura. */
export async function uploadProductImage(buffer: Buffer): Promise<string> {
  if (!cloudinaryEnabled()) throw new CloudinaryUploadError('La subida de imágenes no está configurada (faltan las llaves de Cloudinary).');
  configureOnce();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'codebrew/productos', resource_type: 'image', overwrite: false },
      (error, result) => {
        if (error || !result) return reject(new CloudinaryUploadError(error?.message ?? 'No se pudo subir la imagen.'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
