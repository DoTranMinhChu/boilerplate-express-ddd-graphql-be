import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, BaseEntity as TypeORMBaseEntity, PrimaryColumn, BeforeInsert } from 'typeorm';
import { Field } from '@/core/shared/decorators/graphQL.decorators';
import { uuidv7 } from 'uuidv7';

export abstract class BaseEntity extends TypeORMBaseEntity {
    @Field({ type: String }) // Đánh dấu để GraphQL nhận diện
    @PrimaryColumn('uuid')
    id!: string;

    @BeforeInsert()
    protected generateId(): void {
        if (!this.id) {
            this.id = uuidv7();
        }
    }

    @Field({ type: Date }) // Trả về string (ISO Date)
    @CreateDateColumn({})
    createdAt!: Date;

    @Field({ type: Date })
    @UpdateDateColumn({})
    updatedAt!: Date;

    @Field({ type: Date })
    @DeleteDateColumn({ nullable: true, })
    deletedAt?: Date;
}