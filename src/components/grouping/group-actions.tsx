"use client";
import { useRef } from "react";
import { DropdownMenu } from "radix-ui";
import { Ellipsis, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkoutClosure } from "@/components/workouts/workout-closure";
export function CreateSupersetButton({
  disabled,
  onOpen,
  compact = false,
}: {
  disabled: boolean;
  onOpen: (target: HTMLElement) => void;
  compact?: boolean;
}) {
  const closure = useWorkoutClosure();
  return (
    <Button
      type="button"
      variant="outline"
      className={compact ? "create-superset-shortcut" : undefined}
      aria-label="Create Superset"
      disabled={disabled || closure?.pending}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Link2 size={18} aria-hidden="true" />
      {!compact && "Create Superset"}
    </Button>
  );
}
export function GroupActions({
  label,
  disabled,
  onEdit,
  onUngroup,
}: {
  label: string;
  disabled: boolean;
  onEdit: (target: HTMLElement | null) => void;
  onUngroup: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    editing = useRef(false),
    closing = useWorkoutClosure()?.pending;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          ref={trigger}
          variant="outline"
          className="favorite-menu-trigger"
          aria-label={`Manage ${label}`}
          disabled={disabled || closing}
        >
          <Ellipsis size={18} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="context-menu"
          align="end"
          collisionPadding={12}
          sideOffset={6}
          onCloseAutoFocus={(event) => {
            if (editing.current) {
              editing.current = false;
              event.preventDefault();
            }
          }}
        >
          <DropdownMenu.Item
            onSelect={() => {
              editing.current = true;
              onEdit(trigger.current);
            }}
          >
            Edit / Reorder Superset
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={onUngroup}>Ungroup</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
