import { colorForUser } from '@kb/shared';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, id, size, title }: { name: string; id: string; size?: 'lg'; title?: string }) {
  return (
    <span className={'avatar' + (size ? ' ' + size : '')} style={{ background: colorForUser(id) }} title={title ?? name} aria-hidden={!title}>
      {initials(name)}
    </span>
  );
}
