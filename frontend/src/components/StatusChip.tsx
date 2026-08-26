export type StatusChipTone = 'neutral' | 'brand' | 'danger';

const TONE_CLASSES: Record<StatusChipTone, string> = {
  neutral: 'border-border bg-surface-muted text-muted-foreground',
  brand: 'border-brand-primary/30 bg-brand-primary/8 text-brand-primary',
  danger: 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]',
};

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: StatusChipTone }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
