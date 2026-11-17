import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateMasterItemRequest,
  MASTER_LABELS,
  type MasterItem,
  type MasterList,
  type UpdateMasterItemRequest,
} from '@tyio/shared';
import { DataSource, QueryFailedError, type Repository } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import type { MasterRow } from '../../db/master-entity.js';
import { MASTER_ENTITIES, MASTER_TABLES } from './master.entities.js';

// Kode galat PostgreSQL. Baris yang masih dirujuk: 23001 untuk foreign key ON DELETE
// RESTRICT, 23503 untuk NO ACTION; keduanya berarti "sudah dipakai".
const UNIQUE_VIOLATION = '23505';
const STILL_REFERENCED = ['23001', '23503'];

/**
 * Mengelola keempat daftar master. "Sudah dipakai" tidak dihitung di sini: setiap tabel yang
 * merujuk master memakai foreign key ON DELETE RESTRICT (dijaga uji), jadi database sendiri
 * yang menolak penghapusan, termasuk untuk tabel yang ditambahkan kelak.
 */
@Injectable()
export class MasterService {
  constructor(private readonly dataSource: DataSource) {}

  /** Semua isi daftar, termasuk yang nonaktif, urut kode. */
  async list(list: MasterList): Promise<MasterItem[]> {
    const rows = await this.dataSource
      .getRepository(MASTER_ENTITIES[list])
      .find({ order: { code: 'ASC' } });
    return rows.map(toItem);
  }

  async create(list: MasterList, input: CreateMasterItemRequest, actor: Actor): Promise<MasterItem> {
    return this.write(list, actor, input, async (repo) => toItem(await repo.save(repo.create(input))));
  }

  async update(
    list: MasterList,
    id: string,
    input: UpdateMasterItemRequest,
    actor: Actor,
  ): Promise<MasterItem> {
    return this.write(list, actor, input, async (repo) => {
      const row = await this.findOrFail(list, repo, id);
      return toItem(await repo.save(Object.assign(row, input)));
    });
  }

  async remove(list: MasterList, id: string, actor: Actor): Promise<void> {
    await this.write(list, actor, {}, async (repo) => {
      const row = await this.findOrFail(list, repo, id);
      try {
        await repo.delete({ id });
      } catch (error) {
        if (!STILL_REFERENCED.includes(pgCode(error) ?? '')) throw error;
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          message:
            `${MASTER_LABELS[list]} ${row.name} sudah dipakai, jadi tidak bisa dihapus. ` +
            'Nonaktifkan agar tidak muncul di pilihan baru; data lama tetap utuh.',
        });
      }
    });
  }

  private async findOrFail(list: MasterList, repo: Repository<MasterRow>, id: string): Promise<MasterRow> {
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: `${MASTER_LABELS[list]} tidak ditemukan.`,
      });
    }
    return row;
  }

  /** Satu transaksi bertanda pelaku (audit); kode atau nama kembar dijawab 409 per kolom. */
  private async write<T>(
    list: MasterList,
    actor: Actor,
    input: { code?: string; name?: string },
    work: (repo: Repository<MasterRow>) => Promise<T>,
  ): Promise<T> {
    try {
      return await withActor(this.dataSource, actor, (m) => work(m.getRepository(MASTER_ENTITIES[list])));
    } catch (error) {
      if (pgCode(error) !== UNIQUE_VIOLATION) throw error;
      const field = constraintOf(error) === `${MASTER_TABLES[list]}_code_key` ? 'code' : 'name';
      const label = field === 'code' ? 'Kode' : 'Nama';
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: `${label} ${input[field] ?? ''} sudah dipakai di daftar ${MASTER_LABELS[list]}.`,
        field,
      });
    }
  }
}

function toItem({ id, code, name, active }: MasterRow): MasterItem {
  return { id, code, name, active };
}

function pgCode(error: unknown): string | undefined {
  return error instanceof QueryFailedError ? (error.driverError as { code?: string }).code : undefined;
}

function constraintOf(error: unknown): string | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as { constraint?: string }).constraint
    : undefined;
}
