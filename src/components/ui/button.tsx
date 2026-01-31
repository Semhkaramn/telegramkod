import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost" | "link" | "primary";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 shadow-sm": variant === "default",
            "bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-500/20": variant === "destructive",
            "border border-slate-600 bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white": variant === "outline",
            "hover:bg-slate-800 text-slate-300 hover:text-white": variant === "ghost",
            "text-blue-400 underline-offset-4 hover:underline hover:text-blue-300": variant === "link",
            "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25": variant === "primary",
          },
          {
            "h-10 px-4 py-2 text-sm": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-12 px-6 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
