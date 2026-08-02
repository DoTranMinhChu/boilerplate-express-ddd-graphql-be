import { MoreThan } from 'typeorm';

import { IAdminRepository } from '../../domain/repositories/admin.interface.repository';
import { AppDataSource } from '@/config/database.config';
import { AdminEntity } from '../../domain/entities/admin.entity';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';

export class AdminRepository extends ABaseRepository<AdminEntity> implements IAdminRepository {
    constructor() {
        super(AppDataSource.getRepository(AdminEntity));
    }

    async findByEmail(email: string): Promise<AdminEntity | null> {
        return await this.repository.findOne({
            where: { email }
        });
    }

    async findByEmailWithPassword(email: string): Promise<AdminEntity | null> {
        return await this.repository
            .createQueryBuilder('admin')
            .where('admin.email = :email', { email })
            .addSelect('admin.password')
            .getOne();
    }

    async updateLastLogin(id: string): Promise<void> {
        await this.repository.update(id, {
            lastLoginAt: new Date()
        });
    }

    async findByResetToken(hashedToken: string): Promise<AdminEntity | null> {
        return this.repository.findOne({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: MoreThan(new Date()),
            } as any,
        });
    }
}