export const STANDINGS_TEST_MODE = false;

// jeśli test mode = true, wybierz grupę
export const STANDINGS_TEST_GROUP_NAME = "Grupa A" as const;

// dostępne:
// "default"
// "test-points"
// "test-direct-match"
// "test-goal-difference"
// "test-goals-for"
// "test-unresolved-tie-2"
// "test-three-way-tie"
// "test-unresolved-tie-3"
export const ACTIVE_STANDINGS_TEST_SCENARIO = "test-unresolved-tie-3" as const;