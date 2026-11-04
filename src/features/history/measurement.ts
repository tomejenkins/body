// Explicit catalog identity exceptions. Custom duration/assistance needs a future editor contract.
const kinds: Record<string, "duration" | "assisted"> = {
  "fd19b662-ee66-593f-af14-b846eeac53a9": "duration",
  "45c0443c-f5fd-5997-9e9f-db4d252da13c": "duration",
  "c9ce9667-b34f-5c6f-a64b-d164d1450a54": "duration",
  "561a6aab-d7b5-5daa-a8b3-41e304bf5ad9": "duration",
  "920ef529-02ea-5603-a9bd-e960acdd2f40": "duration",
  "10514085-6c54-5483-88b6-87f8433f97ea": "duration",
  "603a99db-b243-5af5-8001-d47f662bac43": "duration",
  "9f94cf49-f770-5aab-9cae-e42566942371": "duration",
  "d5a6464a-be97-58d0-9236-fd52e8d3941f": "duration",
  "0bca06a9-efe1-58e7-876b-32b6284a2094": "assisted",
  "1dd29d2f-889b-5502-ad06-01b54a51c06c": "assisted",
};
export function specialMeasurement(exerciseId: string) {
  return kinds[exerciseId];
}
