"use client";
import { ranges, type ProgressRange } from "@/features/progress/model";
export function RangePicker({
  value,
  onChange,
}: {
  value: ProgressRange;
  onChange: (v: ProgressRange) => void;
}) {
  return (
    <label className="progress-control">
      Date range
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ProgressRange)}
      >
        {ranges.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
