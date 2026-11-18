import { Inject, Injectable } from '@nestjs/common';
import { type MapRemote, type MapResponse, mapState, type MapStatesResponse, type RemoteStatus } from '@tyio/shared';
import { DataSource } from 'typeorm';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { RemoteEntity } from '../remotes/remote.entity.js';

/**
 * Peta remote (2.3): remote berkoordinat yang boleh dilihat, dengan jumlah NPR aktif dan yang
 * pending, dalam satu query (indeks tiket terbuka per remote). Kondisinya dihitung `mapState`.
 */
@Injectable()
export class MapService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Hanya remote yang tidak normal (NPR aktif, atau nonaktif/Dismantle). */
  async states(access: TenantAccess): Promise<MapStatesResponse> {
    const rows = await new TenantScopedRepository(this.dataSource.getRepository(RemoteEntity), 'tenantId')
      .query(access, 'r')
      .andWhere('r.latitude IS NOT NULL')
      .leftJoin('Ticket', 't', 't.remoteId = r.id AND t.closedAt IS NULL')
      .select('r.id', 'id')
      .addSelect('r.tenant_id', 'tenantId')
      .addSelect('r.status', 'status')
      .addSelect('COUNT(t.id)', 'active')
      .addSelect(`COUNT(t.id) FILTER (WHERE t.status = 'pending')`, 'pending')
      .groupBy('r.id')
      .having(`COUNT(t.id) > 0 OR r.status <> 'aktif'`)
      .orderBy('r.id', 'ASC')
      .getRawMany<{ id: string; tenantId: string; status: RemoteStatus; active: string; pending: string }>();
    return {
      states: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        state: mapState(r.status, Number(r.active), Number(r.pending)) as Exclude<ReturnType<typeof mapState>, 'normal'>,
        activeTickets: Number(r.active),
      })),
    };
  }

  async get(access: TenantAccess): Promise<MapResponse> {
    const remotes = () => new TenantScopedRepository(this.dataSource.getRepository(RemoteEntity), 'tenantId').query(access, 'r');
    const [rows, withoutCoordinates] = await Promise.all([
      remotes()
        .andWhere('r.latitude IS NOT NULL')
        .innerJoin('Tenant', 'tn', 'tn.id = r.tenantId')
        .leftJoin('Ticket', 't', 't.remoteId = r.id AND t.closedAt IS NULL')
        .select('r.id', 'id')
        .addSelect('r.site_id', 'siteId')
        .addSelect('r.name', 'name')
        .addSelect('r.city', 'city')
        .addSelect('r.status', 'status')
        .addSelect('r.latitude', 'lat')
        .addSelect('r.longitude', 'lng')
        .addSelect('r.tenant_id', 'tenantId')
        .addSelect('tn.name', 'tenant')
        .addSelect('COUNT(t.id)', 'active')
        .addSelect(`COUNT(t.id) FILTER (WHERE t.status = 'pending')`, 'pending')
        .groupBy('r.id')
        .addGroupBy('tn.name')
        .orderBy('r.site_id', 'ASC')
        .getRawMany<{
          id: string;
          siteId: string;
          name: string;
          city: string;
          status: RemoteStatus;
          lat: string;
          lng: string;
          tenantId: string;
          tenant: string;
          active: string;
          pending: string;
        }>(),
      remotes().andWhere('r.latitude IS NULL').getCount(),
    ]);
    return {
      tiles: { url: this.config.mapTileUrl, attribution: this.config.mapTileAttribution },
      remotes: rows.map(
        (r): MapRemote => ({
          id: r.id,
          siteId: r.siteId,
          name: r.name,
          city: r.city,
          tenantId: r.tenantId,
          tenant: r.tenant,
          lat: Number(r.lat),
          lng: Number(r.lng),
          state: mapState(r.status, Number(r.active), Number(r.pending)),
          activeTickets: Number(r.active),
        }),
      ),
      withoutCoordinates,
    };
  }
}
