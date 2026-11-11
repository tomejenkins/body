"use client";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkoutClosure } from "@/components/workouts/workout-closure";
import {
  memberKey,
  type ExerciseGroup,
  type GroupMember,
} from "@/features/grouping/model";
export type GroupOption = {
  member: GroupMember;
  label: string;
  exercise?: string;
  unavailable: boolean;
};
export function SupersetBuilder({
  group,
  options,
  busy,
  error,
  onSave,
  onClose,
  returnFocus,
}: {
  group?: ExerciseGroup;
  options: GroupOption[];
  busy: boolean;
  error: string;
  onSave: (members: GroupMember[]) => Promise<boolean>;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const [members, setMembers] = useState(group?.members ?? []);
  const closing = useWorkoutClosure()?.pending;
  const disabled = busy || closing;
  const keys = members.map(memberKey);
  const dissolve = !!group && members.length < 2;
  const move = (index: number, delta: number) =>
    setMembers((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="management-overlay" />
        <Dialog.Content
          className="management-panel superset-builder"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus?.isConnected)
              returnFocus.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            if (disabled) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (disabled) event.preventDefault();
          }}
        >
          <Dialog.Title>
            {group ? "Edit Superset" : "Create Superset"}
          </Dialog.Title>
          <Dialog.Description>
            Choose two or three movements. Your sets stay unchanged.
          </Dialog.Description>
          <button
            type="button"
            className="management-close"
            aria-label="Close Superset Builder"
            disabled={disabled}
            onClick={onClose}
          >
            <X size={20} />
          </button>
          {options.length < 2 && (
            <p>Add at least two movements to this workout first.</p>
          )}
          <div className="superset-options" aria-label="Available movements">
            {options.map((option) => {
              const key = memberKey(option.member),
                selected = keys.includes(key);
              return (
                <label key={key} className="superset-option">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={
                      disabled ||
                      option.unavailable ||
                      (!selected && members.length >= 3)
                    }
                    onChange={() =>
                      setMembers((old) =>
                        selected
                          ? old.filter((m) => memberKey(m) !== key)
                          : [...old, option.member],
                      )
                    }
                  />
                  <span>
                    <strong>{option.label}</strong>
                    {option.exercise && <small>{option.exercise}</small>}
                    {option.unavailable && (
                      <small>Already in another Superset</small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="set-source" role="status">
            {members.length}/3 selected
            {members.length === 3
              ? " · Maximum three"
              : members.length < 2
                ? " · Choose at least two"
                : ""}
          </p>
          {members.length > 0 && (
            <ol
              className="superset-member-order"
              aria-label="Superset member order"
            >
              {members.map((member, index) => (
                <li key={memberKey(member)}>
                  <span>
                    A{index + 1} ·{" "}
                    {options.find(
                      (o) => memberKey(o.member) === memberKey(member),
                    )?.label ?? "Movement"}
                  </span>
                  <Button
                    variant="outline"
                    disabled={disabled || index === 0}
                    aria-label={`Move A${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled || index === members.length - 1}
                    aria-label={`Move A${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          {dissolve && <p>Saving will ungroup these movements.</p>}
          {error && <p role="alert">{error}</p>}
          <Button
            disabled={disabled || (!dissolve && members.length < 2)}
            onClick={async () => {
              if (await onSave(members)) onClose();
            }}
          >
            {busy
              ? "Saving Superset…"
              : dissolve
                ? "Ungroup"
                : group
                  ? "Save Superset"
                  : "Create Superset"}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
