"use client";
import { Popover } from "radix-ui";
import { CircleHelp, X } from "lucide-react";
import type { ReactNode } from "react";

export function SetOptionHelp({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="set-help-trigger"
          aria-label={`About ${title}`}
        >
          <CircleHelp size={17} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="set-help-content"
          aria-label={`${title} help`}
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <div className="set-help-heading">
            <strong>{title}</strong>
            <Popover.Close asChild>
              <button type="button" aria-label={`Close ${title} help`}>
                <X size={16} aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <p>{children}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
