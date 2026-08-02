import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostgisExtension1767244070735 implements MigrationInterface {
  name = 'EnablePostgisExtension1767244070735';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Kiểm tra xem extension 'postgis' đã tồn tại chưa
    const exists: Array<{ exists: boolean }> = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'postgis'
      );
    `);

    if (!exists[0]?.exists) {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
      console.log('✅ Created postgis extension');
    } else {
      console.log('ℹ️ postgis extension already exists');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lưu ý: DROP EXTENSION có thể ảnh hưởng đến các object phụ thuộc.
    // Nếu bạn không muốn migration down xoá extension, thay dòng dưới bằng comment hoặc để trống.
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
    console.log('🗑️ Dropped postgis extension (if it existed)');
  }
}