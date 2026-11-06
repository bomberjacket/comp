import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequirementAnswersController } from './requirement-answers.controller';
import { RequirementAnswersService } from './requirement-answers.service';

@Module({
  imports: [AuthModule],
  controllers: [RequirementAnswersController],
  providers: [RequirementAnswersService],
  exports: [RequirementAnswersService],
})
export class RequirementAnswersModule {}
