export function isSingleUserModeEnabled() {
  return (process.env.SINGLE_USER_MODE ?? "1") === "1";
}
