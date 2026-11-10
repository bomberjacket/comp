import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PoliciesModule } from '../policies/policies.module';
import { RequirementAnswersModule } from '../requirement-answers/requirement-answers.module';
import { WaterEvidenceService } from './water-evidence.service';
import { WaterPlansService } from './water-plans.service';
import { WaterProgramController } from './water-program.controller';
import { WaterProgramService } from './water-program.service';
import { WaterReportService } from './water-report.service';
import { WaterTabletopService } from './water-tabletop.service';

@Module({
  imports: [AuthModule, RequirementAnswersModule, PoliciesModule],
  controllers: [WaterProgramController],
  providers: [WaterProgramService, WaterPlansService, WaterEvidenceService, WaterTabletopService, WaterReportService],
})
export class WaterProgramModule {}
