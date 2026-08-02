import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHelperFunction1767244162025 implements MigrationInterface {
  name = 'AddHelperFunction1767244162025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Function để normalize Vietnamese text
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION normalize_vietnamese_text(text_input TEXT)
      RETURNS TEXT AS $$
      BEGIN
        RETURN lower(
          regexp_replace(
            regexp_replace(
              text_input,
              '[áàảãạăắằẳẵặâấầẩẫậ]', 'a', 'gi'
            ),
            '[éèẻẽẹêếềểễệ]', 'e', 'gi'
          )
        );
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
    console.log('✅ Created normalize_vietnamese_text function');

    // Trigger để auto-update contentNormalized
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_content_normalized()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.content_normalized := normalize_vietnamese_text(NEW.content);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);


    console.log('✅ Created content normalization trigger');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_content_normalized();
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS normalize_vietnamese_text(TEXT);
    `);
  }

}
