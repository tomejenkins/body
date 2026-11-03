"use client";
import Image from "next/image";
import { useState } from "react";
import {
  resolveExerciseVisuals,
  type VisualInput,
} from "@/features/exercises/visuals";
export function ExerciseThumbnail({
  visual,
  size = 64,
  decorative = true,
}: {
  visual: VisualInput;
  size?: 64 | 80 | 128;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const resolved = resolveExerciseVisuals(visual).find(
    (item) => !failed.includes(item.src),
  );
  if (!resolved)
    return (
      <span
        className="exercise-thumbnail thumbnail-placeholder"
        style={{ width: size, height: size }}
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : "General exercise illustration"}
      >
        ↗
      </span>
    );
  return (
    <Image
      className="exercise-thumbnail"
      src={resolved.src}
      width={size}
      height={size}
      alt={decorative ? "" : resolved.description}
      unoptimized
      onError={() => setFailed((previous) => [...previous, resolved.src])}
    />
  );
}
