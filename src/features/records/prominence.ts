// Internal display metadata only. Never render prominence labels in the product.
export type RecordProminence = "primary" | "secondary" | "standard";
export type ExerciseFamily = "bench_press" | "squat" | "hinge";
const profiles: Record<
  string,
  { prominence: RecordProminence; family: ExerciseFamily | null }
> = {
  "e8dc24a5-fac6-5190-8366-0426849f3dfb": {
    prominence: "primary",
    family: "bench_press",
  },
  "413a4af4-df60-5280-b94d-e23991f07912": {
    prominence: "secondary",
    family: "bench_press",
  },
  "c8924ae0-5267-5c1c-b56e-1f731c423b82": {
    prominence: "standard",
    family: "bench_press",
  },
  "20490168-cb5f-5298-9f0c-e5bb5e7f91a5": {
    prominence: "secondary",
    family: "bench_press",
  },
  "d92d8c29-8ad6-5ff9-a6b5-77066a6549fa": {
    prominence: "standard",
    family: "bench_press",
  },
  "6d792964-5a13-50b9-b5f6-8e0818aa1fe5": {
    prominence: "standard",
    family: "bench_press",
  },
  "4b51a624-d286-5cc1-8d5c-1c9349dea549": {
    prominence: "standard",
    family: "bench_press",
  },
  "c894e1c0-dd77-529b-86d9-3cb07bfcf5c7": {
    prominence: "primary",
    family: "squat",
  },
  "4d532d15-59b2-5632-9279-e2ee706f392f": {
    prominence: "secondary",
    family: "squat",
  },
  "05820385-80fa-5784-9e53-b390f2835e65": {
    prominence: "standard",
    family: "squat",
  },
  "610774fb-26cb-5091-8cc1-cdcdb17dd501": {
    prominence: "standard",
    family: "squat",
  },
  "b1aebe79-e033-5fd7-a1fc-4678e492a6a3": {
    prominence: "standard",
    family: "squat",
  },
  "0ab82af9-a623-58fc-b6ab-c1a3dad4f9ef": {
    prominence: "standard",
    family: "squat",
  },
  "8a050222-28da-5a97-8ec2-88600106046a": {
    prominence: "primary",
    family: "hinge",
  },
  "16dec545-f351-5ae7-86c2-6c56159ac482": {
    prominence: "secondary",
    family: "hinge",
  },
  "582062f3-c282-5a70-bfb2-fb914c8feff1": {
    prominence: "secondary",
    family: "hinge",
  },
  "7320b652-6f04-5af5-b5fb-b86a98e523b5": {
    prominence: "secondary",
    family: "hinge",
  },
  "ff43ad45-2129-56b0-9ece-568fd6e04266": {
    prominence: "secondary",
    family: "hinge",
  },
  "7f2e7cde-6b1e-511a-aeb2-3e82b9a217bf": {
    prominence: "standard",
    family: "hinge",
  },
  "661fb904-d6a3-5ffb-9f17-fca562a5c668": {
    prominence: "secondary",
    family: null,
  },
  "cecdf002-5e06-5f7e-9e67-c538415319e8": {
    prominence: "secondary",
    family: null,
  },
};
export function recordProfile(exerciseId: string) {
  return {
    exerciseId,
    ...(profiles[exerciseId] ?? {
      prominence: "standard" as const,
      family: null,
    }),
  };
}
export const featuredLifts = [
  { id: "e8dc24a5-fac6-5190-8366-0426849f3dfb", name: "Barbell bench press" },
  { id: "c894e1c0-dd77-529b-86d9-3cb07bfcf5c7", name: "Barbell back squat" },
  { id: "8a050222-28da-5a97-8ec2-88600106046a", name: "Conventional deadlift" },
] as const;
export function prioritizedRecordIds() {
  return Object.keys(profiles).filter(
    (id) => recordProfile(id).prominence !== "standard",
  );
}
