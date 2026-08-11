import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// KHÔNG có status/locale (khác ContentEntry) — 1 submission độc lập, không publish/dịch workflow.
@ObjectType('FormSubmission')
@Entity('form_submission')
export class FormSubmissionEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    formId!: string;

    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    data!: Record<string, any>;
}
