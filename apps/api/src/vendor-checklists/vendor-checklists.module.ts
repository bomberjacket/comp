import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorChecklistsController } from './vendor-checklists.controller';
import { VendorChecklistsService } from './vendor-checklists.service';

@Module({
  imports: [AuthModule],
  controllers: [VendorChecklistsController],
  providers: [VendorChecklistsService],
  exports: [VendorChecklistsService],
})
export class VendorChecklistsModule {}
