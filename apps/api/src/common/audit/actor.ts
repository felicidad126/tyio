import type { SessionUser } from '@tyio/shared';
import type { Request } from 'express';
import type { DataSource, EntityManager } from 'typeorm';

/** Siapa yang mengubah data dan dari mana. Wajib ada untuk setiap perubahan (dicek trigger DB). */
export interface Actor {
  /** Contoh: `pengguna:helpdesk.contoh`, `sistem:seed`, `anonim`. */
  name: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export const SEED_ACTOR: Actor = { name: 'sistem:seed' };

export function userActor(user: Pick<SessionUser, 'id' | 'username'>, req: Request): Actor {
  return {
    name: `pengguna:${user.username}`,
    userId: user.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export function anonymousActor(req: Request): Actor {
  return { name: 'anonim', ip: req.ip, userAgent: req.get('user-agent') };
}

/**
 * Menjalankan perubahan data dalam satu transaksi yang membawa identitas pelaku.
 * Trigger audit di database membaca identitas ini dan menolak perubahan tanpa pelaku.
 */
export function withActor<T>(
  dataSource: DataSource,
  actor: Actor,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await setActor(manager, actor);
    return work(manager);
  });
}

/** Mengisi identitas pelaku untuk sisa transaksi yang sedang berjalan. */
export async function setActor(manager: EntityManager, actor: Actor): Promise<void> {
  // SQL mentah disengaja: set_config tidak punya padanan di ORM. is_local = true:
  // nilainya hilang saat transaksi selesai, jadi tidak bocor ke permintaan lain di pool.
  await manager.query(
    `SELECT set_config('tyio.actor', $1, true),
            set_config('tyio.actor_user_id', $2, true),
            set_config('tyio.ip', $3, true),
            set_config('tyio.user_agent', $4, true)`,
    [
      actor.name.slice(0, 120),
      actor.userId ?? '',
      actor.ip?.slice(0, 64) ?? '',
      actor.userAgent?.slice(0, 512) ?? '',
    ],
  );
}
