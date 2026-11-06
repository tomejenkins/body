export type FocusDefinition = {
  id: string;
  label: string;
  count: number;
  balanced: readonly string[];
  emphasis: readonly {
    id: string;
    label: string;
    supportedBy: readonly string[];
    intents: readonly string[];
  }[];
};
export const quickFocus: readonly FocusDefinition[] = [
  {
    id: "chest",
    label: "Chest",
    count: 4,
    balanced: [
      "flat_press",
      "incline_press",
      "chest_fly",
      "upper_chest_fly",
      "lower_chest_fly",
    ],
    emphasis: [
      {
        id: "upper_chest",
        label: "Upper Chest",
        supportedBy: ["incline_press", "upper_chest_fly"],
        intents: [
          "incline_press",
          "upper_chest_fly",
          "flat_press",
          "chest_fly",
        ],
      },
      {
        id: "mid_chest",
        label: "Mid Chest",
        supportedBy: ["flat_press", "chest_fly"],
        intents: [
          "flat_press",
          "chest_fly",
          "incline_press",
          "upper_chest_fly",
        ],
      },
    ],
  },
  {
    id: "back",
    label: "Back",
    count: 4,
    balanced: [
      "vertical_pull",
      "row",
      "pullover",
      "upper_row",
      "lat_row",
      "shrug",
    ],
    emphasis: [
      {
        id: "lats",
        label: "Lats",
        supportedBy: ["vertical_pull", "lat_row", "pullover"],
        intents: ["vertical_pull", "lat_row", "row", "pullover"],
      },
      {
        id: "upper_back",
        label: "Upper Back",
        supportedBy: ["upper_row", "row"],
        intents: ["upper_row", "row", "vertical_pull", "pullover"],
      },
      {
        id: "traps",
        label: "Traps",
        supportedBy: ["shrug"],
        intents: ["shrug", "upper_row", "vertical_pull", "row"],
      },
    ],
  },
  {
    id: "legs",
    label: "Legs",
    count: 4,
    balanced: [
      "squat",
      "hinge",
      "single_leg",
      "leg_curl",
      "leg_extension",
      "hip_thrust",
      "calf_straight",
      "calf_bent",
    ],
    emphasis: [
      {
        id: "quads",
        label: "Quads",
        supportedBy: ["squat", "single_leg", "leg_extension"],
        intents: ["squat", "single_leg", "leg_extension", "hinge"],
      },
      {
        id: "hamstrings",
        label: "Hamstrings",
        supportedBy: ["hinge", "leg_curl"],
        intents: ["hinge", "leg_curl", "squat", "single_leg"],
      },
      {
        id: "glutes",
        label: "Glutes",
        supportedBy: ["hip_thrust", "hinge"],
        intents: ["hip_thrust", "hinge", "single_leg", "squat"],
      },
      {
        id: "calves",
        label: "Calves",
        supportedBy: ["calf_straight", "calf_bent"],
        intents: ["calf_straight", "calf_bent", "squat", "hinge"],
      },
    ],
  },
  {
    id: "shoulders",
    label: "Shoulders",
    count: 4,
    balanced: ["overhead_press", "lateral_raise", "rear_delt", "front_raise"],
    emphasis: [
      {
        id: "front_delts",
        label: "Front Delts",
        supportedBy: ["front_raise", "overhead_press"],
        intents: [
          "front_raise",
          "overhead_press",
          "lateral_raise",
          "rear_delt",
        ],
      },
      {
        id: "side_delts",
        label: "Side Delts",
        supportedBy: ["lateral_raise"],
        intents: [
          "lateral_raise",
          "overhead_press",
          "rear_delt",
          "front_raise",
        ],
      },
      {
        id: "rear_delts",
        label: "Rear Delts",
        supportedBy: ["rear_delt", "rear_delt_pull"],
        intents: [
          "rear_delt",
          "rear_delt_pull",
          "overhead_press",
          "lateral_raise",
        ],
      },
    ],
  },
  {
    id: "biceps",
    label: "Biceps",
    count: 3,
    balanced: [
      "standard_curl",
      "neutral_curl",
      "lengthened_curl",
      "supported_curl",
    ],
    emphasis: [
      {
        id: "standard_curl",
        label: "Standard Curl Focus",
        supportedBy: ["standard_curl", "supported_curl", "lengthened_curl"],
        intents: ["standard_curl", "supported_curl", "neutral_curl"],
      },
      {
        id: "neutral_curl",
        label: "Hammer / Neutral-Grip Focus",
        supportedBy: ["neutral_curl"],
        intents: ["neutral_curl", "lengthened_curl", "standard_curl"],
      },
    ],
  },
  {
    id: "triceps",
    label: "Triceps",
    count: 3,
    balanced: ["pushdown", "overhead_extension", "lying_extension", "kickback"],
    emphasis: [
      {
        id: "overhead_extension",
        label: "Overhead Extension Focus",
        supportedBy: ["overhead_extension"],
        intents: ["overhead_extension", "lying_extension", "pushdown"],
      },
      {
        id: "pushdown",
        label: "Pushdown Focus",
        supportedBy: ["pushdown"],
        intents: ["pushdown", "kickback", "overhead_extension"],
      },
    ],
  },
  {
    id: "core",
    label: "Core",
    count: 3,
    balanced: ["crunch", "reverse_crunch", "bicycle", "wood_chop"],
    emphasis: [
      {
        id: "abdominals",
        label: "Abdominals",
        supportedBy: ["crunch", "reverse_crunch"],
        intents: ["reverse_crunch", "crunch", "bicycle"],
      },
      {
        id: "obliques",
        label: "Obliques",
        supportedBy: ["bicycle", "wood_chop"],
        intents: ["bicycle", "wood_chop", "crunch"],
      },
    ],
  },
];
export function focusById(id: string) {
  return quickFocus.find((focus) => focus.id === id);
}
