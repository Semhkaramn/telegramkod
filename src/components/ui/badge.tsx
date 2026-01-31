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
            "bg-blue-600 text-white": variant === "default",
            "bg-slate-700 text-slate-200": variant === "secondary",
            "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30": variant === "success",
            "bg-amber-500/20 text-amber-400 border border-amber-500/30": variant === "warning",
            "bg-red-500/20 text-red-400 border border-red-500/30": variant === "destructive",
            "border border-slate-600 text-slate-300": variant === "outline",
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
