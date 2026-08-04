import { HttpStatus } from '@nestjs/common';

export function getHttpStatusName(status: number | string): string {
  if (typeof status === 'number') {
    return HttpStatus[status] || 'UNKNOWN_STATUS';
  }
  const numeric = Number(status);
  if (!isNaN(numeric) && HttpStatus[numeric]) {
    return HttpStatus[numeric];
  }
  return status;
}
