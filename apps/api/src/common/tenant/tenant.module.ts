import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TenantPolicyCheck } from './tenant-policy.check.js';

@Module({
  imports: [DiscoveryModule],
  providers: [TenantPolicyCheck],
})
export class TenantModule {}
