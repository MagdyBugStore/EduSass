import { z } from 'zod';

/** A profile photo: small data: URL made in the browser (≈240px JPEG). null removes it. */
export const photoSchema = z.object({
  photo: z.string().max(300_000, 'الصورة كبيرة، اختار صورة أصغر')
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'صيغة الصورة غير مدعومة')
    .nullable(),
});
