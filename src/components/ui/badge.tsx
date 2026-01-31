import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          {
            "bg-zinc-900 text-zinc-50": variant === "default",
            "bg-zinc-700 text-zinc-200": variant === "secondary",
            "bg-emerald-100 text-emerald-700": variant === "success",
            "bg-amber-100 text-amber-700": variant === "warning",
            "bg-red-100 text-red-700": variant === "destructive",
            "border border-zinc-300 text-zinc-700": variant === "outline",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
