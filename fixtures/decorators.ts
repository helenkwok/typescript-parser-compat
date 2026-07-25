function sealed<T extends new (...args: any[]) => object>(target: T): T {
  return target;
}

@sealed
export class Example {
  value = 1;
}
