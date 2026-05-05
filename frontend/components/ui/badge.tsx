import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      success: "bg-emerald-100 text-emerald-700",
      warning: "bg-amber-100 text-amber-700",
      danger: "bg-rose-100 text-rose-700"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export function Badge({
  className,
  variant,
  children
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)}>{children}</div>;
}
