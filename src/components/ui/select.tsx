"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import type { ComponentProps } from "react";

/**
 * Select in the style of shadcn/ui, built on Radix and styled with this
 * app's tokens: a full-width trigger and a popover list that replaces the
 * browser's native dropdown, with keyboard and screen reader support.
 */

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`size-3.5 ${className}`}
    >
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SelectTrigger({
  className = "",
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border border-rule bg-paper px-3 text-left text-sm transition-colors hover:border-muted data-[placeholder]:text-muted data-[state=open]:border-muted ${className}`}
      {...props}
    >
      <span className="truncate">{children}</span>
      <SelectPrimitive.Icon>
        <Chevron className="text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className="z-50 max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-rule bg-paper text-sm shadow-[0_4px_16px_rgb(0_0_0/0.06)]"
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  children,
  detail,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item> & { detail?: string }) {
  return (
    <SelectPrimitive.Item
      className="relative flex cursor-default items-center justify-between gap-4 rounded-sm py-1.5 pr-2 pl-6 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-tile"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-1.5">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-3.5"
        >
          <path
            d="m3.5 8.5 3 3 6-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {detail && (
        <span className="text-muted tabular-nums" aria-hidden>
          {detail}
        </span>
      )}
    </SelectPrimitive.Item>
  );
}
