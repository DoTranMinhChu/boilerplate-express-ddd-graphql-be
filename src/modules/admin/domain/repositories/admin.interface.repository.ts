
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { AdminEntity } from '../entities/admin.entity';


export interface IAdminRepository extends ABaseRepository<AdminEntity> {
    findByEmail(email: string): Promise<AdminEntity | null>;
    findByEmailWithPassword(email: string): Promise<AdminEntity | null>;
    updateLastLogin(id: string): Promise<void>;
    findByResetToken(hashedToken: string): Promise<AdminEntity | null>;
}