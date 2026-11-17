import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  type Type,
} from '@nestjs/common';
import type { MasterItemResponse, MasterList, MasterListResponse } from '@tyio/shared';
import type { Actor } from '../../common/audit/actor.js';
import { AllTenants } from '../../common/tenant/tenant-policy.js';
import { CurrentActor, RequireModule } from '../auth/auth.decorators.js';
import { parseCreate, parseUpdate } from './master-input.js';
import { MasterService } from './master.service.js';

/**
 * Controller untuk satu daftar master di `/api/admin/master/<daftar>`. Satu kelas per daftar
 * (bukan parameter `:daftar`) agar setiap rute terdaftar dengan alamat nyata, sehingga uji
 * akses dan uji lintas-tenant menelusurinya satu per satu.
 */
export function masterController(list: MasterList): Type<unknown> {
  @RequireModule('admin')
  @AllTenants('Master data berlaku untuk semua customer, jadi hanya dikelola admin dengan akses semua customer.')
  @Controller(`admin/master/${list}`)
  class MasterController {
    constructor(@Inject(MasterService) private readonly master: MasterService) {}

    @Get()
    async list(): Promise<MasterListResponse> {
      return { items: await this.master.list(list) };
    }

    @Post()
    async create(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<MasterItemResponse> {
      return { item: await this.master.create(list, parseCreate(body), actor) };
    }

    @Patch(':id')
    async update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() body: unknown,
      @CurrentActor() actor: Actor,
    ): Promise<MasterItemResponse> {
      return { item: await this.master.update(list, id, parseUpdate(body), actor) };
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor): Promise<void> {
      await this.master.remove(list, id, actor);
    }
  }

  const name = `Master${list[0]?.toUpperCase()}${list.slice(1)}Controller`;
  Object.defineProperty(MasterController, 'name', { value: name });
  return MasterController;
}
