import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse, HealthState } from '@tyio/shared';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Mengembalikan laporan bila sehat; melempar 503 dengan laporan yang sama bila tidak. */
  async check(): Promise<HealthResponse> {
    const database = await this.pingDatabase();
    const report: HealthResponse = { status: database, database };
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  private async pingDatabase(): Promise<HealthState> {
    try {
      // SQL mentah disengaja: ini hanya uji sambungan, tidak menyentuh entity mana pun.
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch (error) {
      // Rinciannya hanya di log server; jawaban HTTP tetap generik.
      this.logger.warn(`Database tidak bisa dihubungi: ${(error as Error).message}`);
      return 'error';
    }
  }
}
