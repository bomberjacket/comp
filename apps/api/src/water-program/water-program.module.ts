import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequirementAnswersModule } from '../requirement-answers/requirement-answers.module';
import { WaterProgramController } from './water-program.controller';
import { WaterProgramService } from './water-program.service';

@Module({
  imports: [AuthModule, RequirementAnswersModule],
  controllers: [WaterProgramController],
  providers: [WaterProgramService],
})
export class WaterProgramModule {}
