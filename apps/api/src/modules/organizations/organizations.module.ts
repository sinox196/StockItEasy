import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoDataService } from './demo-data.service';
import { InvitationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService, DemoDataService],
  exports: [OrganizationsService, DemoDataService],
})
export class OrganizationsModule {}
