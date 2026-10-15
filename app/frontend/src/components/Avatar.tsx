import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { api, toastErr } from '../lib/api';

/** First letter of a person's name, skipping honorifics like "أ." */
export const initialOf = (name = '') => name.replace(/^(أ|د|م)\.\s*/, '').trim().charAt(0) || '؟';

/** Square-cropped, downscaled JPEG data: URL (~15–30KB) so photos travel inside normal API responses. */
export async function resizePhoto(file: File, size = 240): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('اختار ملف صورة');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('مش قادر أقرا الصورة')); i.src = url; });
    const s = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function Avatar({ name, photo, className = 'h-10 w-10 text-sm' }: { name: string; photo?: string; className?: string }) {
  return photo
    ? <img src={photo} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />
    : <div aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-[rgb(var(--accent-2))] font-bold text-white ${className}`}>{initialOf(name)}</div>;
}

/** Large avatar with change/remove controls. `url` is the PUT endpoint that takes { photo }. */
export function PhotoEditor({ name, photo, url, canEdit, onSaved, className }: { name: string; photo?: string; url: string; canEdit: boolean; onSaved: () => void; className: string }) {
  const input = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: async (p: string | null) => api.put(url, { photo: p }),
    onSuccess: (_d, p) => { toast.success(p ? 'اتحدثت الصورة' : 'اتشالت الصورة'); onSaved(); },
    onError: toastErr,
  });
  const pick = async (f?: File) => {
    if (!f) return;
    try { save.mutate(await resizePhoto(f)); } catch (e: any) { toast.error(e.message); }
    if (input.current) input.current.value = '';
  };
  return (
    <div className="relative shrink-0">
      <Avatar name={name} photo={photo} className={`${className} ring-4 ring-app`} />
      {canEdit && <>
        <button type="button" onClick={() => input.current?.click()} disabled={save.isPending}
          className="absolute bottom-1 left-1 grid h-9 w-9 place-items-center rounded-full bg-surface text-graphite shadow-lg ring-1 ring-rule hover:text-brand" aria-label="تغيير الصورة" title="تغيير الصورة">
          <Camera size={16} />
        </button>
        {photo && (
          <button type="button" onClick={() => save.mutate(null)} disabled={save.isPending}
            className="absolute bottom-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-surface text-pencil shadow-lg ring-1 ring-rule hover:text-danger" aria-label="شيل الصورة" title="شيل الصورة">
            <Trash2 size={14} />
          </button>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </>}
    </div>
  );
}
