import type { PresenceUser } from '@kb/shared';
import { Avatar } from '../Avatar';
import { Tooltip } from '../ui/Tooltip';

/** Avatars of people currently on the page (identities come from the server, not from clients). */
export function Presence({ users, meId }: { users: PresenceUser[]; meId: string }) {
  const unique = [...new Map(users.filter((u) => u.userId !== meId).map((u) => [u.userId, u])).values()];
  if (!unique.length) return null;
  const shown = unique.slice(0, 4);
  return (
    <div className="presence" aria-label={`Сейчас на странице: ${unique.map((u) => u.name).join(', ')}`}>
      {shown.map((u) => (
        <Tooltip key={u.userId} label={`${u.name}${u.canEdit ? '' : ' · просмотр'}`}>
          <span className="presence-avatar" style={{ boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px ${u.color}` }}>
            <Avatar name={u.name} id={u.userId} />
          </span>
        </Tooltip>
      ))}
      {unique.length > shown.length && <span className="presence-more">+{unique.length - shown.length}</span>}
    </div>
  );
}
