export function identityConstructor<
  T extends new (...args: any[]) => object,
>(target: T): T {
  return target;
}
