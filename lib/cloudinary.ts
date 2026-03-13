import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function deleteCloudinaryAssets(publicIds: string[]) {
  const uniqueIds = [...new Set(publicIds.filter(Boolean))];

  if (uniqueIds.length === 0) return;

  for (const publicId of uniqueIds) {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
    } catch {}

    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "raw",
        invalidate: true,
      });
    } catch {}

    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "video",
        invalidate: true,
      });
    } catch {}
  }
}

export default cloudinary;