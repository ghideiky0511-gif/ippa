import { BookOpenCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface IntegrationRule {
  title: string;
  description: string;
}

interface IntegrationRulesCardProps {
  title?: string;
  description: string;
  rules: IntegrationRule[];
}

/** Regras operacionais curtas, mantidas junto à tela que as aplica. */
export function IntegrationRulesCard({
  title = 'Como esta integração funciona',
  description,
  rules,
}: IntegrationRulesCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-primary/10 text-brand-primary">
          <BookOpenCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-border border-t border-border">
        {rules.map((rule) => (
          <div key={rule.title} className="py-3 first:pt-3 last:pb-0">
            <dt className="text-sm font-medium text-foreground">{rule.title}</dt>
            <dd className="mt-1 text-sm leading-6 text-muted-foreground">{rule.description}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
