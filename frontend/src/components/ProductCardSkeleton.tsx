import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductCardSkeleton() {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <Skeleton className="aspect-[9/16] rounded-none" />
      <div className="flex flex-1 flex-col gap-1.5 p-3 lg:p-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-[2.7em] w-full" />
        <Skeleton className="h-6 w-24" />
      </div>
    </Card>
  );
}
