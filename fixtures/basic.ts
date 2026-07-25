// Leading comment
export interface User<T extends string = string> {
  readonly id: T;
  name?: string;
}

export const satisfiesExample = {
  id: "abc",
} satisfies User;
