export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scope is required - every commit must reference a step ID e.g. feat(BE-1): ...
    'scope-empty': [2, 'never'],
  },
};
