/** @param {{ name?: string }} user */
export function greet(user) {
  return user?.name ?? "anonymous";
}
