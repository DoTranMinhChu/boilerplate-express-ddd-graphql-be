import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// Singleton row (service always reads/writes the first record — see
// SiteSettingsService) backing the public site's shared chrome: header nav +
// footer, rendered by every page via CmsPageShell.astro. Not part of the
// per-page Section model — there is exactly one of these for the whole site.
//
//   navLinks: [{ label, href }]
//   footerColumns: [{ title, lines: string[] }]
@ObjectType('SiteSettings')
@Entity('site_settings')
export class SiteSettingsEntity extends BaseEntity {
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    logoText?: string;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    navLinks?: { label: string; href: string }[];

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    hotlineLabel?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    hotline?: string;

    @Field({ type: String, nullable: true })
    @Column({ type: 'text', nullable: true })
    footerHeading?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    footerEmail?: string;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    footerColumns?: { title: string; lines: string[] }[];

    @Field({ type: String, nullable: true })
    @Column({ type: 'text', nullable: true })
    footerOutlineText?: string;
}
