function sealed(target: Function): void {
  void target;
}

@sealed
export class SimpleExample {
  value = 1;
}
