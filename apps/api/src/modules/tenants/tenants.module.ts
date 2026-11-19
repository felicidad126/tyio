import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
