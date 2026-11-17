import { Controller, Get } from '@nestjs/common';
import type { MasterListResponse } from '@tyio/shared';
import { NoTenantData } from '../../common/tenant/tenant-policy.js';
import { MasterService } from './master.service.js';

/**
 * Pilihan master yang aktif untuk form dan saringan, bagi semua peran. Customer tidak di
 * sini: daftarnya dibatasi per pengguna lewat GET /api/tenants.
 */
@NoTenantData('Master global (kategori, system, jarkom), sama untuk semua customer.')
@Controller('master')
export class MasterOptionsController {
  constructor(private readonly master: MasterService) {}

  @Get('kategori')
  async kategori(): Promise<MasterListResponse> {
    return { items: await this.master.listActive('kategori') };
  }

  @Get('system')
  async system(): Promise<MasterListResponse> {
    return { items: await this.master.listActive('system') };
  }

  @Get('jarkom')
  async jarkom(): Promise<MasterListResponse> {
    return { items: await this.master.listActive('jarkom') };
  }
}
