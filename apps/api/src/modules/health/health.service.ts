import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';

@Injectable()
export class HealthService {
  // Pemeriksaan database ditambahkan saat database masuk (langkah 0.2/0.3).
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
