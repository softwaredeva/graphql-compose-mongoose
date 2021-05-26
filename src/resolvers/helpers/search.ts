/* eslint-disable no-use-before-define */

import {
  InputTypeComposer,
  ObjectTypeComposer,
  ObjectTypeComposerArgumentConfigMap,
} from 'graphql-compose';
import type { Model, Document } from 'mongoose';
import { isObject, toMongoFilterDottedObject, getIndexedFieldNamesForGraphQL } from '../../utils';
import type { ExtendedResolveParams } from '../index';
// import {
//   FieldsOperatorsConfig,
//   addSearchOperators,
//   processSearchOperators,
// } from './searchOperators';
import type { NestedAliasesMap } from './aliases';
import { makeFieldsRecursiveNullable } from '../../utils/makeFieldsRecursiveNullable';
import { mongoose } from '../../__mocks__/mongooseCommon';

export type SearchHelperArgsOpts = {
  /**
   * Add to search arg only that fields which are indexed.
   * If false then all fields will be available for searching.
   * By default: true
   */
  onlyIndexed?: boolean;
  /**
   * You an remove some fields from type via this option.
   */
  removeFields?: string | string[];
  /**
   * This option makes provided fieldNames as required
   */
  requiredFields?: string | string[];
  // /**
  //  * Customize operators searching or disable it at all.
  //  * By default will be provided all operators only for indexed fields.
  //  */
  // operators?: FieldsOperatorsConfig | false;
  /**
   * Make arg `search` as required if this option is true.
   */
  isRequired?: boolean;
  /**
   * Base type name for generated search argument.
   */
  baseTypeName?: string;
  /**
   * Provide custom prefix for Type name
   */
  prefix?: string;
  /**
   * Provide custom suffix for Type name
   */
  suffix?: string;
};

// for merging, discriminators merge-able only
export const getSearchHelperArgOptsMap = (): Record<string, string | string[]> => ({
  // searchTypeName? : 'string'
  isRequired: 'boolean',
  onlyIndexed: 'boolean',
  requiredFields: ['string', 'string[]'],
  // operators: ['SearchOperatorsOptsMap', 'boolean'],
  removeFields: ['string', 'string[]'],
});

export function searchHelperArgs<TDoc extends Document = any>(
  typeComposer: ObjectTypeComposer<TDoc, any>,
  model: Model<TDoc>,
  opts?: SearchHelperArgsOpts
): ObjectTypeComposerArgumentConfigMap<{ search: any }> {
  console.log('searchHelperArgs', opts);
  if (!(typeComposer instanceof ObjectTypeComposer)) {
    throw new Error('First arg for searchHelperArgs() should be instance of ObjectTypeComposer.');
  }

  if (!model || !model.modelName || !model.schema) {
    throw new Error('Second arg for searchHelperArgs() should be instance of MongooseModel.');
  }

  if (!opts) {
    throw new Error('You should provide non-empty options.');
  }

  const removeFields = [];
  if (opts.removeFields) {
    if (Array.isArray(opts.removeFields)) {
      removeFields.push(...opts.removeFields);
    } else {
      removeFields.push(opts.removeFields);
    }
  }

  if (opts.onlyIndexed) {
    const indexedFieldNames = getIndexedFieldNamesForGraphQL(model);
    Object.keys(typeComposer.getFields()).forEach((fieldName) => {
      if (indexedFieldNames.indexOf(fieldName) === -1) {
        removeFields.push(fieldName);
      }
    });
  }

  const { prefix, suffix } = opts;
  const searchTypeName: string = `${prefix}${typeComposer.getTypeName()}${suffix}`;
  const itc = typeComposer.getInputTypeComposer().clone(searchTypeName);

  makeFieldsRecursiveNullable(itc, { prefix, suffix });

  itc.removeField(removeFields);

  function filterSearchFields(itc: InputTypeComposer): void {
    const fields = typeComposer.getFields();
    Object.keys(fields).forEach((fieldName) => {
      if (!fields[fieldName].type.getTypeName().match('String')) {
        itc.removeField(fieldName);
      }
    });
  }
  filterSearchFields(itc);

  if (opts.requiredFields) {
    itc.makeFieldNonNull(opts.requiredFields);
  }

  if (itc.getFieldNames().length === 0) {
    return {} as any;
  }

  if (!opts.baseTypeName) {
    opts.baseTypeName = typeComposer.getTypeName();
  }
  // addSearchOperators(itc, model, opts);

  return {
    search: {
      type: opts.isRequired ? itc.NonNull : itc,
      description: opts.onlyIndexed ? 'Search only by indexed fields' : 'Search by fields',
    },
  };
}

export function searchHelper(
  resolveParams: ExtendedResolveParams,
  aliases?: NestedAliasesMap
): void {
  const search = resolveParams.args?.search;
  console.log('searchHelper search', search);
  if (search && typeof search === 'object' && Object.keys(search).length > 0) {
    const schemaFields = (resolveParams.query as any)?.schema?.paths;

    const { _ids, ...searchFields } = search;
    console.log('searchHelper _ids', _ids);
    console.log('searchHelper searchFields', searchFields);
    if (_ids && Array.isArray(_ids)) {
      resolveParams.query = resolveParams.query.where({ _id: { $in: _ids } });
    }
    // processSearchOperators(searchFields);
    const mongooseSearch = convertSearchFields(searchFields, schemaFields, aliases);
    console.log('searchHelper mongooseSearch', mongooseSearch);
    if (Object.keys(mongooseSearch).length > 0) {
      resolveParams.query = resolveParams.query.where(mongooseSearch);
    }
  }

  if (isObject(resolveParams.rawQuery)) {
    resolveParams.query = resolveParams.query.where(resolveParams.rawQuery);
  }
}

function convertSearchFields(
  searchFields: Record<string, any>,
  schemaFields: { [key: string]: mongoose.SchemaType },
  aliases?: NestedAliasesMap
) {
  const clearedSearch: Record<string, any> = {};
  Object.keys(searchFields).forEach((key) => {
    const value = searchFields[key];
    if (key.startsWith('$')) {
      clearedSearch[key] = Array.isArray(value)
        ? value.map((v) => toMongoFilterDottedObject(v, aliases))
        : toMongoFilterDottedObject(value, aliases);
    } else if (
      schemaFields[key] ||
      aliases?.[key] ||
      isNestedSearchField(key, value, schemaFields)
    ) {
      const alias = aliases?.[key];
      let newKey;
      let subAlias: NestedAliasesMap | undefined;
      if (typeof alias === 'string') {
        newKey = alias;
      } else if (isObject(alias)) {
        subAlias = alias;
        newKey = alias?.__selfAlias;
      } else {
        newKey = key;
      }
      toMongoFilterDottedObject(new RegExp(`.*${value}.*`, 'i'), subAlias, clearedSearch, newKey);
    }
  });

  return clearedSearch;
}

function isNestedSearchField(
  key: string,
  value: any,
  schemaFields: { [key: string]: mongoose.SchemaType }
): boolean {
  if (!isObject(value)) return false;

  return Object.keys(schemaFields).some((dottedPath) => dottedPath.startsWith(`${key}.`));
}
