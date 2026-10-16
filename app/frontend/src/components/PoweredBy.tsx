export function PoweredBy({ className = '' }: { className?: string }) {
  return (
    <div dir="ltr" className={`inline-flex items-center gap-2 text-[12px] text-pencil ${className}`}>
      <img src="/codexa-64.png" alt="" width={22} height={22} className="rounded-md" />
      <span>Powered by <b className="font-bold tracking-wide text-graphite">Codexa</b></span>
    </div>
  );
}
