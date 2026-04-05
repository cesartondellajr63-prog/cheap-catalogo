import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleSheetsService } from './google-sheets.service';

@Module({
  imports: [ConfigModule],
  providers: [GoogleSheetsService],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
