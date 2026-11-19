import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), TenantsModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
