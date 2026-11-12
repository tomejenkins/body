"use client";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Dialog, Popover } from "radix-ui";
import { Settings, X } from "lucide-react";
import { useWorkoutClosure } from "./workout-closure";
export function SettingsSheet({
  label,
  title,
  open,
  onOpenChange,
  disabled = false,
  children,
  className = "",
  triggerText,
  id,
  onInteract,
}: {
  label: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  triggerText?: string;
  id?: string;
  onInteract?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    closing = useWorkoutClosure()?.pending;
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (value)
          setContainer(
            trigger.current?.closest<HTMLElement>(".workout-execution") ?? null,
          );
        onOpenChange(value);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className={triggerText ? "workout-compact-action" : "workout-gear"}
          aria-label={label}
          disabled={disabled || closing}
        >
          {triggerText ?? <Settings size={18} aria-hidden="true" />}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay className="management-overlay" />
        <Dialog.Content
          id={id}
          className={`management-panel workout-settings-sheet ${className}`}
          aria-label={label}
          aria-labelledby={undefined}
          onPointerDownCapture={onInteract}
          onKeyDownCapture={onInteract}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (trigger.current?.isConnected)
              trigger.current.focus({ preventScroll: true });
            else if (document.activeElement === document.body)
              document
                .querySelector<HTMLButtonElement>(
                  ".create-superset-shortcut, .set-gear",
                )
                ?.focus({ preventScroll: true });
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{label}</Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              className="management-close"
              aria-label={`Close ${title}`}
            >
              <X size={20} />
            </button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Nonmodal set settings keep the original row mounted and editable. The fixed
// popper is local to that row; collision padding reserves the workout footer.
export function SetSettings({
  label,
  title,
  open,
  onOpenChange,
  disabled = false,
  children,
  id,
  onInteract,
}: {
  label: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  id: string;
  onInteract: () => void;
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    outside = useRef<HTMLElement | null>(null),
    closing = useWorkoutClosure()?.pending;
  const [clearance, setClearance] = useState({ top: 24, bottom: 190 });
  const measure = useCallback(() => {
    const root = trigger.current?.closest(".workout-execution");
    const bottom = root
      ? parseFloat(
          getComputedStyle(root).getPropertyValue("--workout-controls-space"),
        )
      : 0;
    const header =
      document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
    return {
      top: Math.max(12, header + 8),
      bottom: Math.max(
        80,
        Number.isFinite(bottom) && bottom > 0 ? bottom + 8 : 190,
      ),
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const update = () =>
      setClearance((old) => {
        const next = measure();
        return old.top === next.top && old.bottom === next.bottom ? old : next;
      });
    const root = trigger.current?.closest(".workout-execution");
    const observer = new MutationObserver(update);
    if (root)
      observer.observe(root, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [open, measure]);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        if (value) {
          outside.current = null;
          setClearance(measure());
        }
        onOpenChange(value);
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className="workout-gear set-gear"
          aria-label={label}
          disabled={disabled || closing}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Content
        id={id}
        className="set-options set-settings-popover"
        aria-label={label}
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={{ ...clearance, left: 12, right: 12 }}
        onPointerDownCapture={onInteract}
        onKeyDownCapture={onInteract}
        onInteractOutside={(e) => {
          outside.current =
            e.target instanceof Element
              ? (e.target.closest<HTMLElement>(
                  "button,input,select,textarea,a[href],[tabindex]",
                ) ?? (e.target instanceof HTMLElement ? e.target : null))
              : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const target = outside.current;
          if (target?.isConnected) {
            if (document.activeElement === document.body)
              target.focus({ preventScroll: true });
          } else if (
            trigger.current?.isConnected &&
            document.activeElement === document.body
          )
            trigger.current.focus({ preventScroll: true });
          else if (document.activeElement === document.body)
            document
              .querySelector<HTMLButtonElement>(
                ".set-gear, .create-superset-shortcut",
              )
              ?.focus({ preventScroll: true });
        }}
      >
        <div className="set-settings-heading">
          <h2>{title}</h2>
          <Popover.Close asChild>
            <button
              type="button"
              className="workout-gear"
              aria-label={`Close ${title}`}
            >
              <X size={18} />
            </button>
          </Popover.Close>
        </div>
        {children}
      </Popover.Content>
    </Popover.Root>
  );
}
