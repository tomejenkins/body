"use client";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./button";
export function ManagementPanel({
  label,
  children,
  initialOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  initialOpen?: boolean;
}) {
  return (
    <Dialog.Root defaultOpen={initialOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline">{label}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="management-overlay" />
        <Dialog.Content
          className="management-panel"
          aria-describedby={undefined}
        >
          <Dialog.Title>{label}</Dialog.Title>
          <Dialog.Close asChild>
            <button className="management-close" aria-label={`Close ${label}`}>
              <X size={20} />
            </button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
