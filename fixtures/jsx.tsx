type Props = { label: string };

export function Button({ label }: Props) {
  return <button aria-label={label}>{label}</button>;
}
