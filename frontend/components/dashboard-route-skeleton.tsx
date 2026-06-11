import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardRouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4">
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="h-3 w-72 rounded-md" />
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
