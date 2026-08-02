#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ============ HELPER FUNCTIONS ============

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelCase(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function createDirectory(dirPath, { dryRun = false } = {}) {
  if (!fs.existsSync(dirPath)) {
    if (dryRun) {
      console.log(`📝 [dry-run] Would create directory: ${dirPath}`);
      return;
    }
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  }
}

function writeFile(filePath, content, { force = false, dryRun = false } = {}) {
  if (dryRun) {
    console.log(`📝 [dry-run] Would create file: ${filePath}`);
    return;
  }
  if (fs.existsSync(filePath) && !force) {
    console.warn(`⚠️  Skipped (already exists): ${filePath} — pass --force to overwrite`);
    return;
  }
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created file: ${filePath}`);
}

function parseFields(fieldsStr) {
  if (!fieldsStr) return [];
  return fieldsStr.split(',').map(field => {
    const [name, type] = field.split(':');
    return { name: name.trim(), type: type.trim() };
  });
}

// ============ TEMPLATES ============

function generateEntityTemplate(moduleName, fields) {
  const className = capitalize(moduleName);
  let fieldDefinitions = fields.map(f => {
    return `    @Field()\n    @Column({ nullable: true })\n    ${f.name}!: ${f.type};`;
  }).join('\n\n') || `    @Field()\n    @Column({ nullable: true })\n    name!: string;`;

  return `import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

@ObjectType('${className}')
@Entity('${moduleName}')
export class ${className}Entity extends BaseEntity {
${fieldDefinitions}
}
`;
}

function generateDtoTemplate(moduleName, fields) {
  const className = capitalize(moduleName);
  const fieldList = fields.length > 0 ? fields : [{ name: 'name', type: 'string' }];

  const createFields = fieldList.map(f => `    @Field()\n    ${f.name}!: ${f.type};`).join('\n\n');
  const updateFields = fieldList.map(f => `    @Field()\n    ${f.name}?: ${f.type};`).join('\n\n');

  return `import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
@InputType('Create${className}Input')
export class Create${className}Input {
${createFields}
}
@InputType('Update${className}Input')
export class Update${className}Input {
${updateFields}
}
`;
}

function generateInterfaceRepoTemplate(moduleName) {
  const className = capitalize(moduleName);
  const camelName = camelCase(moduleName);
  return `import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { ${className}Entity } from '../entities/${camelName}.entity';

export interface I${className}Repository extends ABaseRepository<${className}Entity> {
}
`;
}

function generateRepositoryTemplate(moduleName) {
  const className = capitalize(moduleName);
  const camelName = camelCase(moduleName);
  return `import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { ${className}Entity } from "../../domain/entities/${camelName}.entity";
import { I${className}Repository } from "../../domain/repositories/${camelName}.interface.repository";

export class ${className}Repository extends ABaseRepository<${className}Entity> implements I${className}Repository {
    constructor() {
        super(AppDataSource.getRepository(${className}Entity));
    }
}
`;
}

function generateServiceTemplate(moduleName) {
  const className = capitalize(moduleName);
  const camelName = camelCase(moduleName);
  return `import { BaseService } from '@/core/application/services/base.service';
import { ${className}Entity } from '../../domain/entities/${camelName}.entity';
import { ${className}Repository } from '../../infrastructure/persistence/${camelName}.repository';

export class ${className}Service extends BaseService<${className}Entity> {
    constructor(private readonly ${camelName}Repository = new ${className}Repository()) {
        super(${camelName}Repository, '${className}');
    }
}
`;
}

function generateRestControllerTemplate(moduleName) {
  const className = capitalize(moduleName);
  const camelName = camelCase(moduleName);
  return `import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { ${className}Service } from '@/modules/${camelName}/application/services/${camelName}.service';
import { ${className}Entity } from '@/modules/${camelName}/domain/entities/${camelName}.entity';
import { Create${className}Input, Update${className}Input } from '@/modules/${camelName}/application/dto/${camelName}.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
// TODO: import your project's role enum here if you gate these routes by role,
// e.g. import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/${moduleName}')
export class ${className}RestController extends BaseRestController<${className}Entity> {

    constructor(private ${camelName}Service = new ${className}Service()) {
        const service = ${camelName}Service;
        super(service);
        this.${camelName}Service = service;
    }

    @Post()
    @Authorized([/* TODO: roles allowed to create, e.g. ERole.ADMIN */])
    async create(@Body() data: Create${className}Input, @CurrentUser() account: IAccount) {
        return await this.${camelName}Service.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.${camelName}Service.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<${className}Entity> = { where: { id } };
        return await this.${camelName}Service.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([/* TODO: roles allowed to update, e.g. ERole.ADMIN */])
    async update(@Param('id') id: string, @Body() data: Update${className}Input) {
        const options: FindOneOptions<${className}Entity> = { where: { id } };
        return await this.${camelName}Service.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([/* TODO: roles allowed to delete, e.g. ERole.ADMIN */])
    async delete(@Param('id') id: string) {
        const options: FindOneOptions<${className}Entity> = { where: { id } };
        return await this.${camelName}Service.softDeleteByCondition(options);
    }
}

export default ${className}RestController;
`;
}

function generateResolverTemplate(moduleName) {
  const className = capitalize(moduleName);
  const camelName = camelCase(moduleName);

  return `import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLQuery, GQLCurrentUser, Resolver, Mutation, Query } from "@/core/shared/decorators/graphQL.decorators";
import { PaginatedResponse, GQLPaginationArgs } from "@/core/shared/dto/pagination.dto";
// TODO: import your project's role enum here if you gate these mutations by role,
// e.g. import { ERole } from "@/core/shared/enums/account.enum";
import { IAccount } from "@/core/shared/types/common.types";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { Create${className}Input, Update${className}Input } from "@/modules/${camelName}/application/dto/${camelName}.dto";
import { ${className}Service } from "@/modules/${camelName}/application/services/${camelName}.service";
import { ${className}Entity } from "@/modules/${camelName}/domain/entities/${camelName}.entity";
import { FindOneOptions } from "typeorm";

const ${className}Pagination = PaginatedResponse(${className}Entity);

@Resolver(${className}Entity)
export class ${className}Resolver extends BaseGraphQLResolver<${className}Entity> {
  private ${camelName}Service: ${className}Service;

  constructor() {
    const service = new ${className}Service();
    super(service, '${className}');
    this.${camelName}Service = service;
  }

  @Query('getOne${className}', { returnType: ${className}Entity })
  @GQLAuthorized()
  async getOne${className}(
    @Args('id') id: string,
    @GQLQuery() fieldOptions: GqlSelectOptions<${className}Entity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<${className}Entity> = { where: { id }, ...fieldOptions };
    return this.${camelName}Service.findOneByCondition(options);
  }

  @Query('getAll${className}', { returnType: ${className}Pagination })
  @GQLAuthorized()
  async getAll${className}(
    @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
    @GQLQuery() fieldOptions: GqlSelectOptions<${className}Entity>,
  ) {
    return this.${camelName}Service.findAllPagination(input, fieldOptions);
  }

  @Mutation('create${className}', { returnType: ${className}Entity })
  @GQLAuthorized([/* TODO: roles allowed to create, e.g. ERole.ADMIN */])
  async create${className}(
    @Args('data', { type: Create${className}Input }) data: Create${className}Input,
    @GQLQuery() fieldOptions: GqlSelectOptions<${className}Entity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    return this.${camelName}Service.create(data, fieldOptions);
  }

  @Mutation('update${className}', { returnType: ${className}Entity })
  @GQLAuthorized([/* TODO: roles allowed to update, e.g. ERole.ADMIN */])
  async update${className}(
    @Args('id') id: string,
    @Args('data', { type: Update${className}Input }) data: Update${className}Input,
    @GQLQuery() fieldOptions: GqlSelectOptions<${className}Entity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<${className}Entity> = { where: { id }, ...fieldOptions };
    return this.${camelName}Service.updateByCondition(options, data);
  }

  @Mutation('delete${className}', { returnType: Object })
  @GQLAuthorized([/* TODO: roles allowed to delete, e.g. ERole.ADMIN */])
  async delete${className}(
    @Args('id') id: string,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<${className}Entity> = { where: { id } };
    return this.${camelName}Service.softDeleteByCondition(options);
  }
}

export default ${className}Resolver;
`;
}

// ============ MAIN ============

const args = process.argv.slice(2);
const moduleName = args.find(a => !a.startsWith('--'));
let fields = [];
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

args.forEach(arg => {
  if (arg.startsWith('--fields=')) {
    fields = parseFields(arg.split('=')[1]);
  }
});

if (!moduleName) {
  console.log("Usage: node scripts/generateModule.js <name> --fields=name:string,age:number [--force] [--dry-run]");
  process.exit(1);
}

const basePath = path.join(process.cwd(), 'src', 'modules', moduleName);
const camelName = camelCase(moduleName);

const structure = [
  { dir: 'domain/entities', file: `${camelName}.entity.ts`, template: generateEntityTemplate },
  { dir: 'domain/repositories', file: `${camelName}.interface.repository.ts`, template: generateInterfaceRepoTemplate },
  { dir: 'application/dto', file: `${camelName}.dto.ts`, template: generateDtoTemplate },
  { dir: 'application/services', file: `${camelName}.service.ts`, template: generateServiceTemplate },
  { dir: 'infrastructure/persistence', file: `${camelName}.repository.ts`, template: generateRepositoryTemplate },
  { dir: 'infrastructure/http/controllers', file: `${camelName}.controller.ts`, template: generateRestControllerTemplate },
  { dir: 'infrastructure/http/graphql', file: `${camelName}.resolver.ts`, template: generateResolverTemplate },
];

structure.forEach(s => {
  const dirPath = path.join(basePath, s.dir);
  createDirectory(dirPath, { dryRun });
  writeFile(path.join(dirPath, s.file), s.template(moduleName, fields), { force, dryRun });
});

console.log(`\n🚀 Module [${moduleName}] generated successfully with full CRUD (REST & GQL)!`);