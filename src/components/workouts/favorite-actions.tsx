"use client";
import { useRef, useState } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import { Ellipsis, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectionForm } from "./selection-form";
export function FavoriteActions({ id, name }: { id: string; name: string }) {
  const [mode, setMode] = useState<"rename" | "remove" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            aria-label={`Manage ${name}`}
            className="favorite-menu-trigger"
          >
            <Ellipsis size={20} aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="context-menu"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            onCloseAutoFocus={(e) => {
              if (mode) e.preventDefault();
            }}
          >
            <DropdownMenu.Item onSelect={() => setMode("rename")}>
              <Pencil size={16} aria-hidden="true" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="context-destructive"
              onSelect={() => setMode("remove")}
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog.Root
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="management-overlay" />
          <Dialog.Content
            className="management-panel"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              if (mode === "rename") {
                event.preventDefault();
                nameInput.current?.focus();
                nameInput.current?.select();
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (trigger.current) trigger.current.focus();
              else
                document.querySelector<HTMLElement>("#favorites h2")?.focus();
            }}
          >
            <Dialog.Title>
              {mode === "rename" ? "Rename Favorite" : "Remove Favorite"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="management-close"
                aria-label="Close Favorite editor"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
            {mode === "rename" ? (
              <SelectionForm
                kind="manage"
                fields={{ favorite: id, operation: "rename" }}
                label="Rename Favorite"
                onSuccess={() => setMode(null)}
              >
                <label>
                  New name
                  <input
                    name="name"
                    ref={nameInput}
                    defaultValue={name}
                    required
                    maxLength={100}
                  />
                </label>
              </SelectionForm>
            ) : (
              <SelectionForm
                kind="manage"
                fields={{ favorite: id, operation: "remove" }}
                label="Remove Favorite"
                onSuccess={() => setMode(null)}
              >
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                  />
                  Remove this shortcut; keep existing history
                </label>
              </SelectionForm>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
