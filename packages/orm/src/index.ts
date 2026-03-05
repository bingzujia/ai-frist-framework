/**
 * @ai-first/orm
 * 
 * ORM framework with MyBatis-Plus compatible decorators
 */

// Config
export {
  setDatabaseConfig,
  getDatabaseConfig,
  createAdapterFromEntity,
  type DatabaseConfig,
} from './config.js';

// Decorators
export {
  Entity,
  TableName,
  TableId,
  TableField,
  Column,
  Mapper,
  type EntityOptions,
  type TableIdOptions,
  type TableFieldOptions,
  type MapperOptions,
  getEntityMetadata,
  getTableIdMetadata,
  getTableFieldMetadata,
  getMapperMetadata,
  ENTITY_METADATA,
  TABLE_ID_METADATA,
  TABLE_FIELD_METADATA,
  MAPPER_METADATA,
} from './decorators.js';

// BaseMapper
export {
  BaseMapper,
  type IMapperAdapter,
  type PageParams,
  type PageResult,
  type QueryCondition,
  type OrderBy,
} from './base-mapper.js';

// QueryWrapper (MyBatis-Plus 风格)
export {
  QueryWrapper,
  LambdaQueryWrapper,
  type Condition,
  type OrderByClause,
  type CompareOperator,
} from './wrapper.js';

// Adapters
export { KyselyAdapter, type KyselyAdapterOptions, InMemoryAdapter } from './adapters/index.js';

// Database Factory (多数据库支持)
export {
  createKyselyDatabase,
  getKyselyDatabase,
  getKyselyDatabaseConfig,
  closeKyselyDatabase,
  isDatabaseInitialized,
  type DatabaseType,
  type DatabaseConnectionConfig,
  type PostgresConnectionConfig,
  type SqliteConnectionConfig,
  type MysqlConnectionConfig,
} from './database.js';
