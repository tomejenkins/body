// Public project identifier only. Never store an API key in source control.
export const BODY_OPENAI_PROJECT_ID = 'proj_O5giIELFflZ131F0wem4Xc10';
export const BODY_BUDGET_ENVIRONMENT = 'agent_budget';

export function assertBodyProjectId(projectId) {
  if (projectId !== BODY_OPENAI_PROJECT_ID) {
    throw new Error('Budget monitor project mismatch; refusing to continue');
  }
  return projectId;
}
