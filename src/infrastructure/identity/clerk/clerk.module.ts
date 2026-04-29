import { Module } from '@nestjs/common';
import { ClerkAdapter } from './clerk.adapter';

@Module({
  providers: [ClerkAdapter],
  exports: [ClerkAdapter],
})
export class ClerkModule {}
