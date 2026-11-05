"use client";
import Image from "next/image";
import { useState } from "react";
import type { ProgramMedia } from "@/features/programs/catalog";
const covers = new Set(
  [
    "full-body-foundation",
    "foundational-barbell-strength",
    "upper-lower-strength-size",
    "push-pull-legs",
    "classic-body-part-split",
    "classic-physique-six-day",
    "high-intensity-low-volume",
    "powerbuilding",
    "strength-five-by-five",
    "three-day-hypertrophy",
    "dumbbell-only-full-body",
    "functional-strength",
    "fallback",
  ].map((s) => `/media/programs/${s}.svg`),
);
export function programCoverPath(value: string | undefined) {
  return value && covers.has(value) ? value : "/media/programs/fallback.svg";
}
export function ProgramCover({
  media,
  title,
  priority = false,
}: {
  media: ProgramMedia | null;
  title: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    src = failed
      ? "/media/programs/fallback.svg"
      : programCoverPath(media?.asset_path);
  return (
    <Image
      src={src}
      alt={
        failed || !media
          ? `Original Body rotation graphic for ${title}`
          : media.alt_text
      }
      width={960}
      height={600}
      unoptimized
      loading={priority ? "eager" : "lazy"}
      className="program-cover"
      onError={() => setFailed(true)}
    />
  );
}
